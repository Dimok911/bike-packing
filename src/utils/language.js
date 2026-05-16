import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "../config/constants.js";

export function normalizeUiLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : DEFAULT_LANGUAGE;
}
