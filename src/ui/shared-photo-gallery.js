import "../vendor/vniipo-photo-gallery-fallback.js";

const CONTRACT_VERSION = 2;
const STABLE_URL = "https://vniipo-help.ru/shared-ui/photo-gallery/stable.js";
const bindings = new Set();
let stableLoadStarted = false;

const runtime = () => globalThis.VniipoPhotoGallery;
const fallbackRuntime = runtime();

const updateRuntimeLabel = () => {
  const api = runtime();
  if (!document.documentElement || !api) return;
  document.documentElement.dataset.photoGalleryVersion = api.version || "unknown";
};

const rebindAll = () => {
  const api = runtime();
  if (!api || api.contractVersion !== CONTRACT_VERSION) return;
  for (const binding of bindings) {
    binding.controller?.destroy();
    binding.controller = api.bindInlineGalleries(binding.root, binding.options);
  }
  updateRuntimeLabel();
};

export function loadSharedPhotoGallery() {
  if (stableLoadStarted || typeof document === "undefined") return;
  stableLoadStarted = true;
  const bucket = Math.floor(Date.now() / 3_600_000);
  const script = document.createElement("script");
  script.async = true;
  script.src = `${STABLE_URL}?contract=${CONTRACT_VERSION}&window=${bucket}`;
  script.dataset.sharedPhotoGallery = "stable";
  script.addEventListener("load", () => {
    if (runtime()?.contractVersion === CONTRACT_VERSION) rebindAll();
  }, { once: true });
  script.addEventListener("error", updateRuntimeLabel, { once: true });
  document.head.appendChild(script);
}

export function bindSharedPhotoGalleries(root, options = {}) {
  const binding = {
    root,
    options,
    controller: runtime()?.bindInlineGalleries(root, options)
  };
  bindings.add(binding);
  loadSharedPhotoGallery();
  return {
    refresh() {
      binding.controller?.refresh();
    },
    goTo(gallery, index, behavior = "smooth") {
      const galleryBinding = binding.controller?.bindings?.find?.((candidate) => candidate?.gallery === gallery);
      if (typeof galleryBinding?.goTo !== "function") return false;
      galleryBinding.goTo(index, behavior);
      return true;
    },
    destroy() {
      binding.controller?.destroy();
      bindings.delete(binding);
    }
  };
}

export function createSharedFullscreenSwitcher(options = {}) {
  const api = runtime();
  const factory = api?.capabilities?.fullscreenEdgeRubberBand >= 1
    ? api.createFullscreenSwitcher
    : fallbackRuntime?.createFullscreenSwitcher;
  const controller = factory?.(options) || null;
  if (
    controller
    && !fullscreenSwitcherMatchesRequestedMode(controller, options.directDesktop)
    && factory !== fallbackRuntime?.createFullscreenSwitcher
  ) {
    controller.destroy?.();
    return fallbackRuntime?.createFullscreenSwitcher?.(options) || null;
  }
  return controller;
}

export function fullscreenSwitcherMatchesRequestedMode(controller, directDesktop) {
  return typeof directDesktop !== "boolean"
    || controller?.directDesktop === directDesktop;
}

export function createSharedFullscreenSourceController(options = {}) {
  const factory = runtime()?.createFullscreenSourceController
    || fallbackRuntime?.createFullscreenSourceController;
  return factory?.(options) || null;
}

export function stepSharedPhotoInertia(options = {}) {
  const helper = runtime()?.helpers?.stepInertia || fallbackRuntime?.helpers?.stepInertia;
  return helper?.(options) || null;
}

export function resolveSharedFullscreenImagePresentation(options = {}) {
  const api = runtime()?.capabilities?.fullscreenImagePresentation >= 1
    ? runtime()
    : fallbackRuntime;
  return api?.helpers?.resolveFullscreenImagePresentation?.(options) || {
    known: false,
    preventUpscale: false,
    width: 0,
    height: 0
  };
}

export function sharedFullscreenImageUsesSource(image, src) {
  const helper = runtime()?.fullscreenImageUsesSource
    || fallbackRuntime?.fullscreenImageUsesSource;
  return helper?.(image, src) === true;
}

export function decodeSharedFullscreenImage(image, options = {}) {
  const helper = runtime()?.decodeFullscreenImage
    || fallbackRuntime?.decodeFullscreenImage;
  return helper?.(image, options) || Promise.reject(new Error("shared-fullscreen-decode-unavailable"));
}

export function loadAndDecodeSharedFullscreenImage(image, src, options = {}) {
  const helper = runtime()?.loadAndDecodeFullscreenImage
    || fallbackRuntime?.loadAndDecodeFullscreenImage;
  return helper?.(image, src, options)
    || Promise.reject(new Error("shared-fullscreen-load-unavailable"));
}

export function replaceSharedFullscreenImageSource(currentImage, src, options = {}) {
  const helper = runtime()?.replaceFullscreenImageSource
    || fallbackRuntime?.replaceFullscreenImageSource;
  return helper?.(currentImage, src, options)
    || Promise.reject(new Error("shared-fullscreen-replace-unavailable"));
}

loadSharedPhotoGallery();
