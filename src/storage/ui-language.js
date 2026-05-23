import {
  DEFAULT_LANGUAGE,
  LANGUAGE_KEY
} from "../config/constants.js";
import { normalizeUiLanguage } from "../utils/language.js";
import { safeSetLocalStorage } from "../utils/storage.js";

export function loadUiLanguage() {
  try {
    return normalizeUiLanguage(localStorage.getItem(LANGUAGE_KEY) || DEFAULT_LANGUAGE);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function saveUiLanguage(language) {
  safeSetLocalStorage(LANGUAGE_KEY, normalizeUiLanguage(language));
}
