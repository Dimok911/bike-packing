import { clonePlain } from "../utils/json.js";
import { nowIso } from "../utils/time.js";

export const SHARED_LAYOUTS_INDEX_KEY = "sharedLayoutsIndex";
export const PUBLIC_SHARED_LAYOUT_LIST_PREFIX = "public-shared-layout-";

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
  runtimeSharedTemplate = false,
  updatedAt = ""
} = {}) {
  if (!id || !layoutsByLanguage || typeof layoutsByLanguage !== "object") return null;
  const normalizedLanguage = String(language || "ru").trim().toLowerCase() || "ru";
  Object.keys(layoutsByLanguage).forEach((key) => {
    if (String(key || "").trim().toLowerCase() === normalizedLanguage) return;
    const entries = Array.isArray(layoutsByLanguage[key]) ? layoutsByLanguage[key] : [];
    layoutsByLanguage[key] = entries.filter((entry) => entry?.id !== id);
  });
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
  if (updatedAt) layout.updatedAt = updatedAt;
  layouts.sort(compareSharedLayoutIndexEntries);
  return layout;
}

export function sharedLayoutIdFromPublicListRecord(record) {
  const listId = String(record?.id || record?.listId || record?.list_id || "").trim();
  if (!listId.startsWith(PUBLIC_SHARED_LAYOUT_LIST_PREFIX)) return "";
  return listId.slice(PUBLIC_SHARED_LAYOUT_LIST_PREFIX.length);
}

export function isPublicSharedLayoutListRecord(record) {
  return Boolean(sharedLayoutIdFromPublicListRecord(record));
}

export function isTemplateCopySharedLayoutId(layoutId) {
  return String(layoutId || "").trim().startsWith("template-copy-");
}

export function sharedLayoutCatalogEntryFromPublicRecord(record, {
  layoutsByLanguage = null,
  fallbackLanguage = "ru"
} = {}) {
  const id = sharedLayoutIdFromPublicListRecord(record);
  if (!id) return null;
  const runtimeLayout = Object.values(layoutsByLanguage || {})
    .flat()
    .find((layout) => layout?.id === id) || null;
  const language = String(
    record?.language ||
    runtimeLayout?.language ||
    fallbackLanguage ||
    "ru"
  ).trim().toLowerCase() || "ru";
  return {
    ...(runtimeLayout || {}),
    id,
    name: runtimeLayout?.name || record?.name || record?.title || id,
    language,
    runtimeSharedTemplate: true,
    serverConfirmed: true,
    updatedAt: runtimeLayout?.updatedAt || record?.updatedAt || record?.updated_at || ""
  };
}

export function serverConfirmedSharedLayoutsFromPublicRecords(records = [], options = {}) {
  const byId = new Map();
  records
    .map((record) => sharedLayoutCatalogEntryFromPublicRecord(record, options))
    .filter(Boolean)
    .forEach((layout) => {
      if (!byId.has(layout.id)) byId.set(layout.id, layout);
    });
  return [...byId.values()];
}

export function serverConfirmedSharedLayoutsFromIndexPayload(payload, {
  includeTemplateCopies = false
} = {}) {
  return normalizeSharedLayoutIndexEntries(payload)
    .filter((entry) => includeTemplateCopies || !isTemplateCopySharedLayoutId(entry.id))
    .map((entry) => ({
      ...entry,
      runtimeSharedTemplate: true,
      serverConfirmed: true
    }));
}

export function mergeSharedLayoutCatalogEntries(catalog = [], entries = []) {
  const byId = new Map();
  (Array.isArray(catalog) ? catalog : []).forEach((entry) => {
    if (entry?.id) byId.set(entry.id, entry);
  });
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (entry?.id) byId.set(entry.id, { ...(byId.get(entry.id) || {}), ...entry });
  });
  return [...byId.values()];
}

export function updateSharedLayoutCatalogEntryMetadata(catalog = [], sharedId, {
  name = "",
  language = "",
  updatedAt = ""
} = {}) {
  if (!sharedId) return Array.isArray(catalog) ? catalog : [];
  return (Array.isArray(catalog) ? catalog : []).map((entry) => {
    if (entry?.id !== sharedId) return entry;
    return {
      ...entry,
      name: name || entry.name,
      language: language || entry.language,
      updatedAt: updatedAt || entry.updatedAt
    };
  });
}

export function sharedLayoutLanguageFromPayload(payload, fallbackLanguage = "ru") {
  const activeLayout = payload?.layouts?.[payload?.activeLayoutId] || Object.values(payload?.layouts || {})[0] || null;
  return String(activeLayout?.language || fallbackLanguage || "ru").trim().toLowerCase() || "ru";
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
      ? sharedLayoutIndexPayload(entry.statePayload)
      : null
  };
}

export function sharedLayoutIndexPayload(payload) {
  const copy = clonePlain(payload || {});
  Object.values(copy.items || {}).forEach((item) => {
    if (item && typeof item === "object") item.photos = [];
  });
  Object.values(copy.containers || {}).forEach((container) => {
    if (container && typeof container === "object") container.photos = [];
  });
  return copy;
}

export function mergeSharedLayoutIndexPayload(layoutsByLanguage, payload, {
  includeTemplateCopies = false
} = {}) {
  let changed = 0;
  normalizeSharedLayoutIndexEntries(payload)
    .filter((entry) => includeTemplateCopies || !isTemplateCopySharedLayoutId(entry.id))
    .forEach((entry) => {
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
  entries.sort(compareSharedLayoutIndexEntries);
  nextPayload[SHARED_LAYOUTS_INDEX_KEY] = {
    version: 1,
    updatedAt: nowIso(),
    layouts: entries
  };
  return nextPayload;
}

export function compareSharedLayoutIndexEntries(a, b) {
  const languageOrder = String(a?.language || "").localeCompare(String(b?.language || ""));
  if (languageOrder) return languageOrder;
  return String(a?.name || "").localeCompare(String(b?.name || ""), "ru");
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

export function pruneRuntimeSharedLayouts(layoutsByLanguage, shouldRemove) {
  if (!layoutsByLanguage || typeof layoutsByLanguage !== "object" || typeof shouldRemove !== "function") return 0;
  let removed = 0;
  Object.keys(layoutsByLanguage).forEach((language) => {
    const layouts = Array.isArray(layoutsByLanguage[language]) ? layoutsByLanguage[language] : [];
    const nextLayouts = layouts.filter((layout) => {
      const remove = shouldRemove(layout, language);
      if (remove) removed += 1;
      return !remove;
    });
    layoutsByLanguage[language] = nextLayouts;
  });
  return removed;
}

export function runtimeSharedLayoutIndexEntries(layoutsByLanguage, {
  includeTemplateCopies = false
} = {}) {
  return Object.values(layoutsByLanguage || {})
    .flat()
    .filter((layout) => layout?.runtimeSharedTemplate && layout.statePayload)
    .filter((layout) => includeTemplateCopies || !isTemplateCopySharedLayoutId(layout.id))
    .map((layout) => sharedLayoutIndexEntry({
      id: layout.id,
      name: layout.name || layout.id,
      language: layout.language || "ru",
      statePayload: layout.statePayload,
      updatedAt: layout.updatedAt || nowIso()
    }))
    .filter(Boolean);
}

export function withRuntimeSharedLayoutIndex(payload, layoutsByLanguage, options = {}) {
  return runtimeSharedLayoutIndexEntries(layoutsByLanguage, options)
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
