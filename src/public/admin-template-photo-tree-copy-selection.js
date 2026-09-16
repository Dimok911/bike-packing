import { canonicalTemplateJson as canonical, validTemplateOperationId } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";
import { assertAdminTemplatePhotoView } from "../sync/admin-template-photo-view.js";
import { adminTemplatePhotoCopyReference } from "../sync/admin-template-photo-copy-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_TREE_COPY_LIMITS as limits } from "../sync/admin-template-photo-tree-copy-protocol.js";

const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const clone = value => JSON.parse(canonical(value)), same = (left, right) => canonical(left) === canonical(right);
const id = value => typeof value === "string" && value.length <= 191 && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const ids = value => Array.isArray(value) && value.every(id) && new Set(value).size === value.length;
const positive = value => Number.isSafeInteger(value) && value > 0;
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const fail = () => { throw Object.assign(Error("Выбранное дерево и его идентификаторы требуют сверки. Новая копия не создана."),
  { code: "admin-template-photo-tree-copy-selection", isAdminTemplateBlocked: true }); };
const types = ["items", "containers"], collections = ["layouts", ...types];

function sideInventory(side, expectedBinding, occupied, localIds) {
  if (!exact(side, ["layoutId", "ownerMap", "beforeState", "metadata"]) || !id(side.layoutId)
    || !exact(side.metadata, ["title", "description", "language"])) fail();
  const { layoutId, ownerMap: map, beforeState: state } = side;
  if (!exact(state, ["activeLayoutId", "layouts", "items", "containers", "locations", "categories", "packedItems"])
    || state.activeLayoutId !== layoutId || !collections.every(type => plain(state[type]))
    || Object.keys(state.layouts).length !== 1 || state.layouts[layoutId]?.id !== layoutId) fail();
  const layout = state.layouts[layoutId], source = layout.adminCausalSource;
  if (!plain(source) || source.version !== 1 || !same(adminTemplatePhotoActionBinding(source.binding), expectedBinding)
    || source.exists !== true || source.visibility !== "private" || source.deleted || source.planId
    || !exact(source.base, ["stateRevision"]) || !positive(source.base.stateRevision)
    || ["treePending", "photoTreeCopyPending"].some(key => Object.hasOwn(source, key))
    || ["photoAppendPending", "photoEditPending", "photoCreatePending", "photoCopyPending"].some(key => source[key])
    || Object.hasOwn(layout, "templateDraftSyncPending") && layout.templateDraftSyncPending !== false) fail();
  if (!exact(map, ["version", "binding", "layoutId", "stateRevision", "owners"]) || map.version !== 1
    || !same(map.binding, expectedBinding) || map.layoutId !== layoutId || map.stateRevision !== source.base.stateRevision
    || !Array.isArray(map.owners) || Object.hasOwn(source, "photoOwnerMap") && !same(map, source.photoOwnerMap)) fail();
  const byLocal = new Map(), serverIds = new Set();
  for (const type of collections) for (const [key, row] of Object.entries(state[type])) {
    if (!id(key) || !plain(row) || row.id !== key || localIds.has(key)
      || type !== "layouts" && row.publicCatalogLayoutId !== layoutId) fail();
    localIds.add(key); occupied.add(key);
  }
  for (const owner of map.owners) {
    if (!exact(owner, ["type", "localId", "serverId"]) || !types.includes(owner.type) || !id(owner.localId) || !id(owner.serverId)
      || !Object.hasOwn(state[owner.type], owner.localId) || byLocal.has(owner.localId) || serverIds.has(owner.serverId)) fail();
    byLocal.set(owner.localId, owner); serverIds.add(owner.serverId); occupied.add(owner.serverId);
  }
  if (types.some(type => Object.keys(state[type]).some(key => !byLocal.has(key) || byLocal.get(key).type !== type))) fail();
  assertAdminTemplatePhotoView({ binding: expectedBinding, layoutId, baseline: source.photoView, state });
  const photos = new Map();
  for (const owner of source.photoView?.owners || []) {
    const mapped = byLocal.get(owner.localId);
    if (!mapped || mapped.type !== owner.type || mapped.serverId !== owner.serverId) fail();
    photos.set(owner.localId, owner.rawPhotos);
    for (const photo of owner.rawPhotos) {
      occupied.add(photo.id ?? photo.photoId); if (photo.assetId) occupied.add(photo.assetId);
    }
  }
  return { layout, source, state, byLocal, photos };
}

function selectedOwners(inventory, rootId) {
  const { layout, state, byLocal } = inventory, a = layout.arrangement, visited = new Set(), owners = [];
  if (!id(rootId) || !plain(a) || !ids(a.rootContainerIds) || !a.rootContainerIds.includes(rootId)
    || !plain(a.containers) || !plain(a.items) || !plain(a.itemQuantities) || !plain(a.packedItems)) fail();
  const add = (type, key) => {
    const owner = byLocal.get(key), row = state[type]?.[key];
    if (!owner || owner.type !== type || visited.has(key) || !plain(row)) fail();
    if (type === "items" && Object.hasOwn(row, "availabilityStatus") && ![null, "", "available"].includes(row.availabilityStatus)) fail();
    visited.add(key); owners.push(owner); if (owners.length > limits.owners) fail();
  };
  const walk = (key, parent, depth) => {
    if (depth > limits.depth) fail(); add("containers", key);
    const row = a.containers[key];
    if (!plain(row) || row.parentId !== parent || !ids(row.childIds) || !ids(row.itemIds)
      || !Array.isArray(row.order) || row.order.length !== row.childIds.length + row.itemIds.length) fail();
    const seen = new Set();
    for (const entry of row.order) {
      if (!exact(entry, ["type", "id"]) || !["container", "item"].includes(entry.type) || seen.has(entry.id)
        || !(entry.type === "item" ? row.itemIds : row.childIds).includes(entry.id)) fail();
      seen.add(entry.id);
    }
    for (const item of row.itemIds) {
      if (a.items[item] !== key || !positive(a.itemQuantities[item])) fail(); add("items", item);
    }
    for (const child of row.childIds) walk(child, key, depth + 1);
  };
  walk(rootId, "", 1);
  // A selected closure cannot omit a child/placed item, or also belong to an
  // outside parent. Opaque values are not schema references and stay untouched.
  if (a.rootContainerIds.some(key => key !== rootId && visited.has(key))) fail();
  for (const [key, row] of Object.entries(a.containers)) if (!visited.has(key) && plain(row)) {
    if (visited.has(row.parentId) || [...(row.childIds || []), ...(row.itemIds || [])].some(child => visited.has(child))
      || (row.order || []).some(entry => visited.has(entry?.id))) fail();
  }
  for (const [key, parent] of Object.entries(a.items)) if (visited.has(parent) && !visited.has(key)) fail();
  return owners.sort((left, right) => {
    const a = `${left.type === "items" ? "item" : "container"}:${left.serverId}`;
    const b = `${right.type === "items" ? "item" : "container"}:${right.serverId}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

// Synchronous allocation only: no persistence, hashing, server/file authority
// or normalizing snapshots. The caller supplies global occupied IDs, including
// raw layout IDs absent from ownerMap, and appends exact source/target payloads
// before prepareAdminTemplatePhotoTreeCopyForm performs the full record proof.
export function allocateAdminTemplatePhotoTreeCopySelection(input, { newUuid = () => crypto.randomUUID() } = {}) {
  try {
    const value = clone(input);
    if (!exact(value, ["binding", "source", "target", "sourceRootLocalId", "fields", "placementIndex", "occupiedIds"])
      || !ids(value.occupiedIds) || typeof newUuid !== "function") fail();
    const binding = adminTemplatePhotoActionBinding(value.binding), occupied = new Set(value.occupiedIds), locals = new Set();
    const sourceBinding = adminTemplatePhotoActionBinding(value.source?.beforeState?.layouts?.[value.source?.layoutId]?.adminCausalSource?.binding);
    if (sourceBinding.actorId !== binding.actorId || sourceBinding.environment !== binding.environment || sourceBinding.listId === binding.listId) fail();
    const source = sideInventory(value.source, sourceBinding, occupied, locals), target = sideInventory(value.target, binding, occupied, locals);
    if (!plain(target.layout.arrangement) || !ids(target.layout.arrangement.rootContainerIds) || target.layout.locked
      || !Number.isSafeInteger(value.placementIndex) || value.placementIndex < 0 || value.placementIndex > target.layout.arrangement.rootContainerIds.length) fail();
    const f = value.fields;
    if (!exact(f, ["name", "createdAt", "updatedAt", "updatedByDeviceId", "updatedByDeviceName"])
      || typeof f.name !== "string" || !f.name.trim() || f.name !== f.name.trim() || f.name.length > 255
      || ["createdAt", "updatedAt"].some(key => typeof f[key] !== "string" || f[key].length > 64 || !Number.isFinite(Date.parse(f[key])))
      || typeof f.updatedByDeviceId !== "string" || f.updatedByDeviceId.length > 128
      || typeof f.updatedByDeviceName !== "string" || f.updatedByDeviceName.length > 255) fail();
    const owners = selectedOwners(source, value.sourceRootLocalId), rawPhotos = owners.map(owner => source.photos.get(owner.localId) || []);
    const photoCount = rawPhotos.reduce((count, photos) => count + photos.length, 0);
    if (!photoCount || photoCount > limits.photos) fail();
    for (const photos of rawPhotos) for (const photo of photos) adminTemplatePhotoCopyReference(photo, sourceBinding.listId);
    const allocate = () => {
      const next = newUuid();
      if (next && typeof next.then === "function") { Promise.resolve(next).catch(() => {}); fail(); }
      if (!validTemplateOperationId(next) || occupied.has(next)) fail(); occupied.add(next); return next;
    };
    const operationId = allocate(), copiedOwners = [], photos = [];
    for (const [index, owner] of owners.entries()) {
      const serverId = allocate(), localId = allocate();
      copiedOwners.push({ entityType: owner.type === "items" ? "item" : "container", sourceLocalId: owner.localId, localId, serverId });
      photos.push(rawPhotos[index].map(photo => ({ sourcePhotoId: photo.id ?? photo.photoId, photoId: allocate(), assetId: allocate() })));
    }
    return freeze({ binding, operationId, snapshot: { version: 1, source: value.source, target: value.target, copiedOwners },
      sourceRootLocalId: value.sourceRootLocalId, placementIndex: value.placementIndex, fields: f, photos });
  } catch { fail(); }
}
