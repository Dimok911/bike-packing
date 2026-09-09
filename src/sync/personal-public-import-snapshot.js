import { personalGuestBusinessPayload } from "./personal-guest-import-plan.js";

const clone = value => JSON.parse(JSON.stringify(value));

// A public legacy record may omit optional fields. Rendering can supply UI
// defaults, but a copy cannot silently turn those defaults into business data.
// Retain only the established display/placement mirrors from the normalized
// view, and take every business field (including absence) from the exact plan.
export function personalPublicImportSnapshot(payload, view) {
  const result = personalGuestBusinessPayload(payload);
  for (const key of ["collapsedContainers", "itemDisplayMode", "showItemMeta", "showFilterContext", "collectionMode", "showOnlyUnpacked", "packedItems", "activeLayoutId"])
    if (Object.hasOwn(view, key)) result[key] = clone(view[key]);
  for (const [collection, keys] of [["items", ["containerId", "parentContainerId"]],
    ["containers", ["parentId", "parentContainerId", "containerId", "childIds", "itemIds", "order"]]]) {
    for (const [id, owner] of Object.entries(result[collection])) {
      if (!view[collection]?.[id]) throw Error("Подготовленный владелец отсутствует на экране копии.");
      for (const key of keys) if (Object.hasOwn(view[collection][id], key)) owner[key] = clone(view[collection][id][key]);
    }
  }
  return result;
}
