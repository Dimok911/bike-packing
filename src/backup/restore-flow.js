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
    setBackupStatus("Р§РёС‚Р°СЋ Р°СЂС…РёРІ...");
    const { manifest, photoFiles } = await readBackupArchiveFile(file);
    const backupState = normalizeRemoteState(manifest.data?.state || manifest.state);
    if (!backupState) throw new Error("Р’ Р°СЂС…РёРІРµ РЅРµС‚ РєРѕСЂСЂРµРєС‚РЅРѕРіРѕ СЃРѕСЃС‚РѕСЏРЅРёСЏ.");
    const nextImportState = { manifest, state: backupState, photoFiles, selectedLayoutIds: new Set() };
    setBackupStatus(`РђСЂС…РёРІ РїСЂРѕС‡РёС‚Р°РЅ: ${Object.keys(backupState.layouts || {}).length} СѓРєР»Р°РґРѕРє, ${photoFiles.size} С„РѕС‚Рѕ.`, "success");
    return nextImportState;
  } catch (error) {
    resetBackupImportUi(refs);
    setBackupStatus(`РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ Р°СЂС…РёРІ: ${error.message}`, "error");
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
    setBackupStatus("Р’РѕСЃСЃС‚Р°РЅР°РІР»РёРІР°СЋ РІС‹Р±СЂР°РЅРЅС‹Рµ СѓРєР»Р°РґРєРё...");
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
    setBackupStatus("Р’С‹Р±СЂР°РЅРЅС‹Рµ СѓРєР»Р°РґРєРё РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅС‹.", "success");
    showToast("Р’С‹Р±СЂР°РЅРЅС‹Рµ СѓРєР»Р°РґРєРё РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅС‹.", "success");
  } catch (error) {
    setBackupStatus(`РќРµ СѓРґР°Р»РѕСЃСЊ РІРѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ СѓРєР»Р°РґРєРё: ${error.message}`, "error");
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
    setBackupStatus("Р’РѕСЃСЃС‚Р°РЅР°РІР»РёРІР°СЋ РїРѕР»РЅРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ...");
    const nextState = normalizeRemoteState(backupImportState.state);
    if (!nextState) throw new Error("РЎРѕСЃС‚РѕСЏРЅРёРµ РёР· Р°СЂС…РёРІР° РїРѕРІСЂРµР¶РґРµРЅРѕ.");
    await prepareBackupPhotosForState(nextState);
    replaceState(nextState, { preserveLocalUi: false });
    syncMeta.dirty = true;
    syncMeta.localUpdatedAt = nowIso();
    saveSyncMeta();
    render();
    await uploadPendingPhotos({ markDirty: true }).catch(() => null);
    await saveRemoteState({ notify: false, forceOverwrite: true }).catch(() => null);
    setBackupStatus("РџРѕР»РЅРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРѕ.", "success");
    showToast("РџРѕР»РЅРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРѕ.", "success");
  } catch (error) {
    setBackupStatus(`РќРµ СѓРґР°Р»РѕСЃСЊ РІРѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ СЃРѕСЃС‚РѕСЏРЅРёРµ: ${error.message}`, "error");
  }
}
