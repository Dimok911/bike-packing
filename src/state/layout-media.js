import { normalizeItemPhotos } from "./item-photos.js";

export function hasLayoutMedia(layout) {
  return Boolean(layout?.trips?.length || (Array.isArray(layout?.photos) && layout.photos.length) || layoutVideoUrls(layout).length);
}

export function normalizeLayoutVideoUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function layoutVideoUrls(media) {
  const values = Array.isArray(media?.videoUrls) ? media.videoUrls : [media?.videoUrl];
  return values.map(normalizeLayoutVideoUrl).filter(Boolean);
}

export function layoutMediaSnapshot(layout) {
  const record = { photos: (Array.isArray(layout?.photos) ? layout.photos : []).filter((photo) => photo && typeof photo === "object").map((photo) => Object.defineProperties({}, Object.getOwnPropertyDescriptors(photo))) };
  return {
    photos: normalizeItemPhotos(record),
    videoUrl: layoutVideoUrls(layout)[0] || "",
    videoUrls: layoutVideoUrls(layout)
  };
}

export function layoutMediaSignature(media) {
  return JSON.stringify({
    photos: (media?.photos || []).map((photo) => [photo.localId || photo.id, photo.caption || ""]),
    videoUrls: (Array.isArray(media?.videoUrls) ? media.videoUrls : [media?.videoUrl]).map(value => String(value || "").trim()).filter(Boolean)
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
  if (next.videoUrls.length) layout.videoUrls = next.videoUrls;
  else delete layout.videoUrls;
  if (next.videoUrl) layout.videoUrl = next.videoUrl;
  else delete layout.videoUrl;
  return true;
}
