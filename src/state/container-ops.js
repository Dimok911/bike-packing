import { createItemDuplicateRecord } from "./item-ops.js";
import {
  createEmptyLayoutArrangement,
  uniqueLayoutIds
} from "./layout-arrangement.js";
import { ensureLayoutContainerPlacement } from "./layout-ops.js";

export async function createRootContainerDuplicateRecord(container, {
  changedAt = "",
  copyName = (name) => name,
  copyPhotos = async () => [],
  currentEditMeta = () => ({}),
  id = "",
  normalizeContainerColor = (value) => value
} = {}) {
  if (!container || container.parentId || !id) return null;
  return {
    ...container,
    id,
    name: copyName(container.name),
    parentId: null,
    childIds: [],
    itemIds: [],
    order: [],
    color: normalizeContainerColor(container.color),
    photos: await copyPhotos(container, { changedAt }),
    createdAt: changedAt,
    ...currentEditMeta(changedAt)
  };
}

export async function duplicateRootContainerInState(targetState, containerId, {
  addToLayoutId = "",
  changedAt = "",
  copyName = (name) => name,
  copyPhotos = async () => [],
  currentEditMeta = () => ({}),
  id = "",
  markRecordActivePublicCatalog = () => {},
  normalizeContainerColor = (value) => value,
  touchLayout = () => {}
} = {}) {
  const container = targetState?.containers?.[containerId];
  if (!container || container.parentId || !id) return null;
  const record = await createRootContainerDuplicateRecord(container, {
    changedAt,
    copyName,
    copyPhotos,
    currentEditMeta,
    id,
    normalizeContainerColor
  });
  if (!record) return null;
  targetState.containers[id] = record;
  markRecordActivePublicCatalog(targetState.containers[id]);
  const targetLayout = targetState.layouts?.[addToLayoutId];
  if (targetLayout && !(targetLayout.rootContainerIds || []).includes(id)) {
    targetLayout.rootContainerIds = [...(targetLayout.rootContainerIds || []), id];
    touchLayout(addToLayoutId, changedAt);
  }
  return { id, addedToLayout: Boolean(targetLayout) };
}

export async function createContainerTreeDuplicateRecord(container, {
  changedAt = "",
  cloneEntity = (record) => ({ ...(record || {}) }),
  copyName = (name) => name,
  copyPhotos = async () => [],
  currentEditMeta = () => ({}),
  id = "",
  isTop = false,
  normalizeContainerColor = (value) => value,
  parentId = null,
  preserveTopName = false
} = {}) {
  if (!container || !id) return null;
  const source = cloneEntity(container);
  return {
    ...source,
    id,
    name: isTop && !preserveTopName ? copyName(source.name) : source.name,
    parentId: parentId || null,
    childIds: [],
    itemIds: [],
    order: [],
    color: normalizeContainerColor(source.color),
    photos: await copyPhotos(container, { changedAt }),
    createdAt: changedAt,
    ...currentEditMeta(changedAt)
  };
}

export function createSubcontainerInLayoutState(targetState, parentId, targetLayoutId, {
  changedAt = "",
  currentCreateMeta = () => ({}),
  id = "",
  markRecordActivePublicCatalog = () => {},
  name = "",
  normalizeLayoutArrangement = () => {},
  touchContainer = () => {},
  touchLayout = () => {}
} = {}) {
  const layout = targetState?.layouts?.[targetLayoutId];
  const parent = targetState?.containers?.[parentId];
  const normalizedName = String(name || "").trim();
  if (!targetState?.containers || !layout || !parent || !id || !normalizedName || targetState.containers[id]) {
    return null;
  }

  const parentPlacement = ensureLayoutContainerPlacement(targetState, layout, parentId);
  if (!parentPlacement) return null;

  targetState.containers[id] = {
    id,
    name: normalizedName,
    parentId,
    childIds: [],
    itemIds: [],
    order: [],
    weight: 0,
    ...currentCreateMeta(changedAt)
  };
  markRecordActivePublicCatalog(targetState.containers[id]);

  layout.arrangement.containers[id] = {
    parentId,
    itemIds: [],
    childIds: [],
    order: []
  };

  parent.childIds = Array.isArray(parent.childIds) ? parent.childIds.filter((childId) => childId !== id) : [];
  parent.childIds.push(id);
  parent.order = Array.isArray(parent.order)
    ? parent.order.filter((entry) => !(entry?.type === "container" && entry.id === id))
    : [];
  parent.order.push({ type: "container", id });

  parentPlacement.childIds = Array.isArray(parentPlacement.childIds) ? parentPlacement.childIds.filter((childId) => childId !== id) : [];
  parentPlacement.childIds.push(id);
  parentPlacement.order = Array.isArray(parentPlacement.order)
    ? parentPlacement.order.filter((entry) => !(entry?.type === "container" && entry.id === id))
    : [];
  parentPlacement.order.push({ type: "container", id });

  normalizeLayoutArrangement(layout, targetState);
  touchContainer(parent, changedAt);
  touchLayout(targetLayoutId, changedAt);
  return { id, parentId, layoutId: targetLayoutId };
}

export async function duplicateContainerSnapshotRecords(sourceSnapshot, {
  changedAt = "",
  cloneEntity = (record) => ({ ...(record || {}) }),
  copyContainerName = (name) => name,
  copyPhotos = async () => [],
  currentEditMeta = () => ({}),
  mapPublicOrigin = () => {},
  mapRecordToTarget = () => {},
  normalizeContainerColor = (value) => value,
  sourceIsPublicCopy = false,
  targetParentId = null,
  targetState = null
} = {}) {
  if (!sourceSnapshot?.rootId || !targetState?.containers || !targetState?.items) {
    return { rootId: "", copiedPlacements: {}, copiedItemContainers: {} };
  }

  targetState.collapsedContainers = targetState.collapsedContainers && typeof targetState.collapsedContainers === "object"
    ? targetState.collapsedContainers
    : {};
  targetState.packedItems = targetState.packedItems && typeof targetState.packedItems === "object"
    ? targetState.packedItems
    : {};

  const copiedPlacements = {};
  const copiedItemContainers = {};

  const copyItemTree = async (itemId, parentId) => {
    const item = sourceSnapshot.items?.[itemId];
    if (!item) return "";
    const nextId = `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const record = await createItemDuplicateRecord(item, {
      changedAt,
      cloneEntity,
      containerId: parentId,
      copyPhotos,
      currentEditMeta,
      id: nextId,
      preserveName: true
    });
    if (!record) return "";
    targetState.items[nextId] = record;
    mapPublicOrigin(targetState.items[nextId], item, "item", itemId);
    mapRecordToTarget(targetState.items[nextId]);
    copiedItemContainers[nextId] = parentId;
    delete targetState.packedItems[nextId];
    return nextId;
  };

  const copyContainerTree = async (sourceId, parentId, isTop = false) => {
    const container = sourceSnapshot.containers?.[sourceId];
    if (!container) return "";
    const nextId = `container-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const record = await createContainerTreeDuplicateRecord(container, {
      changedAt,
      cloneEntity,
      copyName: copyContainerName,
      copyPhotos,
      currentEditMeta,
      id: nextId,
      isTop,
      normalizeContainerColor,
      parentId,
      preserveTopName: sourceIsPublicCopy
    });
    if (!record) return "";
    targetState.containers[nextId] = record;
    mapPublicOrigin(targetState.containers[nextId], container, "container", sourceId);
    mapRecordToTarget(targetState.containers[nextId]);
    targetState.collapsedContainers[nextId] = false;

    const copiedItems = new Map();
    const copiedContainers = new Map();
    const copyChildContainer = async (childId) => {
      const id = await copyContainerTree(childId, nextId);
      if (id) copiedContainers.set(childId, id);
      return id;
    };
    const copyChildItem = async (childItemId) => {
      const id = await copyItemTree(childItemId, nextId);
      if (id) copiedItems.set(childItemId, id);
      return id;
    };

    targetState.containers[nextId].childIds = (await Promise.all((container.childIds || []).map(copyChildContainer))).filter(Boolean);
    targetState.containers[nextId].itemIds = (await Promise.all((container.itemIds || []).map(copyChildItem))).filter(Boolean);
    targetState.containers[nextId].order = (container.order || []).map((entry) => {
      if (entry?.type === "container") {
        const id = copiedContainers.get(entry.id);
        return id ? { type: "container", id } : null;
      }
      if (entry?.type === "item") {
        const id = copiedItems.get(entry.id);
        return id ? { type: "item", id } : null;
      }
      return null;
    }).filter(Boolean);
    if (!targetState.containers[nextId].order.length) {
      targetState.containers[nextId].order = [
        ...targetState.containers[nextId].itemIds.map((id) => ({ type: "item", id })),
        ...targetState.containers[nextId].childIds.map((id) => ({ type: "container", id }))
      ];
    }
    copiedPlacements[nextId] = {
      parentId: parentId || "",
      itemIds: [...targetState.containers[nextId].itemIds],
      childIds: [...targetState.containers[nextId].childIds],
      order: targetState.containers[nextId].order.map((entry) => ({ type: entry.type, id: entry.id }))
    };
    return nextId;
  };

  const rootId = await copyContainerTree(sourceSnapshot.rootId, targetParentId || null, true);
  return { rootId, copiedPlacements, copiedItemContainers };
}

export function placeDuplicatedContainerSnapshotInLayoutState(targetState, targetLayoutId, nextRootId, {
  changedAt = "",
  copiedItemContainers = {},
  copiedPlacements = {},
  normalizeLayoutArrangement = () => {},
  targetParentId = "",
  targetIndex = null,
  touchContainer = () => {},
  touchLayout = () => {}
} = {}) {
  const targetLayout = targetState?.layouts?.[targetLayoutId];
  if (!targetState || !targetLayout || !nextRootId || !targetState.containers?.[nextRootId]) return false;

  targetLayout.arrangement = targetLayout.arrangement && typeof targetLayout.arrangement === "object"
    ? targetLayout.arrangement
    : createEmptyLayoutArrangement();
  const arrangement = targetLayout.arrangement;
  arrangement.rootContainerIds = Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : [];
  arrangement.containers = arrangement.containers && typeof arrangement.containers === "object" ? arrangement.containers : {};
  arrangement.items = arrangement.items && typeof arrangement.items === "object" ? arrangement.items : {};
  arrangement.packedItems = arrangement.packedItems && typeof arrangement.packedItems === "object" ? arrangement.packedItems : {};
  Object.assign(arrangement.containers, copiedPlacements);
  Object.assign(arrangement.items, copiedItemContainers);

  if (targetParentId) {
    const parent = targetState.containers?.[targetParentId];
    const parentPlacement = ensureLayoutContainerPlacement(targetState, targetLayout, targetParentId);
    if (!parent || !parentPlacement || !copiedPlacements[nextRootId]) return false;
    parent.childIds = Array.isArray(parent.childIds) ? parent.childIds.filter((id) => id !== nextRootId) : [];
    parent.order = Array.isArray(parent.order)
      ? parent.order.filter((entry) => !(entry?.type === "container" && entry.id === nextRootId))
      : [];
    const liveIndex = targetIndex === null
      ? parent.order.length
      : Math.max(0, Math.min(Number(targetIndex) || 0, parent.order.length));
    parent.childIds.push(nextRootId);
    parent.order.splice(liveIndex, 0, { type: "container", id: nextRootId });
    parentPlacement.childIds = Array.isArray(parentPlacement.childIds) ? parentPlacement.childIds.filter((id) => id !== nextRootId) : [];
    parentPlacement.order = Array.isArray(parentPlacement.order)
      ? parentPlacement.order.filter((entry) => !(entry?.type === "container" && entry.id === nextRootId))
      : [];
    const placementIndex = targetIndex === null
      ? parentPlacement.order.length
      : Math.max(0, Math.min(Number(targetIndex) || 0, parentPlacement.order.length));
    parentPlacement.childIds.push(nextRootId);
    parentPlacement.order.splice(placementIndex, 0, { type: "container", id: nextRootId });
    arrangement.rootContainerIds = arrangement.rootContainerIds.filter((id) => id !== nextRootId);
    copiedPlacements[nextRootId].parentId = targetParentId;
    targetState.collapsedContainers[targetParentId] = false;
    touchContainer(targetParentId, changedAt);
  } else {
    if (!copiedPlacements[nextRootId]) return false;
    copiedPlacements[nextRootId].parentId = "";
    targetState.containers[nextRootId].parentId = null;
    const rootIds = uniqueLayoutIds([
      ...(arrangement.rootContainerIds || []),
      ...(targetLayout.rootContainerIds || [])
    ]).filter((id) => id !== nextRootId);
    const index = targetIndex === null
      ? rootIds.length
      : Math.max(0, Math.min(Number(targetIndex) || 0, rootIds.length));
    rootIds.splice(index, 0, nextRootId);
    arrangement.rootContainerIds = rootIds;
  }

  targetLayout.rootContainerIds = [...arrangement.rootContainerIds];
  normalizeLayoutArrangement(targetLayout, targetState);
  touchLayout(targetLayoutId, changedAt);
  return true;
}

export function isContainerUsedInOtherLayouts(targetState, containerId, removedFromLayoutId = "") {
  if (!containerId) return false;
  return Object.values(targetState?.layouts || {}).some((layout) => {
    if (!layout || layout.id === removedFromLayoutId) return false;
    const arrangement = layout.arrangement;
    if (!arrangement || typeof arrangement !== "object") return false;
    if ((arrangement.rootContainerIds || layout.rootContainerIds || []).includes(containerId)) return true;
    return Boolean(arrangement.containers?.[containerId]);
  });
}

export function deleteContainerEntityRecordFromState(targetState, containerId, {
  beforeDeleteContainer = () => {}
} = {}) {
  const container = targetState?.containers?.[containerId];
  if (!container) return false;
  beforeDeleteContainer(container, containerId);
  delete targetState.collapsedContainers?.[containerId];
  delete targetState.containers[containerId];
  return true;
}

export function deleteUnusedLayoutContainerEntityFromState(targetState, containerId, removedFromLayoutId = "", options = {}) {
  if (!containerId || !targetState?.containers?.[containerId]) return false;
  if (isContainerUsedInOtherLayouts(targetState, containerId, removedFromLayoutId)) return false;
  return deleteContainerEntityRecordFromState(targetState, containerId, options);
}

export function removeContainerTreeFromState(targetState, containerId, options = {}) {
  const container = targetState?.containers?.[containerId];
  if (!container) return false;
  [...(container.childIds || [])].forEach((childId) => removeContainerTreeFromState(targetState, childId, options));
  return deleteContainerEntityRecordFromState(targetState, containerId, options);
}

export function getContainerItemIdsDeepForState(targetState, containerId, {
  includeItem = () => true
} = {}) {
  const container = targetState?.containers?.[containerId];
  if (!container) return [];
  return [
    ...(container.itemIds || []),
    ...(container.childIds || []).flatMap((childId) =>
      getContainerItemIdsDeepForState(targetState, childId, { includeItem })
    )
  ].filter((itemId) => targetState.items?.[itemId] && includeItem(targetState.items[itemId], itemId));
}

export function clearRootContainerContentsInState(targetState, containerId, {
  changedAt = "",
  itemIds = [],
  markEdited = () => {},
  markItemActive = () => {},
  removeContainerTree = () => {}
} = {}) {
  const container = targetState?.containers?.[containerId];
  if (!container || container.parentId) return false;
  itemIds.forEach((itemId) => {
    const item = targetState.items?.[itemId];
    if (!item) return;
    markItemActive(item);
    item.containerId = "";
    markEdited(item, changedAt);
    delete targetState.packedItems?.[itemId];
  });
  [...(container.childIds || [])].forEach(removeContainerTree);
  container.childIds = [];
  container.itemIds = [];
  container.order = [];
  delete targetState.collapsedContainers?.[containerId];
  markEdited(container, changedAt);
  return true;
}

function removeContainerPlacementTreeFromLayout(layout, containerId) {
  const arrangement = layout?.arrangement;
  const rootIds = Array.isArray(arrangement?.rootContainerIds)
    ? arrangement.rootContainerIds
    : (layout?.rootContainerIds || []);
  const hasPlacement = Boolean(arrangement?.containers?.[containerId]);
  if (!hasPlacement && !rootIds.includes(containerId)) {
    return { changed: false, containerIds: new Set(), itemIds: new Set() };
  }

  const containerIds = new Set();
  const itemIds = new Set();
  const collect = (id) => {
    if (!id || containerIds.has(id)) return;
    containerIds.add(id);
    const placement = arrangement?.containers?.[id];
    if (!placement) return;
    (placement.itemIds || []).forEach((itemId) => itemIds.add(itemId));
    (placement.order || []).forEach((entry) => {
      if (entry?.type === "item") itemIds.add(entry.id);
      if (entry?.type === "container") collect(entry.id);
    });
    (placement.childIds || []).forEach(collect);
  };
  collect(containerId);

  if (arrangement && typeof arrangement === "object") {
    arrangement.rootContainerIds = (arrangement.rootContainerIds || []).filter((id) => !containerIds.has(id));
    Object.values(arrangement.containers || {}).forEach((placement) => {
      if (!placement || typeof placement !== "object") return;
      placement.childIds = (placement.childIds || []).filter((id) => !containerIds.has(id));
      placement.order = (placement.order || []).filter((entry) =>
        !(entry?.type === "container" && containerIds.has(entry.id))
      );
    });
    containerIds.forEach((id) => delete arrangement.containers?.[id]);
    Object.entries(arrangement.items || {}).forEach(([itemId, placedContainerId]) => {
      if (!containerIds.has(placedContainerId)) return;
      itemIds.add(itemId);
      delete arrangement.items[itemId];
    });
    itemIds.forEach((itemId) => delete arrangement.packedItems?.[itemId]);
    layout.rootContainerIds = [...arrangement.rootContainerIds];
  } else {
    layout.rootContainerIds = (layout.rootContainerIds || []).filter((id) => id !== containerId);
  }
  return { changed: true, containerIds, itemIds };
}

export function deleteRootContainerFromState(targetState, containerId, {
  beforeDeleteContainer = () => {},
  changedAt = "",
  markEdited = () => {}
} = {}) {
  const container = targetState?.containers?.[containerId];
  if (!container || (container.parentId && container.nestable !== true)) return false;
  const removedContainerIds = new Set();
  const affectedItemIds = new Set(getContainerItemIdsDeepForState(targetState, containerId));
  const collectEntityTree = (id) => {
    if (!id || removedContainerIds.has(id)) return;
    removedContainerIds.add(id);
    (targetState.containers?.[id]?.childIds || []).forEach(collectEntityTree);
  };
  collectEntityTree(containerId);
  Object.values(targetState.layouts || {}).forEach((layout) => {
    const removed = removeContainerPlacementTreeFromLayout(layout, containerId);
    if (!removed.changed) return;
    removed.containerIds.forEach((id) => removedContainerIds.add(id));
    removed.itemIds.forEach((id) => affectedItemIds.add(id));
    markEdited(layout, changedAt);
  });
  affectedItemIds.forEach((itemId) => {
    if (!targetState.items?.[itemId]) return;
    targetState.items[itemId].containerId = "";
    markEdited(targetState.items[itemId], changedAt);
    delete targetState.packedItems?.[itemId];
  });
  Object.values(targetState.containers || {}).forEach((record) => {
    if (!record || removedContainerIds.has(record.id)) return;
    const previousChildCount = (record.childIds || []).length;
    const previousOrderCount = (record.order || []).length;
    record.childIds = (record.childIds || []).filter((id) => !removedContainerIds.has(id));
    record.order = (record.order || []).filter((entry) =>
      !(entry?.type === "container" && removedContainerIds.has(entry.id))
    );
    if (record.childIds.length !== previousChildCount || record.order.length !== previousOrderCount) {
      markEdited(record, changedAt);
    }
  });
  removedContainerIds.forEach((id) => {
    if (id === containerId) return;
    const removedContainer = targetState.containers?.[id];
    if (!removedContainer) return;
    if (removedContainer.nestable === true) {
      removedContainer.parentId = null;
      removedContainer.childIds = [];
      removedContainer.itemIds = [];
      removedContainer.order = [];
      markEdited(removedContainer, changedAt);
      return;
    }
    deleteContainerEntityRecordFromState(targetState, id, { beforeDeleteContainer });
  });
  deleteContainerEntityRecordFromState(targetState, containerId, { beforeDeleteContainer });
  return true;
}

export function cleanupEmptyContainersInState(targetState, containerId, {
  markEdited = () => {},
  removeTemporary = false
} = {}) {
  if (!removeTemporary) return false;
  let currentId = containerId;
  let changed = false;
  while (currentId) {
    const container = targetState?.containers?.[currentId];
    if (!container || !container.parentId) break;
    if (container.nestable === true) break;
    if ((container.itemIds || []).length || (container.childIds || []).length) break;
    const parent = targetState.containers?.[container.parentId];
    if (!parent) break;
    parent.childIds = (parent.childIds || []).filter((id) => id !== currentId);
    parent.order = (parent.order || []).filter((entry) => !(entry.type === "container" && entry.id === currentId));
    markEdited(parent);
    delete targetState.collapsedContainers?.[currentId];
    delete targetState.containers[currentId];
    changed = true;
    currentId = parent.id;
  }
  return changed;
}
