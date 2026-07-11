const normalizeText = (value) => String(value ?? "").trim();
export const STARTUP_CACHE_INTEGRITY_VERSION = 1;

const normalizeRevision = (value) => {
  if (value == null || value === "") return null;
  const number = Number.parseInt(String(value), 10);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const normalizeCount = (value) => {
  if (value == null || value === "") return null;
  const number = Number.parseInt(String(value), 10);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export function normalizeListFreshness(data = {}) {
  const source = data.freshness || data.list || data.record || data;
  const updatedAt = normalizeText(
    source.serverUpdatedAt ||
    source.updatedAt ||
    source.updated_at ||
    data.serverUpdatedAt ||
    data.updatedAt
  );
  return {
    id: normalizeText(source.id || source.listId || data.listId),
    listId: normalizeText(source.listId || source.id || data.listId),
    updatedAt,
    serverUpdatedAt: updatedAt,
    stateRevision: normalizeRevision(source.stateRevision ?? source.state_revision ?? data.stateRevision),
    payloadHash: normalizeText(source.payloadHash || source.payload_hash || data.payloadHash),
    entityHash: normalizeText(source.entityHash || source.entity_hash || data.entityHash),
    itemCount: normalizeCount(source.itemCount ?? source.item_count ?? data.itemCount),
    containerCount: normalizeCount(source.containerCount ?? source.container_count ?? data.containerCount),
    layoutCount: normalizeCount(source.layoutCount ?? source.layout_count ?? data.layoutCount)
  };
}

export function listFreshnessChanged(localMeta = {}, remoteFreshness = {}) {
  const remote = normalizeListFreshness(remoteFreshness);
  if (!hasListFreshnessSignal(remote)) return true;

  const localRevision = normalizeRevision(localMeta.stateRevision);
  if (localRevision != null && remote.stateRevision != null && localRevision !== remote.stateRevision) return true;

  const localUpdatedAt = normalizeText(localMeta.serverUpdatedAt || localMeta.updatedAt);
  if (localUpdatedAt && remote.updatedAt && localUpdatedAt !== remote.updatedAt) return true;

  const localPayloadHash = normalizeText(localMeta.payloadHash);
  if (localPayloadHash && remote.payloadHash && localPayloadHash !== remote.payloadHash) return true;

  const localEntityHash = normalizeText(localMeta.entityHash);
  if (localEntityHash && remote.entityHash && localEntityHash !== remote.entityHash) return true;

  if (!localUpdatedAt && localRevision == null && !localPayloadHash && !localEntityHash) return true;
  return false;
}

export function hasListFreshnessSignal(freshness = {}) {
  const normalized = normalizeListFreshness(freshness);
  return Boolean(
    normalized.updatedAt ||
    normalized.stateRevision != null ||
    normalized.payloadHash ||
    normalized.entityHash
  );
}

export function canUseCachedStartupState({
  accountMatches = true,
  currentListId = "",
  hasLocalState = false,
  localState = null,
  remoteFreshness = {},
  syncMeta = {}
} = {}) {
  if (!hasLocalState) return false;
  if (syncMeta?.dirty) return false;
  if (accountMatches === false) return false;
  if (Number(syncMeta?.cacheIntegrityVersion) !== STARTUP_CACHE_INTEGRITY_VERSION) return false;

  const remote = normalizeListFreshness(remoteFreshness);
  const activeListId = normalizeText(currentListId);
  const knownListId = normalizeText(syncMeta.listId || syncMeta.currentListId);
  const remoteListId = normalizeText(remote.listId || remote.id);

  if (knownListId && activeListId && knownListId !== activeListId) return false;
  if (activeListId && remoteListId && remoteListId !== activeListId) return false;

  const expectedItemCount = remote.itemCount ?? normalizeCount(syncMeta.itemCount);
  const expectedContainerCount = remote.containerCount ?? normalizeCount(syncMeta.containerCount);
  const expectedLayoutCount = remote.layoutCount ?? normalizeCount(syncMeta.layoutCount);
  if (localState && expectedItemCount > 0 && Object.keys(localState.items || {}).length === 0) return false;
  if (localState && expectedContainerCount > 0 && Object.keys(localState.containers || {}).length === 0) return false;
  if (localState && expectedLayoutCount > 0 && Object.keys(localState.layouts || {}).length === 0) return false;

  return !listFreshnessChanged(syncMeta, remote);
}
