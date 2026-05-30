export const PUBLIC_TEMPLATE_KIND_DEMO = "demo";
export const PUBLIC_TEMPLATE_KIND_SHARED = "shared-layout";
export const PUBLIC_DEMO_LIST_ID = "public-demo-state";
export const PUBLIC_DEMO_LIST_PREFIX = "public-demo-state-";
const DEMO_ITEM_KEY = "demo-state";

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

function demoTemplateItemKeyFromListId(listId, language) {
  const id = normalizeText(listId);
  if (id === PUBLIC_DEMO_LIST_ID) return DEMO_ITEM_KEY;
  if (id.startsWith(PUBLIC_DEMO_LIST_PREFIX)) {
    const suffix = normalizeText(id.slice(PUBLIC_DEMO_LIST_PREFIX.length));
    return suffix ? `${DEMO_ITEM_KEY}:${suffix}` : DEMO_ITEM_KEY;
  }
  const normalizedLanguage = normalizeLanguage(language, "");
  return normalizedLanguage && normalizedLanguage !== "ru" ? `${DEMO_ITEM_KEY}:${normalizedLanguage}` : DEMO_ITEM_KEY;
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
    itemKey: normalizeText(record?.itemKey || record?.item_key) || demoTemplateItemKeyFromListId(id, language),
    payloadEndpoint: normalizeText(record?.payloadEndpoint || record?.payload_endpoint),
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
    itemKey: demoTemplateItemKeyFromListId(id, normalizedLanguage),
    payloadEndpoint: "",
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

export function mergeServerDemoTemplateCatalog(currentCatalog = [], incomingEntries = []) {
  const confirmedIncoming = (Array.isArray(incomingEntries) ? incomingEntries : [])
    .filter((entry) =>
      (entry?.publicTemplateKind === PUBLIC_TEMPLATE_KIND_DEMO || entry?.role === PUBLIC_TEMPLATE_KIND_DEMO) &&
      normalizeText(entry?.listId || entry?.id) &&
      !entry?.missing
    )
    .map((entry) => ({
      ...entry,
      id: normalizeText(entry.id || entry.listId),
      listId: normalizeText(entry.listId || entry.id),
      publicTemplateKind: PUBLIC_TEMPLATE_KIND_DEMO,
      role: PUBLIC_TEMPLATE_KIND_DEMO,
      serverConfirmed: true,
      missing: false
    }));
  return mergePublicTemplateCatalogEntries(currentCatalog, confirmedIncoming);
}

export function upsertDemoTemplateCatalogEntry(catalog = [], language, {
  listId = "",
  name = "",
  updatedAt = "",
  serverConfirmed = true,
  missing = false,
  fallbackListId = "",
  fallbackName = ""
} = {}) {
  const normalized = normalizeLanguage(language);
  const requestedListId = normalizeText(listId);
  const existing = demoTemplateForLanguage(catalog, normalized, { listId: requestedListId });
  const resolvedListId = requestedListId || existing?.listId || normalizeText(fallbackListId) || demoTemplateEntryForLanguage(normalized).listId;
  return mergePublicTemplateCatalogEntries(catalog, [
    demoTemplateEntryForLanguage(normalized, {
      listId: resolvedListId,
      name: name || existing?.name || fallbackName || resolvedListId,
      updatedAt: updatedAt || existing?.updatedAt || "",
      serverConfirmed,
      missing
    })
  ]);
}

export function removePublicTemplateCatalogEntry(catalog = [], {
  id = "",
  listId = "",
  publicTemplateKind = PUBLIC_TEMPLATE_KIND_DEMO,
  role = ""
} = {}) {
  const targetId = normalizeText(id || listId);
  const kind = normalizeText(publicTemplateKind || role || PUBLIC_TEMPLATE_KIND_DEMO);
  if (!targetId) return Array.isArray(catalog) ? catalog : [];
  return (Array.isArray(catalog) ? catalog : []).filter((entry) => {
    const entryKind = normalizeText(entry?.publicTemplateKind || entry?.role || PUBLIC_TEMPLATE_KIND_SHARED);
    const entryId = normalizeText(entry?.id || entry?.listId);
    return entryKind !== kind || entryId !== targetId;
  });
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

export function publicDemoTemplatePayloadTarget(entry, {
  fallbackLanguage = "ru",
  demoListIdForLanguage = (language) => `${PUBLIC_DEMO_LIST_PREFIX}${normalizeLanguage(language)}`
} = {}) {
  const language = normalizeLanguage(entry?.language, normalizeLanguage(fallbackLanguage));
  const listId = normalizeText(entry?.listId || entry?.id) || normalizeText(demoListIdForLanguage(language));
  if (!listId) return null;
  const name = normalizeText(entry?.name || entry?.title);
  const itemKey = normalizeText(entry?.itemKey || entry?.item_key) || demoTemplateItemKeyFromListId(listId, language);
  return {
    language,
    listId,
    itemKey,
    name,
    updatedAt: normalizeText(entry?.updatedAt || entry?.updated_at)
  };
}

export function localDemoTemplateEntriesFromLayouts(layouts = {}, {
  fallbackLanguage = "ru"
} = {}) {
  return Object.values(layouts || {})
    .filter((layout) => layout?.adminDemo)
    .map((layout) => {
      const language = normalizeLanguage(layout.adminDemoLanguage || layout.language, normalizeLanguage(fallbackLanguage));
      const listId = normalizeText(layout.adminDemoListId) || normalizeText(demoTemplateEntryForLanguage(language).listId);
      if (!listId) return null;
      const name = normalizeText(layout.name || layout.title) || listId;
      return {
        id: listId,
        listId,
        name,
        title: name,
        language,
        publicTemplateKind: PUBLIC_TEMPLATE_KIND_DEMO,
        role: PUBLIC_TEMPLATE_KIND_DEMO,
        serverConfirmed: false,
        localDraftLayoutId: layout.id || "",
        updatedAt: normalizeText(layout.updatedAt)
      };
    })
    .filter(Boolean);
}

export function mergeDemoTemplateEntriesForAdmin(serverEntries = [], localEntries = []) {
  const serverConfirmedIds = new Set(
    (Array.isArray(serverEntries) ? serverEntries : [])
      .filter((entry) => entry?.serverConfirmed)
      .map((entry) => normalizeText(entry.listId || entry.id))
      .filter(Boolean)
  );
  const preparedLocalEntries = (Array.isArray(localEntries) ? localEntries : []).map((entry) => ({
    ...entry,
    serverConfirmed: Boolean(entry?.serverConfirmed || serverConfirmedIds.has(normalizeText(entry?.listId || entry?.id)))
  }));
  return mergePublicTemplateCatalogEntries(serverEntries, preparedLocalEntries);
}

function templateCandidateUpdatedAtValue(candidate) {
  const value = Date.parse(candidate?.updatedAt || candidate?.layout?.updatedAt || candidate?.entry?.updatedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function compareTemplateCandidateWinner(a, b) {
  const priority = Number(b?.priority || 0) - Number(a?.priority || 0);
  if (priority) return priority;
  const updated = templateCandidateUpdatedAtValue(b) - templateCandidateUpdatedAtValue(a);
  if (updated) return updated;
  return Number(a?.order || 0) - Number(b?.order || 0);
}

export function buildAdminDemoTemplateOptions({
  canOpen = false,
  localLayouts = [],
  serverTemplates = [],
  fallbackLanguage = "ru",
  isLayoutMeaningful = () => false,
  draftChoice = (layoutId) => layoutId ? `template-draft:${layoutId}` : "",
  demoChoiceForTemplate = (entry) => entry?.listId || entry?.id || "",
  normalizeDemoName = (name) => normalizeText(name),
  compareEntries = compareDemoTemplateOrder,
  labels = {}
} = {}) {
  if (!canOpen) return [];
  const languageLabel = labels.languageOptionLabel || ((language) => String(language || fallbackLanguage).toUpperCase());
  const optionLabel = labels.publicTemplateOptionLabel || (({ prefix, name, languageLabel: label }) =>
    `${prefix}: ${name} (${label})`);
  const templatePrefix = labels.templatePrefix || "Template";
  const defaultName = labels.defaultName || "Demo";
  const candidates = [];
  let order = 0;
  const pushCandidate = (candidate) => {
    const key = normalizeText(candidate?.key);
    if (!key) return;
    candidates.push({ ...candidate, key });
  };
  (Array.isArray(localLayouts) ? localLayouts : []).forEach((layout) => {
    if (!layout?.id || !layout.adminDemo || !layout.adminTemplateCopy) return;
    const language = normalizeLanguage(layout.adminDemoLanguage || layout.language, normalizeLanguage(fallbackLanguage));
    const listId = normalizeText(layout.adminDemoListId) || `draft:${layout.id}`;
    const name = normalizeText(normalizeDemoName(layout.name || defaultName, language)) || defaultName;
    pushCandidate({
      key: listId,
      layout,
      entry: {
        id: listId,
        listId,
        name,
        language,
        publicTemplateKind: PUBLIC_TEMPLATE_KIND_DEMO,
        role: PUBLIC_TEMPLATE_KIND_DEMO
      },
      priority: isLayoutMeaningful(layout.id) ? 120 : 75,
      updatedAt: layout.updatedAt || "",
      order: order++,
      option: [
        draftChoice(layout.id),
        optionLabel({
          prefix: templatePrefix,
          name,
          languageLabel: languageLabel(language),
          demo: true
        }),
        "demo"
      ]
    });
  });
  (Array.isArray(serverTemplates) ? serverTemplates : []).forEach((entry) => {
    if (entry?.missing) return;
    const listId = normalizeText(entry?.listId || entry?.id);
    if (!listId) return;
    const language = normalizeLanguage(entry.language, normalizeLanguage(fallbackLanguage));
    const name = normalizeText(entry.name || entry.title || defaultName) || defaultName;
    pushCandidate({
      key: listId,
      entry: {
        ...entry,
        id: listId,
        listId,
        name,
        language
      },
      priority: entry.serverConfirmed ? 95 : 40,
      updatedAt: entry.updatedAt || "",
      order: order++,
      option: [
        demoChoiceForTemplate({ ...entry, id: listId, listId, name, language }),
        optionLabel({
          prefix: templatePrefix,
          name,
          languageLabel: languageLabel(language),
          demo: true
        }),
        "demo"
      ]
    });
  });
  const byKey = new Map();
  candidates.forEach((candidate) => {
    const current = byKey.get(candidate.key);
    if (!current || compareTemplateCandidateWinner(current, candidate) > 0) {
      byKey.set(candidate.key, candidate);
    }
  });
  return [...byKey.values()]
    .sort((a, b) => compareEntries(a.entry, b.entry))
    .map((candidate) => candidate.option)
    .filter((option) => option[0]);
}
