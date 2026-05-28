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
    consumeGuestLocalLayoutCandidate,
    createBlankBikePackingState,
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
    offerPendingGuestLocalLayoutsAfterRemoteLoad,
    offerSaveGuestLocalLayouts,
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
    shouldImportGuestLayoutBeforeRemote,
    showToast,
    stateIntegrityMetaFromResponse,
    statePrivateLayoutCount,
    timeValue,
    updateSyncUi
  } = dependencies;
  if (!runtime.currentUser) return;
  if (isSharedListLinkRoute()) return;
  if (isPublicLayoutContext()) {
    runtime.appUnlocked = true;
    renderInitialLocalFallbackIfNeeded();
    updateSyncUi();
    return;
  }
  if (runtime.initialRemoteLoadPending || !runtime.remoteRefreshInFlight) {
    setLayoutLoadStatus("loading", runtime.initialRemoteLoadPending ? "Загружаю личные укладки..." : "Проверяю личные укладки...");
  }
  clearStaleDirtyFlagIfNoLocalChanges();
  try {
    const startupListId = typeof currentPackingListId === "function" ? currentPackingListId() : "";
    if (
      runtime.initialRemoteLoadPending &&
      fetchRemoteListFreshnessRecord &&
      startupListId &&
      !runtime.pendingGuestLocalLayoutCandidate
    ) {
      try {
        const freshness = await fetchRemoteListFreshnessRecord(startupListId);
        if (canUseCachedStartupState?.({
          accountMatches: isForeignLocalSyncState ? !isForeignLocalSyncState() : true,
          currentListId: startupListId,
          hasLocalState: hasLocalSavedState(),
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
          await offerPendingGuestLocalLayoutsAfterRemoteLoad();
          setPersonalLayoutsLoadedStatus();
          updateSyncUi();
          return;
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
      setLayoutLoadProgress({ loaded: 0, total: null, prefix: "Повторно запрашиваю личные укладки" });
      data = await fetchRemoteStateRecord();
      record = data.record;
      remoteState = normalizeRemoteState(record?.payload);
    }
    const remoteLayoutCount = statePrivateLayoutCount(remoteState);
    if (remoteState) {
      setLayoutLoadProgress({
        loaded: remoteLayoutCount,
        total: remoteLayoutCount,
        prefix: "Личные укладки получены"
      });
    }
    const remoteIntegrityMeta = stateIntegrityMetaFromResponse(record, data);
    const remoteRawPayload = record?.payload || data?.payload || data?.state || null;
    if (blockRemoteIntegrityFailureIfNeeded(remoteState, remoteIntegrityMeta, remoteRawPayload)) return;
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
    if (!remoteState) {
      if (runtime.pendingGuestLocalLayoutCandidate && !localStateCanOverrideRemote) {
        const guestCandidate = consumeGuestLocalLayoutCandidate();
        replaceState(createBlankBikePackingState(), { preserveLocalUi: false });
        syncMeta.dirty = false;
        saveSyncMeta();
        runtime.initialRemoteLoadPending = false;
        runtime.appUnlocked = true;
        renderPreservingPackingScroll();
        updateSyncUi("Новый аккаунт · переношу гостевую укладку...");
        await offerSaveGuestLocalLayouts(guestCandidate);
        return;
      }
      if (canSeedEmptyRemoteFromLocal()) {
        if (isSuspiciousEmptyPackingState(state)) {
          runtime.appUnlocked = true;
          syncMeta.dirty = false;
          saveSyncMeta();
          renderInitialLocalFallbackIfNeeded();
          updateSyncUi("На сервере пусто · локальная пустая укладка не отправлена");
          return;
        }
        runtime.appUnlocked = true;
        renderInitialLocalFallbackIfNeeded();
        updateSyncUi("На сервере пока пусто · сохраняю локальные изменения...");
        syncMeta.dirty = true;
        syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || nowIso();
        saveSyncMeta();
        await saveRemoteState({ notify: notifyDirtySave, preferServerOnConflict: !localStateCanOverrideRemote });
        return;
      }
      const guestCandidate = consumeGuestLocalLayoutCandidate();
      if (guestCandidate) {
        replaceState(createEmptyUserState());
        syncMeta.dirty = false;
        saveSyncMeta();
        runtime.initialRemoteLoadPending = false;
        runtime.appUnlocked = true;
        renderPreservingPackingScroll();
        updateSyncUi("На сервере пока пусто · можно сохранить гостевую укладку в аккаунт");
        await offerSaveGuestLocalLayouts(guestCandidate);
        return;
      }
      replaceState(createEmptyUserState());
      syncMeta.dirty = true;
      saveSyncMeta();
      runtime.initialRemoteLoadPending = false;
      renderPreservingPackingScroll();
      runtime.appUnlocked = true;
      updateSyncUi("На сервере пока пусто · отправляю локальные данные...");
      await saveRemoteState({ preferServerOnConflict: true });
      return;
    }

    const remoteStateMeaningful = isMeaningfulPackingState(remoteState);
    if (shouldImportGuestLayoutBeforeRemote({
      candidate: runtime.pendingGuestLocalLayoutCandidate,
      remoteStateMeaningful,
      localStateCanOverrideRemote
    })) {
      const guestCandidate = consumeGuestLocalLayoutCandidate();
      replaceState(createBlankBikePackingState(), { preserveLocalUi: false });
      syncMeta.dirty = false;
      saveSyncMeta();
      runtime.initialRemoteLoadPending = false;
      runtime.appUnlocked = true;
      renderPreservingPackingScroll();
      updateSyncUi("Новый аккаунт · переношу гостевую укладку...");
      await offerSaveGuestLocalLayouts(guestCandidate);
      return;
    }

    const localJson = JSON.stringify(serializeState({ forSync: true }));
    const remoteJson = JSON.stringify(cloneStateForSync(remoteState, { forSync: true }));
    if (localJson !== remoteJson) {
      if (isSuspiciousEmptyPackingState(state) && isMeaningfulPackingState(remoteState)) {
        applyRemoteState(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { preferredLayout });
        if (notifyDirtySave) showToast("Загружена восстановленная версия с сервера.", "success");
        return;
      }
      if ((isInitialRemotePull || localStateIsNonAuthoritative) && !localStateCanOverrideRemote && isMeaningfulPackingState(remoteState)) {
        const guestCandidate = consumeGuestLocalLayoutCandidate();
        if (applyRemoteState(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout }) && guestCandidate) {
          await offerSaveGuestLocalLayouts(guestCandidate);
        }
        return;
      }
      if (!syncMeta.dirty) {
        if (applyRemoteState(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout })) {
          await offerPendingGuestLocalLayoutsAfterRemoteLoad();
        }
        return;
      }
      if (shouldPreferLocalDirtyState || (!isInitialRemotePull && !serverChangedSinceLastSync(serverTime) && localTime >= serverTime)) {
        runtime.appUnlocked = true;
        renderInitialLocalFallbackIfNeeded();
        updateSyncUi("Локальные изменения новее · отправляю на сервер...");
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
        updateSyncUi("Изменения объединены · отправляю на сервер...");
        await saveRemoteState({ notify: notifyDirtySave });
        return;
      }
      if (!mergeResult.merged) {
        runtime.appUnlocked = true;
        renderInitialLocalFallbackIfNeeded();
        updateSyncUi("Найдены разные версии укладки...");
        const useServer = await askConfirmDialog({
          title: "Есть конфликты изменений",
          text: `Некоторые элементы менялись и здесь, и на другом устройстве:\n\n${formatMergeConflicts(mergeResult.conflicts)}\n\nЗагрузить серверную версию? Если оставить локальную, она будет отправлена на сервер.`,
          okText: "Загрузить серверную",
          cancelText: "Оставить локальную"
        });
        if (useServer) {
          applyRemoteState(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { preferredLayout });
          return;
        }
        syncMeta.dirty = true;
        saveSyncMeta();
        await saveRemoteState({ notify: notifyDirtySave });
        return;
      }
      runtime.appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      updateSyncUi("Есть конфликты изменений...");
      const resolution = await askConflictResolution(mergeResult.conflicts);
      if (resolution === "server") {
        applyRemoteState(remoteState, serverTimeText, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout });
        return;
      }
      if (resolution === "cancel") {
        syncMeta.dirty = true;
        syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || nowIso();
        saveSyncMeta();
        runtime.appUnlocked = true;
        renderInitialLocalFallbackIfNeeded();
        updateSyncUi("Конфликты не применены · локальные изменения сохранены на устройстве");
        return;
      }
      applyConflictChoices(mergeResult.merged, mergeResult.conflicts, resolution);
      replaceState(mergeResult.merged);
      syncMeta.dirty = true;
      syncMeta.localUpdatedAt = nowIso();
      saveSyncMeta();
      runtime.initialRemoteLoadPending = false;
      renderPreservingPackingScroll();
      updateSyncUi("Конфликты объединены · отправляю на сервер...");
      await saveRemoteState({ notify: notifyDirtySave });
      return;
    }

    syncMeta.dirty = false;
    syncMeta.serverUpdatedAt = serverTimeText || null;
    syncMeta.localUpdatedAt = syncMeta.localUpdatedAt || syncMeta.serverUpdatedAt;
    syncMeta.lastSyncedLocalUpdatedAt = syncMeta.localUpdatedAt;
    rememberRemoteIntegrityMeta(remoteIntegrityMeta);
    rememberCurrentSyncAccount();
    saveBaseState(serializeState({ forSync: true }));
    saveSyncMeta();
    repairPrivateMojibakeLayoutNames();
    runtime.appUnlocked = true;
    if (runtime.initialRemoteLoadPending) {
      runtime.initialRemoteLoadPending = false;
      renderPreservingPackingScroll();
    }
    await offerPendingGuestLocalLayoutsAfterRemoteLoad();
    setPersonalLayoutsLoadedStatus();
    updateSyncUi();
  } catch (error) {
    if (isTemporaryServerStorageError(error)) {
      runtime.appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      setLayoutLoadStatus("warning", "Синхронизация временно недоступна, показана локальная укладка");
      updateSyncUi("Серверная синхронизация временно недоступна · локальная укладка доступна");
      return;
    }
    if (isTimeoutError(error)) {
      runtime.appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      setLayoutLoadStatus("warning", "Сервер долго отвечает, показана локальная укладка");
      updateSyncUi("Сервер долго отвечает · локальная укладка доступна");
      return;
    }
    if (isNetworkError(error)) {
      runtime.appUnlocked = true;
      renderInitialLocalFallbackIfNeeded();
      setLayoutLoadStatus("warning", "Офлайн: показана локальная укладка");
      updateSyncUi("Офлайн · локальная укладка доступна");
      return;
    }
    runtime.appUnlocked = true;
    renderInitialLocalFallbackIfNeeded();
    setLayoutLoadStatus("error", `Не удалось загрузить личные укладки: ${error.message}`);
    updateSyncUi(`Сервер недоступен: ${error.message}`);
  }
}

