import { createEmptyLayoutArrangement } from "./layout-arrangement.js";

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
