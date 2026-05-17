import {
  API_BASE,
  ITEM_PHOTO_MAX_SIZE,
  ITEM_PHOTO_QUALITY,
  ITEM_PHOTO_THUMB_SIZE,
  PHOTO_DB_NAME,
  PHOTO_DB_VERSION,
  PHOTO_STORE
} from "../config/constants.js";
import { normalizePhotoUrlFields } from "../state/item-photos.js";
import { nowIso } from "../utils/time.js";

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

export function photoRemoteSrc(photo) {
  normalizePhotoUrlFields(photo);
  const src = photo?.thumbUrl || photo?.url || "";
  return versionedPhotoUrl(normalizeRemotePhotoUrl(src), photo?.updatedAt || photo?.id || "");
}

export function normalizeRemotePhotoUrl(src) {
  const value = syncSafePhotoUrl(src);
  if (!value) return "";
  try {
    const apiUrl = new URL(API_BASE);
    const url = new URL(value, API_BASE);
    const apiMarker = "/letters-vniipo/api/";
    const apiIndex = url.pathname.indexOf(apiMarker);
    if (apiIndex >= 0) {
      const suffix = url.pathname.slice(apiIndex + apiMarker.length);
      return `${apiUrl.origin}${apiUrl.pathname.replace(/\/+$/, "")}/${suffix}${url.search}${url.hash}`;
    }
    const listMarker = "/bike-packing/lists/";
    const listIndex = url.pathname.indexOf(listMarker);
    if (listIndex >= 0) {
      return `${apiUrl.origin}${apiUrl.pathname.replace(/\/+$/, "")}${url.pathname.slice(listIndex)}${url.search}${url.hash}`;
    }
    return value;
  } catch {
    return value;
  }
}

export function versionedPhotoUrl(src, version) {
  if (!src || !version || /^(blob|data):/i.test(src)) return src || "";
  try {
    const url = new URL(src, window.location.href);
    url.searchParams.set("v", String(version));
    return url.href;
  } catch {
    const separator = src.includes("?") ? "&" : "?";
    return `${src}${separator}v=${encodeURIComponent(String(version))}`;
  }
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

export async function createItemPhotoFromFile(file) {
  if (!file || !file.type?.startsWith("image/")) {
    throw new Error("Выберите файл изображения.");
  }
  const photoId = `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const full = await resizeImageFile(file, ITEM_PHOTO_MAX_SIZE, ITEM_PHOTO_QUALITY);
  const thumb = await resizeImageFile(file, ITEM_PHOTO_THUMB_SIZE, ITEM_PHOTO_QUALITY);
  const createdAt = nowIso();
  await putCachedPhoto({
    id: photoId,
    blob: full.blob,
    thumbBlob: thumb.blob,
    fileName: file.name || "item-photo.jpg",
    type: full.blob.type || "image/jpeg",
    size: full.blob.size,
    width: full.width,
    height: full.height,
    createdAt,
    updatedAt: createdAt
  });
  return {
    id: photoId,
    localId: photoId,
    status: "pending",
    url: "",
    thumbUrl: "",
    fileName: file.name || "",
    type: full.blob.type || "image/jpeg",
    size: full.blob.size,
    width: full.width,
    height: full.height,
    createdAt,
    updatedAt: createdAt,
    error: ""
  };
}

export async function resizeImageFile(file, maxSize, quality) {
  const bitmap = await loadImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, width, height);
  if (typeof bitmap.close === "function") bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Не удалось подготовить фото.");
  return { blob, width, height };
}

export function loadImageBitmap(file) {
  if ("createImageBitmap" in window) return createImageBitmap(file, { imageOrientation: "from-image" });
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось открыть фото."));
    };
    image.src = url;
  });
}
