import "../vendor/vniipo-input-layout-fallback.js";

const CONTRACT_VERSION = 1;
const STABLE_URL = "https://vniipo-help.ru/shared-ui/input-layout/stable.js";
const bindings = new Set();
let stableLoadStarted = false;

const runtime = () => globalThis.VniipoInputLayout;

const updateRuntimeLabel = () => {
  const api = runtime();
  if (!document.documentElement || !api) return;
  document.documentElement.dataset.inputLayoutVersion = api.version || "unknown";
};

const rebindAll = () => {
  const api = runtime();
  if (!api || api.contractVersion !== CONTRACT_VERSION) return;
  for (const binding of bindings) {
    binding.controller?.destroy();
    binding.controller = api.createController(binding.options);
  }
  updateRuntimeLabel();
};

export function loadSharedInputLayout() {
  if (stableLoadStarted || typeof document === "undefined") return;
  stableLoadStarted = true;
  const bucket = Math.floor(Date.now() / 3_600_000);
  const script = document.createElement("script");
  script.async = true;
  script.src = `${STABLE_URL}?contract=${CONTRACT_VERSION}&window=${bucket}`;
  script.dataset.sharedInputLayout = "stable";
  script.addEventListener("load", () => {
    if (runtime()?.contractVersion === CONTRACT_VERSION) rebindAll();
  }, { once: true });
  script.addEventListener("error", updateRuntimeLabel, { once: true });
  document.head.appendChild(script);
}

export const sharedConvertLatinToRuLayout = (value) =>
  runtime()?.convertLatinToRuLayout(value) ?? value;

export const sharedConvertRuToLatinLayout = (value) =>
  runtime()?.convertRuToLatinLayout(value) ?? value;

export const createSharedInputNormalizer = (options = {}) =>
  runtime().createInputNormalizer(options);

export const sharedShouldEnableInputLayout = (options = {}) =>
  runtime()?.shouldEnable(options) ?? false;

export const sharedIsExternalTextInsertion = (event) =>
  runtime()?.isExternalTextInsertion(event) ?? false;

export function createSharedInputLayoutController(options = {}) {
  const binding = {
    options,
    controller: runtime()?.createController(options)
  };
  bindings.add(binding);
  loadSharedInputLayout();
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
