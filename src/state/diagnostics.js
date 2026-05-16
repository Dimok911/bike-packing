export function isMeaningfulPackingState(targetState) {
  return Boolean(
    targetState &&
    Object.keys(targetState.items || {}).length &&
    Object.keys(targetState.containers || {}).length &&
    Object.keys(targetState.layouts || {}).length
  );
}

export function isPackingStateShape(targetState) {
  return Boolean(
    targetState &&
    targetState.items && typeof targetState.items === "object" &&
    targetState.containers && typeof targetState.containers === "object" &&
    targetState.layouts && typeof targetState.layouts === "object"
  );
}

export function stateStats(targetState) {
  const containers = targetState?.containers && typeof targetState.containers === "object" ? targetState.containers : {};
  const items = targetState?.items && typeof targetState.items === "object" ? targetState.items : {};
  const layouts = targetState?.layouts && typeof targetState.layouts === "object" ? targetState.layouts : {};
  const placedItems = Object.values(items).filter((item) => item?.containerId && containers[item.containerId]).length;
  const containerLinkedItems = new Set();
  Object.values(containers).forEach((container) => {
    (container?.itemIds || []).forEach((itemId) => {
      if (items[itemId]) containerLinkedItems.add(itemId);
    });
  });
  const arrangedItems = Object.values(layouts).reduce((max, layout) => {
    const count = Object.keys(layout?.arrangement?.items || {}).length;
    return Math.max(max, count);
  }, 0);
  const nestedContainers = Object.values(containers).filter((container) => container?.parentId && containers[container.parentId]).length;
  const arrangedNestedContainers = Object.values(layouts).reduce((max, layout) => {
    const layoutContainers = layout?.arrangement?.containers && typeof layout.arrangement.containers === "object"
      ? layout.arrangement.containers
      : {};
    const count = Object.values(layoutContainers).filter((placement) =>
      placement?.parentId && containers[placement.parentId]
    ).length;
    return Math.max(max, count);
  }, 0);
  const effectiveNestedContainers = Math.max(nestedContainers, arrangedNestedContainers);
  return {
    items: Object.keys(items).length,
    containers: Object.keys(containers).length,
    layouts: Object.keys(layouts).length,
    placedItems,
    linkedItems: containerLinkedItems.size,
    arrangedItems,
    nestedContainers: effectiveNestedContainers,
    rootContainers: Object.keys(containers).length - effectiveNestedContainers
  };
}

export function normalizeIntegrityCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

export function normalizeStateRevision(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.round(number) : null;
}

export function stateIntegrityMetaFromResponse(...sources) {
  const result = {
    payloadHash: null,
    entityHash: null,
    itemCount: null,
    containerCount: null,
    layoutCount: null,
    payloadSize: null,
    stateRevision: null,
    updatedAt: null
  };
  const candidates = [];
  sources.forEach((source) => {
    if (!source || typeof source !== "object") return;
    candidates.push(source);
    if (source.stateMeta && typeof source.stateMeta === "object") candidates.push(source.stateMeta);
    if (source.record && typeof source.record === "object") candidates.push(source.record);
    if (source.list && typeof source.list === "object") candidates.push(source.list);
  });
  candidates.forEach((source) => {
    result.payloadHash ||= readIntegrityValue(source, ["payloadHash", "payload_hash"]);
    result.entityHash ||= readIntegrityValue(source, ["entityHash", "entity_hash"]);
    result.itemCount ??= normalizeIntegrityCount(readIntegrityValue(source, ["itemCount", "item_count"]));
    result.containerCount ??= normalizeIntegrityCount(readIntegrityValue(source, ["containerCount", "container_count"]));
    result.layoutCount ??= normalizeIntegrityCount(readIntegrityValue(source, ["layoutCount", "layout_count"]));
    result.payloadSize ??= normalizeIntegrityCount(readIntegrityValue(source, ["payloadSize", "payload_size"]));
    result.stateRevision ??= normalizeStateRevision(readIntegrityValue(source, ["stateRevision", "state_revision", "revision"]));
    result.updatedAt ||= readIntegrityValue(source, ["updatedAt", "updated_at", "serverUpdatedAt", "server_updated_at"]);
  });
  return result;
}

export function hasStateIntegrityMeta(meta) {
  return Boolean(meta && (
    meta.payloadHash ||
    meta.entityHash ||
    meta.itemCount !== null ||
    meta.containerCount !== null ||
    meta.layoutCount !== null ||
    meta.payloadSize !== null ||
    meta.stateRevision !== null
  ));
}

export function integrityCountsMatchState(targetState, meta) {
  if (!targetState || !hasStateIntegrityMeta(meta)) return false;
  const stats = stateStats(targetState);
  if (meta.itemCount !== null && meta.itemCount !== stats.items) return false;
  if (meta.containerCount !== null && meta.containerCount !== stats.containers) return false;
  if (meta.layoutCount !== null && meta.layoutCount !== stats.layouts) return false;
  return true;
}

export function remoteStateIntegrityError(remoteState, meta, rawPayload = null) {
  if (!remoteState || !hasStateIntegrityMeta(meta)) return null;
  if (integrityCountsMatchState(rawPayload, meta)) return null;
  const stats = stateStats(remoteState);
  const mismatches = [];
  if (meta.itemCount !== null && meta.itemCount !== stats.items) mismatches.push(`items ${stats.items}/${meta.itemCount}`);
  if (meta.containerCount !== null && meta.containerCount !== stats.containers) mismatches.push(`containers ${stats.containers}/${meta.containerCount}`);
  if (meta.layoutCount !== null && meta.layoutCount !== stats.layouts) mismatches.push(`layouts ${stats.layouts}/${meta.layoutCount}`);
  if (!mismatches.length) return null;
  if (!isDangerousRemoteIntegrityMismatch(stats, meta)) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[bike-packing] State integrity count mismatch was kept as a warning", {
        mismatches,
        stats,
        meta
      });
    }
    return null;
  }
  const error = new Error(mismatches.join(", "));
  error.code = "state_integrity_mismatch";
  error.meta = meta;
  error.stats = stats;
  return error;
}

export function isDangerousRemoteIntegrityMismatch(stats, meta) {
  if (!stats || !meta) return false;
  if (meta.itemCount !== null && meta.itemCount >= 10 && stats.items === 0) return true;
  if (meta.containerCount !== null && meta.containerCount >= 2 && stats.containers === 0) return true;
  if (meta.layoutCount !== null && meta.layoutCount >= 1 && stats.layouts === 0) return true;
  return false;
}

function readIntegrityValue(source, keys) {
  if (!source || typeof source !== "object") return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return undefined;
}
