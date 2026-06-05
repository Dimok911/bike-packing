import {
  API_BASE,
  ITEM_PHOTO_MAX_SIZE,
  ITEM_PHOTO_QUALITY,
  ITEM_PHOTO_THUMB_SIZE,
  PHOTO_DB_NAME,
  PHOTO_DB_VERSION,
  PHOTO_STORE
} from "../config/constants.js";
import { normalizeItemPhotos, normalizePhotoStatus, normalizePhotoUrlFields } from "../state/item-photos.js";
import { nowIso } from "../utils/time.js";

export function hasRemotePhotoUrl(photo) {
  normalizePhotoUrlFields(photo);
  return Boolean(syncSafePhotoUrl(photo?.url) || syncSafePhotoUrl(photo?.thumbUrl));
}

export function photoShouldBeCopiedToCurrentList(photo) {
  return Boolean(photo?._copyToCurrentList || photo?.copyToCurrentList || photo?.publicCopySourceId || photo?.sharedSourceId);
}

export function isMissingRemotePhotoCopyError(error) {
  const text = `${error?.data?.message || ""} ${error?.data?.error || ""} ${error?.message || ""}`.toLowerCase();
  return error?.status === 404 && text.includes("photo") && text.includes("not found");
}

export function keepRemoteOnlyPhotoReference(photo) {
  if (!hasRemotePhotoUrl(photo) || photo.localId) return false;
  photo.status = "synced";
  photo.error = "";
  return true;
}

export function isPhotoUsableFromServer(photo, listId = "") {
  if (!hasRemotePhotoUrl(photo)) return false;
  if (listId && !isPhotoStoredForList(photo, listId)) return false;
  photo.status = "synced";
  photo.error = "";
  return true;
}

export function remotePhotoSourceFromRecord(photo, {
  baseUrl = globalThis.location?.href
} = {}) {
  const fromUrl = remotePhotoSourceFromUrl(photo?.url, { baseUrl }) || remotePhotoSourceFromUrl(photo?.thumbUrl, { baseUrl });
  return {
    sourceListId: String(fromUrl?.sourceListId || photo?.listId || "").trim(),
    sourcePhotoId: String(fromUrl?.sourcePhotoId || photo?.id || photo?.photoId || "").trim()
  };
}

export function photoRecordIdMatchesRemoteSource(photo, {
  baseUrl = globalThis.location?.href
} = {}) {
  const recordId = String(photo?.id || photo?.photoId || "").trim();
  const { sourcePhotoId } = remotePhotoSourceFromRecord(photo, { baseUrl });
  return !recordId || !sourcePhotoId || recordId === sourcePhotoId;
}

export function removeRecordPhotoReference(record, sourcePhoto) {
  if (!record || !Array.isArray(record.photos) || !sourcePhoto) return false;
  const sourceId = String(sourcePhoto.id || "");
  const sourceLocalId = String(sourcePhoto.localId || "");
  const sourceUrl = String(sourcePhoto.url || "");
  const sourceThumbUrl = String(sourcePhoto.thumbUrl || "");
  const nextPhotos = record.photos.filter((photo) => {
    if (!photo) return false;
    if (photo === sourcePhoto) return false;
    if (sourceId && String(photo.id || "") === sourceId) return false;
    if (sourceLocalId && String(photo.localId || "") === sourceLocalId) return false;
    if (sourceUrl && String(photo.url || "") === sourceUrl) return false;
    if (sourceThumbUrl && String(photo.thumbUrl || "") === sourceThumbUrl) return false;
    return true;
  });
  if (nextPhotos.length === record.photos.length) return false;
  record.photos = nextPhotos;
  return true;
}

export function remotePhotoSourceFromUrl(src, {
  baseUrl = globalThis.location?.href
} = {}) {
  if (!src) return null;
  try {
    const url = new URL(src, baseUrl);
    const parts = url.pathname.split("/").map((part) => decodeURIComponent(part));
    const listsIndex = parts.indexOf("lists");
    const photosIndex = parts.indexOf("photos");
    if (listsIndex < 0 || photosIndex < 0 || photosIndex <= listsIndex + 1) return null;
    const sourceListId = parts[listsIndex + 1] || "";
    const sourcePhotoId = parts[photosIndex + 1] || "";
    return sourceListId && sourcePhotoId ? { sourceListId, sourcePhotoId } : null;
  } catch {
    return null;
  }
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

function createLocalPhotoId() {
  return `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fetchRemotePhotoBlobForCache(photo, variant = "file") {
  normalizePhotoUrlFields(photo);
  const src = normalizeRemotePhotoUrl(variant === "thumb"
    ? (photo.thumbUrl || photo.url || "")
    : (photo.url || photo.thumbUrl || ""));
  if (!src) return null;
  const response = await fetch(src, { credentials: "include", cache: "no-store" });
  if (!response.ok) return null;
  return response.blob();
}

export async function cacheRecordRemotePhotosForUploadFallback(record, { changedAt = nowIso() } = {}) {
  const photos = Array.isArray(record?.photos) ? normalizeItemPhotos(record) : [];
  let changed = 0;
  for (const photo of photos) {
    if (!hasRemotePhotoUrl(photo)) continue;
    const cachedLocalId = String(photo.localId || "").trim();
    const cached = cachedLocalId ? await getCachedPhoto(cachedLocalId) : null;
    if (cached?.blob) continue;
    const blob = await fetchRemotePhotoBlobForCache(photo, "file").catch(() => null);
    if (!blob) continue;
    const localId = createLocalPhotoId();
    const thumbBlob = await fetchRemotePhotoBlobForCache(photo, "thumb").catch(() => null);
    await putCachedPhoto({
      id: localId,
      blob,
      thumbBlob,
      fileName: photo.fileName || `${localId}.jpg`,
      type: blob.type || photo.type || "image/jpeg",
      size: blob.size || photo.size || 0,
      width: Number.isFinite(Number(photo.width)) ? Number(photo.width) : 0,
      height: Number.isFinite(Number(photo.height)) ? Number(photo.height) : 0,
      createdAt: changedAt,
      updatedAt: changedAt
    });
    photo.id = localId;
    photo.localId = localId;
    photo.status = "synced";
    photo.error = "";
    photo.updatedAt = changedAt;
    photo._copyToCurrentList = true;
    delete photo.copyToCurrentList;
    changed += 1;
  }
  return changed;
}

export async function copyRecordPhotosForLocalDuplicate(record, {
  changedAt = nowIso(),
  copyRemotePhotosToCurrentList = false,
  dropMissingLocalPhotos = false,
  getCachedPhotoForCopy = getCachedPhoto,
  putCachedPhotoForCopy = putCachedPhoto
} = {}) {
  const photos = Array.isArray(record?.photos) ? record.photos : [];
  const copies = [];
  for (const photo of photos) {
    const copy = await copyPhotoForLocalDuplicate(photo, {
      changedAt,
      copyRemotePhotosToCurrentList,
      dropMissingLocalPhotos,
      getCachedPhotoForCopy,
      putCachedPhotoForCopy
    });
    if (copy) copies.push(copy);
  }
  return copies;
}

async function copyPhotoForLocalDuplicate(photo, {
  changedAt = nowIso(),
  copyRemotePhotosToCurrentList = false,
  dropMissingLocalPhotos = false,
  getCachedPhotoForCopy = getCachedPhoto,
  putCachedPhotoForCopy = putCachedPhoto
} = {}) {
  if (!photo || typeof photo !== "object") return null;
  normalizePhotoUrlFields(photo);
  const nextId = `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const sourceLocalId = String(photo.localId || photo.id || "").trim();
  const remote = hasRemotePhotoUrl(photo);
  const copy = {
    ...photo,
    id: nextId,
    localId: "",
    status: remote ? "pending" : normalizePhotoStatus(photo.status),
    createdAt: changedAt,
    updatedAt: changedAt,
    error: ""
  };
  if (remote && !copyRemotePhotosToCurrentList) {
    copy.localId = "";
    copy.status = "synced";
    delete copy._copyToCurrentList;
    delete copy.copyToCurrentList;
    return copy;
  }
  const cached = sourceLocalId ? await getCachedPhotoForCopy(sourceLocalId) : null;
  if (cached?.blob) {
    try {
      await putCachedPhotoForCopy({
        ...cached,
        id: nextId,
        createdAt: changedAt,
        updatedAt: changedAt
      });
      copy.localId = nextId;
      copy.url = "";
      copy.thumbUrl = "";
      copy.listId = "";
      copy.status = "pending";
      delete copy._copyToCurrentList;
      delete copy.copyToCurrentList;
      return copy;
    } catch {
      // Fall through to remote copy when the original has already been synced.
    }
  }
  if (remote) {
    copy.localId = "";
    copy.status = copyRemotePhotosToCurrentList ? "pending" : "synced";
    if (copyRemotePhotosToCurrentList) copy._copyToCurrentList = true;
    else delete copy._copyToCurrentList;
    delete copy.copyToCurrentList;
    return copy;
  }
  if (sourceLocalId) {
    if (dropMissingLocalPhotos) return null;
    copy.status = "missing-local-file";
    copy.error = photo.error || "local-photo-copy-missing";
  }
  return copy;
}

export function isPhotoStoredForList(photo, listId) {
  const normalizedListId = String(listId || "");
  if (!normalizedListId) return true;
  const encoded = encodeURIComponent(normalizedListId);
  const urls = [photo?.url, photo?.thumbUrl].filter((src) => typeof src === "string" && src.trim());
  const listScopedUrls = urls.filter((src) => src.includes("/lists/"));
  if (listScopedUrls.length) {
    return listScopedUrls.some((src) =>
      src.includes(`/lists/${normalizedListId}/`) || src.includes(`/lists/${encoded}/`)
    );
  }
  return Boolean(photo?.listId && String(photo.listId) === normalizedListId);
}

export function bikePackingPhotoAssetUrl(listId, photoId, variant) {
  if (!listId || !photoId) return "";
  return `${API_BASE}/bike-packing/lists/${encodeURIComponent(listId)}/photos/${encodeURIComponent(photoId)}/${variant}`;
}

export function photoCopyApiPath({ uploadPath = "", listId = "" } = {}) {
  const path = String(uploadPath || "").replace(/\/+$/, "");
  if (path.includes("/bike-packing/admin/")) return `${path}/copy`;
  return listId ? `/bike-packing/lists/${encodeURIComponent(listId)}/photos/copy` : "";
}

export function normalizeUploadedPhotoAssetUrls(photo, listId, uploadPath, fallbackPhotoId = "") {
  normalizePhotoUrlFields(photo);
  const photoId = photo?.id || photo?.photoId || fallbackPhotoId;
  if (!photo || !String(uploadPath || "").includes("/admin/") || !listId || !photoId) return photo;
  if (!photo.id) photo.id = String(photoId);
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
