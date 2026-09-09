import { personalGuestImportPlan, personalGuestBusinessPayload } from "./personal-guest-import-plan.js";
import { personalArchiveJson, personalArchiveHash } from "./personal-archive-import-protocol.js";

export const PERSONAL_GUEST_IMPORT_ENABLED = false;
export const PERSONAL_GUEST_IMPORT_CAPABILITY = "personalCausalGuestImportV1";
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const fail = () => { throw Object.assign(Error("Гостевой перенос не совпал с зафиксированным действием. Исходная работа сохранена."), { code: "guest-import-body" }); };

export function personalGuestImportManifest(value) {
  if (!exact(value, ["version", "operationId", "sourcePayload", "sourceHash", "layoutTargets", "ownerTargets", "photoTargets", "editMeta", "targetStateRevision", "payloadHash", "files"])
    || value.version !== 1 || !uuid(value.operationId) || !hash(value.sourceHash) || !hash(value.payloadHash)
    || !Number.isSafeInteger(value.targetStateRevision) || value.targetStateRevision < 1
    || !Array.isArray(value.layoutTargets) || !value.layoutTargets.length || value.layoutTargets.length > 50
    || !Array.isArray(value.ownerTargets) || !Array.isArray(value.photoTargets) || !Array.isArray(value.files)
    || value.files.length > 50 || value.photoTargets.length !== value.files.length) fail();
  return clone(value);
}

export function assertPersonalGuestImportBody(body, { base, listId, operationId, causal = false } = {}) {
  if (!exact(body, ["baseStateRevision", "payload", "guestImport", ...(causal ? ["causal"] : [])])) fail();
  const manifest = personalGuestImportManifest(body.guestImport);
  if (body.baseStateRevision !== manifest.targetStateRevision || operationId !== manifest.operationId) fail();
  const plan = personalGuestImportPlan({ ...manifest, listId, currentPayload: base }, manifest.files);
  if (!same(plan.payload, body.payload)) fail();
  return plan;
}

export async function assertPersonalGuestImportHashes(body) {
  const manifest = personalGuestImportManifest(body?.guestImport);
  if (await personalArchiveHash(manifest.sourcePayload) !== manifest.sourceHash || await personalArchiveHash(body.payload) !== manifest.payloadHash) fail();
}

export function personalGuestImportReceipt(value) {
  const { sourcePayload, editMeta, ...receipt } = personalGuestImportManifest(value);
  return receipt;
}

export function validatePersonalGuestImportResult(result, expected) {
  try { return validatePersonalImportedResult(result, expected, personalGuestImportManifest(expected.body.guestImport),
    { manifestKey: "guestImport", photosKey: "guestPhotos", receipt: personalGuestImportReceipt }); } catch { return false; }
}

export function validatePersonalImportedResult(result, expected, manifest, { manifestKey, photosKey, receipt }) {
  try {
    const revision = manifest.targetStateRevision + 1;
    if (manifest.operationId !== expected.operationId || result?.ok !== true || result.list?.id !== expected.listId
      || result.stateRevision !== revision || result.list.stateRevision !== revision || !same(result[manifestKey], receipt(manifest))
      || !Array.isArray(result[photosKey]) || result[photosKey].length !== manifest.files.length) return false;
    const candidate = clone(expected.body.payload);
    for (const [index, file] of manifest.files.entries()) {
      const outcome = result[photosKey][index], photo = outcome?.photo;
      if (!exact(outcome, ["entityType", "entityId", "photoId", "assetId", "fileHash", "thumbHash", "photo"])
        || ["entityType", "entityId", "photoId", "assetId"].some(key => outcome[key] !== file[key])
        || outcome.fileHash !== file.file.hash || outcome.thumbHash !== (file.thumb?.hash || file.file.hash)
        || !exact(photo, ["id", "photoId", "assetId", "listId", "status", "url", "thumbUrl", "fileName", "type", "size", "width", "height"])
        || photo.id !== file.photoId || photo.photoId !== file.photoId || photo.assetId !== file.assetId || photo.listId !== expected.listId || photo.status !== "synced"
        || photo.fileName !== file.file.fileName || photo.type !== file.file.type || photo.size !== file.file.size
        || ["width", "height"].some(key => !Number.isFinite(photo[key]) || photo[key] < 0)
        || ["url", "thumbUrl"].some(key => typeof photo[key] !== "string" || !/^https?:\/\//.test(photo[key]))) return false;
      const owner = candidate[file.entityType === "item" ? "items" : "containers"]?.[file.entityId], position = owner?.photos?.findIndex(photo => photo.id === file.photoId);
      if (!Number.isInteger(position) || position < 0 || !same(owner.photos[position], {
        id: file.photoId, photoId: file.photoId, assetId: file.assetId, listId: expected.listId, status: "pending"
      })) return false;
      owner.photos[position] = clone(photo);
    }
    return same(personalGuestBusinessPayload(result.list.payload), candidate);
  } catch { return false; }
}
