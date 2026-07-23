import { nowIso } from "../utils/time.js";

export function normalizePhotoStatus(value) {
  return ["pending", "uploading", "synced", "error", "missing-local-file"].includes(value) ? value : "synced";
}

export function normalizePhotoUrlFields(photo) {
  if (!photo || typeof photo !== "object") return photo;
  const url = photo.url || photo.fileUrl || photo.file_url || photo.src || photo.href || photo.urls?.url || photo.urls?.file || photo.urls?.original || "";
  const thumbUrl = photo.thumbUrl || photo.thumb_url || photo.thumbnailUrl || photo.thumbnail_url || photo.thumb || photo.urls?.thumb || photo.urls?.thumbnail || "";
  if (url && !photo.url) photo.url = String(url);
  if (thumbUrl && !photo.thumbUrl) photo.thumbUrl = String(thumbUrl);
  return photo;
}

export function normalizeItemPhotos(item) {
  if (!item || typeof item !== "object") return [];
  if (!Array.isArray(item.photos)) item.photos = [];
  item.photos = item.photos
    .filter((photo) => photo && typeof photo === "object")
    .map((photo) => {
      normalizePhotoUrlFields(photo);
      const normalized = {
        id: String(photo.id || photo.localId || `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        localId: photo.localId ? String(photo.localId) : "",
        status: normalizePhotoStatus(photo.status),
        url: typeof photo.url === "string" ? photo.url : "",
        thumbUrl: typeof photo.thumbUrl === "string" ? photo.thumbUrl : "",
        listId: typeof photo.listId === "string" || typeof photo.listId === "number" ? String(photo.listId) : "",
        fileName: typeof photo.fileName === "string" ? photo.fileName : "",
        type: typeof photo.type === "string" ? photo.type : "",
        size: Number.isFinite(Number(photo.size)) ? Number(photo.size) : 0,
        width: Number.isFinite(Number(photo.width)) ? Number(photo.width) : 0,
        height: Number.isFinite(Number(photo.height)) ? Number(photo.height) : 0,
        createdAt: typeof photo.createdAt === "string" ? photo.createdAt : nowIso(),
        updatedAt: typeof photo.updatedAt === "string" ? photo.updatedAt : nowIso(),
        error: typeof photo.error === "string" ? photo.error : "",
        ...(photo._copyToCurrentList ? { _copyToCurrentList: true } : {}),
        ...(photo.copyToCurrentList ? { copyToCurrentList: true } : {}),
        ...(photo.publicCopySourceId ? { publicCopySourceId: String(photo.publicCopySourceId) } : {}),
        ...(photo.sharedSourceId ? { sharedSourceId: String(photo.sharedSourceId) } : {})
      };
      if (Number.isFinite(Number(photo.uploadProgress))) {
        Object.defineProperty(normalized, "uploadProgress", {
          value: Math.max(0, Math.min(100, Number(photo.uploadProgress))),
          writable: true,
          configurable: true,
          enumerable: false
        });
      }
      copyPhotoUploadBatchMeta(photo, normalized);
      return normalized;
    });
  return item.photos;
}

function defineTransientPhotoField(photo, name, value) {
  Object.defineProperty(photo, name, {
    value,
    writable: true,
    configurable: true,
    enumerable: false
  });
}

function copyPhotoUploadBatchMeta(source, target) {
  const total = Math.max(0, Math.trunc(Number(source?.uploadBatchTotal) || 0));
  const index = Math.max(0, Math.trunc(Number(source?.uploadBatchIndex) || 0));
  if (!total || !index) return target;
  defineTransientPhotoField(target, "uploadBatchId", String(source?.uploadBatchId || ""));
  defineTransientPhotoField(target, "uploadBatchIndex", Math.min(index, total));
  defineTransientPhotoField(target, "uploadBatchTotal", total);
  return target;
}

export function markPhotoUploadBatch(photos, {
  batchId = `photo-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`
} = {}) {
  const list = (Array.isArray(photos) ? photos : [photos]).filter(Boolean);
  list.forEach((photo, index) => {
    defineTransientPhotoField(photo, "uploadBatchId", batchId);
    defineTransientPhotoField(photo, "uploadBatchIndex", index + 1);
    defineTransientPhotoField(photo, "uploadBatchTotal", list.length);
  });
  return list;
}

export function photoUploadBatchSummary(photos) {
  const groups = new Map();
  (Array.isArray(photos) ? photos : []).forEach((photo) => {
    const id = String(photo?.uploadBatchId || "");
    const index = Math.max(0, Math.trunc(Number(photo?.uploadBatchIndex) || 0));
    if (!id || !index) return;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(photo);
  });
  const batches = [...groups.entries()].map(([id, batchPhotos]) => ({ id, photos: batchPhotos }));
  const selected = batches.find((batch) => batch.photos.some((photo) => photo?.status === "uploading")) ||
    batches.find((batch) => batch.photos.some((photo) => photo?.status === "pending" && !photoHasRemoteAsset(photo))) ||
    batches.at(-1);
  if (!selected?.photos.length) return null;
  const total = selected.photos.length;
  const uploaded = selected.photos.filter(photoHasRemoteAsset).length;
  const failed = selected.photos.filter((photo) => ["error", "missing-local-file"].includes(photo?.status)).length;
  const activePhoto = selected.photos.find((photo) => photo?.status === "uploading") ||
    selected.photos.find((photo) => photo?.status === "pending" && !photoHasRemoteAsset(photo)) ||
    null;
  const active = Boolean(activePhoto);
  return {
    id: selected.id,
    index: activePhoto ? selected.photos.indexOf(activePhoto) + 1 : total,
    total,
    uploaded,
    failed,
    active,
    complete: uploaded === total
  };
}

export function photoUploadBatchInfo(photos) {
  const summary = photoUploadBatchSummary(photos);
  if (!summary?.active || summary.total < 2 || !summary.index) return null;
  return {
    id: summary.id,
    index: Math.min(summary.index, summary.total),
    total: summary.total
  };
}

export function syncPhotoRecordFromUpload(record, sourcePhoto) {
  if (!record || !sourcePhoto) return null;
  const photos = Array.isArray(record.photos) ? record.photos : [];
  const sourceId = String(sourcePhoto.id || "");
  const sourceLocalId = String(sourcePhoto.localId || "");
  const target = photos.find((photo) =>
    (sourceLocalId && String(photo?.localId || "") === sourceLocalId) ||
    (sourceId && String(photo?.id || "") === sourceId)
  );
  if (!target || target === sourcePhoto) return target || null;
  Object.assign(target, sourcePhoto);
  if (Object.prototype.hasOwnProperty.call(sourcePhoto, "uploadProgress")) {
    defineTransientPhotoField(target, "uploadProgress", sourcePhoto.uploadProgress);
  } else if (Object.prototype.hasOwnProperty.call(target, "uploadProgress")) {
    delete target.uploadProgress;
  }
  if (Object.prototype.hasOwnProperty.call(sourcePhoto, "uploadRetryPending")) {
    defineTransientPhotoField(target, "uploadRetryPending", sourcePhoto.uploadRetryPending);
  } else if (Object.prototype.hasOwnProperty.call(target, "uploadRetryPending")) {
    delete target.uploadRetryPending;
  }
  copyPhotoUploadBatchMeta(sourcePhoto, target);
  return target;
}

function photoHasRemoteAsset(photo) {
  return Boolean(
    photo &&
    !["error", "missing-local-file"].includes(photo.status) &&
    (photo.url || photo.thumbUrl)
  );
}

export function primaryItemPhoto(item) {
  const photos = normalizeItemPhotos(item);
  return normalizePhotoUrlFields(photos[0]) || null;
}

export function itemPhotoMetaSignature(photo) {
  if (!photo) return "";
  return [photo.id, photo.localId, photo.status, photo.url, photo.thumbUrl, photo.updatedAt].join("|");
}

export function itemPhotoSignature(item) {
  return itemPhotosSignature(item);
}

export function itemPhotosSignature(item) {
  const snapshot = {
    photos: (Array.isArray(item?.photos) ? item.photos : []).map((photo) => ({ ...photo }))
  };
  return normalizeItemPhotos(snapshot).map((photo) => [
    photo.id,
    photo.localId,
    photo.status,
    photo.url,
    photo.thumbUrl,
    photo.updatedAt,
    photo.error
  ].join("|")).join("||");
}

export function createPhotoDraftFromRecord(record) {
  return {
    photos: normalizeItemPhotos(record).map((photo) => ({ ...photo })),
    deletedPhotos: []
  };
}

export function photoDraftEntityId(draft) {
  return String(draft?.uploadEntityId || "");
}

export function ensurePhotoDraftEntityId(draft, entityType = "item", {
  now = Date.now,
  random = Math.random
} = {}) {
  if (!draft || typeof draft !== "object") return "";
  const existingId = photoDraftEntityId(draft);
  if (existingId) return existingId;
  const prefix = entityType === "container" ? "container" : "item";
  const suffix = Math.max(0, Math.trunc(Number(random()) * 0x100000000)).toString(16);
  draft.uploadEntityId = `${prefix}-${Number(now()) || Date.now()}-${suffix}`;
  return draft.uploadEntityId;
}

export function photoDraftUploadEntity(draft, entity = null, entityType = "item", options = {}) {
  if (entity?.id) return entity;
  const id = ensurePhotoDraftEntityId(draft, entityType, options);
  return id ? { id, photos: draft.photos } : null;
}

export function addPhotosToDraft(draft, photos, limit = Infinity) {
  const target = draft || { photos: [], deletedPhotos: [] };
  const incoming = (Array.isArray(photos) ? photos : [photos]).filter(Boolean);
  const freeSlots = Number.isFinite(limit) ? Math.max(0, limit - target.photos.length) : incoming.length;
  const accepted = incoming.slice(0, freeSlots);
  target.photos = [...target.photos, ...accepted];
  return {
    draft: target,
    accepted,
    rejected: incoming.slice(accepted.length)
  };
}

export function draftPhotosToCleanup(draft, sourceRecord = null) {
  const draftPhotos = Array.isArray(draft?.photos) ? draft.photos : [];
  if (!draftPhotos.length) return [];
  const sourceIds = photoIdentitySet(normalizeItemPhotos(sourceRecord || { photos: [] }));
  return draftPhotos.filter((photo) => !photoIdentityMatches(sourceIds, photo));
}

export function removePhotoFromDraft(draft, index = 0, sourceRecord = null) {
  const target = draft || { photos: [], deletedPhotos: [] };
  const safeIndex = Math.max(0, Math.min(Number(index) || 0, target.photos.length - 1));
  const [removed] = target.photos.splice(safeIndex, 1);
  const sourceIds = photoIdentitySet(normalizeItemPhotos(sourceRecord || { photos: [] }));
  const removedFromSource = Boolean(removed && photoIdentityMatches(sourceIds, removed));
  if (removedFromSource) target.deletedPhotos.push(removed);
  return {
    draft: target,
    removed,
    discardedPhoto: removed && !removedFromSource ? removed : null,
    nextIndex: Math.max(0, Math.min(safeIndex, target.photos.length - 1))
  };
}

export function setPrimaryPhotoInDraft(draft, index = 0) {
  const target = draft || { photos: [], deletedPhotos: [] };
  const safeIndex = Math.max(0, Math.min(Number(index) || 0, target.photos.length - 1));
  if (!target.photos.length || safeIndex === 0) {
    return {
      draft: target,
      changed: false,
      nextIndex: 0
    };
  }
  const [photo] = target.photos.splice(safeIndex, 1);
  target.photos.unshift(photo);
  return {
    draft: target,
    changed: true,
    nextIndex: 0
  };
}

export function photoDraftChanged(draft, record) {
  if (!draft) return false;
  return itemPhotosSignature({ photos: draft.photos }) !== itemPhotosSignature(record);
}

function photoIdentitySet(photos = []) {
  const ids = new Set();
  (Array.isArray(photos) ? photos : []).forEach((photo) => {
    if (photo?.id) ids.add(String(photo.id));
    if (photo?.localId) ids.add(String(photo.localId));
  });
  return ids;
}

function photoIdentityMatches(ids, photo) {
  return Boolean(
    (photo?.id && ids.has(String(photo.id))) ||
    (photo?.localId && ids.has(String(photo.localId)))
  );
}
