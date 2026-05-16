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

export function hasRemotePhotoUrl(photo) {
  normalizePhotoUrlFields(photo);
  return Boolean(syncSafePhotoUrl(photo?.url) || syncSafePhotoUrl(photo?.thumbUrl));
}

export function syncSafePhotoUrl(src) {
  if (typeof src !== "string") return "";
  const value = src.trim();
  if (!value || /^(data|blob):/i.test(value)) return "";
  return value.length <= 2048 ? value : "";
}
