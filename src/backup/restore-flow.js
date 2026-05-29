export async function readBackupImportFile(event, {
  normalizeRemoteState = () => null,
  readBackupArchiveFile,
  refs,
  resetBackupImportUi = () => {},
  setBackupStatus = () => {}
} = {}) {
  const file = event.target.files?.[0];
  if (!file) return undefined;
  try {
    setBackupStatus("Читаю архив...");
    const { manifest, photoFiles } = await readBackupArchiveFile(file);
    const backupState = normalizeRemoteState(manifest.data?.state || manifest.state);
    if (!backupState) throw new Error("В архиве нет корректного состояния.");
    const nextImportState = { manifest, state: backupState, photoFiles, selectedLayoutIds: new Set() };
    setBackupStatus(`Архив прочитан: ${Object.keys(backupState.layouts || {}).length} укладок, ${photoFiles.size} фото.`, "success");
    return nextImportState;
  } catch (error) {
    resetBackupImportUi(refs);
    setBackupStatus(`Не удалось прочитать архив: ${error.message}`, "error");
    return null;
  }
}

export async function restoreSelectedBackupLayoutsFlow({
  askConfirmDialog = async () => false,
  backupImportState = null,
  backupLayoutRows = () => [],
  cloneValue = (value) => value,
  getLayoutContainerIdSet = () => new Set(),
  getLayoutItemIdSet = () => new Set(),
  markEdited = () => {},
  normalizePhotos = (photos) => photos,
  normalizeRestoredBackupState = () => {},
  nowIso = () => new Date().toISOString(),
  prepareBackupPhotosForState = async () => {},
  render = () => {},
  restoreSelectedBackupLayoutsToState,
  saveRecoverySnapshot = () => {},
  saveRemoteState = async () => {},
  saveState = () => {},
  selectedBackupLayoutIds = () => new Set(),
  selectedBackupRestoreConfirm = () => ({}),
  setBackupStatus = () => {},
  showToast = () => {},
  state,
  summarizeSelectedBackupLayouts = () => ({}),
  uploadPendingPhotos = async () => {},
  uniqueLayoutId = () => ""
} = {}) {
  if (!backupImportState) return;
  const selectedIds = selectedBackupLayoutIds();
  if (!selectedIds.size) return;
  const summary = summarizeSelectedBackupLayouts(selectedIds);
  const confirmed = await askConfirmDialog(selectedBackupRestoreConfirm(summary));
  if (!confirmed) return;
  try {
    setBackupStatus("Восстанавливаю выбранные укладки...");
    saveRecoverySnapshot("before-backup-layout-restore", state);
    const source = backupImportState.state;
    const changedAt = nowIso();
    const { importedPhotoIds } = restoreSelectedBackupLayoutsToState({
      backupRows: backupLayoutRows(),
      changedAt,
      cloneValue,
      getLayoutContainerIdSet,
      getLayoutItemIdSet,
      markEdited,
      normalizePhotos,
      selectedIds,
      sourceState: source,
      targetState: state,
      uniqueLayoutId
    });
    await prepareBackupPhotosForState(state, importedPhotoIds);
    normalizeRestoredBackupState(state);
    saveState();
    render();
    await uploadPendingPhotos({ markDirty: true }).catch(() => null);
    await saveRemoteState({ notify: false, forceOverwrite: true }).catch(() => null);
    setBackupStatus("Выбранные укладки восстановлены.", "success");
    showToast("Выбранные укладки восстановлены.", "success");
  } catch (error) {
    setBackupStatus(`Не удалось восстановить укладки: ${error.message}`, "error");
  }
}

export async function restoreFullBackupFlow({
  askConfirmDialog = async () => false,
  backupImportState = null,
  fullBackupRestoreConfirm = () => ({}),
  normalizeRemoteState = () => null,
  nowIso = () => new Date().toISOString(),
  prepareBackupPhotosForState = async () => {},
  render = () => {},
  replaceState = () => {},
  saveRemoteState = async () => {},
  saveSyncMeta = () => {},
  setBackupStatus = () => {},
  showToast = () => {},
  stateStats = () => ({}),
  syncMeta,
  uploadPendingPhotos = async () => {}
} = {}) {
  if (!backupImportState) return;
  const stats = stateStats(backupImportState.state);
  const confirmed = await askConfirmDialog(fullBackupRestoreConfirm(stats));
  if (!confirmed) return;
  try {
    setBackupStatus("Восстанавливаю полное состояние...");
    const nextState = normalizeRemoteState(backupImportState.state);
    if (!nextState) throw new Error("Состояние из архива повреждено.");
    await prepareBackupPhotosForState(nextState);
    replaceState(nextState, { preserveLocalUi: false });
    syncMeta.dirty = true;
    syncMeta.localUpdatedAt = nowIso();
    saveSyncMeta();
    render();
    await uploadPendingPhotos({ markDirty: true }).catch(() => null);
    await saveRemoteState({ notify: false, forceOverwrite: true }).catch(() => null);
    setBackupStatus("Полное состояние восстановлено.", "success");
    showToast("Полное состояние восстановлено.", "success");
  } catch (error) {
    setBackupStatus(`Не удалось восстановить состояние: ${error.message}`, "error");
  }
}
