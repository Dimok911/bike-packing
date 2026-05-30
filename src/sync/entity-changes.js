const ENTITY_MAP_KEYS = {
  items: "items",
  containers: "containers",
  layouts: "layouts"
};

const DICTIONARY_KEYS = [
  "categories",
  "locations",
  "customCategories",
  "customLocations",
  "hiddenCategories",
  "hiddenLocations"
];

export function normalizeEntityChangesRevision(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number.parseInt(String(value), 10);
  return Number.isFinite(number) && number >= 1 ? number : null;
}

export function canRequestEntityChanges({
  freshness = {},
  listId = "",
  syncMeta = {}
} = {}) {
  const localRevision = normalizeEntityChangesRevision(syncMeta.stateRevision);
  const remoteRevision = normalizeEntityChangesRevision(freshness.stateRevision);
  if (localRevision === null) return { ok: false, reason: "missing-local-revision" };
  if (remoteRevision === null) return { ok: false, reason: "missing-remote-revision" };
  if (remoteRevision <= localRevision) return { ok: false, reason: "not-newer" };

  const requestedListId = normalizeText(listId);
  const localListId = normalizeText(syncMeta.listId || syncMeta.currentListId);
  const remoteListId = normalizeText(freshness.listId || freshness.id);
  if (localListId && requestedListId && localListId !== requestedListId) return { ok: false, reason: "list-mismatch" };
  if (remoteListId && requestedListId && remoteListId !== requestedListId) return { ok: false, reason: "remote-list-mismatch" };

  return {
    ok: true,
    sinceRevision: localRevision,
    targetRevision: remoteRevision
  };
}

export function applyEntityChangesToState(sourceState, response = {}) {
  if (response?.fallbackRequired) {
    return {
      applied: false,
      fallbackRequired: true,
      reason: response.fallbackReason || "server-requested-fallback"
    };
  }
  if (!isObject(sourceState)) {
    return { applied: false, fallbackRequired: true, reason: "missing-local-state" };
  }

  const nextState = clonePlain(sourceState);
  ensureStateShape(nextState);
  const changes = isObject(response.changes) ? response.changes : {};
  let changedCount = 0;

  Object.entries(ENTITY_MAP_KEYS).forEach(([changeKey, stateKey]) => {
    const changeSet = normalizeChangeSet(changes[changeKey]);
    changedCount += applyChangedRecords(nextState[stateKey], changeSet.changed);
    changedCount += applyDeletedRecords(nextState[stateKey], changeSet.deleted);
  });

  const dictionaryChanges = normalizeChangeSet(changes.dictionaries);
  changedCount += applyDictionaryChanges(nextState, dictionaryChanges.changed);
  changedCount += applyDictionaryDeletes(nextState, dictionaryChanges.deleted);

  if (!nextState.layouts[nextState.activeLayoutId]) {
    nextState.activeLayoutId = Object.keys(nextState.layouts)[0] || "";
  }

  const stateRevision = normalizeEntityChangesRevision(response.stateRevision ?? response.revision);
  const sinceRevision = normalizeEntityChangesRevision(response.sinceRevision ?? response.sinceStateRevision);
  if (changedCount === 0 && stateRevision !== null && sinceRevision !== null && stateRevision > sinceRevision) {
    return {
      applied: false,
      fallbackRequired: true,
      reason: "revision-changed-without-entity-changes"
    };
  }
  return {
    applied: true,
    changedCount,
    state: nextState,
    meta: {
      id: normalizeText(response.id || response.listId),
      listId: normalizeText(response.listId || response.id),
      stateRevision,
      updatedAt: normalizeText(response.serverUpdatedAt || response.updatedAt),
      serverUpdatedAt: normalizeText(response.serverUpdatedAt || response.updatedAt)
    }
  };
}

function applyChangedRecords(targetMap, entries = []) {
  let count = 0;
  entries.forEach((entry) => {
    const payload = changePayload(entry);
    const id = normalizeText(payload?.id || entry?.id);
    if (!id) return;
    targetMap[id] = { ...payload, id };
    count += 1;
  });
  return count;
}

function applyDeletedRecords(targetMap, entries = []) {
  let count = 0;
  entries.forEach((entry) => {
    const id = normalizeText(entry?.id || entry?.payload?.id);
    if (!id || !Object.prototype.hasOwnProperty.call(targetMap, id)) return;
    delete targetMap[id];
    count += 1;
  });
  return count;
}

function applyDictionaryChanges(targetState, entries = []) {
  let count = 0;
  entries.forEach((entry) => {
    const payload = changePayload(entry);
    if (!payload) return;
    DICTIONARY_KEYS.forEach((key) => {
      if (Array.isArray(payload[key])) targetState[key] = normalizeStringList(payload[key]);
    });
    if (Array.isArray(payload.categoryDictionary) && !Array.isArray(payload.customCategories)) {
      targetState.customCategories = normalizeStringList(payload.categoryDictionary);
    }
    if (Array.isArray(payload.locationDictionary) && !Array.isArray(payload.customLocations)) {
      targetState.customLocations = normalizeStringList(payload.locationDictionary);
    }
    count += 1;
  });
  return count;
}

function applyDictionaryDeletes(targetState, entries = []) {
  if (!entries.length) return 0;
  DICTIONARY_KEYS.forEach((key) => {
    targetState[key] = [];
  });
  return entries.length;
}

function normalizeChangeSet(changeSet = {}) {
  return {
    changed: Array.isArray(changeSet.changed) ? changeSet.changed : [],
    deleted: Array.isArray(changeSet.deleted) ? changeSet.deleted : []
  };
}

function changePayload(entry) {
  if (!isObject(entry)) return null;
  if (isObject(entry.payload)) return clonePlain(entry.payload);
  if (isObject(entry.record)) return clonePlain(entry.record);
  return clonePlain(entry);
}

function ensureStateShape(targetState) {
  targetState.items = isObject(targetState.items) ? targetState.items : {};
  targetState.containers = isObject(targetState.containers) ? targetState.containers : {};
  targetState.layouts = isObject(targetState.layouts) ? targetState.layouts : {};
  targetState.packedItems = isObject(targetState.packedItems) ? targetState.packedItems : {};
  targetState.collapsedContainers = isObject(targetState.collapsedContainers) ? targetState.collapsedContainers : {};
  DICTIONARY_KEYS.forEach((key) => {
    targetState[key] = normalizeStringList(targetState[key]);
  });
}

function normalizeStringList(values = []) {
  const result = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = normalizeText(value);
    if (normalized && !result.includes(normalized)) result.push(normalized);
  });
  return result;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}
