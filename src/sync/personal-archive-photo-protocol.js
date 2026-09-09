import { personalArchivePhotoPlan, personalArchivePayloadWithPhotos } from "./personal-archive-photo-plan.js";
import { personalArchiveJson, personalArchiveHash } from "./personal-archive-import-protocol.js";

export const PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED = false;
export const PERSONAL_ARCHIVE_PHOTO_IMPORT_CAPABILITY = "personalCausalArchivePhotoImportV1";
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype && same(Object.keys(value).sort(), [...keys].sort());
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const fail = () => { throw Object.assign(Error("Полный архив и сохранённый состав файлов не совпадают. Импорт остановлен."), { code: "archive-photo-body" }); };

export function personalArchivePhotoManifest(value) {
  if (!exact(value, ["version", "mode", "sourcePayload", "sourceHash", "layoutTargets", "sourceActiveLayoutId", "editMeta", "targetStateRevision", "payloadHash", "files"])
    || value.version !== 2 || !["full", "replace", "copy"].includes(value.mode) || !hash(value.sourceHash) || !hash(value.payloadHash)
    || !Number.isSafeInteger(value.targetStateRevision) || value.targetStateRevision < 1 || !Array.isArray(value.layoutTargets)
    || !Array.isArray(value.files) || value.files.length > 50) fail();
  personalArchivePayloadWithPhotos(value.sourcePayload);
  return clone(value);
}

export function assertPersonalArchivePhotoBody(body, { base, listId, causal = false } = {}) {
  if (!exact(body, ["baseStateRevision", "payload", "archiveImport", ...(causal ? ["causal"] : [])])) fail();
  const manifest = personalArchivePhotoManifest(body.archiveImport);
  if (body.baseStateRevision !== manifest.targetStateRevision) fail();
  const plan = personalArchivePhotoPlan({ ...manifest, listId, currentPayload: base }, manifest.files);
  if (!same(plan.payload, body.payload)) fail();
  return plan;
}

export async function assertPersonalArchivePhotoHashes(body) {
  const manifest = personalArchivePhotoManifest(body?.archiveImport);
  if (await personalArchiveHash(manifest.sourcePayload) !== manifest.sourceHash || await personalArchiveHash(body.payload) !== manifest.payloadHash) fail();
}

export function personalArchivePhotoReceipt(manifest) {
  personalArchivePhotoManifest(manifest);
  const { sourcePayload, editMeta, ...receipt } = manifest;
  return clone(receipt);
}

export function validatePersonalArchivePhotoResult(result, expected) {
  try {
    const manifest = personalArchivePhotoManifest(expected.body.archiveImport), revision = manifest.targetStateRevision + 1;
    if (result?.ok !== true || result.list?.id !== expected.listId || result.list.stateRevision !== revision || result.stateRevision !== revision
      || !same(result.archiveImport, personalArchivePhotoReceipt(manifest)) || !Array.isArray(result.archivePhotos)
      || result.archivePhotos.length !== manifest.files.length) return false;
    const candidate = clone(expected.body.payload);
    for (const [index, file] of manifest.files.entries()) {
      const outcome = result.archivePhotos[index], photo = outcome?.photo, collection = file.entityType === "item" ? "items" : "containers";
      if (!exact(outcome, ["entityType", "entityId", "photoId", "assetId", "fileHash", "thumbHash", "photo"])
        || ["entityType", "entityId", "photoId", "assetId"].some(key => outcome[key] !== file[key])
        || outcome.fileHash !== file.file.hash || outcome.thumbHash !== (file.thumb?.hash || file.file.hash)
        || !exact(photo, ["id", "photoId", "assetId", "listId", "status", "url", "thumbUrl", "fileName", "type", "size", "width", "height"])
        || photo.id !== file.photoId || photo.photoId !== file.photoId || photo.assetId !== file.assetId || photo.listId !== expected.listId || photo.status !== "synced"
        || photo.fileName !== file.file.fileName || photo.type !== file.file.type || photo.size !== file.file.size
        || ["width", "height"].some(key => !Number.isFinite(photo[key]) || photo[key] < 0)
        || ["url", "thumbUrl"].some(key => typeof photo[key] !== "string" || !/^https?:\/\//.test(photo[key]))) return false;
      const owner = candidate[collection]?.[file.entityId], position = owner?.photos?.findIndex(value => value.id === file.photoId);
      if (!Number.isInteger(position) || position < 0) return false;
      if (!same(owner.photos[position], { id: file.photoId, photoId: file.photoId, assetId: file.assetId, listId: expected.listId, status: "pending" })) return false;
      owner.photos[position] = clone(photo);
    }
    return same(personalArchivePayloadWithPhotos(result.list.payload), candidate);
  } catch { return false; }
}
