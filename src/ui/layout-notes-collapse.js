const MAX_SAVED_LAYOUTS = 200;

export const LAYOUT_NOTES_COLLAPSE_STORAGE_KEY = "bike-packing-layout-notes-collapse-v1";

export function isLayoutNotesCollapsed(storageKey, layoutId, storage = globalThis.localStorage) {
  if (!layoutId) return false;
  return loadLayoutNotesCollapseState(storageKey, storage)[layoutId] === true;
}

export function setLayoutNotesCollapsed(storageKey, layoutId, collapsed, storage = globalThis.localStorage) {
  if (!storageKey || !layoutId || !storage) return false;
  const saved = loadLayoutNotesCollapseState(storageKey, storage);
  delete saved[layoutId];
  saved[layoutId] = Boolean(collapsed);
  const entries = Object.entries(saved).slice(-MAX_SAVED_LAYOUTS);
  try {
    storage.setItem(storageKey, JSON.stringify(Object.fromEntries(entries)));
    return true;
  } catch {
    return false;
  }
}

export function loadLayoutNotesCollapseState(storageKey, storage = globalThis.localStorage) {
  if (!storageKey || !storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([layoutId, collapsed]) => layoutId && typeof collapsed === "boolean")
        .slice(-MAX_SAVED_LAYOUTS)
    );
  } catch {
    return {};
  }
}
