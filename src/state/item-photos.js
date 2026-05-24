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
      return {
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
    });
  return item.photos;
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
  const photo = primaryItemPhoto(item);
  if (!photo) return "";
  return [
    photo.id,
    photo.localId,
    photo.status,
    photo.url,
    photo.thumbUrl,
    photo.updatedAt,
    photo.error
  ].join("|");
}
