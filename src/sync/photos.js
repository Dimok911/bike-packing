import {
  API_BASE,
  PHOTO_DB_NAME,
  PHOTO_DB_VERSION,
  PHOTO_STORE
} from "../config/constants.js";

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

export function openPhotoDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB недоступен"));
      return;
    }
    const request = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Не удалось открыть хранилище фото"));
  });
}

export async function photoDbStore(mode, callback) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PHOTO_STORE, mode);
    const store = transaction.objectStore(PHOTO_STORE);
    let request;
    try {
      request = callback(store);
    } catch (error) {
      reject(error);
      return;
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Не удалось прочитать фото"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("Ошибка хранилища фото"));
    };
  });
}

export function putCachedPhoto(record) {
  return photoDbStore("readwrite", (store) => store.put(record));
}

export function getCachedPhoto(id) {
  if (!id) return Promise.resolve(null);
  return photoDbStore("readonly", (store) => store.get(id)).catch(() => null);
}

export function deleteCachedPhoto(id) {
  if (!id) return Promise.resolve();
  return photoDbStore("readwrite", (store) => store.delete(id)).catch(() => null);
}

export function isPhotoStoredForList(photo, listId) {
  const normalizedListId = String(listId || "");
  if (!normalizedListId) return true;
  if (photo?.listId && String(photo.listId) === normalizedListId) return true;
  const encoded = encodeURIComponent(normalizedListId);
  return [photo?.url, photo?.thumbUrl].some((src) =>
    typeof src === "string" && (src.includes(`/lists/${normalizedListId}/`) || src.includes(`/lists/${encoded}/`))
  );
}

export function bikePackingPhotoAssetUrl(listId, photoId, variant) {
  if (!listId || !photoId) return "";
  return `${API_BASE}/bike-packing/lists/${encodeURIComponent(listId)}/photos/${encodeURIComponent(photoId)}/${variant}`;
}

export function normalizeUploadedPhotoAssetUrls(photo, listId, uploadPath) {
  normalizePhotoUrlFields(photo);
  const photoId = photo?.id || photo?.photoId;
  if (!photo || !String(uploadPath || "").includes("/admin/") || !listId || !photoId) return photo;
  photo.url = bikePackingPhotoAssetUrl(listId, photoId, "file");
  photo.thumbUrl = bikePackingPhotoAssetUrl(listId, photoId, "thumb");
  return photo;
}
