export const PHOTO_LIGHTBOX_LOW_RESOLUTION_MAX_PIXELS = 1_000_000;

export function photoLightboxAutoSize({
  naturalWidth = 0,
  naturalHeight = 0,
  availableWidth = 0,
  availableHeight = 0,
  lowResolutionMaxPixels = PHOTO_LIGHTBOX_LOW_RESOLUTION_MAX_PIXELS
} = {}) {
  const width = Math.max(0, Number(naturalWidth) || 0);
  const height = Math.max(0, Number(naturalHeight) || 0);
  const viewportWidth = Math.max(0, Number(availableWidth) || 0);
  const viewportHeight = Math.max(0, Number(availableHeight) || 0);
  if (!width || !height || !viewportWidth || !viewportHeight) {
    return { limitAutoUpscale: false, width: 0, height: 0 };
  }
  const sourcePixels = width * height;
  const fitScale = Math.min(viewportWidth / width, viewportHeight / height);
  const limitAutoUpscale = sourcePixels <= Math.max(0, Number(lowResolutionMaxPixels) || 0)
    && fitScale > 1;
  return {
    limitAutoUpscale,
    width: limitAutoUpscale ? Math.round(width) : 0,
    height: limitAutoUpscale ? Math.round(height) : 0
  };
}

export function updatePhotoLightboxAutoSize(image, viewport, {
  inset = 18,
  lowResolutionMaxPixels = PHOTO_LIGHTBOX_LOW_RESOLUTION_MAX_PIXELS
} = {}) {
  if (!image || !viewport) return { limitAutoUpscale: false, width: 0, height: 0 };
  const sizing = photoLightboxAutoSize({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    availableWidth: Math.max(0, Number(viewport.clientWidth) - inset),
    availableHeight: Math.max(0, Number(viewport.clientHeight) - inset),
    lowResolutionMaxPixels
  });
  image.classList?.toggle("photo-lightbox-image-no-upscale", sizing.limitAutoUpscale);
  if (sizing.limitAutoUpscale) {
    image.style?.setProperty("--photo-lightbox-natural-width", `${sizing.width}px`);
    image.style?.setProperty("--photo-lightbox-natural-height", `${sizing.height}px`);
  } else {
    image.style?.removeProperty("--photo-lightbox-natural-width");
    image.style?.removeProperty("--photo-lightbox-natural-height");
  }
  return sizing;
}
