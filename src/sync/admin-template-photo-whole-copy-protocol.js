import { adminTemplateIntent, canonicalTemplateJson as canonical, validTemplateOperationId as uuid } from "./admin-template-protocol.js";
import { projectAdminTemplateCopy } from "./admin-template-copy-projection.js";
import { adminTemplatePhotoWholeCopySourceInventory, projectAdminTemplatePhotoWholeCopyPayload } from "./admin-template-photo-whole-copy-projection.js";

// Pure V3 preparation only. Existing parsers, gateways, storage and gates do not
// dispatch this type. A manifest or projection alone proves no rights or files.
export const ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED = false;
export const TEMPLATE_PHOTO_WHOLE_COPY_CAPABILITY = "adminTemplatePhotoWholeCopyV1";
export const ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_CAPABILITY = TEMPLATE_PHOTO_WHOLE_COPY_CAPABILITY;
export const ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_LIMITS = Object.freeze({ owners: 100, photos: 50, depth: 32, wireBytes: 3 * 1024 * 1024 });
const environment = "bike-packing-experiment", mode = "admin-template-photo-whole-copy";
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = value => typeof value === "string" && value.length <= 191 && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value)
  && !["__proto__", "constructor", "prototype"].includes(value);
const actor = value => typeof value === "string" && value.length > 0 && value.length <= 36 && value === value.trim()
  && !/[\u0000-\u001f\u007f]/.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const bytes = value => new TextEncoder().encode(canonical(value));
const clone = value => JSON.parse(canonical(value));
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const digest = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(value)))].map(byte => byte.toString(16).padStart(2, "0")).join("");
const fail = (part = "invalid") => { const code = `admin-template-photo-whole-copy-${part}`;
  throw Object.assign(Error(code), { code, isAdminTemplateBlocked: true }); };
const limit = value => { if (bytes(value).byteLength > ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_LIMITS.wireBytes) fail("limit"); };
const collection = type => type === "item" ? "items" : "containers";
function binding(value, { target = false } = {}) {
  if (!plain(value) || typeof value.listId !== "string" || value.listId.length > 64) fail("binding");
  const list = value.listId, demo = "public-demo-state-", shared = "public-shared-layout-";
  const suffix = list.startsWith(demo) ? list.slice(demo.length) : list.startsWith(shared) ? list.slice(shared.length) : null;
  const key = list === "public-demo-state" ? "demo-state" : suffix && id(suffix)
    ? `${list.startsWith(demo) ? "demo-state" : "shared-layout"}:${suffix}` : null;
  if (!key || value.itemKey !== key || target && !uuid(suffix)) fail("binding");
  return suffix;
}
function reserve(occupied, value) { if (occupied.has(value)) fail("collision"); occupied.add(value); }

export function adminTemplatePhotoWholeCopyIntent(input) {
  // Canonical JSON detaches the caller before any asynchronous hash work.
  const raw = clone(input);
  const keys = ["actorId", "kind", "itemKey", "listId", "body", ...(Object.hasOwn(raw, "id") ? ["id"] : []),
    ...(Object.hasOwn(raw, "operationId") ? ["operationId"] : []), ...(Object.hasOwn(raw, "environment") ? ["environment"] : [])];
  const operationId = raw.id ?? raw.operationId, body = raw.body, c = body?.photoCopy;
  if (!exact(raw, keys) || raw.kind !== "template.copy" || !uuid(operationId) || !actor(raw.actorId)
    || Object.hasOwn(raw, "environment") && raw.environment !== environment
    || Object.hasOwn(raw, "id") && Object.hasOwn(raw, "operationId") && raw.id !== raw.operationId
    || !exact(body, ["version", "base", "source", "metadata", "photoCopy"])
    || !exact(c, ["version", "sourcePayload", "owners"]) || c.version !== 3) fail("binding");
  const { photoCopy: _photoCopy, ...ordinary } = body;
  // Preserve all existing command/metadata restrictions; do not teach the old
  // parser to accept a new photo kind or fabricate an existing target base.
  const core = adminTemplateIntent({ ...raw, operationId, body: ordinary });
  const source = body.source, targetUuid = binding(core, { target: true }), sourceSuffix = binding(source);
  if (!exact(source.base, ["stateRevision"]) || !positive(source.base.stateRevision)) fail("source-base");
  const inventory = adminTemplatePhotoWholeCopySourceInventory({ payload: c.sourcePayload, listId: source.listId });
  const projected = projectAdminTemplateCopy(c.sourcePayload, operationId, body.metadata);
  const occupied = new Set([source.listId, source.itemKey, ...(sourceSuffix ? [sourceSuffix] : [])]);
  for (const type of ["layouts", "containers", "items"]) for (const key of Object.keys(c.sourcePayload[type])) occupied.add(key);
  for (const owner of inventory.owners) for (const { sourcePhotoId, reference } of owner.photos) {
    occupied.add(sourcePhotoId); if (reference.assetId) occupied.add(reference.assetId);
  }
  for (const key of [operationId, targetUuid, core.listId, core.itemKey, ...Object.keys(projected.layouts)]) reserve(occupied, key);
  for (const type of ["containers", "items"]) for (const key of Object.keys(projected[type])) reserve(occupied, key);
  if (!Array.isArray(c.owners) || c.owners.length !== inventory.owners.length) fail("owners");
  const mapped = Object.fromEntries(["containers", "items"].map(type => [type,
    new Map(Object.keys(c.sourcePayload[type]).sort().map((key, index) => [key, Object.keys(projected[type])[index]]))]));
  for (const [index, original] of inventory.owners.entries()) {
    const owner = c.owners[index], type = collection(original.entityType);
    if (!exact(owner, ["entityType", "sourceEntityId", "entityId", "photos"]) || owner.entityType !== original.entityType
      || owner.sourceEntityId !== original.sourceEntityId || owner.entityId !== mapped[type].get(original.sourceEntityId)
      || !Array.isArray(owner.photos) || owner.photos.length !== original.photos.length) fail("owners");
    for (const [photoIndex, asset] of owner.photos.entries()) {
      if (!exact(asset, ["sourcePhotoId", "photoId", "assetId", "assetDigest"])
        || asset.sourcePhotoId !== original.photos[photoIndex].sourcePhotoId || !uuid(asset.photoId) || !uuid(asset.assetId) || !hash(asset.assetDigest)) fail("photo-map");
      reserve(occupied, asset.photoId); reserve(occupied, asset.assetId);
    }
  }
  const intent = { ...core, body };
  limit(intent);
  limit({ expectedActorId: intent.actorId, environment, operationId: intent.id, kind: intent.kind,
    itemKey: intent.itemKey, listId: intent.listId, body: intent.body });
  return freeze(intent);
}

export function adminTemplatePhotoWholeCopyStageManifest(input) {
  const m = clone(input), s = m?.source, t = m?.target;
  if (!exact(m, ["version", "kind", "environment", "actorId", "operationId", "templateOperationId", "copyDigest", "source", "target"])
    || m.version !== 3 || m.kind !== mode || m.environment !== environment || !actor(m.actorId) || !uuid(m.operationId)
    || !uuid(m.templateOperationId) || !hash(m.copyDigest)
    || !exact(s, ["itemKey", "listId", "baseStateRevision", "payloadDigest", "layoutId", "entityType", "entityId", "photoId", "referenceDigest"])
    || !exact(t, ["itemKey", "listId", "base", "layoutId", "entityType", "entityId", "photoId"])) fail("manifest");
  const sourceSuffix = binding(s), targetUuid = binding(t, { target: true });
  if (!positive(s.baseStateRevision) || !hash(s.payloadDigest) || !hash(s.referenceDigest) || !id(s.layoutId) || !id(s.entityId) || !id(s.photoId)
    || !["container", "item"].includes(s.entityType) || t.entityType !== s.entityType || t.base !== null
    || t.layoutId !== `layout-${m.templateOperationId}` || !uuid(t.photoId) || s.listId === t.listId) fail("manifest");
  const ownerPrefix = `template-copy-${m.templateOperationId}-${t.entityType === "item" ? "i" : "c"}-`;
  const ownerIndex = typeof t.entityId === "string" && t.entityId.startsWith(ownerPrefix) ? t.entityId.slice(ownerPrefix.length) : "";
  if (!/^(0|[1-9][0-9]?)$/.test(ownerIndex)) fail("manifest");
  const occupied = new Set([s.listId, s.itemKey, s.layoutId, s.entityId, s.photoId, ...(sourceSuffix ? [sourceSuffix] : [])]);
  for (const key of [m.operationId, m.templateOperationId, targetUuid, t.listId, t.itemKey, t.layoutId, t.entityId, t.photoId]) reserve(occupied, key);
  limit({ manifest: m });
  return freeze(m);
}

async function commitment(intent) {
  const c = intent.body.photoCopy, source = intent.body.source;
  if (await digest(c.sourcePayload) !== source.payloadDigest) fail("source-digest");
  const { layoutId } = adminTemplatePhotoWholeCopySourceInventory({ payload: c.sourcePayload, listId: source.listId });
  return { version: 3, kind: mode, environment, actorId: intent.actorId, templateOperationId: intent.id,
    source: { itemKey: source.itemKey, listId: source.listId, baseStateRevision: source.base.stateRevision, payloadDigest: source.payloadDigest, layoutId },
    target: { itemKey: intent.itemKey, listId: intent.listId, base: null, layoutId: `layout-${intent.id}` },
    metadata: intent.body.metadata,
    owners: c.owners.map(owner => ({ ...owner, photos: owner.photos.map(({ assetDigest: _assetDigest, ...asset }) => asset) })) };
}
export async function adminTemplatePhotoWholeCopyCommitment(input) { return freeze(await commitment(adminTemplatePhotoWholeCopyIntent(input))); }
export async function adminTemplatePhotoWholeCopyDigest(input) { return digest(await commitment(adminTemplatePhotoWholeCopyIntent(input))); }
export async function adminTemplatePhotoWholeCopyStageDigest(input) { return digest(adminTemplatePhotoWholeCopyStageManifest(input)); }
async function manifests(intent) {
  const committed = await commitment(intent), copyDigest = await digest(committed), result = [];
  for (const owner of intent.body.photoCopy.owners) for (const [index, asset] of owner.photos.entries()) {
    const reference = intent.body.photoCopy.sourcePayload[collection(owner.entityType)][owner.sourceEntityId].photos[index];
    result.push(adminTemplatePhotoWholeCopyStageManifest({ version: 3, kind: mode, environment, actorId: intent.actorId,
      operationId: asset.assetId, templateOperationId: intent.id, copyDigest,
      source: { ...committed.source, entityType: owner.entityType, entityId: owner.sourceEntityId, photoId: asset.sourcePhotoId, referenceDigest: await digest(reference) },
      target: { ...committed.target, entityType: owner.entityType, entityId: owner.entityId, photoId: asset.photoId } }));
  }
  return result;
}
// Allocation can use placeholder asset digests. The immutable final action must
// pass the independent digest assertion after all derived manifests are hashed.
export async function adminTemplatePhotoWholeCopyStageManifests(input) { return freeze(await manifests(adminTemplatePhotoWholeCopyIntent(input))); }
export async function assertAdminTemplatePhotoWholeCopyIntentDigests(input) {
  const intent = adminTemplatePhotoWholeCopyIntent(input), expected = await manifests(intent), assets = intent.body.photoCopy.owners.flatMap(owner => owner.photos);
  for (const [index, manifest] of expected.entries()) if (await digest(manifest) !== assets[index].assetDigest) fail("stage-binding");
  return true;
}

export function adminTemplatePhotoWholeCopyPayload(input, resultOwners) {
  const intent = adminTemplatePhotoWholeCopyIntent(input), results = clone(resultOwners), c = intent.body.photoCopy;
  if (!Array.isArray(results) || results.length !== c.owners.length) fail("projected-owners");
  const owners = c.owners.map((owner, index) => {
    const result = results[index];
    if (!exact(result, ["entityType", "sourceEntityId", "entityId", "added"]) || result.entityType !== owner.entityType
      || result.sourceEntityId !== owner.sourceEntityId || result.entityId !== owner.entityId || !Array.isArray(result.added)
      || result.added.length !== owner.photos.length) fail("projected-owners");
    return { entityType: owner.entityType, sourceEntityId: owner.sourceEntityId, entityId: owner.entityId,
      photos: result.added.map((added, photoIndex) => {
        const asset = owner.photos[photoIndex];
        if (!exact(added, ["assetId", "assetDigest", "sourcePhotoId", "photo"])
          || ["assetId", "assetDigest", "sourcePhotoId"].some(key => added[key] !== asset[key])
          || added.photo?.id !== asset.photoId || added.photo?.assetId !== asset.assetId) fail("projected-photo");
        return { sourcePhotoId: added.sourcePhotoId, photo: added.photo };
      }) };
  });
  return projectAdminTemplatePhotoWholeCopyPayload({ sourcePayload: c.sourcePayload, sourceListId: intent.body.source.listId,
    targetListId: intent.listId, operationId: intent.id, metadata: intent.body.metadata, owners });
}
