import { clonePlain } from "../utils/json.js";

export function backupLayoutNameKey(layout) {
  return String(layout?.name || "").trim().toLowerCase();
}

export function currentLayoutByBackupName(currentState, name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  return Object.values(currentState?.layouts || {}).find((layout) =>
    backupLayoutNameKey(layout) === key && !layout.adminDemo && !layout.adminSharedSourceId
  ) || null;
}

export function backupLayoutRows(backupState, currentState) {
  return Object.values(backupState?.layouts || {})
    .filter((layout) => layout && !layout.adminDemo && !layout.adminSharedSourceId)
    .map((layout) => {
      const existing = currentLayoutByBackupName(currentState, layout.name);
      return {
        layout,
        mode: existing ? "replace" : "create",
        existing
      };
    });
}

export function summarizeBackupLayouts({
  backupState,
  currentState,
  photoFiles,
  layoutIds = new Set(),
  getLayoutContainerIdSet,
  getLayoutItemIdSet,
  normalizePhotos
} = {}) {
  const rows = backupLayoutRows(backupState, currentState).filter((row) => layoutIds.has(row.layout.id));
  const itemIds = new Set();
  const containerIds = new Set();
  rows.forEach(({ layout }) => {
    getLayoutContainerIdSet(backupState, layout).forEach((id) => containerIds.add(id));
    getLayoutItemIdSet(backupState, layout).forEach((id) => itemIds.add(id));
  });
  const photoIds = new Set();
  [...itemIds].forEach((id) => normalizePhotos(backupState.items?.[id] || {}).forEach((photo) => photoIds.add(photo.id)));
  [...containerIds].forEach((id) => normalizePhotos(backupState.containers?.[id] || {}).forEach((photo) => photoIds.add(photo.id)));
  return {
    replace: rows.filter((row) => row.mode === "replace").length,
    create: rows.filter((row) => row.mode === "create").length,
    newItems: [...itemIds].filter((id) => !currentState.items?.[id]),
    newContainers: [...containerIds].filter((id) => !currentState.containers?.[id]),
    photos: [...photoIds].filter((id) => photoFiles?.has(id))
  };
}

export function mergeBackupRecordWithExisting(targetMap, sourceRecord, { normalizePhotos } = {}) {
  if (!sourceRecord?.id) return { created: false, photoIds: [] };
  const existing = targetMap[sourceRecord.id];
  const sourcePhotos = normalizePhotos(clonePlain(sourceRecord));
  if (!existing) {
    targetMap[sourceRecord.id] = clonePlain(sourceRecord);
    return { created: true, photoIds: sourcePhotos.map((photo) => photo.id).filter(Boolean) };
  }
  existing.photos = Array.isArray(existing.photos) ? existing.photos : [];
  const existingPhotoIds = new Set(existing.photos.map((photo) => String(photo.id || photo.localId || "")).filter(Boolean));
  const addedPhotoIds = [];
  sourcePhotos.forEach((photo) => {
    const photoId = String(photo.id || photo.localId || "").trim();
    if (!photoId || existingPhotoIds.has(photoId)) return;
    existing.photos.push(clonePlain(photo));
    existingPhotoIds.add(photoId);
    addedPhotoIds.push(photoId);
  });
  return { created: false, photoIds: addedPhotoIds };
}

export function addBackupDictionaryValues(targetState, sourceState) {
  for (const key of ["locations", "categories"]) {
    targetState[key] = Array.isArray(targetState[key]) ? targetState[key] : [];
    for (const value of Array.isArray(sourceState?.[key]) ? sourceState[key] : []) {
      if (!targetState[key].includes(value)) targetState[key].push(value);
    }
  }
}
