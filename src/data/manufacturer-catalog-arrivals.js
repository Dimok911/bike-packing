// Publication dates are maintained with the approved catalog, never from scan dates.
export function isRecentManufacturerModel(entry, now = Date.now()) {
  const published = Date.parse(entry?.catalogPublishedAt || "");
  const elapsed = Number(now) - published;
  return Number.isFinite(published) && elapsed >= 0 && elapsed < 30 * 24 * 60 * 60 * 1000;
}

export function recentManufacturerModelCount(entries, filters = {}, now = Date.now()) {
  return entries.filter((entry) => isRecentManufacturerModel(entry, now)
    && Object.entries(filters).every(([key, value]) => !value || entry[key] === value)).length;
}
