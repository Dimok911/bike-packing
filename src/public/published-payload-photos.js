const clonePlain = (value) => JSON.parse(JSON.stringify(value));

const recordId = (record) => String(record?.id || record?.key || record?.slug || "").trim();

function recordMapFromCollection(collection) {
  const map = new Map();
  if (collection && typeof collection === "object" && !Array.isArray(collection)) {
    Object.entries(collection).forEach(([key, value]) => {
      const id = recordId(value) || String(key || "").trim();
      if (id) map.set(id, value);
    });
    return map;
  }
  if (Array.isArray(collection)) {
    collection.forEach((value) => {
      const id = recordId(value);
      if (id) map.set(id, value);
    });
  }
  return map;
}

function sourceRecordForLocalRecord(sourceMap, type, record, recordKey, publishedEntityId) {
  const candidates = [
    publishedEntityId?.(type, record, recordKey),
    record?.sharedSourceId,
    record?.publicCopySourceId,
    record?.id,
    recordKey,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  return candidates.map((id) => sourceMap.get(id)).find(Boolean) || null;
}

export function applyPublishedPayloadPhotosToLayoutState(targetState, layoutId, publishedPayload, deps = {}) {
  const layout = targetState?.layouts?.[layoutId];
  if (!layout || !publishedPayload) return false;
  const getLayoutContainerIdSet = deps.getLayoutContainerIdSet;
  const getLayoutItemIdSet = deps.getLayoutItemIdSet;
  if (typeof getLayoutContainerIdSet !== "function" || typeof getLayoutItemIdSet !== "function") return false;

  const clone = deps.clone || clonePlain;
  const publishedEntityId = deps.publishedEntityId || ((type, record, recordKey) => record?.id || recordKey);
  const sourceContainers = recordMapFromCollection(publishedPayload.containers);
  const sourceItems = recordMapFromCollection(publishedPayload.items);
  let changed = false;

  const applyPhotos = (targetRecord, sourceRecord) => {
    if (!targetRecord || !Array.isArray(sourceRecord?.photos)) return;
    targetRecord.photos = clone(sourceRecord.photos);
    changed = true;
  };

  getLayoutContainerIdSet(targetState, layout).forEach((containerId) => {
    const targetRecord = targetState.containers?.[containerId];
    const sourceRecord = sourceRecordForLocalRecord(sourceContainers, "container", targetRecord, containerId, publishedEntityId);
    applyPhotos(targetRecord, sourceRecord);
  });
  getLayoutItemIdSet(targetState, layout).forEach((itemId) => {
    const targetRecord = targetState.items?.[itemId];
    const sourceRecord = sourceRecordForLocalRecord(sourceItems, "item", targetRecord, itemId, publishedEntityId);
    applyPhotos(targetRecord, sourceRecord);
  });

  return changed;
}
