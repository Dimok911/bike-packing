import { stripAppliedArrangementFieldsForSync } from "./serialize.js";

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const validMap = value => object(value) && Object.entries(value).every(([id, record]) =>
  id && id === id.trim() && id.length <= 191 && !["__proto__", "prototype", "constructor"].includes(id)
  && object(record) && (!Object.hasOwn(record, "id") || record.id === id));

// The assembled API includes legacy/local display mirrors. Arrangement maps
// are authoritative; top-level packedItems and applied entity links must not
// overwrite them. This projection does NO repair, defaulting, dictionary merge,
// generated-record cleanup or photo pruning. Unknown business fields survive.
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
  stripAppliedArrangementFieldsForSync(payload);
  return payload;
}
