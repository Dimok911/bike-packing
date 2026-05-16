import {
  normalizePhotoStatus,
  normalizePhotoUrlFields,
  syncSafePhotoUrl
} from "./photos.js";

export function cloneStateForSyncPayload(sourceState, {
  forSync = false,
  cleanupGeneratedCatalogArtifacts = null,
  pruneAdminPublishedDraftsForSync = null
} = {}) {
  const cloned = JSON.parse(JSON.stringify(sourceState));
  if (forSync) {
    cleanupGeneratedCatalogArtifacts?.(cloned, { forSync: true });
    delete cloned.collapsedContainers;
    delete cloned.showItemMeta;
    delete cloned.showFilterContext;
    delete cloned.collectionMode;
    delete cloned.showOnlyUnpacked;
    prunePhotoPayloadForSync(cloned);
    pruneAdminPublishedDraftsForSync?.(cloned);
    stripAppliedArrangementFieldsForSync(cloned);
    stripLocalPublicCopyOriginsForSync(cloned);
  }
  return cloned;
}

export function stripLocalPublicCopyOriginsForSync(cloned) {
  Object.values(cloned.items || {}).forEach(stripLocalPublicCopyOrigin);
  Object.values(cloned.containers || {}).forEach(stripLocalPublicCopyOrigin);
}

export function stripLocalPublicCopyOrigin(record) {
  if (!record || typeof record !== "object") return;
  delete record._publicCopySourceKind;
  delete record._publicCopySourceId;
  delete record._publicCopySourceLayoutId;
}

export function stripAppliedArrangementFieldsForSync(cloned) {
  Object.values(cloned.items || {}).forEach((item) => stripItemPlacementFields(item));
  Object.values(cloned.containers || {}).forEach((container) => stripContainerArrangementFields(container));
}

export function prunePhotoPayloadForSync(cloned) {
  Object.values(cloned.items || {}).forEach((item) => {
    if (Array.isArray(item.photos)) item.photos = item.photos.map(compactPhotoForSync).filter(Boolean);
  });
  Object.values(cloned.containers || {}).forEach((container) => {
    if (Array.isArray(container.photos)) container.photos = container.photos.map(compactPhotoForSync).filter(Boolean);
  });
}

export function compactPhotoForSync(photo) {
  if (!photo || typeof photo !== "object") return null;
  normalizePhotoUrlFields(photo);
  const id = String(photo.id || photo.photoId || "").trim();
  if (!id) return null;
  const url = syncSafePhotoUrl(photo.url);
  const thumbUrl = syncSafePhotoUrl(photo.thumbUrl);
  const compact = {
    id,
    status: normalizePhotoStatus(photo.status),
    url,
    thumbUrl,
    listId: typeof photo.listId === "string" || typeof photo.listId === "number" ? String(photo.listId) : "",
    width: Number.isFinite(Number(photo.width)) ? Number(photo.width) : 0,
    height: Number.isFinite(Number(photo.height)) ? Number(photo.height) : 0,
    updatedAt: typeof photo.updatedAt === "string" ? photo.updatedAt : ""
  };
  if (!compact.url && !compact.thumbUrl && compact.status === "synced") compact.status = "pending";
  return compact;
}

export function compactRecordForEntitySync(record) {
  if (!record || typeof record !== "object") return null;
  const compact = JSON.parse(JSON.stringify(record));
  stripLocalPublicCopyOrigin(compact);
  if (Array.isArray(compact.photos)) compact.photos = compact.photos.map(compactPhotoForSync).filter(Boolean);
  compact.id = String(compact.id || "").trim();
  return compact.id ? compact : null;
}

export function stripItemPlacementFields(record) {
  if (!record) return record;
  delete record.containerId;
  delete record.parentContainerId;
  return record;
}

export function stripContainerArrangementFields(record) {
  if (!record) return record;
  delete record.parentId;
  delete record.parentContainerId;
  delete record.containerId;
  delete record.itemIds;
  delete record.childIds;
  delete record.order;
  return record;
}

export function compactItemForEntitySync(item) {
  return stripItemPlacementFields(compactRecordForEntitySync(item));
}

export function compactContainerForEntitySync(container) {
  return stripContainerArrangementFields(compactRecordForEntitySync(container));
}

export function compactLayoutForEntitySync(layout) {
  return compactRecordForEntitySync(layout);
}
