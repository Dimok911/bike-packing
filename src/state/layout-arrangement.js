export function createEmptyLayoutArrangement() {
  return {
    rootContainerIds: [],
    containers: {},
    items: {},
    packedItems: {}
  };
}

export function uniqueLayoutIds(list) {
  return list.filter((id, index) => typeof id === "string" && id && list.indexOf(id) === index);
}

export function createLayoutArrangementFromCurrentState(targetState, rootIds = []) {
  const arrangement = createEmptyLayoutArrangement();
  const containers = targetState.containers || {};
  const items = targetState.items || {};
  const seenContainers = new Set();
  const walk = (containerId, parentId = "") => {
    const container = containers[containerId];
    if (!container || seenContainers.has(containerId)) return;
    seenContainers.add(containerId);
    const linkedItemIds = Object.entries(items)
      .filter(([, item]) => item?.containerId === containerId)
      .map(([itemId]) => itemId);
    const itemIds = uniqueLayoutIds([
      ...(Array.isArray(container.itemIds) ? container.itemIds : []),
      ...linkedItemIds
    ]).filter((itemId) => items[itemId]);
    const childIds = uniqueLayoutIds(Array.isArray(container.childIds) ? container.childIds : [])
      .filter((childId) => containers[childId]);
    const order = (Array.isArray(container.order) ? container.order : [])
      .filter((entry) => entry && (entry.type === "item" || entry.type === "container") && entry.id)
      .filter((entry) => entry.type === "item" ? itemIds.includes(entry.id) : childIds.includes(entry.id))
      .map((entry) => ({ type: entry.type, id: entry.id }));
    arrangement.containers[containerId] = {
      parentId,
      itemIds,
      childIds,
      order
    };
    itemIds.forEach((itemId) => {
      arrangement.items[itemId] = containerId;
    });
    childIds.forEach((childId) => walk(childId, containerId));
  };
  arrangement.rootContainerIds = uniqueLayoutIds(rootIds).filter((containerId) => containers[containerId]);
  arrangement.rootContainerIds.forEach((containerId) => walk(containerId, ""));
  Object.entries(targetState.packedItems || {}).forEach(([itemId, value]) => {
    if (value && arrangement.items[itemId]) arrangement.packedItems[itemId] = true;
  });
  return arrangement;
}
