import { clonePlain } from "../utils/json.js";

export function containerTreeSnapshotScore(snapshot) {
  if (!snapshot) return 0;
  return Object.keys(snapshot.containers || {}).length + Object.keys(snapshot.items || {}).length * 2;
}

export function snapshotContainerTreeFromLiveState(containerId, targetState) {
  const root = targetState?.containers?.[containerId];
  if (!root) return null;
  const containers = {};
  const items = {};
  const visitedContainers = new Set();
  const copyItem = (itemId) => {
    if (items[itemId]) return;
    const item = targetState.items?.[itemId];
    if (item) items[itemId] = clonePlain(item);
  };
  const copyContainer = (id) => {
    if (visitedContainers.has(id)) return;
    const container = targetState.containers?.[id];
    if (!container) return;
    visitedContainers.add(id);
    containers[id] = clonePlain(container);
    (container.itemIds || []).forEach(copyItem);
    (container.order || []).forEach((entry) => {
      if (entry?.type === "item") copyItem(entry.id);
      if (entry?.type === "container") copyContainer(entry.id);
    });
    (container.childIds || []).forEach(copyContainer);
  };
  copyContainer(containerId);
  return { rootId: containerId, containers, items };
}
