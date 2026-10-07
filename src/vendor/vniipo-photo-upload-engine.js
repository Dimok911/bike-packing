// VNIIPO photo upload engine 1.0.0; extracted from Bike Packing 27ad568.
export const version = "1.0.0";
export const contractVersion = 1;
const nowIso = () => new Date().toISOString();

// Extracted from Bike Packing 27ad568; see provenance/source.json and docs/extraction.md.
const ITEM_PHOTO_MAX_SIZE = 1600;
const ITEM_PHOTO_THUMB_SIZE = 520;
const ITEM_PHOTO_QUALITY = 0.82;
const ITEM_PHOTO_TARGET_BYTES = 900 * 1024;
const ITEM_PHOTO_THUMB_TARGET_BYTES = 180 * 1024;

export async function createPhotoFromFile(file, {
  cachePhoto,
  dimensionsForFile = imageFileDimensions,
  materializeFile = materializeSelectedPhotoFile,
  now = nowIso,
  resizeFile = resizeImageFile
} = {}) {
  if (typeof cachePhoto !== "function") throw new TypeError("cachePhoto adapter is required");
  if (!file || (!file.type?.startsWith("image/") && !isSvgImageFile(file))) {
    throw new Error("Выберите файл изображения.");
  }
  const photoId = `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const source = await materializeFile(file);
  let full;
  let thumbBlob = null;
  if (isGifImageFile(source)) {
    const dimensions = await dimensionsForFile(source);
    full = { blob: source, width: dimensions.width, height: dimensions.height };
  } else {
    full = await resizeFile(source, ITEM_PHOTO_MAX_SIZE, ITEM_PHOTO_QUALITY, {
      targetBytes: ITEM_PHOTO_TARGET_BYTES
    });
    const thumb = await resizeFile(source, ITEM_PHOTO_THUMB_SIZE, ITEM_PHOTO_QUALITY, {
      targetBytes: ITEM_PHOTO_THUMB_TARGET_BYTES
    });
    thumbBlob = thumb.blob;
  }
  const createdAt = now();
  const fileName = gifPhotoFileName(file.name || source.name || "", full.blob.type);
  await cachePhoto({
    id: photoId,
    blob: full.blob,
    thumbBlob,
    fullBlobVerified: true,
    fileName: fileName || "item-photo.jpg",
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
    fileName,
    type: full.blob.type || "image/jpeg",
    size: full.blob.size,
    width: full.width,
    height: full.height,
    createdAt,
    updatedAt: createdAt,
    error: ""
  };
}

export function isGifImageFile(file) {
  const type = String(file?.type || "").trim().toLowerCase();
  const name = String(file?.name || "").trim().toLowerCase();
  return type === "image/gif" || name.endsWith(".gif");
}

function gifPhotoFileName(name, type) {
  const value = String(name || "").trim();
  if (String(type || "").toLowerCase() !== "image/gif") return value;
  if (/\.gif$/i.test(value)) return value;
  return value ? `${value.replace(/\.[^.]+$/, "")}.gif` : "item-photo.gif";
}

export async function imageFileDimensions(file) {
  const bitmap = await loadImageBitmap(file);
  try {
    return {
      width: Math.max(1, Number(bitmap?.width || bitmap?.naturalWidth || 1)),
      height: Math.max(1, Number(bitmap?.height || bitmap?.naturalHeight || 1))
    };
  } finally {
    if (typeof bitmap?.close === "function") bitmap.close();
  }
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

// Extracted from Bike Packing 27ad568; see provenance/source.json and docs/extraction.md.
const DEFAULT_PHOTO_UPLOAD_CONCURRENCY = 2;

export async function uploadPhotoBatchQueue(photos, {
  concurrency = DEFAULT_PHOTO_UPLOAD_CONCURRENCY,
  fallbackErrorMessage = "Could not upload the photo.",
  shouldUploadPhoto = () => true,
  uploadPhoto = async () => false,
  onUnexpectedError = () => {}
} = {}) {
  const queue = (Array.isArray(photos) ? photos : [photos]).filter(Boolean);
  if (!queue.length) return { attempted: 0, uploaded: false, errors: [] };

  const workerCount = Math.max(1, Math.min(
    queue.length,
    Math.trunc(Number(concurrency)) || DEFAULT_PHOTO_UPLOAD_CONCURRENCY
  ));
  const errors = [];
  let cursor = 0;
  let attempted = 0;
  let uploaded = false;

  async function runWorker() {
    while (cursor < queue.length) {
      const index = cursor;
      cursor += 1;
      const photo = queue[index];
      if (!shouldUploadPhoto(photo)) continue;
      attempted += 1;
      try {
        uploaded = Boolean(await uploadPhoto(photo, index)) || uploaded;
      } catch (error) {
        errors.push({ photo, error, index });
        markPhotoUploadQueueError(photo, error, { fallbackErrorMessage });
        onUnexpectedError(photo, error, index);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return { attempted, uploaded, errors };
}

export function markPhotoUploadQueueError(photo, error, {
  fallbackErrorMessage = "Could not upload the photo.",
  nowIsoValue = new Date().toISOString()
} = {}) {
  if (!photo) return false;
  photo.status = "error";
  photo.error = error?.message || fallbackErrorMessage;
  photo.updatedAt = nowIsoValue;
  if (Object.prototype.hasOwnProperty.call(photo, "uploadProgress")) delete photo.uploadProgress;
  return true;
}

export async function uploadPhotoWithOneRetry(photo, {
  retryDelayMs = 700,
  shouldRetryPhoto = (candidate) => Boolean(candidate?.uploadRetryPending),
  uploadPhotoAttempt = async () => false,
  wait = (delay) => new Promise((resolve) => globalThis.setTimeout(resolve, delay))
} = {}) {
  const firstResult = await uploadPhotoAttempt(photo, {
    attempt: 1,
    retryTemporaryUploadFailure: true
  });
  if (!shouldRetryPhoto(photo)) return firstResult;
  if (retryDelayMs > 0) await wait(retryDelayMs);
  return uploadPhotoAttempt(photo, {
    attempt: 2,
    retryTemporaryUploadFailure: false
  });
}

// Extracted from Bike Packing 27ad568; see provenance/source.json and docs/extraction.md.
export async function acquirePhotoUploadSlot({
  isBusy = () => false,
  setBusy = () => {},
  shouldContinue = () => true,
  maxWaitMs = 120000,
  delayMs = 250,
  now = () => Date.now(),
  setTimeoutImpl = globalThis.setTimeout
} = {}) {
  const startedAt = now();
  while (isBusy()) {
    if (!shouldContinue() || now() - startedAt >= maxWaitMs) return false;
    await new Promise((resolve) => setTimeoutImpl(resolve, delayMs));
  }
  if (!shouldContinue()) return false;
  setBusy(true);
  return true;
}

// Extracted from Bike Packing 27ad568; see provenance/source.json and docs/extraction.md.
function defineTransientPhotoField(photo, name, value) {
  Object.defineProperty(photo, name, {
    value,
    writable: true,
    configurable: true,
    enumerable: false
  });
}

export function copyPhotoUploadBatchMeta(source, target) {
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


// Extracted from Bike Packing 27ad568; see provenance/source.json and docs/extraction.md.
export function findEntityPhotoForUpload(entity, sourcePhoto) {
  const photos = Array.isArray(entity?.photos) ? entity.photos : [];
  const sourceId = String(sourcePhoto?.id || "");
  const sourceLocalId = String(sourcePhoto?.localId || "");
  return photos.find((photo) =>
    (sourceId && String(photo?.id || "") === sourceId) ||
    (sourceLocalId && String(photo?.localId || "") === sourceLocalId)
  ) || null;
}

export function setPhotoUploadProgress(photo, progress) {
  if (!photo) return;
  Object.defineProperty(photo, "uploadProgress", {
    value: Math.max(0, Math.min(100, Number(progress) || 0)),
    writable: true,
    configurable: true,
    enumerable: false
  });
}

export function markPhotoUploadStarted(photo, { nowIsoValue = nowIso() } = {}) {
  if (!photo) return;
  if (Object.prototype.hasOwnProperty.call(photo, "uploadRetryPending")) delete photo.uploadRetryPending;
  photo.status = "uploading";
  photo.error = "";
  photo.updatedAt = nowIsoValue;
  setPhotoUploadProgress(photo, photo.uploadProgress || 0);
}

export function clearPhotoUploadProgress(photo) {
  if (!photo || !Object.prototype.hasOwnProperty.call(photo, "uploadProgress")) return;
  delete photo.uploadProgress;
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


// Extracted from Bike Packing 27ad568; see provenance/source.json and docs/extraction.md.
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
  resolveHash,
  blob,
  cryptoImpl = globalThis.crypto,
  retryDelayMs = 700,
  timeoutMs = 30000
} = {}) {
  if (!blob || typeof resolveHash !== "function") return null;
  const hash = await sha256BlobHex(blob, { cryptoImpl });
  if (!hash) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0 && retryDelayMs > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, retryDelayMs));
    }
    try {
      const resolved = await resolveHash(hash, { timeoutMs, attempt });
      if (resolved?.id) return resolved;
    } catch {
      return null;
    }
  }
  return null;
}

