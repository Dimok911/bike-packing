import { isPersonalPhotoPrivateOwner } from "./personal-photo-private-owner.js";

const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const ids = values => Array.isArray(values) && values.every(id) && new Set(values).size === values.length;
const canonical = value => JSON.stringify(value && typeof value === "object"
  ? Array.isArray(value) ? value.map(entry => JSON.parse(canonical(entry)))
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);
const same = (a, b) => canonical(a) === canonical(b);
const exact = (value, keys) => plain(value) && same(Object.keys(value).sort(), [...keys].sort());

// Shared strict layout inventory for composed photo forms.
export function personalPhotoFormLayoutInventory(layout, state, fail) {
  const a = layout?.arrangement;
  if (!isPersonalPhotoPrivateOwner(layout) || layout.locked || !plain(a) || !ids(layout.rootContainerIds)
    || !ids(a.rootContainerIds) || !same(layout.rootContainerIds, a.rootContainerIds)
    || ![a.containers, a.items, a.itemQuantities, a.packedItems].every(plain)
    || state && !same(state.layouts?.[layout.id], layout)) fail();
  const containers = new Set(), items = new Set();
  const walk = (containerId, parentId) => {
    const row = a.containers[containerId];
    if (containers.has(containerId) || !plain(row) || row.parentId !== parentId || !ids(row.childIds)
      || !ids(row.itemIds) || !Array.isArray(row.order)
      || state && !isPersonalPhotoPrivateOwner(state.containers?.[containerId])) fail();
    containers.add(containerId); const ordered = new Set();
    for (const entry of row.order) {
      if (!exact(entry, ["type", "id"]) || !["item", "container"].includes(entry.type)
        || !(entry.type === "item" ? row.itemIds : row.childIds).includes(entry.id) || ordered.has(`${entry.type}:${entry.id}`)) fail();
      ordered.add(`${entry.type}:${entry.id}`);
    }
    if (ordered.size !== row.itemIds.length + row.childIds.length) fail();
    for (const itemId of row.itemIds) {
      if (items.has(itemId) || a.items[itemId] !== containerId || !Number.isSafeInteger(a.itemQuantities[itemId]) || a.itemQuantities[itemId] < 1
        || state && !isPersonalPhotoPrivateOwner(state.items?.[itemId])) fail();
      items.add(itemId);
    }
    for (const childId of row.childIds) walk(childId, containerId);
  };
  for (const root of a.rootContainerIds) walk(root, "");
  if (Object.keys(a.containers).some(key => !containers.has(key)) || Object.keys(a.items).some(key => !items.has(key))
    || Object.keys(a.itemQuantities).some(key => !items.has(key))
    || Object.entries(a.packedItems).some(([key, value]) => !items.has(key) || typeof value !== "boolean")) fail();
  return { containers, items };
}
