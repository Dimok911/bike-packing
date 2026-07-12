import {
  getLayoutContainerIdSet,
  getLayoutItemIdSet
} from "./layout-ops.js";

export const ITEM_AVAILABILITY_STATUS_AVAILABLE = "available";
export const ITEM_AVAILABILITY_STATUS_LOST = "lost";
export const ITEM_AVAILABILITY_STATUS_BROKEN = "broken";
export const ITEM_AVAILABILITY_STATUS_RETIRED = "retired";

export const ITEM_AVAILABILITY_STATUS_VALUES = [
  ITEM_AVAILABILITY_STATUS_AVAILABLE,
  ITEM_AVAILABILITY_STATUS_LOST,
  ITEM_AVAILABILITY_STATUS_BROKEN,
  ITEM_AVAILABILITY_STATUS_RETIRED
];

export function isLayoutLocked(layout) {
  return Boolean(layout?.locked);
}

export function selectUnlockedLayoutTargetId(layouts = [], preferredLayoutId = "") {
  const candidates = Array.isArray(layouts) ? layouts : [];
  const preferred = candidates.find((layout) => layout?.id === preferredLayoutId);
  if (preferred && !isLayoutLocked(preferred)) return preferred.id;
  return candidates.find((layout) => layout?.id && !isLayoutLocked(layout))?.id || "";
}

export function applyLayoutLocked(layout, locked) {
  if (!layout) return false;
  const nextLocked = Boolean(locked);
  if (Boolean(layout.locked) === nextLocked) return false;
  if (nextLocked) {
    layout.locked = true;
  } else {
    delete layout.locked;
  }
  return true;
}

export function normalizeItemAvailabilityStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ITEM_AVAILABILITY_STATUS_VALUES.includes(status)
    ? status
    : ITEM_AVAILABILITY_STATUS_AVAILABLE;
}

export function isItemUnavailableForPacking(item) {
  return normalizeItemAvailabilityStatus(item?.availabilityStatus) !== ITEM_AVAILABILITY_STATUS_AVAILABLE;
}

export function itemAvailabilityBlocksPlacement(item, selectedStatus = undefined) {
  return isItemUnavailableForPacking(item) ||
    (selectedStatus !== undefined && normalizeItemAvailabilityStatus(selectedStatus) !== ITEM_AVAILABILITY_STATUS_AVAILABLE);
}

export function unavailableSnapshotItems(sourceSnapshot) {
  return Object.entries(sourceSnapshot?.items || {})
    .filter(([, item]) => isItemUnavailableForPacking(item))
    .map(([id, item]) => ({
      id,
      name: item?.name || id,
      status: normalizeItemAvailabilityStatus(item?.availabilityStatus)
    }));
}

export function itemPlacementSnapshotChanged(initialSnapshot, currentSnapshot) {
  return String(initialSnapshot?.containerId || "") !== String(currentSnapshot?.containerId || "");
}

export function containerPlacementSnapshotChanged(initialSnapshot, currentSnapshot) {
  return ["parentId", "parentIndex", "layoutRootIds"].some((key) =>
    String(initialSnapshot?.[key] ?? "") !== String(currentSnapshot?.[key] ?? "")
  );
}

export function applyItemAvailabilityStatus(item, status) {
  if (!item) return false;
  const nextStatus = normalizeItemAvailabilityStatus(status);
  const previousStatus = normalizeItemAvailabilityStatus(item.availabilityStatus);
  if (previousStatus === nextStatus) return false;
  if (nextStatus === ITEM_AVAILABILITY_STATUS_AVAILABLE) {
    delete item.availabilityStatus;
  } else {
    item.availabilityStatus = nextStatus;
  }
  return true;
}

export function lockedLayoutsContainingItem(targetState, itemId) {
  if (!targetState || !itemId) return [];
  return Object.values(targetState.layouts || {}).filter((layout) =>
    isLayoutLocked(layout) && getLayoutItemIdSet(targetState, layout).has(itemId)
  );
}

export function lockedLayoutsContainingContainer(targetState, containerId) {
  if (!targetState || !containerId) return [];
  return Object.values(targetState.layouts || {}).filter((layout) =>
    isLayoutLocked(layout) && getLayoutContainerIdSet(targetState, layout).has(containerId)
  );
}

export function lockedLayoutsContainingNestedContainer(targetState, containerId) {
  return lockedLayoutsContainingContainer(targetState, containerId)
    .filter((layout) => {
      const rootIds = new Set([
        ...(Array.isArray(layout.rootContainerIds) ? layout.rootContainerIds : []),
        ...(Array.isArray(layout.arrangement?.rootContainerIds) ? layout.arrangement.rootContainerIds : [])
      ]);
      return !rootIds.has(containerId);
    });
}

export function lockedLayoutMutationBlocked(targetState, layoutId) {
  return isLayoutLocked(targetState?.layouts?.[layoutId]);
}
