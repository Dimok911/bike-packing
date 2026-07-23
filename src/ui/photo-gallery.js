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

let lightboxObjectUrl = "";
let lightboxKeydownHandler = null;

function localText(en, ru) {
  return typeof document !== "undefined" && currentDocumentLanguage() === "en" ? en : ru;
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
  const initial = await resolvePhotoLightboxSource(entries[initialIndex]);
  if (!initial.src) return;
  lightboxObjectUrl = initial.objectUrl;
  const overlay = document.createElement("dialog");
  overlay.className = "photo-lightbox";
  const hasNavigation = entries.length > 1;
  const closeLabel = escapeHtml(localText("Close", "Закрыть"));
  const previousLabel = escapeHtml(localText("Previous photo", "Предыдущее фото"));
  const nextLabel = escapeHtml(localText("Next photo", "Следующее фото"));
  overlay.innerHTML = `
    <button class="photo-lightbox-close" type="button" aria-label="${closeLabel}">×</button>
    ${hasNavigation ? `<button class="photo-lightbox-nav photo-lightbox-prev" type="button" aria-label="${previousLabel}"><span aria-hidden="true">‹</span></button>` : ""}
    <img class="photo-lightbox-image" src="${escapeHtml(initial.src)}" alt="" />
    ${hasNavigation ? `<button class="photo-lightbox-nav photo-lightbox-next" type="button" aria-label="${nextLabel}"><span aria-hidden="true">›</span></button>` : ""}
  `;
  document.body.append(overlay);
  if (typeof overlay.showModal === "function") {
    overlay.showModal();
  }
  document.body.classList.add("photo-lightbox-open");
  const image = overlay.querySelector(".photo-lightbox-image");
  const prevButton = overlay.querySelector(".photo-lightbox-prev");
  const nextButton = overlay.querySelector(".photo-lightbox-next");
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
  const showPhoto = async (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= entries.length || nextIndex === activeIndex) return false;
    const token = ++renderToken;
    const next = await resolvePhotoLightboxSource(entries[nextIndex]);
    if (token !== renderToken) {
      if (next.objectUrl) URL.revokeObjectURL(next.objectUrl);
      return false;
    }
    if (!next.src) return false;
    if (lightboxObjectUrl) URL.revokeObjectURL(lightboxObjectUrl);
    lightboxObjectUrl = next.objectUrl;
    activeIndex = nextIndex;
    image.src = next.src;
    updateNavigation();
    resetTransform();
    return true;
  };
  updateNavigation();
  image.addEventListener("click", (event) => {
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
  image.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return;
    if (pinching) return;
    image.setPointerCapture(event.pointerId);
    startX = event.clientX;
    startY = event.clientY;
    startPanX = panX;
    startPanY = panY;
    moved = false;
  });
  image.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    if (!image.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    if (scale <= 1) return;
    panX = startPanX + dx;
    panY = startPanY + dy;
    apply();
  });
  image.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") return;
    if (image.hasPointerCapture(event.pointerId)) image.releasePointerCapture(event.pointerId);
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (scale <= 1 && Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      showPhoto(activeIndex + (dx < 0 ? 1 : -1));
    }
  });
  image.addEventListener("pointercancel", (event) => {
    if (event.pointerType === "touch") return;
    if (image.hasPointerCapture(event.pointerId)) image.releasePointerCapture(event.pointerId);
  });
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
      closePhotoLightbox();
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

function photoLightboxEntries(sourceImage, { gallery = null, index = -1 } = {}) {
  const sourceGallery = gallery || sourceImage.closest("[data-photo-gallery]");
  const images = sourceGallery
    ? [...sourceGallery.querySelectorAll("[data-photo-open] img")]
    : [sourceImage];
  const entries = images.map((image) => ({
    image,
    localId: image.dataset.photoLocalSourceId || image.dataset.photoLocalId || "",
    src: image.dataset.photoFullSrc || image.currentSrc || image.src || ""
  })).filter((entry) => entry.localId || entry.src);
  const sourceEntryIndex = entries.findIndex((entry) => entry.image === sourceImage);
  const sourceIndex = sourceEntryIndex >= 0
    ? sourceEntryIndex
    : index;
  return {
    entries: entries.length ? entries : [{
      image: sourceImage,
      localId: sourceImage.dataset.photoLocalSourceId || sourceImage.dataset.photoLocalId || "",
      src: sourceImage.dataset.photoFullSrc || sourceImage.currentSrc || sourceImage.src || ""
    }],
    activeIndex: Math.max(0, Math.min(Math.max(0, entries.length - 1), sourceIndex))
  };
}

async function resolvePhotoLightboxSource(entry) {
  if (!entry) return { src: "", objectUrl: "" };
  if (entry.localId) {
    const cached = await getCachedPhoto(entry.localId);
    if (cached?.blob) {
      const objectUrl = URL.createObjectURL(cached.blob);
      return { src: objectUrl, objectUrl };
    }
  }
  return { src: entry.src || "", objectUrl: "" };
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
  if (lightboxObjectUrl) URL.revokeObjectURL(lightboxObjectUrl);
  lightboxObjectUrl = "";
  if (lightboxKeydownHandler) document.removeEventListener("keydown", lightboxKeydownHandler);
  lightboxKeydownHandler = null;
  document.removeEventListener("keydown", closePhotoLightboxOnEscape);
}
