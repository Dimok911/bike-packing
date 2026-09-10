import { assertPersonalArchivePhotoRecord, assertPersonalArchivePhotoFile } from "./personal-archive-photo-outbox-record.js";
import { assertPersonalGuestImportRecord, assertPersonalGuestImportFile } from "./personal-guest-import-outbox-record.js";
import { assertPersonalPublicImportRecord, assertPersonalPublicImportFile } from "./personal-public-import-outbox-record.js";
import { assertPersonalServerImportRecord, assertPersonalServerImportFile } from "./personal-server-import-outbox-record.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertPersonalPhotoFormRecord, assertPersonalPhotoFormFile } from "./personal-photo-form-outbox-record.js";
import { personalPhotoPublicationManifest } from "./personal-photo-publication-protocol.js";
import { assertPersonalPhotoCopyBatchRecord } from "./personal-photo-copy-batch-protocol.js";

export const PERSONAL_PHOTO_OUTBOX_ENABLED = false;
export const PERSONAL_PHOTO_BATCH_OUTBOX_ENABLED = false;
const clone = value => JSON.parse(JSON.stringify(value));
const same = (left, right) => canonicalListOperationJson(left) === canonicalListOperationJson(right);
const fail = () => { throw Object.assign(new Error("Фотодействие не совпадает с сохранённой версией карточки. Данные сохранены, отправка остановлена."),
  { isPersonalSaveBlocked: true, code: "photo-record" }); };
export const personalRecordPayload = record => record?.photoState?.payload ?? record?.action.body.payload;

// A photo-only action may not smuggle in/drop another business edit. Its complete
// candidate is derived from the exact confirmed base and the frozen manifest.
export function assertPersonalPhotoCandidate({ body, basePayload, payload }) {
  const manifest = personalPhotoPublicationManifest(body), changes = body.action === "batch" ? body.changes : [body];
  if (!basePayload || !payload) fail();
  const candidate = clone(basePayload);
  for (const entry of manifest) {
    const change = changes[entry.index], collection = entry.entityType === "item" ? "items" : "containers";
    const owner = candidate[collection]?.[entry.entityId], desired = payload[collection]?.[entry.entityId];
    if (!owner || owner.id !== entry.entityId || !desired || desired.id !== entry.entityId
      || !same((owner.photos || []).map(photo => photo.id), change.expectedPhotoIds)) fail();
    const photos = owner.photos || [];
    if (["attach", "copy"].includes(entry.action)) {
      const photo = desired.photos?.find(value => value.id === entry.photoId);
      if (!photo || photo.assetId !== entry.assetId || photo.photoId !== entry.photoId || photo.status !== "pending") fail();
      owner.photos = [...photos]; owner.photos.splice(change.index, 0, clone(photo));
    } else owner.photos = entry.photoIds.map(id => photos.find(photo => photo.id === id));
  }
  if (!same(candidate, payload)) fail();
  return manifest;
}

export function assertPersonalPhotoRecord(record) {
  if (record?.action?.kind === "list.import" && Object.hasOwn(record.action.body || {}, "serverImport")) return assertPersonalServerImportRecord(record);
  if (record?.action?.kind === "list.import" && Object.hasOwn(record.action.body || {}, "publicImport")) return assertPersonalPublicImportRecord(record);
  if (record?.action?.kind === "list.import" && Object.hasOwn(record.action.body || {}, "guestImport")) return assertPersonalGuestImportRecord(record);
  if (record?.action?.kind === "list.import") return assertPersonalArchivePhotoRecord(record);
  if (record?.action?.body?.action === "copy-batch") return assertPersonalPhotoCopyBatchRecord(record).photos;
  if (record?.action?.body?.action === "form") return assertPersonalPhotoFormRecord(record).photos;
  const photo = record.photoState, action = record.action;
  if (action?.kind !== "photos.mutate" || photo?.version !== 1 || !record.mergeBase
    || record.mergeBase.stateRevision !== action.body.baseStateRevision
    || record.localReconciliation || record.reconciliation) fail();
  const manifest = assertPersonalPhotoCandidate({ body: action.body, basePayload: record.mergeBase.payload, payload: photo.payload });
  const attachments = manifest.filter(entry => entry.action === "attach");
  // A batch is bound to one complete version-two inventory, never to the first
  // file or several independently captured owner actions.
  if (attachments.length) {
    if (!/^[0-9a-f]{64}$/.test(photo.fileIntentHash || "") || attachments.length !== manifest.length) fail();
    if (action.body.action === "batch" ? photo.fileInventoryVersion !== 2 : photo.fileInventoryVersion !== undefined) fail();
  } else if (photo.fileIntentHash !== null || photo.fileInventoryVersion !== undefined) fail();
  const changes = action.body.action === "batch" ? action.body.changes : [action.body];
  if (changes.some(change => change.action === "copy" && change.source.listId !== action.listId)) fail();
  return manifest;
}

export function assertPersonalPhotoFile(record, saved, binding) {
  if (record?.action?.kind === "list.import" && Object.hasOwn(record.action.body || {}, "serverImport")) { assertPersonalServerImportFile(record, saved, binding); return; }
  if (record?.action?.kind === "list.import" && Object.hasOwn(record.action.body || {}, "publicImport")) { assertPersonalPublicImportFile(record, saved, binding); return; }
  if (record?.action?.kind === "list.import" && Object.hasOwn(record.action.body || {}, "guestImport")) { assertPersonalGuestImportFile(record, saved, binding); return; }
  if (record?.action?.kind === "list.import") { assertPersonalArchivePhotoFile(record, saved, binding); return; }
  if (record?.action?.body?.action === "form") { assertPersonalPhotoFormFile(record, saved, binding); return; }
  const manifest = assertPersonalPhotoRecord(record);
  if (!saved || saved.intentHash !== record.photoState.fileIntentHash
    || !same(saved.binding, binding) || !same(saved.action, record.action) || !same(saved.snapshot, record.snapshot)) fail();
  if (record.photoState.fileInventoryVersion === 2) {
    if (!Array.isArray(saved.files) || saved.files.length !== manifest.length || saved.files.some((part, index) => {
      const entry = manifest[index];
      return part?.stage?.operationId !== entry.assetId || part.stage.photoId !== entry.photoId
        || part.stage.entityId !== entry.entityId || part.stage.entityType !== entry.entityType
        || !(part.file instanceof Blob) || !part.file.size || part.file.size !== part.fileMetadata?.size
        || !/^[0-9a-f]{64}$/.test(part.fileMetadata?.hash || "");
    })) fail();
    return;
  }
  if (saved.files !== undefined
    || saved.stage.operationId !== record.action.body.assetId || saved.stage.photoId !== record.action.body.photoId
    || saved.stage.entityId !== record.action.body.entityId || saved.stage.entityType !== record.action.body.entityType
    || !(saved.file instanceof Blob) || !saved.file.size) fail();
}
