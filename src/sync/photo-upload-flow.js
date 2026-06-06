import {
  PHOTO_UPLOAD_STALL_TIMEOUT_MS,
  PHOTO_UPLOAD_TIMEOUT_MS
} from "../config/constants.js";
import { normalizePhotoUrlFields } from "../state/item-photos.js";
import { nowIso } from "../utils/time.js";
import {
  applyPendingPhotoUploadRetry,
  applySyncedPhotoUploadResult,
  clonePhotoUploadBlob,
  hasRemotePhotoUrl,
  isMissingRemotePhotoCopyError,
  normalizeUploadedPhotoAssetUrls,
  photoCopyApiPath,
  remotePhotoSourceFromRecord,
  removeRecordPhotoReference,
  resolveUploadedPhotoByContentHash,
  shouldRetryLocalPhotoUploadAfterFailure
} from "./photos.js";

export async function uploadPhotoToPath({
  path = "",
  listId = "",
  entity = null,
  photo = null,
  entityType = "item",
  dropMissingRemotePhoto = false,
  onPhotoProgress = null,
  retryTemporaryUploadFailure = true,
  apiFetch,
  apiUploadFormData,
  getCachedPhoto,
  markEntityChanged = () => {},
  persistStateSnapshot = () => {},
  scheduleProgressRender = () => {},
  fetchImpl = globalThis.fetch
} = {}) {
  if (!path || !entity?.id || !photo || typeof apiFetch !== "function" || typeof apiUploadFormData !== "function") {
    return false;
  }
  const sourcePhoto = photo;
  let activePhoto = photo;
  const resolvePhoto = () => {
    activePhoto = findEntityPhotoForUpload(entity, sourcePhoto) || activePhoto;
    return activePhoto;
  };
  const photoPair = (targetPhoto = activePhoto) => {
    const pair = [];
    if (sourcePhoto && typeof sourcePhoto === "object") pair.push(sourcePhoto);
    if (targetPhoto && typeof targetPhoto === "object" && targetPhoto !== sourcePhoto) pair.push(targetPhoto);
    return pair;
  };
  const updatePhotoProgress = (targetPhoto, progress) => {
    photoPair(targetPhoto).forEach((candidate) => setPhotoUploadProgress(candidate, progress));
    if (typeof onPhotoProgress === "function") {
      onPhotoProgress(targetPhoto, progress);
    }
    scheduleProgressRender();
  };
  const clearPhotoPairProgress = (targetPhoto) => {
    photoPair(targetPhoto).forEach((candidate) => clearPhotoUploadProgress(candidate));
  };
  const markPhotoPairUploadStarted = (targetPhoto) => {
    photoPair(targetPhoto).forEach((candidate) => markPhotoUploadStarted(candidate));
  };
  const applyPhotoPairState = (targetPhoto, applyState) => {
    photoPair(targetPhoto).forEach((candidate) => applyState(candidate));
  };
  const markChanged = (updatedAt) => markEntityChanged(entity, entityType, updatedAt);
  const localId = photo.localId || photo.id;
  const copiedOnServer = await copyRemotePhotoToList({
    apiFetch,
    entity,
    entityType,
    listId,
    photo,
    uploadPath: path,
    markEntityChanged: markChanged
  });
  if (copiedOnServer === "missing-source") {
    const targetPhoto = resolvePhoto();
    if (dropMissingRemotePhoto && removeRecordPhotoReference(entity, targetPhoto)) {
      const changedAt = nowIso();
      clearPhotoPairProgress(targetPhoto);
      markChanged(changedAt);
      return true;
    }
    const changedAt = nowIso();
    applyPhotoPairState(targetPhoto, (candidate) => {
      candidate.status = "missing-local-file";
      candidate.error = "Файл фото не найден на сервере.";
      candidate.updatedAt = changedAt;
      delete candidate._copyToCurrentList;
      delete candidate.copyToCurrentList;
    });
    clearPhotoPairProgress(targetPhoto);
    markChanged(changedAt);
    return true;
  }
  if (copiedOnServer) return true;

  updatePhotoProgress(resolvePhoto(), 0);
  const uploadSource = await getPhotoUploadSource(photo, localId, {
    fetchImpl,
    getCachedPhoto
  });
  if (!uploadSource?.blob) {
    const targetPhoto = resolvePhoto();
    const changedAt = nowIso();
    applyPhotoPairState(targetPhoto, (candidate) => {
      candidate.status = "missing-local-file";
      candidate.error = "Локальный файл фото не найден.";
      candidate.updatedAt = changedAt;
    });
    clearPhotoPairProgress(targetPhoto);
    return true;
  }

  const uploadPhoto = resolvePhoto();
  markPhotoPairUploadStarted(uploadPhoto);
  persistStateSnapshot();
  updatePhotoProgress(uploadPhoto, uploadPhoto.uploadProgress || 0);

  const createPhotoUploadFormData = () => {
    const formData = new FormData();
    formData.append("entityType", entityType);
    formData.append("entityId", entity.id);
    if (entityType === "item") formData.append("itemId", entity.id);
    formData.append("photoId", photo.id);
    formData.append("file", clonePhotoUploadBlob(uploadSource.blob), uploadSource.fileName || photo.fileName || `${photo.id}.jpg`);
    if (uploadSource.thumbBlob) formData.append("thumb", clonePhotoUploadBlob(uploadSource.thumbBlob), `thumb-${photo.id}.jpg`);
    return formData;
  };
  const applyUploadedPhotoResult = (targetPhoto, data) => {
    const changedAt = nowIso();
    const serverPhoto = normalizeUploadedPhotoAssetUrls(
      { ...((data && (data.photo || data)) || {}) },
      listId,
      path,
      photo.id
    );
    if (!hasRemotePhotoUrl(serverPhoto)) {
      throw new Error("Сервер не вернул URL загруженного фото.");
    }
    photoPair(targetPhoto).forEach((candidate) => {
      setPhotoUploadProgress(candidate, 100);
      applySyncedPhotoUploadResult(candidate, serverPhoto, {
        fallbackPhotoId: photo.id,
        listId,
        localId,
        nowIsoValue: changedAt,
        uploadPath: path
      });
      clearPhotoUploadProgress(candidate);
    });
    markChanged(targetPhoto.updatedAt);
    if (typeof onPhotoProgress === "function") {
      onPhotoProgress(targetPhoto, 100);
    }
    scheduleProgressRender();
  };
  const recoverStoredPhoto = async (targetPhoto) => {
    let recoveredPhoto = null;
    if (!String(path || "").includes("/admin/")) {
      try {
        recoveredPhoto = await resolveUploadedPhotoByContentHash({
          apiFetch,
          blob: uploadSource.blob,
          listId,
          timeoutMs: 30000
        });
      } catch {
        recoveredPhoto = null;
      }
    }
    if (!recoveredPhoto?.id) return false;
    const changedAt = nowIso();
    photoPair(targetPhoto).forEach((candidate) => {
      applySyncedPhotoUploadResult(candidate, recoveredPhoto, {
        fallbackPhotoId: photo.id,
        listId,
        localId,
        nowIsoValue: changedAt,
        uploadPath: path
      });
    });
    clearPhotoPairProgress(targetPhoto);
    markChanged(targetPhoto.updatedAt);
    return true;
  };

  try {
    const data = await apiUploadFormData(path, {
      method: "POST",
      body: createPhotoUploadFormData(),
      timeoutMs: PHOTO_UPLOAD_TIMEOUT_MS,
      stalledUploadTimeoutMs: PHOTO_UPLOAD_STALL_TIMEOUT_MS,
      onUploadProgress: (progress) => {
        updatePhotoProgress(resolvePhoto(), progress);
      }
    });
    applyUploadedPhotoResult(resolvePhoto(), data);
    return true;
  } catch (error) {
    const targetPhoto = resolvePhoto();
    if (await recoverStoredPhoto(targetPhoto)) return true;
    if (shouldRetryLocalPhotoUploadAfterFailure({
      blob: uploadSource?.blob,
      error,
      isNetworkErrorValue: Boolean(error?.isNetworkError),
      isTimeoutErrorValue: Boolean(error?.isTimeoutError),
      retryAvailable: retryTemporaryUploadFailure,
      uploadPath: path
    })) {
      const changedAt = nowIso();
      applyPhotoPairState(targetPhoto, (candidate) => applyPendingPhotoUploadRetry(candidate, { nowIsoValue: changedAt }));
      clearPhotoPairProgress(targetPhoto);
      markChanged(changedAt);
      return true;
    }
    const changedAt = nowIso();
    applyPhotoPairState(targetPhoto, (candidate) => {
      candidate.status = "error";
      candidate.error = error.message || "Не удалось загрузить фото.";
      candidate.updatedAt = changedAt;
    });
    clearPhotoPairProgress(targetPhoto);
    return true;
  }
}

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
  photo.status = "uploading";
  photo.error = "";
  photo.updatedAt = nowIsoValue;
  setPhotoUploadProgress(photo, photo.uploadProgress || 0);
}

export function clearPhotoUploadProgress(photo) {
  if (!photo || !Object.prototype.hasOwnProperty.call(photo, "uploadProgress")) return;
  delete photo.uploadProgress;
}

export async function getPhotoUploadSource(photo, localId, {
  fetchImpl = globalThis.fetch,
  getCachedPhoto
} = {}) {
  const cached = typeof getCachedPhoto === "function" ? await getCachedPhoto(localId) : null;
  if (cached?.blob) return cached;
  if (!hasRemotePhotoUrl(photo)) return null;
  const blob = await fetchRemotePhotoBlobForUpload(photo, "file", { fetchImpl });
  if (!blob) return null;
  const thumbBlob = await fetchRemotePhotoBlobForUpload(photo, "thumb", { fetchImpl }).catch(() => null);
  return {
    blob,
    thumbBlob,
    fileName: photo.fileName || `${photo.id || localId || "photo"}.jpg`
  };
}

export async function copyRemotePhotoToList({
  apiFetch,
  entity = null,
  entityType = "item",
  listId = "",
  photo = null,
  uploadPath = "",
  markEntityChanged = () => {}
} = {}) {
  if (!listId || !entity?.id || !hasRemotePhotoUrl(photo) || typeof apiFetch !== "function") return false;
  const source = remotePhotoSourceFromRecord(photo);
  if (!source.sourceListId || !source.sourcePhotoId) return false;
  const copyPath = photoCopyApiPath({ uploadPath, listId });
  if (!copyPath) return false;
  try {
    const data = await apiFetch(copyPath, {
      method: "POST",
      silentErrors: true,
      timeoutMs: 30000,
      body: JSON.stringify({
        sourceListId: source.sourceListId,
        sourcePhotoId: source.sourcePhotoId,
        photoId: photo.id || source.sourcePhotoId,
        entityType,
        entityId: entity.id
      })
    });
    const serverPhoto = normalizeUploadedPhotoAssetUrls(data.photo || data, listId, copyPath, photo.id || source.sourcePhotoId);
    Object.assign(photo, {
      ...photo,
      ...serverPhoto,
      id: serverPhoto.id || photo.id || source.sourcePhotoId,
      localId: photo.localId || photo.id || source.sourcePhotoId,
      listId: String(serverPhoto.listId || serverPhoto.list_id || listId || ""),
      status: "synced",
      error: "",
      updatedAt: serverPhoto.updatedAt || nowIso()
    });
    delete photo._copyToCurrentList;
    delete photo.copyToCurrentList;
    markEntityChanged(photo.updatedAt);
    return true;
  } catch (error) {
    if (isMissingRemotePhotoCopyError(error)) return "missing-source";
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[bike-packing] Failed to copy remote photo through API; falling back to download/upload.", {
        copyPath,
        source,
        targetListId: listId,
        entityType,
        entityId: entity.id,
        error
      });
    }
    return false;
  }
}

export async function fetchRemotePhotoBlobForUpload(photo, variant = "file", {
  fetchImpl = globalThis.fetch
} = {}) {
  normalizePhotoUrlFields(photo);
  const src = variant === "thumb"
    ? (photo.thumbUrl || photo.url || "")
    : (photo.url || photo.thumbUrl || "");
  if (!src || typeof fetchImpl !== "function") return null;
  const response = await fetchImpl(src, { credentials: "include", cache: "no-store" });
  if (!response.ok) return null;
  return response.blob();
}
