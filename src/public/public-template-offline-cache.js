const CACHE_SCHEMA_VERSION = 1;

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeLanguage(value = "") {
  return normalizeText(value).toLowerCase();
}

function isPublicTemplatePayload(payload) {
  return Boolean(
    payload &&
    payload.items && typeof payload.items === "object" &&
    payload.containers && typeof payload.containers === "object" &&
    payload.layouts && typeof payload.layouts === "object"
  );
}

function normalizeDemoTemplate(entry) {
  const id = normalizeText(entry?.listId || entry?.id);
  const language = normalizeLanguage(entry?.language);
  if (!id || !language) return null;
  const name = normalizeText(entry?.name || entry?.title || id) || id;
  return {
    id,
    listId: id,
    itemKey: normalizeText(entry?.itemKey),
    payloadEndpoint: normalizeText(entry?.payloadEndpoint),
    name,
    title: name,
    language,
    publicTemplateKind: "demo",
    role: "demo",
    serverConfirmed: true,
    missing: false,
    createdAt: normalizeText(entry?.createdAt),
    updatedAt: normalizeText(entry?.updatedAt)
  };
}

function normalizeSharedTemplate(entry) {
  const id = normalizeText(entry?.id);
  const language = normalizeLanguage(entry?.language);
  if (!id || !language || !isPublicTemplatePayload(entry?.statePayload)) return null;
  return {
    id,
    name: normalizeText(entry?.name || id) || id,
    language,
    updatedAt: normalizeText(entry?.updatedAt),
    runtimeSharedTemplate: true,
    serverConfirmed: true,
    statePayload: entry.statePayload
  };
}

function normalizePayloadMap(source = {}) {
  return Object.fromEntries(Object.entries(source || {})
    .map(([key, payload]) => [normalizeText(key), payload])
    .filter(([key, payload]) => key && isPublicTemplatePayload(payload)));
}

export function normalizePublicTemplateOfflineCache(value) {
  if (!value || typeof value !== "object" || Number(value.version) !== CACHE_SCHEMA_VERSION) return null;
  return {
    version: CACHE_SCHEMA_VERSION,
    savedAt: normalizeText(value.savedAt),
    demoTemplates: (Array.isArray(value.demoTemplates) ? value.demoTemplates : [])
      .map(normalizeDemoTemplate)
      .filter(Boolean),
    demoPayloadsByLanguage: normalizePayloadMap(value.demoPayloadsByLanguage),
    demoPayloadsByTemplateId: normalizePayloadMap(value.demoPayloadsByTemplateId),
    sharedTemplates: (Array.isArray(value.sharedTemplates) ? value.sharedTemplates : [])
      .map(normalizeSharedTemplate)
      .filter(Boolean)
  };
}

export function loadPublicTemplateOfflineCache(storageKey, {
  storage = globalThis.localStorage
} = {}) {
  if (!storageKey || !storage?.getItem) return null;
  try {
    const raw = storage.getItem(storageKey);
    return raw ? normalizePublicTemplateOfflineCache(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function createPublicTemplateOfflineCache({
  demoTemplates = [],
  demoPayloadsByLanguage = {},
  demoPayloadsByTemplateId = {},
  sharedLayoutsByLanguage = {},
  demoTemplateIds = null,
  sharedLayoutIds = null,
  savedAt = new Date().toISOString()
} = {}) {
  const filterDemoTemplates = Array.isArray(demoTemplateIds);
  const filterSharedTemplates = Array.isArray(sharedLayoutIds);
  const allowedDemoIds = new Set((filterDemoTemplates ? demoTemplateIds : [])
    .map(normalizeText)
    .filter(Boolean));
  const allowedSharedIds = new Set((filterSharedTemplates ? sharedLayoutIds : [])
    .map(normalizeText)
    .filter(Boolean));
  const normalizedDemoTemplates = (Array.isArray(demoTemplates) ? demoTemplates : [])
    .map(normalizeDemoTemplate)
    .filter((entry) => entry && (!filterDemoTemplates || allowedDemoIds.has(entry.id)));
  const normalizedDemoIds = new Set(normalizedDemoTemplates.map((entry) => entry.id));
  const templatePayloads = Object.fromEntries(Object.entries(normalizePayloadMap(demoPayloadsByTemplateId))
    .filter(([id]) => normalizedDemoIds.has(id)));
  const demoLanguages = new Set(normalizedDemoTemplates.map((entry) => entry.language));
  const languagePayloads = Object.fromEntries(Object.entries(normalizePayloadMap(demoPayloadsByLanguage))
    .filter(([language]) => demoLanguages.has(normalizeLanguage(language))));
  const sharedTemplates = Object.values(sharedLayoutsByLanguage || {})
    .flatMap((entries) => Array.isArray(entries) ? entries : [])
    .map(normalizeSharedTemplate)
    .filter((entry) => entry && (!filterSharedTemplates || allowedSharedIds.has(entry.id)));
  return normalizePublicTemplateOfflineCache({
    version: CACHE_SCHEMA_VERSION,
    savedAt,
    demoTemplates: normalizedDemoTemplates,
    demoPayloadsByLanguage: languagePayloads,
    demoPayloadsByTemplateId: templatePayloads,
    sharedTemplates: [...new Map(sharedTemplates.map((entry) => [entry.id, entry])).values()]
  });
}

export function savePublicTemplateOfflineCache(storageKey, source, {
  storage = globalThis.localStorage
} = {}) {
  const cache = normalizePublicTemplateOfflineCache(source);
  if (!storageKey || !cache || !storage?.setItem) return false;
  try {
    storage.setItem(storageKey, JSON.stringify(cache));
    return true;
  } catch {
    return false;
  }
}

export function hydratePublicTemplateOfflineCache(cache, {
  demoTemplates = [],
  sharedTemplates = [],
  mergeDemoTemplates,
  mergeSharedTemplates,
  setDemoPayload,
  upsertSharedTemplate
} = {}) {
  const normalized = normalizePublicTemplateOfflineCache(cache);
  if (!normalized) return { demoTemplates, sharedTemplates, hydrated: false };
  Object.entries(normalized.demoPayloadsByTemplateId).forEach(([listId, payload]) => {
    const entry = normalized.demoTemplates.find((candidate) => candidate.id === listId);
    if (entry) setDemoPayload?.(entry.language, payload, { listId });
  });
  Object.entries(normalized.demoPayloadsByLanguage).forEach(([language, payload]) => {
    setDemoPayload?.(language, payload);
  });
  normalized.sharedTemplates.forEach((entry) => upsertSharedTemplate?.(entry));
  return {
    demoTemplates: typeof mergeDemoTemplates === "function"
      ? mergeDemoTemplates(demoTemplates, normalized.demoTemplates)
      : normalized.demoTemplates,
    sharedTemplates: typeof mergeSharedTemplates === "function"
      ? mergeSharedTemplates(sharedTemplates, normalized.sharedTemplates)
      : normalized.sharedTemplates,
    hydrated: true
  };
}
