import {
  bikePackingEntitySyncConfirmationFailures,
  expectedEntitySyncConfirmationFailures
} from "./entity-sync-confirmation.js";
import { isLegacyPersonalSyncWriteBlockedError } from "./legacy-personal-sync.js";

export async function saveRemoteStateFlow({ runtime, dependencies }, {
  notify = false,
  forceOverwrite = false,
  preferredLayout = null,
  preferServerOnConflict = false,
  retryForceConflict = true,
  expectedEntityIds = null
} = {}) {
  const {
    blockDestructiveLocalSave,
    canLocalStateOverrideRemote,
    clearStaleDirtyFlagIfNoLocalChanges,
    currentPublicTemplateStatusMessage,
    handleRemoteSaveConflict,
    hasLegacyPayloadChanges,
    legacyComparableTopLevelDiffKeys,
    preflightRemoteSaveConflict,
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
  const localText = dependencies.localText || ((en, ru) => runtime.uiLanguage === "en" ? en : ru);
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
      updateSyncUi(localText(
        "The empty local layout was not sent to the server · load the recovered version",
        "Пустая локальная укладка не отправлена на сервер · загрузите восстановленную версию"
      ));
      if (notify) showToast(localText(
        "The empty local layout was not sent to the server.",
        "Пустая локальная укладка не отправлена на сервер."
      ), "error");
      return;
    }
    if (!forceOverwrite && blockDestructiveLocalSave()) {
      if (notify) showToast(localText(
        "The local version appears to be incomplete. It was not sent to the server.",
        "Локальная версия похожа на усечённую. Я не отправил её на сервер."
      ), "error");
      return;
    }
    if (!forceOverwrite && typeof preflightRemoteSaveConflict === "function") {
      const handled = await preflightRemoteSaveConflict({ notify, preferredLayout });
      if (handled) return;
    }
    updateSyncUi(localText("Saving to the server...", "Сохраняю на сервер..."));
    const baseBeforeSave = loadBaseState();
    const entitySync = forceOverwrite
      ? { attempted: false, skipped: true, unavailable: false, integrityMeta: null, upserted: [], deleted: [] }
      : await syncChangedBikePackingEntities({ baseState: baseBeforeSave, forceOverwrite });
    const confirmationFailures = forceOverwrite
      ? []
      : [
          ...bikePackingEntitySyncConfirmationFailures(entitySync),
          ...expectedEntitySyncConfirmationFailures(entitySync, expectedEntityIds || {})
        ];
    const legacyDiffKeys = typeof legacyComparableTopLevelDiffKeys === "function"
      ? legacyComparableTopLevelDiffKeys(baseBeforeSave, runtime.state, entitySync)
      : [];
    const hasLegacyChanges = confirmationFailures.length || legacyDiffKeys.length
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
      if (notify) showToast(localText("Sync complete.", "Синхронизация завершена."), "success");
      return;
    }
    if (!forceOverwrite && entitySync.attempted && hasLegacyChanges) {
      // Allowed full-payload recovery path: entity sync handled its known
      // records, but an audited top-level legacy diff remains. New ordinary
      // fields should be modeled as entities/local UI state instead.
      const fallbackReason = legacyPayloadFallbackReasonText([...confirmationFailures, ...legacyDiffKeys]);
      updateSyncUi(localText(`Saving the full payload · ${fallbackReason}`, `Сохраняю полный payload · ${fallbackReason}`));
      console.info("[bike-packing] Full payload fallback after entity sync", {
        confirmationFailures,
        legacyDiffKeys
      });
      if (entitySync.serverUpdatedAt) {
        runtime.syncMeta.serverUpdatedAt = entitySync.serverUpdatedAt;
        runtime.syncMeta.stateRevision = entitySync.integrityMeta?.stateRevision ?? runtime.syncMeta.stateRevision ?? null;
        saveSyncMeta();
      }
    }
    // Full payload writer is allowed for force overwrite, conflict/recovery
    // merge results, and entity-sync-uncovered legacy diffs through the list API.
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
    if (notify) showToast(localText("Sync complete.", "Синхронизация завершена."), "success");
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
    if (isLegacyPersonalSyncWriteBlockedError(error)) {
      const causeMessage = String(error.cause?.message || "").trim();
      updateSyncUi(localText(
        `Could not save personal layouts${causeMessage ? `: ${causeMessage}` : ""} · changes are saved on this device`,
        `Не удалось сохранить личные укладки${causeMessage ? `: ${causeMessage}` : ""} · изменения сохранены на устройстве`
      ));
      if (notify) showToast(localText(
        "Personal layouts were not saved to the server. Changes remain on this device.",
        "Личные укладки не сохранены на сервере. Изменения остались на устройстве."
      ), "error");
      return;
    }
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
        updateSyncUi(localText(
          "The server still rejects the forced save · the local version was kept",
          "Сервер всё ещё отклоняет принудительное сохранение · локальная версия оставлена"
        ));
        if (notify) showToast(localText(
          "The server rejected the forced save. The local version was not lost.",
          "Сервер не принял принудительное сохранение. Локальная версия не потеряна."
        ), "error");
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
      updateSyncUi(localText(
        "Server sync is temporarily unavailable · changes are saved on this device",
        "Серверная синхронизация временно недоступна · изменения сохранены на устройстве"
      ));
      if (notify) showToast(localText(
        "Server sync is temporarily unavailable. Changes remain on this device.",
        "Серверная синхронизация временно недоступна. Изменения остались на устройстве."
      ), "error");
      return;
    }
    if (isTimeoutError(error)) {
      updateSyncUi(localText(
        "The server is taking too long to respond · changes are saved on this device",
        "Сервер долго отвечает · изменения сохранены на устройстве"
      ));
      if (notify) showToast(localText(
        "The server is taking too long to respond. Changes remain on this device.",
        "Сервер долго отвечает. Изменения остались на устройстве."
      ), "error");
      return;
    }
    if (isNetworkError(error)) {
      updateSyncUi(localText("Offline · changes are saved on this device", "Офлайн · изменения сохранены на устройстве"));
      if (notify) showToast(localText(
        "No connection. Changes remain on this device.",
        "Нет соединения. Изменения остались на устройстве."
      ), "error");
      return;
    }
    const failureMessage = localText(`Could not sync: ${error.message}`, `Не удалось синхронизировать: ${error.message}`);
    updateSyncUi(failureMessage);
    if (notify) showToast(failureMessage, "error");
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
    filterAutoResolvedMergeConflicts,
    isOwnLayoutEchoConflict,
    loadBaseState,
    mergeStateFromBase,
    normalizeRemoteState,
    nowIso,
    offerPendingGuestLoginHandoffAfterRemoteLoad = async () => false,
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
  const localText = dependencies.localText || ((en, ru) => runtime.uiLanguage === "en" ? en : ru);
  const record = error.data?.record || error.data?.currentRecord || null;
  const remoteState = normalizeRemoteState(record?.payload || error.data?.payload || error.data?.serverPayload);
  const remoteIntegrityMeta = stateIntegrityMetaFromResponse(record, error.data);
  const updatedAt = remoteUpdatedAt(record) || error.data?.serverUpdatedAt || null;
  rememberConflictRemoteMeta(record, remoteIntegrityMeta, updatedAt);
  runtime.appUnlocked = true;
  updateSyncUi(localText("The server version changed · choose a version...", "Сервер изменился · нужно выбрать версию..."));
  const remoteRawPayload = record?.payload || error.data?.payload || error.data?.serverPayload || null;
  if (blockRemoteIntegrityFailureIfNeeded(remoteState, remoteIntegrityMeta, remoteRawPayload)) return;
  if (!remoteState) {
    if (notify) showToast(localText(
      "The server reported a conflict. Local changes were not sent.",
      "Сервер сообщил о конфликте. Локальные изменения не отправлены."
    ), "error");
    return;
  }
  if (preferServerWithoutPrompt || !canLocalStateOverrideRemote()) {
    if (applyRemoteState(remoteState, updatedAt, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout })) {
      const message = localText(
        "The server version was loaded · the temporary local copy was not sent",
        "Загружена серверная версия · временная локальная копия не отправлена"
      );
      updateSyncUi(message);
      if (notify) showToast(message, "warning");
      await offerPendingGuestLoginHandoffAfterRemoteLoad();
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
      updateSyncUi(localText(
        "The layout was changed on this device · sending without a conflict dialog...",
        "Раскладка изменена на этом устройстве · отправляю без окна конфликта..."
      ));
      await saveRemoteState({ notify, forceOverwrite: true });
      return;
    }
    const resolution = await askConflictResolution(mergeResult.conflicts);
    if (resolution === "server") {
      if (applyRemoteState(remoteState, updatedAt, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout }) && notify) {
        showToast(localText("The server version was loaded.", "Загружена серверная версия."), "success");
      }
      return;
    }
    if (resolution === "cancel") {
      runtime.syncMeta.dirty = true;
      runtime.syncMeta.localUpdatedAt = runtime.syncMeta.localUpdatedAt || nowIso();
      saveSyncMeta();
      updateSyncUi(localText(
        "Conflicts were not applied · local changes are saved on this device",
        "Конфликты не применены · локальные изменения сохранены на устройстве"
      ));
      return;
    }
    applyConflictChoices(mergeResult.merged, mergeResult.conflicts, resolution);
    replaceState(mergeResult.merged);
    runtime.syncMeta.dirty = true;
    runtime.syncMeta.localUpdatedAt = nowIso();
    runtime.syncMeta.serverUpdatedAt = updatedAt || runtime.syncMeta.serverUpdatedAt;
    saveSyncMeta();
    renderPreservingPackingScroll();
    updateSyncUi(localText("Conflicts merged · sending to the server...", "Конфликты объединены · отправляю на сервер..."));
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
    title: localText("The list was changed on another device", "Список меняли на другом устройстве"),
    text: localText(
      "The server version changed after the last load. Keep the local changes and save them over the server version?",
      "Серверная версия изменилась после последней загрузки. Оставить локальные изменения и отправить их поверх серверной версии?"
    ),
    okText: localText("Keep local", "Оставить локальную"),
    cancelText: localText("Load server version", "Загрузить серверную")
  });
  if (useLocal) {
    await saveRemoteState({ notify, forceOverwrite: true });
    return;
  }
  if (applyRemoteState(remoteState, updatedAt, remoteIntegrityMeta, remoteRawPayload, { allowDestructive: true, preferredLayout }) && notify) {
    showToast(localText("The server version was loaded.", "Загружена серверная версия."), "success");
  }
}
