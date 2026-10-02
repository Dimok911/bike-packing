import { bindTripMediaScroll } from "./trip-media-scroll.js";
import { renderTripTrackMap, bindTripTrackMap } from "./trip-track-map.js";
import { tripTracks } from "../state/trip-track.js";
import { updatePhotoGallerySources, updatePhotoGalleryUploadProgress } from "./photo-gallery.js";
import { setupTripBackdropControls, applyTripBackdropSettings } from "./trip-backdrop-controls.js";
import { escapeHtml } from "../utils/html.js";
import { layoutMediaSnapshot } from "../state/layout-media.js";
import { renderTripVideoCards, bindTripVideoCards } from "./trip-video-cards.js";

const STORAGE_KEY = "bike-packing-layout-photo-view-v1";
const VIEWS = [
  ["strip", "А", "Photo strip", "Лента миниатюр"],
  ["hero", "Б", "Featured photo", "Первое фото крупнее"],
  ["grid", "В", "Compact photos", "Компактные фотографии"],
  ["hidden", "—", "Hide photos", "Скрыть фотографии"]
];
export function layoutPhotoView(canChoose = false) {
  if (!canChoose) return "grid";
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return VIEWS.some(([key]) => key === value) ? value : "grid";
  } catch { return "grid"; }
}

export function setupLayoutPhotoViewControl(control, localText, canChoose = () => false) {
  if (!control || control.querySelector(".layout-photo-view-control")) return;
  const group = document.createElement("span");
  group.className = "layout-photo-view-control";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", localText("Layout photos", "Фотографии укладки"));
  group.innerHTML = `<span>${escapeHtml(localText("Photos", "Фото"))}:</span>${VIEWS.map(([key, label, en, ru]) =>
    `<button type="button" class="admin-visual-option" data-layout-photo-view="${key}" ${key === "grid" ? 'data-visual-default="true"' : ""} title="${escapeHtml(localText(en, ru) + (key === "grid" ? localText(" · Default for everyone", " · По умолчанию для всех") : ""))}" aria-label="${escapeHtml(`${label}: ${localText(en, ru)}`)}">${label}</button>`
  ).join("")}`;
  const sync = (value) => group.querySelectorAll("button").forEach(button => {
    const active = button.dataset.layoutPhotoView === value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  sync(layoutPhotoView(canChoose()));
  group.addEventListener("click", event => {
    const button = event.target.closest("[data-layout-photo-view]");
    if (!button || !canChoose()) return;
    try { localStorage.setItem(STORAGE_KEY, button.dataset.layoutPhotoView); } catch { /* UI remains usable without storage. */ }
    sync(button.dataset.layoutPhotoView);
    document.dispatchEvent(new CustomEvent("layout-photo-view-change", { detail: button.dataset.layoutPhotoView }));
  });
  control.append(group);
  const syncBackdropControls = setupTripBackdropControls(control, localText, canChoose);
  control.syncLayoutIntroductionPreferences = () => { sync(layoutPhotoView(canChoose())); syncBackdropControls(); };
}

export function createLayoutPhotoSummary({ host, renderGallery, bindGalleries, localText, canChoose = () => false, onVisibilityChange = () => {} }) {
  let version = 0;
  let binding = null;
  let videoBinding = null;
  let scrollBinding = null;
  let mapBinding = null;
  let hasTrack = false;
  let hasPhotos = false;
  let hasVideos = false;
  let signature = "";
  let view = layoutPhotoView(canChoose());
  let isVisible = false;
  const card = host.closest(".layout-introduction");
  const backdrop = document.createElement("div");
  backdrop.className = "layout-trip-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  const backgroundPhoto = document.createElement("img");
  backgroundPhoto.alt = "";
  backdrop.append(backgroundPhoto);
  card?.prepend(backdrop);
  const applyBackdrop = () => applyTripBackdropSettings(card, canChoose());
  document.addEventListener("layout-trip-backdrop-change", applyBackdrop);
  applyBackdrop();
  const clearBackdrop = () => {
    backdrop.hidden = true;
    backgroundPhoto.removeAttribute("src");
  };
  const syncBackdrop = () => {
    const photo = host.querySelector("[data-photo-open] img");
    if (!isVisible || view === "hidden" || !photo?.complete || !photo.naturalWidth) {
      clearBackdrop();
      return;
    }
    // Reuse the already loaded thumbnail, including local/offline object URLs.
    // Decorative artwork never requests a separate full-resolution photograph.
    const source = photo.currentSrc || photo.src;
    if (backgroundPhoto.getAttribute("src") !== source) backgroundPhoto.src = source;
    backdrop.hidden = false;
  };
  host.addEventListener("load", syncBackdrop, true);
  host.addEventListener("error", syncBackdrop, true);
  const arrangeDescription = () => {
    const intro = host.parentElement;
    const description = intro.querySelector("#layoutDescriptionSummary");
    if (!description) return;
    intro.append(description);
  };
  document.addEventListener("layout-photo-view-change", event => {
    view = canChoose() ? event.detail : "grid";
    host.dataset.photoView = view;
    host.hidden = !isVisible || (!hasTrack && !hasVideos && (view === "hidden" || !hasPhotos));
    syncBackdrop();
    onVisibilityChange(isVisible);
  });
  return {
    async render(layout, visible) {
      isVisible = visible;
      applyBackdrop();
      view = layoutPhotoView(canChoose());
      host.dataset.photoView = view;
      arrangeDescription();
      const media = layoutMediaSnapshot(layout);
      const track = tripTracks(layout);
      hasTrack = Boolean(track.length);
      // Transport progress must not tear down decoded previews or reset scrolling.
      const next = JSON.stringify([visible, layout?.id, media.photos.map(photo => [photo.localId || photo.id, photo.caption || ""]), media.videoUrls, track]);
      hasPhotos = Boolean(media.photos.length);
      hasVideos = Boolean(media.videoUrls.length);
      host.hidden = !visible || (!hasTrack && !hasVideos && (view === "hidden" || !hasPhotos));
      onVisibilityChange(visible);
      if (next === signature) {
        const galleries = [...host.querySelectorAll('[data-photo-gallery]')];
        galleries.forEach((gallery, index) => {
          updatePhotoGallerySources(gallery, [media.photos[index]]);
          updatePhotoGalleryUploadProgress(gallery, [media.photos[index]]);
        });
        binding?.refresh?.();
        syncBackdrop(); return;
      }
      signature = next;
      clearBackdrop();
      const token = ++version;
      binding?.destroy(); binding = null;
      videoBinding?.destroy(); videoBinding = null;
      scrollBinding?.destroy(); scrollBinding = null;
      mapBinding?.destroy(); mapBinding = null;
      host.replaceChildren();
      if (!visible || (!hasTrack && !media.photos.length && !media.videoUrls.length)) return;
      const galleries = await Promise.all(media.photos.map(photo => renderGallery([photo], { className: "layout-summary-thumbnail" })));
      if (token !== version) return;
      host.dataset.photoView = view;
      host.innerHTML = `${hasPhotos ? `<div class="layout-summary-photos"><strong>${escapeHtml(localText("Photos", "Фото"))}</strong><div class="layout-photo-summary-list">${media.photos.map((photo, index) => `<figure>${galleries[index]}${photo.caption ? `<figcaption title="${escapeHtml(photo.caption)}">${escapeHtml(photo.caption)}</figcaption>` : ""}</figure>`).join("")}</div></div>` : ""}${renderTripVideoCards(media.videoUrls, localText)}${renderTripTrackMap(track, localText)}`;
      host.querySelectorAll("[data-photo-open]").forEach((button, index) => {
        const caption = media.photos[index].caption || localText(`Open photo ${index + 1}`, `Открыть фото ${index + 1}`);
        button.setAttribute("aria-label", caption);
        button.querySelector("img").alt = caption;

      });
      binding = bindGalleries(host);
      videoBinding = bindTripVideoCards(host, localText);
      scrollBinding = bindTripMediaScroll(host, localText);
      mapBinding = bindTripTrackMap(host, track, localText);
      syncBackdrop();
      host.hidden = !hasTrack && !hasVideos && view === "hidden";
      onVisibilityChange(visible);
    }
  };
}
