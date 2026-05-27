import {
  getLayoutContainerIdSet,
  getLayoutItemIdSet
} from "../state/layout-ops.js";
import { uniqueLayoutIds } from "../state/layout-arrangement.js";

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

export function importGuestLocalLayoutsToState(targetState, candidate, {
  addBackupDictionaryValues = () => {},
  applyGuestLocalDisplayPreferences = () => {},
  applyLayoutArrangement = () => {},
  cloneValue = (value) => value,
  copyPublishedContainerToState = () => "",
  createLayoutArrangementFromCurrentState = () => ({}),
  currentCreateMeta = () => ({}),
  guestCandidateLayouts = () => [],
  guestLocalDisplayPreferences = () => ({}),
  layoutDictionaryValues = () => [],
  normalizeContainerFields = () => {},
  normalizeDictionaryValues = (values) => values,
  normalizeItemCategories = () => {},
  normalizeItemFields = () => {},
  normalizeLayoutFields = () => {},
  migrateContainerOrder = () => {},
  nowIso = () => new Date().toISOString(),
  readableGuestDemoLayoutName = (name) => name,
  rememberActiveLayoutChoice = () => {},
  repairContainerMembershipFromItemLinks = () => {},
  saveRecoverySnapshot = () => {},
  saveState = () => {},
  setActivePrivateScope = () => {},
  uniqueLayoutName = (name) => name,
  renameConflicts = true,
  guestDemoCopyFlag = "",
  guestLayoutFallbackName = ""
} = {}) {
  const source = candidate?.sourceState;
  const layouts = guestCandidateLayouts(candidate);
  if (!source || !layouts.length) return [];
  saveRecoverySnapshot("before-guest-layouts-import", targetState);
  const changedAt = nowIso();
  addBackupDictionaryValues(targetState, source);
  const idMap = { containers: new Map(), items: new Map() };
  const importedLayoutIds = [];
  layouts.forEach((entry, index) => {
    const sourceLayout = source.layouts?.[entry.layoutId];
    if (!sourceLayout) return;
    const sourceRootIds = uniqueLayoutIds([
      ...(sourceLayout.rootContainerIds || []),
      ...(sourceLayout.arrangement?.rootContainerIds || [])
    ]);
    const rootContainerIds = sourceRootIds
      .map((id) => copyPublishedContainerToState(source, id, {
        targetLayoutId: "",
        changedAt,
        idMap,
        sourceLayoutId: sourceLayout.id
      }))
      .filter(Boolean);
    const layoutId = `layout-guest-import-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
    const requestedName = readableGuestDemoLayoutName(entry.layoutName || sourceLayout.name, guestLayoutFallbackName);
    const safeName = renameConflicts
      ? uniqueLayoutName(requestedName)
      : requestedName;
    targetState.layouts[layoutId] = {
      ...cloneValue(sourceLayout),
      id: layoutId,
      name: safeName,
      rootContainerIds,
      arrangement: createLayoutArrangementFromCurrentState(targetState, rootContainerIds),
      locations: normalizeDictionaryValues(sourceLayout.locations || source.locations, layoutDictionaryValues(sourceLayout, "location", source)),
      categories: normalizeDictionaryValues(sourceLayout.categories || source.categories, layoutDictionaryValues(sourceLayout, "category", source)),
      ...currentCreateMeta(changedAt)
    };
    if (guestDemoCopyFlag) delete targetState.layouts[layoutId][guestDemoCopyFlag];
    delete targetState.layouts[layoutId].demoSourceLanguage;
    delete targetState.layouts[layoutId].guestDemoCopyCreatedAt;
    importedLayoutIds.push(layoutId);
  });
  if (!importedLayoutIds.length) return [];
  targetState.activeLayoutId = importedLayoutIds[0];
  applyLayoutArrangement(targetState.activeLayoutId);
  setActivePrivateScope();
  rememberActiveLayoutChoice(targetState.activeLayoutId);
  normalizeContainerFields(targetState);
  normalizeItemFields(targetState);
  repairContainerMembershipFromItemLinks(targetState);
  normalizeLayoutFields(targetState);
  normalizeItemCategories(targetState);
  migrateContainerOrder(targetState);
  applyGuestLocalDisplayPreferences(targetState, candidate.displayPreferences || guestLocalDisplayPreferences(source));
  saveState();
  return importedLayoutIds;
}
