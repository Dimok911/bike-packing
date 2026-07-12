export async function readBackupImportFile(event, {
  localText = (en, ru) => ru,
  normalizeRemoteState = () => null,
  readBackupArchiveFile,
  refs,
  resetBackupImportUi = () => {},
  setBackupStatus = () => {}
} = {}) {
  const file = event.target.files?.[0];
  if (!file) return undefined;
  try {
    setBackupStatus(localText("Reading archive...", "Читаю архив..."));
    const { manifest, photoFiles } = await readBackupArchiveFile(file);
    const backupState = normalizeRemoteState(manifest.data?.state || manifest.state);
    if (!backupState) throw new Error(localText("The archive does not contain a valid state.", "В архиве нет корректного состояния."));
    const nextImportState = { manifest, state: backupState, photoFiles, selectedLayoutIds: new Set() };
    setBackupStatus(localText(`Archive loaded. Analyzing contents: ${photoFiles.size} photos...`, `Архив прочитан. Анализирую состав: ${photoFiles.size} фото...`), "success");
    return nextImportState;
  } catch (error) {
    resetBackupImportUi(refs);
    setBackupStatus(localText(`Could not read archive: ${error.message}`, `Не удалось прочитать архив: ${error.message}`), "error");
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
  localText = (en, ru) => ru,
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
  selectedBackupRestoreMode = () => "replace",
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
  const restoreMode = selectedBackupRestoreMode();
  const summary = summarizeSelectedBackupLayouts(selectedIds, restoreMode);
  const confirmed = await askConfirmDialog(selectedBackupRestoreConfirm(summary, { restoreMode }));
  if (!confirmed) return;
  try {
    setBackupStatus(localText("Restoring selected layouts...", "Восстанавливаю выбранные укладки..."));
    saveRecoverySnapshot("before-backup-layout-restore", state);
    const source = backupImportState.state;
    const changedAt = nowIso();
    const { importedPhotoIds } = restoreSelectedBackupLayoutsToState({
      backupCreatedAt: backupImportState.manifest?.createdAt || "",
      backupLanguage: backupImportState.manifest?.language || "ru",
      backupRows: backupLayoutRows(),
      changedAt,
      cloneValue,
      getLayoutContainerIdSet,
      getLayoutItemIdSet,
      markEdited,
      normalizePhotos,
      restoreMode,
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
    setBackupStatus(localText("Selected layouts restored.", "Выбранные укладки восстановлены."), "success");
    showToast(localText("Selected layouts restored.", "Выбранные укладки восстановлены."), "success");
  } catch (error) {
    setBackupStatus(localText(`Could not restore layouts: ${error.message}`, `Не удалось восстановить укладки: ${error.message}`), "error");
  }
}

export async function restoreFullBackupFlow({
  askConfirmDialog = async () => false,
  backupImportState = null,
  fullBackupRestoreConfirm = () => ({}),
  localText = (en, ru) => ru,
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
    setBackupStatus(localText("Restoring full personal state...", "Восстанавливаю полное состояние..."));
    const nextState = normalizeRemoteState(backupImportState.state);
    if (!nextState) throw new Error(localText("The archived state is damaged.", "Состояние из архива повреждено."));
    await prepareBackupPhotosForState(nextState);
    replaceState(nextState, { preserveLocalUi: false });
    syncMeta.dirty = true;
    syncMeta.localUpdatedAt = nowIso();
    saveSyncMeta();
    render();
    await uploadPendingPhotos({ markDirty: true }).catch(() => null);
    await saveRemoteState({ notify: false, forceOverwrite: true }).catch(() => null);
    setBackupStatus(localText("Full personal state restored.", "Полное состояние восстановлено."), "success");
    showToast(localText("Full personal state restored.", "Полное состояние восстановлено."), "success");
  } catch (error) {
    setBackupStatus(localText(`Could not restore state: ${error.message}`, `Не удалось восстановить состояние: ${error.message}`), "error");
  }
}
