const COPY_SUFFIX = /\s+(?:copy|копия)(?:\s+\d+)?$/iu;

export function catalogDuplicateName(name) {
  let value = String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  while (COPY_SUFFIX.test(value)) value = value.replace(COPY_SUFFIX, "").trim();
  return value;
}

export function catalogDuplicateIds(records = []) {
  const groups = new Map();
  const result = new Set();
  for (const record of records) {
    if (!record?.id) continue;
    const name = catalogDuplicateName(record.name);
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(record.id);
    if (COPY_SUFFIX.test(String(record.name || "").trim())) result.add(record.id);
  }
  for (const ids of groups.values()) {
    if (ids.length > 1) ids.forEach((id) => result.add(id));
  }
  return result;
}

export function filterCatalogDuplicates(records, enabled = false) {
  if (!enabled) return records;
  const ids = catalogDuplicateIds(records);
  return records.filter((record) => ids.has(record.id));
}
