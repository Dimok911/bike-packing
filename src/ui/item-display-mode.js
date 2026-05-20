export const ITEM_DISPLAY_MODE_DEFAULT = "none";
export const ITEM_DISPLAY_MODES = ["none", "meta", "meta-photos", "photos"];

export function normalizeItemDisplayMode(value) {
  const mode = String(value || "").trim();
  return ITEM_DISPLAY_MODES.includes(mode) ? mode : ITEM_DISPLAY_MODE_DEFAULT;
}

export function itemDisplayModeFromFlags({ showMeta = false, showPhotos = false } = {}) {
  if (showMeta && showPhotos) return "meta-photos";
  if (showMeta) return "meta";
  if (showPhotos) return "photos";
  return ITEM_DISPLAY_MODE_DEFAULT;
}

export function ensureItemDisplayModeState(targetState, { defaultMode = ITEM_DISPLAY_MODE_DEFAULT } = {}) {
  if (!targetState || typeof targetState !== "object") return ITEM_DISPLAY_MODE_DEFAULT;
  const mode = targetState.itemDisplayMode === undefined
    ? normalizeItemDisplayMode(defaultMode)
    : normalizeItemDisplayMode(targetState.itemDisplayMode);
  targetState.itemDisplayMode = mode;
  targetState.showItemMeta = shouldShowItemLabelsForMode(mode);
  return mode;
}

export function shouldShowItemLabelsForMode(mode) {
  const normalized = normalizeItemDisplayMode(mode);
  return normalized === "meta" || normalized === "meta-photos";
}

export function shouldShowItemPhotosForMode(mode) {
  const normalized = normalizeItemDisplayMode(mode);
  return normalized === "photos" || normalized === "meta-photos";
}

export function nextItemDisplayMode(currentMode) {
  const current = normalizeItemDisplayMode(currentMode);
  const index = ITEM_DISPLAY_MODES.indexOf(current);
  return ITEM_DISPLAY_MODES[(index + 1) % ITEM_DISPLAY_MODES.length] || ITEM_DISPLAY_MODE_DEFAULT;
}

export function itemDisplayModeLabel(mode) {
  switch (normalizeItemDisplayMode(mode)) {
    case "photos":
      return "Без меток, с фото";
    case "meta":
      return "С метками, без фото";
    case "meta-photos":
      return "С метками и фото";
    default:
      return "Без меток и фото";
  }
}
