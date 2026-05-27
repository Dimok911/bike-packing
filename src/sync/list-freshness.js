const normalizeText = (value) => String(value ?? "").trim();

const normalizeRevision = (value) => {
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
    entityHash: normalizeText(source.entityHash || source.entity_hash || data.entityHash)
  };
}

export function listFreshnessChanged(localMeta = {}, remoteFreshness = {}) {
  const remote = normalizeListFreshness(remoteFreshness);
  if (!remote.updatedAt && remote.stateRevision == null && !remote.payloadHash && !remote.entityHash) return true;

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
