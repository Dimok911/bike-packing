export async function checkAuthAndLoadFlow({ runtime, dependencies }, { syncDirtyNotify = false, restoreLayoutChoice = true, preferredLayout = null } = {}) {
  const {
    activateLocalStorageScope,
    activateLocalStorageScopeForCurrentUser,
    activateOfflineRememberedSession,
    apiFetch,
    checkAdminApiCompatibility,
    clearOfflineRememberedSession,
    currentPublicTemplateStatusMessage,
    currentPrivateLayoutRef,
    enterSignedOutPublicMode,
    hasLocalSavedState,
    isAdminUser,
    isExplicitlySignedOut,
    isForcedOffline,
    isNetworkError,
    isSharedListLinkRoute,
    loadGuestPublishedDemoOnStartup,
    loadRemoteState,
    rememberAuthenticatedUser,
    renderCachedPrivateStateDuringRemoteLoad,
    renderInitialLocalFallbackIfNeeded,
    restoreSavedLayoutChoice,
    restoreTemplateCopyDraftsFromRecovery,
    applyPreferredPrivateLayoutChoice,
    storedPrivateLayoutChoiceRef,
    setExplicitlySignedOut,
    setLayoutLoadStatus,
    setPersonalLayoutsLoadedStatus,
    shouldKeepCurrentReadonlyDemoAfterAuthCheck,
    unlockOfflineState,
    updateSyncUi,
    GUEST_STORAGE_SCOPE
  } = dependencies;
  if (isSharedListLinkRoute()) return;
  if (isForcedOffline()) {
    setLayoutLoadStatus("warning", "Офлайн: показана локальная укладка");
    if (isExplicitlySignedOut()) {
      await enterSignedOutPublicMode("Вы вышли · личные списки скрыты, открыта локальная копия демо");
      return;
    }
    unlockOfflineState("Принудительно офлайн · локальная укладка доступна");
    return;
  }
  let authData = null;
  try {
    setLayoutLoadStatus("loading", "Проверяю вход и личные укладки...");
    updateSyncUi("Проверяю вход...");
    authData = await apiFetch("/auth/me");
  } catch (error) {
    runtime.currentUser = null;
    setLayoutLoadStatus("warning", "Вход не подтверждён, личные укладки скрыты");
    if (shouldKeepCurrentReadonlyDemoAfterAuthCheck()) {
      runtime.appUnlocked = true;
      await loadGuestPublishedDemoOnStartup({ forcePublicScope: true });
      updateSyncUi(currentPublicTemplateStatusMessage());
      return;
    }
    if (isNetworkError(error)) {
      if (activateOfflineRememberedSession("Сервер недоступен · открыта локальная копия личных укладок")) return;
      await enterSignedOutPublicMode("Вход не подтверждён · личные списки скрыты, открыта локальная копия демо");
      return;
    }
    runtime.appUnlocked = true;
    await loadGuestPublishedDemoOnStartup({
      preferLocalCopy: true,
      allowAutomaticLocalCopy: true,
      remember: true
    });
    updateSyncUi();
    return;
  }

  runtime.currentUser = authData.user || authData.me || authData.account || null;
  if (!runtime.currentUser && (authData.id || authData.email)) runtime.currentUser = { id: authData.id, email: authData.email };
  if (!runtime.currentUser) {
    clearOfflineRememberedSession();
    runtime.appUnlocked = true;
    activateLocalStorageScope(GUEST_STORAGE_SCOPE);
    setLayoutLoadStatus("warning", "Вход не подтверждён, личные укладки скрыты");
    if (shouldKeepCurrentReadonlyDemoAfterAuthCheck()) {
      await loadGuestPublishedDemoOnStartup({ forcePublicScope: true });
      updateSyncUi(currentPublicTemplateStatusMessage());
      return;
    }
    await loadGuestPublishedDemoOnStartup({
      preferLocalCopy: true,
      allowAutomaticLocalCopy: true,
      remember: true
    });
    updateSyncUi();
    return;
  }

  setExplicitlySignedOut(false);
  clearOfflineRememberedSession();
  runtime.appUnlocked = true;
  const startupPreferredLayout = preferredLayout || currentPrivateLayoutRef?.() || null;
  activateLocalStorageScopeForCurrentUser();
  const storedPreferredLayout = storedPrivateLayoutChoiceRef?.() || null;
  if (startupPreferredLayout && !storedPreferredLayout) {
    applyPreferredPrivateLayoutChoice?.(startupPreferredLayout, { remember: true });
  }
  const remotePreferredLayout = preferredLayout ||
    storedPreferredLayout ||
    (!storedPreferredLayout ? startupPreferredLayout : null) ||
    currentPrivateLayoutRef?.() ||
    null;
  rememberAuthenticatedUser();
  restoreTemplateCopyDraftsFromRecovery();
  if (isAdminUser()) checkAdminApiCompatibility({ force: true }).catch(() => null);
  setLayoutLoadStatus("loading", "Загружаю личные укладки...");
  updateSyncUi("Вход выполнен · загружаю данные...");
  await renderCachedPrivateStateDuringRemoteLoad({ restoreLayoutChoice });

  try {
    if (runtime.syncMeta.dirty && hasLocalSavedState()) {
      updateSyncUi("Есть локальные изменения · проверяю даты...");
      await loadRemoteState({ notifyDirtySave: syncDirtyNotify, preferredLayout: remotePreferredLayout });
      if (restoreLayoutChoice) await restoreSavedLayoutChoice({ privateOnly: true });
      setPersonalLayoutsLoadedStatus();
      return;
    }
    await loadRemoteState({ preferredLayout: remotePreferredLayout });
    if (restoreLayoutChoice) await restoreSavedLayoutChoice({ privateOnly: true });
    setPersonalLayoutsLoadedStatus();
  } catch (error) {
    if (isNetworkError(error)) {
      renderInitialLocalFallbackIfNeeded();
      setLayoutLoadStatus("warning", "Сервер недоступен, показана локальная укладка");
      updateSyncUi("Вход выполнен · офлайн, локальная укладка доступна");
      return;
    }
    renderInitialLocalFallbackIfNeeded();
    setLayoutLoadStatus("error", `Не удалось загрузить личные укладки: ${error.message}`);
    updateSyncUi(`Вход выполнен · не удалось загрузить данные: ${error.message}`);
  }
}

