import { getLayoutContainerIdSet, getLayoutItemIdSet } from "../state/layout-ops.js";
import { normalizeItemPhotos } from "../state/item-photos.js";
import {
  hasRemotePhotoUrl,
  isPhotoStoredForList,
  isPhotoUsableFromServer,
  keepRemoteOnlyPhotoReference,
  photoShouldBeCopiedToCurrentList
} from "./photos.js";

export function getPhotoUploadScope(targetState, layoutId = null) {
  if (!layoutId) return null;
  const layout = targetState.layouts?.[layoutId];
  if (!layout) return null;
  const containerIds = getLayoutContainerIdSet(targetState, layout);
  const itemIds = new Set();
  containerIds.forEach((containerId) => {
    (targetState.containers?.[containerId]?.itemIds || []).forEach((itemId) => itemIds.add(itemId));
  });
  return { containerIds, itemIds };
}

export function isEntityInPhotoUploadScope(entity, entityType, scope) {
  if (!scope) return true;
  if (entityType === "container") return scope.containerIds.has(entity.id);
  return scope.itemIds.has(entity.id);
}

export function getUploadablePhotoEntries(targetState, {
  layoutId = null,
  listId = "",
  allowRemoteOnlyReferences = true
} = {}) {
  const scope = getPhotoUploadScope(targetState, layoutId);
  const entries = [];
  collectPhotoEntities(targetState, scope, (entity, entityType, photo) => {
    if (!photoShouldBeCopiedToCurrentList(photo) && isPhotoUsableFromServer(photo, listId)) return;
    const needsListReupload = listId && hasRemotePhotoUrl(photo) && !isPhotoStoredForList(photo, listId);
    if (needsListReupload && allowRemoteOnlyReferences && !photoShouldBeCopiedToCurrentList(photo) && keepRemoteOnlyPhotoReference(photo)) return;
    if (needsListReupload && allowRemoteOnlyReferences && photo.status === "missing-local-file") return;
    if (!needsListReupload && !["pending", "error", "uploading"].includes(photo.status)) return;
    if (!needsListReupload && photo.url && photo.thumbUrl && photo.status === "synced") return;
    entries.push({ entity, entityType, photo });
  });
  return entries;
}

export function markRecordPhotosForCurrentListCopy(record) {
  if (!record || !Array.isArray(record.photos)) return;
  normalizeItemPhotos(record).forEach((photo) => {
    if (!hasRemotePhotoUrl(photo)) return;
    photo._copyToCurrentList = true;
  });
}

export function markLayoutPhotosForCurrentListCopy(targetState, layoutId) {
  const layout = targetState.layouts?.[layoutId];
  if (!layout) return;
  getLayoutContainerIdSet(targetState, layout).forEach((containerId) => {
    markRecordPhotosForCurrentListCopy(targetState.containers?.[containerId]);
  });
  getLayoutItemIdSet(targetState, layout).forEach((itemId) => {
    markRecordPhotosForCurrentListCopy(targetState.items?.[itemId]);
  });
}

export function getUnsyncedPhotoEntries(targetState, {
  layoutId = null,
  listId = ""
} = {}) {
  const scope = getPhotoUploadScope(targetState, layoutId);
  const entries = [];
  collectPhotoEntities(targetState, scope, (entity, entityType, photo) => {
    if (hasRemotePhotoUrl(photo)) {
      if (listId && !isPhotoStoredForList(photo, listId)) {
        photo.error = photo.error || "Фото не загружено в public-укладку.";
        entries.push({ entity, entityType, photo });
      }
      return;
    }
    if (photo.localId || photo.status !== "synced") entries.push({ entity, entityType, photo });
  });
  return entries;
}

function collectPhotoEntities(targetState, scope, visitPhoto) {
  Object.values(targetState.items || {}).forEach((item) => {
    if (!isEntityInPhotoUploadScope(item, "item", scope)) return;
    normalizeItemPhotos(item).forEach((photo) => visitPhoto(item, "item", photo));
  });
  Object.values(targetState.containers || {}).forEach((container) => {
    if (!isEntityInPhotoUploadScope(container, "container", scope)) return;
    normalizeItemPhotos(container).forEach((photo) => visitPhoto(container, "container", photo));
  });
}
