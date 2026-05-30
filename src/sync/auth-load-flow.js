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
    setLayoutLoadStatus("warning", "Offline: showing the local layout");
    if (isExplicitlySignedOut()) {
      await enterSignedOutPublicMode("Signed out · personal lists are hidden, local demo copy is open");
      return;
    }
    unlockOfflineState("Forced offline · local layout is available");
    return;
  }
  let authData = null;
  try {
    setLayoutLoadStatus("loading", "Checking sign-in and personal layouts...");
    updateSyncUi("Checking sign-in...");
    authData = await apiFetch("/auth/me");
  } catch (error) {
    runtime.currentUser = null;
    if (isAuthCheckUnavailableError(error, isNetworkError)) {
      setLayoutLoadStatus("warning", "Server unavailable, trying the local copy");
      if (activateOfflineRememberedSession("Server unavailable · local copy of personal layouts is open")) return;
      if (shouldKeepCurrentReadonlyDemoAfterAuthCheck()) {
        runtime.appUnlocked = true;
        await loadGuestPublishedDemoOnStartup({ forcePublicScope: true });
        updateSyncUi(currentPublicTemplateStatusMessage());
        return;
      }
      await enterSignedOutPublicMode("Server unavailable · personal lists are hidden, local demo copy is open");
      return;
    }
    setLayoutLoadStatus("warning", "Sign-in is not confirmed, personal layouts are hidden");
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
    if (activateOfflineRememberedSession("Sign-in is not confirmed · local copy of personal layouts is open")) return;
    clearOfflineRememberedSession();
    runtime.appUnlocked = true;
    activateLocalStorageScope(GUEST_STORAGE_SCOPE);
    setLayoutLoadStatus("warning", "Sign-in is not confirmed, personal layouts are hidden");
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
  setLayoutLoadStatus("loading", "Loading personal layouts...");
  updateSyncUi("Signed in · loading data...");
  await renderCachedPrivateStateDuringRemoteLoad({ restoreLayoutChoice });

  try {
    if (runtime.syncMeta.dirty && hasLocalSavedState()) {
      updateSyncUi("Local changes found · checking timestamps...");
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
      setLayoutLoadStatus("warning", "Server unavailable, showing the local layout");
      updateSyncUi("Signed in · offline, local layout is available");
      return;
    }
    renderInitialLocalFallbackIfNeeded();
    setLayoutLoadStatus("error", `Could not load personal layouts: ${error.message}`);
    updateSyncUi(`Signed in · could not load data: ${error.message}`);
  }
}

export function isAuthCheckUnavailableError(error, isNetworkError = () => false) {
  if (isNetworkError(error)) return true;
  const status = Number(error?.status || error?.data?.status || 0);
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

