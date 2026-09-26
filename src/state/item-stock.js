// Inventory is independent of the legacy quantity and every layout's plan.
export function normalizeStockQuantity(value) {
  if (value === undefined || value === null || value === "") return 1;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 1;
}

export function itemStockQuantity(item) {
  if (Array.isArray(item?.stockLocations) && item.stockLocations.length) {
    return itemStockLocations(item).reduce((total, row) => total + row.quantity, 0);
  }
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
  delete record.stockLocations;
  return record;
}

export function setItemStockQuantity(item, value) {
  if (!item) return false;
  const quantity = Number(value);
  if (value === "" || value === null || !Number.isSafeInteger(quantity) || quantity < 0) return false;
  const rows = itemStockLocations(item);
  // Changing an aggregate cannot identify which place was consumed/replenished.
  if (rows.length !== 1 || rows[0].quantity === quantity) return false;
  return setItemStockLocations(item, [{ ...rows[0], quantity }]);
}

export function addPurchasedStock(item, value, location) {
  const count = Number(value);
  const total = itemStockQuantity(item) + count;
  if (!item || !Number.isSafeInteger(count) || count <= 0 || !Number.isSafeInteger(total)) return false;
  const rows = itemStockLocations(item);
  if (location === undefined && rows.length > 1) return false;
  const target = String(location ?? rows[0].location).trim();
  const row = rows.find((entry) => entry.location === target);
  if (row) row.quantity += count;
  else rows.push({ location: target, quantity: count });
  return setItemStockLocations(item, rows);
}

export function normalizeStockLocations(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const result = [];
  let total = 0;
  for (const row of rows) {
    if (!row || typeof row.location !== "string" || row.quantity === "" || row.quantity === null) return null;
    const quantity = Number(row.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(total + quantity)) return null;
    total += quantity;
    const location = row.location.trim();
    const existing = result.find((entry) => entry.location === location);
    if (existing) existing.quantity += quantity;
    else result.push({ location, quantity });
  }
  return result;
}

export function itemStockLocations(item) {
  const rows = normalizeStockLocations(item?.stockLocations);
  if (rows) return rows;
  const location = String(item?.location || "").trim();
  const missing = item?.stockQuantity === undefined || item?.stockQuantity === null || item?.stockQuantity === "";
  return [{ location, quantity: missing && isLegacyPurchaseLocation(location) ? 0 : normalizeStockQuantity(item?.stockQuantity) }];
}

export function itemStorageLocations(item) {
  return itemStockLocations(item).map((row) => row.location).filter(Boolean);
}

export function setItemStockLocations(item, rows) {
  const normalized = normalizeStockLocations(rows);
  if (!item || !normalized) return false;
  const total = normalized.reduce((sum, row) => sum + row.quantity, 0);
  const changed = JSON.stringify(item.stockLocations) !== JSON.stringify(normalized) || item.stockQuantity !== total || item.location !== normalized[0].location;
  item.stockLocations = normalized;
  item.stockQuantity = total;
  item.location = normalized[0].location;
  return changed;
}

export function moveItemStock(item, from, to, value) {
  const count = Number(value);
  if (!item || from === to || !Number.isSafeInteger(count) || count <= 0) return false;
  const rows = itemStockLocations(item);
  const source = rows.find((row) => row.location === from);
  if (!source || source.quantity < count) return false;
  source.quantity -= count;
  const target = rows.find((row) => row.location === to);
  if (target) target.quantity += count;
  else rows.push({ location: String(to || "").trim(), quantity: count });
  return setItemStockLocations(item, rows);
}

export function renameItemStockLocation(item, from, to) {
  if (!itemStorageLocations(item).includes(from) && item?.location !== from) return false;
  // Keep unrelated legacy records untouched; only inventory-bearing records need a distribution.
  if (!Array.isArray(item.stockLocations)) { item.location = to; return true; }
  return setItemStockLocations(item, itemStockLocations(item).map((row) => ({ ...row, location: row.location === from ? to : row.location })));
}
