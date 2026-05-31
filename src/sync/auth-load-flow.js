import { currentDocumentLanguage } from "../utils/language.js";

function localText(en, ru) {
  return currentDocumentLanguage() === "en" ? en : ru;
}

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
    setLayoutLoadStatus("warning", localText("Offline: showing the local layout", "Офлайн: показана локальная укладка"));
    if (isExplicitlySignedOut()) {
      await enterSignedOutPublicMode(localText(
        "Signed out · personal lists are hidden, local demo copy is open",
        "Вы вышли · личные списки скрыты, открыта локальная демо-копия"
      ));
      return;
    }
    unlockOfflineState(localText("Forced offline · local layout is available", "Принудительный офлайн · локальная укладка доступна"));
    return;
  }
  let authData = null;
  try {
    setLayoutLoadStatus("loading", localText("Checking sign-in and personal layouts...", "Проверяем вход и личные укладки..."));
    updateSyncUi(localText("Checking sign-in...", "Проверяем вход..."));
    authData = await apiFetch("/auth/me");
  } catch (error) {
    runtime.currentUser = null;
    if (isAuthCheckUnavailableError(error, isNetworkError)) {
      setLayoutLoadStatus("warning", localText("Server unavailable, trying the local copy", "Сервер недоступен, пробуем локальную копию"));
      if (activateOfflineRememberedSession(localText(
        "Server unavailable · local copy of personal layouts is open",
        "Сервер недоступен · открыта локальная копия личных укладок"
      ))) return;
      if (shouldKeepCurrentReadonlyDemoAfterAuthCheck()) {
        runtime.appUnlocked = true;
        await loadGuestPublishedDemoOnStartup({ forcePublicScope: true });
        updateSyncUi(currentPublicTemplateStatusMessage());
        return;
      }
      await enterSignedOutPublicMode(localText(
        "Server unavailable · personal lists are hidden, local demo copy is open",
        "Сервер недоступен · личные списки скрыты, открыта локальная демо-копия"
      ));
      return;
    }
    setLayoutLoadStatus("warning", localText("Sign-in is not confirmed, personal layouts are hidden", "Вход не подтверждён, личные укладки скрыты"));
    if (shouldKeepCurrentReadonlyDemoAfterAuthCheck()) {
      runtime.appUnlocked = true;
      await loadGuestPublishedDemoOnStartup({ forcePublicScope: true });
      updateSyncUi(currentPublicTemplateStatusMessage());
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
    if (activateOfflineRememberedSession(localText(
      "Sign-in is not confirmed · local copy of personal layouts is open",
      "Вход не подтверждён · открыта локальная копия личных укладок"
    ))) return;
    clearOfflineRememberedSession();
    runtime.appUnlocked = true;
    activateLocalStorageScope(GUEST_STORAGE_SCOPE);
    setLayoutLoadStatus("warning", localText("Sign-in is not confirmed, personal layouts are hidden", "Вход не подтверждён, личные укладки скрыты"));
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
  setLayoutLoadStatus("loading", localText("Loading personal layouts...", "Загружаем личные укладки..."));
  updateSyncUi(localText("Signed in · loading data...", "Вход выполнен · загружаем данные..."));
  await renderCachedPrivateStateDuringRemoteLoad({ restoreLayoutChoice });

  try {
    if (runtime.syncMeta.dirty && hasLocalSavedState()) {
      updateSyncUi(localText("Local changes found · checking timestamps...", "Найдены локальные изменения · проверяем версии..."));
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
      setLayoutLoadStatus("warning", localText("Server unavailable, showing the local layout", "Сервер недоступен, показана локальная укладка"));
      updateSyncUi(localText("Signed in · offline, local layout is available", "Вход выполнен · офлайн, локальная укладка доступна"));
      return;
    }
    renderInitialLocalFallbackIfNeeded();
    setLayoutLoadStatus("error", localText(`Could not load personal layouts: ${error.message}`, `Не удалось загрузить личные укладки: ${error.message}`));
    updateSyncUi(localText(`Signed in · could not load data: ${error.message}`, `Вход выполнен · не удалось загрузить данные: ${error.message}`));
  }
}

export function isAuthCheckUnavailableError(error, isNetworkError = () => false) {
  if (isNetworkError(error)) return true;
  const status = Number(error?.status || error?.data?.status || 0);
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}
