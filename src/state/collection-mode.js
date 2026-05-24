export function normalizeCollectionModeState(targetState) {
  if (!targetState || typeof targetState !== "object") return targetState;
  targetState.collectionMode = typeof targetState.collectionMode === "boolean"
    ? targetState.collectionMode
    : false;
  targetState.showOnlyUnpacked = Boolean(targetState.showOnlyUnpacked && targetState.collectionMode);
  return targetState;
}

export function applyCollectionModeFromSource(targetState, sourceState) {
  if (!targetState || typeof targetState !== "object") return targetState;
  targetState.collectionMode = Boolean(sourceState?.collectionMode);
  targetState.showOnlyUnpacked = Boolean(sourceState?.showOnlyUnpacked && targetState.collectionMode);
  return targetState;
}

export function setCollectionModeEnabled(targetState, enabled) {
  if (!targetState || typeof targetState !== "object") return targetState;
  targetState.collectionMode = Boolean(enabled);
  if (!targetState.collectionMode) targetState.showOnlyUnpacked = false;
  return targetState;
}

export function toggleCollectionModeEnabled(targetState) {
  return setCollectionModeEnabled(targetState, !targetState?.collectionMode);
}

export function toggleShowOnlyUnpacked(targetState) {
  if (!targetState || typeof targetState !== "object") return targetState;
  targetState.showOnlyUnpacked = !targetState.showOnlyUnpacked;
  if (targetState.showOnlyUnpacked) targetState.collectionMode = true;
  return targetState;
}

export function isCollectionPackedVisible(targetState, packed) {
  return Boolean(targetState?.collectionMode && packed);
}
