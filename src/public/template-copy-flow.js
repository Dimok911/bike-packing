export async function createTemplateCopyFromSourceFlow({ runtime, dependencies }, sourceLayout, requestedName, {
  language = "",
  sourceKind = "",
  activate = true,
  renderAfter = true
} = {}) {
  const {
    activateAdminPublishedLayout,
    captureActiveLayoutArrangement,
    containerTreeSnapshotScore,
    copyPublishedContainerToState,
    createDemoTemplateCopyRecord,
    createDemoTemplateListId,
    createEmptyLayoutArrangement,
    createEmptyPublicTemplateDraftRecord,
    createLayoutArrangementFromCurrentState,
    createTemplateCopyLayoutRecordValue,
    createTemplateCopyRecord,
    currentCreateMeta,
    ensureLayoutDictionaries,
    ensurePrivateDictionaries,
    isAdminEditablePublishedLayout,
    loadPublishedTemplateCopySource,
    markLayoutPhotosForCurrentListCopy,
    normalizeLayoutArrangement,
    normalizeUiLanguage,
    nowIso,
    render,
    saveLayoutMutation,
    solidifyTemplateDraftLayout,
    templateCopyRootSnapshots,
    uniquePublishedTemplateName,
    withLayoutArrangementApplied
  } = dependencies;
  if (!sourceLayout || !requestedName || !isAdminEditablePublishedLayout(sourceLayout.id)) return "";
  captureActiveLayoutArrangement();
  normalizeLayoutArrangement(sourceLayout, runtime.state);
  let sourceState = runtime.state;
  let copySourceLayout = sourceLayout;
  let rootSnapshots = templateCopyRootSnapshots(copySourceLayout, sourceState);
  if (!rootSnapshots.length || rootSnapshots.every((snapshot) => containerTreeSnapshotScore(snapshot) <= 1)) {
    withLayoutArrangementApplied(sourceLayout.id, () => {
      captureActiveLayoutArrangement();
      normalizeLayoutArrangement(sourceLayout, runtime.state);
      rootSnapshots = templateCopyRootSnapshots(copySourceLayout, sourceState);
    });
  }
  const localScore = rootSnapshots.reduce((sum, snapshot) => sum + containerTreeSnapshotScore(snapshot), 0);
  const publishedSource = await loadPublishedTemplateCopySource(sourceLayout);
  if (publishedSource?.score > localScore) {
    sourceState = publishedSource.state;
    copySourceLayout = publishedSource.layout;
    rootSnapshots = templateCopyRootSnapshots(copySourceLayout, sourceState);
  }
  if (!rootSnapshots.length) {
    const changedAt = nowIso();
    const id = `layout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const layout = createTemplateCopyLayoutRecordValue({
      id,
      requestedName,
      sourceLayout,
      copySourceLayout,
      sourceState,
      currentState: runtime.state,
      rootSnapshots,
      sourceKind,
      changedAt,
      language,
      uiLanguage: runtime.uiLanguage,
      normalizeUiLanguage,
      createEmptyLayoutArrangement,
      createEmptyPublicTemplateDraftRecord,
      createDemoTemplateListId,
      currentCreateMeta,
      ensureLayoutDictionaries,
      ensurePrivateDictionaries,
      uniquePublishedTemplateName,
      serverConfirmedDemoTemplates: runtime.serverConfirmedDemoTemplates
    });
    if (!layout) return "";
    runtime.state.layouts[id] = layout;
    if (activate) activateAdminPublishedLayout(id);
    saveLayoutMutation(id);
    if (renderAfter) render();
    return id;
  }
  if (!rootSnapshots.length) {
    throw new Error("источник шаблона пустой или не загрузился");
  }
  const changedAt = nowIso();
  const id = `layout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const idMap = { containers: new Map(), items: new Map() };
  const rootContainerIds = rootSnapshots
    .map((snapshot) => copyPublishedContainerToState(sourceState, snapshot.rootId, {
      targetLayoutId: "",
      changedAt,
      idMap,
      preserveSource: true,
      sourceLayoutId: copySourceLayout.id,
      sourceSnapshot: snapshot
    }))
    .filter(Boolean);
  const arrangement = createLayoutArrangementFromCurrentState(runtime.state, rootContainerIds);
  const layout = createTemplateCopyLayoutRecordValue({
      id,
      requestedName,
      sourceLayout,
      copySourceLayout,
      sourceState,
      currentState: runtime.state,
      rootSnapshots,
      sourceKind,
      arrangement,
      changedAt,
      language,
      uiLanguage: runtime.uiLanguage,
      normalizeUiLanguage,
      createDemoTemplateCopyRecord,
      createDemoTemplateListId,
      createTemplateCopyRecord,
      currentCreateMeta,
      ensureLayoutDictionaries,
      ensurePrivateDictionaries,
      uniquePublishedTemplateName,
      serverConfirmedDemoTemplates: runtime.serverConfirmedDemoTemplates
    });
  if (!layout) return "";
  runtime.state.layouts[id] = layout;
  solidifyTemplateDraftLayout(id);
  markLayoutPhotosForCurrentListCopy(id);
  if (activate) activateAdminPublishedLayout(id);
  saveLayoutMutation(id);
  if (renderAfter) render();
  return id;
}
