import { canonicalAccessJson as canonical, validAccessOperationId as uuid } from "./personal-access-protocol.js";

export const ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED = false;
export const TEMPLATE_PHOTO_APPEND_CAPABILITY = "adminTemplatePhotoAppendV1";
const environment = "bike-packing-experiment";
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim()
  && !/[\u0000-\u001f\u007f]/.test(value) && !["__proto__", "prototype", "constructor"].includes(value);
const entityId = value => text(value, 191) && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value);
const photoId = value => text(value, 191) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const revision = value => Number.isSafeInteger(value) && value > 0;
const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))), byte => byte.toString(16).padStart(2, "0")).join("");
const fail = () => { throw Object.assign(Error("Файловый пакет шаблона не совпадает с сохранённым действием."), { code: "admin-template-photo-append" }); };
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

function target(value) {
  if (!text(value.actorId, 36) || value.environment !== environment || !text(value.listId, 64) || !text(value.itemKey, 191)) fail();
  const demoPrefix = "public-demo-state-", sharedPrefix = "public-shared-layout-";
  const key = value.listId === "public-demo-state" ? "demo-state"
    : value.listId.startsWith(demoPrefix) && entityId(value.listId.slice(demoPrefix.length)) ? `demo-state:${value.listId.slice(demoPrefix.length)}`
      : value.listId.startsWith(sharedPrefix) && entityId(value.listId.slice(sharedPrefix.length)) ? `shared-layout:${value.listId.slice(sharedPrefix.length)}` : null;
  if (!key || key !== value.itemKey) fail();
}

function fileMetadata(value, full) {
  if (!exact(value, full ? ["hash", "size", "type", "fileName"] : ["hash", "size", "type"]) || !hash(value.hash)
    || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > 10 * 1024 * 1024
    || !["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(value.type)
    || full && !text(value.fileName, 255)) fail();
}

// Hash the ORIGINAL upload metadata. Stored bytes may differ after EXIF
// removal; their hashes and the database owner's identity belong to the receipt.
export function adminTemplatePhotoStageManifest(input) {
  if (!exact(input, ["version", "environment", "actorId", "operationId", "templateOperationId", "itemKey", "listId",
    "baseStateRevision", "entityType", "entityId", "photoId", "file", "thumb"]) || input.version !== 1
    || !uuid(input.operationId) || !uuid(input.templateOperationId) || input.operationId === input.templateOperationId
    || !revision(input.baseStateRevision) || !["item", "container"].includes(input.entityType)
    || !entityId(input.entityId) || !photoId(input.photoId)) fail();
  target(input); fileMetadata(input.file, true);
  if (input.thumb !== null) fileMetadata(input.thumb, false);
  return freeze(clone(input));
}

export async function adminTemplatePhotoStageDigest(input) {
  const manifest = adminTemplatePhotoStageManifest(input);
  return digest(manifest);
}

// This first package only appends to one existing owner. The immutable payload
// still carries every old raw reference; no stage callback rewrites that body.
// The ordinary template validator and server must additionally validate fields,
// administrator rights, confirmed private target and the exact source revision.
export function adminTemplatePhotoAppend(body, operationId) {
  const append = body?.photoAppend;
  if (!uuid(operationId) || body?.version !== 1 || !exact(body.base, ["stateRevision"]) || !revision(body.base.stateRevision)
    || Object.hasOwn(body, "source") || !exact(append, ["version", "assets"]) || append.version !== 1
    || !Array.isArray(append.assets) || !append.assets.length || append.assets.length > 50
    || !plain(body.payload?.items) || !plain(body.payload?.containers)) fail();
  canonical(body);
  const assets = new Set(), photos = new Set();
  let selectedOwner = null;
  for (const asset of append.assets) {
    if (!exact(asset, ["assetId", "assetDigest", "entityType", "entityId", "photoId"])
      || !uuid(asset.assetId) || asset.assetId === operationId || !hash(asset.assetDigest)
      || !["item", "container"].includes(asset.entityType) || !entityId(asset.entityId) || !photoId(asset.photoId)
      || assets.has(asset.assetId) || photos.has(asset.photoId)) fail();
    const ownerKey = canonical([asset.entityType, asset.entityId]);
    if (selectedOwner !== null && selectedOwner !== ownerKey) fail();
    selectedOwner = ownerKey; assets.add(asset.assetId); photos.add(asset.photoId);
    const collection = body.payload[asset.entityType === "item" ? "items" : "containers"];
    if (!Object.hasOwn(collection, asset.entityId) || collection[asset.entityId]?.id !== asset.entityId) fail();
  }
  for (const collection of [body.payload.items, body.payload.containers]) for (const row of Object.values(collection)) {
    if (!plain(row) || Object.hasOwn(row, "photos") && !Array.isArray(row.photos)) fail();
    if ((row.photos || []).some(photo => photos.has(photo?.id ?? photo?.photoId))) fail();
  }
  return freeze(clone(append));
}

const dimension = value => value === null || revision(value);
function storedMetadata(receipt, manifest) {
  if (!exact(receipt.stored, ["file", "thumb"])) return false;
  const { file, thumb } = receipt.stored;
  if (!exact(file, ["hash", "size", "type", "fileName", "width", "height"]) || !dimension(file.width) || !dimension(file.height)) return false;
  fileMetadata({ hash: file.hash, size: file.size, type: file.type, fileName: file.fileName }, true);
  fileMetadata(thumb, false);
  return file.type === manifest.file.type && thumb.type === (manifest.thumb?.type || manifest.file.type)
    && (manifest.thumb !== null || same(thumb, { hash: file.hash, size: file.size, type: file.type }));
}

// Availability is separate from the immutable receipt. A missing stored file
// must not turn a known upload into a new operation or authorize another POST.
export async function validateAdminTemplatePhotoStageReceipt(input, expected) {
  try {
    const data = clone(input), manifest = adminTemplatePhotoStageManifest(expected.manifest), assetDigest = expected.assetDigest;
    if (!hash(assetDigest) || assetDigest !== await digest(manifest)
      || !exact(data, ["ok", "receipt", "assetState"]) || data.ok !== true || !["ready", "unavailable"].includes(data.assetState)) return false;
    const receipt = data.receipt;
    return exact(receipt, ["version", "manifest", "assetDigest", "ownerId", "baseEntityRevision", "stored"])
      && receipt.version === 1 && same(receipt.manifest, manifest) && receipt.assetDigest === assetDigest
      && text(receipt.ownerId, 36) && revision(receipt.baseEntityRevision) && storedMetadata(receipt, manifest);
  } catch { return false; }
}

function photoRoute(value, listId, id, variant) {
  if (typeof value !== "string" || !value || value.length > 4096) return false;
  try {
    const url = new URL(value, "https://photo-route.invalid");
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
      && url.pathname.endsWith(`/bike-packing/lists/${encodeURIComponent(listId)}/photos/${encodeURIComponent(id)}/${variant}`);
  } catch { return false; }
}

export function validateAdminTemplatePhotoAppendResultStructure(result, intent) {
  try {
    const append = adminTemplatePhotoAppend(intent.body, intent.id ?? intent.operationId);
    if (intent.kind !== "template.save" || !exact(result, ["version", "ownerId", "added", "confirmedPayload", "confirmedPayloadDigest"])
      || result.version !== 1 || !text(result.ownerId, 36) || !Array.isArray(result.added) || result.added.length !== append.assets.length
      || !hash(result.confirmedPayloadDigest) || !plain(result.confirmedPayload)
      || new TextEncoder().encode(canonical(result)).byteLength > 4 * 1024 * 1024) return false;
    const byOwner = new Map();
    for (const [index, asset] of append.assets.entries()) {
      const added = result.added[index], photo = added?.photo;
      if (!exact(added, ["assetId", "assetDigest", "entityType", "entityId", "photo"])
        || ["assetId", "assetDigest", "entityType", "entityId"].some(key => added[key] !== asset[key])
        || !exact(photo, ["id", "photoId", "assetId", "listId", "status", "url", "thumbUrl", "fileName", "type", "size", "width", "height"])
        || photo.id !== asset.photoId || photo.photoId !== asset.photoId || photo.assetId !== asset.assetId || photo.listId !== intent.listId
        || photo.status !== "synced" || !dimension(photo.width) || !dimension(photo.height)
        || !photoRoute(photo.url, intent.listId, asset.photoId, "file") || !photoRoute(photo.thumbUrl, intent.listId, asset.photoId, "thumb")) return false;
      fileMetadata({ hash: asset.assetDigest, size: photo.size, type: photo.type, fileName: photo.fileName }, true);
      const key = canonical([asset.entityType, asset.entityId]); byOwner.set(key, [...(byOwner.get(key) || []), photo]);
    }
    for (const [collection, type] of [["items", "item"], ["containers", "container"]]) {
      const before = intent.body.payload[collection], after = result.confirmedPayload[collection];
      if (!plain(after) || !same(Object.keys(before).sort(), Object.keys(after).sort())) return false;
      for (const [id, row] of Object.entries(before)) {
        if (row.id !== id || after[id]?.id !== id
          || !same(after[id].photos ?? [], [...(row.photos ?? []), ...(byOwner.get(canonical([type, id])) || [])])) return false;
      }
    }
    return true;
  } catch { return false; }
}

export async function validateAdminTemplatePhotoStages(input, values) {
  try {
    const intent = clone(input), stages = clone(values), operationId = intent.id ?? intent.operationId;
    const append = adminTemplatePhotoAppend(intent.body, operationId);
    if (!Array.isArray(stages) || stages.length !== append.assets.length) return false;
    for (const [index, asset] of append.assets.entries()) {
      const data = stages[index], manifest = data?.receipt?.manifest;
      if (!manifest || manifest.operationId !== asset.assetId || manifest.templateOperationId !== operationId
        || manifest.actorId !== intent.actorId || manifest.environment !== intent.environment || manifest.listId !== intent.listId || manifest.itemKey !== intent.itemKey
        || manifest.baseStateRevision !== intent.body.base.stateRevision || manifest.entityType !== asset.entityType
        || manifest.entityId !== asset.entityId || manifest.photoId !== asset.photoId
        || !await validateAdminTemplatePhotoStageReceipt(data, { manifest, assetDigest: asset.assetDigest })) return false;
    }
    return true;
  } catch { return false; }
}

// Validate only the success extension here. The administrative client still
// validates the containing operation, original body digest and final revision.
// The authoritative payload avoids reconstructing server defaults on the client.
export async function validateAdminTemplatePhotoAppendResult(input, expected) {
  try {
    const result = clone(input), intent = clone(expected.intent), stages = clone(expected.stageReceipts);
    const operationId = intent.id ?? intent.operationId, append = adminTemplatePhotoAppend(intent.body, operationId);
    if (!validateAdminTemplatePhotoAppendResultStructure(result, intent)
      || !Array.isArray(stages) || stages.length !== append.assets.length
      || await digest(result.confirmedPayload) !== result.confirmedPayloadDigest) return false;
    const addedByOwner = new Map();
    for (const [index, asset] of append.assets.entries()) {
      const added = result.added[index], stageData = stages[index], stage = stageData?.receipt, manifest = stage?.manifest;
      if (!manifest || manifest.operationId !== asset.assetId || manifest.templateOperationId !== operationId
        || manifest.actorId !== intent.actorId || manifest.environment !== intent.environment || manifest.listId !== intent.listId || manifest.itemKey !== intent.itemKey
        || manifest.baseStateRevision !== intent.body.base.stateRevision || manifest.entityType !== asset.entityType
        || manifest.entityId !== asset.entityId || manifest.photoId !== asset.photoId || stage.ownerId !== result.ownerId
        || !await validateAdminTemplatePhotoStageReceipt(stageData, { manifest, assetDigest: asset.assetDigest })
        || !exact(added, ["assetId", "assetDigest", "entityType", "entityId", "photo"])
        || ["assetId", "assetDigest", "entityType", "entityId"].some(key => added[key] !== asset[key])) return false;
      const photo = added.photo, file = stage.stored.file;
      if (!exact(photo, ["id", "photoId", "assetId", "listId", "status", "url", "thumbUrl", "fileName", "type", "size", "width", "height"])
        || photo.id !== asset.photoId || photo.photoId !== asset.photoId || photo.assetId !== asset.assetId
        || photo.listId !== intent.listId || photo.status !== "synced"
        || ["fileName", "type", "size", "width", "height"].some(key => photo[key] !== file[key])
        || !photoRoute(photo.url, intent.listId, asset.photoId, "file") || !photoRoute(photo.thumbUrl, intent.listId, asset.photoId, "thumb")) return false;
      const key = canonical([asset.entityType, asset.entityId]);
      addedByOwner.set(key, [...(addedByOwner.get(key) || []), photo]);
    }
    for (const [collection, type] of [["items", "item"], ["containers", "container"]]) {
      const before = intent.body.payload[collection], after = result.confirmedPayload[collection];
      if (!plain(after) || !same(Object.keys(before).sort(), Object.keys(after).sort())) return false;
      for (const [id, row] of Object.entries(before)) {
        if (row.id !== id || after[id]?.id !== id) return false;
        const oldPhotos = row.photos ?? [], confirmedPhotos = after[id].photos ?? [];
        if (!same(confirmedPhotos, [...oldPhotos, ...(addedByOwner.get(canonical([type, id])) || [])])) return false;
      }
    }
    return true;
  } catch { return false; }
}
