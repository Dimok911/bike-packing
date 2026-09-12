import { canonicalAccessJson as canonical, validAccessOperationId as uuid } from "./personal-access-protocol.js";
import { adminTemplateIntent } from "./admin-template-protocol.js";
import { assertAdminTemplatePhotoCreateOwnerAbsent } from "./admin-template-photo-create-protocol.js";

// Preparation only. No gateway, capability advertisement or existing parser is changed.
export const ADMIN_TEMPLATE_PHOTO_COPY_ENABLED = false;
export const TEMPLATE_PHOTO_COPY_CAPABILITY = "adminTemplatePhotoCopyV1";
const environment = "bike-packing-experiment", mode = "admin-template-photo-copy";
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value, max) => typeof value === "string" && value.length <= max;
const id = value => text(value, 191) && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value) && !["__proto__", "prototype", "constructor"].includes(value);
const photoId = value => id(value) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const ownerId = value => text(value, 36) && value.length > 0 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const date = value => text(value, 64) && Number.isFinite(Date.parse(value));
const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))), byte => byte.toString(16).padStart(2, "0")).join("");
const fail = (code = "admin-template-photo-copy") => { throw Object.assign(Error(code), { code, isAdminTemplateBlocked: true }); };
const fields = ["name", "createdAt", "updatedAt", "updatedByDeviceId", "updatedByDeviceName"];
const timestamps = ["createdAt", "updatedAt"];
const originalAliases = ["url", "fileUrl", "file_url", "src", "href"];
const thumbAliases = ["thumbUrl", "thumb_url", "thumbnailUrl", "thumbnail_url", "thumb"];
const photoKeys = ["id", "photoId", "assetId", "listId", "status", "fileName", "type", "size", "width", "height", "localId", "error", "urls", ...timestamps, ...originalAliases, ...thumbAliases];
const mime = value => ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"].includes(value);
const size = value => positive(value) && value <= 10 * 1024 * 1024;
const dimension = value => value === null || positive(value);
const fileName = value => text(value, 255) && value.length > 0 && !/[\u0000-\u001f\u007f/\\]/.test(value);
function binding(value) {
  if (!plain(value) || !text(value.listId, 64)) fail();
  const list = value.listId, demo = "public-demo-state-", shared = "public-shared-layout-";
  const key = list === "public-demo-state" ? "demo-state" : list.startsWith(demo) && id(list.slice(demo.length)) ? `demo-state:${list.slice(demo.length)}`
    : list.startsWith(shared) && id(list.slice(shared.length)) ? `shared-layout:${list.slice(shared.length)}` : null;
  if (!key || key !== value.itemKey) fail();
}
const rawId = photo => photo?.id ?? photo?.photoId;
const remoteUrl = value => {
  if (!text(value, 4096) || !value) return false;
  try { const url = new URL(value, "https://photo-route.invalid"); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
};

// These are actual legacy/current fields, not a generic metadata sanitizer.
// Unknown photo fields pause the whole copy; the immutable source is never stripped.
export function adminTemplatePhotoCopyReference(photo, listId) {
  if (!plain(photo) || Object.keys(photo).some(key => !photoKeys.includes(key))) fail("admin-template-photo-copy-unsupported-photo-metadata");
  const key = rawId(photo);
  if (!id(key) || Object.hasOwn(photo, "id") && photo.id !== key || Object.hasOwn(photo, "photoId") && photo.photoId !== key
    || Object.hasOwn(photo, "assetId") && !uuid(photo.assetId) || Object.hasOwn(photo, "listId") && photo.listId !== listId
    || Object.hasOwn(photo, "status") && photo.status !== "synced"
    || ["localId", "error"].some(field => Object.hasOwn(photo, field) && photo[field] !== "")
    || timestamps.some(field => Object.hasOwn(photo, field) && photo[field] !== null && !date(photo[field]))) fail();
  if (Object.hasOwn(photo, "fileName") && photo.fileName !== "" && !fileName(photo.fileName)
    || Object.hasOwn(photo, "type") && photo.type !== "" && !mime(photo.type)
    || ["size", "width", "height"].some(field => Object.hasOwn(photo, field) && photo[field] !== null
      && (!Number.isSafeInteger(photo[field]) || photo[field] < 0))) fail();
  const urls = photo.urls ?? {};
  if (!plain(urls) || Object.keys(urls).some(field => !["url", "file", "original", "thumb", "thumbnail"].includes(field))) fail("admin-template-photo-copy-unsupported-photo-metadata");
  const values = [...originalAliases, ...thumbAliases].filter(field => Object.hasOwn(photo, field)).map(field => photo[field]).concat(Object.values(urls));
  if (values.some(value => value !== "" && !remoteUrl(value)) || !values.some(Boolean)) fail();
  return freeze(Object.fromEntries(timestamps.filter(field => Object.hasOwn(photo, field)).map(field => [field, photo[field]])));
}

export function adminTemplatePhotoCopy(body, operationId) {
  canonical(body);
  const copy = body?.photoCopy, source = copy?.source;
  if (!uuid(operationId) || !exact(body, ["version", "base", "payload", "metadata", "photoCopy"]) || body.version !== 1
    || !exact(body.base, ["stateRevision"]) || !positive(body.base.stateRevision)
    || !exact(copy, ["version", "entityType", "entityId", "fields", "source", "assets"]) || copy.version !== 1
    || !["item", "container"].includes(copy.entityType) || !id(copy.entityId)
    || !exact(source, ["itemKey", "listId", "base", "payloadDigest", "payload", "entityId"])
    || !exact(source.base, ["stateRevision"]) || !positive(source.base.stateRevision) || !hash(source.payloadDigest) || !id(source.entityId)) fail();
  binding(source);
  if (!exact(copy.fields, fields) || !text(copy.fields.name, 255) || !copy.fields.name.trim() || copy.fields.name.trim() !== copy.fields.name
    || !date(copy.fields.createdAt) || !date(copy.fields.updatedAt) || !text(copy.fields.updatedByDeviceId, 128) || !text(copy.fields.updatedByDeviceName, 255)) fail();
  // Reuse the proven strict raw inventory, without fabricating a create operation.
  assertAdminTemplatePhotoCreateOwnerAbsent(body.payload, copy.entityId);
  assertAdminTemplatePhotoCreateOwnerAbsent(source.payload, copy.entityId);
  const collection = copy.entityType === "item" ? "items" : "containers", owner = source.payload[collection][source.entityId];
  if (!owner || owner.id !== source.entityId || copy.entityType === "container" && owner.parentId
    || !Array.isArray(owner.photos) || !owner.photos.length || owner.photos.length > 50
    || !Array.isArray(copy.assets) || copy.assets.length !== owner.photos.length) fail();
  // A known legacy placement alias is not opaque copyable data.
  if (Object.hasOwn(owner, "parentContainerId")) fail("admin-template-photo-copy-unsupported-owner-placement");
  const occupiedPhotos = new Set(), occupiedAssets = new Set();
  for (const payload of [body.payload, source.payload]) for (const type of ["items", "containers"])
    for (const row of Object.values(payload[type])) for (const photo of row.photos || []) {
      occupiedPhotos.add(rawId(photo)); if (photo.assetId) occupiedAssets.add(photo.assetId);
    }
  const assets = new Set(), photos = new Set();
  for (const [index, asset] of copy.assets.entries()) {
    adminTemplatePhotoCopyReference(owner.photos[index], source.listId);
    if (!exact(asset, ["assetId", "assetDigest", "sourcePhotoId", "photoId"]) || !uuid(asset.assetId) || asset.assetId === operationId
      || assets.has(asset.assetId) || occupiedAssets.has(asset.assetId) || !hash(asset.assetDigest) || asset.sourcePhotoId !== rawId(owner.photos[index])
      || !photoId(asset.photoId) || photos.has(asset.photoId) || occupiedPhotos.has(asset.photoId)) fail();
    assets.add(asset.assetId); photos.add(asset.photoId);
  }
  return freeze(clone(copy));
}

export function adminTemplatePhotoCopyIntent(input) {
  if (input?.kind !== "template.save" || Object.hasOwn(input, "environment") && input.environment !== environment) fail();
  const { photoCopy, ...ordinary } = input.body || {};
  const intent = adminTemplateIntent({ ...input, body: ordinary });
  adminTemplatePhotoCopy(input.body, input.operationId); binding(intent);
  if (!ownerId(intent.actorId) || photoCopy.source.listId === intent.listId) fail();
  const result = { ...intent, body: clone(input.body) };
  if (new TextEncoder().encode(canonical(result)).byteLength > 3 * 1024 * 1024) fail();
  return freeze(result);
}
function checked(input) {
  if (input?.id !== undefined && input?.operationId !== undefined && input.id !== input.operationId) fail();
  return adminTemplatePhotoCopyIntent({ ...input, operationId: input?.id ?? input?.operationId });
}

export function adminTemplatePhotoCopyStageManifest(input) {
  const manifest = clone(input), source = manifest.source, target = manifest.target;
  if (!exact(manifest, ["version", "kind", "environment", "actorId", "operationId", "templateOperationId", "source", "target"])
    || manifest.version !== 1 || manifest.kind !== mode || manifest.environment !== environment || !ownerId(manifest.actorId)
    || !uuid(manifest.operationId) || !uuid(manifest.templateOperationId) || manifest.operationId === manifest.templateOperationId
    || !exact(source, ["itemKey", "listId", "baseStateRevision", "payloadDigest", "entityType", "entityId", "photoId", "referenceDigest"])
    || !exact(target, ["itemKey", "listId", "baseStateRevision", "payloadDigest", "entityType", "entityId", "photoId"])) fail();
  for (const value of [source, target]) {
    binding(value);
    if (!positive(value.baseStateRevision) || !hash(value.payloadDigest) || !["item", "container"].includes(value.entityType) || !id(value.entityId) || !id(value.photoId)) fail();
  }
  if (source.listId === target.listId || source.entityType !== target.entityType || source.entityId === target.entityId
    || source.photoId === target.photoId || !photoId(target.photoId) || !hash(source.referenceDigest)) fail();
  return freeze(manifest);
}
export async function adminTemplatePhotoCopyStageDigest(input) { return digest(adminTemplatePhotoCopyStageManifest(input)); }

async function manifests(intent) {
  const c = intent.body.photoCopy, s = c.source, owner = s.payload[c.entityType === "item" ? "items" : "containers"][s.entityId];
  if (await digest(s.payload) !== s.payloadDigest) fail("admin-template-photo-copy-source-digest");
  const targetDigest = await digest(intent.body.payload), result = [];
  for (const [index, asset] of c.assets.entries()) result.push(adminTemplatePhotoCopyStageManifest({ version: 1, kind: mode,
    environment: intent.environment, actorId: intent.actorId, operationId: asset.assetId, templateOperationId: intent.id,
    source: { itemKey: s.itemKey, listId: s.listId, baseStateRevision: s.base.stateRevision, payloadDigest: s.payloadDigest,
      entityType: c.entityType, entityId: s.entityId, photoId: asset.sourcePhotoId, referenceDigest: await digest(owner.photos[index]) },
    target: { itemKey: intent.itemKey, listId: intent.listId, baseStateRevision: intent.body.base.stateRevision, payloadDigest: targetDigest,
      entityType: c.entityType, entityId: c.entityId, photoId: asset.photoId } }));
  return result;
}
// Can build manifests with placeholder assetDigest, then freeze their real
// digests into the body before the first network await. No IDs are allocated.
export async function adminTemplatePhotoCopyStageManifests(input) { return freeze(await manifests(checked(input))); }
export async function assertAdminTemplatePhotoCopyIntentDigests(input) {
  const intent = checked(input), expected = await manifests(intent);
  for (const [index, manifest] of expected.entries()) if (await digest(manifest) !== intent.body.photoCopy.assets[index].assetDigest) fail("admin-template-photo-copy-stage-binding");
  return true;
}

function stored(value) {
  return exact(value, ["file", "thumb"]) && exact(value.file, ["hash", "size", "type", "fileName", "width", "height"])
    && hash(value.file.hash) && size(value.file.size) && mime(value.file.type) && fileName(value.file.fileName)
    && dimension(value.file.width) && dimension(value.file.height) && exact(value.thumb, ["hash", "size", "type"])
    && hash(value.thumb.hash) && size(value.thumb.size) && mime(value.thumb.type);
}
function materialization(value) {
  if (!exact(value, ["version", "source", "target"]) || value.version !== 1) return false;
  for (const part of [value.source, value.target]) if (!exact(part, ["filePathDigest", "thumbPathDigest"]) || !Object.values(part).every(hash)) return false;
  return Object.values(value.source).every(path => !Object.values(value.target).includes(path));
}
const pathMetadata = (paths, value) => paths.filePathDigest !== paths.thumbPathDigest
  || same(value.thumb, { hash: value.file.hash, size: value.file.size, type: value.file.type });
// Server preparation primitive, NOT a filesystem authority check. The future
// handler must additionally resolve contained regular files without symlinks.
export async function adminTemplatePhotoCopyMaterialization(sourceInput, targetInput) {
  const source = clone(sourceInput), target = clone(targetInput);
  const validate = value => {
    if (!exact(value, ["filePath", "thumbPath"])) fail();
    for (const path of Object.values(value)) if (!text(path, 1024) || !/^[A-Za-z0-9._/-]+$/.test(path)
      || path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === "..")) fail();
  };
  validate(source); validate(target);
  const encode = async value => ({ filePathDigest: await digest(value.filePath.toLowerCase()), thumbPathDigest: await digest(value.thumbPath.toLowerCase()) });
  const proof = { version: 1, source: await encode(source), target: await encode(target) };
  if (!materialization(proof)) fail("admin-template-photo-copy-shared-path");
  return freeze(proof);
}

export async function validateAdminTemplatePhotoCopyStageReceipt(input, expected) {
  try {
    const data = clone(input), manifest = adminTemplatePhotoCopyStageManifest(expected.manifest), assetDigest = expected.assetDigest;
    if (!hash(assetDigest) || await digest(manifest) !== assetDigest || !exact(data, ["ok", "assetState", "receipt"])
      || data.ok !== true || !["ready", "unavailable"].includes(data.assetState)) return false;
    const r = data.receipt;
    return exact(r, ["version", "kind", "manifest", "assetDigest", "sourceOwnerId", "ownerId", "baseEntityRevision", "sourceStored", "stored", "materialization"])
      && r.version === 1 && r.kind === mode && same(r.manifest, manifest) && r.assetDigest === assetDigest
      && ownerId(r.sourceOwnerId) && ownerId(r.ownerId) && r.baseEntityRevision === 0
      && stored(r.sourceStored) && stored(r.stored) && same(r.sourceStored, r.stored) && materialization(r.materialization)
      && pathMetadata(r.materialization.source, r.sourceStored) && pathMetadata(r.materialization.target, r.stored);
  } catch { return false; }
}

const photoRoute = (value, list, photo, variant) => {
  if (!remoteUrl(value)) return false;
  const url = new URL(value, "https://photo-route.invalid");
  return !url.search && !url.hash && url.pathname.endsWith(`/bike-packing/lists/${encodeURIComponent(list)}/photos/${encodeURIComponent(photo)}/${variant}`);
};
function addedPhoto(added, asset, sourcePhoto, intent) {
  const metadata = adminTemplatePhotoCopyReference(sourcePhoto, intent.body.photoCopy.source.listId), p = added?.photo;
  if (!exact(added, ["assetId", "assetDigest", "sourcePhotoId", "photo"]) || ["assetId", "assetDigest", "sourcePhotoId"].some(key => added[key] !== asset[key])
    || !exact(p, ["id", "photoId", "assetId", "listId", "status", "url", "thumbUrl", "fileName", "type", "size", "width", "height", ...Object.keys(metadata)])
    || p.id !== asset.photoId || p.photoId !== asset.photoId || p.assetId !== asset.assetId || p.listId !== intent.listId || p.status !== "synced"
    || !fileName(p.fileName) || !mime(p.type) || !size(p.size) || !dimension(p.width) || !dimension(p.height)
    || !photoRoute(p.url, intent.listId, asset.photoId, "file") || !photoRoute(p.thumbUrl, intent.listId, asset.photoId, "thumb")
    || Object.keys(metadata).some(key => p[key] !== metadata[key])) fail();
  return clone(p);
}
export function adminTemplatePhotoCopyPayload(input, added) {
  const intent = checked(input), c = intent.body.photoCopy, type = c.entityType === "item" ? "items" : "containers", owner = clone(c.source.payload[type][c.source.entityId]);
  if (!Array.isArray(added) || added.length !== c.assets.length) fail();
  owner.photos = c.assets.map((asset, index) => addedPhoto(added[index], asset, owner.photos[index], intent));
  Object.assign(owner, clone(c.fields), { id: c.entityId });
  if (c.entityType === "item") owner.containerId = "";
  else Object.assign(owner, { parentId: null, childIds: [], itemIds: [], order: [] });
  const payload = clone(intent.body.payload); payload[type][c.entityId] = owner;
  return payload;
}
export function validateAdminTemplatePhotoCopyResultStructure(result, input) {
  try {
    const intent = checked(input), c = intent.body.photoCopy;
    return exact(result, ["version", "sourceOwnerId", "ownerId", "entityType", "entityId", "added", "confirmedPayload", "confirmedPayloadDigest"])
      && result.version === 1 && ownerId(result.sourceOwnerId) && ownerId(result.ownerId) && result.entityType === c.entityType && result.entityId === c.entityId
      && hash(result.confirmedPayloadDigest) && new TextEncoder().encode(canonical(result)).byteLength <= 4 * 1024 * 1024
      && same(result.confirmedPayload, adminTemplatePhotoCopyPayload(intent, result.added));
  } catch { return false; }
}
export async function validateAdminTemplatePhotoCopyStages(input, values) {
  try {
    const intent = checked(input), stages = clone(values), expected = await manifests(intent), assets = intent.body.photoCopy.assets;
    if (!Array.isArray(stages) || stages.length !== assets.length) return false;
    let owners;
    const paths = new Set();
    for (const [index, stage] of stages.entries()) {
      if (!await validateAdminTemplatePhotoCopyStageReceipt(stage, { manifest: expected[index], assetDigest: assets[index].assetDigest })) return false;
      const r = stage.receipt, current = [r.sourceOwnerId, r.ownerId];
      if (owners && !same(owners, current)) return false; owners = current;
      const ownPaths = new Set(Object.values(r.materialization.target));
      if ([...ownPaths].some(path => paths.has(path))) return false;
      ownPaths.forEach(path => paths.add(path));
    }
    // Also exclude aliases to another source photo, not merely the paired one.
    return stages.every(stage => Object.values(stage.receipt.materialization.source).every(path => !paths.has(path)));
  } catch { return false; }
}
export async function validateAdminTemplatePhotoCopyResult(input, expected) {
  try {
    const result = clone(input), intent = checked(expected.intent), stages = clone(expected.stageReceipts);
    if (!validateAdminTemplatePhotoCopyResultStructure(result, intent) || !await validateAdminTemplatePhotoCopyStages(intent, stages)
      || await digest(result.confirmedPayload) !== result.confirmedPayloadDigest) return false;
    return stages.every((stage, index) => stage.receipt.ownerId === result.ownerId && stage.receipt.sourceOwnerId === result.sourceOwnerId
      && ["fileName", "type", "size", "width", "height"].every(key => result.added[index].photo[key] === stage.receipt.stored.file[key]));
  } catch { return false; }
}

// Pure contract for a future trusted, locked server observation. These booleans
// are NOT accepted from HTTP/client JSON and do not acquire/check rights or locks.
export async function assertAdminTemplatePhotoCopyPrepared(input, observationInput) {
  const intent = checked(input), observation = clone(observationInput), s = intent.body.photoCopy.source;
  if (!exact(observation, ["actorId", "canManage", "source", "target"]) || observation.actorId !== intent.actorId || observation.canManage !== true) fail("admin-template-photo-copy-rights");
  for (const [actual, expected, payload] of [[observation.source, { itemKey: s.itemKey, listId: s.listId, stateRevision: s.base.stateRevision }, s.payload],
    [observation.target, { itemKey: intent.itemKey, listId: intent.listId, stateRevision: intent.body.base.stateRevision }, intent.body.payload]]) {
    if (!exact(actual, ["itemKey", "listId", "stateRevision", "visibility", "deleted", "ownerId", "payload"])
      || actual.visibility !== "private" || actual.deleted !== false || !ownerId(actual.ownerId)
      || Object.keys(expected).some(key => actual[key] !== expected[key]) || !same(actual.payload, payload)) fail("admin-template-photo-copy-source-changed");
  }
  return assertAdminTemplatePhotoCopyIntentDigests(intent);
}
