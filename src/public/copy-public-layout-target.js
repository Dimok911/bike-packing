function touchRecord(record, changedAt, touch) {
  if (!record || typeof touch !== "function") return;
  touch(record, changedAt);
}

const DEFAULT_LAYOUT_NAMES = new Set(["Current layout", "Текущая укладка"]);

export function isEmptySystemDefaultLayout(layout) {
  if (String(layout?.id || "") !== "layout-main") return false;
  if (!DEFAULT_LAYOUT_NAMES.has(String(layout?.name || "").trim())) return false;
  const arrangement = layout?.arrangement;
  return !(layout?.rootContainerIds || []).length &&
    !(arrangement?.rootContainerIds || []).length &&
    !Object.keys(arrangement?.containers || {}).length &&
    !Object.keys(arrangement?.items || {}).length;
}

export function isSharedCopyTargetLayout(layout, {
  excludeEmptySystemDefault = false,
  readonlySourceLayoutId = ""
} = {}) {
  const layoutId = String(layout?.id || "");
  if (!layoutId) return false;
  if (layout.adminDemo || layout.adminSharedSourceId || layout.publicCatalogLayoutId) return false;
  if (readonlySourceLayoutId && layoutId === String(readonlySourceLayoutId)) return false;
  if (excludeEmptySystemDefault && isEmptySystemDefaultLayout(layout)) return false;
  return true;
}

export function sharedCopyTargetLayouts(layouts, {
  excludeRedundantEmptySystemDefault = false,
  ...options
} = {}) {
  const targets = Object.values(layouts || {}).filter((layout) => isSharedCopyTargetLayout(layout, options));
  if (!excludeRedundantEmptySystemDefault) return targets;
  const realTargets = targets.filter((layout) => !isEmptySystemDefaultLayout(layout));
  return realTargets.length ? realTargets : targets;
}

export function shouldCopySharedItemOutsideLayout(layouts, {
  layoutHasContainers = (layout) => Boolean((layout?.rootContainerIds || []).length)
} = {}) {
  const targets = Array.isArray(layouts) ? layouts.filter(Boolean) : [];
  return targets.length > 0 && !targets.some((layout) => layoutHasContainers(layout));
}

function publicCopyTargetRank(layout) {
  return layout?.adminTemplateCopy ? 2 : 1;
}

export function publicCopyTargetLayouts(layouts, {
  choiceForLayout = () => "",
  visibleChoices = []
} = {}) {
  const visible = new Set((Array.isArray(visibleChoices) ? visibleChoices : [])
    .map((choice) => String(choice || ""))
    .filter(Boolean));
  if (!visible.size) return [];
  const byChoice = new Map();
  const order = [];
  Object.values(layouts || {}).forEach((layout) => {
    if (!layout || (!layout.adminDemo && !layout.adminSharedSourceId)) return;
    const choice = String(choiceForLayout(layout) || "");
    if (!choice || !visible.has(choice)) return;
    if (!byChoice.has(choice)) order.push(choice);
    const current = byChoice.get(choice);
    if (!current || publicCopyTargetRank(layout) > publicCopyTargetRank(current)) {
      byChoice.set(choice, layout);
    }
  });
  return order.map((choice) => byChoice.get(choice)).filter(Boolean);
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

function ensureLayoutArrangementObject(layout) {
  const arrangement = layout.arrangement && typeof layout.arrangement === "object"
    ? layout.arrangement
    : { rootContainerIds: [], containers: {}, items: {}, packedItems: {} };
  arrangement.rootContainerIds = Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : [];
  arrangement.containers = arrangement.containers && typeof arrangement.containers === "object" ? arrangement.containers : {};
  arrangement.items = arrangement.items && typeof arrangement.items === "object" ? arrangement.items : {};
  arrangement.packedItems = arrangement.packedItems && typeof arrangement.packedItems === "object" ? arrangement.packedItems : {};
  layout.arrangement = arrangement;
  return arrangement;
}

function orderedSourceIds(sourceContainer, type) {
  const fromFields = type === "container" ? sourceContainer?.childIds || [] : sourceContainer?.itemIds || [];
  const fromOrder = (sourceContainer?.order || [])
    .filter((entry) => entry?.type === type && entry.id)
    .map((entry) => entry.id);
  return [...new Set([...fromOrder, ...fromFields])].filter(Boolean);
}

function insertContainerInParentPlacement(parentPlacement, containerId) {
  parentPlacement.childIds = Array.isArray(parentPlacement.childIds) ? parentPlacement.childIds : [];
  parentPlacement.order = Array.isArray(parentPlacement.order) ? parentPlacement.order : [];
  if (!parentPlacement.childIds.includes(containerId)) parentPlacement.childIds.push(containerId);
  if (!parentPlacement.order.some((entry) => entry?.type === "container" && entry.id === containerId)) {
    parentPlacement.order.push({ type: "container", id: containerId });
  }
}

export function linkMissingContainerTreeToLayoutState(targetState, sourceSnapshot, targetLayoutId, {
  changedAt = "",
  missingContainers = [],
  missingItems = [],
  normalizeLayoutArrangement = () => {},
  touchLayout = () => {}
} = {}) {
  const targetLayout = targetState?.layouts?.[targetLayoutId];
  if (!targetState || !sourceSnapshot || !targetLayout) return { containerCount: 0, itemCount: 0 };
  targetState.collapsedContainers = targetState.collapsedContainers && typeof targetState.collapsedContainers === "object"
    ? targetState.collapsedContainers
    : {};
  const arrangement = ensureLayoutArrangementObject(targetLayout);
  const missingContainerById = new Map(
    (Array.isArray(missingContainers) ? missingContainers : [])
      .map((entry) => [String(entry?.sourceContainerId || ""), String(entry?.targetParentId || "")])
      .filter(([id]) => id && targetState.containers?.[id] && sourceSnapshot.containers?.[id])
  );
  const missingItemContainerById = new Map(
    (Array.isArray(missingItems) ? missingItems : [])
      .map((entry) => [String(entry?.sourceItemId || ""), String(entry?.targetContainerId || "")])
      .filter(([itemId, containerId]) => itemId && containerId && targetState.items?.[itemId] && targetState.containers?.[containerId])
  );
  let containerCount = 0;
  let itemCount = 0;

  const placeContainer = (containerId) => {
    if (!missingContainerById.has(containerId) || arrangement.containers?.[containerId]) return Boolean(arrangement.containers?.[containerId]);
    const sourceContainer = sourceSnapshot.containers?.[containerId];
    const parentId = missingContainerById.get(containerId) || "";
    if (parentId) {
      if (missingContainerById.has(parentId) && !arrangement.containers[parentId]) placeContainer(parentId);
      if (!arrangement.containers[parentId]) return false;
    }

    const childIds = orderedSourceIds(sourceContainer, "container")
      .filter((childId) => missingContainerById.has(childId) && targetState.containers?.[childId]);
    const itemIds = orderedSourceIds(sourceContainer, "item")
      .filter((itemId) => missingItemContainerById.get(itemId) === containerId && targetState.items?.[itemId]);
    const childSet = new Set(childIds);
    const itemSet = new Set(itemIds);
    const order = (sourceContainer.order || [])
      .filter((entry) => entry && (entry.type === "item" || entry.type === "container") && entry.id)
      .filter((entry) => entry.type === "item" ? itemSet.has(entry.id) : childSet.has(entry.id))
      .map((entry) => ({ type: entry.type, id: entry.id }));
    const orderKeys = new Set(order.map((entry) => `${entry.type}:${entry.id}`));
    arrangement.containers[containerId] = {
      parentId,
      itemIds,
      childIds,
      order: [
        ...order,
        ...itemIds.filter((id) => !orderKeys.has(`item:${id}`)).map((id) => ({ type: "item", id })),
        ...childIds.filter((id) => !orderKeys.has(`container:${id}`)).map((id) => ({ type: "container", id }))
      ]
    };
    itemIds.forEach((itemId) => {
      arrangement.items[itemId] = containerId;
      itemCount += 1;
    });
    if (parentId) {
      insertContainerInParentPlacement(arrangement.containers[parentId], containerId);
      targetState.collapsedContainers[parentId] = false;
    } else if (!arrangement.rootContainerIds.includes(containerId)) {
      arrangement.rootContainerIds.push(containerId);
      targetLayout.rootContainerIds = [...arrangement.rootContainerIds];
    }
    targetState.collapsedContainers[containerId] = false;
    containerCount += 1;
    childIds.forEach(placeContainer);
    return true;
  };

  [...missingContainerById.keys()].forEach(placeContainer);
  missingItemContainerById.forEach((containerId, itemId) => {
    if (arrangement.items[itemId]) return;
    const placement = arrangement.containers?.[containerId];
    if (!placement) return;
    placement.itemIds = Array.isArray(placement.itemIds) ? placement.itemIds.filter((id) => id !== itemId) : [];
    placement.order = Array.isArray(placement.order)
      ? placement.order.filter((entry) => !(entry?.type === "item" && entry.id === itemId))
      : [];
    placement.itemIds.push(itemId);
    placement.order.push({ type: "item", id: itemId });
    arrangement.items[itemId] = containerId;
    itemCount += 1;
  });
  if (!containerCount && !itemCount) return { containerCount: 0, itemCount: 0 };
  normalizeLayoutArrangement(targetLayout, targetState);
  touchLayout(targetLayoutId, changedAt);
  return { containerCount, itemCount };
}

export function linkExistingContainerTreeToLayoutState(targetState, sourceSnapshot, targetLayoutId, targetParentId = "", {
  changedAt = "",
  normalizeLayoutArrangement = () => {},
  targetIndex = null,
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
    parent.order = parent.order.filter((entry) => !(entry?.type === "container" && entry.id === rootId));
    const index = targetIndex === null
      ? parent.order.length
      : Math.max(0, Math.min(Number(targetIndex) || 0, parent.order.length));
    parent.order.splice(index, 0, { type: "container", id: rootId });
    targetState.collapsedContainers[targetParentId] = false;
  } else {
    const rootIds = [...new Set([...(targetLayout.rootContainerIds || [])])].filter((id) => id !== rootId);
    const index = targetIndex === null
      ? rootIds.length
      : Math.max(0, Math.min(Number(targetIndex) || 0, rootIds.length));
    rootIds.splice(index, 0, rootId);
    targetLayout.rootContainerIds = rootIds;
  }
  writeContainerTreeToLayoutArrangement(targetState, targetLayoutId, rootId);
  normalizeLayoutArrangement(targetLayout, targetState);
  touchLayout(targetLayoutId, changedAt);
  return rootId;
}
