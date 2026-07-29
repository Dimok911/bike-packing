import "../vendor/vniipo-photo-gallery-fallback.js";

const CONTRACT_VERSION = 1;
const STABLE_URL = "https://vniipo-help.ru/shared-ui/photo-gallery/stable.js";
const bindings = new Set();
let stableLoadStarted = false;

const runtime = () => globalThis.VniipoPhotoGallery;

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
    destroy() {
      binding.controller?.destroy();
      bindings.delete(binding);
    }
  };
}

loadSharedPhotoGallery();
