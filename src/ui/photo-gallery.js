import {
  getCachedPhoto,
  normalizeRemotePhotoUrl,
  photoRemoteSrc,
  versionedPhotoUrl
} from "../sync/photos.js";
import {
  normalizeItemPhotos,
  photoUploadBatchInfo,
  photoUploadBatchSummary
} from "../state/item-photos.js";
import { escapeHtml } from "../utils/html.js";
import { currentDocumentLanguage } from "../utils/language.js";

let lightboxObjectUrls = new Set();
let lightboxKeydownHandler = null;
let lightboxLoadingNotice = null;
const PHOTO_LIGHTBOX_LOADING_NOTICE_DELAY_MS = 450;
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
  const localSrc = localId ? photoObjectUrls.get(localId) : "";
  const remoteSrc = photoRemoteSrc(photo);
  const src = localSrc || remoteSrc || "";
  const fullSrc = photo.url ? versionedPhotoUrl(normalizeRemotePhotoUrl(photo.url), photo.updatedAt || photo.id || "") : remoteSrc;
  const localHydrateAttr = localId ? ` data-photo-local-id="${escapeHtml(localId)}" data-photo-local-source-id="${escapeHtml(localId)}"` : "";
  const fullAttr = fullSrc ? ` data-photo-full-src="${escapeHtml(fullSrc)}"` : "";
  return `
    <button class="photo-gallery-slide" type="button" data-photo-open>
      <img
        ${src ? `src="${escapeHtml(src)}"` : ""}
        ${localHydrateAttr}
        ${fullAttr}
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
    <div class="photo-gallery-dots" aria-hidden="true">
      ${Array.from({ length: count }, (_, index) => `<button class="photo-gallery-dot ${index === activeIndex ? "active" : ""}" type="button" data-photo-index="${index}" tabindex="-1"></button>`).join("")}
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
    <div class="item-photo ${pending ? "item-photo-pending" : ""}" data-photo-gallery>
      <div class="photo-gallery-track">
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
    <div class="item-photo ${className} ${uploadState.active ? "item-photo-pending" : ""}" data-photo-gallery data-photo-initial-index="${Math.max(0, Number(activeIndex) || 0)}">
      <div class="photo-gallery-track">
        ${slides.join("")}
      </div>
      ${renderPhotoDots(photos.length, activeIndex)}
      ${statusText ? `<span data-photo-upload-status>${escapeHtml(statusText)}</span>` : ""}
    </div>
  `;
}

async function renderPhotoPreviewSlide(photo, objectUrls = [], { uploadState = null } = {}) {
  const cached = await getCachedPhoto(photo.localId || photo.id);
  const blob = cached?.thumbBlob || cached?.blob;
  const fullBlob = cached?.blob || cached?.thumbBlob;
  const localSrc = blob ? URL.createObjectURL(blob) : "";
  const fullLocalSrc = fullBlob && fullBlob !== blob ? URL.createObjectURL(fullBlob) : localSrc;
  if (localSrc) objectUrls.push(localSrc);
  if (fullLocalSrc && fullLocalSrc !== localSrc) objectUrls.push(fullLocalSrc);
  const remoteSrc = photoRemoteSrc(photo);
  const fullSrc = fullLocalSrc || (photo.url ? versionedPhotoUrl(normalizeRemotePhotoUrl(photo.url), photo.updatedAt || photo.id || "") : remoteSrc);
  const src = localSrc || remoteSrc || "";
  const localId = photo.localId || photo.id || "";
  return `
    <button class="photo-gallery-slide" type="button" data-photo-open>
      <img
        ${src ? `src="${escapeHtml(src)}"` : ""}
        ${fullSrc ? `data-photo-full-src="${escapeHtml(fullSrc)}"` : ""}
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
    const existingUrl = photoObjectUrls.get(localId);
    if (existingUrl) {
      image.src = existingUrl;
      image.removeAttribute("data-photo-local-id");
      return;
    }
    const cached = await getCachedPhoto(localId);
    const blob = cached?.thumbBlob || cached?.blob;
    if (!blob) return;
    image.src = getPhotoObjectUrl(localId, blob, photoObjectUrls);
    image.removeAttribute("data-photo-local-id");
  }));
}

function getPhotoObjectUrl(id, blob, photoObjectUrls) {
  if (photoObjectUrls.has(id)) return photoObjectUrls.get(id);
  const url = URL.createObjectURL(blob);
  photoObjectUrls.set(id, url);
  return url;
}

export function bindPhotoGalleries(root = document, {
  onItemPreviewActive = () => {},
  onRootContainerPreviewActive = () => {},
  openLightbox = openPhotoLightbox
} = {}) {
  root.querySelectorAll("[data-photo-gallery]").forEach((gallery) => {
    if (gallery.dataset.photoGalleryBound === "true") return;
    gallery.dataset.photoGalleryBound = "true";
    const track = gallery.querySelector(".photo-gallery-track");
    const dots = [...gallery.querySelectorAll(".photo-gallery-dot")];
    if (!track) return;
    const slideButtons = [...gallery.querySelectorAll("[data-photo-open]")];
    const slideCount = Math.max(slideButtons.length, dots.length, 1);
    let suppressSlideClickUntil = 0;
    const clampIndex = (index) => Math.max(0, Math.min(slideCount - 1, Number(index) || 0));
    const setActive = (index) => {
      const safeIndex = clampIndex(index);
      dots.forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === safeIndex));
      if (gallery.closest("#itemPhotoPreview")) onItemPreviewActive(safeIndex);
      if (gallery.closest("#rootContainerPhotoPreview")) onRootContainerPreviewActive(safeIndex);
    };
    const scrollToIndex = (index, behavior = "smooth") => {
      const safeIndex = clampIndex(index);
      track.scrollTo({ left: track.clientWidth * safeIndex, behavior });
      setActive(safeIndex);
    };
    const syncActive = () => {
      const width = track.clientWidth || 1;
      setActive(Math.round(track.scrollLeft / width));
    };
    dots.forEach((dot, index) => {
      dot.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        scrollToIndex(index);
      });
    });
    track.addEventListener("scroll", () => requestAnimationFrame(syncActive), { passive: true });
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartScrollLeft = 0;
    let touchStartTime = 0;
    let touchTracking = false;
    track.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1 || slideCount <= 1) {
        touchTracking = false;
        return;
      }
      const touch = event.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartScrollLeft = track.scrollLeft;
      touchStartTime = Date.now();
      touchTracking = true;
    }, { passive: true });
    track.addEventListener("touchend", (event) => {
      if (!touchTracking || !event.changedTouches.length) return;
      touchTracking = false;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const minDistance = Math.min(54, Math.max(28, (track.clientWidth || 1) * 0.11));
      const fastEnough = Date.now() - touchStartTime <= 1100;
      if (fastEnough && absX >= minDistance && absX > absY * 0.55) {
        const width = track.clientWidth || 1;
        const baseIndex = Math.round(touchStartScrollLeft / width);
        const direction = dx < 0 ? 1 : -1;
        scrollToIndex(baseIndex + direction);
        suppressSlideClickUntil = Date.now() + 450;
        event.preventDefault();
        event.stopPropagation();
      }
    }, { passive: false });
    track.addEventListener("touchcancel", () => {
      touchTracking = false;
    }, { passive: true });
    slideButtons.forEach((button, index) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (Date.now() < suppressSlideClickUntil) return;
        const image = button.querySelector("img");
        if (image) openLightbox(image, { gallery, index });
      });
    });
    const initialIndex = Math.max(0, Math.min(Math.max(0, dots.length - 1), Number(gallery.dataset.photoInitialIndex || 0) || 0));
    if (initialIndex) requestAnimationFrame(() => track.scrollLeft = track.clientWidth * initialIndex);
    setActive(initialIndex);
  });
}

export async function openPhotoLightbox(sourceImage, { gallery = null, index = -1 } = {}) {
  const { entries, activeIndex: initialIndex } = photoLightboxEntries(sourceImage, { gallery, index });
  closePhotoLightbox();
  const initialEntry = entries[initialIndex];
  const initialPreviewSrc = initialEntry?.previewSrc || initialEntry?.fullSrc || "";
  if (!initialPreviewSrc) return;
  const overlay = document.createElement("dialog");
  overlay.className = "photo-lightbox";
  const hasNavigation = entries.length > 1;
  const closeLabel = escapeHtml(localText("Close", "Закрыть"));
  const previousLabel = escapeHtml(localText("Previous photo", "Предыдущее фото"));
  const nextLabel = escapeHtml(localText("Next photo", "Следующее фото"));
  const loadingFullLabel = escapeHtml(localText("Loading full-size photo…", "Загружается полная версия фото…"));
  overlay.innerHTML = `
    <button class="photo-lightbox-close" type="button" aria-label="${closeLabel}">×</button>
    ${hasNavigation ? `<button class="photo-lightbox-nav photo-lightbox-prev" type="button" aria-label="${previousLabel}"><span aria-hidden="true">‹</span></button>` : ""}
    <img class="photo-lightbox-image" src="${escapeHtml(initialPreviewSrc)}" alt="" />
    <div class="photo-lightbox-load-status" role="status" aria-live="polite" hidden>
      <span class="photo-lightbox-loading-spinner" aria-hidden="true"></span>
      <span data-photo-lightbox-status-text>${loadingFullLabel}</span>
    </div>
    ${hasNavigation ? `<button class="photo-lightbox-nav photo-lightbox-next" type="button" aria-label="${nextLabel}"><span aria-hidden="true">›</span></button>` : ""}
  `;
  document.body.append(overlay);
  if (typeof overlay.showModal === "function") {
    overlay.showModal();
  }
  document.body.classList.add("photo-lightbox-open");
  let image = overlay.querySelector(".photo-lightbox-image");
  const loadStatus = overlay.querySelector(".photo-lightbox-load-status");
  const loadStatusText = overlay.querySelector("[data-photo-lightbox-status-text]");
  const prevButton = overlay.querySelector(".photo-lightbox-prev");
  const nextButton = overlay.querySelector(".photo-lightbox-next");
  let loadingNotice = null;
  const close = () => closePhotoLightbox();
  overlay.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  overlay.querySelector(".photo-lightbox-close")?.addEventListener("click", close);
  let activeIndex = initialIndex;
  let renderToken = 0;
  let suppressImageCloseUntil = 0;
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let startX = 0;
  let startY = 0;
  let startPanX = 0;
  let startPanY = 0;
  let moved = false;
  let pinching = false;
  let touchStartedWithPinch = false;
  const resetTransform = () => {
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
  };
  const updateNavigation = () => {
    if (prevButton) prevButton.setAttribute("aria-disabled", activeIndex <= 0 ? "true" : "false");
    if (nextButton) nextButton.setAttribute("aria-disabled", activeIndex >= entries.length - 1 ? "true" : "false");
  };
  const updateLoadStatus = (state = "idle") => {
    if (!loadStatus || !loadStatusText) return;
    loadStatus.hidden = state === "idle";
    loadStatus.classList.toggle("photo-lightbox-load-error", ["error", "preview"].includes(state));
    loadStatusText.textContent = state === "preview"
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
  const activateNavigation = (event, direction) => {
    event.preventDefault();
    event.stopPropagation();
    suppressImageCloseUntil = Date.now() + 450;
    if (direction < 0 && activeIndex <= 0) return;
    if (direction > 0 && activeIndex >= entries.length - 1) return;
    showPhoto(activeIndex + direction);
  };
  bindPhotoLightboxNavButton(prevButton, (event) => activateNavigation(event, -1));
  bindPhotoLightboxNavButton(nextButton, (event) => activateNavigation(event, 1));
  let bindImageInteractions = () => {};
  const showPhoto = async (nextIndex, { force = false } = {}) => {
    if (nextIndex < 0 || nextIndex >= entries.length || (!force && nextIndex === activeIndex)) return false;
    const token = ++renderToken;
    loadingNotice.settle("idle");
    const entry = entries[nextIndex];
    const previewSrc = entry?.previewSrc || entry?.fullSrc || "";
    const readyFullSrc = entry?.resolvedFullSrc || "";
    const displaySrc = readyFullSrc || previewSrc;
    if (!previewSrc) return false;
    activeIndex = nextIndex;
    image.src = displaySrc;
    image.dataset.photoLightboxQuality = readyFullSrc ? "full" : "preview";
    updateNavigation();
    resetTransform();
    if (readyFullSrc) return true;
    const expectsFullSize = Boolean(
      entry.localId
      || (entry.fullSrc && entry.fullSrc !== previewSrc)
    );
    if (!expectsFullSize) {
      image.dataset.photoLightboxQuality = entry.fullSrc ? "full" : "preview";
      return true;
    }
    loadingNotice.pending();
    const next = await resolvePhotoLightboxSource(entry);
    if (token !== renderToken || !overlay.isConnected) {
      if (next.objectUrl) URL.revokeObjectURL(next.objectUrl);
      return false;
    }
    if (!next.src || !next.isFull) {
      if (next.objectUrl) URL.revokeObjectURL(next.objectUrl);
      loadingNotice.settle(next.reason === "preview-only" ? "preview" : "error");
      return true;
    }
    try {
      const currentImage = image;
      await replacePhotoLightboxImageSource(currentImage, next.src, {
        shouldCommit: () => token === renderToken && overlay.isConnected,
        onReplaced: (replacement) => {
          image = replacement;
          image.dataset.photoLightboxQuality = "full";
          bindImageInteractions(image);
        },
        onRollback: (restoredImage) => {
          image = restoredImage;
        }
      });
    } catch {
      if (next.objectUrl) URL.revokeObjectURL(next.objectUrl);
      if (token === renderToken && overlay.isConnected) loadingNotice.settle("error");
      return true;
    }
    entry.resolvedFullSrc = next.src;
    if (next.objectUrl) lightboxObjectUrls.add(next.objectUrl);
    else decodedPhotoLightboxSources.add(next.src);
    if (token !== renderToken || !overlay.isConnected) {
      if (next.objectUrl) URL.revokeObjectURL(next.objectUrl);
      return false;
    }
    loadingNotice.settle("idle");
    resetTransform();
    return true;
  };
  updateNavigation();
  bindImageInteractions = (targetImage) => {
    targetImage.addEventListener("click", (event) => {
      if (Date.now() < suppressImageCloseUntil) {
        event.preventDefault();
        event.stopPropagation();
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
      targetImage.setPointerCapture(event.pointerId);
      startX = event.clientX;
      startY = event.clientY;
      startPanX = panX;
      startPanY = panY;
      moved = false;
    });
    targetImage.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      if (!targetImage.hasPointerCapture(event.pointerId)) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (scale <= 1) return;
      panX = startPanX + dx;
      panY = startPanY + dy;
      apply();
    });
    targetImage.addEventListener("pointerup", (event) => {
      if (event.pointerType === "touch") return;
      if (targetImage.hasPointerCapture(event.pointerId)) targetImage.releasePointerCapture(event.pointerId);
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (scale <= 1 && Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        showPhoto(activeIndex + (dx < 0 ? 1 : -1));
      }
    });
    targetImage.addEventListener("pointercancel", (event) => {
      if (event.pointerType === "touch") return;
      if (targetImage.hasPointerCapture(event.pointerId)) targetImage.releasePointerCapture(event.pointerId);
    });
  };
  bindImageInteractions(image);
  showPhoto(initialIndex, { force: true });
  overlay.addEventListener("wheel", (event) => {
    event.preventDefault();
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
      moved = false;
      return;
    }
    if (event.touches.length !== 2) return;
    event.preventDefault();
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
      event.preventDefault();
      if (pinching) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (scale <= 1) return;
      panX = startPanX + dx;
      panY = startPanY + dy;
      apply();
      return;
    }
    if (event.touches.length !== 2 || !pinchDistance) return;
    event.preventDefault();
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
      return;
    }
    if (!touchStartedWithPinch && event.changedTouches.length) {
      const touch = event.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (scale <= 1 && Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        showPhoto(activeIndex + (dx < 0 ? 1 : -1));
      }
    }
    pinchDistance = 0;
    pinching = false;
    touchStartedWithPinch = false;
  }, { passive: true });
  overlay.addEventListener("touchcancel", () => {
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
      showPhoto(activeIndex - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showPhoto(activeIndex + 1);
    }
  };
  document.addEventListener("keydown", lightboxKeydownHandler);
}

function photoLightboxEntry(image) {
  const previewSrc = image.currentSrc || image.src || "";
  const fullSrc = image.dataset.photoFullSrc || previewSrc;
  return {
    image,
    localId: image.dataset.photoLocalSourceId || image.dataset.photoLocalId || "",
    previewSrc,
    fullSrc,
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

async function resolvePhotoLightboxSource(entry) {
  if (!entry) return { src: "", objectUrl: "", isFull: false, reason: "unavailable" };
  const previewSrc = entry.previewSrc || "";
  const fullSrc = entry.fullSrc || "";
  if (fullSrc && fullSrc !== previewSrc) {
    return { src: fullSrc, objectUrl: "", isFull: true };
  }
  if (entry.localId) {
    const cached = await getCachedPhoto(entry.localId).catch(() => null);
    if (cached?.blob) {
      const objectUrl = URL.createObjectURL(cached.blob);
      return { src: objectUrl, objectUrl, isFull: true };
    }
  }
  return {
    src: fullSrc || previewSrc,
    objectUrl: "",
    isFull: Boolean(entry.hasExplicitFullSrc && fullSrc),
    reason: entry.hasExplicitFullSrc && fullSrc ? "" : "preview-only"
  };
}

async function decodePhotoLightboxImage(image) {
  if (typeof image?.decode === "function") await image.decode();
  if ("complete" in image && image.complete !== true) {
    throw new Error("full-photo-not-complete");
  }
  if ("naturalWidth" in image && Number(image.naturalWidth) <= 0) {
    throw new Error("full-photo-decode-empty");
  }
  return image;
}

function loadAndDecodePhotoLightboxImage(image, src) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      image.removeEventListener?.("load", onLoad);
      image.removeEventListener?.("error", onError);
    };
    const finish = async () => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        await decodePhotoLightboxImage(image);
        resolve(image);
      } catch (error) {
        reject(error);
      }
    };
    const onLoad = () => finish();
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("full-photo-load-failed"));
    };
    image.addEventListener?.("load", onLoad, { once: true });
    image.addEventListener?.("error", onError, { once: true });
    image.src = src;
    if (image.complete) {
      if (!("naturalWidth" in image) || Number(image.naturalWidth) > 0) finish();
      else onError();
    }
  });
}

function afterPhotoLightboxPaint() {
  if (typeof requestAnimationFrame !== "function") return Promise.resolve();
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function normalizedPhotoLightboxSource(src) {
  const value = String(src || "");
  if (!value) return "";
  try {
    return new URL(value, globalThis.document?.baseURI || "https://local.invalid/").href;
  } catch {
    return value;
  }
}

function photoLightboxImageUsesSource(image, src) {
  const expected = normalizedPhotoLightboxSource(src);
  const actual = normalizedPhotoLightboxSource(image?.currentSrc || image?.src || "");
  return Boolean(expected && actual === expected);
}

export async function replacePhotoLightboxImageSource(currentImage, src, {
  createReplacement = (image) => image.cloneNode(false),
  loadAndDecode = loadAndDecodePhotoLightboxImage,
  afterPaint = afterPhotoLightboxPaint,
  shouldCommit = () => true,
  onReplaced = () => {},
  onRollback = () => {}
} = {}) {
  if (!currentImage || !src) throw new Error("full-photo-replacement-missing");
  const replacement = createReplacement(currentImage);
  replacement.removeAttribute?.("src");
  replacement.removeAttribute?.("srcset");
  replacement.removeAttribute?.("sizes");
  replacement.removeAttribute?.("loading");
  replacement.decoding = "async";
  await loadAndDecode(replacement, src);
  if (!photoLightboxImageUsesSource(replacement, src)) {
    throw new Error("full-photo-source-not-selected");
  }
  if (!shouldCommit()) throw new Error("full-photo-replacement-superseded");
  currentImage.replaceWith(replacement);
  onReplaced(replacement);
  try {
    await afterPaint();
    if (!shouldCommit()) throw new Error("full-photo-replacement-superseded");
    await decodePhotoLightboxImage(replacement);
    if (!photoLightboxImageUsesSource(replacement, src)) {
      throw new Error("full-photo-source-not-visible");
    }
  } catch (error) {
    if (shouldCommit() && replacement.isConnected && !currentImage.isConnected) {
      replacement.replaceWith(currentImage);
      onRollback(currentImage);
    }
    throw error;
  }
  return replacement;
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
  return Boolean(target?.closest?.(".photo-lightbox-nav, .photo-lightbox-close"));
}

function closePhotoLightboxOnEscape(event) {
  if (event.key === "Escape") closePhotoLightbox();
}

export function closePhotoLightbox() {
  const overlay = document.querySelector(".photo-lightbox");
  if (overlay?.open && typeof overlay.close === "function") overlay.close();
  overlay?.remove();
  document.body.classList.remove("photo-lightbox-open");
  lightboxObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  lightboxObjectUrls = new Set();
  lightboxLoadingNotice?.cancel();
  lightboxLoadingNotice = null;
  if (lightboxKeydownHandler) document.removeEventListener("keydown", lightboxKeydownHandler);
  lightboxKeydownHandler = null;
  document.removeEventListener("keydown", closePhotoLightboxOnEscape);
}
