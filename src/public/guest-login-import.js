import {
  getLayoutContainerIdSet,
  getLayoutItemIdSet
} from "../state/layout-ops.js";
import { uniqueLayoutIds } from "../state/layout-arrangement.js";
import {
  guestDemoCopyRecordWasEdited,
  guestLocalDisplayPreferences,
  guestLocalLayoutImportPlan,
  isAutomaticGuestDemoCopyLayout,
  isGeneratedEmptyLayoutPlaceholder,
  isGuestLocalPersonalLayout
} from "./demo-template-state.js";
import { readableGuestDemoLayoutName } from "./guest-demo-startup.js";
import { isGuestDemoCopyLayoutRecord } from "./scope.js";
import {
  GUEST_SHARED_LINK_COPY_TARGET_FLAG,
  GUEST_SHARED_LINK_DETACHED_ITEM_IDS,
  guestSharedLinkDetachedItemIds
} from "./guest-shared-link-target.js";

function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean))];
}

export function canImportGuestLayoutsForAuthenticatedUser(user = null) {
  return Boolean(user && typeof user === "object");
}

export function guestLayoutHasUserContentEdits(sourceState, layout) {
  if (!layout || !isGuestDemoCopyLayoutRecord(layout)) return false;
  if (guestDemoCopyRecordWasEdited(layout, layout)) return true;
  if (guestSharedLinkDetachedItemIds(layout).some((itemId) => sourceState?.items?.[itemId])) return true;
  const containerIds = getLayoutContainerIdSet(sourceState, layout);
  const itemIds = getLayoutItemIdSet(sourceState, layout);
  for (const containerId of containerIds) {
    if (guestDemoCopyRecordWasEdited(sourceState?.containers?.[containerId], layout)) return true;
  }
  for (const itemId of itemIds) {
    if (guestDemoCopyRecordWasEdited(sourceState?.items?.[itemId], layout)) return true;
  }
  return false;
}

export function guestLocalLayoutCandidateFromState(sourceState, {
  cloneStateForSync = (value) => value,
  cloneValue = (value) => value,
  createEmptyUserState = () => ({}),
  fallbackName = "",
  fallbackNameForLayout = () => fallbackName,
  snapshotsEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right)
} = {}) {
  if (!sourceState || !Object.values(sourceState.layouts || {}).some(isGuestLocalPersonalLayout)) return null;
  try {
    if (snapshotsEqual(
      cloneStateForSync(sourceState, { forSync: true }),
      cloneStateForSync(createEmptyUserState(), { forSync: true })
    )) return null;
  } catch {
    // Shape and edit checks below remain authoritative if normalization fails.
  }
  const plan = guestLocalLayoutImportPlan({
    layouts: sourceState.layouts,
    activeLayoutId: sourceState.activeLayoutId,
    isGuestDemoCopy: isGuestDemoCopyLayoutRecord,
    isGuestPersonalLayout: isGuestLocalPersonalLayout,
    isAutomaticDemoCopy: isAutomaticGuestDemoCopyLayout,
    hasUserEdits: (layout) => guestLayoutHasUserContentEdits(sourceState, layout)
  });
  if (!plan.layoutIds.length) return null;
  const layouts = plan.layoutIds
    .map((layoutId) => sourceState.layouts?.[layoutId])
    .filter(Boolean)
    .map((layout) => {
      const layoutFallbackName = String(fallbackNameForLayout(layout) || fallbackName).trim() || fallbackName;
      return {
        layoutId: layout.id,
        layoutName: readableGuestDemoLayoutName(layout.name, layoutFallbackName),
        fallbackName: layoutFallbackName
      };
    });
  const primary = layouts.find((entry) => entry.layoutId === plan.primaryLayoutId) || layouts[0];
  return {
    sourceState: cloneValue(sourceState),
    displayPreferences: guestLocalDisplayPreferences(sourceState),
    layouts,
    layoutId: primary?.layoutId || "",
    layoutName: primary?.layoutName || fallbackName
  };
}

export function importedGuestLayoutName(requestedName = "", {
  renameConflicts = true,
  uniqueLayoutName = (name) => name
} = {}) {
  return renameConflicts ? uniqueLayoutName(requestedName) : requestedName;
}

function importedLayoutDictionaryValues(sourceState, sourceLayout, type, {
  layoutDictionaryValues,
  normalizeDictionaryValues
}) {
  const legacyKey = type === "location" ? "locations" : "categories";
  const customKeys = type === "location"
    ? ["customLocations", "locationDictionary"]
    : ["customCategories", "categoryDictionary"];
  const usedValues = normalizeDictionaryValues(layoutDictionaryValues(sourceLayout, type, sourceState));
  const visibleValues = normalizeDictionaryValues(sourceLayout?.[legacyKey], usedValues);
  const explicitCustomValues = customKeys
    .map((key) => sourceLayout?.[key])
    .find(Array.isArray);
  const customValues = explicitCustomValues
    ? normalizeDictionaryValues(explicitCustomValues)
    : visibleValues.filter((value) => !usedValues.includes(value));
  return { customValues, visibleValues };
}

function promoteImportedLayoutDictionaries(targetState, sourceState, sourceLayout, dependencies) {
  for (const type of ["location", "category"]) {
    const legacyKey = type === "location" ? "locations" : "categories";
    const customKey = type === "location" ? "customLocations" : "customCategories";
    const { customValues, visibleValues } = importedLayoutDictionaryValues(
      sourceState,
      sourceLayout,
      type,
      dependencies
    );
    targetState[legacyKey] = dependencies.normalizeDictionaryValues(targetState[legacyKey], visibleValues);
    targetState[customKey] = dependencies.normalizeDictionaryValues(targetState[customKey], customValues);
  }
}

function removeGeneratedTargetPlaceholder(targetState) {
  const targetLayouts = Object.values(targetState?.layouts || {});
  if (targetLayouts.length !== 1 || !isGeneratedEmptyLayoutPlaceholder(targetLayouts[0])) return false;
  delete targetState.layouts[targetLayouts[0].id];
  if (targetState.activeLayoutId === targetLayouts[0].id) targetState.activeLayoutId = "";
  return true;
}

function isLegacyImportedEmptyPlaceholder(layout) {
  if (!layout || !String(layout.id || "").startsWith("layout-guest-import-")) return false;
  if (layout.adminDemo || layout.adminSharedSourceId || layout.publicCatalogLayoutId || layout.guestDemoCopy) return false;
  const name = String(layout.name || "").trim();
  if (!/^(?:Текущая укладка|Current layout)(?: \d+)?$/.test(name)) return false;
  const arrangement = layout.arrangement && typeof layout.arrangement === "object" ? layout.arrangement : {};
  return !(layout.rootContainerIds || []).length &&
    !(arrangement.rootContainerIds || []).length &&
    !Object.keys(arrangement.containers || {}).length &&
    !Object.keys(arrangement.items || {}).length &&
    !(layout.customLocations || layout.locationDictionary || []).length &&
    !(layout.customCategories || layout.categoryDictionary || []).length;
}

function layoutHasImportedContent(layout) {
  const arrangement = layout?.arrangement && typeof layout.arrangement === "object" ? layout.arrangement : {};
  return Boolean(
    (layout?.rootContainerIds || []).length ||
    (arrangement.rootContainerIds || []).length ||
    Object.keys(arrangement.containers || {}).length ||
    Object.keys(arrangement.items || {}).length
  );
}

export function removeLegacyGuestImportPlaceholders(targetState) {
  const layouts = Object.values(targetState?.layouts || {});
  const artifactIds = layouts
    .filter((layout) => isGeneratedEmptyLayoutPlaceholder(layout) || isLegacyImportedEmptyPlaceholder(layout))
    .map((layout) => layout.id);
  if (!artifactIds.length) return [];
  const artifactIdSet = new Set(artifactIds);
  const remainingLayouts = layouts.filter((layout) => !artifactIdSet.has(layout.id));
  if (!remainingLayouts.some(layoutHasImportedContent)) return [];
  artifactIds.forEach((layoutId) => delete targetState.layouts[layoutId]);
  if (!targetState.layouts[targetState.activeLayoutId]) {
    targetState.activeLayoutId = remainingLayouts.find(layoutHasImportedContent)?.id || remainingLayouts[0]?.id || "";
  }
  return artifactIds;
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
    if (layout) {
      guestSharedLinkDetachedItemIds(layout).forEach((itemId) => {
        if (targetState?.items?.[itemId]) itemIds.add(itemId);
      });
    }
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

export async function persistGuestImportBeforeCleanup(importedLayoutIds, {
  clearGuestStorage = () => {},
  persistImport = async () => false
} = {}) {
  const layoutIds = uniqueIds(importedLayoutIds);
  if (!layoutIds.length) return false;
  const saved = await persistImport(layoutIds);
  if (!saved) return false;
  clearGuestStorage();
  return true;
}

export function importGuestLocalLayoutsToState(targetState, candidate, {
  addBackupDictionaryValues = () => {},
  applyGuestLocalDisplayPreferences = () => {},
  applyLayoutArrangement = () => {},
  cloneValue = (value) => value,
  copyPublishedContainerToState = () => "",
  copyPublishedItemToState = () => "",
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
  removeGeneratedTargetPlaceholder(targetState);
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
    const detachedItemIds = guestSharedLinkDetachedItemIds(sourceLayout)
      .map((sourceItemId) => idMap.items.get(sourceItemId) || copyPublishedItemToState(source, sourceItemId, {
        containerId: "",
        changedAt,
        idMap
      }))
      .filter(Boolean);
    const layoutId = `layout-guest-import-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
    const requestedName = readableGuestDemoLayoutName(entry.layoutName || sourceLayout.name, guestLayoutFallbackName);
    const safeName = importedGuestLayoutName(requestedName, { renameConflicts, uniqueLayoutName });
    const importedDictionaries = {
      locations: normalizeDictionaryValues(sourceLayout.locations || source.locations, layoutDictionaryValues(sourceLayout, "location", source)),
      categories: normalizeDictionaryValues(sourceLayout.categories || source.categories, layoutDictionaryValues(sourceLayout, "category", source))
    };
    promoteImportedLayoutDictionaries(targetState, source, sourceLayout, {
      layoutDictionaryValues,
      normalizeDictionaryValues
    });
    targetState.layouts[layoutId] = {
      ...cloneValue(sourceLayout),
      id: layoutId,
      name: safeName,
      rootContainerIds,
      arrangement: createLayoutArrangementFromCurrentState(targetState, rootContainerIds),
      locations: importedDictionaries.locations,
      categories: importedDictionaries.categories,
      ...(detachedItemIds.length ? { [GUEST_SHARED_LINK_DETACHED_ITEM_IDS]: detachedItemIds } : {}),
      ...currentCreateMeta(changedAt)
    };
    if (guestDemoCopyFlag) delete targetState.layouts[layoutId][guestDemoCopyFlag];
    delete targetState.layouts[layoutId].demoSourceLanguage;
    delete targetState.layouts[layoutId].guestDemoCopyCreatedAt;
    delete targetState.layouts[layoutId][GUEST_SHARED_LINK_COPY_TARGET_FLAG];
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
