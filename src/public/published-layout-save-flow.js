export async function savePublishedLayoutRecordFlow({ runtime, dependencies }, layoutId = runtime.state.activeLayoutId, { notify = false } = {}) {
  const {
    apiFetch,
    applyPublishedPayloadPhotosToLayoutState,
    canOpenAdminPublishedEdit,
    checkAdminApiCompatibility,
    cleanPublishedEntityId,
    clone,
    demoAdminStatePathForPublicListId,
    demoPublicListIdForLanguage,
    demoTemplateForLanguage,
    demoTemplateNameFromPayload,
    exportLayoutAsDemoState,
    findSharedLayout,
    getLayoutContainerIdSetForState,
    getLayoutItemIdSetForState,
    getUnsyncedPhotoEntries,
    getUploadablePhotoEntries,
    normalizeDemoLayoutName,
    normalizeDemoPayloadForLanguage,
    normalizeUiLanguage,
    nowIso,
    persistStateSnapshot,
    publicListIdForPublishedTarget,
    publishedLayoutTarget,
    publishedPayloadWithTemplateMetadata,
    refreshPublishedLayoutView,
    refreshPublicSharedLayoutCatalog,
    saveSyncMeta,
    setDemoPublicTemplateMissing,
    setDemoStatePayloadForLanguage,
    shouldCopyPublicTemplatePhotoReferencesOnServer,
    shouldCreatePublishedTemplateBeforePhotos,
    showToast,
    updateSyncUi,
    uploadPublishedLayoutPhotos,
    upsertDemoTemplateCatalogEntry,
    upsertRuntimeSharedLayout,
    withLayoutArrangementAppliedAsync,
    withoutPhotoReferences,
    LIST_SAVE_API_TIMEOUT_MS
  } = dependencies;
  const layout = runtime.state.layouts?.[layoutId];
  if (!layout) return;
  if (!canOpenAdminPublishedEdit()) {
    showToast("Public-укладки может сохранять только админ.", "error");
    return;
  }
  if (!runtime.currentUser) {
    showToast("Нужно войти админом, чтобы сохранить public-укладку.", "error");
    return;
  }
  await checkAdminApiCompatibility({ force: true }).catch(() => null);
  const target = publishedLayoutTarget(layout, { defaultToDemo: true });
  if (!target) return;
  updateSyncUi(target.type === "demo" ? "Сохраняю демо-укладку..." : "Сохраняю шаблон...");
  const publicListId = publicListIdForPublishedTarget(target);
  const publishTitle = target.type === "demo"
    ? normalizeDemoLayoutName(layout.name || "", target.language || runtime.uiLanguage)
    : layout.name || "";
  const publishPayload = async (payload, extraBody = {}) => {
    const path = target.type === "demo"
      ? demoAdminStatePathForPublicListId(target.demoListId || "", target.language || runtime.uiLanguage)
      : `/bike-packing/admin/shared-layouts/${encodeURIComponent(target.sharedId)}/state`;
    try {
      return await apiFetch(path, {
        method: "POST",
        timeoutMs: LIST_SAVE_API_TIMEOUT_MS,
        body: JSON.stringify({
          title: publishTitle,
          description: layout.note || "",
          visibility: "public",
          listVisibility: "public",
          language: target.language || layout.language || runtime.uiLanguage,
          ...extraBody,
          payload
        })
      });
    } catch (error) {
      const targetLabel = target.type === "demo"
        ? `demo:${target.language || runtime.uiLanguage}`
        : `shared:${target.sharedId || ""}`;
      const publishError = new Error(`${error.message || "publish failed"} [${targetLabel} ${path}]`);
      publishError.cause = error;
      publishError.path = path;
      publishError.target = target;
      throw publishError;
    }
  };
  let publishedPayload = null;
  let publishedByServerPhotoCopy = false;
  if (shouldCopyPublicTemplatePhotoReferencesOnServer(layout)) {
    try {
      publishedPayload = await withLayoutArrangementAppliedAsync(layoutId, async () => {
        updateSyncUi("Сохраняю шаблон и копирую фото на сервере...");
        const localPayload = exportLayoutAsDemoState(layoutId);
        const result = await publishPayload(localPayload, { copyPhotoReferences: true });
        const serverPayload = result?.record?.payload || result?.payload || localPayload;
        if (applyPublishedPayloadPhotosToLayoutState(runtime.state, layoutId, serverPayload, {
          clone,
          getLayoutContainerIdSet: getLayoutContainerIdSetForState,
          getLayoutItemIdSet: getLayoutItemIdSetForState,
          publishedEntityId: cleanPublishedEntityId
        })) {
          persistStateSnapshot(runtime.state);
        }
        return serverPayload;
      });
      publishedByServerPhotoCopy = true;
    } catch (error) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[bike-packing] Server-side public template photo copy failed; falling back to legacy publish flow.", error);
      }
    }
  }
  if (!publishedByServerPhotoCopy) {
    publishedPayload = await withLayoutArrangementAppliedAsync(layoutId, async () => {
      const existingPublishedLayout = target.type === "shared"
        ? findSharedLayout(target.sharedId)
        : demoTemplateForLanguage(runtime.serverConfirmedDemoTemplates, target.language || layout.language || runtime.uiLanguage, {
          listId: target.demoListId || layout.adminDemoListId || ""
        });
      const shouldPrimeTemplate = shouldCreatePublishedTemplateBeforePhotos(layout, existingPublishedLayout);
      if (shouldPrimeTemplate) {
        updateSyncUi("Создаю шаблон перед копированием фото...");
        await publishPayload(withoutPhotoReferences(exportLayoutAsDemoState(layoutId)));
      }
      const uploadablePhotos = getUploadablePhotoEntries({
        layoutId,
        listId: publicListId,
        allowRemoteOnlyReferences: false
      });
      if (uploadablePhotos.length) {
        updateSyncUi(target.type === "demo" ? "Загружаю фото демо-укладки..." : "Загружаю фото шаблона...");
        await uploadPublishedLayoutPhotos(layoutId, target, uploadablePhotos);
      }
      const unsyncedPhotos = getUnsyncedPhotoEntries({ layoutId, listId: publicListId });
      if (unsyncedPhotos.length) {
        const firstError = unsyncedPhotos.find((entry) => entry.photo?.error)?.photo?.error || "";
        throw new Error(firstError || `Не удалось загрузить фото (${unsyncedPhotos.length}). Public-укладка не сохранена, чтобы не опубликовать локальные ссылки.`);
      }
      return exportLayoutAsDemoState(layoutId);
    });
    if (target.type === "demo") {
      publishedPayload = normalizeDemoPayloadForLanguage(publishedPayload, target.language || runtime.uiLanguage) || publishedPayload;
    }
    await publishPayload(publishedPayload);
  }
  runtime.syncMeta.dirty = false;
  runtime.syncMeta.serverUpdatedAt = nowIso();
  saveSyncMeta();
  if (target.type === "demo") {
    const confirmedLanguage = normalizeUiLanguage(target.language || layout.adminDemoLanguage || layout.language || runtime.uiLanguage);
    const confirmedName = publishTitle || demoTemplateNameFromPayload(publishedPayload, confirmedLanguage);
    publishedPayload = publishedPayloadWithTemplateMetadata(publishedPayload, {
      name: confirmedName,
      language: confirmedLanguage
    });
    layout.name = confirmedName;
    layout.adminDemoListId = target.demoListId || layout.adminDemoListId || demoPublicListIdForLanguage(confirmedLanguage);
    runtime.activeDemoTemplateListId = layout.adminDemoListId;
    setDemoStatePayloadForLanguage(confirmedLanguage, publishedPayload, { listId: layout.adminDemoListId });
    setDemoPublicTemplateMissing(confirmedLanguage, false, { updateCatalog: false });
    upsertDemoTemplateCatalogEntry(confirmedLanguage, {
      listId: layout.adminDemoListId,
      name: confirmedName,
      updatedAt: runtime.syncMeta.serverUpdatedAt,
      serverConfirmed: true,
      missing: false
    });
  } else {
    publishedPayload = publishedPayloadWithTemplateMetadata(publishedPayload, {
      name: layout.name || "",
      language: layout.language || runtime.uiLanguage
    });
    const sharedLayout = upsertRuntimeSharedLayout(runtime.sharedLayoutsByLanguage, {
      id: target.sharedId,
      name: layout.name || "",
      language: layout.language || runtime.uiLanguage,
      statePayload: publishedPayload,
      runtimeSharedTemplate: true
    }) || findSharedLayout(target.sharedId);
    if (sharedLayout) sharedLayout.statePayload = publishedPayload;
    await refreshPublicSharedLayoutCatalog().catch(() => null);
  }
  refreshPublishedLayoutView(target);
  updateSyncUi();
  if (notify) showToast(target.type === "demo" ? "Демо-укладка сохранена." : "Шаблон сохранен.", "success");
}

