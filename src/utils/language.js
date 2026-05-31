import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "../config/constants.js";

export function normalizeUiLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : DEFAULT_LANGUAGE;
}

export function currentDocumentLanguage(fallback = DEFAULT_LANGUAGE) {
  if (typeof document === "undefined") return normalizeUiLanguage(fallback);
  return normalizeUiLanguage(document.documentElement?.lang || fallback);
}
