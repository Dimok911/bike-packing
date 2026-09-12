import { canonicalTemplateJson } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";
import { adminTemplatePhotoCreateIntent, adminTemplatePhotoCreateStageManifest, adminTemplatePhotoCreateStageDigest } from "../sync/admin-template-photo-create-protocol.js";
import { adminTemplatePhotoCreateCandidate, encodeAdminTemplatePhotoCreateRecord, decodeAdminTemplatePhotoCreateRecord } from "../sync/admin-template-photo-create-record.js";

const clone = value => JSON.parse(canonicalTemplateJson(value));
const fail = () => { throw Object.assign(Error("Выбранная новая запись и полные файлы фотографий требуют сверки."),
  { code: "admin-template-photo-create-record", isAdminTemplateBlocked: true }); };
const hash = async blob => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, "0")).join("");

// Caller allocates the save, owner, stage and photo IDs once, before this call.
// Retrying preparation/capture never allocates a second identity. Snapshot is
// the exact selected namespace BEFORE creation, not a whole private snapshot.
export async function prepareAdminTemplatePhotoCreateRecord(input) {
  try {
    const { files, ...json } = input, frozen = clone(json);
    const selected = files?.map(file => ({ ...clone(Object.fromEntries(Object.entries(file).filter(([key]) => !["blob", "thumbBlob"].includes(key)))),
      blob: file.blob, thumbBlob: file.thumbBlob ?? null }));
    if (!Array.isArray(selected) || !selected.length || selected.length > 50 || Object.hasOwn(frozen.snapshot, "state")) fail();
    const binding = adminTemplatePhotoActionBinding(frozen.binding), { operationId, snapshot, fields, formContext, photos } = frozen;
    const { entityType, serverId } = snapshot.createdOwner, revision = snapshot.ownerMap.stateRevision;
    const assets = [], parts = []; let total = 0;
    for (const file of selected) {
      if (file.fullBlobVerified !== true || !(file.blob instanceof Blob) || file.blob.type !== file.type || file.blob.size !== file.size
        || file.blob.size <= 0 || file.blob.size > 10 * 1024 * 1024 || file.thumbBlob !== null && !(file.thumbBlob instanceof Blob)) fail();
      total += file.blob.size + (file.thumbBlob?.size || 0); if (total > 50 * 1024 * 1024) fail();
      const stage = adminTemplatePhotoCreateStageManifest({ version: 2, ...binding, operationId: file.stageOperationId, templateOperationId: operationId,
        baseStateRevision: revision, entityType, entityId: serverId, photoId: file.id,
        file: { hash: await hash(file.blob), size: file.blob.size, type: file.blob.type, fileName: file.fileName },
        thumb: file.thumbBlob ? { hash: await hash(file.thumbBlob), size: file.thumbBlob.size, type: file.thumbBlob.type } : null });
      assets.push({ assetId: stage.operationId, assetDigest: await adminTemplatePhotoCreateStageDigest(stage), entityType, entityId: serverId, photoId: file.id });
      parts.push({ stage, file: file.blob, thumb: file.thumbBlob });
    }
    const action = { operationId, kind: "template.save", listId: binding.listId, itemKey: binding.itemKey,
      body: { version: 1, base: { stateRevision: revision }, payload: clone(snapshot.sourcePayload), metadata: clone(snapshot.metadata),
        photoCreate: { version: 1, entityType, entityId: serverId, fields, formContext, assets } } };
    adminTemplatePhotoCreateIntent({ ...binding, ...action });
    const state = adminTemplatePhotoCreateCandidate({ binding, action, snapshot, photos, stages: parts.map(part => part.stage) });
    const encoded = await encodeAdminTemplatePhotoCreateRecord({ binding, action, snapshot: { ...snapshot, state }, files: parts });
    return await decodeAdminTemplatePhotoCreateRecord(encoded, binding, operationId);
  } catch { fail(); }
}
