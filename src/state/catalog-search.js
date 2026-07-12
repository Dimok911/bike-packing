export function matchesItemFieldsFilter(item, {
  query = "",
  location = "",
  categories = [],
  ignoreLocation = false,
  ignoreCategories = false,
  itemCategories = () => []
} = {}) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!ignoreLocation && location && item?.location !== location) return false;
  const itemCategoryValues = itemCategories(item);
  if (!ignoreCategories && categories.length && !categories.some((category) => itemCategoryValues.includes(category))) return false;
  if (!normalizedQuery) return true;
  return [
    item?.name,
    item?.note || ""
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function matchesRootContainerFieldsFilter(container, {
  categories = [],
  containerCategories = () => [],
  query = "",
  location = "",
  containerLocation = "",
  ignoreCategories = false,
  ignoreLocation = false
} = {}) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!ignoreLocation && location && containerLocation !== location) return false;
  const containerCategoryValues = containerCategories(container);
  if (!ignoreCategories && categories.length && !categories.some((category) => containerCategoryValues.includes(category))) return false;
  if (!normalizedQuery) return true;
  return [
    container?.name,
    container?.note || ""
  ].join(" ").toLowerCase().includes(normalizedQuery);
}

function normalizeSearchQuery(query) {
  return String(query || "").trim().toLowerCase();
}
