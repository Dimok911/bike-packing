import {
  getCachedPhoto,
  normalizeRemotePhotoUrl,
  photoRemoteSrc,
  putCachedPhoto,
  versionedPhotoUrl
} from "../sync/photos.js";
import { photoBlobsAreDistinct, photoCacheSourceSignature } from "../sync/photo-cache-quality.js";
import {
  cachedPhotoMatchesTask,
  cachedPhotoPreview,
  cachedPhotoVerifiedFull,
  downloadPhotoBlob,
  registerVerifiedPhotoRecord
} from "../sync/photo-cache-engine.js";
import {
  normalizeItemPhotos,
  photoUploadBatchInfo,
  photoUploadBatchSummary
} from "../state/item-photos.js";
import { escapeHtml } from "../utils/html.js";
import { currentDocumentLanguage } from "../utils/language.js";
import {
  photoLightboxSizingPresentation,
  updatePhotoLightboxAutoSize
} from "./photo-lightbox-sizing.js";
import {
  bindSharedPhotoGalleries,
  createSharedFullscreenSourceController,
  createSharedFullscreenSwitcher,
  decodeSharedFullscreenImage,
  loadAndDecodeSharedFullscreenImage,
  replaceSharedFullscreenImageSource,
  sharedFullscreenImageUsesSource,
  stepSharedPhotoInertia
} from "./shared-photo-gallery.js";

let lightboxObjectUrls = new Set();
let lightboxKeydownHandler = null;
let lightboxLoadingNotice = null;
let lightboxResizeHandler = null;
let lightboxInertiaCancel = null;
let lightboxSourceLifecycleCleanup = null;
let lightboxOpenRequestId = 0;
const PHOTO_LIGHTBOX_LOADING_NOTICE_DELAY_MS = 450;
const PHOTO_GALLERY_TAP_MOVE_LIMIT_PX = 10;
const PHOTO_GALLERY_SYNTHETIC_CLICK_SUPPRESSION_MS = 700;
const PHOTO_LIGHTBOX_INERTIA_DURATION_MS = 650;
const PHOTO_LIGHTBOX_INERTIA_MIN_SPEED = 0.025;
const PHOTO_LIGHTBOX_INERTIA_MAX_SPEED = 2.4;
const decodedPhotoLightboxSources = new Set();

function localText(en, ru) {
  return typeof document !== "undefined" && currentDocumentLanguage() === "en" ? en : ru;
}

export function createPhotoLightboxLoadingNotice({
  delayMs = PHOTO_LIGHTBOX_LOADING_NOTICE_DELAY_MS,
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
  onChange = () => {}
} = {}) {
  let timer = null;
  const clearPending = () => {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  };
  const settle = (state = "idle") => {
    clearPending();
    onChange(state);
  };
  const pending = () => {
    settle("idle");
    timer = setTimer(() => {
      timer = null;
      onChange("loading");
    }, Math.max(0, Number(delayMs) || 0));
  };
  return {
    pending,
    settle,
    cancel: () => settle("idle")
  };
}

export function renderPhotoSlide(photo, {
  photoObjectUrls = new Map(),
  uploadState = null
} = {}) {
  const localId = photo.localId || photo.id;
  const remoteSrc = photoRemoteSrc(photo);
  const remoteFullUrl = photo.url ? normalizeRemotePhotoUrl(photo.url) : "";
  const remoteThumbUrl = photo.thumbUrl ? normalizeRemotePhotoUrl(photo.thumbUrl) : remoteFullUrl;
  const remoteFullSrc = remoteFullUrl
    ? versionedPhotoUrl(remoteFullUrl, photo.updatedAt || photo.id || "")
    : remoteSrc;
  const remoteThumbSrc = remoteThumbUrl
    ? versionedPhotoUrl(remoteThumbUrl, photo.updatedAt || photo.id || "")
    : remoteSrc;
  const sourceSignature = remoteFullUrl
    ? photoCacheSourceSignature(remoteFullUrl, remoteThumbUrl, photo.updatedAt || "")
    : "";
  const localSources = localId && typeof photoObjectUrls?.sources === "function"
    ? photoObjectUrls.sources(localId, sourceSignature)
    : null;
  const localSrc = localSources?.preview || (localId ? photoObjectUrls.get(localId, sourceSignature) : "");
  const localFullSrc = localSources?.full || "";
  const remoteSourcesReady = typeof photoObjectUrls?.isReady === "function"
    ? photoObjectUrls.isReady()
    : true;
  const src = localSrc || (remoteSourcesReady ? remoteSrc : "") || "";
  const fullSrc = localFullSrc || remoteFullSrc;
  const localHydrateAttr = localId ? ` data-photo-local-id="${escapeHtml(localId)}" data-photo-local-source-id="${escapeHtml(localId)}"` : "";
  const fullAttr = fullSrc ? ` data-photo-full-src="${escapeHtml(fullSrc)}"` : "";
  const verifiedFullAttr = localFullSrc ? ` data-photo-verified-full-src="${escapeHtml(localFullSrc)}"` : "";
  const remoteFullAttr = remoteFullSrc ? ` data-photo-remote-full-src="${escapeHtml(remoteFullSrc)}"` : "";
  const remoteThumbAttr = remoteThumbSrc ? ` data-photo-remote-thumb-src="${escapeHtml(remoteThumbSrc)}"` : "";
  const sourceSignatureAttr = sourceSignature ? ` data-photo-source-signature="${escapeHtml(sourceSignature)}"` : "";
  const width = Math.max(0, Number(photo.width) || 0);
  const height = Math.max(0, Number(photo.height) || 0);
  const dimensionsAttr = width && height
    ? ` data-photo-width="${width}" data-photo-height="${height}"`
    : "";
  return `
    <button class="photo-gallery-slide vpg-slide" type="button" data-photo-open>
      <img
        ${src ? `src="${escapeHtml(src)}"` : ""}
        ${localHydrateAttr}
        ${fullAttr}
        ${verifiedFullAttr}
        ${remoteFullAttr}
        ${remoteThumbAttr}
        ${sourceSignatureAttr}
        ${dimensionsAttr}
        alt=""
        loading="lazy"
      />
      ${renderPhotoUploadProgress(uploadState || {})}
    </button>
  `;
}

export function renderPhotoDots(count, activeIndex = 0) {
  if (count <= 1) return "";
  return `
    <div class="photo-gallery-dots" data-photo-controls data-vpg-dots>
      ${Array.from({ length: count }, (_, index) => `<button class="photo-gallery-dot vpg-dot ${index === activeIndex ? "active" : ""}" type="button" data-vpg-dot data-photo-index="${index}" aria-label="${escapeHtml(localText("Photo", "Фото"))} ${index + 1}" aria-current="${index === activeIndex ? "true" : "false"}"><i class="photo-gallery-dot-mark" aria-hidden="true"></i></button>`).join("")}
    </div>
  `;
}

export function renderItemPhotoHtml(item, { force = false, showPhotos = true, photoObjectUrls = new Map() } = {}) {
  if (!force && !showPhotos) return "";
  const photos = normalizeItemPhotos(item);
  if (!photos.length) return "";
  const batch = photoUploadBatchSummary(photos);
  const slides = photos.map((photo) => renderPhotoSlide(photo, {
    photoObjectUrls,
    uploadState: photoUploadProgressState(photo, { batch })
  })).join("");
  const dots = renderPhotoDots(photos.length);
  const uploadState = photoUploadState(photos);
  const pending = uploadState.active || photos.some((photo) => !photoRemoteSrc(photo) && ["pending", "error", "missing-local-file"].includes(photo.status));
  const statusText = pending ? photoStatusText(photos) : "";
  return `
    <div class="item-photo vpg-gallery ${photos.length > 1 ? "item-photo-has-dots vpg-has-dots" : ""} ${pending ? "item-photo-pending" : ""}" data-photo-gallery>
      <div class="photo-gallery-track vpg-track">
        ${slides}
      </div>
      ${dots}
      ${statusText ? `<span data-photo-upload-status>${escapeHtml(statusText)}</span>` : ""}
    </div>
  `;
}

export async function renderPhotoGalleryHtml(photos, {
  objectUrls = [],
  activeIndex = 0,
  className = "",
  showCompletedBatchProgress = true,
  showStatus = false
} = {}) {
  const batch = photoUploadBatchSummary(photos);
  const slides = [];
  for (const photo of photos) {
    slides.push(await renderPhotoPreviewSlide(photo, objectUrls, {
      uploadState: photoUploadProgressState(photo, { batch, showCompletedBatchProgress })
    }));
  }
  const uploadState = photoUploadState(photos);
  const statusText = showStatus && uploadState.active ? photoStatusText(photos) : "";
  return `
    <div class="item-photo vpg-gallery ${photos.length > 1 ? "vpg-has-dots" : ""} ${className} ${uploadState.active ? "item-photo-pending" : ""}" data-photo-gallery data-photo-initial-index="${Math.max(0, Number(activeIndex) || 0)}">
      <div class="photo-gallery-track vpg-track">
        ${slides.join("")}
      </div>
      ${renderPhotoDots(photos.length, activeIndex)}
      ${statusText ? `<span data-photo-upload-status>${escapeHtml(statusText)}</span>` : ""}
    </div>
  `;
}

async function renderPhotoPreviewSlide(photo, objectUrls = [], { uploadState = null } = {}) {
  const cached = await getCachedPhoto(photo.localId || photo.id);
  const remoteFullUrl = photo.url ? normalizeRemotePhotoUrl(photo.url) : "";
  const remoteThumbUrl = photo.thumbUrl ? normalizeRemotePhotoUrl(photo.thumbUrl) : remoteFullUrl;
  const sourceSignature = remoteFullUrl
    ? photoCacheSourceSignature(remoteFullUrl, remoteThumbUrl, photo.updatedAt || "")
    : "";
  const cachedSourceMatches = !remoteFullUrl || Boolean(
    sourceSignature && cached?.sourceSignature === sourceSignature
  );
  const blob = cachedSourceMatches ? (cached?.thumbBlob || cached?.blob) : null;
  const fullBlob = cached?.blob && (
    (cached.fullBlobVerified === true && cachedSourceMatches)
    || (cached.fullBlobVerified !== false && !remoteFullUrl)
  ) ? cached.blob : null;
  const localSrc = blob ? URL.createObjectURL(blob) : "";
  const fullLocalSrc = fullBlob && fullBlob !== blob ? URL.createObjectURL(fullBlob) : localSrc;
  if (localSrc) objectUrls.push(localSrc);
  if (fullLocalSrc && fullLocalSrc !== localSrc) objectUrls.push(fullLocalSrc);
  const remoteSrc = photoRemoteSrc(photo);
  const remoteFullSrc = remoteFullUrl
    ? versionedPhotoUrl(remoteFullUrl, photo.updatedAt || photo.id || "")
    : remoteSrc;
  const remoteThumbSrc = remoteThumbUrl
    ? versionedPhotoUrl(remoteThumbUrl, photo.updatedAt || photo.id || "")
    : remoteSrc;
  const fullSrc = fullLocalSrc || remoteFullSrc;
  const src = localSrc || remoteSrc || "";
  const localId = photo.localId || photo.id || "";
  return `
    <button class="photo-gallery-slide vpg-slide" type="button" data-photo-open>
      <img
        ${src ? `src="${escapeHtml(src)}"` : ""}
        ${fullSrc ? `data-photo-full-src="${escapeHtml(fullSrc)}"` : ""}
        ${fullLocalSrc ? `data-photo-verified-full-src="${escapeHtml(fullLocalSrc)}"` : ""}
        ${remoteFullSrc ? `data-photo-remote-full-src="${escapeHtml(remoteFullSrc)}"` : ""}
        ${remoteThumbSrc ? `data-photo-remote-thumb-src="${escapeHtml(remoteThumbSrc)}"` : ""}
        ${sourceSignature ? `data-photo-source-signature="${escapeHtml(sourceSignature)}"` : ""}
        ${localId ? `data-photo-local-source-id="${escapeHtml(localId)}"` : ""}
        alt=""
      />
      ${renderPhotoUploadProgress(uploadState || {})}
    </button>
  `;
}

export function photoBatchStatusText(photos) {
  const batch = photoUploadBatchSummary(photos);
  if (!batch) return "";
  if (batch.complete) {
    return localText(
      `All photos uploaded · ${batch.uploaded} of ${batch.total}`,
      `Все фото загружены · ${batch.uploaded} из ${batch.total}`
    );
  }
  const base = localText(
    `Uploaded ${batch.uploaded} of ${batch.total} photos`,
    `Загружено ${batch.uploaded} из ${batch.total} фото`
  );
  if (!batch.failed) return base;
  return localText(
    `${base} · failed: ${batch.failed}`,
    `${base} · ошибок: ${batch.failed}`
  );
}

export function photoStatusText(photos) {
  const list = Array.isArray(photos) ? photos : [];
  if (!list.length) return "";
  if (list.some((photo) => photo.status === "error")) return localText("Photo upload failed", "Ошибка загрузки фото");
  if (list.some((photo) => photo.status === "missing-local-file")) return localText("Local photo file is missing", "Нет локального файла фото");
  const batch = photoUploadBatchInfo(list);
  if (batch) {
    return localText(
      `Uploading photo ${batch.index} of ${batch.total}`,
      `Загрузка фото ${batch.index} из ${batch.total}`
    );
  }
  if (list.some((photo) => photo.status === "uploading")) return localText("Uploading photo", "Фото загружается");
  if (list.some((photo) => photo.status === "pending" && !photoRemoteSrc(photo))) return localText("Waiting to upload", "Ждём загрузки");
  const batchText = photoBatchStatusText(list);
  if (batchText) return batchText;
  return list.length > 1
    ? localText(`${list.length} photos uploaded`, `${list.length} фото загружено`)
    : localText("Photo uploaded", "Фото загружено");
}

export function photoDialogStatusText(photos) {
  const list = Array.isArray(photos) ? photos : [];
  if (!list.length) return "";
  const batch = photoUploadBatchSummary(list);
  if (batch?.total === 1 && !batch.failed) return "";
  if (batch?.active) return photoStatusText(list);
  const batchText = photoBatchStatusText(list);
  if (batchText) return batchText;
  if (list.some((photo) => ["error", "missing-local-file"].includes(photo.status))) {
    return photoStatusText(list);
  }
  if (list.some((photo) => photo.status === "uploading" || (photo.status === "pending" && !photoRemoteSrc(photo)))) {
    return photoStatusText(list);
  }
  return "";
}

export function photoUploadState(photos) {
  const list = Array.isArray(photos) ? photos : [];
  const batch = photoUploadBatchSummary(list);
  if (batch?.active) {
    const activePhoto = list.find((photo) =>
      photo?.uploadBatchId === batch.id && photo?.status === "uploading"
    ) || list.find((photo) =>
      photo?.uploadBatchId === batch.id && photo?.status === "pending" && !photoRemoteSrc(photo)
    );
    const progress = activePhoto?.status === "uploading" && Number.isFinite(Number(activePhoto.uploadProgress))
      ? Number(activePhoto.uploadProgress)
      : 0;
    return {
      active: true,
      indeterminate: false,
      progress: Math.max(0, Math.min(100, progress)),
      batchIndex: batch.index,
      batchTotal: batch.total,
      uploaded: batch.uploaded
    };
  }
  const active = list.some((photo) => photo.status === "uploading");
  if (!active) return { active: false, progress: 0 };
  const uploading = list.filter((photo) => photo.status === "uploading");
  const progressValues = uploading
    .map((photo) => Number(photo.uploadProgress))
    .filter((progress) => Number.isFinite(progress));
  const fallbackProgressValues = list
    .map((photo) => Number(photo.uploadProgress))
    .filter((progress) => Number.isFinite(progress));
  const hasProgress = progressValues.length > 0 || fallbackProgressValues.length > 0;
  const progress = hasProgress ? Math.max(...(progressValues.length ? progressValues : fallbackProgressValues)) : (uploading.length ? 8 : 0);
  const legacyBatch = photoUploadBatchInfo(list);
  return {
    active: true,
    indeterminate: !hasProgress && !uploading.length,
    progress: Math.max(0, Math.min(100, progress)),
    ...(legacyBatch ? { batchIndex: legacyBatch.index, batchTotal: legacyBatch.total } : {})
  };
}

export function photoUploadProgressState(photo, {
  batch = null,
  showCompletedBatchProgress = false
} = {}) {
  if (!photo || ["error", "missing-local-file"].includes(photo.status)) {
    return { active: false, progress: 0 };
  }
  if (photo.status === "uploading") {
    return {
      active: true,
      progress: Math.max(0, Math.min(100, Number(photo.uploadProgress) || 0))
    };
  }
  if (photo.status === "pending" && !photoRemoteSrc(photo)) {
    return { active: true, progress: 0 };
  }
  const belongsToVisibleBatch = Boolean(
    photo.uploadBatchId &&
    (showCompletedBatchProgress || (batch?.active && photo.uploadBatchId === batch.id))
  );
  if (belongsToVisibleBatch && photoRemoteSrc(photo)) {
    return { active: true, progress: 100, complete: true };
  }
  return { active: false, progress: 0 };
}

export function renderPhotoUploadProgress({ active = false, complete = false, indeterminate = false, progress = 0 } = {}) {
  if (!active) return "";
  if (complete) {
    const completedText = localText("Uploaded", "Загружено");
    return `<div class="photo-upload-complete">✓ ${escapeHtml(completedText)}</div>`;
  }
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  const angle = Math.round(safeProgress * 3.6);
  const className = [
    "photo-upload-progress",
    indeterminate ? "photo-upload-progress-indeterminate" : ""
  ].filter(Boolean).join(" ");
  return `
    <div class="${className}" style="--photo-upload-angle: ${angle}deg" aria-hidden="true">
      ${indeterminate ? "" : `<span>${Math.round(safeProgress)}</span>`}
    </div>
  `;
}

export function updatePhotoGalleryUploadProgress(root, photos, {
  showCompletedBatchProgress = true,
  showStatus = false
} = {}) {
  const gallery = root?.matches?.("[data-photo-gallery]")
    ? root
    : root?.querySelector?.("[data-photo-gallery]");
  if (!gallery) return false;
  const uploadState = photoUploadState(photos);
  const batch = photoUploadBatchSummary(photos);
  const statusText = showStatus && uploadState.active ? photoStatusText(photos) : "";
  gallery.classList.toggle("item-photo-pending", uploadState.active);

  const slides = [...gallery.querySelectorAll(".photo-gallery-slide")];
  slides.forEach((slide, index) => {
    const existingProgress = slide.querySelector(".photo-upload-progress, .photo-upload-complete");
    const nextState = photoUploadProgressState(photos[index], { batch, showCompletedBatchProgress });
    if (!nextState.active) {
      existingProgress?.remove();
      return;
    }
    const progressTemplate = document.createElement("template");
    progressTemplate.innerHTML = renderPhotoUploadProgress(nextState).trim();
    const nextProgress = progressTemplate.content.firstElementChild;
    if (!nextProgress) return;
    if (existingProgress) existingProgress.replaceWith(nextProgress);
    else slide.append(nextProgress);
  });

  const existingStatus = gallery.querySelector("[data-photo-upload-status]");
  if (!showStatus || !uploadState.active) {
    existingStatus?.remove();
    return true;
  }

  if (statusText) {
    if (existingStatus) {
      existingStatus.textContent = statusText;
    } else {
      const status = document.createElement("span");
      status.dataset.photoUploadStatus = "";
      status.textContent = statusText;
      gallery.append(status);
    }
  } else {
    existingStatus?.remove();
  }
  return true;
}

export async function hydrateItemPhotos(root = document, { photoObjectUrls = new Map() } = {}) {
  const images = [...root.querySelectorAll("img[data-photo-local-id]")];
  await Promise.all(images.map(async (image) => {
    const localId = image.dataset.photoLocalId;
    const sourceSignature = image.dataset.photoSourceSignature || "";
    const existingUrl = photoObjectUrls.get(localId, sourceSignature);
    if (existingUrl) {
      image.src = existingUrl;
      image.removeAttribute("data-photo-local-id");
      return;
    }
    const cached = await getCachedPhoto(localId);
    const task = { sourceSignature };
    const matches = cachedPhotoMatchesTask(cached, task);
    const blob = matches ? cachedPhotoPreview(cached, task) : null;
    if (!blob) return;
    if (matches && typeof photoObjectUrls?.setRecord === "function") {
      photoObjectUrls.setRecord({ key: localId, sourceSignature }, cached);
      const localSources = photoObjectUrls.sources(localId, sourceSignature);
      image.src = localSources.preview;
      const verifiedFullBlob = cachedPhotoVerifiedFull(cached, task);
      if (verifiedFullBlob && localSources.full) {
        image.dataset.photoVerifiedFullSrc = localSources.full;
        image.dataset.photoFullSrc = localSources.full;
      }
    } else {
      image.src = getPhotoObjectUrl(localId, sourceSignature, blob, photoObjectUrls);
    }
    image.removeAttribute("data-photo-local-id");
  }));
}

function getPhotoObjectUrl(id, sourceSignature, blob, photoObjectUrls) {
  if (typeof photoObjectUrls?.ensure === "function") {
    return photoObjectUrls.ensure(id, sourceSignature, blob);
  }
  if (photoObjectUrls.has(id)) return photoObjectUrls.get(id);
  const url = URL.createObjectURL(blob);
  photoObjectUrls.set(id, url);
  return url;
}

export function resolvePhotoGalleryActiveIndex({
  pendingIndex = null,
  scrollLeft = 0,
  trackWidth = 1,
  settleTolerance = 1
} = {}) {
  const width = Math.max(1, Number(trackWidth) || 1);
  if (Number.isFinite(pendingIndex)) {
    const targetIndex = Math.max(0, Math.round(pendingIndex));
    const settled = Math.abs((Number(scrollLeft) || 0) - width * targetIndex) <= settleTolerance;
    return {
      activeIndex: targetIndex,
      pendingIndex: settled ? null : targetIndex
    };
  }
  return {
    activeIndex: Math.max(0, Math.round((Number(scrollLeft) || 0) / width)),
    pendingIndex: null
  };
}

export function resolvePhotoGallerySnapIndex({
  scrollLeft = 0,
  trackWidth = 1,
  slideCount = 1
} = {}) {
  const width = Math.max(1, Number(trackWidth) || 1);
  const lastIndex = Math.max(0, Math.trunc(Number(slideCount) || 1) - 1);
  return Math.max(0, Math.min(lastIndex, Math.round((Number(scrollLeft) || 0) / width)));
}

export function bindPhotoGalleries(root = document, {
  onItemPreviewActive = () => {},
  onRootContainerPreviewActive = () => {},
  photoObjectUrls = null,
  prepareFullscreenSource = async () => null,
  openLightbox = openPhotoLightbox
} = {}) {
  return bindSharedPhotoGalleries(root, {
    openLightbox: ({ image, gallery, index }) => {
      if (image) openLightbox(image, { gallery, index, photoObjectUrls, prepareFullscreenSource });
    },
    onActiveIndexChange: ({ gallery, index }) => {
      if (gallery.closest("#itemPhotoPreview")) onItemPreviewActive(index);
      if (gallery.closest("#rootContainerPhotoPreview")) onRootContainerPreviewActive(index);
    }
  });
}

export async function openPhotoLightbox(sourceImage, {
  gallery = null,
  index = -1,
  photoObjectUrls = null,
  prepareFullscreenSource = async () => null
} = {}) {
  const openRequestId = ++lightboxOpenRequestId;
  const { entries, activeIndex: initialIndex } = photoLightboxEntries(sourceImage, { gallery, index });
  if (typeof photoObjectUrls?.sources === "function") {
    entries.forEach((entry) => {
      if (!entry.localId) return;
      const localSources = photoObjectUrls.sources(entry.localId, entry.sourceSignature);
      if (localSources.full) entry.verifiedFullSrc = localSources.full;
    });
  }
  const initialEntry = entries[initialIndex];
  if (initialEntry?.localId && !initialEntry.verifiedFullSrc) {
    const preparedSources = await prepareFullscreenSource(initialEntry).catch(() => null);
    if (openRequestId !== lightboxOpenRequestId) return;
    if (preparedSources?.full) initialEntry.verifiedFullSrc = preparedSources.full;
    if (preparedSources?.preview) initialEntry.previewSrc = preparedSources.preview;
    if (preparedSources?.width) initialEntry.width = preparedSources.width;
    if (preparedSources?.height) initialEntry.height = preparedSources.height;
  }
  if (openRequestId !== lightboxOpenRequestId) return;
  closePhotoLightbox({ preserveOpenRequest: true });
  const initialPreviewSrc = initialEntry?.verifiedFullSrc || initialEntry?.previewSrc || initialEntry?.fullSrc || "";
  if (!initialPreviewSrc) return;
  const overlay = document.createElement("dialog");
  overlay.className = "photo-lightbox";
  const hasNavigation = entries.length > 1;
  const closeLabel = escapeHtml(localText("Close", "Закрыть"));
  const previousLabel = escapeHtml(localText("Previous photo", "Предыдущее фото"));
  const nextLabel = escapeHtml(localText("Next photo", "Следующее фото"));
  const loadingFullLabel = escapeHtml(localText("Loading full-size photo…", "Загружается полная версия фото…"));
  const slidesHtml = entries.map((entry, entryIndex) => {
    const previewSrc = entry?.previewSrc || entry?.fullSrc || "";
    const directFullSrc = entryIndex === initialIndex
      ? (entry?.verifiedFullSrc || entry?.resolvedFullSrc || "")
      : "";
    const initialSrc = directFullSrc || previewSrc;
    const viewportWidth = Math.max(0, Number(window.visualViewport?.width || window.innerWidth) - 18);
    const viewportHeight = Math.max(0, Number(window.visualViewport?.height || window.innerHeight) - 18);
    const sizing = photoLightboxSizingPresentation({
      naturalWidth: entry?.width,
      naturalHeight: entry?.height,
      availableWidth: viewportWidth,
      availableHeight: viewportHeight
    });
    const sizingClass = sizing.className ? ` ${sizing.className}` : "";
    const sizingStyle = sizing.limitAutoUpscale
      ? ` style="--photo-lightbox-natural-width: ${sizing.width}px; --photo-lightbox-natural-height: ${sizing.height}px"`
      : "";
    return `
      <div class="photo-lightbox-slide" data-photo-lightbox-index="${entryIndex}">
        <img class="photo-lightbox-image${sizingClass}"${sizingStyle} src="${escapeHtml(initialSrc)}" alt="" data-photo-lightbox-quality="${directFullSrc ? "full" : "preview"}" ${entryIndex === initialIndex ? "" : 'loading="lazy"'} />
      </div>
    `;
  }).join("");
  const dotsHtml = hasNavigation
    ? `<div class="photo-lightbox-dots" data-photo-lightbox-dots>
        ${entries.map((_, entryIndex) => {
          const dotLabel = escapeHtml(localText(
            `Photo ${entryIndex + 1} of ${entries.length}`,
            `Фото ${entryIndex + 1} из ${entries.length}`
          ));
          return `<button class="photo-lightbox-dot ${entryIndex === initialIndex ? "active" : ""}" type="button" data-photo-lightbox-dot="${entryIndex}" aria-label="${dotLabel}" ${entryIndex === initialIndex ? 'aria-current="true"' : ""}></button>`;
        }).join("")}
      </div>`
    : "";
  overlay.innerHTML = `
    <button class="photo-lightbox-close vpg-fullscreen-control vpg-fullscreen-close" type="button" aria-label="${closeLabel}">×</button>
    ${hasNavigation ? `<button class="photo-lightbox-nav photo-lightbox-prev vpg-fullscreen-control vpg-fullscreen-nav" type="button" aria-label="${previousLabel}"><span aria-hidden="true">‹</span></button>` : ""}
    <div class="photo-lightbox-track">
      ${slidesHtml}
    </div>
    <div class="photo-lightbox-load-status" role="status" aria-live="polite" hidden>
      <span class="photo-lightbox-loading-spinner" aria-hidden="true"></span>
      <span data-photo-lightbox-status-text>${loadingFullLabel}</span>
    </div>
    ${dotsHtml}
    ${hasNavigation ? `<button class="photo-lightbox-nav photo-lightbox-next vpg-fullscreen-control vpg-fullscreen-nav" type="button" aria-label="${nextLabel}"><span aria-hidden="true">›</span></button>` : ""}
  `;
  document.body.append(overlay);
  if (typeof overlay.showModal === "function") {
    overlay.showModal();
  }
  document.body.classList.add("photo-lightbox-open");
  const track = overlay.querySelector(".photo-lightbox-track");
  const lightboxImages = [...overlay.querySelectorAll(".photo-lightbox-image")];
  const lightboxDots = [...overlay.querySelectorAll(".photo-lightbox-dot")];
  let image = lightboxImages[initialIndex];
  const loadStatus = overlay.querySelector(".photo-lightbox-load-status");
  const loadStatusText = overlay.querySelector("[data-photo-lightbox-status-text]");
  const prevButton = overlay.querySelector(".photo-lightbox-prev");
  const nextButton = overlay.querySelector(".photo-lightbox-next");
  let activeIndex = initialIndex;
  const fullscreenSwitcher = createSharedFullscreenSwitcher({
    root: overlay,
    track,
    slides: overlay.querySelectorAll(".photo-lightbox-slide"),
    initialIndex
  });
  const directDesktop = Boolean(fullscreenSwitcher?.directDesktop);
  let loadingNotice = null;
  let cancelPanInertia = () => {};
  let sourceController = null;
  const preparedFullImages = new Map();
  const close = () => {
    cancelPanInertia(false);
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    if (lightboxSettleTimer !== null) clearTimeout(lightboxSettleTimer);
    fullscreenSwitcher?.destroy();
    closePhotoLightbox();
  };
  overlay.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  overlay.querySelector(".photo-lightbox-close")?.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (Date.now() < suppressImageCloseUntil) return;
    if (event.target === overlay || event.target?.classList?.contains("photo-lightbox-slide")) close();
  });
  let renderToken = 0;
  let suppressImageCloseUntil = 0;
  let pendingScrollIndex = null;
  let scrollFrame = 0;
  let lightboxSettleTimer = null;
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let startX = 0;
  let startY = 0;
  let startPanX = 0;
  let startPanY = 0;
  let touchStartScrollLeft = 0;
  let touchStartTime = 0;
  let moved = false;
  let pinching = false;
  let touchStartedWithPinch = false;
  let panVelocityX = 0;
  let panVelocityY = 0;
  let panVelocitySampleX = 0;
  let panVelocitySampleY = 0;
  let panVelocitySampleTime = 0;
  let inertiaFrame = 0;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  const resetTransform = () => {
    cancelPanInertia(false);
    image?.style?.removeProperty("transform");
    scale = 1;
    panX = 0;
    panY = 0;
    apply();
  };
  const clampPan = () => {
    if (scale <= 1) {
      panX = 0;
      panY = 0;
      return;
    }
    const maxX = Math.max(0, ((image.offsetWidth || image.clientWidth || 0) * scale - overlay.clientWidth) / 2);
    const maxY = Math.max(0, ((image.offsetHeight || image.clientHeight || 0) * scale - overlay.clientHeight) / 2);
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  };
  const apply = () => {
    clampPan();
    image.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
    track.classList.toggle("photo-lightbox-track-zoomed", scale > 1);
  };
  const resetPanVelocity = (clientX, clientY, timestamp = now()) => {
    panVelocityX = 0;
    panVelocityY = 0;
    panVelocitySampleX = Number(clientX) || 0;
    panVelocitySampleY = Number(clientY) || 0;
    panVelocitySampleTime = timestamp;
  };
  const measurePanVelocity = (clientX, clientY, timestamp = now()) => {
    const elapsed = timestamp - panVelocitySampleTime;
    const deltaX = (Number(clientX) || 0) - panVelocitySampleX;
    const deltaY = (Number(clientY) || 0) - panVelocitySampleY;
    if (elapsed > 0 && elapsed <= 120) {
      if (deltaX || deltaY) {
        const nextVelocityX = deltaX / elapsed;
        const nextVelocityY = deltaY / elapsed;
        panVelocityX = panVelocityX * 0.35 + nextVelocityX * 0.65;
        panVelocityY = panVelocityY * 0.35 + nextVelocityY * 0.65;
      }
    } else if (elapsed > 120) {
      panVelocityX = 0;
      panVelocityY = 0;
    }
    panVelocitySampleX = Number(clientX) || 0;
    panVelocitySampleY = Number(clientY) || 0;
    panVelocitySampleTime = timestamp;
  };
  cancelPanInertia = (settle = true) => {
    if (inertiaFrame) cancelAnimationFrame(inertiaFrame);
    inertiaFrame = 0;
    panVelocityX = 0;
    panVelocityY = 0;
    if (settle && image) apply();
  };
  lightboxInertiaCancel = () => cancelPanInertia(false);
  const startPanInertia = () => {
    if (inertiaFrame) cancelAnimationFrame(inertiaFrame);
    inertiaFrame = 0;
    if (scale <= 1 || reducedMotion || now() - panVelocitySampleTime > 100) {
      apply();
      return;
    }
    const speed = Math.hypot(panVelocityX, panVelocityY);
    if (speed < PHOTO_LIGHTBOX_INERTIA_MIN_SPEED) {
      apply();
      return;
    }
    if (speed > PHOTO_LIGHTBOX_INERTIA_MAX_SPEED) {
      const speedRatio = PHOTO_LIGHTBOX_INERTIA_MAX_SPEED / speed;
      panVelocityX *= speedRatio;
      panVelocityY *= speedRatio;
    }
    const startedAt = now();
    let previousFrameAt = startedAt;
    const step = (timestamp) => {
      if (!overlay.isConnected || scale <= 1) {
        cancelPanInertia();
        return;
      }
      const next = stepSharedPhotoInertia({
        x: panX,
        y: panY,
        velocityX: panVelocityX,
        velocityY: panVelocityY,
        elapsedMs: timestamp - previousFrameAt
      });
      if (!next) {
        cancelPanInertia();
        return;
      }
      previousFrameAt = timestamp;
      panX = next.x;
      panY = next.y;
      panVelocityX = next.velocityX;
      panVelocityY = next.velocityY;
      const steppedX = panX;
      const steppedY = panY;
      clampPan();
      if (panX !== steppedX) panVelocityX = 0;
      if (panY !== steppedY) panVelocityY = 0;
      apply();
      const elapsed = timestamp - startedAt;
      if (
        elapsed >= PHOTO_LIGHTBOX_INERTIA_DURATION_MS
        || Math.hypot(panVelocityX, panVelocityY) < PHOTO_LIGHTBOX_INERTIA_MIN_SPEED
      ) {
        cancelPanInertia();
        return;
      }
      inertiaFrame = requestAnimationFrame(step);
    };
    inertiaFrame = requestAnimationFrame(step);
  };
  const updateNavigation = () => {
    fullscreenSwitcher?.render(activeIndex, false);
    if (prevButton) {
      prevButton.disabled = activeIndex <= 0;
      prevButton.setAttribute("aria-disabled", prevButton.disabled ? "true" : "false");
    }
    if (nextButton) {
      nextButton.disabled = activeIndex >= entries.length - 1;
      nextButton.setAttribute("aria-disabled", nextButton.disabled ? "true" : "false");
    }
    lightboxDots.forEach((dot, dotIndex) => {
      const active = dotIndex === activeIndex;
      dot.classList.toggle("active", active);
      if (active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  };
  const updateLoadStatus = (state = "idle") => {
    if (!loadStatus || !loadStatusText) return;
    loadStatus.hidden = state === "idle";
    loadStatus.classList.toggle("photo-lightbox-load-error", ["error", "preview", "saved-preview"].includes(state));
    loadStatusText.textContent = state === "saved-preview"
      ? localText(
        "Showing the saved preview",
        "Показан сохранённый предпросмотр"
      )
      : state === "preview"
      ? localText(
        "Preview · only the preview is stored",
        "Предпросмотр · сохранён только предпросмотр"
      )
      : state === "error"
        ? localText(
          "Preview · full-size photo is unavailable",
          "Предпросмотр · полная версия фото недоступна"
        )
        : localText(
          "Loading full-size photo…",
          "Загружается полная версия фото…"
        );
  };
  loadingNotice = createPhotoLightboxLoadingNotice({
    onChange: updateLoadStatus
  });
  lightboxLoadingNotice = loadingNotice;
  let suppressNavClickUntil = 0;
  let navigatePhoto = () => false;
  const activateNavigation = (event, direction) => {
    event.preventDefault();
    event.stopPropagation();
    if (Date.now() < suppressNavClickUntil) return;
    suppressImageCloseUntil = Date.now() + 450;
    if (direction < 0 && activeIndex <= 0) return;
    if (direction > 0 && activeIndex >= entries.length - 1) return;
    navigatePhoto(activeIndex + direction);
  };
  bindPhotoLightboxNavButton(prevButton, (event) => activateNavigation(event, -1));
  bindPhotoLightboxNavButton(nextButton, (event) => activateNavigation(event, 1));
  const boundLightboxImages = new WeakSet();
  let bindImageInteractions = () => {};
  const preparedImageKey = (entryIndex, src) => `${entryIndex}\u0000${src}`;
  const abortLifecycleDecode = () => {
    const error = new Error("photo-lightbox-decode-aborted");
    error.name = "AbortError";
    return error;
  };
  const decodeLifecycleSource = async ({ index: entryIndex, src, signal }) => {
    const currentImage = lightboxImages[entryIndex];
    if (!currentImage || !src || signal?.aborted) return false;
    const key = preparedImageKey(entryIndex, src);
    if (sharedFullscreenImageUsesSource(currentImage, src)) {
      try {
        await decodeSharedFullscreenImage(currentImage, { signal });
      } catch (error) {
        if (signal?.aborted) throw abortLifecycleDecode();
        throw error;
      }
      if (signal?.aborted) throw abortLifecycleDecode();
      preparedFullImages.set(key, currentImage);
      return true;
    }
    const replacement = currentImage.cloneNode(false);
    replacement.removeAttribute?.("src");
    replacement.removeAttribute?.("srcset");
    replacement.removeAttribute?.("sizes");
    replacement.removeAttribute?.("loading");
    replacement.decoding = "async";
    try {
      await loadAndDecodeSharedFullscreenImage(replacement, src, { signal });
    } catch (error) {
      if (signal?.aborted) throw abortLifecycleDecode();
      throw error;
    }
    if (signal?.aborted) throw abortLifecycleDecode();
    if (!sharedFullscreenImageUsesSource(replacement, src)) return false;
    preparedFullImages.set(key, replacement);
    return true;
  };
  const commitLifecycleSource = async ({ entry, index: entryIndex, src }) => {
    const currentImage = lightboxImages[entryIndex];
    const key = preparedImageKey(entryIndex, src);
    const replacement = preparedFullImages.get(key);
    if (!currentImage || !replacement) return false;
    const shouldCommit = () => (
      sourceController?.activeIndex === entryIndex
      && overlay.isConnected
    );
    let visibleImage = replacement;
    try {
      await replacePhotoLightboxImageSource(currentImage, src, {
        ...(replacement === currentImage ? {} : { createReplacement: () => replacement }),
        shouldCommit,
        onReplaced: (nextImage) => {
          visibleImage = nextImage;
          lightboxImages[entryIndex] = nextImage;
          if (activeIndex === entryIndex) image = nextImage;
          bindImageInteractions(nextImage);
        },
        onRollback: (restoredImage) => {
          lightboxImages[entryIndex] = restoredImage;
          if (activeIndex === entryIndex) image = restoredImage;
        }
      });
    } catch {
      return false;
    }
    visibleImage.dataset.photoLightboxQuality = "full";
    entry.resolvedFullSrc = src;
    if (!String(src).startsWith("blob:")) decodedPhotoLightboxSources.add(src);
    updatePhotoLightboxAutoSize(visibleImage, overlay);
    return true;
  };
  sourceController = createSharedFullscreenSourceController({
    entries,
    initialIndex,
    getPreviewSource: (entry) => entry?.previewSrc || entry?.fullSrc || "",
    getVerifiedFullSource: (entry) => entry?.verifiedFullSrc || entry?.resolvedFullSrc || "",
    resolveFullSource: async (entry, _entryIndex, { signal }) => {
      entry.lifecycleFallback = null;
      const next = await resolvePhotoLightboxSource(entry, {
        signal,
        onCachedRecord: (record) => {
          if (!entry.localId || !photoObjectUrls?.setRecord) return "";
          const task = { key: entry.localId, sourceSignature: entry.sourceSignature };
          photoObjectUrls.setRecord(task, record);
          return photoObjectUrls.get(entry.localId, entry.sourceSignature, "full");
        }
      });
      if (signal?.aborted) {
        if (next.objectUrl) URL.revokeObjectURL(next.objectUrl);
        return null;
      }
      if (!next.src || !next.isFull) {
        entry.lifecycleFallback = next;
        if (next.objectUrl) lightboxObjectUrls.add(next.objectUrl);
        return null;
      }
      return {
        src: next.src,
        ...(next.objectUrl ? { dispose: () => URL.revokeObjectURL(next.objectUrl) } : {})
      };
    },
    decodeSource: decodeLifecycleSource,
    commitSource: commitLifecycleSource
  });
  lightboxSourceLifecycleCleanup = () => {
    sourceController?.destroy();
    sourceController = null;
    preparedFullImages.clear();
  };
  const showPhoto = async (nextIndex, { force = false } = {}) => {
    if (nextIndex < 0 || nextIndex >= entries.length || (!force && nextIndex === activeIndex)) return false;
    cancelPanInertia(false);
    const token = ++renderToken;
    loadingNotice.settle("idle");
    const entry = entries[nextIndex];
    const previewSrc = entry?.previewSrc || entry?.fullSrc || "";
    const targetImage = lightboxImages[nextIndex];
    if (!previewSrc || !targetImage) return false;
    const activation = sourceController?.activate(nextIndex)
      || Promise.resolve({ index: nextIndex, src: "", success: false });
    const displaySrc = sourceController?.initialSource(nextIndex) || previewSrc;
    const readyFullSrc = entry?.verifiedFullSrc || entry?.resolvedFullSrc || "";
    if (image !== targetImage) image.style.removeProperty("transform");
    activeIndex = nextIndex;
    image = targetImage;
    image.src = displaySrc;
    image.dataset.photoLightboxQuality = readyFullSrc ? "full" : "preview";
    updateNavigation();
    resetTransform();
    const expectsFullSize = Boolean(
      entry.localId
      || (entry.fullSrc && entry.fullSrc !== previewSrc)
    );
    if (!expectsFullSize) {
      image.dataset.photoLightboxQuality = entry.fullSrc ? "full" : "preview";
      void activation;
      return true;
    }
    if (!readyFullSrc) loadingNotice.pending();
    const lifecycleResult = await activation;
    if (token !== renderToken || !overlay.isConnected) {
      return false;
    }
    if (lifecycleResult.success) {
      loadingNotice.settle("idle");
      resetTransform();
      return true;
    }
    const next = entry.lifecycleFallback || {};
    if (!next.src || !next.isFull) {
      if (next.objectUrl && next.src) {
        try {
          const currentImage = image;
          await replacePhotoLightboxImageSource(currentImage, next.src, {
            shouldCommit: () => token === renderToken && overlay.isConnected,
            onReplaced: (replacement) => {
              lightboxImages[nextIndex] = replacement;
              if (activeIndex === nextIndex) image = replacement;
              replacement.dataset.photoLightboxQuality = "preview";
              bindImageInteractions(replacement);
            },
            onRollback: (restoredImage) => {
              lightboxImages[nextIndex] = restoredImage;
              if (activeIndex === nextIndex) image = restoredImage;
            }
          });
          lightboxObjectUrls.add(next.objectUrl);
        } catch {
          URL.revokeObjectURL(next.objectUrl);
          lightboxObjectUrls.delete(next.objectUrl);
        }
      }
      loadingNotice.settle(next.reason === "preview-only"
        ? "preview"
        : next.reason === "cached-preview"
          ? "saved-preview"
          : "error");
      return true;
    }
    loadingNotice.settle("error");
    return true;
  };
  navigatePhoto = (nextIndex, behavior = "smooth") => {
    const safeIndex = Math.max(0, Math.min(entries.length - 1, Number(nextIndex) || 0));
    const targetLeft = track.clientWidth * safeIndex;
    if (safeIndex === activeIndex && (
      directDesktop
      || (!pendingScrollIndex && Math.abs(track.scrollLeft - targetLeft) <= 1)
    )) return false;
    pendingScrollIndex = !directDesktop && behavior === "smooth" ? safeIndex : null;
    if (safeIndex !== activeIndex) showPhoto(safeIndex);
    fullscreenSwitcher?.goTo(safeIndex, behavior, false);
    return true;
  };
  const syncTrackActivePhoto = () => {
    scrollFrame = 0;
    const resolved = resolvePhotoGalleryActiveIndex({
      pendingIndex: pendingScrollIndex,
      scrollLeft: track.scrollLeft,
      trackWidth: track.clientWidth
    });
    pendingScrollIndex = resolved.pendingIndex;
    if (resolved.activeIndex !== activeIndex) showPhoto(resolved.activeIndex);
  };
  track.addEventListener("scroll", () => {
    suppressImageCloseUntil = Date.now() + 300;
    if (!scrollFrame) scrollFrame = requestAnimationFrame(syncTrackActivePhoto);
    if (lightboxSettleTimer !== null) clearTimeout(lightboxSettleTimer);
    lightboxSettleTimer = setTimeout(() => {
      lightboxSettleTimer = null;
      const snapIndex = resolvePhotoGallerySnapIndex({
        scrollLeft: track.scrollLeft,
        trackWidth: track.clientWidth,
        slideCount: entries.length
      });
      navigatePhoto(snapIndex);
    }, 160);
  }, { passive: true });
  track.addEventListener("pointerdown", () => {
    if (scale <= 1) pendingScrollIndex = null;
  }, { passive: true });
  lightboxDots.forEach((dot, dotIndex) => {
    dot.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      suppressImageCloseUntil = Date.now() + 450;
      navigatePhoto(dotIndex);
    });
  });
  const bindNavSwipe = (button) => {
    if (!button) return;
    let navStartX = 0;
    let navStartY = 0;
    let navStartScrollLeft = 0;
    let navMoved = false;
    button.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      pendingScrollIndex = null;
      navStartX = touch.clientX;
      navStartY = touch.clientY;
      navStartScrollLeft = track.scrollLeft;
      navMoved = false;
    }, { passive: true });
    button.addEventListener("touchmove", (event) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - navStartX;
      const dy = touch.clientY - navStartY;
      if (Math.hypot(dx, dy) <= PHOTO_GALLERY_TAP_MOVE_LIMIT_PX) return;
      if (Math.abs(dx) <= Math.abs(dy) * 0.55) return;
      navMoved = true;
      event.preventDefault();
      event.stopPropagation();
      track.scrollLeft = navStartScrollLeft - dx;
    }, { passive: false });
    button.addEventListener("touchend", (event) => {
      if (!navMoved || !event.changedTouches.length) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - navStartX;
      const baseIndex = resolvePhotoGallerySnapIndex({
        scrollLeft: navStartScrollLeft,
        trackWidth: track.clientWidth,
        slideCount: entries.length
      });
      suppressNavClickUntil = Date.now() + 500;
      suppressImageCloseUntil = Date.now() + 500;
      navigatePhoto(baseIndex + (dx < 0 ? 1 : -1));
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });
  };
  bindNavSwipe(prevButton);
  bindNavSwipe(nextButton);
  updateNavigation();
  bindImageInteractions = (targetImage) => {
    if (boundLightboxImages.has(targetImage)) return;
    boundLightboxImages.add(targetImage);
    const refreshAutoSize = () => {
      updatePhotoLightboxAutoSize(targetImage, overlay);
    };
    targetImage.addEventListener("load", refreshAutoSize);
    if (targetImage.complete) refreshAutoSize();
    targetImage.addEventListener("click", (event) => {
      if (Date.now() < suppressImageCloseUntil) {
        event.preventDefault();
        event.stopPropagation();
        moved = false;
        return;
      }
      if (moved) {
        moved = false;
        return;
      }
      event.preventDefault();
      close();
    });
    targetImage.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") return;
      if (pinching) return;
      cancelPanInertia();
      targetImage.setPointerCapture(event.pointerId);
      startX = event.clientX;
      startY = event.clientY;
      startPanX = panX;
      startPanY = panY;
      resetPanVelocity(event.clientX, event.clientY);
      moved = false;
    });
    targetImage.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      if (!targetImage.hasPointerCapture(event.pointerId)) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      measurePanVelocity(event.clientX, event.clientY);
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (scale <= 1) return;
      panX = startPanX + dx;
      panY = startPanY + dy;
      apply();
    });
    targetImage.addEventListener("pointerup", (event) => {
      if (event.pointerType === "touch") return;
      if (targetImage.hasPointerCapture(event.pointerId)) targetImage.releasePointerCapture(event.pointerId);
      measurePanVelocity(event.clientX, event.clientY);
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (scale <= 1 && Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        navigatePhoto(activeIndex + (dx < 0 ? 1 : -1));
      } else if (scale > 1 && moved) {
        startPanInertia();
      }
    });
    targetImage.addEventListener("pointercancel", (event) => {
      if (event.pointerType === "touch") return;
      if (targetImage.hasPointerCapture(event.pointerId)) targetImage.releasePointerCapture(event.pointerId);
      cancelPanInertia();
    });
  };
  lightboxImages.forEach(bindImageInteractions);
  lightboxResizeHandler = () => {
    updatePhotoLightboxAutoSize(image, overlay);
    resetTransform();
    fullscreenSwitcher?.goTo(activeIndex, "auto", false);
  };
  window.addEventListener("resize", lightboxResizeHandler);
  window.visualViewport?.addEventListener?.("resize", lightboxResizeHandler);
  showPhoto(initialIndex, { force: true });
  requestAnimationFrame(() => {
    fullscreenSwitcher?.goTo(initialIndex, "auto", false);
  });
  overlay.addEventListener("wheel", (event) => {
    event.preventDefault();
    cancelPanInertia();
    const delta = event.deltaY < 0 ? 0.18 : -0.18;
    scale = Math.max(1, Math.min(4, scale + delta));
    if (scale === 1) {
      panX = 0;
      panY = 0;
    }
    apply();
  }, { passive: false });
  let pinchDistance = 0;
  let pinchScale = 1;
  overlay.addEventListener("touchstart", (event) => {
    cancelPanInertia();
    if (isPhotoLightboxControlTarget(event.target)) return;
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      pinching = false;
      touchStartedWithPinch = false;
      pinchDistance = 0;
      startX = touch.clientX;
      startY = touch.clientY;
      startPanX = panX;
      startPanY = panY;
      touchStartScrollLeft = track.scrollLeft;
      touchStartTime = Date.now();
      resetPanVelocity(touch.clientX, touch.clientY);
      moved = false;
      return;
    }
    if (event.touches.length !== 2) return;
    event.preventDefault();
    cancelPanInertia();
    const center = touchCenter(event.touches[0], event.touches[1]);
    pinching = true;
    touchStartedWithPinch = true;
    pinchDistance = touchDistance(event.touches[0], event.touches[1]);
    pinchScale = scale;
    startX = center.x;
    startY = center.y;
    startPanX = panX;
    startPanY = panY;
    moved = true;
  }, { passive: false });
  overlay.addEventListener("touchmove", (event) => {
    if (isPhotoLightboxControlTarget(event.target)) return;
    if (event.touches.length === 1) {
      if (pinching) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      measurePanVelocity(touch.clientX, touch.clientY);
      if (Math.hypot(dx, dy) > PHOTO_GALLERY_TAP_MOVE_LIMIT_PX) moved = true;
      if (scale <= 1) return;
      event.preventDefault();
      panX = startPanX + dx;
      panY = startPanY + dy;
      apply();
      return;
    }
    if (event.touches.length !== 2 || !pinchDistance) return;
    event.preventDefault();
    cancelPanInertia();
    const center = touchCenter(event.touches[0], event.touches[1]);
    const nextDistance = touchDistance(event.touches[0], event.touches[1]);
    scale = Math.max(1, Math.min(4, pinchScale * (nextDistance / pinchDistance)));
    if (scale === 1) {
      panX = 0;
      panY = 0;
    } else {
      panX = startPanX + (center.x - startX);
      panY = startPanY + (center.y - startY);
    }
    apply();
  }, { passive: false });
  overlay.addEventListener("touchend", (event) => {
    if (isPhotoLightboxControlTarget(event.target)) return;
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      pinching = false;
      pinchDistance = 0;
      startX = touch.clientX;
      startY = touch.clientY;
      startPanX = panX;
      startPanY = panY;
      resetPanVelocity(touch.clientX, touch.clientY);
      return;
    }
    if (!touchStartedWithPinch && !moved && scale <= 1 && event.changedTouches.length) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (!touchStartedWithPinch && moved && scale <= 1 && event.changedTouches.length) {
      const touch = event.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const minDistance = Math.min(36, Math.max(18, (track.clientWidth || 1) * 0.06));
      const fastEnough = Date.now() - touchStartTime <= 1000;
      if (fastEnough && Math.abs(dx) >= minDistance && Math.abs(dx) > Math.abs(dy) * 0.55) {
        const baseIndex = resolvePhotoGallerySnapIndex({
          scrollLeft: touchStartScrollLeft,
          trackWidth: track.clientWidth,
          slideCount: entries.length
        });
        suppressImageCloseUntil = Date.now() + 500;
        navigatePhoto(baseIndex + (dx < 0 ? 1 : -1));
        event.preventDefault();
        event.stopPropagation();
      }
    }
    if (!touchStartedWithPinch && moved && scale > 1 && event.changedTouches.length) {
      const touch = event.changedTouches[0];
      measurePanVelocity(touch.clientX, touch.clientY);
      startPanInertia();
    }
    pinchDistance = 0;
    pinching = false;
    touchStartedWithPinch = false;
  }, { passive: false });
  overlay.addEventListener("touchcancel", () => {
    cancelPanInertia();
    pinchDistance = 0;
    pinching = false;
    touchStartedWithPinch = false;
  }, { passive: true });
  lightboxKeydownHandler = (event) => {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigatePhoto(activeIndex - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      navigatePhoto(activeIndex + 1);
    }
  };
  document.addEventListener("keydown", lightboxKeydownHandler);
}

function photoLightboxEntry(image) {
  const previewSrc = image.currentSrc || image.src || "";
  const fullSrc = image.dataset.photoFullSrc || previewSrc;
  const verifiedFullSrc = image.dataset.photoVerifiedFullSrc || "";
  return {
    image,
    localId: image.dataset.photoLocalSourceId || image.dataset.photoLocalId || "",
    previewSrc,
    fullSrc,
    verifiedFullSrc,
    remoteFullSrc: image.dataset.photoRemoteFullSrc || "",
    remoteThumbSrc: image.dataset.photoRemoteThumbSrc || "",
    sourceSignature: image.dataset.photoSourceSignature || "",
    width: Math.max(0, Number(image.dataset.photoWidth) || 0),
    height: Math.max(0, Number(image.dataset.photoHeight) || 0),
    hasExplicitFullSrc: Boolean(image.dataset.photoFullSrc),
    resolvedFullSrc: decodedPhotoLightboxSources.has(fullSrc) ? fullSrc : ""
  };
}

function photoLightboxEntries(sourceImage, { gallery = null, index = -1 } = {}) {
  const sourceGallery = gallery || sourceImage.closest("[data-photo-gallery]");
  const images = sourceGallery
    ? [...sourceGallery.querySelectorAll("[data-photo-open] img")]
    : [sourceImage];
  const entries = images.map(photoLightboxEntry)
    .filter((entry) => entry.localId || entry.previewSrc || entry.fullSrc);
  const sourceEntryIndex = entries.findIndex((entry) => entry.image === sourceImage);
  const sourceIndex = sourceEntryIndex >= 0
    ? sourceEntryIndex
    : index;
  return {
    entries: entries.length ? entries : [photoLightboxEntry(sourceImage)],
    activeIndex: Math.max(0, Math.min(Math.max(0, entries.length - 1), sourceIndex))
  };
}

export async function resolvePhotoLightboxSource(entry, {
  getCachedPhotoForLightbox = getCachedPhoto,
  putCachedPhotoForLightbox = putCachedPhoto,
  fetchImpl = globalThis.fetch,
  createObjectUrl = (blob) => URL.createObjectURL(blob),
  onCachedRecord = () => "",
  onDownloadProgress = () => {},
  signal = null
} = {}) {
  if (!entry) return { src: "", objectUrl: "", isFull: false, reason: "unavailable" };
  const previewSrc = entry.previewSrc || "";
  const fullSrc = entry.fullSrc || "";
  const remoteFullSrc = entry.remoteFullSrc || (isRemotePhotoLightboxSource(fullSrc) ? fullSrc : "");
  const remoteThumbSrc = entry.remoteThumbSrc || (isRemotePhotoLightboxSource(previewSrc) ? previewSrc : "");
  const sourceSignature = entry.sourceSignature || "";
  const hasRemoteFullSource = Boolean(remoteFullSrc);
  const hasSeparateFullSource = Boolean(fullSrc && fullSrc !== previewSrc);
  const registerCachedRecord = async (record) => {
    try {
      return String(await onCachedRecord(record) || "");
    } catch {
      return "";
    }
  };
  let cached = null;
  let cachedSourceMatches = false;
  if (entry.localId) {
    cached = await getCachedPhotoForLightbox(entry.localId).catch(() => null);
    cachedSourceMatches = !hasRemoteFullSource || Boolean(
      sourceSignature && cached?.sourceSignature === sourceSignature
    );
    const cachedFullIsUsable = cached?.blob && (
      (cached.fullBlobVerified === true && cachedSourceMatches)
      || (cached.fullBlobVerified !== false && !hasSeparateFullSource && !hasRemoteFullSource)
    );
    if (cachedFullIsUsable) {
      const registeredSrc = await registerCachedRecord(cached);
      const objectUrl = registeredSrc ? "" : createObjectUrl(cached.blob);
      return { src: registeredSrc || objectUrl, objectUrl, isFull: true };
    }
  }
  const fullFetchSrc = remoteFullSrc || fullSrc;
  if (fullFetchSrc && (hasRemoteFullSource || hasSeparateFullSource) && typeof fetchImpl === "function") {
    const previewFetchSrc = remoteThumbSrc
      || (isRemotePhotoLightboxSource(previewSrc) ? previewSrc : "");
    const previewBlobPromise = cachedSourceMatches && cached?.thumbBlob
      ? Promise.resolve(cached.thumbBlob)
      : previewFetchSrc && previewFetchSrc !== fullFetchSrc
        ? fetchPhotoLightboxBlob(previewFetchSrc, fetchImpl, signal, (progress) => {
          onDownloadProgress({ variant: "preview", ...progress });
        })
        : Promise.resolve(null);
    try {
      const fullBlob = await fetchPhotoLightboxBlob(fullFetchSrc, fetchImpl, signal, (progress) => {
        onDownloadProgress({ variant: "full", ...progress });
      });
      if (!fullBlob?.size) throw new Error("full-photo-empty");
      const comparisonThumbBlob = await previewBlobPromise;
      const fullBlobDistinct = await photoBlobsAreDistinct(fullBlob, comparisonThumbBlob);
      let verifiedRecord = null;
      if (entry.localId) {
        const savedAt = new Date().toISOString();
        verifiedRecord = await registerVerifiedPhotoRecord({
          key: entry.localId,
          namespace: "offline-remote",
          fullUrl: remoteFullSrc || fullSrc,
          thumbUrl: remoteThumbSrc || previewSrc,
          sourceSignature,
          fileName: cached?.fileName || `${entry.localId}.jpg`,
          type: fullBlob.type || cached?.type || "image/jpeg",
          width: cached?.width,
          height: cached?.height
        }, {
          fullBlob,
          previewBlob: comparisonThumbBlob
            || (cachedSourceMatches ? cached?.thumbBlob : null)
            || fullBlob,
          cachedRecord: cachedSourceMatches ? cached : null,
          fullBlobDistinct,
          recordPatch: {
            cachePurpose: "offline-remote",
            createdAt: cached?.createdAt || savedAt,
            updatedAt: savedAt
          },
          putCachedPhoto: async (record) => {
            try {
              await putCachedPhotoForLightbox(record);
            } catch {
              // The downloaded full-size blob can still be displayed for this lightbox session.
            }
          },
          now: () => savedAt
        });
      }
      const registeredSrc = verifiedRecord ? await registerCachedRecord(verifiedRecord) : "";
      const objectUrl = registeredSrc ? "" : createObjectUrl(fullBlob);
      return { src: registeredSrc || objectUrl, objectUrl, isFull: true };
    } catch {
      const fallbackBlob = cachedSourceMatches
        ? (cached?.thumbBlob || (cached?.fullBlobVerified !== true ? cached?.blob : null))
        : null;
      if (fallbackBlob) {
        const objectUrl = createObjectUrl(fallbackBlob);
        return { src: objectUrl, objectUrl, isFull: false, reason: "cached-preview" };
      }
      return {
        src: previewSrc || fullSrc,
        objectUrl: "",
        isFull: false,
        reason: "cached-preview"
      };
    }
  }
  return {
    src: fullSrc || previewSrc || "",
    objectUrl: "",
    isFull: false,
    reason: entry.hasExplicitFullSrc && fullSrc ? "unavailable" : "preview-only"
  };
}

function isRemotePhotoLightboxSource(src) {
  return /^https?:\/\//i.test(String(src || ""));
}

async function fetchPhotoLightboxBlob(src, fetchImpl, signal = null, onProgress = () => {}) {
  if (!src || typeof fetchImpl !== "function") return null;
  try {
    return await downloadPhotoBlob(src, {
      fetchImpl,
      signal,
      requestInit: {
        credentials: "include",
        cache: "no-store"
      },
      onProgress
    });
  } catch {
    return null;
  }
}

export function replacePhotoLightboxImageSource(currentImage, src, options = {}) {
  return replaceSharedFullscreenImageSource(currentImage, src, options);
}

function touchDistance(first, second) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function touchCenter(first, second) {
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2
  };
}

function bindPhotoLightboxNavButton(button, onClick) {
  if (!button) return;
  ["pointerdown", "pointerup", "touchstart", "touchend"].forEach((eventName) => {
    button.addEventListener(eventName, (event) => {
      event.stopPropagation();
    }, { passive: true });
  });
  button.addEventListener("click", onClick);
}

function isPhotoLightboxControlTarget(target) {
  return Boolean(target?.closest?.(".photo-lightbox-nav, .photo-lightbox-close, .photo-lightbox-dots"));
}

function closePhotoLightboxOnEscape(event) {
  if (event.key === "Escape") closePhotoLightbox();
}

export function closePhotoLightbox({ preserveOpenRequest = false } = {}) {
  if (!preserveOpenRequest) lightboxOpenRequestId += 1;
  lightboxInertiaCancel?.();
  lightboxInertiaCancel = null;
  lightboxSourceLifecycleCleanup?.();
  lightboxSourceLifecycleCleanup = null;
  const overlay = document.querySelector(".photo-lightbox");
  if (overlay?.open && typeof overlay.close === "function") overlay.close();
  overlay?.remove();
  document.body.classList.remove("photo-lightbox-open");
  lightboxObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  lightboxObjectUrls = new Set();
  lightboxLoadingNotice?.cancel();
  lightboxLoadingNotice = null;
  if (lightboxResizeHandler) {
    window.removeEventListener("resize", lightboxResizeHandler);
    window.visualViewport?.removeEventListener?.("resize", lightboxResizeHandler);
  }
  lightboxResizeHandler = null;
  if (lightboxKeydownHandler) document.removeEventListener("keydown", lightboxKeydownHandler);
  lightboxKeydownHandler = null;
  document.removeEventListener("keydown", closePhotoLightboxOnEscape);
}
