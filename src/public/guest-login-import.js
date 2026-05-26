import {
  getLayoutContainerIdSet,
  getLayoutItemIdSet
} from "../state/layout-ops.js";

function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean))];
}

export function guestImportStateStats(targetState, importedLayoutIds) {
  const layoutIds = uniqueIds(importedLayoutIds);
  const containers = targetState?.containers && typeof targetState.containers === "object" ? targetState.containers : {};
  const items = targetState?.items && typeof targetState.items === "object" ? targetState.items : {};
  const layouts = targetState?.layouts && typeof targetState.layouts === "object" ? targetState.layouts : {};
  const importedContainerIds = new Set();
  const importedItemIds = new Set();
  const layoutStats = layoutIds.map((layoutId) => {
    const layout = layouts[layoutId] || null;
    const containerIds = layout ? getLayoutContainerIdSet(targetState, layout) : new Set();
    const itemIds = layout ? getLayoutItemIdSet(targetState, layout) : new Set();
    containerIds.forEach((id) => importedContainerIds.add(id));
    itemIds.forEach((id) => importedItemIds.add(id));
    return {
      layoutId,
      exists: Boolean(layout),
      name: String(layout?.name || ""),
      rootCount: Array.isArray(layout?.rootContainerIds) ? layout.rootContainerIds.length : 0,
      arrangementRootCount: Array.isArray(layout?.arrangement?.rootContainerIds) ? layout.arrangement.rootContainerIds.length : 0,
      containerCount: containerIds.size,
      itemCount: itemIds.size
    };
  });

  return {
    layoutIds,
    layoutStats,
    totalLayoutCount: Object.keys(layouts).length,
    totalContainerCount: Object.keys(containers).length,
    totalItemCount: Object.keys(items).length,
    importedLayoutCount: layoutStats.filter((entry) => entry.exists).length,
    importedContainerCount: importedContainerIds.size,
    importedItemCount: importedItemIds.size,
    missingLayoutIds: layoutStats.filter((entry) => !entry.exists).map((entry) => entry.layoutId),
    emptyImportedLayoutIds: layoutStats
      .filter((entry) => entry.exists && entry.containerCount === 0 && entry.itemCount === 0)
      .map((entry) => entry.layoutId)
  };
}

export function validateGuestImportSyncState(targetState, importedLayoutIds) {
  const stats = guestImportStateStats(targetState, importedLayoutIds);
  if (!stats.layoutIds.length) return { ok: false, reason: "no-imported-layouts", stats };
  if (stats.missingLayoutIds.length) return { ok: false, reason: "missing-layouts", stats };
  if (stats.totalContainerCount === 0 && stats.totalItemCount === 0) return { ok: false, reason: "empty-state", stats };
  if (stats.importedContainerCount === 0 && stats.importedItemCount === 0) {
    return { ok: false, reason: "empty-imported-layouts", stats };
  }
  return { ok: true, reason: "", stats };
}
