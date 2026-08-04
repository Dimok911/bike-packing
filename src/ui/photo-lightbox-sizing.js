import { resolveSharedFullscreenImagePresentation } from "./shared-photo-gallery.js";

export const PHOTO_LIGHTBOX_LOW_RESOLUTION_MAX_PIXELS = 1_000_000;

export function photoLightboxAutoSize({
  naturalWidth = 0,
  naturalHeight = 0,
  availableWidth = 0,
  availableHeight = 0,
  lowResolutionMaxPixels = PHOTO_LIGHTBOX_LOW_RESOLUTION_MAX_PIXELS
} = {}) {
  const presentation = resolveSharedFullscreenImagePresentation({
    naturalWidth,
    naturalHeight,
    availableWidth,
    availableHeight,
    preventUpscale: true,
    preventUpscaleMaxPixels: lowResolutionMaxPixels
  });
  const limitAutoUpscale = presentation.preventUpscale === true;
  return {
    limitAutoUpscale,
    width: limitAutoUpscale ? Math.round(presentation.width) : 0,
    height: limitAutoUpscale ? Math.round(presentation.height) : 0
  };
}

export function photoLightboxSizingPresentation(options = {}) {
  const sizing = photoLightboxAutoSize(options);
  return {
    ...sizing,
    className: sizing.limitAutoUpscale ? "photo-lightbox-image-no-upscale" : "",
    cssVariables: sizing.limitAutoUpscale
      ? {
          "--photo-lightbox-natural-width": `${sizing.width}px`,
          "--photo-lightbox-natural-height": `${sizing.height}px`
        }
      : {}
  };
}

export function updatePhotoLightboxAutoSize(image, viewport, {
  inset = 18,
  lowResolutionMaxPixels = PHOTO_LIGHTBOX_LOW_RESOLUTION_MAX_PIXELS
} = {}) {
  if (!image || !viewport) return { limitAutoUpscale: false, width: 0, height: 0 };
  const sizing = photoLightboxSizingPresentation({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    availableWidth: Math.max(0, Number(viewport.clientWidth) - inset),
    availableHeight: Math.max(0, Number(viewport.clientHeight) - inset),
    lowResolutionMaxPixels
  });
  image.classList?.toggle("photo-lightbox-image-no-upscale", sizing.limitAutoUpscale);
  if (sizing.limitAutoUpscale) {
    Object.entries(sizing.cssVariables).forEach(([name, value]) => image.style?.setProperty(name, value));
  } else {
    image.style?.removeProperty("--photo-lightbox-natural-width");
    image.style?.removeProperty("--photo-lightbox-natural-height");
  }
  return sizing;
}
