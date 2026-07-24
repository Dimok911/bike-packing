import { STARTUP_CACHE_INTEGRITY_VERSION } from "./list-freshness.js";

export async function loadRemoteStateFlow({ runtime, dependencies }, { notifyDirtySave = false, preferredLayout = null } = {}) {
  const state = runtime.state;
  const syncMeta = runtime.syncMeta;
  const {
    applyConflictChoices,
    applyRemoteState,
    askConfirmDialog,
    askConflictResolution,
    blockRemoteIntegrityFailureIfNeeded,
    canUseCachedStartupState,
    canLocalStateOverrideRemote,
    canSeedEmptyRemoteFromLocal,
    clearStaleDirtyFlagIfNoLocalChanges,
    cloneStateForSync,
    createEmptyUserState,
    fetchRemoteListFreshnessRecord,
    fetchRemoteStateRecord,
    filterAutoResolvedMergeConflicts,
    formatMergeConflicts,
    hasLocalSavedState,
    isForeignLocalSyncState,
    isMeaningfulPackingState,
    isNetworkError,
    isPublicLayoutContext,
    isSharedListLinkRoute,
    isSuspiciousEmptyPackingState,
    isTemporaryServerStorageError,
    isTimeoutError,
    loadBaseState,
    currentPackingListId,
    mergeStateFromBase,
    normalizeRemoteState,
    nowIso,
    offerPendingGuestLoginHandoffAfterRemoteLoad = async () => false,
    remoteUpdatedAt,
    rememberCurrentSyncAccount,
    rememberRemoteIntegrityMeta,
    renderInitialLocalFallbackIfNeeded,
    renderPreservingPackingScroll,
    repairPrivateMojibakeLayoutNames,
    replaceState,
    sameJson,
    saveActivePackingListId,
    saveBaseState,
    saveRemoteState,
    saveSyncMeta,
    serializeState,
    serverChangedSinceLastSync,
    setLayoutLoadProgress,
    setLayoutLoadStatus,
    setPersonalLayoutsLoadedStatus,
    showToast,
    stateIntegrityMetaFromResponse,
    statePrivateLayoutCount,
    timeValue,
    tryApplyRemoteEntityChanges,
    updateSyncUi
  } = dependencies;
  const localText = dependencies.localText || ((en, ru) => runtime.uiLanguage === "en" ? en : ru);
  const applyRemoteStateAndOfferGuestHandoff = async (...args) => {
    const applied = applyRemoteState(...args);
    if (applied) await offerPendingGuestLoginHandoffAfterRemoteLoad();
    return applied;
  };
  if (!runtime.currentUser) return;
  if (isSharedListLinkRoute()) return;
  if (isPublicLayoutContext()) {
    runtime.appUnlocked = true;
    renderInitialLocalFallbackIfNeeded();
    updateSyncUi();
    return;
  }
  if (runtime.initialRemoteLoadPending || !runtime.remoteRefreshInFlight) {
    setLayoutLoadStatus(
      "loading",
      runtime.initialRemoteLoadPending
        ? localText("Loading personal layouts...", "Загружаю личные укладки...")
        : localText("Checking personal layouts...", "Проверяю личные укладки...")
    );
  }
  clearStaleDirtyFlagIfNoLocalChanges();
  try {
    const startupListId = typeof currentPackingListId === "function" ? currentPackingListId() : "";
    if (
      runtime.initialRemoteLoadPending &&
      fetchRemoteListFreshnessRecord &&
      startupListId
    ) {
      try {
        const freshness = await fetchRemoteListFreshnessRecord(startupListId);
        const accountMatches = isForeignLocalSyncState ? !isForeignLocalSyncState() : true;
        const hasLocalStateForStartup = hasLocalSavedState();
        if (canUseCachedStartupState?.({
          accountMatches,
          currentListId: startupListId,
          hasLocalState: hasLocalStateForStartup,
          localState: state,
          remoteFreshness: freshness,
          syncMeta
        })) {
          syncMeta.dirty = false;
          syncMeta.serverUpdatedAt = freshness.serverUpdatedAt || freshness.updatedAt || syncMeta.serverUpdatedAt || null;
          syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || syncMeta.serverUpdatedAt;
          syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
          syncMeta.listId = startupListId;
          rememberRemoteIntegrityMeta(freshness);
          rememberCurrentSyncAccount();
          saveBaseState(serializeState({ forSync: true }));
          saveSyncMeta();
          repairPrivateMojibakeLayoutNames();
          runtime.appUnlocked = true;
          runtime.initialRemoteLoadPending = false;
          renderPreservingPackingScroll();
          await offerPendingGuestLoginHandoffAfterRemoteLoad();
          setPersonalLayoutsLoadedStatus();
          updateSyncUi();
          return;
        }
        if (accountMatches && hasLocalStateForStartup && !syncMeta.dirty && tryApplyRemoteEntityChanges) {
          try {
            const changesResult = await tryApplyRemoteEntityChanges(startupListId, freshness, { preferredLayout });
            if (changesResult?.applied) {
              await offerPendingGuestLoginHandoffAfterRemoteLoad();
              return;
            }
            console.info("[bike-packing] Startup entity changes feed fell back to full state refresh", {
              listId: startupListId,
              reason: changesResult?.reason || "not-applied"
            });
          } catch (error) {
            console.info("[bike-packing] Startup entity changes feed failed; falling back to full state refresh", {
              listId: startupListId,
              status: error?.status || null,
              message: error?.message || String(error || "")
            });
          }
        }
      } catch {
        // Older API processes do not have the lightweight endpoint; fall back
        // to the full state load so startup stays compatible during deploys.
      }
    }
    let data = await fetchRemoteStateRecord();
    let record = data.record;
    let remoteState = normalizeRemoteState(record?.payload);
    if (!remoteState && data.source === "list") {
      saveActivePackingListId("");
      setLayoutLoadProgress({
        loaded: 0,
        total: null,
        prefix: localText("Requesting personal layouts again", "Повторно запрашиваю личные укладки")
      });
      data = await fetchRemoteStateRecord();
      record = data.record;
      remoteState = normalizeRemoteState(record?.payload);
    }
    const remoteLayoutCount = statePrivateLayoutCount(remoteState);
    if (remoteState) {
      setLayoutLoadProgress({
        loaded: remoteLayoutCount,
        total: remoteLayoutCount,
        prefix: localText("Personal layouts received", "Личные укладки получены")
      });
    }
    const remoteIntegrityMeta = stateIntegrityMetaFromResponse(record, data);
    const remoteRawPayload = record?.payload || data?.payload || data?.state || null;
    if (blockRemoteIntegrityFailureIfNeeded(remoteState, remoteIntegrityMeta, remoteRawPayload)) return;
    if (remoteState) syncMeta.cacheIntegrityVersion = STARTUP_CACHE_INTEGRITY_VERSION;
    const serverTimeText = remoteUpdatedAt(record);
    const serverTime = timeValue(serverTimeText);
    const localTime = timeValue(syncMeta.localUpdatedAt);
    const isInitialRemotePull = runtime.initialRemoteLoadPending;
    const hasSavedLocalStateNow = hasLocalSavedState();
    const localStateCanOverrideRemote = canLocalStateOverrideRemote();
    const localStateIsNonAuthoritative = hasSavedLocalStateNow && !localStateCanOverrideRemote;
    const hasFreshLocalDirtyState = syncMeta.dirty && localStateCanOverrideRemote && Boolean(localTime) && (!serverTime || localTime > serverTime);
    const shouldPreferLocalDirtyState = syncMeta.dirty && localStateCanOverrideRemote && (
      hasFreshLocalDirtyState ||
      isInitialRemotePull ||
      (!isInitialRemotePull && !syncMeta.serverUpdatedAt)
    );
    const rememberLoadedRemoteRecordMeta = () => {
      if (!record) return;
      rememberRemoteIntegrityMeta(record, remoteIntegrityMeta, data);
      syncMeta.serverUpdatedAt = serverTimeText || syncMeta.serverUpdatedAt || null;
      rememberCurrentSyncAccount();
      saveSyncMeta();
    };
    if (!remoteState) rememberLoadedRemoteRecordMeta();
    if (!remoteState) {
      if (canSeedEmptyRemoteFromLocal()) {
        if (isSuspiciousEmptyPackingState(state)) {
          runtime.appUnlocked = true;
          syncMeta.dirty = false;
          saveSyncMeta();
          renderInitialLocalFallbackIfNeeded();
          if (await offerPendingGuestLoginHandoffAfterRemoteLoad()) return;
          updateSyncUi(localText(
            "The server is empty · the empty local layout was not sent",
            "На сервере пусто · локальная пустая укладка не отправлена"
          ));
          return;
        }
        runtime.appUnlocked = true;
        renderInitialLocalFallbackIfNeeded();
        updateSyncUi(localText(
          "The server is empty · saving local changes...",
          "На сервере пока пусто · сохраняю локальные изменения..."
        ));
        syncMeta.dirty = true;
        syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || nowIso();
        saveSyncMeta();
        await saveRemoteState({ notify: notifyDirtySave, preferServerOnConflict: !localStateCanOverrideRemote });
        await offerPendingGuestLoginHandoffAfterRemoteLoad();
        return;
      }
      replaceState(createEmptyUserState());
      syncMeta.dirty = false;
      saveSyncMeta();
      runtime.initialRemoteLoadPending = false;
      renderPreservingPackingScroll();
      runtime.appUnlocked = true;
      if (await offerPendingGuestLoginHandoffAfterRemoteLoad()) return;
      syncMeta.dirty = true;
      saveSyncMeta();
      updateSyncUi(localText("The server is empty · sending local data...", "На сервере пока пусто · отправляю локальные данные..."));
      await saveRemoteState({ preferServerOnConflict: true });
      return;
    }

    const localJson = JSON.stringify(serializeState({ forSync: true }));
    const remoteJson = JSON.stringify(cloneStateForSync(remoteState, { forSync: true }));
    if (localJson !== remoteJson) {
      if (isSuspiciousEmptyPackingState(state) && isMeaningfulPackingState(remoteState)) {
        await applyRemoteStateAndOfferGuestHandoff(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { preferredLayout });
        if (notifyDirtySave) showToast(localText(
          "The recovered version was loaded from the server.",
          "Загружена восстановленная версия с сервера."
        ), "success");
        return;
      }
      if ((isInitialRemotePull || localStateIsNonAuthoritative) && !localStateCanOverrideRemote && isMeaningfulPackingState(remoteState)) {
        await applyRemoteStateAndOfferGuestHandoff(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout });
        return;
      }
      if (!syncMeta.dirty) {
        await applyRemoteStateAndOfferGuestHandoff(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout });
        return;
      }
      if (shouldPreferLocalDirtyState || (!isInitialRemotePull && !serverChangedSinceLastSync(serverTime) && localTime >= serverTime)) {
        runtime.appUnlocked = true;
        renderInitialLocalFallbackIfNeeded();
        updateSyncUi(localText("Local changes are newer · sending to the server...", "Локальные изменения новее · отправляю на сервер..."));
        await saveRemoteState({ notify: notifyDirtySave });
        return;
      }
      const baseState = loadBaseState();
      const localState = serializeState();
      const mergeResult = mergeStateFromBase(baseState, localState, remoteState);
      if (mergeResult?.merged) {
        mergeResult.conflicts = filterAutoResolvedMergeConflicts(mergeResult.conflicts, {
          baseState,
          localState,
          remoteState,
          valuesEqual: sameJson
        });
      }
      if (mergeResult.merged && !mergeResult.conflicts.length) {
        replaceState(mergeResult.merged);
        syncMeta.dirty = true;
        syncMeta.localUpdatedAt = nowIso();
        saveSyncMeta();
        runtime.appUnlocked = true;
        runtime.initialRemoteLoadPending = false;
        renderPreservingPackingScroll();
        updateSyncUi(localText("Changes merged · sending to the server...", "Изменения объединены · отправляю на сервер..."));
        await saveRemoteState({ notify: notifyDirtySave });
        return;
      }
      if (!mergeResult.merged) {
        runtime.appUnlocked = true;
        renderInitialLocalFallbackIfNeeded();
        updateSyncUi(localText("Different layout versions were found...", "Найдены разные версии укладки..."));
        const useServer = await askConfirmDialog({
          title: localText("There are conflicting changes", "Есть конфликты изменений"),
          text: localText(
            `Some entries were changed both here and on another device:\n\n${formatMergeConflicts(mergeResult.conflicts)}\n\nLoad the server version? If you keep the local version, it will be sent to the server.`,
            `Некоторые элементы менялись и здесь, и на другом устройстве:\n\n${formatMergeConflicts(mergeResult.conflicts)}\n\nЗагрузить серверную версию? Если оставить локальную, она будет отправлена на сервер.`
          ),
          okText: localText("Load server version", "Загрузить серверную"),
          cancelText: localText("Keep local", "Оставить локальную")
        });
        if (useServer) {
          await applyRemoteStateAndOfferGuestHandoff(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { preferredLayout });
          return;
        }
        syncMeta.dirty = true;
        saveSyncMeta();
        await saveRemoteState({ notify: notifyDirtySave });
        return;
      }
      runtime.appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      updateSyncUi(localText("There are conflicting changes...", "Есть конфликты изменений..."));
      const resolution = await askConflictResolution(mergeResult.conflicts);
      if (resolution === "server") {
        await applyRemoteStateAndOfferGuestHandoff(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout });
        return;
      }
      if (resolution === "cancel") {
        syncMeta.dirty = true;
        syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || nowIso();
        saveSyncMeta();
        runtime.appUnlocked = true;
        renderInitialLocalFallbackIfNeeded();
        updateSyncUi(localText(
          "Conflicts were not applied · local changes are saved on this device",
          "Конфликты не применены · локальные изменения сохранены на устройстве"
        ));
        return;
      }
      applyConflictChoices(mergeResult.merged, mergeResult.conflicts, resolution);
      replaceState(mergeResult.merged);
      syncMeta.dirty = true;
      syncMeta.localUpdatedAt = nowIso();
      saveSyncMeta();
      runtime.initialRemoteLoadPending = false;
      renderPreservingPackingScroll();
      updateSyncUi(localText("Conflicts merged · sending to the server...", "Конфликты объединены · отправляю на сервер..."));
      await saveRemoteState({ notify: notifyDirtySave });
      return;
    }

    syncMeta.dirty = false;
    syncMeta.serverUpdatedAt = serverTimeText || null;
    syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || syncMeta.serverUpdatedAt;
    syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
    rememberRemoteIntegrityMeta(record, remoteIntegrityMeta, data);
    rememberCurrentSyncAccount();
    saveBaseState(serializeState({ forSync: true }));
    saveSyncMeta();
    repairPrivateMojibakeLayoutNames();
    runtime.appUnlocked = true;
    if (runtime.initialRemoteLoadPending) {
      runtime.initialRemoteLoadPending = false;
      renderPreservingPackingScroll();
    }
    await offerPendingGuestLoginHandoffAfterRemoteLoad();
    setPersonalLayoutsLoadedStatus();
    updateSyncUi();
  } catch (error) {
    if (isTemporaryServerStorageError(error)) {
      runtime.appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      setLayoutLoadStatus("warning", localText(
        "Sync is temporarily unavailable; the local layout is shown",
        "Синхронизация временно недоступна, показана локальная укладка"
      ));
      updateSyncUi(localText(
        "Server sync is temporarily unavailable · the local layout is available",
        "Серверная синхронизация временно недоступна · локальная укладка доступна"
      ));
      return;
    }
    if (isTimeoutError(error)) {
      runtime.appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      setLayoutLoadStatus("warning", localText(
        "The server is taking too long to respond; the local layout is shown",
        "Сервер долго отвечает, показана локальная укладка"
      ));
      updateSyncUi(localText(
        "The server is taking too long to respond · the local layout is available",
        "Сервер долго отвечает · локальная укладка доступна"
      ));
      return;
    }
    if (isNetworkError(error)) {
      runtime.appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      setLayoutLoadStatus("warning", localText("Offline: the local layout is shown", "Офлайн: показана локальная укладка"));
      updateSyncUi(localText("Offline · the local layout is available", "Офлайн · локальная укладка доступна"));
      return;
    }
    runtime.appUnlocked = true;
    renderInitialLocalFallbackIfNeeded();
    setLayoutLoadStatus("error", localText(
      `Could not load personal layouts: ${error.message}`,
      `Не удалось загрузить личные укладки: ${error.message}`
    ));
    updateSyncUi(localText(`Server unavailable: ${error.message}`, `Сервер недоступен: ${error.message}`));
  }
}

