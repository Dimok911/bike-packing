const DEFAULT_LOCALE = "ru";

export function sortCatalogRecords(records, sortMode, {
  createdTime = () => 0,
  locale = DEFAULT_LOCALE
} = {}) {
  const sorted = [...records];
  if (sortMode === "asc") {
    return sorted.sort((a, b) => recordName(a).localeCompare(recordName(b), locale));
  }
  if (sortMode === "desc") {
    return sorted.sort((a, b) => recordName(b).localeCompare(recordName(a), locale));
  }
  return sorted.sort((a, b) => createdTime(b) - createdTime(a));
}

function recordName(record) {
  return String(record?.name || "");
}
