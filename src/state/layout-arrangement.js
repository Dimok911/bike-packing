export const LAYOUT_ITEM_QUANTITY_MIGRATION_VERSION = 3;

export function createEmptyLayoutArrangement() {
  return {
    rootContainerIds: [],
    containers: {},
    items: {},
    itemQuantities: {},
    itemQuantityMigrationVersion: LAYOUT_ITEM_QUANTITY_MIGRATION_VERSION,
    packedItems: {}
  };
}

export function uniqueLayoutIds(list) {
  return list.filter((id, index) => typeof id === "string" && id && list.indexOf(id) === index);
}

export function createLayoutArrangementFromCurrentState(targetState, rootIds = [], {
  itemQuantities: preservedItemQuantities = null
} = {}) {
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
      const sourceQuantity = preservedItemQuantities && Object.prototype.hasOwnProperty.call(preservedItemQuantities, itemId)
        ? preservedItemQuantities[itemId]
        : items[itemId]?.quantity;
      arrangement.itemQuantities[itemId] = Math.max(1, Math.round(Number(sourceQuantity) || 1));
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
  repairContainerMembershipFromItemLinks,
  preserveCatalog = false
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
  const wholeCatalog = preserveCatalog && Object.keys(targetState.layouts || {}).length === 1;
  // Administrative editors retain an entire server catalog, including trees
  // outside the selected arrangement. Switching/reopening must not flatten
  // those trees before a later full save, even when another layout opens first
  // during startup. Restore only links within the same detached catalog;
  // placements in either the owner's or active arrangement stay authoritative.
  const detachedOwner = (id, row, kind) => {
    const owner = wholeCatalog ? layout : targetState.layouts?.[row.publicCatalogLayoutId];
    return (wholeCatalog || owner?.adminCausalSource) && !Object.hasOwn(owner.arrangement?.[kind] || {}, id)
      && !Object.hasOwn(arrangement[kind], id) ? owner.id : null;
  };
  const detachedContainers = new Map(Object.entries(targetState.containers || {})
    .filter(([id, row]) => detachedOwner(id, row, "containers"))
    .map(([id, row]) => [id, { ownerId: detachedOwner(id, row, "containers"), parentId: row.parentId, childIds: [...(row.childIds || [])], itemIds: [...(row.itemIds || [])], order: [...(row.order || [])] }]));
  const detachedItems = new Map(Object.entries(targetState.items || {})
    .filter(([id, row]) => detachedOwner(id, row, "items") && detachedContainers.get(row.containerId)?.ownerId === detachedOwner(id, row, "items"))
    .map(([id, row]) => [id, row.containerId]));
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
  detachedContainers.forEach((saved, id) => {
    const container = targetState.containers[id];
    container.parentId = detachedContainers.get(saved.parentId)?.ownerId === saved.ownerId ? saved.parentId : null;
    container.childIds = saved.childIds.filter(childId => detachedContainers.get(childId)?.parentId === id && detachedContainers.get(childId)?.ownerId === saved.ownerId);
    container.itemIds = saved.itemIds.filter(itemId => detachedItems.get(itemId) === id);
    container.order = saved.order.filter(row => row.type === "container" ? container.childIds.includes(row.id) : row.type === "item" && container.itemIds.includes(row.id));
  });
  detachedItems.forEach((containerId, id) => { targetState.items[id].containerId = containerId; });
  targetState.packedItems = { ...(arrangement.packedItems || {}) };
  repairContainerMembershipFromItemLinks(targetState);
  migrateContainerOrder(targetState);
  return true;
}
