export function materializeSharedLayoutForAdminState(layoutId, {
  canOpenAdminPublishedEdit = () => false,
  copyPublishedContainerToState = () => "",
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
    const sourceLayout = sourceState?.layouts?.[sourceState.activeLayoutId] || Object.values(sourceState?.layouts || {})[0];
    const rootIds = sourceState
      ? (sourceLayout?.rootContainerIds || []).map((id) =>
          copyPublishedContainerToState(sourceState, id, { targetLayoutId: "", changedAt, idMap, preserveSource: true })
        )
      : sharedLayoutRoots(layout).map((root) =>
          copySharedRootToState(root, { targetLayoutId: "", changedAt, idMap, preserveSource: true })
        );
    const nextLayoutId = `layout-admin-shared-${layout.id}-${Date.now()}`;
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
