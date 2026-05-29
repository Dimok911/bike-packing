import { safeSetLocalStorage } from "../utils/storage.js";

export function loadStoredUiSettings({
  storageKey,
  normalizeSortMode,
  normalizePackingVisualStyle,
  normalizePackingViewMode,
  normalizeBike3dTransforms,
  normalizeBike3dViewState,
  packingVisualStyleVersion,
  defaultPackingVisualStyle,
  defaultPackingViewMode = "columns"
} = {}) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey)) || {};
    return normalizeUiSettings(parsed, {
      normalizeSortMode,
      normalizePackingVisualStyle,
      normalizePackingViewMode,
      normalizeBike3dTransforms,
      normalizeBike3dViewState,
      packingVisualStyleVersion,
      defaultPackingVisualStyle,
      defaultPackingViewMode
    });
  } catch {
    return defaultUiSettings({
      normalizeBike3dViewState,
      defaultPackingVisualStyle,
      defaultPackingViewMode
    });
  }
}

export function saveStoredUiSettings(settings, {
  storageKey,
  normalizeSortMode,
  normalizePackingVisualStyle,
  normalizePackingViewMode,
  normalizeBike3dTransforms,
  normalizeBike3dViewState,
  packingVisualStyleVersion
} = {}) {
  try {
    safeSetLocalStorage(storageKey, JSON.stringify({
      itemSortMode: normalizeSortMode(settings.itemSortMode),
      rootContainerSortMode: normalizeSortMode(settings.rootContainerSortMode),
      dictionaryLocationSortMode: normalizeSortMode(settings.dictionaryLocationSortMode),
      dictionaryCategorySortMode: normalizeSortMode(settings.dictionaryCategorySortMode),
      packingVisualStyleVersion,
      packingVisualStyle: normalizePackingVisualStyle(settings.packingVisualStyle),
      packingViewMode: normalizePackingViewMode(settings.packingViewMode),
      bike3dTransforms: normalizeBike3dTransforms(settings.bike3dTransforms),
      bike3dViewState: normalizeBike3dViewState(settings.bike3dViewState)
    }));
  } catch {
    // Sorting and view preferences are local convenience settings.
  }
}

function normalizeUiSettings(parsed, options) {
  const {
    normalizeSortMode,
    normalizePackingVisualStyle,
    normalizePackingViewMode,
    normalizeBike3dTransforms,
    normalizeBike3dViewState,
    packingVisualStyleVersion,
    defaultPackingVisualStyle,
    defaultPackingViewMode
  } = options;
  return {
    itemSortMode: normalizeSortMode(parsed.itemSortMode),
    rootContainerSortMode: normalizeSortMode(parsed.rootContainerSortMode),
    dictionaryLocationSortMode: normalizeSortMode(parsed.dictionaryLocationSortMode),
    dictionaryCategorySortMode: normalizeSortMode(parsed.dictionaryCategorySortMode),
    packingVisualStyle: parsed.packingVisualStyleVersion === packingVisualStyleVersion && parsed.packingVisualStyle
      ? normalizePackingVisualStyle(parsed.packingVisualStyle)
      : defaultPackingVisualStyle,
    packingViewMode: normalizePackingViewMode(parsed.packingViewMode),
    bike3dTransforms: normalizeBike3dTransforms(parsed.bike3dTransforms),
    bike3dViewState: normalizeBike3dViewState(parsed.bike3dViewState)
  };
}

function defaultUiSettings({
  normalizeBike3dViewState,
  defaultPackingVisualStyle,
  defaultPackingViewMode
} = {}) {
  return {
    itemSortMode: "asc",
    rootContainerSortMode: "asc",
    dictionaryLocationSortMode: "asc",
    dictionaryCategorySortMode: "asc",
    packingVisualStyle: defaultPackingVisualStyle,
    packingViewMode: defaultPackingViewMode,
    bike3dTransforms: {},
    bike3dViewState: normalizeBike3dViewState()
  };
}
