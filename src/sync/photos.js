import { detachPhotoCacheRecordBlobs } from "./photo-cache-write.js";
import { createPhotoFromFile, resolveUploadedPhotoByContentHash as resolvePhotoHash } from "../vendor/vniipo-photo-upload-engine.js";
export { materializeSelectedPhotoFile, resizeImageFile, imageFileDimensions, paintImageOnJpegCanvas, loadImageBitmap, isGifImageFile, isSvgImageFile, selectedPhotoMimeType, clonePhotoUploadBlob, sha256BlobHex, applyPendingPhotoUploadRetry } from "../vendor/vniipo-photo-upload-engine.js";
import {
  API_BASE,
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

let activePhotoCacheScopeKey = "guest";

function normalizedPhotoCacheScopeKey(scopeKey) {
  return String(scopeKey || "guest").trim() || "guest";
}

function scopedPhotoCacheRecordId(id, scopeKey = activePhotoCacheScopeKey) {
  return `${normalizedPhotoCacheScopeKey(scopeKey)}\u0000${String(id || "").trim()}`;
}

function photoCacheRecordForStorage(record, scopeKey = activePhotoCacheScopeKey) {
  const logicalId = String(record?.id || record?.photoId || "").trim();
  if (!logicalId) throw new Error("Photo cache record id is required");
  return {
    ...record,
    id: scopedPhotoCacheRecordId(logicalId, scopeKey),
    photoId: logicalId,
    cacheScope: normalizedPhotoCacheScopeKey(scopeKey)
  };
}

function photoCacheRecordForRuntime(record, fallbackId = "") {
  if (!record) return null;
  const logicalId = String(record.photoId || fallbackId || record.id || "").trim();
  return { ...record, id: logicalId, photoId: logicalId };
}

export function setPhotoCacheScope(scopeKey) {
  activePhotoCacheScopeKey = normalizedPhotoCacheScopeKey(scopeKey);
  return activePhotoCacheScopeKey;
}

export function getPhotoCacheScope() {
  return activePhotoCacheScopeKey;
}

export async function photoDbStore(mode, callback, { openDb = openPhotoDb } = {}) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let transaction;
    let request;
    const fail = error => { db.close(); reject(error || new Error("Ошибка хранилища фото")); };
    try {
      transaction = db.transaction(PHOTO_STORE, mode);
      transaction.oncomplete = () => { db.close(); resolve(request.result); };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error);
      request = callback(transaction.objectStore(PHOTO_STORE));
      request.onerror = () => fail(request.error);
      // request.onsuccess can precede a failed commit (quota/storage errors).
      // A selected iCloud file is safe only once the transaction completes.
    } catch (error) {
      transaction?.abort?.();
      fail(error);
    }
  });
}

export async function putCachedPhoto(record, scopeKey = activePhotoCacheScopeKey) {
  const detached = await detachPhotoCacheRecordBlobs(record);
  return photoDbStore("readwrite", (store) => store.put(photoCacheRecordForStorage(detached, scopeKey)));
}

export async function getCachedPhoto(id, scopeKey = activePhotoCacheScopeKey) {
  if (!id) return Promise.resolve(null);
  const logicalId = String(id).trim();
  const scoped = await photoDbStore("readonly", (store) =>
    store.get(scopedPhotoCacheRecordId(logicalId, scopeKey)));
  if (scoped) return photoCacheRecordForRuntime(scoped, logicalId);
  const legacy = await photoDbStore("readonly", (store) => store.get(logicalId));
  if (!legacy || legacy.cacheScope) return null;
  const runtimeRecord = photoCacheRecordForRuntime(legacy, logicalId);
  putCachedPhoto(runtimeRecord, scopeKey).catch(() => null);
  return runtimeRecord;
}

export async function deleteCachedPhoto(id, scopeKey = activePhotoCacheScopeKey) {
  if (!id) return Promise.resolve();
  const logicalId = String(id).trim();
  await photoDbStore("readwrite", (store) =>
    store.delete(scopedPhotoCacheRecordId(logicalId, scopeKey))).catch(() => null);
}

export async function listCachedPhotos(scopeKey = activePhotoCacheScopeKey) {
  const normalizedScope = normalizedPhotoCacheScopeKey(scopeKey);
  const records = await photoDbStore("readonly", (store) => store.getAll()).catch(() => []);
  return (Array.isArray(records) ? records : [])
    .filter((record) => record?.cacheScope === normalizedScope)
    .map((record) => photoCacheRecordForRuntime(record));
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
      fullBlobVerified: true,
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

export async function resolveUploadedPhotoByContentHash({ apiFetch, blob, listId = "", ...options } = {}) {
  if (!blob || !listId || typeof apiFetch !== "function") return null;
  return resolvePhotoHash({
    ...options,
    blob,
    resolveHash: async (hash, { timeoutMs }) => {
      const data = await apiFetch(`/bike-packing/lists/${encodeURIComponent(listId)}/photos/resolve`, {
        method: "POST", silentErrors: true, timeoutMs,
        body: JSON.stringify({ hashes: [hash] })
      });
      return data?.photosByHash?.[hash];
    }
  });
}

export function createItemPhotoFromFile(file, options = {}) {
  const scopeKey = getPhotoCacheScope();
  return createPhotoFromFile(file, {
    ...options,
    cachePhoto: options.cachePhoto ?? (record => putCachedPhoto(record, scopeKey))
  });
}
