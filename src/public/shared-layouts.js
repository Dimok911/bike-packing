import { clonePlain } from "../utils/json.js";
import { nowIso } from "../utils/time.js";

export const SHARED_LAYOUTS_INDEX_KEY = "sharedLayoutsIndex";

export function createSharedLayoutsByLanguage(layouts) {
  const ruLayouts = layouts;
  const enLayouts = clonePlain(layouts).map((layout) => ({
    ...layout,
    id: `${layout.id}-en`,
    name: layout.name === "Bikepacking reference" ? "Bikepacking reference" : layout.name,
    subtitle: "Shared layout",
    language: "en"
  }));
  ruLayouts.forEach((layout) => {
    layout.language = "ru";
  });
  return { ru: ruLayouts, en: enLayouts };
}

export function upsertRuntimeSharedLayout(layoutsByLanguage, {
  id,
  name = "",
  language = "ru",
  statePayload = null,
  runtimeSharedTemplate = false
} = {}) {
  if (!id || !layoutsByLanguage || typeof layoutsByLanguage !== "object") return null;
  const normalizedLanguage = String(language || "ru").trim().toLowerCase() || "ru";
  layoutsByLanguage[normalizedLanguage] = layoutsByLanguage[normalizedLanguage] || [];
  const layouts = layoutsByLanguage[normalizedLanguage];
  let layout = layouts.find((entry) => entry?.id === id);
  if (!layout) {
    layout = {
      id,
      name: name || id,
      subtitle: "Shared layout",
      language: normalizedLanguage,
      roots: [],
      bags: [],
      statePayload: null
    };
    layouts.push(layout);
  }
  layout.name = name || layout.name || id;
  layout.language = normalizedLanguage;
  if (statePayload) layout.statePayload = statePayload;
  if (runtimeSharedTemplate) layout.runtimeSharedTemplate = true;
  return layout;
}

export function normalizeSharedLayoutIndexEntries(payload) {
  const index = payload?.[SHARED_LAYOUTS_INDEX_KEY];
  const entries = Array.isArray(index?.layouts)
    ? index.layouts
    : Array.isArray(index?.entries)
      ? index.entries
      : Array.isArray(index)
        ? index
        : [];
  return entries.map(normalizeSharedLayoutIndexEntry).filter(Boolean);
}

export function normalizeSharedLayoutIndexEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = String(entry.id || "").trim();
  if (!id) return null;
  const language = String(entry.language || "ru").trim().toLowerCase() || "ru";
  return {
    id,
    name: String(entry.name || id).trim() || id,
    language,
    updatedAt: String(entry.updatedAt || entry.updated_at || "").trim(),
    statePayload: entry.statePayload && typeof entry.statePayload === "object"
      ? clonePlain(entry.statePayload)
      : null
  };
}

export function mergeSharedLayoutIndexPayload(layoutsByLanguage, payload) {
  let changed = 0;
  normalizeSharedLayoutIndexEntries(payload).forEach((entry) => {
    const layout = upsertRuntimeSharedLayout(layoutsByLanguage, {
      ...entry,
      runtimeSharedTemplate: true
    });
    if (layout) changed += 1;
  });
  return changed;
}

export function sharedLayoutIndexEntry({
  id,
  name = "",
  language = "ru",
  statePayload = null,
  updatedAt = nowIso()
} = {}) {
  const normalized = normalizeSharedLayoutIndexEntry({
    id,
    name,
    language,
    statePayload,
    updatedAt
  });
  return normalized;
}

export function upsertSharedLayoutIndexEntry(payload, entry) {
  const normalizedEntry = normalizeSharedLayoutIndexEntry(entry);
  if (!normalizedEntry) return clonePlain(payload || {});
  const nextPayload = clonePlain(payload || {});
  const entries = normalizeSharedLayoutIndexEntries(nextPayload)
    .filter((candidate) => candidate.id !== normalizedEntry.id);
  entries.push(normalizedEntry);
  entries.sort((a, b) => {
    const languageOrder = String(a.language || "").localeCompare(String(b.language || ""));
    if (languageOrder) return languageOrder;
    return String(a.name || "").localeCompare(String(b.name || ""), "ru");
  });
  nextPayload[SHARED_LAYOUTS_INDEX_KEY] = {
    version: 1,
    updatedAt: nowIso(),
    layouts: entries
  };
  return nextPayload;
}

export function removeSharedLayoutIndexEntry(payload, layoutId) {
  const id = String(layoutId || "").trim();
  const nextPayload = clonePlain(payload || {});
  if (!id) return { payload: nextPayload, removed: false };
  const entries = normalizeSharedLayoutIndexEntries(nextPayload);
  const nextEntries = entries.filter((entry) => entry.id !== id);
  if (nextEntries.length === entries.length) return { payload: nextPayload, removed: false };
  nextPayload[SHARED_LAYOUTS_INDEX_KEY] = {
    version: 1,
    updatedAt: nowIso(),
    layouts: nextEntries
  };
  return { payload: nextPayload, removed: true };
}

export function removeRuntimeSharedLayout(layoutsByLanguage, layoutId) {
  const id = String(layoutId || "").trim();
  if (!id || !layoutsByLanguage || typeof layoutsByLanguage !== "object") return false;
  let removed = false;
  Object.keys(layoutsByLanguage).forEach((language) => {
    const layouts = Array.isArray(layoutsByLanguage[language]) ? layoutsByLanguage[language] : [];
    const nextLayouts = layouts.filter((layout) => layout?.id !== id);
    if (nextLayouts.length !== layouts.length) removed = true;
    layoutsByLanguage[language] = nextLayouts;
  });
  return removed;
}

export function runtimeSharedLayoutIndexEntries(layoutsByLanguage) {
  return Object.values(layoutsByLanguage || {})
    .flat()
    .filter((layout) => layout?.runtimeSharedTemplate && layout.statePayload)
    .map((layout) => sharedLayoutIndexEntry({
      id: layout.id,
      name: layout.name || layout.id,
      language: layout.language || "ru",
      statePayload: layout.statePayload,
      updatedAt: layout.updatedAt || nowIso()
    }))
    .filter(Boolean);
}

export function withRuntimeSharedLayoutIndex(payload, layoutsByLanguage) {
  return runtimeSharedLayoutIndexEntries(layoutsByLanguage)
    .reduce((nextPayload, entry) => upsertSharedLayoutIndexEntry(nextPayload, entry), clonePlain(payload || {}));
}

export function sharedLayoutFamilyKey(layoutId) {
  return String(layoutId || "").replace(/-en$/, "");
}

export function findSharedLayoutForLanguage(layoutsByLanguage, layoutId, language) {
  const familyKey = sharedLayoutFamilyKey(layoutId);
  const layouts = layoutsByLanguage?.[String(language || "").trim().toLowerCase()] || [];
  return layouts.find((layout) => sharedLayoutFamilyKey(layout?.id) === familyKey) || null;
}

export function normalizeSharedGearName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function sharedGearPhotos(gear, changedAt = nowIso()) {
  if (!gear.imageUrl) return [];
  return [{
    id: `shared-photo-${gear.id}`,
    localId: "",
    status: "synced",
    url: gear.imageUrl,
    thumbUrl: gear.imageUrl,
    fileName: "",
    type: "",
    size: 0,
    width: 0,
    height: 0,
    createdAt: changedAt,
    updatedAt: changedAt,
    error: ""
  }];
}
