import { safeSetLocalStorage } from "../utils/storage.js";

export function isPublicTemplateListId(listId) {
  const id = String(listId || "").trim();
  return id === "public-demo-state" ||
    id.startsWith("public-demo-state-") ||
    id.startsWith("public-shared-layout-");
}

export function loadStoredActivePackingListId({ storageKey, scopedKey }) {
  try {
    const key = scopedKey(storageKey);
    const listId = localStorage.getItem(key) || "";
    if (isPublicTemplateListId(listId)) {
      localStorage.removeItem(key);
      return "";
    }
    return listId;
  } catch {
    return "";
  }
}

export function saveStoredActivePackingListId(listId, { storageKey, scopedKey }) {
  const normalized = isPublicTemplateListId(listId) ? "" : String(listId || "");
  try {
    const key = scopedKey(storageKey);
    if (normalized) safeSetLocalStorage(key, normalized);
    else localStorage.removeItem(key);
  } catch {
    // Active list id is a convenience cache; sync can still work through the legacy endpoint.
  }
  return normalized;
}

export function normalizeActiveLayoutChoice(choice, {
  isDemoLayoutChoice,
  demoLayoutChoiceForLanguage,
  demoLanguageFromLayoutChoice,
  templateDraftLayoutId,
  isAdminTemplateCopyChoice
} = {}) {
  const value = String(choice || "").trim();
  if (!value) return "";
  if (isDemoLayoutChoice?.(value)) return value;
  if (value.startsWith("shared:")) return value.slice("shared:".length) ? value : "";
  const templateDraftId = templateDraftLayoutId?.(value);
  if (templateDraftId) return isAdminTemplateCopyChoice?.(templateDraftId) ? value : "";
  return value;
}

export function isPrivateLayoutChoice(choice, {
  normalizeChoice,
  isDemoLayoutChoice,
  templateDraftLayoutId
} = {}) {
  const normalized = normalizeChoice(choice);
  return Boolean(normalized && !isDemoLayoutChoice?.(normalized) && !normalized.startsWith("shared:") && !templateDraftLayoutId?.(normalized));
}

export function loadStoredActiveLayoutChoice({ storageKey, scopedKey, normalizeChoice }) {
  try {
    return normalizeChoice(localStorage.getItem(scopedKey(storageKey)) || "");
  } catch {
    return "";
  }
}

export function loadStoredActivePrivateLayoutChoice({
  storageKey,
  scopedKey,
  normalizeChoice,
  isPrivateChoice,
  isPrivateUserLayoutId
}) {
  try {
    const choice = normalizeChoice(localStorage.getItem(scopedKey(storageKey)) || "");
    return isPrivateChoice(choice) && isPrivateUserLayoutId(choice) ? choice : "";
  } catch {
    return "";
  }
}

export function isStoredActiveLayoutChoiceExplicit({ storageKey, scopedKey }) {
  try {
    return localStorage.getItem(scopedKey(storageKey)) === "explicit";
  } catch {
    return false;
  }
}

export function saveStoredActiveLayoutChoice(choice, {
  choiceStorageKey,
  sourceStorageKey,
  privateChoiceStorageKey,
  scopedKey,
  normalizeChoice,
  isPrivateChoice,
  isPrivateUserLayoutId
}) {
  const normalized = normalizeChoice(choice);
  try {
    const choiceKey = scopedKey(choiceStorageKey);
    const sourceKey = scopedKey(sourceStorageKey);
    const privateChoiceKey = scopedKey(privateChoiceStorageKey);
    if (normalized) {
      safeSetLocalStorage(choiceKey, normalized);
      safeSetLocalStorage(sourceKey, "explicit");
    } else {
      localStorage.removeItem(choiceKey);
      localStorage.removeItem(sourceKey);
    }
    if (isPrivateChoice(normalized) && isPrivateUserLayoutId(normalized)) {
      safeSetLocalStorage(privateChoiceKey, normalized);
    }
  } catch {
    // The last opened layout is only a UI preference.
  }
  return normalized;
}

export function resolveStoredPrivateLayoutChoice({
  activeLayoutId = "",
  isPrivateChoice,
  isPrivateUserLayoutId,
  normalizeChoice,
  storedChoice = "",
  storedPrivateChoice = ""
} = {}) {
  const candidates = [storedPrivateChoice, storedChoice, activeLayoutId];
  for (const candidate of candidates) {
    const normalized = normalizeChoice(candidate);
    if (!normalized) continue;
    if (!isPrivateChoice(normalized)) continue;
    if (!isPrivateUserLayoutId(normalized)) continue;
    return normalized;
  }
  return "";
}
