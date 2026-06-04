import { isTemplateCopySharedId } from "../state/layout-manage.js";

export function materializeSharedLayoutForAdminState(layoutId, {
  canOpenAdminPublishedEdit = () => false,
  copyPublishedContainerToState = () => "",
  copyPublishedItemToState = () => "",
  copySharedRootToState = () => "",
  createLayoutArrangementFromCurrentState = () => ({}),
  currentCreateMeta = () => ({}),
  currentEditMeta = () => ({}),
  ensureLayoutDictionaries = () => {},
  findSharedLayout = () => null,
  isLayoutMeaningful = () => false,
  locations = [],
  categories = [],
  mergeBuiltInSharedEntriesIntoAdminLayout = () => false,
  mergePublishedSharedStateIntoAdminLayout = () => false,
  normalizeDictionaryValues = (values) => values,
  normalizeLayoutArrangement = () => {},
  normalizeUiLanguage = (value) => value,
  nowIso = () => new Date().toISOString(),
  removeLayoutTree = () => {},
  repairEmptyTemplateCopyDraftFromPublishedLayout = () => null,
  saveState = () => {},
  sharedLayoutRoots = () => [],
  sharedLayoutStatePayload = () => null,
  sharedPayloadActiveLayout = () => null,
  state,
  templateCopySourceScore = () => 0,
  uiLanguage = ""
} = {}) {
  const layout = findSharedLayout(layoutId);
  if (!layout) return null;
  let editableLayout = Object.values(state.layouts || {}).find((entry) => entry.adminSharedSourceId === layout.id);
  if (!editableLayout) {
    const changedAt = nowIso();
    const idMap = { containers: new Map(), items: new Map() };
    const sourceState = sharedLayoutStatePayload(layout);
    const sourceLayout = sharedPayloadActiveLayout(sourceState) ||
      sourceState?.layouts?.[sourceState.activeLayoutId] ||
      Object.values(sourceState?.layouts || {})[0];
    const nextLayoutId = `layout-admin-shared-${layout.id}-${Date.now()}`;
    const rootIds = sourceState
      ? sourceRootContainerIds(sourceLayout).map((id) =>
        copyPublishedContainerToState(sourceState, id, { targetLayoutId: "", changedAt, idMap, preserveSource: true, sourceLayoutId: sourceLayout?.id || "" })
      )
      : sharedLayoutRoots(layout).map((root) =>
        copySharedRootToState(root, { targetLayoutId: "", changedAt, idMap, preserveSource: true })
      );
    if (sourceState) {
      Object.keys(sourceState.containers || {}).forEach((containerId) => {
        if (idMap.containers.has(containerId)) return;
        const copiedId = copyPublishedContainerToState(sourceState, containerId, {
          targetLayoutId: "",
          parentId: null,
          changedAt,
          idMap,
          preserveSource: true
        });
        if (copiedId && state.containers?.[copiedId]) state.containers[copiedId].publicCatalogLayoutId = nextLayoutId;
      });
      Object.keys(sourceState.items || {}).forEach((itemId) => {
        if (idMap.items.has(itemId)) return;
        const copiedId = copyPublishedItemToState(sourceState, itemId, {
          containerId: "",
          changedAt,
          idMap,
          preserveSource: true
        });
        if (copiedId && state.items?.[copiedId]) state.items[copiedId].publicCatalogLayoutId = nextLayoutId;
      });
    }
    editableLayout = {
      id: nextLayoutId,
      name: sourceLayout?.name || layout.name,
      rootContainerIds: rootIds,
      arrangement: createLayoutArrangementFromCurrentState(state, rootIds),
      adminSharedSourceId: layout.id,
      language: layout.language || uiLanguage,
      locations: normalizeDictionaryValues(sourceState?.locations, locations),
      categories: normalizeDictionaryValues(sourceState?.categories, categories),
      ...currentCreateMeta(changedAt)
    };
    state.layouts[nextLayoutId] = editableLayout;
    saveState({ sync: false });
  } else {
    const rebuilt = rebuildStalePublishedAdminSharedDraft({
      state,
      sharedLayout: layout,
      editableLayout,
      canRepair: canOpenAdminPublishedEdit(),
      isLayoutMeaningful,
      sharedLayoutStatePayload,
      sharedPayloadActiveLayout,
      templateCopySourceScore,
      removeLayoutTree,
      copyPublishedContainerToState,
      copyPublishedItemToState,
      createLayoutArrangementFromCurrentState,
      normalizeLayoutArrangement,
      ensureLayoutDictionaries,
      currentMeta: currentEditMeta(),
      nowIso
    });
    if (rebuilt) {
      saveState({ sync: false });
      return rebuilt;
    }
    const repaired = repairEmptyTemplateCopyDraftFromPublishedLayout({
      state,
      sharedLayout: layout,
      editableLayout,
      fallbackLanguage: uiLanguage,
      canRepair: canOpenAdminPublishedEdit(),
      isLayoutMeaningful,
      sharedLayoutStatePayload,
      sharedPayloadActiveLayout,
      templateCopySourceScore,
      removeLayoutTree,
      copyPublishedContainerToState,
      copyPublishedItemToState,
      createLayoutArrangementFromCurrentState,
      normalizeLayoutArrangement,
      ensureLayoutDictionaries,
      currentMeta: currentEditMeta(),
      nowIso
    });
    if (repaired) {
      saveState({ sync: false });
      return repaired;
    }
    const sourceLanguage = normalizeUiLanguage(layout.language || uiLanguage);
    let languageChanged = false;
    if (!editableLayout.adminTemplateCopy && editableLayout.language !== sourceLanguage) {
      editableLayout.language = sourceLanguage;
      languageChanged = true;
    }
    const syncedPublished = mergePublishedSharedStateIntoAdminLayout(layout, editableLayout);
    const syncedBuiltIn = sharedLayoutStatePayload(layout) ? false : mergeBuiltInSharedEntriesIntoAdminLayout(layout, editableLayout);
    if (syncedPublished || syncedBuiltIn || languageChanged) saveState({ sync: false });
  }
  return editableLayout;
}

function rebuildStalePublishedAdminSharedDraft({
  state,
  sharedLayout,
  editableLayout,
  canRepair = false,
  isLayoutMeaningful = () => false,
  sharedLayoutStatePayload = () => null,
  sharedPayloadActiveLayout = () => null,
  templateCopySourceScore = () => 0,
  removeLayoutTree = () => false,
  copyPublishedContainerToState = () => "",
  copyPublishedItemToState = () => "",
  createLayoutArrangementFromCurrentState = () => null,
  normalizeLayoutArrangement = () => {},
  ensureLayoutDictionaries = () => null,
  currentMeta = {},
  nowIso = () => ""
} = {}) {
  if (!canRepair || !state || !sharedLayout || !editableLayout?.adminSharedSourceId) return null;
  const sourceState = sharedLayoutStatePayload(sharedLayout);
  const sourceLayout = sharedPayloadActiveLayout(sourceState) ||
    sourceState?.layouts?.[sourceState.activeLayoutId] ||
    Object.values(sourceState?.layouts || {})[0];
  const rootIds = sourceRootContainerIds(sourceLayout);
  if (!sourceState || !sourceLayout || !rootIds.length) return null;

  const publishedScore = Number(templateCopySourceScore(sourceLayout, sourceState) || 0);
  const draftScore = Number(templateCopySourceScore(editableLayout, state) || 0);
  const draftMeaningful = isLayoutMeaningful(editableLayout.id);
  const publishedNewer = publishedUpdatedAt(sharedLayout, sourceLayout) > publishedUpdatedAt(editableLayout);
  const shouldRebuild = !draftMeaningful || (
    editableLayout.adminTemplateCopy &&
    isTemplateCopySharedId(sharedLayout.id) &&
    publishedNewer &&
    publishedScore > Math.max(1, draftScore)
  );
  if (!shouldRebuild) return null;

  const previous = { ...editableLayout };
  const layoutId = editableLayout.id;
  const wasActive = state.activeLayoutId === layoutId;
  removeLayoutTree(layoutId, state, { save: false });

  const changedAt = nowIso();
  const idMap = { containers: new Map(), items: new Map() };
  const rootContainerIds = rootIds
    .map((id) => copyPublishedContainerToState(sourceState, id, {
      targetLayoutId: "",
      changedAt,
      idMap,
      preserveSource: true,
      sourceLayoutId: sourceLayout.id
    }))
    .filter(Boolean);
  if (!rootContainerIds.length) {
    state.layouts[layoutId] = editableLayout;
    if (wasActive) state.activeLayoutId = layoutId;
    return null;
  }

  Object.keys(sourceState.containers || {}).forEach((containerId) => {
    if (idMap.containers.has(containerId)) return;
    const copiedId = copyPublishedContainerToState(sourceState, containerId, {
      targetLayoutId: "",
      parentId: null,
      changedAt,
      idMap,
      preserveSource: true,
      sourceLayoutId: sourceLayout.id
    });
    if (copiedId && state.containers?.[copiedId]) state.containers[copiedId].publicCatalogLayoutId = layoutId;
  });
  Object.keys(sourceState.items || {}).forEach((itemId) => {
    if (idMap.items.has(itemId)) return;
    const copiedId = copyPublishedItemToState(sourceState, itemId, {
      containerId: "",
      changedAt,
      idMap,
      preserveSource: true
    });
    if (copiedId && state.items?.[copiedId]) state.items[copiedId].publicCatalogLayoutId = layoutId;
  });

  const dictionaries = ensureLayoutDictionaries(sourceLayout, sourceState) || {};
  const rebuilt = {
    ...previous,
    name: previous.name || sourceLayout.name || sharedLayout.name || sharedLayout.id,
    rootContainerIds,
    arrangement: createLayoutArrangementFromCurrentState(state, rootContainerIds),
    adminSharedSourceId: sharedLayout.id,
    language: sharedLayout.language || sourceLayout.language || previous.language || "ru",
    locations: [...(dictionaries.locations || previous.locations || sourceState.locations || [])],
    categories: [...(dictionaries.categories || previous.categories || sourceState.categories || [])],
    updatedAt: changedAt || currentMeta.updatedAt || previous.updatedAt || "",
    updatedByDeviceId: currentMeta.updatedByDeviceId || previous.updatedByDeviceId || "local-device",
    updatedByDeviceName: currentMeta.updatedByDeviceName || previous.updatedByDeviceName || "local-device"
  };
  state.layouts[layoutId] = rebuilt;
  normalizeLayoutArrangement(rebuilt, state);
  if (wasActive) state.activeLayoutId = layoutId;
  return rebuilt;
}

function sourceRootContainerIds(sourceLayout) {
  return [...new Set([
    ...(Array.isArray(sourceLayout?.arrangement?.rootContainerIds) ? sourceLayout.arrangement.rootContainerIds : []),
    ...(Array.isArray(sourceLayout?.rootContainerIds) ? sourceLayout.rootContainerIds : [])
  ])].filter(Boolean);
}

function publishedUpdatedAt(...records) {
  const value = records
    .map((record) => Date.parse(record?.updatedAt || record?.updated_at || ""))
    .find((time) => Number.isFinite(time));
  return Number.isFinite(value) ? value : 0;
}
