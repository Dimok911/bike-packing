import { sortCatalogRecords } from "./catalog-sort.js";
import { catalogDuplicateGroups, filterCatalogDuplicates, isBrokenCatalogItem } from "./catalog-duplicates.js";
import {
  createItemUsageCounts,
  createRootContainerUsageCounts
} from "./catalog-usage.js";

export function itemsForActiveCatalog(targetState, {
  isItemInActiveCatalog = () => true,
  isPrivateCatalogItemRecord = () => true
} = {}) {
  return Object.entries(targetState?.items || {})
    .filter(([itemId, item]) => isPrivateCatalogItemRecord(itemId, item))
    .map(([, item]) => item)
    .filter((item) => isItemInActiveCatalog(item));
}

export function itemsForItemsView(items, {
  duplicatesOnly = false,
  isFilterContextActive = () => false,
  isItemAwayFromHomeAndBike = () => false,
  isItemInActiveLayout = () => false,
  isItemWithoutWeight = () => false,
  itemCreatedTime = () => 0,
  itemSortMode = "name",
  itemUsageFilter = "all",
  matchesItemsViewFilters = () => true
} = {}) {
  if (duplicatesOnly || itemUsageFilter === "duplicates") {
    return sortCatalogRecords(catalogDuplicateGroups(items || [], (item) => isFilterContextActive() || matchesItemsViewFilters(item)).flat(),
      itemSortMode, { createdTime: itemCreatedTime });
  }
  const filtered = (items || []).filter((item) => {
    if (!isFilterContextActive() && !matchesItemsViewFilters(item)) return false;
    if (itemUsageFilter === "current") return isItemInActiveLayout(item);
    if (itemUsageFilter === "away") return isItemAwayFromHomeAndBike(item);
    if (itemUsageFilter === "no-weight") return isItemWithoutWeight(item);
    if (itemUsageFilter === "broken") return isBrokenCatalogItem(item);
    if (itemUsageFilter === "unused") return !isItemInActiveLayout(item);
    return true;
  });
  return sortCatalogRecords(filtered, itemSortMode, { createdTime: itemCreatedTime });
}

export function itemUsageCountsForCatalog(items, {
  duplicatesOnly = false,
  isItemAwayFromHomeAndBike = () => false,
  isItemInActiveLayout = () => false,
  isItemWithoutWeight = () => false,
  matchesItemsViewFilters = () => true
} = {}) {
  const counts = createItemUsageCounts(filterCatalogDuplicates(items || [], duplicatesOnly), {
    matchesItem: matchesItemsViewFilters,
    isAwayFromHomeAndBike: isItemAwayFromHomeAndBike,
    isWithoutWeight: isItemWithoutWeight,
    isInCurrentLayout: isItemInActiveLayout
  });
  counts.duplicates = catalogDuplicateGroups(items || [], matchesItemsViewFilters).flat().length;
  counts.broken = (items || []).filter((item) => isBrokenCatalogItem(item) && matchesItemsViewFilters(item)).length;
  return counts;
}

export function rootContainersForEditor(targetState, {
  isPrivateCatalogContainerRecord = () => true,
  isRootContainerForEditor = () => true
} = {}) {
  const roots = Object.values(targetState?.containers || {})
    .filter((container) => isPrivateCatalogContainerRecord(container.id, container))
    .filter(isRootContainerForEditor);
  return sortCatalogRecords(roots, "asc");
}

export function rootContainersForSettings(targetState, {
  duplicatesOnly = false,
  containerCreatedTime = () => 0,
  isPrivateCatalogContainerRecord = () => true,
  isRootContainerForEditor = () => true,
  isRootContainerInActiveCatalog = () => true,
  isRootContainerInActiveLayout = () => false,
  matchesRootContainerFieldsFilter = () => true,
  rootContainerSortMode = "name",
  rootContainerUsageFilter = "all"
} = {}) {
  const candidates = Object.values(targetState?.containers || {}).filter((container) =>
    isPrivateCatalogContainerRecord(container.id, container) && isRootContainerForEditor(container) && isRootContainerInActiveCatalog(container)
  );
  if (duplicatesOnly || rootContainerUsageFilter === "duplicates") {
    return sortCatalogRecords(catalogDuplicateGroups(candidates, matchesRootContainerFieldsFilter).flat(),
      rootContainerSortMode, { createdTime: containerCreatedTime });
  }
  const roots = filterCatalogDuplicates(candidates, duplicatesOnly || rootContainerUsageFilter === "duplicates").filter((container) => {
    if (!isPrivateCatalogContainerRecord(container.id, container)) return false;
    if (!isRootContainerForEditor(container)) return false;
    if (!isRootContainerInActiveCatalog(container)) return false;
    if (rootContainerUsageFilter === "current" && !isRootContainerInActiveLayout(container.id)) return false;
    if (rootContainerUsageFilter === "unused" && isRootContainerInActiveLayout(container.id)) return false;
    if (!matchesRootContainerFieldsFilter(container)) return false;
    return true;
  });
  return sortCatalogRecords(roots, rootContainerSortMode, { createdTime: containerCreatedTime });
}

export function rootContainerUsageCountsForCatalog(targetState, {
  duplicatesOnly = false,
  matchesRootContainerFieldsFilter = () => true,
  isPrivateCatalogContainerRecord = () => true,
  isRootContainerForEditor = () => true,
  isRootContainerInActiveCatalog = () => true,
  isRootContainerInActiveLayout = () => false
} = {}) {
  const candidates = Object.values(targetState?.containers || {}).filter((container) =>
    isPrivateCatalogContainerRecord(container.id, container) && isRootContainerForEditor(container) && isRootContainerInActiveCatalog(container)
  );
  const counts = createRootContainerUsageCounts(filterCatalogDuplicates(candidates, duplicatesOnly), {
    isEligible: (container) =>
      isPrivateCatalogContainerRecord(container.id, container) &&
      isRootContainerForEditor(container) &&
      isRootContainerInActiveCatalog(container),
    isInCurrentLayout: isRootContainerInActiveLayout
  });
  counts.duplicates = catalogDuplicateGroups(candidates, matchesRootContainerFieldsFilter).flat().length;
  return counts;
}
