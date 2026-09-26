import { normalizeItemPhotos } from "./item-photos.js";

export function hasLayoutMedia(layout) {
  return Boolean((Array.isArray(layout?.photos) && layout.photos.length) || normalizeLayoutVideoUrl(layout?.videoUrl));
}

export function normalizeLayoutVideoUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function layoutMediaSnapshot(layout) {
  const record = { photos: (Array.isArray(layout?.photos) ? layout.photos : []).filter((photo) => photo && typeof photo === "object").map((photo) => ({ ...photo })) };
  return {
    photos: normalizeItemPhotos(record),
    videoUrl: normalizeLayoutVideoUrl(layout?.videoUrl)
  };
}

export function layoutMediaSignature(media) {
  return JSON.stringify({
    photos: (media?.photos || []).map((photo) => [photo.localId || photo.id, photo.caption || ""]),
    videoUrl: String(media?.videoUrl || "").trim()
  });
}

export function applyLayoutMedia(layout, media) {
  if (layoutMediaSignature(layout) === layoutMediaSignature(media)) return false;
  const next = layoutMediaSnapshot(media);
  // Uploads may finish while the editor is open. Keep the current transport
  // metadata while applying only the user's caption and ordering changes.
  next.photos = next.photos.map((photo) => {
    const live = (layout.photos || []).find((candidate) =>
      candidate.id === photo.id || (photo.localId && candidate.localId === photo.localId));
    return live ? { ...live, caption: photo.caption || "" } : photo;
  });
  if (next.photos.length) layout.photos = next.photos;
  else delete layout.photos;
  if (next.videoUrl) layout.videoUrl = next.videoUrl;
  else delete layout.videoUrl;
  return true;
}
