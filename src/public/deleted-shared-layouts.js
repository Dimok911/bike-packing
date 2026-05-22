import { safeSetLocalStorage } from "../utils/storage.js";

export const DELETED_SHARED_LAYOUTS_STORAGE_KEY = "bike-packing-deleted-shared-layouts-v1";

export function createDeletedSharedLayoutStore({
  storageKey = DELETED_SHARED_LAYOUTS_STORAGE_KEY,
  demoSharedLayoutId = ""
} = {}) {
  const deletedIds = loadDeletedSharedLayoutIds(storageKey);

  function save() {
    safeSetLocalStorage(storageKey, JSON.stringify([...deletedIds]));
  }

  function remember(layoutId) {
    const id = normalizeSharedLayoutId(layoutId);
    if (!id || id === demoSharedLayoutId) return false;
    deletedIds.add(id);
    save();
    return true;
  }

  function forget(layoutId) {
    const id = normalizeSharedLayoutId(layoutId);
    if (!id || !deletedIds.delete(id)) return false;
    save();
    return true;
  }

  function has(layoutId) {
    const id = normalizeSharedLayoutId(layoutId);
    return Boolean(id && id !== demoSharedLayoutId && deletedIds.has(id));
  }

  return {
    forget,
    has,
    remember
  };
}

function loadDeletedSharedLayoutIds(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(normalizeSharedLayoutId).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function normalizeSharedLayoutId(layoutId) {
  return String(layoutId || "").trim();
}
