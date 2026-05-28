import {
  addItemToLayoutArrangement,
  ensureLayoutContainerPlacement,
  getItemContainerIdInLayout,
  placeExistingItemInLayoutInState
} from "./layout-ops.js";

export async function createItemDuplicateRecord(item, {
  changedAt = "",
  cloneEntity = (record) => ({ ...(record || {}) }),
  containerId = "",
  copyName = (name) => name,
  copyPhotos = async () => [],
  currentEditMeta = () => ({}),
  id = "",
  preserveName = false
} = {}) {
  if (!item || !id) return null;
  const source = cloneEntity(item);
  return {
    ...source,
    id,
    name: preserveName ? source.name : copyName(source.name),
    containerId,
    photos: await copyPhotos(item, { changedAt }),
    createdAt: changedAt,
    ...currentEditMeta(changedAt)
  };
}

export async function copyItemInState(targetState, itemId, {
  activeLayoutId = "",
  changedAt = "",
  copyName = (name) => name,
  copyPhotos = async () => [],
  currentEditMeta = () => ({}),
  id = "",
  keepPlacement = false,
  markRecordActivePublicCatalog = () => {},
  touchLayout = () => {}
} = {}) {
  const item = targetState?.items?.[itemId];
  if (!item || !id) return null;
  const layout = targetState.layouts?.[activeLayoutId];
  const containerId = keepPlacement ? getItemContainerIdInLayout(targetState, layout, itemId) : "";
  const placement = containerId ? ensureLayoutContainerPlacement(targetState, layout, containerId) : null;
  const record = await createItemDuplicateRecord(item, {
    changedAt,
    copyName,
    copyPhotos,
    currentEditMeta,
    id
  });
  if (!record) return null;
  targetState.items[id] = record;
  markRecordActivePublicCatalog(targetState.items[id]);
  if (placement) {
    const orderIndex = (placement.order || []).findIndex((entry) => entry.type === "item" && entry.id === itemId);
    addItemToLayoutArrangement(targetState, layout, id, containerId, orderIndex >= 0 ? orderIndex + 1 : null);
    touchLayout(activeLayoutId, changedAt);
  }
  delete targetState.packedItems?.[id];
  return { id, containerId, placed: Boolean(placement) };
}

export async function duplicateItemToContainerInLayoutState(targetState, itemId, targetContainerId, targetLayoutId, {
  activeLayoutId = "",
  applyLayoutArrangement = () => {},
  changedAt = "",
  cloneEntity = (record) => ({ ...(record || {}) }),
  copyName = (name) => name,
  copyPhotos = async () => [],
  currentEditMeta = () => ({}),
  id = "",
  mapRecordToTarget = () => {},
  markRecordOrigin = () => {},
  preserveName = false,
  touchLayout = () => {}
} = {}) {
  const source = targetState?.items?.[itemId];
  const targetLayout = targetState?.layouts?.[targetLayoutId];
  if (!source || !targetLayout || !id) return null;
  const record = await createItemDuplicateRecord(source, {
    changedAt,
    cloneEntity,
    copyName,
    copyPhotos,
    currentEditMeta,
    id,
    preserveName
  });
  if (!record) return null;
  targetState.items[id] = record;
  markRecordOrigin(targetState.items[id], source, "item", itemId);
  mapRecordToTarget(targetState.items[id]);
  const placed = placeExistingItemInLayoutInState(targetState, id, targetContainerId, targetLayoutId, {
    activeLayoutId,
    applyLayoutArrangement,
    changedAt,
    touchLayout
  });
  if (!placed) {
    delete targetState.items[id];
    return null;
  }
  return { id };
}

export async function duplicateSnapshotItemToContainerInLayoutState(targetState, sourceItem, sourceItemId, targetContainerId, targetLayoutId, {
  activeLayoutId = "",
  applyLayoutArrangement = () => {},
  changedAt = "",
  cloneEntity = (record) => ({ ...(record || {}) }),
  copyPhotos = async () => [],
  currentEditMeta = () => ({}),
  id = "",
  mapRecordToTarget = () => {},
  markRecordOrigin = () => {},
  touchLayout = () => {}
} = {}) {
  const targetLayout = targetState?.layouts?.[targetLayoutId];
  if (!sourceItem || !targetLayout || !id) return null;
  const record = await createItemDuplicateRecord(sourceItem, {
    changedAt,
    cloneEntity,
    containerId: targetContainerId,
    copyPhotos,
    currentEditMeta,
    id,
    preserveName: true
  });
  if (!record) return null;
  targetState.items[id] = record;
  markRecordOrigin(targetState.items[id], sourceItem, "item", sourceItemId);
  mapRecordToTarget(targetState.items[id]);
  const placed = placeExistingItemInLayoutInState(targetState, id, targetContainerId, targetLayoutId, {
    activeLayoutId,
    applyLayoutArrangement,
    changedAt,
    touchLayout
  });
  if (!placed) {
    delete targetState.items[id];
    return null;
  }
  return { id };
}

export function deleteItemFromState(targetState, itemId, {
  beforeDeleteItem = () => {},
  changedAt = "",
  cleanupEmptyContainers = () => {},
  markEdited = () => {},
  removeItemFromLayoutArrangement = () => {},
  touchLayoutsReferencingItem = () => {}
} = {}) {
  const item = targetState?.items?.[itemId];
  if (!item) return false;
  const oldContainerId = item.containerId || "";
  beforeDeleteItem(item, itemId);
  Object.values(targetState.containers || {}).forEach((container) => {
    const hadItem = (container.itemIds || []).includes(itemId) ||
      (container.order || []).some((entry) => entry.type === "item" && entry.id === itemId);
    container.itemIds = (container.itemIds || []).filter((id) => id !== itemId);
    container.order = (container.order || []).filter((entry) => !(entry.type === "item" && entry.id === itemId));
    if (hadItem) markEdited(container, changedAt);
  });
  touchLayoutsReferencingItem(itemId, changedAt);
  Object.values(targetState.layouts || {}).forEach((layout) => {
    removeItemFromLayoutArrangement(layout, itemId);
  });
  delete targetState.items[itemId];
  delete targetState.packedItems?.[itemId];
  if (oldContainerId) cleanupEmptyContainers(oldContainerId);
  return true;
}
