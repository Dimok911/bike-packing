import { clonePlain } from "../utils/json.js";
import { normalizeLayoutNotes } from "../state/layout-notes.js";

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

function stableBackupComparisonValue(value) {
  if (Array.isArray(value)) return value.map(stableBackupComparisonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableBackupComparisonValue(value[key])]));
}

function comparableBackupLayout(layout) {
  const value = clonePlain(layout || {});
  delete value.id;
  delete value.updatedAt;
  return stableBackupComparisonValue(value);
}

export function backupLayoutMatchesCurrent(layout, existing) {
  if (!layout || !existing) return false;
  const restored = clonePlain(layout);
  if (existing.locked && !restored.locked) restored.locked = true;
  const existingNotes = normalizeLayoutNotes(existing.notes);
  if (existing.locked && existingNotes && !normalizeLayoutNotes(restored.notes)) restored.notes = existingNotes;
  return JSON.stringify(comparableBackupLayout(restored)) === JSON.stringify(comparableBackupLayout(existing));
}

export function backupCopyLayoutName(name, createdAt, layouts = {}, language = "ru") {
  const english = String(language || "").toLowerCase().startsWith("en");
  const date = new Date(createdAt || "");
  const dateLabel = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(english ? "en-GB" : "ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date)
    : english ? "unknown date" : "без даты";
  const baseName = english
    ? `${String(name || "Unnamed layout").trim()} — from backup ${dateLabel}`
    : `${String(name || "Укладка без названия").trim()} — из бэкапа ${dateLabel}`;
  const usedNames = new Set(Object.values(layouts || {}).map((layout) => backupLayoutNameKey(layout)));
  if (!usedNames.has(backupLayoutNameKey({ name: baseName }))) return baseName;
  let index = 2;
  while (usedNames.has(backupLayoutNameKey({ name: `${baseName} (${index})` }))) index += 1;
  return `${baseName} (${index})`;
}

export function backupLayoutRows(backupState, currentState) {
  return Object.values(backupState?.layouts || {})
    .filter((layout) => layout && !layout.adminDemo && !layout.adminSharedSourceId)
    .map((layout) => {
      const existing = currentLayoutByBackupName(currentState, layout.name);
      return {
        layout,
        mode: existing ? "replace" : "create",
        existing,
        matchesCurrent: backupLayoutMatchesCurrent(layout, existing)
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
  normalizePhotos,
  restoreMode = "replace"
} = {}) {
  const rows = backupLayoutRows(backupState, currentState).filter((row) => layoutIds.has(row.layout.id));
  const lockedLayoutProtections = restoreMode === "copy" ? [] : rows
    .filter(({ layout, existing }) => existing?.locked && !layout?.locked)
    .map(({ layout, existing }) => ({
      id: layout.id,
      name: existing?.name || layout.name || ""
    }));
  const itemIds = new Set();
  const containerIds = new Set();
  rows.forEach(({ layout }) => {
    getLayoutContainerIdSet(backupState, layout).forEach((id) => containerIds.add(id));
    getLayoutItemIdSet(backupState, layout).forEach((id) => itemIds.add(id));
  });
  const newPhotoIds = new Set();
  const collectNewPhotoIds = (sourceRecord, currentRecord) => {
    const currentPhotoIds = new Set(normalizePhotos(clonePlain(currentRecord || {}))
      .map((photo) => String(photo.id || photo.localId || "").trim())
      .filter(Boolean));
    normalizePhotos(clonePlain(sourceRecord || {})).forEach((photo) => {
      const photoId = String(photo.id || photo.localId || "").trim();
      if (photoId && !currentPhotoIds.has(photoId)) newPhotoIds.add(photoId);
    });
  };
  [...itemIds].forEach((id) => collectNewPhotoIds(backupState.items?.[id], currentState.items?.[id]));
  [...containerIds].forEach((id) => collectNewPhotoIds(backupState.containers?.[id], currentState.containers?.[id]));
  const unchangedLayouts = rows.filter((row) => row.matchesCurrent);
  const newItems = [...itemIds].filter((id) => !currentState.items?.[id]);
  const newContainers = [...containerIds].filter((id) => !currentState.containers?.[id]);
  const newPhotos = [...newPhotoIds];
  return {
    replace: restoreMode === "copy" ? 0 : rows.filter((row) => row.mode === "replace").length,
    create: restoreMode === "copy" ? rows.length : rows.filter((row) => row.mode === "create").length,
    unchanged: restoreMode === "copy" ? 0 : unchangedLayouts.length,
    matchesCurrentState: restoreMode !== "copy" && rows.length > 0 && unchangedLayouts.length === rows.length &&
      newItems.length === 0 && newContainers.length === 0 && newPhotos.length === 0,
    lockedLayoutProtections,
    newItems,
    newContainers,
    newPhotos,
    photos: newPhotos.filter((id) => photoFiles?.has(id))
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

export function restoreSelectedBackupLayoutsToState({
  backupCreatedAt = "",
  backupLanguage = "ru",
  backupRows = [],
  changedAt = "",
  cloneValue = clonePlain,
  getLayoutContainerIdSet,
  getLayoutItemIdSet,
  markEdited = () => {},
  normalizePhotos,
  restoreMode = "replace",
  selectedIds = new Set(),
  sourceState = null,
  targetState = null,
  uniqueLayoutId = () => `layout-backup-${Date.now()}-${Math.random().toString(16).slice(2)}`
} = {}) {
  if (!sourceState || !targetState) return { importedPhotoIds: new Set(), restoredLayoutIds: [] };
  const importedPhotoIds = new Set();
  const restoredLayoutIds = [];
  addBackupDictionaryValues(targetState, sourceState);
  backupRows
    .filter((row) => selectedIds.has(row.layout?.id))
    .forEach(({ layout, existing }) => {
      const createCopy = restoreMode === "copy";
      const targetLayoutId = createCopy
        ? uniqueLayoutId(layout)
        : existing?.id || (!targetState.layouts?.[layout.id] ? layout.id : uniqueLayoutId(layout));
      const existingWasLocked = !createCopy && Boolean(existing?.locked);
      const existingNotes = existingWasLocked ? normalizeLayoutNotes(existing?.notes) : "";
      const restoredLayout = {
        ...cloneValue(layout),
        id: targetLayoutId,
        updatedAt: changedAt
      };
      if (createCopy) restoredLayout.name = backupCopyLayoutName(layout.name, backupCreatedAt, targetState.layouts, backupLanguage);
      if (existingWasLocked && !restoredLayout.locked) restoredLayout.locked = true;
      if (existingWasLocked && existingNotes && !normalizeLayoutNotes(restoredLayout.notes)) {
        restoredLayout.notes = existingNotes;
      }
      if (!createCopy && existing?.id) delete targetState.layouts[existing.id];
      getLayoutContainerIdSet(sourceState, layout).forEach((containerId) => {
        const result = mergeBackupRecordWithExisting(targetState.containers, sourceState.containers?.[containerId], { normalizePhotos });
        result.photoIds.forEach((id) => importedPhotoIds.add(id));
        if (result.created) markEdited(targetState.containers[containerId], changedAt);
      });
      getLayoutItemIdSet(sourceState, layout).forEach((itemId) => {
        const result = mergeBackupRecordWithExisting(targetState.items, sourceState.items?.[itemId], { normalizePhotos });
        result.photoIds.forEach((id) => importedPhotoIds.add(id));
        if (result.created) markEdited(targetState.items[itemId], changedAt);
      });
      targetState.layouts[targetLayoutId] = restoredLayout;
      targetState.activeLayoutId = targetLayoutId;
      restoredLayoutIds.push(targetLayoutId);
    });
  return { importedPhotoIds, restoredLayoutIds };
}

export function normalizeRestoredBackupState(targetState, {
  activeLayoutId = targetState?.activeLayoutId || "",
  applyLayoutArrangement = () => {},
  migrateContainerOrder = () => {},
  normalizeContainerFields = () => {},
  normalizeItemCategories = () => {},
  normalizeItemFields = () => {},
  normalizeLayoutFields = () => {},
  repairContainerMembershipFromItemLinks = () => {}
} = {}) {
  normalizeContainerFields(targetState);
  normalizeItemFields(targetState);
  repairContainerMembershipFromItemLinks(targetState);
  normalizeLayoutFields(targetState);
  normalizeItemCategories(targetState);
  migrateContainerOrder(targetState);
  applyLayoutArrangement(activeLayoutId, targetState);
  return targetState;
}
