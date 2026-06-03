import {
  getCachedPhoto,
  normalizeRemotePhotoUrl,
  photoRemoteSrc,
  versionedPhotoUrl
} from "../sync/photos.js";
import { normalizeItemPhotos } from "../state/item-photos.js";
import { escapeHtml } from "../utils/html.js";

let lightboxObjectUrl = "";

export function renderPhotoSlide(photo, { photoObjectUrls = new Map() } = {}) {
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
  const slides = photos.map((photo) => renderPhotoSlide(photo, { photoObjectUrls })).join("");
  const dots = renderPhotoDots(photos.length);
  const uploadState = photoUploadState(photos);
  const pending = uploadState.active || photos.some((photo) => !photoRemoteSrc(photo) && ["error", "missing-local-file"].includes(photo.status));
  const statusText = pending ? photoStatusText(photos) : "";
  return `
    <div class="item-photo ${pending ? "item-photo-pending" : ""}" data-photo-gallery>
      <div class="photo-gallery-track">
        ${slides}
      </div>
      ${dots}
      ${renderPhotoUploadProgress(uploadState)}
      ${statusText ? `<span>${escapeHtml(statusText)}</span>` : ""}
    </div>
  `;
}

export async function renderPhotoGalleryHtml(photos, { objectUrls = [], activeIndex = 0, className = "" } = {}) {
  const slides = [];
  for (const photo of photos) {
    slides.push(await renderPhotoPreviewSlide(photo, objectUrls));
  }
  const uploadState = photoUploadState(photos);
  const statusText = uploadState.active ? photoStatusText(photos) : "";
  return `
    <div class="item-photo ${className} ${uploadState.active ? "item-photo-pending" : ""}" data-photo-gallery data-photo-initial-index="${Math.max(0, Number(activeIndex) || 0)}">
      <div class="photo-gallery-track">
        ${slides.join("")}
      </div>
      ${renderPhotoDots(photos.length, activeIndex)}
      ${renderPhotoUploadProgress(uploadState)}
      ${statusText ? `<span>${escapeHtml(statusText)}</span>` : ""}
    </div>
  `;
}

async function renderPhotoPreviewSlide(photo, objectUrls = []) {
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
    </button>
  `;
}

export function photoStatusText(photos) {
  const list = Array.isArray(photos) ? photos : [];
  if (!list.length) return "";
  if (list.some((photo) => photo.status === "error")) return "Ошибка загрузки фото";
  if (list.some((photo) => photo.status === "missing-local-file")) return "Нет локального файла фото";
  if (list.some((photo) => photo.status === "uploading")) return "Фото загружается";
  if (list.some((photo) => photo.status === "pending")) return "Ждём загрузки";
  return list.length > 1 ? `${list.length} фото загружено` : "Фото загружено";
}

function photoUploadState(photos) {
  const list = Array.isArray(photos) ? photos : [];
  const active = list.some((photo) => photo.status === "uploading" || (photo.status === "pending" && !photoRemoteSrc(photo)));
  if (!active) return { active: false, progress: 0 };
  const uploading = list.filter((photo) => photo.status === "uploading");
  const source = uploading.find((photo) => Number.isFinite(Number(photo.uploadProgress))) ||
    list.find((photo) => Number.isFinite(Number(photo.uploadProgress)));
  const hasProgress = Boolean(source);
  const progress = hasProgress ? Number(source.uploadProgress) : (uploading.length ? 8 : 0);
  return {
    active: true,
    indeterminate: !hasProgress && !uploading.length,
    progress: Math.max(0, Math.min(100, progress))
  };
}

function renderPhotoUploadProgress({ active = false, indeterminate = false, progress = 0 } = {}) {
  if (!active) return "";
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
    const setActive = (index) => {
      dots.forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === index));
      if (gallery.closest("#itemPhotoPreview")) onItemPreviewActive(index);
      if (gallery.closest("#rootContainerPhotoPreview")) onRootContainerPreviewActive(index);
    };
    const syncActive = () => {
      const width = track.clientWidth || 1;
      const index = Math.max(0, Math.min(dots.length - 1, Math.round(track.scrollLeft / width)));
      setActive(index);
    };
    dots.forEach((dot, index) => {
      dot.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        track.scrollTo({ left: track.clientWidth * index, behavior: "smooth" });
        setActive(index);
      });
    });
    track.addEventListener("scroll", () => requestAnimationFrame(syncActive), { passive: true });
    gallery.querySelectorAll("[data-photo-open]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const image = button.querySelector("img");
        if (image) openLightbox(image);
      });
    });
    const initialIndex = Math.max(0, Math.min(Math.max(0, dots.length - 1), Number(gallery.dataset.photoInitialIndex || 0) || 0));
    if (initialIndex) requestAnimationFrame(() => track.scrollLeft = track.clientWidth * initialIndex);
    setActive(initialIndex);
  });
}

export async function openPhotoLightbox(sourceImage) {
  const localId = sourceImage.dataset.photoLocalSourceId || sourceImage.dataset.photoLocalId || "";
  let src = sourceImage.dataset.photoFullSrc || sourceImage.currentSrc || sourceImage.src;
  closePhotoLightbox();
  if (localId) {
    const cached = await getCachedPhoto(localId);
    if (cached?.blob) {
      lightboxObjectUrl = URL.createObjectURL(cached.blob);
      src = lightboxObjectUrl;
    }
  }
  if (!src) return;
  const overlay = document.createElement("dialog");
  overlay.className = "photo-lightbox";
  overlay.innerHTML = `
    <button class="photo-lightbox-close" type="button" aria-label="Закрыть">×</button>
    <img class="photo-lightbox-image" src="${escapeHtml(src)}" alt="" />
  `;
  document.body.append(overlay);
  if (typeof overlay.showModal === "function") {
    overlay.showModal();
  }
  document.body.classList.add("photo-lightbox-open");
  const image = overlay.querySelector(".photo-lightbox-image");
  const close = () => closePhotoLightbox();
  overlay.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  overlay.querySelector(".photo-lightbox-close")?.addEventListener("click", close);
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let startX = 0;
  let startY = 0;
  let startPanX = 0;
  let startPanY = 0;
  let moved = false;
  const apply = () => {
    image.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
  };
  image.addEventListener("click", (event) => {
    if (moved) {
      moved = false;
      return;
    }
    event.preventDefault();
    close();
  });
  image.addEventListener("pointerdown", (event) => {
    image.setPointerCapture(event.pointerId);
    startX = event.clientX;
    startY = event.clientY;
    startPanX = panX;
    startPanY = panY;
    moved = false;
  });
  image.addEventListener("pointermove", (event) => {
    if (!image.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    panX = startPanX + dx;
    panY = startPanY + dy;
    apply();
  });
  image.addEventListener("pointerup", (event) => {
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
    if (event.touches.length !== 2) return;
    pinchDistance = touchDistance(event.touches[0], event.touches[1]);
    pinchScale = scale;
  }, { passive: true });
  overlay.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 2 || !pinchDistance) return;
    event.preventDefault();
    const nextDistance = touchDistance(event.touches[0], event.touches[1]);
    scale = Math.max(1, Math.min(4, pinchScale * (nextDistance / pinchDistance)));
    if (scale === 1) {
      panX = 0;
      panY = 0;
    }
    apply();
  }, { passive: false });
  document.addEventListener("keydown", closePhotoLightboxOnEscape);
}

function touchDistance(first, second) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
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
  document.removeEventListener("keydown", closePhotoLightboxOnEscape);
}
