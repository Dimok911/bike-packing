import { normalizeManufacturerBagCatalogOverride } from "../state/manufacturer-bag-catalog.js";

export const MANUFACTURER_BAG_CATALOG_OVERRIDES_KEY = "manufacturer-bag-catalog-admin-overrides-v1";

export function readManufacturerBagCatalogOverrides(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(MANUFACTURER_BAG_CATALOG_OVERRIDES_KEY) || "[]");
    return (Array.isArray(parsed) ? parsed : [])
      .map(normalizeManufacturerBagCatalogOverride)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function writeManufacturerBagCatalogOverride(entry, storage = globalThis.localStorage) {
  const normalized = normalizeManufacturerBagCatalogOverride(entry);
  if (!normalized) return [];
  const current = readManufacturerBagCatalogOverrides(storage);
  const next = [...current.filter((item) => item.id !== normalized.id), normalized];
  storage?.setItem?.(MANUFACTURER_BAG_CATALOG_OVERRIDES_KEY, JSON.stringify(next));
  return next;
}
