import {
  ITEM_SYNC_MAX_BATCH_BYTES,
  ITEM_SYNC_MAX_BATCH_ITEMS
} from "../config/constants.js";
import { jsonUtf8ByteLength } from "../utils/json.js";
import { nowIso } from "../utils/time.js";
import {
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
  }
};

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
  const baseRecords = normalizedBase?.[config.mapKey] && typeof normalizedBase[config.mapKey] === "object" ? normalizedBase[config.mapKey] : {};
  const localRecords = normalizedLocal?.[config.mapKey] && typeof normalizedLocal[config.mapKey] === "object" ? normalizedLocal[config.mapKey] : {};
  const changedAt = forceOverwrite ? nowIso() : (localUpdatedAt || nowIso());
  const ids = new Set([...Object.keys(baseRecords), ...Object.keys(localRecords)]);
  const entries = [];
  ids.forEach((recordId) => {
    const localPayload = config.compact(localRecords[recordId]);
    const basePayload = config.compact(baseRecords[recordId]);
    if (!localPayload && !basePayload) return;
    if (!forceOverwrite && localPayload && basePayload && sameJson(localPayload, basePayload)) return;
    const payload = localPayload || basePayload || { id: recordId };
    entries.push({
      id: recordId,
      deleted: !localPayload,
      clientUpdatedAt: forceOverwrite ? changedAt : (payload.updatedAt || payload.clientUpdatedAt || changedAt),
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
  return cloned;
}

export function hasLegacyPayloadChanges(baseState, localState, entitySync = null, deps = {}) {
  if (!baseState) return true;
  return !sameJson(
    legacyComparableStateForSync(baseState, entitySync, deps),
    legacyComparableStateForSync(localState, entitySync, deps)
  );
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
  syncDevice,
  syncMeta
} = {}) {
  const config = ENTITY_SYNC_CONFIG[type] || ENTITY_SYNC_CONFIG.item;
  const body = {
    clientDeviceId: syncDevice.id,
    clientDeviceName: syncDevice.name,
    baseStateRevision: syncMeta.stateRevision ?? null,
    stateRevision: syncMeta.stateRevision ?? null,
    force: forceOverwrite,
    forceOverwrite
  };
  body[config.bodyKey] = entries;
  return body;
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

function sameJson(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
