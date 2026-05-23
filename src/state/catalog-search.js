export function matchesItemFieldsFilter(item, {
  query = "",
  location = "",
  categories = [],
  includeContainerPath = false,
  ignoreLocation = false,
  ignoreCategories = false,
  itemCategories = () => [],
  containerPath = () => ""
} = {}) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!ignoreLocation && location && item?.location !== location) return false;
  const itemCategoryValues = itemCategories(item);
  if (!ignoreCategories && categories.length && !categories.some((category) => itemCategoryValues.includes(category))) return false;
  if (!normalizedQuery) return true;
  return [
    item?.name,
    itemCategoryValues.join(" "),
    item?.location,
    item?.note || "",
    includeContainerPath && item?.containerId ? containerPath(item.containerId) : ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function matchesRootContainerFieldsFilter(container, {
  query = "",
  location = "",
  containerLocation = "",
  ignoreLocation = false
} = {}) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!ignoreLocation && location && containerLocation !== location) return false;
  if (!normalizedQuery) return true;
  return [
    container?.name,
    container?.color || "",
    containerLocation,
    container?.note || ""
  ].join(" ").toLowerCase().includes(normalizedQuery);
}

function normalizeSearchQuery(query) {
  return String(query || "").trim().toLowerCase();
}
