// Inventory is independent of the legacy quantity and every layout's plan.
export function normalizeStockQuantity(value) {
  if (value === undefined || value === null || value === "") return 1;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 1;
}

export function itemStockQuantity(item) {
  if ((item?.stockQuantity === undefined || item?.stockQuantity === null || item?.stockQuantity === "") && isLegacyPurchaseLocation(item?.location)) return 0;
  return normalizeStockQuantity(item?.stockQuantity);
}

export function isLegacyPurchaseLocation(value) {
  return ["надо купить", "need to buy"].includes(String(value || "").trim().toLowerCase());
}

export function migrateLegacyPurchaseLocations(targetState) {
  const isPrivate = (record) => !record?.adminDemo && !record?.adminSharedSourceId && !record?.publicCatalogLayoutId;
  for (const item of Object.values(targetState.items || {})) {
    if (!isPrivate(item) || !isLegacyPurchaseLocation(item.location)) continue;
    item.stockQuantity = itemStockQuantity(item);
    item.location = String(item.location).trim().toLowerCase() === "need to buy" ? "Unknown location" : "Не знаю где";
  }
  for (const container of Object.values(targetState.containers || {})) {
    if (isPrivate(container) && isLegacyPurchaseLocation(container.location)) container.location = String(container.location).trim().toLowerCase() === "need to buy" ? "Unknown location" : "Не знаю где";
  }
  for (const owner of [targetState, ...Object.values(targetState.layouts || {}).filter(isPrivate)]) {
    for (const key of ["locations", "customLocations", "locationDictionary"]) {
      if (Array.isArray(owner[key])) owner[key] = owner[key].filter((value) => !isLegacyPurchaseLocation(value));
    }
  }
}

export function stripPrivateInventory(record) {
  delete record.stockQuantity;
  return record;
}

export function setItemStockQuantity(item, value) {
  if (!item) return false;
  const quantity = Number(value);
  if (value === "" || value === null || !Number.isSafeInteger(quantity) || quantity < 0) return false;
  if (item.stockQuantity === quantity) return false;
  item.stockQuantity = quantity;
  return true;
}

export function addPurchasedStock(item, value) {
  const count = Number(value);
  const total = itemStockQuantity(item) + count;
  if (!item || !Number.isSafeInteger(count) || count <= 0 || !Number.isSafeInteger(total)) return false;
  return setItemStockQuantity(item, total);
}
