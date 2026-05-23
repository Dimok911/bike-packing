const DEFAULT_LOCALE = "ru";

export function sortCatalogRecords(records, sortMode, {
  createdTime = () => 0,
  name = recordName,
  locale = DEFAULT_LOCALE
} = {}) {
  const sorted = [...records];
  if (sortMode === "asc") {
    return sorted.sort((a, b) => String(name(a) || "").localeCompare(String(name(b) || ""), locale));
  }
  if (sortMode === "desc") {
    return sorted.sort((a, b) => String(name(b) || "").localeCompare(String(name(a) || ""), locale));
  }
  return sorted.sort((a, b) => createdTime(b) - createdTime(a));
}

function recordName(record) {
  return String(record?.name || "");
}
