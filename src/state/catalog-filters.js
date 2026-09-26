import { itemStockLocations } from "./item-stock.js";
const HOME_OR_BIKE_LOCATIONS = new Set(["Дом", "Уже на велосипеде", "Home", "Already on bike"]);

export function isItemAwayFromHomeAndBike(item, {
  homeOrBikeLocations = HOME_OR_BIKE_LOCATIONS
} = {}) {
  const rows = itemStockLocations(item);
  const available = rows.filter((row) => row.quantity > 0);
  return (available.length ? available : rows).some((row) => !homeOrBikeLocations.has(row.location));
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
