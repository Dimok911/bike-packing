import { canonicalAccessJson as canonical, validAccessOperationId as uuid } from "./personal-access-protocol.js";
import { adminTemplateIntent } from "./admin-template-protocol.js";
import { assertAdminTemplatePhotoCreateOwnerAbsent } from "./admin-template-photo-create-protocol.js";
import { adminTemplatePhotoCopyReference } from "./admin-template-photo-copy-protocol.js";

// Pure preparation only. Neither the general parser nor any dispatch path uses
// this protocol. A valid projection or manifest is NOT server/file authority.
export const ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED = false;
export const TEMPLATE_PHOTO_TREE_COPY_CAPABILITY = "adminTemplatePhotoTreeCopyV1";
export const ADMIN_TEMPLATE_PHOTO_TREE_COPY_LIMITS = Object.freeze({ owners: 100, depth: 32, photos: 50, wireBytes: 3 * 1024 * 1024, projectionBytes: 4 * 1024 * 1024 });
const environment = "bike-packing-experiment", mode = "admin-template-photo-tree-copy";
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value, max) => typeof value === "string" && value.length <= max;
const id = value => text(value, 191) && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value) && !["__proto__", "prototype", "constructor"].includes(value);
const photoId = value => id(value) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const actor = value => text(value, 36) && value.length > 0 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const date = value => text(value, 64) && Number.isFinite(Date.parse(value));
const ids = value => Array.isArray(value) && value.every(id) && new Set(value).size === value.length;
const rawPhotoId = photo => photo?.id ?? photo?.photoId;
const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const bytes = value => new TextEncoder().encode(canonical(value));
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(value))), byte => byte.toString(16).padStart(2, "0")).join("");
const fail = (suffix = "invalid") => { const code = `admin-template-photo-tree-copy-${suffix}`; throw Object.assign(Error(code), { code, isAdminTemplateBlocked: true }); };
const collection = type => type === "item" ? "items" : "containers";
const editFields = ["createdAt", "updatedAt", "updatedByDeviceId", "updatedByDeviceName"];
const fields = ["name", ...editFields];
const ownerKey = owner => `${owner.entityType}:${owner.sourceEntityId}`;
const ordered = values => [...values].sort((a, b) => ownerKey(a) < ownerKey(b) ? -1 : ownerKey(a) > ownerKey(b) ? 1 : 0);
function binding(value) {
  if (!plain(value) || !text(value.listId, 64)) fail();
  const list = value.listId, demo = "public-demo-state-", shared = "public-shared-layout-";
  const key = list === "public-demo-state" ? "demo-state" : list.startsWith(demo) && id(list.slice(demo.length)) ? `demo-state:${list.slice(demo.length)}`
    : list.startsWith(shared) && id(list.slice(shared.length)) ? `shared-layout:${list.slice(shared.length)}` : null;
  if (!key || key !== value.itemKey) fail("binding");
}

// The selected closure comes only from the arrangement, never display/raw row
// links. The shared inventory separately verifies all other roots and mirrors.
function closure(source) {
  const payload = source.payload, layout = payload?.layouts?.[source.layoutId], a = layout?.arrangement;
  if (!plain(layout) || layout.id !== source.layoutId || !plain(a) || !ids(a.rootContainerIds) || !a.rootContainerIds.includes(source.rootId)) fail("root");
  const owners = [], visited = new Set();
  const add = (type, key) => {
    const row = payload?.[collection(type)]?.[key];
    if (!id(key) || visited.has(key) || !plain(row) || row.id !== key) fail("closure");
    visited.add(key); owners.push({ entityType: type, sourceEntityId: key });
    if (owners.length > ADMIN_TEMPLATE_PHOTO_TREE_COPY_LIMITS.owners) fail("limit");
    if (Object.hasOwn(row, "parentContainerId") || (type === "container" ? Object.hasOwn(row, "containerId")
      : ["parentId", "childIds", "itemIds", "order"].some(field => Object.hasOwn(row, field)))) fail("owner-placement");
    // Existing fileless tree placement also refuses unavailable items. Do not
    // normalize an unknown status into permission to place it.
    if (type === "item" && Object.hasOwn(row, "availabilityStatus") && ![null, "", "available"].includes(row.availabilityStatus)) fail("unavailable-item");
    if (Object.hasOwn(row, "photos") && !Array.isArray(row.photos)) fail("photos");
  };
  const walk = (key, parent, depth) => {
    if (depth > ADMIN_TEMPLATE_PHOTO_TREE_COPY_LIMITS.depth) fail("limit");
    add("container", key);
    const p = a.containers?.[key];
    if (!plain(p) || p.parentId !== parent || !ids(p.childIds) || !ids(p.itemIds) || !Array.isArray(p.order)
      || p.order.length !== p.childIds.length + p.itemIds.length) fail("closure");
    const seen = new Set();
    for (const entry of p.order) {
      if (!exact(entry, ["type", "id"]) || !["item", "container"].includes(entry.type) || seen.has(entry.id)
        || !(entry.type === "item" ? p.itemIds : p.childIds).includes(entry.id)) fail("closure");
      seen.add(entry.id);
    }
    for (const item of p.itemIds) {
      if (a.items?.[item] !== key || !positive(a.itemQuantities?.[item])) fail("closure");
      add("item", item);
    }
    for (const child of p.childIds) walk(child, key, depth + 1);
  };
  walk(source.rootId, "", 1);
  return ordered(owners);
}

export function adminTemplatePhotoTreeCopy(body, operationId) {
  if (bytes(body).byteLength > ADMIN_TEMPLATE_PHOTO_TREE_COPY_LIMITS.wireBytes) fail("limit");
  const c = body?.photoCopy, s = c?.source;
  if (!uuid(operationId) || !exact(body, ["version", "base", "payload", "metadata", "photoCopy"]) || body.version !== 1
    || !exact(body.base, ["stateRevision"]) || !positive(body.base.stateRevision)
    || !exact(c, ["version", "source", "placement", "fields", "owners"]) || c.version !== 2
    || !exact(s, ["itemKey", "listId", "base", "payloadDigest", "payload", "layoutId", "rootId"])
    || !exact(s.base, ["stateRevision"]) || !positive(s.base.stateRevision) || !hash(s.payloadDigest) || !id(s.layoutId) || !id(s.rootId)) fail();
  binding(s);
  if (!exact(c.fields, fields) || !text(c.fields.name, 255) || !c.fields.name.trim() || c.fields.name !== c.fields.name.trim()
    || !date(c.fields.createdAt) || !date(c.fields.updatedAt) || !text(c.fields.updatedByDeviceId, 128) || !text(c.fields.updatedByDeviceName, 255)
    || !exact(c.placement, ["layoutId", "index"]) || !id(c.placement.layoutId) || !Number.isSafeInteger(c.placement.index) || c.placement.index < 0
    || !Array.isArray(c.owners) || !c.owners.length || c.owners.length > ADMIN_TEMPLATE_PHOTO_TREE_COPY_LIMITS.owners) fail();
  const expected = closure(s), owners = new Set();
  if (expected.length !== c.owners.length) fail("closure");
  for (const [index, owner] of c.owners.entries()) {
    if (!exact(owner, ["entityType", "sourceEntityId", "entityId", "photos"]) || !same(expected[index], { entityType: owner.entityType, sourceEntityId: owner.sourceEntityId })
      || !id(owner.entityId) || owners.has(owner.entityId) || !Array.isArray(owner.photos)) fail("owner-map");
    owners.add(owner.entityId);
  }
  // One full inventory proof per snapshot; all remaining IDs are checked below
  // across all three collections. No artificial v1/create operation is built.
  for (const payload of [body.payload, s.payload]) {
    assertAdminTemplatePhotoCreateOwnerAbsent(payload, c.owners[0].entityId);
    for (const key of owners) if (["items", "containers", "layouts"].some(type => Object.hasOwn(payload[type], key))) fail("owner-collision");
  }
  const targetLayout = body.payload.layouts[c.placement.layoutId];
  if (!targetLayout || targetLayout.locked || c.placement.index > targetLayout.arrangement.rootContainerIds.length) fail("placement");
  const occupiedPhotos = new Set(), occupiedAssets = new Set(), photoIds = new Set(), assets = new Set();
  for (const payload of [body.payload, s.payload]) for (const type of ["items", "containers"]) for (const row of Object.values(payload[type]))
    for (const photo of row.photos || []) { occupiedPhotos.add(rawPhotoId(photo)); if (photo.assetId) occupiedAssets.add(photo.assetId); }
  let count = 0;
  for (const owner of c.owners) {
    const sourcePhotos = s.payload[collection(owner.entityType)][owner.sourceEntityId].photos || [];
    if (sourcePhotos.length !== owner.photos.length) fail("photos");
    for (const [index, asset] of owner.photos.entries()) {
      adminTemplatePhotoCopyReference(sourcePhotos[index], s.listId);
      if (!exact(asset, ["sourcePhotoId", "photoId", "assetId", "assetDigest"]) || asset.sourcePhotoId !== rawPhotoId(sourcePhotos[index])
        || !photoId(asset.photoId) || occupiedPhotos.has(asset.photoId) || photoIds.has(asset.photoId)
        || !uuid(asset.assetId) || asset.assetId === operationId || occupiedAssets.has(asset.assetId) || assets.has(asset.assetId) || !hash(asset.assetDigest)) fail("photo-map");
      photoIds.add(asset.photoId); assets.add(asset.assetId); count++;
    }
  }
  if (!count || count > ADMIN_TEMPLATE_PHOTO_TREE_COPY_LIMITS.photos) fail("limit");
  return freeze(clone(c));
}

export function adminTemplatePhotoTreeCopyIntent(input) {
  if (input?.kind !== "template.save" || Object.hasOwn(input, "environment") && input.environment !== environment
    || input?.id !== undefined && input?.operationId !== undefined && input.id !== input.operationId) fail("binding");
  const operationId = input?.id ?? input?.operationId, { photoCopy, ...ordinary } = input.body || {};
  const intent = adminTemplateIntent({ ...input, operationId, body: ordinary });
  adminTemplatePhotoTreeCopy(input.body, operationId); binding(intent);
  if (!actor(intent.actorId) || photoCopy.source.listId === intent.listId) fail("binding");
  const result = { ...intent, body: clone(input.body) };
  if (bytes(result).byteLength > ADMIN_TEMPLATE_PHOTO_TREE_COPY_LIMITS.wireBytes) fail("limit");
  return freeze(result);
}

export function adminTemplatePhotoTreeCopyStageManifest(input) {
  const m = clone(input), s = m.source, t = m.target;
  if (!exact(m, ["version", "kind", "environment", "actorId", "operationId", "templateOperationId", "treeDigest", "source", "target"])
    || m.version !== 2 || m.kind !== mode || m.environment !== environment || !actor(m.actorId) || !uuid(m.operationId)
    || !uuid(m.templateOperationId) || m.operationId === m.templateOperationId || !hash(m.treeDigest)
    || !exact(s, ["itemKey", "listId", "baseStateRevision", "payloadDigest", "layoutId", "rootId", "entityType", "entityId", "photoId", "referenceDigest"])
    || !exact(t, ["itemKey", "listId", "baseStateRevision", "payloadDigest", "entityType", "entityId", "photoId"])) fail("manifest");
  for (const value of [s, t]) {
    binding(value);
    if (!positive(value.baseStateRevision) || !hash(value.payloadDigest) || !["item", "container"].includes(value.entityType) || !id(value.entityId) || !id(value.photoId)) fail("manifest");
  }
  if (!id(s.layoutId) || !id(s.rootId) || !hash(s.referenceDigest) || !photoId(t.photoId) || s.listId === t.listId
    || s.entityType !== t.entityType || s.entityId === t.entityId || s.photoId === t.photoId) fail("manifest");
  return freeze(m);
}
export async function adminTemplatePhotoTreeCopyStageDigest(input) { return digest(adminTemplatePhotoTreeCopyStageManifest(input)); }

async function commitment(intent) {
  const c = intent.body.photoCopy, s = c.source;
  if (await digest(s.payload) !== s.payloadDigest) fail("source-digest");
  return { version: 2, kind: mode, environment: intent.environment, actorId: intent.actorId, templateOperationId: intent.id,
    source: { itemKey: s.itemKey, listId: s.listId, baseStateRevision: s.base.stateRevision, payloadDigest: s.payloadDigest, layoutId: s.layoutId, rootId: s.rootId },
    target: { itemKey: intent.itemKey, listId: intent.listId, baseStateRevision: intent.body.base.stateRevision, payloadDigest: await digest(intent.body.payload) },
    placement: c.placement, fields: c.fields,
    owners: c.owners.map(owner => ({ ...owner, photos: owner.photos.map(({ assetDigest: _digest, ...photo }) => photo) })) };
}
export async function adminTemplatePhotoTreeCopyCommitment(input) { return freeze(await commitment(adminTemplatePhotoTreeCopyIntent(input))); }
export async function adminTemplatePhotoTreeCopyDigest(input) { return digest(await commitment(adminTemplatePhotoTreeCopyIntent(input))); }
async function manifests(intent) {
  const c = intent.body.photoCopy, s = c.source, committed = await commitment(intent), treeDigest = await digest(committed), result = [];
  for (const owner of c.owners) for (const [index, asset] of owner.photos.entries()) result.push(adminTemplatePhotoTreeCopyStageManifest({
    version: 2, kind: mode, environment: intent.environment, actorId: intent.actorId, operationId: asset.assetId, templateOperationId: intent.id, treeDigest,
    source: { ...committed.source, entityType: owner.entityType, entityId: owner.sourceEntityId, photoId: asset.sourcePhotoId,
      referenceDigest: await digest(s.payload[collection(owner.entityType)][owner.sourceEntityId].photos[index]) },
    target: { ...committed.target, entityType: owner.entityType, entityId: owner.entityId, photoId: asset.photoId } }));
  return result;
}
// Placeholder digests permit allocation -> manifest hashes -> immutable final
// body, without an input-byte hash or a circular tree/asset digest dependency.
export async function adminTemplatePhotoTreeCopyStageManifests(input) { return freeze(await manifests(adminTemplatePhotoTreeCopyIntent(input))); }
export async function assertAdminTemplatePhotoTreeCopyIntentDigests(input) {
  const intent = adminTemplatePhotoTreeCopyIntent(input), expected = await manifests(intent), assets = intent.body.photoCopy.owners.flatMap(owner => owner.photos);
  for (const [index, manifest] of expected.entries()) if (await digest(manifest) !== assets[index].assetDigest) fail("stage-binding");
  return true;
}

const mime = value => ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"].includes(value);
const size = value => positive(value) && value <= 10 * 1024 * 1024;
const dimension = value => value === null || positive(value);
const fileName = value => text(value, 255) && value.length > 0 && !/[\u0000-\u001f\u007f/\\]/.test(value);
const route = (value, list, photo, variant) => {
  if (!text(value, 4096) || !value) return false;
  try { const url = new URL(value, "https://photo-route.invalid");
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
      && url.pathname.endsWith(`/bike-packing/lists/${encodeURIComponent(list)}/photos/${encodeURIComponent(photo)}/${variant}`);
  } catch { return false; }
};
function copiedPhoto(added, asset, sourcePhoto, intent) {
  const metadata = adminTemplatePhotoCopyReference(sourcePhoto, intent.body.photoCopy.source.listId), p = added?.photo;
  if (!exact(added, ["assetId", "assetDigest", "sourcePhotoId", "photo"]) || ["assetId", "assetDigest", "sourcePhotoId"].some(key => added[key] !== asset[key])
    || !exact(p, ["id", "photoId", "assetId", "listId", "status", "url", "thumbUrl", "fileName", "type", "size", "width", "height", ...Object.keys(metadata)])
    || p.id !== asset.photoId || p.photoId !== asset.photoId || p.assetId !== asset.assetId || p.listId !== intent.listId || p.status !== "synced"
    || !fileName(p.fileName) || !mime(p.type) || !size(p.size) || !dimension(p.width) || !dimension(p.height)
    || !route(p.url, intent.listId, asset.photoId, "file") || !route(p.thumbUrl, intent.listId, asset.photoId, "thumb")
    || Object.keys(metadata).some(key => p[key] !== metadata[key])) fail("projected-photo");
  return clone(p);
}

// This checks raw JSON derivation only. Supplied added refs still need actual
// authenticated receipts, byte/path proofs and origin validation at a gateway.
export function adminTemplatePhotoTreeCopyPayload(input, addedOwners) {
  const intent = adminTemplatePhotoTreeCopyIntent(input), c = intent.body.photoCopy, s = c.source;
  const added = clone(addedOwners), payload = clone(intent.body.payload), sourceArrangement = s.payload.layouts[s.layoutId].arrangement;
  if (!Array.isArray(added) || added.length !== c.owners.length) fail("projected-owners");
  const mapped = new Map(c.owners.map(owner => [owner.sourceEntityId, owner.entityId]));
  const layout = payload.layouts[c.placement.layoutId], a = layout.arrangement;
  const links = row => ({ ...clone(row), parentId: row.parentId ? mapped.get(row.parentId) : "",
    childIds: row.childIds.map(key => mapped.get(key)), itemIds: row.itemIds.map(key => mapped.get(key)),
    order: row.order.map(entry => ({ type: entry.type, id: mapped.get(entry.id) })) });
  for (const [index, owner] of c.owners.entries()) {
    const result = added[index], sourceOwner = s.payload[collection(owner.entityType)][owner.sourceEntityId], next = clone(sourceOwner);
    if (!exact(result, ["entityType", "sourceEntityId", "entityId", "added"]) || ["entityType", "sourceEntityId", "entityId"].some(key => result[key] !== owner[key])
      || !Array.isArray(result.added) || result.added.length !== owner.photos.length) fail("projected-owners");
    if (Object.hasOwn(sourceOwner, "photos")) next.photos = owner.photos.map((asset, photoIndex) => copiedPhoto(result.added[photoIndex], asset, sourceOwner.photos[photoIndex], intent));
    Object.assign(next, Object.fromEntries(editFields.map(key => [key, c.fields[key]])), { id: owner.entityId });
    if (owner.sourceEntityId === s.rootId) next.name = c.fields.name;
    if (owner.entityType === "container") {
      const mappedLinks = links(sourceArrangement.containers[owner.sourceEntityId]);
      a.containers[owner.entityId] = mappedLinks;
      // Arrangement opaque fields stay on arrangement; raw row opaque fields
      // stay on the row. Only these four known structural fields are overlaid.
      for (const key of ["parentId", "childIds", "itemIds", "order"]) next[key] = clone(mappedLinks[key]);
    } else {
      next.containerId = mapped.get(sourceArrangement.items[owner.sourceEntityId]);
      a.items[owner.entityId] = next.containerId;
      a.itemQuantities[owner.entityId] = sourceArrangement.itemQuantities[owner.sourceEntityId];
      // New placement is unpacked; old target packed maps remain byte-exact.
    }
    payload[collection(owner.entityType)][owner.entityId] = next;
  }
  const root = mapped.get(s.rootId);
  a.rootContainerIds.splice(c.placement.index, 0, root); layout.rootContainerIds.splice(c.placement.index, 0, root);
  if (bytes(payload).byteLength > ADMIN_TEMPLATE_PHOTO_TREE_COPY_LIMITS.projectionBytes) fail("limit");
  return freeze(payload);
}
export function assertAdminTemplatePhotoTreeCopyProjection(input, addedOwners, projectedPayload) {
  if (!same(projectedPayload, adminTemplatePhotoTreeCopyPayload(input, addedOwners))) fail("projection");
  return true;
}
