import { getItemContainerIdInLayout } from "./layout-ops.js";

export function expandItemPlacementPath(targetState, layoutId, itemId) {
  const layout = targetState?.layouts?.[layoutId];
  if (!layout || !itemId) return [];
  const arrangement = layout.arrangement || {};
  let containerId = getItemContainerIdInLayout(targetState, layout, itemId);
  if (!containerId) return [];

  targetState.collapsedContainers = targetState.collapsedContainers || {};
  const expandedIds = [];
  const visited = new Set();
  while (containerId && !visited.has(containerId)) {
    visited.add(containerId);
    if (targetState.collapsedContainers[containerId]) {
      targetState.collapsedContainers[containerId] = false;
      expandedIds.push(containerId);
    }
    containerId = arrangement.containers?.[containerId]?.parentId
      || targetState.containers?.[containerId]?.parentId
      || "";
  }
  return expandedIds;
}
