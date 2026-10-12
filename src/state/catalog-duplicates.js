const COPY_SUFFIX = /\s+(?:copy|копия)(?:\s+\d+)?$/iu;
const normalizedText = (value) => String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

export function isBrokenCatalogItem(record) {
  return normalizedText(record?.availabilityStatus) === "broken";
}

function duplicateSignature(record) {
  const categories = [...new Set((Array.isArray(record.categories) ? record.categories : [record.category])
    .map(normalizedText).filter(Boolean))].sort();
  const dimensions = Object.entries(record.dimensions || {}).map(([key, value]) => [key, Number(value) || 0])
    .filter(([, value]) => value !== 0).sort(([a], [b]) => a.localeCompare(b));
  // Compare existing photo references, not filenames/dimensions or visual similarity.
  // Duplicate remote records can have different IDs while retaining the same URL.
  const photos = (Array.isArray(record.photos) ? record.photos : []).map((photo) => String(photo?.url || photo?.fileUrl || photo?.file_url
    || photo?.src || photo?.thumbUrl || photo?.thumb_url || photo?.localId || photo?.id || `unknown:${record.id}`)).sort();
  return JSON.stringify([
    catalogDuplicateName(record.name), Number(record.weight) || 0, dimensions,
    normalizedText(record.color), categories, normalizedText(record.note), photos,
    normalizedText(record.availabilityStatus) || "available", Boolean(record.nestable)
  ]);
}

export function catalogDuplicateName(name) {
  let value = String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  while (COPY_SUFFIX.test(value)) value = value.replace(COPY_SUFFIX, "").trim();
  return value;
}

export function catalogDuplicateGroups(records = [], matchesRecord = () => true) {
  const groups = new Map();
  for (const record of records) {
    if (!record?.id || isBrokenCatalogItem(record)) continue;
    const name = catalogDuplicateName(record.name);
    if (!name) continue;
    const signature = duplicateSignature(record);
    if (!groups.has(signature)) groups.set(signature, new Map());
    groups.get(signature).set(record.id, record);
  }
  return [...groups.values()].filter((group) => group.size > 1)
    .map((group) => [...group.values()]).filter((group) => group.some(matchesRecord));
}

export function catalogDuplicateIds(records = []) {
  return new Set(catalogDuplicateGroups(records).flat().map((record) => record.id));
}

export function filterCatalogDuplicates(records, enabled = false) {
  if (!enabled) return records;
  const ids = catalogDuplicateIds(records);
  return records.filter((record) => ids.has(record.id));
}
