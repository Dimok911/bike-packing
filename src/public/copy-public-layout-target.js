function touchRecord(record, changedAt, touch) {
  if (!record || typeof touch !== "function") return;
  touch(record, changedAt);
}

export function markCopiedItemForPublicLayout(targetState, itemId, targetLayoutId, { changedAt = "", touch = null } = {}) {
  const item = targetState?.items?.[itemId];
  if (!item || !targetLayoutId) return false;
  item.publicCatalogLayoutId = targetLayoutId;
  touchRecord(item, changedAt, touch);
  return true;
}

export function markCopiedContainerTreeForPublicLayout(targetState, containerId, targetLayoutId, { changedAt = "", touch = null } = {}) {
  if (!targetState || !containerId || !targetLayoutId) return false;
  const visited = new Set();
  let marked = false;
  const visit = (id) => {
    if (!id || visited.has(id)) return;
    const container = targetState.containers?.[id];
    if (!container) return;
    visited.add(id);
    container.publicCatalogLayoutId = targetLayoutId;
    touchRecord(container, changedAt, touch);
    marked = true;
    (container.itemIds || []).forEach((itemId) => {
      marked = markCopiedItemForPublicLayout(targetState, itemId, targetLayoutId, { changedAt, touch }) || marked;
    });
    (container.order || []).forEach((entry) => {
      if (entry?.type === "item") {
        marked = markCopiedItemForPublicLayout(targetState, entry.id, targetLayoutId, { changedAt, touch }) || marked;
      }
      if (entry?.type === "container") visit(entry.id);
    });
    (container.childIds || []).forEach(visit);
  };
  visit(containerId);
  return marked;
}

export function writeContainerTreeToLayoutArrangement(targetState, layoutId, containerId) {
  const layout = targetState?.layouts?.[layoutId];
  const root = targetState?.containers?.[containerId];
  if (!layout || !root) return false;
  const arrangement = layout.arrangement && typeof layout.arrangement === "object"
    ? layout.arrangement
    : { rootContainerIds: [], containers: {}, items: {}, packedItems: {} };
  arrangement.rootContainerIds = Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : [];
  arrangement.containers = arrangement.containers && typeof arrangement.containers === "object" ? arrangement.containers : {};
  arrangement.items = arrangement.items && typeof arrangement.items === "object" ? arrangement.items : {};
  arrangement.packedItems = arrangement.packedItems && typeof arrangement.packedItems === "object" ? arrangement.packedItems : {};
  layout.arrangement = arrangement;

  const visited = new Set();
  const writeContainer = (id, parentId = "") => {
    if (!id || visited.has(id)) return false;
    const container = targetState.containers?.[id];
    if (!container) return false;
    visited.add(id);
    const itemIds = [...new Set([...(container.itemIds || []), ...(container.order || [])
      .filter((entry) => entry?.type === "item")
      .map((entry) => entry.id)])]
      .filter((itemId) => targetState.items?.[itemId]);
    const childIds = [...new Set([...(container.childIds || []), ...(container.order || [])
      .filter((entry) => entry?.type === "container")
      .map((entry) => entry.id)])]
      .filter((childId) => targetState.containers?.[childId]);
    const itemSet = new Set(itemIds);
    const childSet = new Set(childIds);
    const order = (container.order || [])
      .filter((entry) => entry && (entry.type === "item" || entry.type === "container") && entry.id)
      .filter((entry) => entry.type === "item" ? itemSet.has(entry.id) : childSet.has(entry.id))
      .map((entry) => ({ type: entry.type, id: entry.id }));
    arrangement.containers[id] = {
      parentId,
      itemIds,
      childIds,
      order: order.length ? order : [
        ...itemIds.map((itemId) => ({ type: "item", id: itemId })),
        ...childIds.map((childId) => ({ type: "container", id: childId }))
      ]
    };
    itemIds.forEach((itemId) => {
      arrangement.items[itemId] = id;
    });
    childIds.forEach((childId) => writeContainer(childId, id));
    return true;
  };

  const wrote = writeContainer(containerId, root.parentId || "");
  if (!wrote) return false;
  if (root.parentId && arrangement.containers[root.parentId]) {
    const parent = arrangement.containers[root.parentId];
    parent.childIds = Array.isArray(parent.childIds) ? parent.childIds.filter((id) => id !== containerId) : [];
    parent.order = Array.isArray(parent.order)
      ? parent.order.filter((entry) => !(entry?.type === "container" && entry.id === containerId))
      : [];
    parent.childIds.push(containerId);
    parent.order.push({ type: "container", id: containerId });
    arrangement.rootContainerIds = arrangement.rootContainerIds.filter((id) => id !== containerId);
  } else if (!root.parentId && !arrangement.rootContainerIds.includes(containerId)) {
    arrangement.rootContainerIds.push(containerId);
  }
  layout.rootContainerIds = [...new Set([...(layout.rootContainerIds || []), ...(arrangement.rootContainerIds || [])])];
  return true;
}

export function linkExistingContainerTreeToLayoutState(targetState, sourceSnapshot, targetLayoutId, targetParentId = "", {
  changedAt = "",
  normalizeLayoutArrangement = () => {},
  targetContainerIds = [],
  touchLayout = () => {}
} = {}) {
  const targetLayout = targetState?.layouts?.[targetLayoutId];
  if (!targetState || !sourceSnapshot || !targetLayout) return "";
  const targetContainerSet = new Set(targetContainerIds);
  if (targetParentId && (!targetState.containers?.[targetParentId] || !targetContainerSet.has(targetParentId))) return "";

  const applySourceContainer = (sourceContainerId, parentId = null) => {
    const sourceContainer = sourceSnapshot.containers?.[sourceContainerId];
    const targetContainer = targetState.containers?.[sourceContainerId];
    if (!sourceContainer || !targetContainer) return "";
    targetContainer.parentId = parentId || null;
    targetContainer.childIds = (sourceContainer.childIds || []).filter((id) => targetState.containers?.[id]);
    targetContainer.itemIds = (sourceContainer.itemIds || []).filter((id) => targetState.items?.[id]);
    targetContainer.order = (sourceContainer.order || [])
      .filter((entry) => entry && (entry.type === "item" || entry.type === "container") && entry.id)
      .filter((entry) => entry.type === "item" ? targetContainer.itemIds.includes(entry.id) : targetContainer.childIds.includes(entry.id))
      .map((entry) => ({ type: entry.type, id: entry.id }));
    if (!targetContainer.order.length) {
      targetContainer.order = [
        ...targetContainer.itemIds.map((id) => ({ type: "item", id })),
        ...targetContainer.childIds.map((id) => ({ type: "container", id }))
      ];
    }
    targetContainer.itemIds.forEach((itemId) => {
      if (targetState.items?.[itemId]) targetState.items[itemId].containerId = sourceContainerId;
    });
    targetContainer.childIds.forEach((childId) => applySourceContainer(childId, sourceContainerId));
    targetState.collapsedContainers[sourceContainerId] = false;
    return sourceContainerId;
  };

  const rootId = applySourceContainer(sourceSnapshot.rootId, targetParentId || null);
  if (!rootId) return "";
  if (targetParentId) {
    const parent = targetState.containers[targetParentId];
    parent.childIds = parent.childIds || [];
    if (!parent.childIds.includes(rootId)) parent.childIds.push(rootId);
    parent.order = parent.order || [];
    if (!parent.order.some((entry) => entry?.type === "container" && entry.id === rootId)) {
      parent.order.push({ type: "container", id: rootId });
    }
    targetState.collapsedContainers[targetParentId] = false;
  } else {
    targetLayout.rootContainerIds = [...new Set([...(targetLayout.rootContainerIds || []), rootId])];
  }
  writeContainerTreeToLayoutArrangement(targetState, targetLayoutId, rootId);
  normalizeLayoutArrangement(targetLayout, targetState);
  touchLayout(targetLayoutId, changedAt);
  return rootId;
}
