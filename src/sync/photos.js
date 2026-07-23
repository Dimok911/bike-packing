import {
  API_BASE,
  ITEM_PHOTO_MAX_SIZE,
  ITEM_PHOTO_QUALITY,
  ITEM_PHOTO_TARGET_BYTES,
  ITEM_PHOTO_THUMB_TARGET_BYTES,
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
  cachedFallbackSourceIds = [],
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
      cachedFallbackSourceIds,
      copyRemotePhotosToCurrentList,
      dropMissingLocalPhotos,
      getCachedPhotoForCopy,
      putCachedPhotoForCopy
    });
    if (copy) copies.push(copy);
  }
  return copies;
}

export function clonePhotoBlobForCache(blob) {
  if (!blob || typeof blob.slice !== "function") return blob;
  return blob.slice(0, Number(blob.size) || undefined, blob.type || "image/jpeg");
}

async function copyPhotoForLocalDuplicate(photo, {
  changedAt = nowIso(),
  cachedFallbackSourceIds = [],
  copyRemotePhotosToCurrentList = false,
  dropMissingLocalPhotos = false,
  getCachedPhotoForCopy = getCachedPhoto,
  putCachedPhotoForCopy = putCachedPhoto
} = {}) {
  if (!photo || typeof photo !== "object") return null;
  normalizePhotoUrlFields(photo);
  const nextId = `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const sourceLocalId = String(photo.localId || photo.id || "").trim();
  const allowCachedRemoteFallback = new Set((Array.isArray(cachedFallbackSourceIds) ? cachedFallbackSourceIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean)).has(sourceLocalId);
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
  let cached = null;
  if (sourceLocalId && (!remote || allowCachedRemoteFallback)) {
    try {
      cached = await getCachedPhotoForCopy(sourceLocalId);
    } catch {
      cached = null;
    }
  }
  if (remote && copyRemotePhotosToCurrentList) {
    let cachedCopyStored = false;
    if (cached?.blob) {
      try {
        await putCachedPhotoForCopy({
          ...cached,
          id: nextId,
          blob: clonePhotoBlobForCache(cached.blob),
          thumbBlob: clonePhotoBlobForCache(cached.thumbBlob),
          createdAt: changedAt,
          updatedAt: changedAt
        });
        cachedCopyStored = true;
      } catch {
        // The server copy remains the primary path; its fallback can still download the legacy URL.
      }
    }
    copy.localId = cachedCopyStored ? nextId : "";
    copy.status = "pending";
    copy._copyToCurrentList = true;
    delete copy.copyToCurrentList;
    return copy;
  }
  if (cached?.blob) {
    try {
      await putCachedPhotoForCopy({
        ...cached,
        id: nextId,
        blob: clonePhotoBlobForCache(cached.blob),
        thumbBlob: clonePhotoBlobForCache(cached.thumbBlob),
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
  if (sourceLocalId) {
    if (dropMissingLocalPhotos) return null;
    copy.status = "missing-local-file";
    copy.error = photo.error || "local-photo-copy-missing";
  }
  return copy;
}

export async function inspectRecordRemotePhotoSources(record, {
  fetchImpl = globalThis.fetch,
  getCachedPhotoForInspection = getCachedPhoto
} = {}) {
  const photos = Array.isArray(record?.photos)
    ? record.photos.filter((photo) => photo && typeof photo === "object")
    : [];
  const missing = [];
  if (typeof fetchImpl !== "function") return { missing };
  for (const photo of photos) {
    if (!hasRemotePhotoUrl(photo)) continue;
    const urls = [...new Set([photo.url, photo.thumbUrl].filter(Boolean))];
    let responses = [];
    try {
      responses = await Promise.all(urls.map((url) => fetchImpl(url, {
        method: "HEAD",
        credentials: "include",
        cache: "no-store"
      })));
    } catch {
      continue;
    }
    if (!responses.some((response) => Number(response?.status) === 404)) continue;
    const sourceLocalId = String(photo.localId || photo.id || "").trim();
    let cached = null;
    try {
      cached = sourceLocalId ? await getCachedPhotoForInspection(sourceLocalId) : null;
    } catch {
      cached = null;
    }
    missing.push({
      photoId: String(photo.id || ""),
      sourceLocalId,
      cached: Boolean(cached?.blob),
      statuses: responses.map((response) => Number(response?.status) || 0),
      urls
    });
  }
  return { missing };
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

export function applySyncedPhotoUploadResult(targetPhoto, serverPhoto, {
  fallbackPhotoId = "",
  listId = "",
  localId = "",
  nowIsoValue = nowIso(),
  uploadPath = ""
} = {}) {
  if (!targetPhoto || typeof targetPhoto !== "object") return targetPhoto;
  const normalizedServerPhoto = normalizeUploadedPhotoAssetUrls(
    { ...(serverPhoto || {}) },
    listId,
    uploadPath,
    fallbackPhotoId || targetPhoto.id || ""
  );
  Object.assign(targetPhoto, {
    ...targetPhoto,
    ...normalizedServerPhoto,
    id: normalizedServerPhoto.id || targetPhoto.id,
    localId,
    listId: String(normalizedServerPhoto.listId || normalizedServerPhoto.list_id || listId || ""),
    status: "synced",
    error: "",
    updatedAt: normalizedServerPhoto.updatedAt || nowIsoValue
  });
  delete targetPhoto._copyToCurrentList;
  delete targetPhoto.copyToCurrentList;
  return targetPhoto;
}

export function applyPendingPhotoUploadRetry(targetPhoto, {
  nowIsoValue = nowIso()
} = {}) {
  if (!targetPhoto || typeof targetPhoto !== "object") return targetPhoto;
  targetPhoto.status = "pending";
  targetPhoto.error = "";
  targetPhoto.updatedAt = nowIsoValue;
  Object.defineProperty(targetPhoto, "uploadRetryPending", {
    value: true,
    writable: true,
    configurable: true,
    enumerable: false
  });
  return targetPhoto;
}

export function shouldRetryLocalPhotoUploadAfterFailure({
  blob = null,
  error = null,
  isNetworkErrorValue = false,
  isTimeoutErrorValue = false,
  retryAvailable = true,
  uploadPath = ""
} = {}) {
  return Boolean(
    retryAvailable &&
    blob &&
    !String(uploadPath || "").includes("/admin/") &&
    (isNetworkErrorValue || isTimeoutErrorValue || error?.isUploadStalled)
  );
}

export function clonePhotoUploadBlob(blob) {
  if (!blob || typeof blob !== "object") return blob;
  if (typeof blob.slice !== "function") return blob;
  return blob.slice(0, blob.size || undefined, blob.type || "");
}

export async function sha256BlobHex(blob, {
  cryptoImpl = globalThis.crypto
} = {}) {
  if (!blob || typeof blob.arrayBuffer !== "function" || !cryptoImpl?.subtle?.digest) return "";
  const digest = await cryptoImpl.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function resolveUploadedPhotoByContentHash({
  apiFetch,
  blob,
  cryptoImpl = globalThis.crypto,
  listId = "",
  retryDelayMs = 700,
  timeoutMs = 30000
} = {}) {
  if (!blob || !listId || typeof apiFetch !== "function") return null;
  const hash = await sha256BlobHex(blob, { cryptoImpl });
  if (!hash) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0 && retryDelayMs > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, retryDelayMs));
    }
    try {
      const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/photos/resolve`, {
        method: "POST",
        silentErrors: true,
        timeoutMs,
        body: JSON.stringify({ hashes: [hash] })
      });
      const resolved = data?.photosByHash?.[hash];
      if (resolved?.id) return resolved;
    } catch {
      return null;
    }
  }
  return null;
}

export async function createItemPhotoFromFile(file) {
  if (!file || (!file.type?.startsWith("image/") && !isSvgImageFile(file))) {
    throw new Error("Выберите файл изображения.");
  }
  const photoId = `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const source = await materializeSelectedPhotoFile(file);
  const full = await resizeImageFile(source, ITEM_PHOTO_MAX_SIZE, ITEM_PHOTO_QUALITY, {
    targetBytes: ITEM_PHOTO_TARGET_BYTES
  });
  const thumb = await resizeImageFile(source, ITEM_PHOTO_THUMB_SIZE, ITEM_PHOTO_QUALITY, {
    targetBytes: ITEM_PHOTO_THUMB_TARGET_BYTES
  });
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

export async function materializeSelectedPhotoFile(file, {
  timeoutMs = 60000
} = {}) {
  if (!file || typeof file.arrayBuffer !== "function") return file;
  const readPromise = file.arrayBuffer();
  const buffer = timeoutMs > 0
    ? await promiseWithTimeout(readPromise, timeoutMs, "Фото ещё загружается из iCloud. Дождитесь окончания загрузки и выберите его ещё раз.")
    : await readPromise;
  const byteLength = Number(buffer?.byteLength || buffer?.length || 0);
  if (!byteLength) {
    throw new Error("Фото ещё загружается из iCloud. Дождитесь окончания загрузки и выберите его ещё раз.");
  }
  const type = selectedPhotoMimeType(file);
  const name = file.name || "item-photo.jpg";
  if (typeof File === "function") {
    return new File([buffer], name, {
      type,
      lastModified: Number(file.lastModified || Date.now())
    });
  }
  const blob = new Blob([buffer], { type });
  try {
    Object.defineProperty(blob, "name", { value: name, configurable: true });
    Object.defineProperty(blob, "lastModified", { value: Number(file.lastModified || Date.now()), configurable: true });
  } catch {
    // Blob metadata is optional; the materialized bytes are the required part.
  }
  return blob;
}

function promiseWithTimeout(promise, timeoutMs, message) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export async function resizeImageFile(file, maxSize, quality, {
  targetBytes = 0,
  minQuality = 0.58,
  minSize = 960,
  qualityStep = 0.08,
  sizeStep = 0.85
} = {}) {
  const bitmap = await loadImageBitmap(file);
  try {
    let nextMaxSize = maxSize;
    let best = null;
    while (true) {
      const scale = Math.min(1, nextMaxSize / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      paintImageOnJpegCanvas(context, bitmap, width, height);
      for (let nextQuality = quality; nextQuality >= minQuality; nextQuality -= qualityStep) {
        const blob = await canvasToJpegBlob(canvas, nextQuality);
        best = { blob, width, height };
        if (!targetBytes || blob.size <= targetBytes) return best;
      }
      if (nextMaxSize <= minSize) return best;
      nextMaxSize = Math.max(minSize, Math.round(nextMaxSize * sizeStep));
    }
  } finally {
    if (typeof bitmap.close === "function") bitmap.close();
  }
}

export function paintImageOnJpegCanvas(context, bitmap, width, height) {
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
}

async function canvasToJpegBlob(canvas, quality) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Не удалось подготовить фото.");
  return blob;
}

export function loadImageBitmap(file) {
  // SVG decoding through createImageBitmap is inconsistent in Safari/iOS.
  // Loading it as an image first keeps the input compatible, while the
  // existing canvas pipeline still turns it into a non-executable JPEG.
  if (isSvgImageFile(file)) return loadImageElement(file);
  if ("createImageBitmap" in window) return createImageBitmap(file, { imageOrientation: "from-image" });
  return loadImageElement(file);
}

export function isSvgImageFile(file) {
  const type = String(file?.type || "").trim().toLowerCase();
  const name = String(file?.name || "").trim().toLowerCase();
  return type === "image/svg+xml" || name.endsWith(".svg");
}

export function selectedPhotoMimeType(file) {
  const type = String(file?.type || "").trim();
  if (type) return type;
  return isSvgImageFile(file) ? "image/svg+xml" : "image/jpeg";
}

function loadImageElement(file) {
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
