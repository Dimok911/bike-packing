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
  return searchTextMatchesQuery([
    item?.name,
    item?.note || ""
  ].join(" "), normalizedQuery);
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
  return searchTextMatchesQuery([
    container?.name,
    container?.note || ""
  ].join(" "), normalizedQuery);
}

export function searchTextMatchesQuery(value, query) {
  const terms = searchQueryTerms(query);
  if (!terms.length) return false;
  const text = String(value || "").toLocaleLowerCase();
  return terms.every((term) => text.includes(term));
}

export function recordNoteMatchesQuery(record, query) {
  return searchTextMatchesQuery(record?.note, query);
}

export function searchQueryTerms(query) {
  return [...new Set(normalizeSearchQuery(query).split(/\s+/).filter(Boolean))];
}

function normalizeSearchQuery(query) {
  return String(query || "").trim().toLocaleLowerCase();
}
