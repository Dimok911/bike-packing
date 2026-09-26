import { escapeHtml } from "../utils/html.js";
import { layoutMediaSnapshot } from "../state/layout-media.js";

const STORAGE_KEY = "bike-packing-layout-photo-view-v1";
const VIEWS = [
  ["strip", "А", "Photo strip", "Лента миниатюр"],
  ["hero", "Б", "Featured photo", "Первое фото крупнее"],
  ["grid", "В", "Photo grid", "Компактная сетка"],
  ["hidden", "—", "Hide photos", "Скрыть фотографии"]
];
export function layoutPhotoView() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return VIEWS.some(([key]) => key === value) ? value : "strip";
  } catch { return "strip"; }
}

export function setupLayoutPhotoViewControl(control, localText) {
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
  sync(layoutPhotoView());
  group.addEventListener("click", event => {
    const button = event.target.closest("[data-layout-photo-view]");
    if (!button) return;
    try { localStorage.setItem(STORAGE_KEY, button.dataset.layoutPhotoView); } catch { /* UI remains usable without storage. */ }
    sync(button.dataset.layoutPhotoView);
    document.dispatchEvent(new CustomEvent("layout-photo-view-change", { detail: button.dataset.layoutPhotoView }));
  });
  control.append(group);
}

export function createLayoutPhotoSummary({ host, renderGallery, bindGalleries, localText }) {
  let version = 0;
  let binding = null;
  let signature = "";
  let view = layoutPhotoView();
  document.addEventListener("layout-photo-view-change", event => {
    view = event.detail;
    host.dataset.photoView = view;
    host.hidden = view === "hidden" || !host.childElementCount;
  });
  return {
    async render(layout, visible) {
      const media = layoutMediaSnapshot(layout);
      const next = JSON.stringify([visible, layout?.id, media]);
      host.hidden = !visible || view === "hidden" || (!media.photos.length && !media.videoUrl);
      if (next === signature) return;
      signature = next;
      const token = ++version;
      binding?.destroy(); binding = null;
      host.replaceChildren();
      if (!visible || (!media.photos.length && !media.videoUrl)) return;
      const galleries = await Promise.all(media.photos.map(photo => renderGallery([photo], { className: "layout-summary-thumbnail" })));
      if (token !== version) return;
      host.dataset.photoView = view;
      host.innerHTML = `<header class="layout-photo-summary-heading"><strong>${escapeHtml(localText("Layout photos", "Фото укладки"))}${media.photos.length ? ` · ${media.photos.length}` : ""}</strong>${media.videoUrl ? `<a href="${escapeHtml(media.videoUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localText("Watch video", "Смотреть видео"))} ↗</a>` : ""}</header>
        <div class="layout-photo-summary-list">${media.photos.map((photo, index) => `<figure>${galleries[index]}${photo.caption ? `<figcaption title="${escapeHtml(photo.caption)}">${escapeHtml(photo.caption)}</figcaption>` : ""}</figure>`).join("")}</div>`;
      host.querySelectorAll("[data-photo-open]").forEach((button, index) => {
        const caption = media.photos[index].caption || localText(`Open photo ${index + 1}`, `Открыть фото ${index + 1}`);
        button.setAttribute("aria-label", caption);
        button.querySelector("img").alt = caption;
      });
      binding = bindGalleries(host);
      host.hidden = view === "hidden";
    }
  };
}
