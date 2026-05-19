export function removeLayoutTreeFromState(targetState, layoutId) {
  const layout = targetState?.layouts?.[layoutId];
  if (!layout) return false;
  const containersToDelete = new Set();
  const itemsToDelete = new Set();
  const collect = (containerId) => {
    const container = targetState.containers?.[containerId];
    if (!container || containersToDelete.has(containerId)) return;
    containersToDelete.add(containerId);
    (container.itemIds || []).forEach((itemId) => itemsToDelete.add(itemId));
    (container.childIds || []).forEach(collect);
  };
  (layout.rootContainerIds || []).forEach(collect);
  delete targetState.layouts[layoutId];
  containersToDelete.forEach((containerId) => delete targetState.containers?.[containerId]);
  itemsToDelete.forEach((itemId) => delete targetState.items?.[itemId]);
  Object.keys(targetState.collapsedContainers || {}).forEach((containerId) => {
    if (containersToDelete.has(containerId)) delete targetState.collapsedContainers[containerId];
  });
  if (targetState.activeLayoutId === layoutId) {
    targetState.activeLayoutId = Object.values(targetState.layouts || {})[0]?.id || "";
  }
  return true;
}
