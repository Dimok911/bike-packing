const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const validMap = value => object(value) && Object.entries(value).every(([id, record]) =>
  id && id === id.trim() && id.length <= 191 && !["__proto__", "prototype", "constructor"].includes(id)
  && object(record) && (!Object.hasOwn(record, "id") || record.id === id));

// Shared with the API. Arrangement maps are authoritative; top-level packed
// state and applied entity links are display mirrors. This projection does NO
// repair, defaulting, dictionary merge, generated-record cleanup or photo
// pruning. Unknown business fields and the complete arrangements survive.
export function personalBusinessPayload(value) {
  if (!object(value) || ![value.items, value.containers, value.layouts].every(validMap)
    || Object.values(value.layouts).some(layout => !object(layout.arrangement)
      || !object(layout.arrangement.items) || !object(layout.arrangement.containers)
      || !object(layout.arrangement.packedItems) || !Array.isArray(layout.arrangement.rootContainerIds))) {
    throw new Error("Серверная версия не содержит подтверждённую структуру укладок.");
  }
  const payload = JSON.parse(JSON.stringify(value));
  for (const key of ["collapsedContainers", "itemDisplayMode", "showItemMeta", "showFilterContext", "collectionMode", "showOnlyUnpacked", "packedItems", "activeLayoutId"]) {
    delete payload[key];
  }
  for (const item of Object.values(payload.items)) {
    delete item.containerId;
    delete item.parentContainerId;
  }
  for (const container of Object.values(payload.containers)) {
    for (const key of ["parentId", "parentContainerId", "containerId", "itemIds", "childIds", "order"]) delete container[key];
  }
  return payload;
}
