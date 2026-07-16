import { snapshotsEqual } from "../utils/json.js";

function changedMapIds(beforeMap = {}, afterMap = {}) {
  return [...new Set([...Object.keys(beforeMap || {}), ...Object.keys(afterMap || {})])]
    .filter((id) => !snapshotsEqual(beforeMap?.[id], afterMap?.[id]));
}

export function historyActionGroupId({ deviceId = "device", changedAt = "" } = {}) {
  const stamp = String(changedAt || "").trim();
  if (!stamp) return "";
  return `${String(deviceId || "device").trim() || "device"}:${stamp}`.slice(0, 128);
}

export function historyAffectedLayouts(beforeState = {}, afterState = {}, {
  getLayoutContainerIds = () => new Set(),
  getLayoutItemIds = () => new Set()
} = {}) {
  const layoutIds = [...new Set([
    ...Object.keys(beforeState?.layouts || {}),
    ...Object.keys(afterState?.layouts || {})
  ])];
  const affected = new Set(changedMapIds(beforeState?.layouts, afterState?.layouts));
  const changedItemIds = new Set(changedMapIds(beforeState?.items, afterState?.items));
  const changedContainerIds = new Set(changedMapIds(beforeState?.containers, afterState?.containers));

  layoutIds.forEach((layoutId) => {
    const itemIds = new Set([
      ...getLayoutItemIds(beforeState, beforeState?.layouts?.[layoutId]),
      ...getLayoutItemIds(afterState, afterState?.layouts?.[layoutId])
    ]);
    const containerIds = new Set([
      ...getLayoutContainerIds(beforeState, beforeState?.layouts?.[layoutId]),
      ...getLayoutContainerIds(afterState, afterState?.layouts?.[layoutId])
    ]);
    if ([...changedItemIds].some((id) => itemIds.has(id)) || [...changedContainerIds].some((id) => containerIds.has(id))) {
      affected.add(layoutId);
    }
  });

  const globalKeys = ["locations", "categories", "showItemMeta", "collectionMode"];
  const sharedEntityChanged = changedItemIds.size > 0 || changedContainerIds.size > 0;
  const topLevelGlobalChanged = globalKeys.some((key) => !snapshotsEqual(beforeState?.[key], afterState?.[key]));
  const globalChanged = sharedEntityChanged || topLevelGlobalChanged;
  if (topLevelGlobalChanged) layoutIds.forEach((layoutId) => affected.add(layoutId));
  const affectedLayoutIds = [...affected].filter(Boolean).sort();
  return {
    affectedLayoutIds,
    changeScope: globalChanged
      ? "global"
      : affectedLayoutIds.length > 1
        ? "multiple"
        : "layout"
  };
}

export function buildHistoryActionContext({
  beforeState,
  afterState,
  changedAt,
  deviceId,
  getLayoutContainerIds,
  getLayoutItemIds
} = {}) {
  return {
    changeGroupId: historyActionGroupId({ deviceId, changedAt }),
    ...historyAffectedLayouts(beforeState, afterState, {
      getLayoutContainerIds,
      getLayoutItemIds
    })
  };
}
