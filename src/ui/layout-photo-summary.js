import { escapeHtml } from "../utils/html.js";
import { layoutMediaSnapshot } from "../state/layout-media.js";

const STORAGE_KEY = "bike-packing-layout-photo-view-v1";
const POSITION_KEY = "bike-packing-layout-description-position-v1";
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
    `<button type="button" class="admin-visual-option" data-layout-photo-view="${key}" title="${escapeHtml(localText(en, ru))}" aria-label="${escapeHtml(`${label}: ${localText(en, ru)}`)}">${label}</button>`
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
  const positionGroup = document.createElement("span");
  positionGroup.className = "layout-photo-view-control";
  positionGroup.setAttribute("role", "group");
  positionGroup.setAttribute("aria-label", localText("Description position", "Расположение описания"));
  positionGroup.innerHTML = `<span>${escapeHtml(localText("Description", "Описание"))}:</span>${[
    ["above", localText("Above photos", "Над фото")], ["below", localText("Below photos", "Под фото")]
  ].map(([key, label]) => `<button type="button" class="admin-visual-option" data-layout-description-position="${key}">${escapeHtml(label)}</button>`).join("")}`;
  const syncPosition = () => positionGroup.querySelectorAll("button").forEach(button => {
    const active = button.dataset.layoutDescriptionPosition === descriptionPosition(canChoose());
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  positionGroup.addEventListener("click", event => {
    const button = event.target.closest("[data-layout-description-position]");
    if (!button || !canChoose()) return;
    try { localStorage.setItem(POSITION_KEY, button.dataset.layoutDescriptionPosition); } catch { /* Optional preference. */ }
    syncPosition();
    document.dispatchEvent(new Event("layout-description-position-change"));
  });
  syncPosition();
  control.append(positionGroup);
  control.syncLayoutIntroductionPreferences = () => { sync(layoutPhotoView(canChoose())); syncPosition(); };
}

function descriptionPosition(canChoose) {
  if (canChoose) {
    try { if (localStorage.getItem(POSITION_KEY) === "above") return "above"; } catch { /* Default below photos. */ }
  }
  return "below";
}

export function createLayoutPhotoSummary({ host, renderGallery, bindGalleries, localText, canChoose = () => false, onVisibilityChange = () => {} }) {
  let version = 0;
  let binding = null;
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
    if (descriptionPosition(canChoose()) === "above") intro.insertBefore(description, host);
    else intro.append(description);
  };
  document.addEventListener("layout-description-position-change", arrangeDescription);
  document.addEventListener("layout-photo-view-change", event => {
    view = canChoose() ? event.detail : "grid";
    host.dataset.photoView = view;
    host.hidden = !isVisible || view === "hidden" || !host.childElementCount;
    syncBackdrop();
    onVisibilityChange(isVisible);
  });
  return {
    async render(layout, visible) {
      isVisible = visible;
      view = layoutPhotoView(canChoose());
      host.dataset.photoView = view;
      arrangeDescription();
      const media = layoutMediaSnapshot(layout);
      const next = JSON.stringify([visible, layout?.id, media]);
      host.hidden = !visible || view === "hidden" || (!media.photos.length && !media.videoUrls.length);
      onVisibilityChange(visible);
      if (next === signature) { syncBackdrop(); return; }
      signature = next;
      clearBackdrop();
      const token = ++version;
      binding?.destroy(); binding = null;
      host.replaceChildren();
      if (!visible || (!media.photos.length && !media.videoUrls.length)) return;
      const galleries = await Promise.all(media.photos.map(photo => renderGallery([photo], { className: "layout-summary-thumbnail" })));
      if (token !== version) return;
      host.dataset.photoView = view;
      host.innerHTML = `<header class="layout-photo-summary-heading"><strong>${escapeHtml(localText("Trip photos", "Фото поездки"))}${media.photos.length ? ` · ${media.photos.length}` : ""}</strong>${media.videoUrls.length ? `<div class="layout-summary-videos">${media.videoUrls.map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localText("Watch video", "Смотреть видео"))}${media.videoUrls.length > 1 ? ` ${index + 1}` : ""} ↗</a>`).join("")}</div>` : ""}</header>
        <div class="layout-photo-summary-list">${media.photos.map((photo, index) => `<figure>${galleries[index]}${photo.caption ? `<figcaption title="${escapeHtml(photo.caption)}">${escapeHtml(photo.caption)}</figcaption>` : ""}</figure>`).join("")}</div>`;
      host.querySelectorAll("[data-photo-open]").forEach((button, index) => {
        const caption = media.photos[index].caption || localText(`Open photo ${index + 1}`, `Открыть фото ${index + 1}`);
        button.setAttribute("aria-label", caption);
        button.querySelector("img").alt = caption;
      });
      binding = bindGalleries(host);
      syncBackdrop();
      host.hidden = view === "hidden";
      onVisibilityChange(visible);
    }
  };
}
