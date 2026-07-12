import { escapeHtml } from "../utils/html.js";

export function photoOrderIdentity(photo) {
  return String(photo?.id || photo?.localId || "").trim();
}

export function moveOrderedPhoto(photos, fromIndex, toIndex, { preservePrimary = true } = {}) {
  const list = Array.isArray(photos) ? [...photos] : [];
  const minIndex = preservePrimary && list.length ? 1 : 0;
  const from = Math.max(minIndex, Math.min(Number(fromIndex) || 0, list.length - 1));
  const to = Math.max(minIndex, Math.min(Number(toIndex) || 0, list.length - 1));
  if (!list.length || from === to) return { photos: list, changed: false, activeIndex: from };
  const [photo] = list.splice(from, 1);
  list.splice(to, 0, photo);
  return { photos: list, changed: true, activeIndex: to };
}

export function renderPhotoOrderRows(photos, {
  language = "ru",
  previewSources = new Map()
} = {}) {
  const en = language === "en";
  const list = Array.isArray(photos) ? photos : [];
  const renderRow = (photo, index) => {
    const id = photoOrderIdentity(photo);
    const src = previewSources.get(id) || photo?.thumbUrl || photo?.url || "";
    const primary = index === 0;
    return `
      <div class="photo-order-row layout-order-row ${primary ? "photo-order-primary" : ""}" data-photo-order-index="${index}" ${primary ? "" : `data-layout-order-id="${escapeHtml(id)}" data-layout-order-section="photos"`}>
        <button type="button" class="photo-order-handle layout-order-handle" ${primary ? "disabled" : ""} aria-label="${en ? "Drag to reorder" : "Перетащить для сортировки"}">↕</button>
        <span class="photo-order-thumb">${src ? `<img src="${escapeHtml(src)}" alt="">` : `<span>${index + 1}</span>`}</span>
        <span class="photo-order-label"><strong>${en ? `Photo ${index + 1}` : `Фото ${index + 1}`}</strong>${primary ? `<small>${en ? "Primary photo" : "Главное фото"}</small>` : ""}</span>
        <span class="photo-order-buttons layout-order-row-actions">
          <button type="button" class="ghost" data-photo-order-up="${index}" ${index <= 1 ? "disabled" : ""} aria-label="${en ? "Move up" : "Переместить выше"}">↑</button>
          <button type="button" class="ghost" data-photo-order-down="${index}" ${primary || index >= list.length - 1 ? "disabled" : ""} aria-label="${en ? "Move down" : "Переместить ниже"}">↓</button>
        </span>
      </div>`;
  };
  if (!list.length) return "";
  return `${renderRow(list[0], 0)}<div class="photo-order-secondary-list layout-order-section-list" data-layout-order-section-list="photos">${list.slice(1).map((photo, offset) => renderRow(photo, offset + 1)).join("")}</div>`;
}
