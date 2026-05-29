import { createEmptyLayoutArrangement } from "./layout-arrangement.js";
import { normalizeLayoutArrangement } from "./layout-normalize.js";
import { clonePlain } from "../utils/json.js";

export function getItemContainerIdInLayout(targetState, layout, itemId) {
  const arrangement = layout?.arrangement;
  if (!arrangement || typeof arrangement !== "object") return targetState.items?.[itemId]?.containerId || "";
  if (arrangement.items && typeof arrangement.items === "object" && arrangement.items[itemId]) {
    return arrangement.items[itemId];
  }
  const match = Object.entries(arrangement.containers || {}).find(([, placement]) => {
    if (!placement || typeof placement !== "object") return false;
    if ((placement.itemIds || []).includes(itemId)) return true;
    return (placement.order || []).some((entry) => entry?.type === "item" && entry.id === itemId);
  });
  return match?.[0] || "";
}

export function getLayoutContainerIdSet(targetState, layout = targetState.layouts?.[targetState.activeLayoutId]) {
  const ids = new Set();
  const arrangement = layout?.arrangement;
  if (!arrangement || typeof arrangement !== "object") {
    const walkFallback = (containerId) => {
      if (!containerId || ids.has(containerId) || !targetState.containers?.[containerId]) return;
      ids.add(containerId);
      (targetState.containers[containerId].childIds || []).forEach(walkFallback);
    };
    (layout?.rootContainerIds || []).forEach(walkFallback);
    return ids;
  }
  const walk = (containerId) => {
    if (!containerId || ids.has(containerId) || !targetState.containers?.[containerId]) return;
    ids.add(containerId);
    const placement = arrangement.containers?.[containerId];
    (placement?.childIds || []).forEach(walk);
  };
  (arrangement.rootContainerIds || layout?.rootContainerIds || []).forEach(walk);
  return ids;
}

export function getLayoutItemIdSet(targetState, layout = targetState.layouts?.[targetState.activeLayoutId]) {
  const arrangement = layout?.arrangement;
  if (arrangement && typeof arrangement === "object") {
    return new Set(Object.keys(arrangement.items || {}).filter((itemId) =>
      targetState.items?.[itemId] && targetState.containers?.[arrangement.items[itemId]]
    ));
  }
  const ids = new Set();
  const walk = (containerId) => {
    const container = targetState.containers?.[containerId];
    if (!container) return;
    (container.itemIds || []).forEach((itemId) => {
      if (targetState.items?.[itemId]) ids.add(itemId);
    });
    (container.childIds || []).forEach(walk);
  };
  (layout?.rootContainerIds || []).forEach(walk);
  return ids;
}

export function ensureLayoutContainerPlacement(targetState, layout, containerId) {
  if (!layout || !targetState.containers?.[containerId]) return null;
  layout.arrangement = layout.arrangement && typeof layout.arrangement === "object" ? layout.arrangement : createEmptyLayoutArrangement();
  const arrangement = layout.arrangement;
  arrangement.rootContainerIds = Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : [];
  arrangement.containers = arrangement.containers && typeof arrangement.containers === "object" ? arrangement.containers : {};
  arrangement.items = arrangement.items && typeof arrangement.items === "object" ? arrangement.items : {};
  arrangement.packedItems = arrangement.packedItems && typeof arrangement.packedItems === "object" ? arrangement.packedItems : {};
  if (arrangement.containers[containerId]) return arrangement.containers[containerId];

  const container = targetState.containers[containerId];
  const parentId = container.parentId && targetState.containers[container.parentId] ? container.parentId : "";
  if (parentId) {
    const parentPlacement = ensureLayoutContainerPlacement(targetState, layout, parentId);
    if (!parentPlacement) return null;
    parentPlacement.childIds = Array.isArray(parentPlacement.childIds) ? parentPlacement.childIds : [];
    if (!parentPlacement.childIds.includes(containerId)) parentPlacement.childIds.push(containerId);
    parentPlacement.order = Array.isArray(parentPlacement.order) ? parentPlacement.order : [];
    if (!parentPlacement.order.some((entry) => entry?.type === "container" && entry.id === containerId)) {
      parentPlacement.order.push({ type: "container", id: containerId });
    }
  } else if (!arrangement.rootContainerIds.includes(containerId)) {
    arrangement.rootContainerIds.push(containerId);
    layout.rootContainerIds = [...arrangement.rootContainerIds];
  }

  arrangement.containers[containerId] = {
    parentId,
    itemIds: [],
    childIds: [],
    order: []
  };
  return arrangement.containers[containerId];
}

export function removeItemFromLayoutArrangement(layout, itemId) {
  const arrangement = layout?.arrangement;
  if (!arrangement || typeof arrangement !== "object") return false;
  let changed = false;
  if (arrangement.items && typeof arrangement.items === "object" && Object.prototype.hasOwnProperty.call(arrangement.items, itemId)) {
    delete arrangement.items[itemId];
    changed = true;
  }
  if (arrangement.packedItems && typeof arrangement.packedItems === "object" && Object.prototype.hasOwnProperty.call(arrangement.packedItems, itemId)) {
    delete arrangement.packedItems[itemId];
    changed = true;
  }
  Object.values(arrangement.containers || {}).forEach((placement) => {
    if (!placement || typeof placement !== "object") return;
    const currentItemIds = Array.isArray(placement.itemIds) ? placement.itemIds : [];
    const nextItemIds = currentItemIds.filter((id) => id !== itemId);
    if (nextItemIds.length !== currentItemIds.length) {
      placement.itemIds = nextItemIds;
      changed = true;
    }
    const currentOrder = Array.isArray(placement.order) ? placement.order : [];
    const nextOrder = currentOrder.filter((entry) => !(entry?.type === "item" && entry.id === itemId));
    if (nextOrder.length !== currentOrder.length) {
      placement.order = nextOrder;
      changed = true;
    }
  });
  return changed;
}

export function addItemToLayoutArrangement(targetState, layout, itemId, containerId, targetIndex = null) {
  if (!layout || !targetState.items?.[itemId]) return false;
  const targetPlacement = ensureLayoutContainerPlacement(targetState, layout, containerId);
  if (!targetPlacement) return false;
  const arrangement = layout.arrangement;
  removeItemFromLayoutArrangement(layout, itemId);
  arrangement.items = arrangement.items && typeof arrangement.items === "object" ? arrangement.items : {};
  arrangement.items[itemId] = containerId;
  targetPlacement.itemIds = Array.isArray(targetPlacement.itemIds) ? targetPlacement.itemIds.filter((id) => id !== itemId) : [];
  targetPlacement.order = Array.isArray(targetPlacement.order)
    ? targetPlacement.order.filter((entry) => !(entry?.type === "item" && entry.id === itemId))
    : [];
  targetPlacement.itemIds.push(itemId);
  const index = targetIndex === null
    ? targetPlacement.order.length
    : Math.max(0, Math.min(targetIndex, targetPlacement.order.length));
  targetPlacement.order.splice(index, 0, { type: "item", id: itemId });
  return true;
}

export function moveItemInLayoutArrangement(targetState, layout, itemId, targetContainerId, targetIndex = null) {
  const oldContainerId = getItemContainerIdInLayout(targetState, layout, itemId);
  if (!oldContainerId && !targetState.items?.[itemId]) return false;
  const moved = addItemToLayoutArrangement(targetState, layout, itemId, targetContainerId, targetIndex);
  if (moved && oldContainerId && oldContainerId !== targetContainerId) {
    cleanupEmptyContainersInLayoutArrangement(layout, oldContainerId);
  }
  return moved;
}

export function getLayoutDescendantContainerIds(layout, containerId) {
  const arrangement = layout?.arrangement;
  const result = [];
  const walk = (id) => {
    const placement = arrangement?.containers?.[id];
    (placement?.childIds || []).forEach((childId) => {
      if (result.includes(childId)) return;
      result.push(childId);
      walk(childId);
    });
  };
  walk(containerId);
  return result;
}

export function moveContainerInLayoutArrangement(targetState, layout, containerId, targetParentId, targetIndex = null) {
  if (!layout || !targetState.containers?.[containerId] || !targetState.containers?.[targetParentId]) return false;
  if (containerId === targetParentId) return false;
  if (getLayoutDescendantContainerIds(layout, containerId).includes(targetParentId)) return false;
  const sourcePlacement = ensureLayoutContainerPlacement(targetState, layout, containerId);
  const targetPlacement = ensureLayoutContainerPlacement(targetState, layout, targetParentId);
  if (!sourcePlacement || !targetPlacement) return false;
  const oldParentId = sourcePlacement.parentId || "";
  if (oldParentId) {
    const oldParent = layout.arrangement?.containers?.[oldParentId];
    if (oldParent) {
      oldParent.childIds = (oldParent.childIds || []).filter((id) => id !== containerId);
      oldParent.order = (oldParent.order || []).filter((entry) => !(entry?.type === "container" && entry.id === containerId));
    }
  } else {
    layout.arrangement.rootContainerIds = (layout.arrangement.rootContainerIds || []).filter((id) => id !== containerId);
    layout.rootContainerIds = [...layout.arrangement.rootContainerIds];
  }
  sourcePlacement.parentId = targetParentId;
  targetPlacement.childIds = Array.isArray(targetPlacement.childIds) ? targetPlacement.childIds.filter((id) => id !== containerId) : [];
  targetPlacement.order = Array.isArray(targetPlacement.order)
    ? targetPlacement.order.filter((entry) => !(entry?.type === "container" && entry.id === containerId))
    : [];
  const index = targetIndex === null
    ? targetPlacement.order.length
    : Math.max(0, Math.min(targetIndex, targetPlacement.order.length));
  targetPlacement.childIds.push(containerId);
  targetPlacement.order.splice(index, 0, { type: "container", id: containerId });
  if (oldParentId && oldParentId !== targetParentId) cleanupEmptyContainersInLayoutArrangement(layout, oldParentId);
  return true;
}

export function removeItemFromLayoutInState(targetState, layoutId, itemId, {
  changedAt = "",
  touchLayout = () => {}
} = {}) {
  const item = targetState?.items?.[itemId];
  const layout = targetState?.layouts?.[layoutId];
  const containerId = getItemContainerIdInLayout(targetState, layout, itemId);
  if (!item || !layout || !containerId) return false;
  if (!removeItemFromLayoutArrangement(layout, itemId)) return false;
  cleanupEmptyContainersInLayoutArrangement(layout, containerId);
  touchLayout(layoutId, changedAt);
  return true;
}

export function placeExistingItemInLayoutInState(targetState, itemId, containerId, layoutId, {
  activeLayoutId = "",
  applyLayoutArrangement = () => {},
  changedAt = "",
  targetIndex = null,
  touchLayout = () => {}
} = {}) {
  const layout = targetState?.layouts?.[layoutId];
  if (!targetState?.items?.[itemId] || !layout || !targetState?.containers?.[containerId]) return false;
  const previousArrangement = clonePlain(layout.arrangement || createEmptyLayoutArrangement());
  const previousRootContainerIds = [...(layout.rootContainerIds || [])];
  const rollback = () => {
    layout.arrangement = previousArrangement;
    layout.rootContainerIds = previousRootContainerIds;
    if (layoutId === activeLayoutId) applyLayoutArrangement(layoutId);
    return false;
  };
  if (!addItemToLayoutArrangement(targetState, layout, itemId, containerId, targetIndex)) return rollback();
  normalizeLayoutArrangement(layout, targetState);
  if (getItemContainerIdInLayout(targetState, layout, itemId) !== containerId) return rollback();
  touchLayout(layoutId, changedAt);
  if (layoutId === activeLayoutId) {
    applyLayoutArrangement(layoutId);
    const activeItemContainerId = targetState.items?.[itemId]?.containerId || "";
    const activeContainerHasItem = Boolean(targetState.containers?.[containerId]?.itemIds?.includes(itemId));
    if (activeItemContainerId !== containerId || !activeContainerHasItem) return rollback();
  }
  return true;
}

export function placeExistingContainerInLayoutInState(targetState, containerId, parentId, layoutId, {
  activeLayoutId = "",
  applyLayoutArrangement = () => {},
  changedAt = "",
  targetIndex = null,
  touchLayout = () => {}
} = {}) {
  const layout = targetState?.layouts?.[layoutId];
  if (!targetState?.containers?.[containerId] || !layout) return false;
  if (parentId && !targetState.containers?.[parentId]) return false;
  const previousArrangement = clonePlain(layout.arrangement || createEmptyLayoutArrangement());
  const previousRootContainerIds = [...(layout.rootContainerIds || [])];
  const previousParentId = targetState.containers[containerId].parentId || null;
  const rollback = () => {
    layout.arrangement = previousArrangement;
    layout.rootContainerIds = previousRootContainerIds;
    targetState.containers[containerId].parentId = previousParentId;
    if (layoutId === activeLayoutId) applyLayoutArrangement(layoutId);
    return false;
  };
  targetState.containers[containerId].parentId = parentId || null;
  if (!ensureLayoutContainerPlacement(targetState, layout, containerId)) return rollback();
  if (parentId) {
    if (!moveContainerInLayoutArrangement(targetState, layout, containerId, parentId, targetIndex)) return rollback();
    targetState.collapsedContainers[parentId] = false;
  } else {
    const arrangement = layout.arrangement || createEmptyLayoutArrangement();
    arrangement.rootContainerIds = (arrangement.rootContainerIds || []).filter((id) => id !== containerId);
    arrangement.rootContainerIds.push(containerId);
    if (arrangement.containers?.[containerId]) arrangement.containers[containerId].parentId = "";
    layout.rootContainerIds = [...arrangement.rootContainerIds];
  }
  normalizeLayoutArrangement(layout, targetState);
  touchLayout(layoutId, changedAt);
  if (layoutId === activeLayoutId) applyLayoutArrangement(layoutId);
  return true;
}

export function detachItemFromContainerInState(targetState, itemId, containerId, {
  activeLayoutId = "",
  changedAt = "",
  cleanupEmptyContainers = () => {},
  touchContainer = () => {},
  touchItem = () => {},
  touchLayout = () => {}
} = {}) {
  const item = targetState?.items?.[itemId];
  const container = containerId ? targetState?.containers?.[containerId] : null;
  if (!item || !container) return false;
  container.itemIds = (container.itemIds || []).filter((id) => id !== itemId);
  container.order = (container.order || []).filter((entry) => !(entry.type === "item" && entry.id === itemId));
  item.containerId = null;
  touchItem(itemId, changedAt);
  touchContainer(containerId, changedAt);
  touchLayout(activeLayoutId, changedAt);
  removeItemFromLayoutArrangement(targetState.layouts?.[activeLayoutId], itemId);
  delete targetState.packedItems?.[itemId];
  cleanupEmptyContainers(containerId);
  return true;
}

export function removeContainerFromLayoutOnlyInState(targetState, layout, containerId, {
  changedAt = "",
  deleteUnusedLayoutContainerEntity = () => {},
  markEdited = () => {},
  markRecordActivePublicCatalog = () => {}
} = {}) {
  if (!layout || !targetState?.containers?.[containerId]) return false;
  const arrangement = normalizeLayoutArrangement(layout, targetState);
  const placement = arrangement.containers?.[containerId];
  if (!placement && !(arrangement.rootContainerIds || []).includes(containerId)) return false;
  const removedContainerIds = new Set();
  const collect = (id) => {
    if (!id || removedContainerIds.has(id)) return;
    removedContainerIds.add(id);
    (arrangement.containers?.[id]?.childIds || []).forEach(collect);
  };
  collect(containerId);
  const isRoot = (arrangement.rootContainerIds || []).includes(containerId);
  const parentId = placement?.parentId || "";
  if (isRoot) {
    arrangement.rootContainerIds = (arrangement.rootContainerIds || []).filter((id) => id !== containerId);
    layout.rootContainerIds = [...arrangement.rootContainerIds];
    markRecordActivePublicCatalog(targetState.containers[containerId]);
    markEdited(targetState.containers[containerId], changedAt);
  } else if (parentId && arrangement.containers?.[parentId]) {
    const parent = arrangement.containers[parentId];
    parent.childIds = (parent.childIds || []).filter((id) => id !== containerId);
    parent.order = (parent.order || []).filter((entry) => !(entry?.type === "container" && entry.id === containerId));
  }
  Object.entries(arrangement.items || {}).forEach(([itemId, itemContainerId]) => {
    if (!removedContainerIds.has(itemContainerId)) return;
    delete arrangement.items[itemId];
    delete arrangement.packedItems?.[itemId];
    if (targetState.items?.[itemId]) {
      markRecordActivePublicCatalog(targetState.items[itemId]);
      markEdited(targetState.items[itemId], changedAt);
    }
  });
  removedContainerIds.forEach((id) => {
    delete arrangement.containers[id];
    delete targetState.collapsedContainers?.[id];
    if (id === containerId && isRoot) return;
    deleteUnusedLayoutContainerEntity(id, layout.id);
  });
  if (parentId) cleanupEmptyContainersInLayoutArrangement(layout, parentId);
  return true;
}

export function moveRootColumnInState(targetState, layoutId, containerId, targetIndex, {
  touchLayout = () => {}
} = {}) {
  const layout = targetState?.layouts?.[layoutId];
  if (!layout || !(layout.rootContainerIds || []).includes(containerId)) return false;
  layout.rootContainerIds = layout.rootContainerIds.filter((id) => id !== containerId);
  const index = Math.max(0, Math.min(Number(targetIndex) || 0, layout.rootContainerIds.length));
  layout.rootContainerIds.splice(index, 0, containerId);
  touchLayout(layoutId);
  return true;
}

export function createGroupFromItemsInState(targetState, layoutId, itemId, targetItemId, {
  changedAt = "",
  currentEditMeta = () => ({}),
  groupId = "",
  groupName = "Новый пакет",
  markRecordActivePublicCatalog = () => {},
  touchLayout = () => {}
} = {}) {
  if (!groupId || itemId === targetItemId) return null;
  const layout = targetState?.layouts?.[layoutId];
  const item = targetState?.items?.[itemId];
  const targetItem = targetState?.items?.[targetItemId];
  const sourceContainerId = getItemContainerIdInLayout(targetState, layout, itemId);
  const targetContainerId = getItemContainerIdInLayout(targetState, layout, targetItemId);
  const targetParent = ensureLayoutContainerPlacement(targetState, layout, targetContainerId);
  if (!layout || !item || !targetItem || !sourceContainerId || !targetContainerId || !targetParent) return null;

  const targetIndex = (targetParent.order || []).findIndex((entry) => entry.type === "item" && entry.id === targetItemId);
  const sourceIndexInTarget = sourceContainerId === targetContainerId
    ? (targetParent.order || []).findIndex((entry) => entry.type === "item" && entry.id === itemId)
    : -1;
  const insertIndex = Math.max(0, targetIndex - (sourceIndexInTarget >= 0 && sourceIndexInTarget < targetIndex ? 1 : 0));

  targetState.containers[groupId] = {
    id: groupId,
    name: groupName,
    parentId: null,
    childIds: [],
    itemIds: [targetItemId, itemId],
    order: [
      { type: "item", id: targetItemId },
      { type: "item", id: itemId }
    ],
    ...currentEditMeta(changedAt)
  };
  markRecordActivePublicCatalog(targetState.containers[groupId]);

  removeItemFromLayoutArrangement(layout, itemId);
  removeItemFromLayoutArrangement(layout, targetItemId);
  layout.arrangement.containers[groupId] = {
    parentId: targetContainerId,
    itemIds: [targetItemId, itemId],
    childIds: [],
    order: [
      { type: "item", id: targetItemId },
      { type: "item", id: itemId }
    ]
  };
  layout.arrangement.items[targetItemId] = groupId;
  layout.arrangement.items[itemId] = groupId;
  targetParent.childIds = Array.isArray(targetParent.childIds) ? targetParent.childIds.filter((id) => id !== groupId) : [];
  targetParent.childIds.push(groupId);
  targetParent.order = Array.isArray(targetParent.order)
    ? targetParent.order.filter((entry) => !(entry?.type === "container" && entry.id === groupId))
    : [];
  targetParent.order.splice(Math.min(insertIndex, targetParent.order.length), 0, { type: "container", id: groupId });
  touchLayout(layoutId, changedAt);
  targetState.collapsedContainers[groupId] = false;
  if (sourceContainerId !== targetContainerId) cleanupEmptyContainersInLayoutArrangement(layout, sourceContainerId);
  return { groupId, sourceContainerId, targetContainerId };
}

export function cleanupEmptyContainersInLayoutArrangement(layout, containerId) {
  const arrangement = layout?.arrangement;
  if (!arrangement || typeof arrangement !== "object") return false;
  let currentId = containerId;
  let changed = false;
  while (currentId) {
    const placement = arrangement.containers?.[currentId];
    if (!placement) break;
    const hasItems = (placement.itemIds || []).some((id) => arrangement.items?.[id] === currentId);
    const hasChildren = (placement.childIds || []).some((id) => arrangement.containers?.[id]);
    if (hasItems || hasChildren || (arrangement.rootContainerIds || []).includes(currentId)) break;
    const parentId = placement.parentId || "";
    if (parentId) {
      const parent = arrangement.containers?.[parentId];
      if (parent) {
        parent.childIds = (parent.childIds || []).filter((id) => id !== currentId);
        parent.order = (parent.order || []).filter((entry) => !(entry?.type === "container" && entry.id === currentId));
      }
    }
    delete arrangement.containers[currentId];
    changed = true;
    currentId = parentId;
  }
  return changed;
}

export function touchLayoutsReferencingItemInState(targetState, itemId, {
  changedAt = "",
  markEdited = () => {}
} = {}) {
  Object.values(targetState?.layouts || {}).forEach((layout) => {
    const arrangement = layout?.arrangement;
    const hasItem = Boolean(
      arrangement?.items?.[itemId] ||
      Object.values(arrangement?.containers || {}).some((placement) => {
        if (!placement || typeof placement !== "object") return false;
        if ((placement.itemIds || []).includes(itemId)) return true;
        return (placement.order || []).some((entry) => entry?.type === "item" && entry.id === itemId);
      })
    );
    if (hasItem) markEdited(layout, changedAt);
  });
}
