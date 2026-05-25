export const PUBLIC_TEMPLATE_KIND_DEMO = "demo";
export const PUBLIC_TEMPLATE_KIND_SHARED = "shared-layout";
export const PUBLIC_DEMO_LIST_ID = "public-demo-state";
export const PUBLIC_DEMO_LIST_PREFIX = "public-demo-state-";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeLanguage(value, fallback = "ru") {
  return normalizeText(value).toLowerCase() || fallback;
}

function publicTemplateId(record) {
  return normalizeText(record?.id || record?.listId || record?.list_id);
}

function normalizeComparableName(value = "") {
  return normalizeText(value).toLowerCase();
}

function trailingNumber(value = "") {
  const match = normalizeText(value).match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

export function demoAdminIdFromPublicListId(listId) {
  const id = normalizeText(listId);
  if (id === PUBLIC_DEMO_LIST_ID) return "demo-state";
  if (id.startsWith(PUBLIC_DEMO_LIST_PREFIX)) return normalizeText(id.slice(PUBLIC_DEMO_LIST_PREFIX.length));
  return "";
}

export function createDemoTemplateListId({
  language = "ru",
  takenListIds = [],
  now = Date.now,
  random = Math.random
} = {}) {
  const normalizedLanguage = normalizeLanguage(language, "template")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "template";
  const taken = new Set((Array.isArray(takenListIds) ? takenListIds : []).map((id) => normalizeText(id)));
  let id = "";
  do {
    const stamp = Number(now()).toString(36);
    const suffix = String(random()).slice(2, 10) || "copy";
    id = `${PUBLIC_DEMO_LIST_PREFIX}copy-${normalizedLanguage}-${stamp}-${suffix}`.slice(0, 64).replace(/-+$/g, "");
  } while (!id || taken.has(id));
  return id;
}

export function isPublicDemoTemplateRecord(record) {
  const id = publicTemplateId(record);
  return record?.publicTemplateKind === PUBLIC_TEMPLATE_KIND_DEMO ||
    id === PUBLIC_DEMO_LIST_ID ||
    id.startsWith(PUBLIC_DEMO_LIST_PREFIX);
}

export function publicDemoTemplateEntryFromRecord(record, {
  fallbackName = ""
} = {}) {
  if (!isPublicDemoTemplateRecord(record)) return null;
  const id = publicTemplateId(record);
  if (!id) return null;
  const language = normalizeLanguage(record?.language, "");
  if (!language) return null;
  const name = normalizeText(record?.name || record?.title || fallbackName || id) || id;
  return {
    id,
    listId: id,
    name,
    title: name,
    language,
    publicTemplateKind: PUBLIC_TEMPLATE_KIND_DEMO,
    role: PUBLIC_TEMPLATE_KIND_DEMO,
    serverConfirmed: true,
    createdAt: normalizeText(record?.createdAt || record?.created_at),
    updatedAt: normalizeText(record?.updatedAt || record?.updated_at)
  };
}

export function demoTemplateEntryForLanguage(language, {
  listId = "",
  name = "",
  updatedAt = "",
  serverConfirmed = false,
  missing = false
} = {}) {
  const normalizedLanguage = normalizeLanguage(language);
  const id = normalizeText(listId) || `${PUBLIC_DEMO_LIST_PREFIX}${normalizedLanguage}`;
  return {
    id,
    listId: id,
    name: normalizeText(name) || id,
    title: normalizeText(name) || id,
    language: normalizedLanguage,
    publicTemplateKind: PUBLIC_TEMPLATE_KIND_DEMO,
    role: PUBLIC_TEMPLATE_KIND_DEMO,
    serverConfirmed: Boolean(serverConfirmed),
    missing: Boolean(missing),
    createdAt: "",
    updatedAt: normalizeText(updatedAt)
  };
}

export function mergePublicTemplateCatalogEntries(catalog = [], entries = []) {
  const byKey = new Map();
  const add = (entry) => {
    if (!entry?.id) return;
    const kind = normalizeText(entry.publicTemplateKind || entry.role || PUBLIC_TEMPLATE_KIND_SHARED);
    byKey.set(`${kind}:${entry.id}`, {
      ...(byKey.get(`${kind}:${entry.id}`) || {}),
      ...entry,
      publicTemplateKind: kind,
      role: entry.role || kind
    });
  };
  (Array.isArray(catalog) ? catalog : []).forEach(add);
  (Array.isArray(entries) ? entries : []).forEach(add);
  return [...byKey.values()];
}

export function compareDemoTemplateOrder(a, b) {
  const aName = normalizeComparableName(a?.name || a?.title || a?.id);
  const bName = normalizeComparableName(b?.name || b?.title || b?.id);
  const byName = aName.localeCompare(bName, "ru", { numeric: true, sensitivity: "base" });
  if (byName !== 0) return byName;
  return normalizeText(a?.id || a?.listId).localeCompare(normalizeText(b?.id || b?.listId), "ru", { numeric: true });
}

export function demoTemplatesForLanguage(catalog = [], language, {
  fallbackEntry = null
} = {}) {
  const normalizedLanguage = normalizeLanguage(language);
  const entries = (Array.isArray(catalog) ? catalog : [])
    .filter((entry) =>
      (entry?.publicTemplateKind === PUBLIC_TEMPLATE_KIND_DEMO || entry?.role === PUBLIC_TEMPLATE_KIND_DEMO) &&
      normalizeLanguage(entry?.language, "") === normalizedLanguage &&
      !entry?.missing
    )
    .sort(compareDemoTemplateOrder);
  if (!entries.length && fallbackEntry) return [fallbackEntry];
  return entries;
}

export function demoTemplateByListId(catalog = [], listId) {
  const normalizedId = normalizeText(listId);
  if (!normalizedId) return null;
  return (Array.isArray(catalog) ? catalog : []).find((entry) =>
    (entry?.publicTemplateKind === PUBLIC_TEMPLATE_KIND_DEMO || entry?.role === PUBLIC_TEMPLATE_KIND_DEMO) &&
    normalizeText(entry?.listId || entry?.id) === normalizedId
  ) || null;
}

export function demoTemplateForLanguage(catalog = [], language, {
  fallbackEntry = null,
  listId = ""
} = {}) {
  const explicit = demoTemplateByListId(catalog, listId);
  if (explicit) return explicit;
  return demoTemplatesForLanguage(catalog, language, { fallbackEntry })[0] || fallbackEntry;
}

export function findDemoTemplateForLanguage(catalog = [], sourceListId, targetLanguage, {
  sourceLanguage = ""
} = {}) {
  const targetEntries = demoTemplatesForLanguage(catalog, targetLanguage);
  if (!targetEntries.length) return null;
  const source = demoTemplateByListId(catalog, sourceListId);
  if (!source) return targetEntries[0] || null;
  const sourceName = normalizeComparableName(source.name || source.title);
  const byName = targetEntries.find((entry) => normalizeComparableName(entry.name || entry.title) === sourceName);
  if (byName) return byName;
  const sourceNumber = trailingNumber(source.name || source.title);
  if (sourceNumber != null) {
    const byNumber = targetEntries.find((entry) => trailingNumber(entry.name || entry.title) === sourceNumber);
    if (byNumber) return byNumber;
  }
  const sourceEntries = demoTemplatesForLanguage(catalog, sourceLanguage || source.language);
  const sourceIndex = sourceEntries.findIndex((entry) => normalizeText(entry.listId || entry.id) === normalizeText(sourceListId));
  if (sourceIndex >= 0) return targetEntries[Math.min(sourceIndex, targetEntries.length - 1)] || targetEntries[0] || null;
  return targetEntries[0] || null;
}

export function publicTemplateChoice(entry, {
  demoChoiceForLanguage = (language) => `demo:${language}`,
  demoChoiceForTemplate = null
} = {}) {
  if (!entry) return "";
  if (entry.publicTemplateKind === PUBLIC_TEMPLATE_KIND_DEMO || entry.role === PUBLIC_TEMPLATE_KIND_DEMO) {
    if (demoChoiceForTemplate) return demoChoiceForTemplate(entry);
    return demoChoiceForLanguage(entry.language);
  }
  if (entry.publicTemplateKind === PUBLIC_TEMPLATE_KIND_SHARED || entry.role === PUBLIC_TEMPLATE_KIND_SHARED) {
    return entry.id ? `shared:${entry.id}` : "";
  }
  return "";
}
