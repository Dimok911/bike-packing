export async function saveRemoteStateFlow({ runtime, dependencies }, { notify = false, forceOverwrite = false, preferredLayout = null, preferServerOnConflict = false, retryForceConflict = true } = {}) {
  const {
    blockDestructiveLocalSave,
    canLocalStateOverrideRemote,
    clearStaleDirtyFlagIfNoLocalChanges,
    currentPublicTemplateStatusMessage,
    handleRemoteSaveConflict,
    hasLegacyPayloadChanges,
    legacyComparableTopLevelDiffKeys,
    isDemoPublicTemplateMissing,
    isNetworkError,
    isReadOnlyBikePackingContext,
    isReadOnlyBikePackingError,
    isSuspiciousEmptyPackingState,
    isTemporaryServerStorageError,
    isTimeoutError,
    loadBaseState,
    nowIso,
    remoteUpdatedAt,
    rememberConflictRemoteMeta,
    rememberCurrentSyncAccount,
    rememberRemoteIntegrityMeta,
    repairCollapsedActiveLayoutBeforeSave,
    saveBaseState,
    saveRemoteState,
    saveRemoteStateRecord,
    saveSyncMeta,
    serializeState,
    showToast,
    stateIntegrityMetaFromResponse,
    syncChangedBikePackingEntities,
    updateSyncUi,
    uploadPendingPhotos
  } = dependencies;
  if (!runtime.currentUser) return;
  if (forceOverwrite) {
    runtime.syncMeta.localUpdatedAt = nowIso();
    saveSyncMeta();
  }
  if (!forceOverwrite && clearStaleDirtyFlagIfNoLocalChanges()) return;
  if (isReadOnlyBikePackingContext()) {
    runtime.syncMeta.dirty = false;
    saveSyncMeta();
    const message = currentPublicTemplateStatusMessage();
    updateSyncUi(message);
    if (notify) showToast(message, isDemoPublicTemplateMissing(runtime.uiLanguage) ? "warning" : "error");
    return;
  }
  repairCollapsedActiveLayoutBeforeSave();
  try {
    await uploadPendingPhotos();
    if (isSuspiciousEmptyPackingState(runtime.state)) {
      runtime.syncMeta.dirty = false;
      saveSyncMeta();
      updateSyncUi("Пустая локальная укладка не отправлена на сервер · загрузите восстановленную версию");
      if (notify) showToast("Пустая локальная укладка не отправлена на сервер.", "error");
      return;
    }
    if (!forceOverwrite && blockDestructiveLocalSave()) {
      if (notify) showToast("Локальная версия похожа на усечённую. Я не отправил её на сервер.", "error");
      return;
    }
    updateSyncUi("Сохраняю на сервер...");
    const baseBeforeSave = loadBaseState();
    const entitySync = await syncChangedBikePackingEntities({ baseState: baseBeforeSave, forceOverwrite });
    const legacyDiffKeys = typeof legacyComparableTopLevelDiffKeys === "function"
      ? legacyComparableTopLevelDiffKeys(baseBeforeSave, runtime.state, entitySync)
      : [];
    const hasLegacyChanges = legacyDiffKeys.length
      ? true
      : hasLegacyPayloadChanges(baseBeforeSave, runtime.state, entitySync);
    if (!forceOverwrite && entitySync.attempted && !hasLegacyChanges) {
      runtime.syncMeta.dirty = false;
      runtime.syncMeta.serverUpdatedAt = entitySync.serverUpdatedAt || runtime.syncMeta.serverUpdatedAt;
      runtime.syncMeta.localUpdatedAt = runtime.syncMeta.localUpdatedAt || entitySync.serverUpdatedAt || new Date().toISOString();
      runtime.syncMeta.lastSyncedLocalUpdatedAt = runtime.syncMeta.localUpdatedAt;
      rememberRemoteIntegrityMeta(entitySync.integrityMeta);
      rememberCurrentSyncAccount();
      saveBaseState(serializeState({ forSync: true }));
      saveSyncMeta();
      updateSyncUi();
      if (notify) showToast("Синхронизация завершена.", "success");
      return;
    }
    if (!forceOverwrite && entitySync.attempted && hasLegacyChanges) {
      const fallbackReason = legacyPayloadFallbackReasonText(legacyDiffKeys);
      updateSyncUi(`Сохраняю полный payload · ${fallbackReason}`);
      console.info("[bike-packing] Full payload fallback after entity sync", {
        legacyDiffKeys
      });
      if (entitySync.serverUpdatedAt) {
        runtime.syncMeta.serverUpdatedAt = entitySync.serverUpdatedAt;
        runtime.syncMeta.stateRevision = entitySync.integrityMeta?.stateRevision ?? runtime.syncMeta.stateRevision ?? null;
        saveSyncMeta();
      }
    }
    const data = await saveRemoteStateRecord({ forceOverwrite });
    runtime.syncMeta.dirty = false;
    runtime.syncMeta.serverUpdatedAt = remoteUpdatedAt(data.record || data.list || data) || new Date().toISOString();
    runtime.syncMeta.localUpdatedAt = runtime.syncMeta.localUpdatedAt || runtime.syncMeta.serverUpdatedAt;
    runtime.syncMeta.lastSyncedLocalUpdatedAt = runtime.syncMeta.localUpdatedAt;
    rememberRemoteIntegrityMeta(data.record || data.list || data, data);
    rememberCurrentSyncAccount();
    saveBaseState(serializeState({ forSync: true }));
    saveSyncMeta();
    updateSyncUi();
    if (notify) showToast("Синхронизация завершена.", "success");
  } catch (error) {
    if (isReadOnlyBikePackingError(error)) {
      runtime.syncMeta.dirty = false;
      saveSyncMeta();
      const message = currentPublicTemplateStatusMessage();
      updateSyncUi(message);
      if (notify) showToast(message, isDemoPublicTemplateMissing(runtime.uiLanguage) ? "warning" : "error");
      return;
    }
    runtime.syncMeta.dirty = true;
    saveSyncMeta();
    if (error.status === 409) {
      if (forceOverwrite) {
        if (retryForceConflict) {
          const conflictRecord = error.data?.record || error.data?.currentRecord || error.data || null;
          const conflictMeta = stateIntegrityMetaFromResponse(conflictRecord, error.data);
          const conflictUpdatedAt = remoteUpdatedAt(conflictRecord) || error.data?.serverUpdatedAt || "";
          if (conflictMeta?.stateRevision != null || conflictUpdatedAt) {
            rememberConflictRemoteMeta(conflictRecord, conflictMeta, conflictUpdatedAt);
            await saveRemoteState({
              notify,
              forceOverwrite: true,
              preferredLayout,
              preferServerOnConflict,
              retryForceConflict: false
            });
            return;
          }
        }
        updateSyncUi("Сервер всё ещё отклоняет принудительное сохранение · локальная версия оставлена");
        if (notify) showToast("Сервер не принял принудительное сохранение. Локальная версия не потеряна.", "error");
        return;
      }
      await handleRemoteSaveConflict(error, {
        notify,
        preferredLayout,
        preferServerWithoutPrompt: preferServerOnConflict || !canLocalStateOverrideRemote()
      });
      return;
    }
    if (isTemporaryServerStorageError(error)) {
      updateSyncUi("Серверная синхронизация временно недоступна · изменения сохранены на устройстве");
      if (notify) showToast("Серверная синхронизация временно недоступна. Изменения остались на устройстве.", "error");
      return;
    }
    if (isTimeoutError(error)) {
      updateSyncUi("Сервер долго отвечает · изменения сохранены на устройстве");
      if (notify) showToast("Сервер долго отвечает. Изменения остались на устройстве.", "error");
      return;
    }
    if (isNetworkError(error)) {
      updateSyncUi("Офлайн · изменения сохранены на устройстве");
      if (notify) showToast("Нет соединения. Изменения остались на устройстве.", "error");
      return;
    }
    updateSyncUi(`Не удалось синхронизировать: ${error.message}`);
    if (notify) showToast(`Не удалось синхронизировать: ${error.message}`, "error");
  }
}

export function legacyPayloadFallbackReasonText(diffKeys = []) {
  if (!Array.isArray(diffKeys) || !diffKeys.length) return "legacy diff";
  const visibleKeys = diffKeys.slice(0, 4);
  const suffix = diffKeys.length > visibleKeys.length ? ` +${diffKeys.length - visibleKeys.length}` : "";
  return `legacy diff: ${visibleKeys.join(", ")}${suffix}`;
}


export async function handleRemoteSaveConflictFlow(error, { runtime, dependencies }, { notify = false, preferredLayout = null, preferServerWithoutPrompt = false } = {}) {
  const {
    applyConflictChoices,
    applyRemoteState,
    askConflictResolution,
    blockRemoteIntegrityFailureIfNeeded,
    canLocalStateOverrideRemote,
    consumeGuestLocalLayoutCandidate,
    filterAutoResolvedMergeConflicts,
    isOwnLayoutEchoConflict,
    loadBaseState,
    mergeStateFromBase,
    normalizeRemoteState,
    nowIso,
    offerSaveGuestLocalLayouts,
    remoteUpdatedAt,
    rememberConflictRemoteMeta,
    rememberCurrentSyncAccount,
    rememberRemoteIntegrityMeta,
    renderPreservingPackingScroll,
    replaceState,
    sameJson,
    saveBaseState,
    saveRemoteState,
    saveSyncMeta,
    serializeState,
    showToast,
    stateIntegrityMetaFromResponse,
    updateSyncUi
  } = dependencies;
  const record = error.data?.record || error.data?.currentRecord || null;
  const remoteState = normalizeRemoteState(record?.payload || error.data?.payload || error.data?.serverPayload);
  const remoteIntegrityMeta = stateIntegrityMetaFromResponse(record, error.data);
  const updatedAt = remoteUpdatedAt(record) || error.data?.serverUpdatedAt || null;
  rememberConflictRemoteMeta(record, remoteIntegrityMeta, updatedAt);
  runtime.appUnlocked = true;
  updateSyncUi("Сервер изменился · нужно выбрать версию...");
  const remoteRawPayload = record?.payload || error.data?.payload || error.data?.serverPayload || null;
  if (blockRemoteIntegrityFailureIfNeeded(remoteState, remoteIntegrityMeta, remoteRawPayload)) return;
  if (!remoteState) {
    if (notify) showToast("Сервер сообщил о конфликте. Локальные изменения не отправлены.", "error");
    return;
  }
  if (preferServerWithoutPrompt || !canLocalStateOverrideRemote()) {
    const guestCandidate = consumeGuestLocalLayoutCandidate();
    if (applyRemoteState(remoteState, updatedAt, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout })) {
      const message = "Загружена серверная версия · временная локальная копия не отправлена";
      updateSyncUi(message);
      if (notify) showToast(message, "warning");
      if (guestCandidate) await offerSaveGuestLocalLayouts(guestCandidate);
    }
    return;
  }
  const baseState = loadBaseState();
  const mergeResult = baseState ? mergeStateFromBase(baseState, runtime.state, remoteState) : null;
  if (mergeResult?.merged) {
    mergeResult.conflicts = filterAutoResolvedMergeConflicts(mergeResult.conflicts, {
      baseState,
      localState: runtime.state,
      remoteState,
      valuesEqual: sameJson
    });
  }
  if (mergeResult?.merged && mergeResult.conflicts.length) {
    if (isOwnLayoutEchoConflict(mergeResult.conflicts)) {
      updateSyncUi("Раскладка изменена на этом устройстве · отправляю без окна конфликта...");
      await saveRemoteState({ notify, forceOverwrite: true });
      return;
    }
    const resolution = await askConflictResolution(mergeResult.conflicts);
    if (resolution === "server") {
      if (applyRemoteState(remoteState, updatedAt, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout }) && notify) showToast("Загружена серверная версия.", "success");
      return;
    }
    if (resolution === "cancel") {
      runtime.syncMeta.dirty = true;
      runtime.syncMeta.localUpdatedAt = runtime.syncMeta.localUpdatedAt || nowIso();
      saveSyncMeta();
      updateSyncUi("Конфликты не применены · локальные изменения сохранены на устройстве");
      return;
    }
    applyConflictChoices(mergeResult.merged, mergeResult.conflicts, resolution);
    replaceState(mergeResult.merged);
    runtime.syncMeta.dirty = true;
    runtime.syncMeta.localUpdatedAt = nowIso();
    runtime.syncMeta.serverUpdatedAt = updatedAt || runtime.syncMeta.serverUpdatedAt;
    saveSyncMeta();
    renderPreservingPackingScroll();
    updateSyncUi("Конфликты объединены · отправляю на сервер...");
    await saveRemoteState({ notify, forceOverwrite: true });
    return;
  }
  if (mergeResult?.merged && !mergeResult.conflicts.length) {
    replaceState(mergeResult.merged);
    runtime.syncMeta.dirty = true;
    runtime.syncMeta.localUpdatedAt = nowIso();
    runtime.syncMeta.serverUpdatedAt = updatedAt || runtime.syncMeta.serverUpdatedAt;
    saveSyncMeta();
    renderPreservingPackingScroll();
    await saveRemoteState({ notify, forceOverwrite: true });
    return;
  }
  const useLocal = await askConfirmDialog({
    title: "Список меняли на другом устройстве",
    text: "Серверная версия изменилась после последней загрузки. Оставить локальные изменения и отправить их поверх серверной версии?",
    okText: "Оставить локальную",
    cancelText: "Загрузить серверную"
  });
  if (useLocal) {
    await saveRemoteState({ notify, forceOverwrite: true });
    return;
  }
  if (applyRemoteState(remoteState, updatedAt, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout }) && notify) showToast("Загружена серверная версия.", "success");
}
