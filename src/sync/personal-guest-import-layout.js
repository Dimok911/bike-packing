// Portable deterministic layout part of guest import. No DOM, storage, random
// IDs, timestamps, normalization of existing owners or network file lookups.
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const ids = values => Array.isArray(values) && values.every(id) && new Set(values).size === values.length;
const sameIds = (a, b) => ids(a) && ids(b) && a.length === b.length && a.every((value, index) => value === b[index]);
const fail = () => { throw Error("Размещения гостевой укладки не совпали с зафиксированными записями. Исходная укладка сохранена."); };
const dictionary = (...lists) => [...new Set(lists.flatMap(values => Array.isArray(values) ? values : [])
  .filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean))];

export function personalGuestImportLayout({ sourcePayload, targetPayload, sourceId, targetId, name, ownerTargets, editMeta = {} }) {
  const source = sourcePayload?.layouts?.[sourceId], a = source?.arrangement;
  const quantities = a?.itemQuantities ?? {}, packedItems = a?.packedItems ?? {}, itemPlacements = a?.items ?? {};
  if (!id(sourceId) || !id(targetId) || sourceId === targetId || !plain(source) || source.id !== sourceId
    || ["adminDemo", "adminSharedSourceId", "publicCatalogLayoutId", "sharedSourceId"].some(key => source[key])
    || !plain(a) || !sameIds(source.rootContainerIds, a.rootContainerIds)
    || ![a.containers, itemPlacements, quantities, packedItems, targetPayload?.items, targetPayload?.containers, targetPayload?.layouts].every(plain)
    || Object.hasOwn(targetPayload.layouts, targetId) || typeof name !== "string" || !name.trim() || name.length > 1000
    || !Array.isArray(ownerTargets) || !plain(editMeta) || Object.entries(editMeta).some(([key, value]) =>
      !["createdAt", "updatedAt", "updatedByDeviceId", "updatedByDeviceName"].includes(key) || typeof value !== "string" || value.length > 255
      || ["createdAt", "updatedAt"].includes(key) && !Number.isFinite(Date.parse(value)))) fail();
  const maps = { item: new Map(), container: new Map() };
  for (const owner of ownerTargets) {
    if (!plain(owner) || !Object.hasOwn(maps, owner.entityType) || !id(owner.sourceId) || !id(owner.targetId)
      || maps[owner.entityType].has(owner.sourceId)) fail();
    maps[owner.entityType].set(owner.sourceId, owner.targetId);
  }
  const assigned = { item: new Set(), container: new Set() }, seen = { item: new Set(), container: new Set() };
  const targetFor = (type, sourceOwnerId) => {
    const target = maps[type].get(sourceOwnerId), collection = type === "item" ? "items" : "containers";
    if (!sourcePayload[collection]?.[sourceOwnerId] || !target || !targetPayload[collection][target]
      || sourcePayload[collection][sourceOwnerId].id !== sourceOwnerId || targetPayload[collection][target].id !== target
      || assigned[type].has(target)) fail();
    assigned[type].add(target); seen[type].add(sourceOwnerId); return target;
  };
  const arrangement = { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, itemQuantityMigrationVersion: 3, packedItems: {} };
  const walk = (sourceOwnerId, parentId, targetParentId) => {
    const placement = a.containers[sourceOwnerId];
    if (seen.container.has(sourceOwnerId) || !plain(placement) || (placement.parentId ?? "") !== parentId
      || !ids(placement.childIds) || !ids(placement.itemIds) || !Array.isArray(placement.order)) fail();
    const target = targetFor("container", sourceOwnerId), childIds = [], itemIds = [], ordered = new Set();
    for (const itemId of placement.itemIds) {
      if (seen.item.has(itemId) || Object.hasOwn(itemPlacements, itemId) && itemPlacements[itemId] !== sourceOwnerId) fail();
      const nextId = targetFor("item", itemId), quantity = quantities[itemId] ?? 1;
      if (!Number.isSafeInteger(quantity) || quantity < 1) fail();
      itemIds.push(nextId); arrangement.items[nextId] = target; arrangement.itemQuantities[nextId] = quantity;
    }
    for (const childId of placement.childIds) childIds.push(walk(childId, sourceOwnerId, target));
    const order = placement.order.map(entry => {
      if (!plain(entry) || !["item", "container"].includes(entry.type) || !id(entry.id)
        || !Object.keys(entry).every(key => ["type", "id"].includes(key))
        || !(entry.type === "item" ? placement.itemIds : placement.childIds).includes(entry.id)) fail();
      const key = `${entry.type}:${entry.id}`; if (ordered.has(key)) fail(); ordered.add(key);
      return { type: entry.type, id: maps[entry.type].get(entry.id) };
    });
    if (ordered.size !== itemIds.length + childIds.length) fail();
    arrangement.containers[target] = { parentId: targetParentId, childIds, itemIds, order }; return target;
  };
  for (const root of a.rootContainerIds) arrangement.rootContainerIds.push(walk(root, "", ""));
  if (Object.keys(a.containers).some(key => !seen.container.has(key)) || Object.keys(itemPlacements).some(key => !seen.item.has(key))
    || Object.keys(quantities).some(key => !seen.item.has(key))) fail();
  for (const [itemId, packed] of Object.entries(packedItems)) {
    if (!seen.item.has(itemId) || typeof packed !== "boolean") fail();
    if (packed) arrangement.packedItems[maps.item.get(itemId)] = true;
  }
  const detached = source.guestSharedLinkDetachedItemIds || [];
  if (!ids(detached)) fail();
  const placedItems = new Set(seen.item);
  for (const itemId of detached) if (!seen.item.has(itemId)) targetFor("item", itemId);
  const used = { locations: [], categories: [] };
  for (const [type, collection] of [["container", "containers"], ["item", "items"]]) for (const ownerId of seen[type]) {
    if (type === "item" && !placedItems.has(ownerId)) continue;
    const owner = sourcePayload[collection][ownerId]; used.locations.push(owner.location);
    used.categories.push(...(Array.isArray(owner.categories) && owner.categories.length ? owner.categories : owner.category ? [owner.category] : []));
  }
  const dictionaries = {}, layout = { ...clone(source), id: targetId, name,
    rootContainerIds: [...arrangement.rootContainerIds], arrangement, ...clone(editMeta) };
  for (const field of ["locations", "categories"]) {
    layout[field] = dictionary(source[field] || sourcePayload[field], used[field]);
    const customKey = field === "locations" ? "customLocations" : "customCategories", legacyKey = field === "locations" ? "locationDictionary" : "categoryDictionary";
    const usedValues = dictionary(used[field]), visible = dictionary(source[field], usedValues);
    const explicit = [source[customKey], source[legacyKey]].find(Array.isArray);
    dictionaries[field] = visible; dictionaries[customKey] = explicit ? dictionary(explicit) : visible.filter(value => !usedValues.includes(value));
  }
  for (const key of ["guestDemoCopy", "demoSourceLanguage", "guestDemoCopyCreatedAt", "guestSharedLinkCopyTarget"]) delete layout[key];
  if (detached.length) layout.guestSharedLinkDetachedItemIds = detached.map(id => maps.item.get(id));
  return { layout, dictionaries };
}
