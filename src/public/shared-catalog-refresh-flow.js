export async function refreshPublicSharedLayoutCatalogFlow({ runtime, dependencies }, { renderAfter = false } = {}) {
  const {
    canOpenAdminPublishedEdit,
    copyPublishedContainerToState,
    createLayoutArrangementFromCurrentState,
    createSharedLayoutCatalogDiagnostics,
    currentEditMeta,
    demoTemplateFallbackName,
    ensureLayoutDictionaries,
    fetchPublicSharedLayoutCatalog,
    fetchPublishedDemoTemplateState,
    fetchStateRecordByItemKey,
    forgetDeletedSharedLayoutId,
    isConcretePublicSharedLayoutListRecord,
    isLayoutMeaningful,
    isPublicDemoTemplateRecord,
    isPublicSharedLayoutListRecord,
    isPublicSharedTemplatePayload,
    mergeServerDemoTemplateCatalog,
    mergeSharedLayoutCatalogEntries,
    normalizeLayoutArrangement,
    normalizeUiLanguage,
    nowIso,
    pruneRuntimeSharedLayouts,
    publicDemoTemplateEntryFromRecord,
    publishedPayloadWithTemplateMetadata,
    purgeUnconfirmedSharedTemplatesFromFrontendState,
    reconcilePublishedTemplateCopyDraft,
    removeLayoutTree,
    render,
    saveState,
    serverConfirmedSharedLayoutsByAdminOrder,
    serverConfirmedSharedLayoutsFromPublicRecords,
    setDemoPublicTemplateMissing,
    setDemoStatePayloadForLanguage,
    sharedLayoutIdFromPublicListRecord,
    sharedLayoutItemKey,
    sharedLayoutStatePayload,
    sharedPayloadActiveLayout,
    templateCopySourceScore,
    upsertRuntimeSharedLayout
  } = dependencies;
  let merged = 0;
  let demoMetadataMerged = 0;
  let localDraftReconciled = false;
  let data = null;
  try {
    data = await fetchPublicSharedLayoutCatalog();
  } catch {
    const confirmedSharedLayouts = serverConfirmedSharedLayoutsByAdminOrder();
    const purgedUnconfirmed = purgeUnconfirmedSharedTemplatesFromFrontendState({
      targetState: runtime.state,
      layoutsByLanguage: runtime.sharedLayoutsByLanguage,
      confirmedSharedLayouts,
      fallbackLanguage: runtime.uiLanguage
    });
    if (purgedUnconfirmed.removedLayoutIds.length) saveState({ sync: false });
    if (renderAfter && (purgedUnconfirmed.removedRuntimeCount || purgedUnconfirmed.removedLayoutIds.length)) render();
    return 0;
  }
  const records = Array.isArray(data?.lists) ? data.lists : [];
  const demoRecords = records.filter(isPublicDemoTemplateRecord);
  const demoEntries = demoRecords
    .map((record) => publicDemoTemplateEntryFromRecord(record, {
      fallbackName: demoTemplateFallbackName(record?.language || runtime.uiLanguage)
    }))
    .filter(Boolean);
  if (demoEntries.length) {
    runtime.serverConfirmedDemoTemplates = mergeServerDemoTemplateCatalog(
      runtime.serverConfirmedDemoTemplates,
      demoEntries
    );
    demoMetadataMerged = demoEntries.length;
  }
  const demoPayloadResults = await Promise.all(demoEntries.map(async (entry) => {
    try {
      const loaded = await fetchPublishedDemoTemplateState(entry);
      if (!loaded?.payload) return null;
      setDemoPublicTemplateMissing(loaded.language, false, { updateCatalog: false });
      setDemoStatePayloadForLanguage(loaded.language, loaded.payload, { listId: loaded.demoListId });
      return loaded;
    } catch {
      return null;
    }
  }));
  const demoPayloadMerged = demoPayloadResults.filter(Boolean).length;
  const sharedRecords = records.filter(isPublicSharedLayoutListRecord);
  const concreteRecords = sharedRecords.filter(isConcretePublicSharedLayoutListRecord);
  runtime.serverConfirmedSharedLayouts = mergeSharedLayoutCatalogEntries(runtime.serverConfirmedSharedLayouts, serverConfirmedSharedLayoutsFromPublicRecords(concreteRecords, {
    layoutsByLanguage: runtime.sharedLayoutsByLanguage,
    fallbackLanguage: runtime.uiLanguage
  }));
  runtime.sharedLayoutCatalogDiagnostics = createSharedLayoutCatalogDiagnostics({
    source: data?.fallback || (data?.unified ? "/bike-packing/public-templates" : "/bike-packing/public-shared-layouts"),
    records: concreteRecords,
    sharedLayoutIdFromRecord: sharedLayoutIdFromPublicListRecord,
    confirmedLayouts: runtime.serverConfirmedSharedLayouts,
    visibleOptions: []
  });
  if (
    concreteRecords.length &&
    runtime.sharedLayoutCatalogDiagnostics.confirmedCount === 0 &&
    typeof console !== "undefined" &&
    console.warn
  ) {
    console.warn("[bike-packing] Shared template API returned rows, but none became confirmed shared layouts.", runtime.sharedLayoutCatalogDiagnostics);
  }
  const publicSharedIds = new Set(concreteRecords
    .map(sharedLayoutIdFromPublicListRecord)
    .filter(Boolean));
  const prunedMissingRuntime = pruneRuntimeSharedLayouts(runtime.sharedLayoutsByLanguage, (layout) =>
    layout?.runtimeSharedTemplate &&
    !publicSharedIds.has(layout.id)
  );
  await Promise.all(concreteRecords
    .map(async (record) => {
      const sharedId = sharedLayoutIdFromPublicListRecord(record);
      if (!sharedId) return;
      forgetDeletedSharedLayoutId(sharedId);
      const recordUpdatedAt = publicRecordUpdatedAt(record);
      let payload = isPublicSharedTemplatePayload(record?.payload) ? record.payload : cachedRuntimeSharedPayload(runtime.sharedLayoutsByLanguage, sharedId, recordUpdatedAt);
      if (!payload) {
        try {
          payload = await fetchStateRecordByItemKey(sharedLayoutItemKey(sharedId), {
            cacheKey: `shared:${sharedId}`,
            updatedAt: recordUpdatedAt
          });
        } catch {
          return;
        }
      }
      if (!isPublicSharedTemplatePayload(payload)) return;
      payload = publishedPayloadWithTemplateMetadata(payload, {
        name: record.name || record.title,
        language: record.language
      });
      const activeLayout = sharedPayloadActiveLayout(payload);
      const language = normalizeUiLanguage(record.language || "");
      if (!language) return;
      const layout = upsertRuntimeSharedLayout(runtime.sharedLayoutsByLanguage, {
        id: sharedId,
        name: record.name || record.title || activeLayout?.name || sharedId,
        language,
        statePayload: payload,
        runtimeSharedTemplate: true,
        updatedAt: record.updatedAt || record.updated_at || ""
      });
      if (layout) {
        merged += 1;
        if (reconcilePublishedTemplateCopyDraft({
          state: runtime.state,
          sharedLayout: layout,
          fallbackLanguage: runtime.uiLanguage,
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
        })) {
          localDraftReconciled = true;
        }
      }
    }));
  runtime.serverConfirmedSharedLayouts = mergeSharedLayoutCatalogEntries(runtime.serverConfirmedSharedLayouts, serverConfirmedSharedLayoutsFromPublicRecords(concreteRecords, {
    layoutsByLanguage: runtime.sharedLayoutsByLanguage,
    fallbackLanguage: runtime.uiLanguage
  }));
  const purgedUnconfirmed = purgeUnconfirmedSharedTemplatesFromFrontendState({
    targetState: runtime.state,
    layoutsByLanguage: runtime.sharedLayoutsByLanguage,
    confirmedSharedLayouts: runtime.serverConfirmedSharedLayouts,
    fallbackLanguage: runtime.uiLanguage
  });
  if (localDraftReconciled || purgedUnconfirmed.removedLayoutIds.length) saveState({ sync: false });
  if (renderAfter && (demoMetadataMerged || demoPayloadMerged || merged || prunedMissingRuntime || purgedUnconfirmed.removedRuntimeCount || purgedUnconfirmed.removedLayoutIds.length)) render();
  return merged + demoMetadataMerged + demoPayloadMerged;
}

function publicRecordUpdatedAt(record = {}) {
  return String(record?.updatedAt || record?.updated_at || "").trim();
}

function cachedRuntimeSharedPayload(layoutsByLanguage, sharedId, updatedAt = "") {
  const id = String(sharedId || "").trim();
  if (!id) return null;
  const layout = Object.values(layoutsByLanguage || {})
    .flat()
    .find((entry) => entry?.id === id) || null;
  if (!layout?.statePayload) return null;
  const expectedUpdatedAt = publicRecordUpdatedAt({ updatedAt });
  if (expectedUpdatedAt && String(layout.updatedAt || "").trim() !== expectedUpdatedAt) return null;
  return layout.statePayload;
}
