import { normalizeLayoutArrangement } from "./layout-normalize.js";
import {
  addItemToLayoutArrangement,
  getItemContainerIdInLayout,
  getLayoutContainerIdSet,
  removeItemFromLayoutArrangement
} from "./layout-ops.js";
import { clonePlain } from "../utils/json.js";

export function isNestedContainerInLayoutState(targetState, layout, containerId) {
  if (!targetState?.containers?.[containerId] || !layout?.arrangement?.containers?.[containerId]) return false;
  return Boolean(layout.arrangement.containers[containerId].parentId);
}

export function isTemporaryContainerInLayoutState(targetState, layout, containerId) {
  return isNestedContainerInLayoutState(targetState, layout, containerId) &&
    targetState.containers[containerId].nestable !== true;
}

export function isContainerReplacementCandidateInLayoutState(
  targetState,
  layout,
  sourceContainerId,
  replacementContainerId
) {
  if (!layout || sourceContainerId === replacementContainerId) return false;
  const source = targetState?.containers?.[sourceContainerId];
  const replacement = targetState?.containers?.[replacementContainerId];
  const sourcePlacement = layout.arrangement?.containers?.[sourceContainerId];
  if (!source || !replacement || !sourcePlacement) return false;
  if (getLayoutContainerIdSet(targetState, layout).has(replacementContainerId)) return false;
  return !sourcePlacement.parentId || replacement.nestable === true;
}

function replacementRollback(layout, snapshot, layoutId, activeLayoutId, applyLayoutArrangement) {
  layout.arrangement = snapshot.arrangement;
  layout.rootContainerIds = snapshot.rootContainerIds;
  if (layoutId === activeLayoutId) applyLayoutArrangement(layoutId);
  return false;
}

export function replaceItemInLayoutState(targetState, layoutId, sourceItemId, replacementItemId, {
  activeLayoutId = "",
  applyLayoutArrangement = () => {},
  changedAt = "",
  touchLayout = () => {}
} = {}) {
  const layout = targetState?.layouts?.[layoutId];
  if (!layout || sourceItemId === replacementItemId) return false;
  if (!targetState.items?.[sourceItemId] || !targetState.items?.[replacementItemId]) return false;
  const sourceContainerId = getItemContainerIdInLayout(targetState, layout, sourceItemId);
  if (!sourceContainerId || getItemContainerIdInLayout(targetState, layout, replacementItemId)) return false;
  const sourcePlacement = layout.arrangement?.containers?.[sourceContainerId];
  const sourceIndex = (sourcePlacement?.order || [])
    .findIndex((entry) => entry?.type === "item" && entry.id === sourceItemId);
  if (!sourcePlacement || sourceIndex < 0) return false;

  const snapshot = {
    arrangement: clonePlain(layout.arrangement),
    rootContainerIds: [...(layout.rootContainerIds || [])]
  };
  removeItemFromLayoutArrangement(layout, sourceItemId);
  if (!addItemToLayoutArrangement(targetState, layout, replacementItemId, sourceContainerId, sourceIndex)) {
    return replacementRollback(layout, snapshot, layoutId, activeLayoutId, applyLayoutArrangement);
  }
  normalizeLayoutArrangement(layout, targetState);
  if (getItemContainerIdInLayout(targetState, layout, replacementItemId) !== sourceContainerId ||
      getItemContainerIdInLayout(targetState, layout, sourceItemId)) {
    return replacementRollback(layout, snapshot, layoutId, activeLayoutId, applyLayoutArrangement);
  }
  touchLayout(layoutId, changedAt);
  if (layoutId === activeLayoutId) {
    applyLayoutArrangement(layoutId);
    if (targetState.items[replacementItemId].containerId !== sourceContainerId ||
        targetState.items[sourceItemId].containerId) {
      return replacementRollback(layout, snapshot, layoutId, activeLayoutId, applyLayoutArrangement);
    }
  }
  return true;
}

export function replaceContainerInLayoutState(targetState, layoutId, sourceContainerId, replacementContainerId, {
  activeLayoutId = "",
  applyLayoutArrangement = () => {},
  beforeRemoveSource = () => {},
  changedAt = "",
  removeSourceRecord = false,
  touchLayout = () => {}
} = {}) {
  const layout = targetState?.layouts?.[layoutId];
  if (!layout || sourceContainerId === replacementContainerId) return false;
  if (!targetState.containers?.[sourceContainerId] || !targetState.containers?.[replacementContainerId]) return false;
  const arrangement = normalizeLayoutArrangement(layout, targetState);
  const sourcePlacement = arrangement.containers?.[sourceContainerId];
  if (!sourcePlacement || !isContainerReplacementCandidateInLayoutState(
    targetState,
    layout,
    sourceContainerId,
    replacementContainerId
  )) return false;
  const sourceUsedInOtherLayouts = Object.entries(targetState.layouts || {}).some(([otherLayoutId, otherLayout]) =>
    otherLayoutId !== layoutId && getLayoutContainerIdSet(targetState, otherLayout).has(sourceContainerId)
  );

  const snapshot = {
    arrangement: clonePlain(layout.arrangement),
    rootContainerIds: [...(layout.rootContainerIds || [])]
  };
  const replacementPlacement = clonePlain(sourcePlacement);
  arrangement.containers[replacementContainerId] = replacementPlacement;
  delete arrangement.containers[sourceContainerId];
  (replacementPlacement.itemIds || []).forEach((itemId) => {
    arrangement.items[itemId] = replacementContainerId;
  });
  (replacementPlacement.childIds || []).forEach((childId) => {
    if (arrangement.containers[childId]) arrangement.containers[childId].parentId = replacementContainerId;
  });

  if (replacementPlacement.parentId) {
    const parent = arrangement.containers[replacementPlacement.parentId];
    if (!parent) return replacementRollback(layout, snapshot, layoutId, activeLayoutId, applyLayoutArrangement);
    parent.childIds = (parent.childIds || []).map((id) => id === sourceContainerId ? replacementContainerId : id);
    parent.order = (parent.order || []).map((entry) =>
      entry?.type === "container" && entry.id === sourceContainerId
        ? { type: "container", id: replacementContainerId }
        : entry
    );
  } else {
    arrangement.rootContainerIds = (arrangement.rootContainerIds || [])
      .map((id) => id === sourceContainerId ? replacementContainerId : id);
    layout.rootContainerIds = [...arrangement.rootContainerIds];
  }

  normalizeLayoutArrangement(layout, targetState);
  if (!layout.arrangement?.containers?.[replacementContainerId] ||
      layout.arrangement?.containers?.[sourceContainerId]) {
    return replacementRollback(layout, snapshot, layoutId, activeLayoutId, applyLayoutArrangement);
  }
  touchLayout(layoutId, changedAt);
  if (layoutId === activeLayoutId) {
    applyLayoutArrangement(layoutId);
    const replacement = targetState.containers[replacementContainerId];
    const source = targetState.containers[sourceContainerId];
    if (!replacement || !source || source.parentId || source.itemIds?.length || source.childIds?.length) {
      return replacementRollback(layout, snapshot, layoutId, activeLayoutId, applyLayoutArrangement);
    }
  }
  if (removeSourceRecord && !sourceUsedInOtherLayouts) {
    beforeRemoveSource(targetState.containers[sourceContainerId], sourceContainerId);
    delete targetState.containers[sourceContainerId];
    delete targetState.collapsedContainers?.[sourceContainerId];
  }
  return true;
}
