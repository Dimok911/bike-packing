function photoImageKey(image) {
  const localId = image?.dataset?.photoLocalSourceId || image?.dataset?.photoLocalId || "";
  if (localId) return `local:${localId}`;
  const fullSrc = image?.dataset?.photoFullSrc || "";
  if (fullSrc) return `full:${fullSrc}`;
  const src = image?.getAttribute?.("src") || image?.currentSrc || image?.src || "";
  return src ? `src:${src}` : "";
}

function galleryKey(gallery) {
  return [...(gallery?.querySelectorAll?.("[data-photo-open] img") || [])]
    .map(photoImageKey)
    .filter(Boolean)
    .join("|");
}

function appendToQueue(map, key, value) {
  if (!key) return;
  const queue = map.get(key) || [];
  queue.push(value);
  map.set(key, queue);
}

function takeFromQueue(map, key) {
  const queue = map.get(key);
  if (!queue?.length) return null;
  const value = queue.shift();
  if (!queue.length) map.delete(key);
  return value;
}

function loadedPhotoImage(image) {
  return Boolean(image?.complete && Number(image?.naturalWidth) > 0);
}

function activeGalleryIndex(gallery) {
  const track = gallery?.querySelector?.(".photo-gallery-track");
  const width = Number(track?.clientWidth) || 0;
  if (width > 0) return Math.max(0, Math.round((Number(track?.scrollLeft) || 0) / width));
  const dots = [...(gallery?.querySelectorAll?.(".photo-gallery-dot") || [])];
  return Math.max(0, dots.findIndex((dot) => dot.classList?.contains?.("active")));
}

function syncPreservedImageAttributes(image, replacement) {
  ["alt", "data-photo-full-src", "data-photo-local-source-id", "loading"].forEach((name) => {
    const value = replacement?.getAttribute?.(name);
    if (value == null) image.removeAttribute?.(name);
    else image.setAttribute?.(name, value);
  });
}

export function capturePackingPhotoRenderState(root) {
  const images = new Map();
  const galleries = new Map();
  [...(root?.querySelectorAll?.("[data-photo-gallery]") || [])].forEach((gallery) => {
    appendToQueue(galleries, galleryKey(gallery), activeGalleryIndex(gallery));
  });
  [...(root?.querySelectorAll?.("[data-photo-gallery] img") || [])].forEach((image) => {
    if (!loadedPhotoImage(image)) return;
    appendToQueue(images, photoImageKey(image), image);
  });
  return { galleries, images };
}

export function restorePackingPhotoRenderState(root, snapshot) {
  if (!root || !snapshot) return;
  [...(root.querySelectorAll?.("[data-photo-gallery]") || [])].forEach((gallery) => {
    const activeIndex = takeFromQueue(snapshot.galleries, galleryKey(gallery));
    if (activeIndex != null) gallery.dataset.photoInitialIndex = String(activeIndex);
  });
  [...(root.querySelectorAll?.("[data-photo-gallery] img") || [])].forEach((replacement) => {
    const image = takeFromQueue(snapshot.images, photoImageKey(replacement));
    if (!image || image === replacement) return;
    syncPreservedImageAttributes(image, replacement);
    replacement.replaceWith(image);
  });
}
