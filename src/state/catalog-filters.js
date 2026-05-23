const HOME_OR_BIKE_LOCATIONS = new Set(["Дом", "Уже на велосипеде"]);

export function isItemAwayFromHomeAndBike(item, {
  homeOrBikeLocations = HOME_OR_BIKE_LOCATIONS
} = {}) {
  return !homeOrBikeLocations.has(item?.location);
}

export function isItemWithoutWeight(item) {
  return !Number(item?.weight || 0);
}

export function matchesCollectionFilter(item, {
  collectionMode = false,
  showOnlyUnpacked = false,
  isPacked = () => false
} = {}) {
  if (collectionMode && showOnlyUnpacked && isPacked(item?.id)) return false;
  return true;
}
