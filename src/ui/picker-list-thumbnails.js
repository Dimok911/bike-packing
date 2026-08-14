import { photoCacheSourceSignature } from "../sync/photo-cache-quality.js";
import { normalizeRemotePhotoUrl, photoRemoteSrc } from "../sync/photos.js";
import { escapeHtml } from "../utils/html.js";

export function pickerListPhotosEnabled(value) {
  return value === true;
}

export function pickerListThumbnailHtml(record, {
  enabled = false,
  photoObjectUrls = new Map()
} = {}) {
  if (!pickerListPhotosEnabled(enabled)) return "";
  const photo = Array.isArray(record?.photos) ? record.photos.find(Boolean) : null;
  if (!photo) return `<span class="picker-list-thumbnail empty" aria-hidden="true"></span>`;

  const localId = String(photo.localId || photo.id || "").trim();
  const remoteFullUrl = photo.url ? normalizeRemotePhotoUrl(photo.url) : "";
  const remoteThumbUrl = photo.thumbUrl ? normalizeRemotePhotoUrl(photo.thumbUrl) : remoteFullUrl;
  const sourceSignature = remoteFullUrl
    ? photoCacheSourceSignature(remoteFullUrl, remoteThumbUrl, photo.updatedAt || "")
    : "";
  const localSources = localId && typeof photoObjectUrls?.sources === "function"
    ? photoObjectUrls.sources(localId, sourceSignature)
    : null;
  const src = localSources?.preview || photoRemoteSrc(photo) || "";
  const hydrateAttr = localId ? ` data-photo-local-id="${escapeHtml(localId)}"` : "";
  const signatureAttr = sourceSignature ? ` data-photo-source-signature="${escapeHtml(sourceSignature)}"` : "";

  return `
    <span class="picker-list-thumbnail" aria-hidden="true">
      <img${src ? ` src="${escapeHtml(src)}"` : ""}${hydrateAttr}${signatureAttr} alt="" loading="lazy" />
    </span>
  `;
}

export function syncPickerListPhotoToggle(button, enabled, {
  showLabel = "Show photos",
  hideLabel = "Hide photos"
} = {}) {
  if (!button) return;
  const active = pickerListPhotosEnabled(enabled);
  const label = active ? hideLabel : showLabel;
  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute("aria-label", label);
  button.title = label;
  const text = button.querySelector("[data-picker-photo-toggle-label]");
  if (text) text.textContent = label;
}
