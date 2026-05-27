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

export function applyLayoutArrangementToState(targetState, layoutId, {
  migrateContainerOrder,
  normalizeLayoutArrangement,
  repairContainerMembershipFromItemLinks
} = {}) {
  const layout = targetState.layouts?.[layoutId];
  if (!layout) return false;
  const hadStoredArrangement = Boolean(
    layout.arrangement &&
    typeof layout.arrangement === "object" &&
    layout.arrangement.containers &&
    typeof layout.arrangement.containers === "object" &&
    layout.arrangement.items &&
    typeof layout.arrangement.items === "object"
  );
  repairContainerMembershipFromItemLinks(targetState);
  const previousItemContainers = {};
  const previousContainerParents = {};
  Object.entries(targetState.items || {}).forEach(([itemId, item]) => {
    if (item?.containerId && targetState.containers?.[item.containerId]) previousItemContainers[itemId] = item.containerId;
  });
  Object.entries(targetState.containers || {}).forEach(([containerId, container]) => {
    if (container?.parentId && targetState.containers?.[container.parentId]) {
      previousContainerParents[containerId] = container.parentId;
    }
  });
  const arrangement = normalizeLayoutArrangement(layout, targetState);
  const arrangedContainerIds = new Set(Object.keys(arrangement.containers || {}));
  Object.values(targetState.items || {}).forEach((item) => {
    item.containerId = "";
  });
  Object.values(targetState.containers || {}).forEach((container) => {
    container.parentId = null;
    container.childIds = [];
    container.itemIds = [];
    container.order = [];
  });
  layout.rootContainerIds = [...arrangement.rootContainerIds];
  Object.entries(arrangement.containers).forEach(([containerId, placement]) => {
    const container = targetState.containers?.[containerId];
    if (!container) return;
    container.parentId = placement.parentId || null;
    container.childIds = [...(placement.childIds || [])].filter((id) => targetState.containers?.[id]);
    container.itemIds = [...(placement.itemIds || [])].filter((id) => targetState.items?.[id]);
    container.order = [...(placement.order || [])]
      .filter((entry) => entry.type === "item" ? targetState.items?.[entry.id] : targetState.containers?.[entry.id])
      .map((entry) => ({ type: entry.type, id: entry.id }));
  });
  Object.entries(arrangement.items).forEach(([itemId, containerId]) => {
    if (targetState.items?.[itemId] && targetState.containers?.[containerId]) {
      targetState.items[itemId].containerId = containerId;
    }
  });
  if (!hadStoredArrangement) {
    Object.entries(previousItemContainers).forEach(([itemId, containerId]) => {
      const item = targetState.items?.[itemId];
      const container = targetState.containers?.[containerId];
      if (!item || item.containerId || !container) return;
      item.containerId = containerId;
      if (!container.itemIds.includes(itemId)) container.itemIds.push(itemId);
      if (!container.order.some((entry) => entry?.type === "item" && entry.id === itemId)) {
        container.order.push({ type: "item", id: itemId });
      }
    });
    Object.entries(previousContainerParents).forEach(([containerId, parentId]) => {
      const container = targetState.containers?.[containerId];
      const parent = targetState.containers?.[parentId];
      if (!container || !parent || container.parentId || arrangedContainerIds.has(containerId)) return;
      container.parentId = parentId;
      if (!parent.childIds.includes(containerId)) parent.childIds.push(containerId);
      if (!parent.order.some((entry) => entry?.type === "container" && entry.id === containerId)) {
        parent.order.push({ type: "container", id: containerId });
      }
    });
  }
  targetState.packedItems = { ...(arrangement.packedItems || {}) };
  repairContainerMembershipFromItemLinks(targetState);
  migrateContainerOrder(targetState);
  return true;
}
