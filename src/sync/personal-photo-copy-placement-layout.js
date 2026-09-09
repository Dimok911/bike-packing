import { isPersonalPhotoPrivateOwner } from "./personal-photo-private-owner.js";

// Pure compiler, mirrored byte-for-byte in the API repository.
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const ids = value => Array.isArray(value) && value.every(id) && new Set(value).size === value.length;
const canonical = value => JSON.stringify(value && typeof value === "object"
  ? Array.isArray(value) ? value.map(entry => JSON.parse(canonical(entry)))
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);
const same = (a, b) => canonical(a) === canonical(b);
const privateRecord = isPersonalPhotoPrivateOwner;
const fail = () => { throw Object.assign(Error("Вещь или выбранное место копии изменились. Копирование остановлено."), { code: "photo-copy-placement" }); };

// One item copy and its destination are one action. The selected layout is a
// complete immutable read set; applying it never repairs or removes other links.
export function personalPhotoCopyPlacementLayout(body, state = null) {
  const placement = body?.copyPlacement, owner = body?.owners?.[0], original = owner?.copySource?.payload;
  if (!plain(placement) || placement.version !== 1 || Object.hasOwn(body, "copyTree")
    || Object.keys(placement).some(key => !["version", "targetLayout", "targetContainerId", "targetIndex", "layoutFields"].includes(key))
    || !id(placement.targetContainerId) || placement.targetIndex !== null && (!Number.isSafeInteger(placement.targetIndex) || placement.targetIndex < 0)
    || !plain(placement.layoutFields) || Object.keys(placement.layoutFields).some(key => !["updatedAt", "updatedByDeviceId", "updatedByDeviceName"].includes(key))
    || Object.values(placement.layoutFields).some(value => typeof value !== "string" || value.length > 255)
    || !Array.isArray(body.owners) || body.owners.length !== 1 || owner.entityType !== "item" || !id(owner.entityId)
    || owner.copySource?.entityType !== "item" || !id(owner.copySource.entityId) || owner.entityId === owner.copySource.entityId
    || !privateRecord(original) || original.id !== owner.copySource.entityId) fail();
  const target = placement.targetLayout, a = target?.arrangement;
  if (!privateRecord(target) || !id(target.id) || target.locked || !plain(a) || !ids(target.rootContainerIds)
    || !ids(a.rootContainerIds) || !same(target.rootContainerIds, a.rootContainerIds)
    || ![a.containers, a.items, a.itemQuantities, a.packedItems].every(plain)
    || state && (!same(state.layouts?.[target.id], target) || !same(state.items?.[original.id], original)
      || ["items", "containers", "layouts"].some(field => Object.hasOwn(state[field] || {}, owner.entityId)))) fail();
  const containers = new Set(), items = new Set();
  const walk = (containerId, parentId) => {
    const row = a.containers[containerId];
    if (containers.has(containerId) || !plain(row) || row.parentId !== parentId || !ids(row.childIds) || !ids(row.itemIds)
      || !Array.isArray(row.order) || state && !privateRecord(state.containers?.[containerId])) fail();
    containers.add(containerId); const ordered = new Set();
    for (const entry of row.order) {
      if (!plain(entry) || Object.keys(entry).some(key => !["type", "id"].includes(key)) || !["item", "container"].includes(entry.type)
        || !(entry.type === "item" ? row.itemIds : row.childIds).includes(entry.id) || ordered.has(`${entry.type}:${entry.id}`)) fail();
      ordered.add(`${entry.type}:${entry.id}`);
    }
    if (ordered.size !== row.itemIds.length + row.childIds.length) fail();
    for (const itemId of row.itemIds) {
      if (items.has(itemId) || a.items[itemId] !== containerId || !Number.isSafeInteger(a.itemQuantities[itemId]) || a.itemQuantities[itemId] < 1
        || state && !privateRecord(state.items?.[itemId])) fail();
      items.add(itemId);
    }
    for (const childId of row.childIds) walk(childId, containerId);
  };
  for (const root of a.rootContainerIds) walk(root, "");
  if (!containers.has(placement.targetContainerId) || items.has(owner.entityId) || containers.has(owner.entityId)
    || Object.keys(a.containers).some(key => !containers.has(key)) || Object.keys(a.items).some(key => !items.has(key))
    || Object.keys(a.itemQuantities).some(key => !items.has(key))
    || Object.entries(a.packedItems).some(([key, value]) => !items.has(key) || typeof value !== "boolean")) fail();
  const layout = clone(target), arrangement = layout.arrangement, row = arrangement.containers[placement.targetContainerId];
  row.itemIds.push(owner.entityId);
  row.order.splice(placement.targetIndex === null ? row.order.length : Math.min(placement.targetIndex, row.order.length), 0, { type: "item", id: owner.entityId });
  arrangement.items[owner.entityId] = placement.targetContainerId;
  // Existing item duplication starts with the catalog quantity. Packing and
  // another layout's quantity belong to their existing placements.
  arrangement.itemQuantities[owner.entityId] = Math.max(1, Math.round(Number(original.quantity) || 1));
  if (!Number.isSafeInteger(arrangement.itemQuantities[owner.entityId])) fail();
  delete arrangement.packedItems[owner.entityId]; Object.assign(layout, clone(placement.layoutFields));
  return { layout, targetLayoutId: layout.id, itemId: owner.entityId, targetContainerId: placement.targetContainerId };
}
