import { isPersonalPhotoPrivateOwner } from "./personal-photo-private-owner.js";

// Pure placement compiler, mirrored byte-for-byte in the API repository.
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
const fail = () => { throw Object.assign(Error("Исходная ветка или место копии изменились. Копирование остановлено."), { code: "photo-copy-tree" }); };

// Every source owner is already frozen in copy-batch. The two full layouts
// freeze topology, order, quantities and destination separately from catalog
// fields. Numeric list CAS and owner revisions are checked by the caller.
export function personalPhotoTreeCopyLayout(body, state = null) {
  const tree = body?.copyTree;
  if (!plain(tree) || tree.version !== 1 || !id(tree.rootId) || typeof tree.includeContents !== "boolean"
    || Object.keys(tree).some(key => !["version", "rootId", "includeContents", "sourceLayout", "targetLayout", "targetParentId", "targetIndex", "layoutFields"].includes(key))
    || typeof tree.targetParentId !== "string" || tree.targetParentId && !id(tree.targetParentId)
    || tree.targetIndex !== null && (!Number.isSafeInteger(tree.targetIndex) || tree.targetIndex < 0)
    || !plain(tree.layoutFields) || Object.keys(tree.layoutFields).some(key => !["updatedAt", "updatedByDeviceId", "updatedByDeviceName"].includes(key))
    || Object.values(tree.layoutFields).some(value => typeof value !== "string" || value.length > 255)
    || !Array.isArray(body.owners) || !body.owners.length || body.owners.length > 50) fail();
  if (tree.sourceLayout === null && tree.includeContents) fail();
  for (const layout of tree.sourceLayout === null ? [tree.targetLayout] : [tree.sourceLayout, tree.targetLayout]) {
    if (!privateRecord(layout) || !id(layout.id) || !plain(layout.arrangement) || !ids(layout.rootContainerIds)
      || !ids(layout.arrangement.rootContainerIds) || !plain(layout.arrangement.containers) || !plain(layout.arrangement.items)
      || !plain(layout.arrangement.itemQuantities) || !plain(layout.arrangement.packedItems)
      || state && (!privateRecord(state.layouts?.[layout.id]) || !same(state.layouts[layout.id], layout))) fail();
  }
  if (tree.targetLayout.locked || tree.sourceLayout?.id === tree.targetLayout.id && !same(tree.sourceLayout, tree.targetLayout)) fail();
  const containers = new Map(), items = new Map(), targets = new Set();
  for (const owner of body.owners) {
    if (!["item", "container"].includes(owner?.entityType) || !id(owner.entityId) || !id(owner.copySource?.entityId)
      || owner.entityId === owner.copySource.entityId || targets.has(owner.entityId)) fail();
    const map = owner.entityType === "item" ? items : containers;
    if (map.has(owner.copySource.entityId)) fail();
    map.set(owner.copySource.entityId, owner.entityId); targets.add(owner.entityId);
  }
  if ([...targets].some(target => containers.has(target) || items.has(target))) fail();
  const selectedContainers = new Set(), selectedItems = new Set(), placements = {}, itemPlacements = {}, quantities = {};
  const source = tree.sourceLayout?.arrangement || { containers: { [tree.rootId]: { parentId: "", childIds: [], itemIds: [], order: [] } }, items: {}, itemQuantities: {} };
  const walk = (sourceId, parentId) => {
    const original = source.containers[sourceId], targetId = containers.get(sourceId);
    const placement = tree.includeContents ? original : original && { ...original, childIds: [], itemIds: [], order: [] };
    if (!targetId || selectedContainers.has(sourceId) || !plain(placement) || !ids(placement.childIds) || !ids(placement.itemIds)
      || !Array.isArray(placement.order) || parentId !== null && placement.parentId !== parentId) fail();
    selectedContainers.add(sourceId);
    const orderKeys = new Set();
    for (const row of placement.order) {
      if (!plain(row) || Object.keys(row).some(key => !["type", "id"].includes(key)) || !["item", "container"].includes(row.type)
        || !(row.type === "item" ? placement.itemIds : placement.childIds).includes(row.id) || orderKeys.has(`${row.type}:${row.id}`)) fail();
      orderKeys.add(`${row.type}:${row.id}`);
    }
    for (const itemId of placement.itemIds) {
      if (!items.has(itemId) || selectedItems.has(itemId) || source.items[itemId] !== sourceId) fail();
      selectedItems.add(itemId); itemPlacements[items.get(itemId)] = targetId;
      const quantity = source.itemQuantities[itemId];
      if (!Number.isSafeInteger(quantity) || quantity < 1) fail();
      quantities[items.get(itemId)] = quantity;
    }
    // Omitted source links cannot be hidden by an incomplete itemIds/childIds.
    if (tree.includeContents && (Object.entries(source.items).some(([itemId, containerId]) => containerId === sourceId && !placement.itemIds.includes(itemId))
      || Object.entries(source.containers).some(([childId, value]) => value?.parentId === sourceId && !placement.childIds.includes(childId)))) fail();
    for (const childId of placement.childIds) walk(childId, sourceId);
    const order = [...placement.order,
      ...placement.itemIds.filter(itemId => !orderKeys.has(`item:${itemId}`)).map(itemId => ({ type: "item", id: itemId })),
      ...placement.childIds.filter(childId => !orderKeys.has(`container:${childId}`)).map(childId => ({ type: "container", id: childId }))];
    placements[targetId] = { parentId: parentId === null ? tree.targetParentId : containers.get(parentId),
      childIds: placement.childIds.map(childId => containers.get(childId)), itemIds: placement.itemIds.map(itemId => items.get(itemId)),
      order: order.map(row => ({ type: row.type, id: (row.type === "item" ? items : containers).get(row.id) })) };
  };
  walk(tree.rootId, null);
  if (selectedContainers.size !== containers.size || selectedItems.size !== items.size) fail();
  const layout = clone(tree.targetLayout), arrangement = layout.arrangement, rootId = containers.get(tree.rootId);
  if ([...targets].some(target => Object.hasOwn(arrangement.containers, target) || Object.hasOwn(arrangement.items, target)
    || arrangement.rootContainerIds.includes(target) || layout.rootContainerIds.includes(target))) fail();
  if (tree.targetParentId && (!plain(arrangement.containers[tree.targetParentId])
    || state && !privateRecord(state.containers?.[tree.targetParentId]))) fail();
  Object.assign(arrangement.containers, placements); Object.assign(arrangement.items, itemPlacements); Object.assign(arrangement.itemQuantities, quantities);
  if (tree.targetParentId) {
    const parent = arrangement.containers[tree.targetParentId];
    if (!ids(parent.childIds) || !Array.isArray(parent.order)) fail();
    parent.childIds.push(rootId);
    parent.order.splice(tree.targetIndex === null ? parent.order.length : Math.min(tree.targetIndex, parent.order.length), 0, { type: "container", id: rootId });
  } else {
    const roots = [...new Set([...layout.rootContainerIds, ...arrangement.rootContainerIds])];
    roots.splice(tree.targetIndex === null ? roots.length : Math.min(tree.targetIndex, roots.length), 0, rootId);
    arrangement.rootContainerIds = roots; layout.rootContainerIds = [...roots];
  }
  Object.assign(layout, clone(tree.layoutFields));
  return { layout, rootId, targetLayoutId: layout.id,
    sources: { containers: [...selectedContainers], items: [...selectedItems] } };
}
