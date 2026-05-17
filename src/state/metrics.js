import { normalizeItemQuantity } from "./normalize.js";

export function itemQuantity(item) {
  return normalizeItemQuantity(item?.quantity);
}

export function itemTotalWeight(item) {
  return Number(item?.weight || 0) * itemQuantity(item);
}

export function containerWeight(targetState, containerId) {
  const container = targetState.containers?.[containerId];
  if (!container) return 0;
  const ownContainerWeight = Number(container.weight || 0);
  const own = (container.itemIds || []).reduce((sum, id) => sum + itemTotalWeight(targetState.items?.[id]), 0);
  const children = (container.childIds || []).reduce((sum, id) => sum + containerWeight(targetState, id), 0);
  return ownContainerWeight + own + children;
}

export function rootContainerOwnWeight(targetState, containerId) {
  const container = targetState.containers?.[containerId];
  return container && !container.parentId ? Number(container.weight || 0) : 0;
}

export function countItemsInContainer(targetState, containerId) {
  const container = targetState.containers?.[containerId];
  if (!container) return 0;
  return (container.itemIds || []).length +
    (container.childIds || []).reduce((sum, id) => sum + countItemsInContainer(targetState, id), 0);
}

export function countItemsByLocation(targetState, containerId, locations) {
  const container = targetState.containers?.[containerId];
  if (!container) return 0;
  const own = (container.itemIds || []).filter((id) => locations.includes(targetState.items?.[id]?.location)).length;
  return own + (container.childIds || []).reduce((sum, id) => sum + countItemsByLocation(targetState, id, locations), 0);
}
