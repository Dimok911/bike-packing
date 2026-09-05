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
  const fullWidth = Number(image.dataset?.photoWidth) || 0;
  const fullHeight = Number(image.dataset?.photoHeight) || 0;
  // A thumbnail and an empty slide must retain the original's known geometry.
  const useFullDimensions = fullWidth > 0 && fullHeight > 0
    && (image.dataset?.photoLightboxQuality !== "full" || !image.naturalWidth || !image.naturalHeight);
  const naturalWidth = useFullDimensions ? fullWidth : image.naturalWidth;
  const naturalHeight = useFullDimensions ? fullHeight : image.naturalHeight;
  // complete === true on an <img> without src does not mean it has loaded.
  // Keep sizing established before the first paint until dimensions are known.
  if (!(naturalWidth > 0 && naturalHeight > 0)) return { limitAutoUpscale: false, width: 0, height: 0 };
  const sizing = photoLightboxSizingPresentation({
    naturalWidth,
    naturalHeight,
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
