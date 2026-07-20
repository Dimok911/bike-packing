function localText(language, en, ru) {
  return language === "en" ? en : ru;
}

export async function runSyncNowFlow({ runtime, dependencies }, { force = false } = {}) {
  const {
    activeReadOnlyLayoutId,
    canOpenAdminPublishedEdit,
    checkAdminApiCompatibility,
    checkAuthAndLoad,
    checkRemoteStateFreshness,
    clearStaleDirtyFlagIfNoLocalChanges,
    currentPublicTemplateStatusMessage,
    flushActivePublishedEditSave,
    getPublishedEditLayoutId,
    handleAuthButton,
    isAdminEditablePublishedLayout,
    isAdminUser,
    isDemoPublicTemplateMissing,
    isForcedOffline,
    isOfflineRememberedSession,
    isReadOnlyBikePackingContext,
    isReadOnlyStateScope,
    loadRemoteState,
    nowIso,
    offerLoadServerForTruncatedLocalState,
    openAdminDemoLayout,
    openSharedLayoutForAdmin,
    preferredCurrentLayoutRef,
    refreshActiveReadOnlyPublicTemplate,
    savePublishedLayoutRecord,
    saveRemoteState,
    saveSyncMeta,
    showToast,
    uploadPendingPhotos,
    updateSyncUi,
    DEMO_SHARED_LAYOUT_ID
  } = dependencies;
  if (runtime.syncTimer) {
    window.clearTimeout(runtime.syncTimer);
    runtime.syncTimer = null;
  }
  if (isForcedOffline()) {
    updateSyncUi(localText(runtime.uiLanguage, "Forced offline · synchronization is disabled", "Принудительно офлайн · синхронизация отключена"));
    if (force) showToast(localText(runtime.uiLanguage, "Offline mode is on. Turn it off in the menu to synchronize.", "Офлайн-режим включён. Чтобы синхронизироваться, выключите его в меню."), "error");
    return;
  }
  if (isReadOnlyStateScope()) {
    await refreshActiveReadOnlyPublicTemplate({ notify: force });
    return;
  }
  if (!runtime.currentUser && isAdminUser() && isReadOnlyStateScope()) {
    if (force) {
      showToast(localText(runtime.uiLanguage, "Sign in as an administrator to publish demo/shared templates.", "Для публикации demo/shared нужно войти админом."), "error");
      handleAuthButton();
    }
    return;
  }
  if (!runtime.currentUser) {
    const hadLocalChanges = runtime.syncMeta.dirty;
    await checkAuthAndLoad({ syncDirtyNotify: force });
    if (!runtime.currentUser) {
      if (force) {
        showToast(
          isOfflineRememberedSession()
            ? localText(runtime.uiLanguage, "The server is unavailable. The local copy is saved on this device.", "Сервер недоступен. Локальная копия сохранена на устройстве.")
            : (runtime.appUnlocked
              ? localText(runtime.uiLanguage, "Offline: sign in when an internet connection is available.", "Офлайн: войдите, когда появится интернет.")
              : localText(runtime.uiLanguage, "Sign in to synchronize.", "Нужно войти для синхронизации.")),
          isOfflineRememberedSession() ? "warning" : "error"
        );
      }
      return;
    }
    if (force && hadLocalChanges && !runtime.syncMeta.dirty) return;
  }
  if (canOpenAdminPublishedEdit()) {
    await checkAdminApiCompatibility({ force }).catch(() => null);
  }
  if (canOpenAdminPublishedEdit() && isReadOnlyStateScope()) {
    if (!runtime.currentUser) {
      if (force) {
        showToast(localText(runtime.uiLanguage, "Sign in as an administrator to publish demo/shared templates.", "Для публикации demo/shared нужно войти админом."), "error");
        handleAuthButton();
      }
      return;
    }
    const readonlyId = activeReadOnlyLayoutId();
    if (readonlyId === DEMO_SHARED_LAYOUT_ID) {
      await openAdminDemoLayout({ templateId: runtime.activeDemoTemplateListId });
      if (force) showToast(localText(runtime.uiLanguage, "The demo is open for administrator editing. Changes will now be published automatically.", "Открыт admin-edit demo. Изменения теперь будут публиковаться автоматически."), "success");
      return;
    }
    if (readonlyId) {
      await openSharedLayoutForAdmin(readonlyId);
      if (force) showToast(localText(runtime.uiLanguage, "The template is open for administrator editing. Changes will now be published automatically.", "Открыт шаблон для админ-редактирования. Изменения теперь будут публиковаться автоматически."), "success");
      return;
    }
  }
  if (runtime.publishedLayoutSaveTimer && isAdminEditablePublishedLayout(runtime.publishedLayoutSaveLayoutId || getPublishedEditLayoutId())) {
    await flushActivePublishedEditSave();
    if (force) showToast(localText(runtime.uiLanguage, "The public layout was published.", "Public-укладка опубликована."), "success");
    return;
  }
  if (runtime.publishedLayoutSaveTimer) {
    window.clearTimeout(runtime.publishedLayoutSaveTimer);
    runtime.publishedLayoutSaveTimer = null;
    runtime.publishedLayoutSaveLayoutId = "";
  }
  if (isReadOnlyBikePackingContext()) {
    runtime.syncMeta.dirty = false;
    saveSyncMeta();
    const message = currentPublicTemplateStatusMessage();
    updateSyncUi(message);
    if (force) showToast(message, isDemoPublicTemplateMissing(runtime.uiLanguage) ? "warning" : "error");
    return;
  }
  clearStaleDirtyFlagIfNoLocalChanges();
  if (isAdminEditablePublishedLayout()) {
    try {
      await savePublishedLayoutRecord(runtime.state.activeLayoutId, { notify: force });
    } catch (error) {
      const message = localText(runtime.uiLanguage, `Could not save the public layout: ${error.message}`, `Не удалось сохранить public-укладку: ${error.message}`);
      updateSyncUi(message);
      if (force) showToast(message, "error");
    }
    return;
  }
  if (!force && !runtime.syncMeta.dirty) {
    updateSyncUi();
    return;
  }
  if (force && !runtime.syncMeta.dirty) {
    const uploadedPhotos = await uploadPendingPhotos({ markDirty: false });
    if (uploadedPhotos) {
      runtime.syncMeta.dirty = true;
      runtime.syncMeta.localUpdatedAt = nowIso();
      saveSyncMeta();
      await saveRemoteState({ notify: true });
      return;
    }
    updateSyncUi(localText(runtime.uiLanguage, "Checking the server...", "Проверяю сервер..."));
    await checkRemoteStateFreshness({
      notify: true,
      preferredLayout: preferredCurrentLayoutRef()
    });
    updateSyncUi();
    return;
  }
  if (force && runtime.syncMeta.dirty) {
    const preferredLayout = preferredCurrentLayoutRef();
    if (await offerLoadServerForTruncatedLocalState({ notify: true, preferredLayout })) return;
    updateSyncUi(localText(runtime.uiLanguage, "Local changes found · checking timestamps...", "Есть локальные изменения · проверяю даты..."));
    await loadRemoteState({ notifyDirtySave: true, preferredLayout });
    return;
  }
  await saveRemoteState({ notify: force, preferredLayout: force ? preferredCurrentLayoutRef() : null });
}

