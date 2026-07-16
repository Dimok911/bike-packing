import {
  ITEM_SYNC_MAX_BATCH_BYTES,
  ITEM_SYNC_MAX_BATCH_ITEMS
} from "../config/constants.js";
import { jsonUtf8ByteLength } from "../utils/json.js";
import { nowIso } from "../utils/time.js";
import {
  compactDictionaryForEntitySync,
  compactContainerForEntitySync,
  compactItemForEntitySync,
  compactLayoutForEntitySync
} from "./serialize.js";

export const ENTITY_SYNC_CONFIG = {
  item: {
    mapKey: "items",
    bodyKey: "items",
    endpoint: "items",
    compact: compactItemForEntitySync,
    tableName: "bike_packing_items",
    fallbackText: "failed to sync list items"
  },
  container: {
    mapKey: "containers",
    bodyKey: "containers",
    endpoint: "containers",
    compact: compactContainerForEntitySync,
    tableName: "bike_packing_containers",
    fallbackText: "failed to sync list containers"
  },
  layout: {
    mapKey: "layouts",
    bodyKey: "layouts",
    endpoint: "layouts",
    compact: compactLayoutForEntitySync,
    tableName: "bike_packing_layouts",
    fallbackText: "failed to sync list layouts"
  },
  dictionary: {
    bodyKey: "dictionaries",
    endpoint: "dictionaries",
    compact: compactDictionaryForEntitySync,
    records: (state) => ({
      "dictionary-state": {
        id: "dictionary-state",
        categories: state?.categories,
        locations: state?.locations,
        customCategories: state?.customCategories,
        customLocations: state?.customLocations,
        hiddenCategories: state?.hiddenCategories,
        hiddenLocations: state?.hiddenLocations,
        categoryDictionary: state?.categoryDictionary,
        locationDictionary: state?.locationDictionary
      }
    }),
    tableName: "bike_packing_dictionaries",
    fallbackText: "failed to sync list dictionaries"
  }
};

const DICTIONARY_SYNC_STATE_KEYS = [
  "categories",
  "locations",
  "customCategories",
  "customLocations",
  "hiddenCategories",
  "hiddenLocations",
  "categoryDictionary",
  "locationDictionary"
];

export function normalizedEntitySyncState(sourceState, { cloneStateForSync, createEmptyUserState }) {
  return cloneStateForSync(sourceState || createEmptyUserState(), { forSync: true });
}

export function buildChangedEntitySyncEntries(type, baseState, localState, {
  forceOverwrite = false,
  cloneStateForSync,
  createEmptyUserState,
  localUpdatedAt = ""
} = {}) {
  const config = ENTITY_SYNC_CONFIG[type];
  if (!config) return [];
  const normalizedBase = normalizedEntitySyncState(baseState, { cloneStateForSync, createEmptyUserState });
  const normalizedLocal = normalizedEntitySyncState(localState, { cloneStateForSync, createEmptyUserState });
  const recordsForState = typeof config.records === "function"
    ? config.records
    : (state) => state?.[config.mapKey] && typeof state[config.mapKey] === "object" ? state[config.mapKey] : {};
  const baseRecords = recordsForState(normalizedBase);
  const localRecords = recordsForState(normalizedLocal);
  const changedAt = forceOverwrite ? nowIso() : (localUpdatedAt || nowIso());
  const ids = new Set([...Object.keys(baseRecords), ...Object.keys(localRecords)]);
  const entries = [];
  ids.forEach((recordId) => {
    const localPayload = config.compact(localRecords[recordId]);
    const basePayload = config.compact(baseRecords[recordId]);
    if (!localPayload && !basePayload) return;
    if (!forceOverwrite && localPayload && basePayload && sameJson(localPayload, basePayload)) return;
    const payload = localPayload || basePayload || { id: recordId };
    const clientUpdatedAt = forceOverwrite
      ? changedAt
      : newestIsoTimestamp(changedAt, payload.updatedAt, payload.clientUpdatedAt) || changedAt;
    entries.push({
      id: recordId,
      deleted: !localPayload,
      clientUpdatedAt,
      payload
    });
  });
  return entries;
}

export function buildChangedItemSyncEntries(baseState, localState, options = {}) {
  return buildChangedEntitySyncEntries("item", baseState, localState, options);
}

export function legacyComparableStateForSync(sourceState, entitySync = null, deps = {}) {
  const cloned = normalizedEntitySyncState(sourceState, deps);
  if (!entitySync || entitySync.item?.safeForLegacyCompare !== false) delete cloned.items;
  if (entitySync?.container?.safeForLegacyCompare !== false) delete cloned.containers;
  if (entitySync?.layout?.safeForLegacyCompare !== false) delete cloned.layouts;
  if (entitySync?.dictionary?.safeForLegacyCompare !== false) {
    DICTIONARY_SYNC_STATE_KEYS.forEach((key) => delete cloned[key]);
  }
  return cloned;
}

export function hasLegacyPayloadChanges(baseState, localState, entitySync = null, deps = {}) {
  if (!baseState) return true;
  return legacyComparableTopLevelDiffKeys(baseState, localState, entitySync, deps).length > 0;
}

export function legacyComparableTopLevelDiffKeys(baseState, localState, entitySync = null, deps = {}) {
  if (!baseState) return ["<missing-base-state>"];
  const baseComparable = legacyComparableStateForSync(baseState, entitySync, deps);
  const localComparable = legacyComparableStateForSync(localState, entitySync, deps);
  const keys = new Set([
    ...Object.keys(baseComparable || {}),
    ...Object.keys(localComparable || {})
  ]);
  return [...keys]
    .filter((key) => !sameJson(baseComparable?.[key], localComparable?.[key]))
    .sort();
}

export function isEntitySyncUnavailableError(error, type = "item") {
  const config = ENTITY_SYNC_CONFIG[type] || ENTITY_SYNC_CONFIG.item;
  const text = `${error?.message || ""} ${error?.data?.message || ""} ${error?.data?.error || ""} ${error?.data?.code || ""}`.toLowerCase();
  return error?.status === 404 ||
    error?.status === 405 ||
    text.includes(config.tableName) ||
    text.includes("no such table") ||
    text.includes(config.fallbackText);
}

export function isItemEntitySyncUnavailableError(error) {
  return isEntitySyncUnavailableError(error, "item");
}

export function buildEntitySyncBody(type, entries, {
  forceOverwrite = false,
  historyAction = {},
  syncDevice,
  syncMeta
} = {}) {
  const config = ENTITY_SYNC_CONFIG[type] || ENTITY_SYNC_CONFIG.item;
  const body = {
    clientDeviceId: syncDevice.id,
    clientDeviceName: syncDevice.name,
    baseStateRevision: syncMeta.stateRevision ?? null,
    stateRevision: syncMeta.stateRevision ?? null,
    changeGroupId: historyAction.changeGroupId || null,
    affectedLayoutIds: historyAction.affectedLayoutIds || [],
    changeScope: historyAction.changeScope || null,
    force: forceOverwrite,
    forceOverwrite
  };
  body[config.bodyKey] = entries;
  return body;
}

export function rememberEntitySyncResultMeta(result, {
  rememberRemoteIntegrityMeta = () => {},
  syncMeta
} = {}) {
  if (!result?.attempted || !syncMeta) return false;
  if (result.serverUpdatedAt) syncMeta.serverUpdatedAt = result.serverUpdatedAt;
  rememberRemoteIntegrityMeta(result.integrityMeta);
  return true;
}

export function buildItemSyncBody(entries, options = {}) {
  return buildEntitySyncBody("item", entries, options);
}

export function splitEntitySyncEntries(type, entries, options = {}) {
  const batches = [];
  let current = [];
  entries.forEach((entry) => {
    const singleBytes = jsonUtf8ByteLength(buildEntitySyncBody(type, [entry], options));
    if (!current.length) {
      current.push(entry);
      return;
    }
    const nextBytes = jsonUtf8ByteLength(buildEntitySyncBody(type, [...current, entry], options));
    const tooManyItems = current.length >= ITEM_SYNC_MAX_BATCH_ITEMS;
    const tooManyBytes = nextBytes > ITEM_SYNC_MAX_BATCH_BYTES && singleBytes <= ITEM_SYNC_MAX_BATCH_BYTES;
    if (tooManyItems || tooManyBytes) {
      batches.push(current);
      current = [entry];
      return;
    }
    current.push(entry);
  });
  if (current.length) batches.push(current);
  return batches;
}

export function splitItemSyncEntries(entries, options = {}) {
  return splitEntitySyncEntries("item", entries, options);
}

export async function syncEntityBatchesSequentially(batches = [], {
  onBatchResult = () => {},
  sendBatch = async () => ({})
} = {}) {
  const results = [];
  for (const batch of batches) {
    const result = await sendBatch(batch);
    results.push(result);
    onBatchResult(result, batch);
  }
  return results;
}

export async function syncEntityBatchWithRevisionRetry(batch, {
  refreshRevision = () => false,
  sendBatch = async () => ({})
} = {}) {
  try {
    return await sendBatch(batch);
  } catch (error) {
    if (!isEntitySyncRevisionConflict(error) || !refreshRevision(error)) throw error;
    return sendBatch(batch);
  }
}

export function isEntitySyncRevisionConflict(error) {
  const code = String(error?.data?.code || error?.code || "").trim();
  return error?.status === 409 && [
    "stale_state_revision",
    "state_revision_mismatch",
    "missing_base_state_revision"
  ].includes(code);
}

function sameJson(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function newestIsoTimestamp(...values) {
  let best = "";
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) continue;
    const time = Date.parse(text);
    if (!Number.isFinite(time)) {
      if (!best) best = text;
      continue;
    }
    if (time > bestTime) {
      best = text;
      bestTime = time;
    }
  }
  return best;
}
