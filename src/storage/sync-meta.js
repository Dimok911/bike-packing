import { safeSetLocalStorage } from "../utils/storage.js";

export function loadStoredSyncMeta(storageKey, {
  normalizeStateRevision = (value) => value ?? null,
  normalizeIntegrityCount = (value) => value ?? null
} = {}) {
  try {
    const meta = JSON.parse(localStorage.getItem(storageKey)) || {};
    return normalizeSyncMeta(meta, { normalizeStateRevision, normalizeIntegrityCount });
  } catch {
    return emptySyncMeta();
  }
}

export function saveStoredSyncMeta(storageKey, syncMeta) {
  safeSetLocalStorage(storageKey, JSON.stringify(syncMeta));
}

function normalizeSyncMeta(meta, {
  normalizeStateRevision,
  normalizeIntegrityCount
}) {
  return {
    dirty: Boolean(meta.dirty),
    serverUpdatedAt: meta.serverUpdatedAt || null,
    localUpdatedAt: meta.localUpdatedAt || null,
    lastSyncedLocalUpdatedAt: meta.lastSyncedLocalUpdatedAt || null,
    stateRevision: normalizeStateRevision(meta.stateRevision ?? meta.state_revision),
    payloadHash: meta.payloadHash || null,
    entityHash: meta.entityHash || null,
    accountKey: meta.accountKey || null,
    accountEmail: meta.accountEmail || null,
    accountId: meta.accountId || null,
    itemCount: normalizeIntegrityCount(meta.itemCount),
    containerCount: normalizeIntegrityCount(meta.containerCount),
    layoutCount: normalizeIntegrityCount(meta.layoutCount),
    payloadSize: normalizeIntegrityCount(meta.payloadSize)
  };
}

function emptySyncMeta() {
  return {
    dirty: false,
    serverUpdatedAt: null,
    localUpdatedAt: null,
    lastSyncedLocalUpdatedAt: null,
    stateRevision: null,
    payloadHash: null,
    entityHash: null,
    accountKey: null,
    accountEmail: null,
    accountId: null,
    itemCount: null,
    containerCount: null,
    layoutCount: null,
    payloadSize: null
  };
}
