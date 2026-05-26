import { nowIso } from "../utils/time.js";

export const PUBLIC_SHARED_LAYOUT_LIST_PREFIX = "public-shared-layout-";

export function createSharedLayoutsByLanguage(_layouts = [], {
  languages = ["ru", "en"]
} = {}) {
  return Object.fromEntries(
    [...new Set(languages.map((language) => String(language || "").trim().toLowerCase()).filter(Boolean))]
      .map((language) => [language, []])
  );
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
      subtitle: "Template",
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

export function isConcretePublicSharedLayoutListRecord(record) {
  if (!isPublicSharedLayoutListRecord(record)) return false;
  return Boolean(
    record?.ownerId ||
    record?.owner_id ||
    record?.createdAt ||
    record?.created_at ||
    record?.stateRevision != null ||
    record?.state_revision != null ||
    record?.payload
  );
}

export function isPublicSharedTemplatePayload(payload) {
  return Boolean(
    payload &&
    payload.items && typeof payload.items === "object" &&
    payload.containers && typeof payload.containers === "object" &&
    payload.layouts && typeof payload.layouts === "object"
  );
}

export function isTemplateCopySharedLayoutId(layoutId) {
  return String(layoutId || "").trim().startsWith("template-copy-");
}

export function sharedLayoutCatalogEntryFromPublicRecord(record, {
  layoutsByLanguage = null
} = {}) {
  const id = sharedLayoutIdFromPublicListRecord(record);
  if (!id) return null;
  const language = String(record?.language || "").trim().toLowerCase();
  if (!language) return null;
  const runtimeLayout = Object.values(layoutsByLanguage || {})
    .flat()
    .find((layout) => layout?.id === id) || null;
  return {
    ...(runtimeLayout || {}),
    id,
    name: record?.name || record?.title || runtimeLayout?.name || id,
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

export function compareSharedLayoutIndexEntries(a, b) {
  const languageOrder = String(a?.language || "").localeCompare(String(b?.language || ""));
  if (languageOrder) return languageOrder;
  return String(a?.name || "").localeCompare(String(b?.name || ""), "ru");
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

export function sharedLayoutFamilyKey(layoutId) {
  return String(layoutId || "").replace(/-en$/, "");
}

function sharedLayoutNameKey(layout) {
  return String(layout?.name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sharedLayoutVisibilityScore(layout, serverConfirmedIds) {
  const id = String(layout?.id || "").trim();
  let score = 0;
  if (serverConfirmedIds.has(id) || layout?.serverConfirmed) score += 100;
  if (layout?.runtimeSharedTemplate) score += 50;
  if (layout?.statePayload) score += 20;
  if (id && !/-en$/.test(id)) score += 1;
  return score;
}

export function visibleSharedLayoutsForLanguage(layoutsByLanguage, language, {
  defaultLanguage = "",
  serverConfirmedSharedLayouts = []
} = {}) {
  const normalizedLanguage = String(language || "").trim().toLowerCase();
  const fallbackLanguage = String(defaultLanguage || "").trim().toLowerCase();
  const layouts =
    layoutsByLanguage?.[normalizedLanguage] ||
    (fallbackLanguage ? layoutsByLanguage?.[fallbackLanguage] : null) ||
    [];
  const serverConfirmedIds = new Set(
    (Array.isArray(serverConfirmedSharedLayouts) ? serverConfirmedSharedLayouts : [])
      .map((layout) => String(layout?.id || "").trim())
      .filter(Boolean)
  );
  const byFamily = new Map();
  layouts.forEach((layout, index) => {
    const id = String(layout?.id || "").trim();
    if (!id) return;
    if (!serverConfirmedIds.has(id) && !layout?.serverConfirmed) return;
    const familyKey = sharedLayoutFamilyKey(id) || id;
    const candidate = {
      layout,
      order: byFamily.has(familyKey) ? byFamily.get(familyKey).order : index,
      index,
      score: sharedLayoutVisibilityScore(layout, serverConfirmedIds)
    };
    const previous = byFamily.get(familyKey);
    if (!previous || candidate.score > previous.score) {
      byFamily.set(familyKey, candidate);
    }
  });
  return [...byFamily.values()]
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((entry) => entry.layout);
}

export function findSharedLayoutForLanguage(layoutsByLanguage, layoutId, language, {
  sourceLanguage = "",
  serverConfirmedSharedLayouts = []
} = {}) {
  const id = String(layoutId || "").trim();
  const familyKey = sharedLayoutFamilyKey(id);
  const sourceLayouts = sourceLanguage
    ? visibleSharedLayoutsForLanguage(layoutsByLanguage, sourceLanguage, {
      serverConfirmedSharedLayouts
    })
    : [];
  const allLayouts = Object.values(layoutsByLanguage || {}).flat();
  const sourceLayout = sourceLayouts.find((layout) => String(layout?.id || "").trim() === id) ||
    allLayouts.find((layout) => String(layout?.id || "").trim() === id) ||
    (Array.isArray(serverConfirmedSharedLayouts) ? serverConfirmedSharedLayouts : [])
      .find((layout) => String(layout?.id || "").trim() === id) ||
    null;
  const sourceNameKey = sharedLayoutNameKey(sourceLayout);
  const sourceIndex = sourceLayouts.findIndex((layout) => String(layout?.id || "").trim() === id);
  const targetLayouts = visibleSharedLayoutsForLanguage(layoutsByLanguage, language, {
    serverConfirmedSharedLayouts
  });
  if (!targetLayouts.length) return null;
  return targetLayouts.find((layout) => String(layout?.id || "").trim() === id) ||
    targetLayouts.find((layout) => sharedLayoutFamilyKey(layout?.id) === familyKey && String(layout?.id || "").trim() !== id) ||
    targetLayouts.find((layout) => sourceNameKey && sharedLayoutNameKey(layout) === sourceNameKey && String(layout?.id || "").trim() !== id) ||
    targetLayouts[Math.max(0, Math.min(sourceIndex < 0 ? 0 : sourceIndex, targetLayouts.length - 1))] ||
    null;
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
