import { sortCatalogRecords } from "./catalog-sort.js";
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
  isFilterContextActive = () => false,
  isItemAwayFromHomeAndBike = () => false,
  isItemInActiveLayout = () => false,
  isItemWithoutWeight = () => false,
  itemCreatedTime = () => 0,
  itemSortMode = "name",
  itemUsageFilter = "all",
  matchesItemsViewFilters = () => true
} = {}) {
  const filtered = (items || []).filter((item) => {
    if (!isFilterContextActive() && !matchesItemsViewFilters(item)) return false;
    if (itemUsageFilter === "current") return isItemInActiveLayout(item);
    if (itemUsageFilter === "away") return isItemAwayFromHomeAndBike(item);
    if (itemUsageFilter === "no-weight") return isItemWithoutWeight(item);
    if (itemUsageFilter === "unused") return !isItemInActiveLayout(item);
    return true;
  });
  return sortCatalogRecords(filtered, itemSortMode, { createdTime: itemCreatedTime });
}

export function itemUsageCountsForCatalog(items, {
  isItemAwayFromHomeAndBike = () => false,
  isItemInActiveLayout = () => false,
  isItemWithoutWeight = () => false,
  matchesItemsViewFilters = () => true
} = {}) {
  return createItemUsageCounts(items || [], {
    matchesItem: matchesItemsViewFilters,
    isAwayFromHomeAndBike: isItemAwayFromHomeAndBike,
    isWithoutWeight: isItemWithoutWeight,
    isInCurrentLayout: isItemInActiveLayout
  });
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
  containerCreatedTime = () => 0,
  isPrivateCatalogContainerRecord = () => true,
  isRootContainerForEditor = () => true,
  isRootContainerInActiveCatalog = () => true,
  isRootContainerInActiveLayout = () => false,
  matchesRootContainerFieldsFilter = () => true,
  rootContainerSortMode = "name",
  rootContainerUsageFilter = "all"
} = {}) {
  const roots = Object.values(targetState?.containers || {}).filter((container) => {
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
  isPrivateCatalogContainerRecord = () => true,
  isRootContainerForEditor = () => true,
  isRootContainerInActiveCatalog = () => true,
  isRootContainerInActiveLayout = () => false
} = {}) {
  return createRootContainerUsageCounts(Object.values(targetState?.containers || {}), {
    isEligible: (container) =>
      isPrivateCatalogContainerRecord(container.id, container) &&
      isRootContainerForEditor(container) &&
      isRootContainerInActiveCatalog(container),
    isInCurrentLayout: isRootContainerInActiveLayout
  });
}
