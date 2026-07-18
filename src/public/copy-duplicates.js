export function publicCopyComparableText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function publicCopyPhotoKey(record) {
  const photo = Array.isArray(record?.photos) ? record.photos.find((entry) => entry?.id || entry?.url || entry?.thumbUrl) : null;
  if (!photo) return "";
  return publicCopyComparableText(photo.id || photo.photoId || photo.url || photo.thumbUrl).replace(/[?#].*$/, "");
}

export function publicCopyPhotoFingerprint(record) {
  return (Array.isArray(record?.photos) ? record.photos : [])
    .map((photo) => publicCopyComparableText(photo?.id || photo?.photoId || photo?.url || photo?.thumbUrl).replace(/[?#].*$/, ""))
    .filter(Boolean)
    .sort()
    .join("|");
}

function publicCopyDimensionsFingerprint(record) {
  const dimensions = record?.dimensions && typeof record.dimensions === "object" ? record.dimensions : {};
  const values = [dimensions.width, dimensions.height, dimensions.depth]
    .map((value) => Number(value || 0));
  return values.some((value) => value > 0) ? values.join("x") : "";
}

export function publicCopyRecordContentHash(record, kind = "item", { containerCategories, itemCategories, itemQuantity } = {}) {
  let content = "";
  if (kind === "container") {
    const fields = [
      publicCopyLegacyContainerFingerprint(record, { containerCategories }),
      publicCopyComparableText(record?.note),
      publicCopyComparableText(record?.color),
      publicCopyPhotoFingerprint(record)
    ];
    const dimensions = publicCopyDimensionsFingerprint(record);
    if (dimensions) fields.push(dimensions);
    content = fields.join("\u001f");
  } else {
    content = [
      publicCopyItemContentFingerprint(record, { itemCategories, itemQuantity }),
      publicCopyComparableText(record?.note),
      publicCopyPhotoFingerprint(record)
    ].join("\u001f");
  }
  return publicCopyStableHash(content);
}

export function publicCopyStableHash(value) {
  const text = String(value || "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function publicCopyItemFingerprint(item, { itemCategories = (record) => record?.categories || (record?.category ? [record.category] : []), itemQuantity = (record) => record?.quantity ?? 1 } = {}) {
  if (!item) return "";
  return [
    publicCopyItemContentFingerprint(item, { itemCategories, itemQuantity }),
    publicCopyPhotoKey(item)
  ].join("\u001f");
}

export function publicCopyItemContentFingerprint(item, { itemCategories = (record) => record?.categories || (record?.category ? [record.category] : []), itemQuantity = (record) => record?.quantity ?? 1 } = {}) {
  if (!item) return "";
  const categories = itemCategories(item).map(publicCopyComparableText).sort().join("|");
  const fields = [
    publicCopyComparableText(item.name),
    Number(item.weight || 0),
    itemQuantity(item),
    publicCopyComparableText(item.location),
    categories
  ];
  const color = publicCopyComparableText(item.color);
  const dimensions = publicCopyDimensionsFingerprint(item);
  if (color || dimensions) fields.push(color, dimensions);
  return fields.join("\u001f");
}

export function publicCopyContainerFingerprint(container, { containerCategories = (record) => record?.categories || (record?.category ? [record.category] : []) } = {}) {
  const fields = publicCopyLegacyContainerFingerprint(container, { containerCategories }).split("\u001f");
  const color = publicCopyComparableText(container?.color);
  const dimensions = publicCopyDimensionsFingerprint(container);
  if (color || dimensions) fields.push(color, dimensions);
  return fields.join("\u001f");
}

function publicCopyLegacyContainerFingerprint(container, { containerCategories = (record) => record?.categories || (record?.category ? [record.category] : []) } = {}) {
  if (!container) return "";
  const categories = containerCategories(container).map(publicCopyComparableText).sort().join("|");
  return [
    publicCopyComparableText(container.name),
    Number(container.weight || 0),
    Number(container.volume || 0),
    publicCopyComparableText(container.location),
    categories,
    publicCopyPhotoKey(container)
  ].join("\u001f");
}

function sourceIdVariants(value) {
  const ids = new Set();
  let id = String(value || "").trim();
  if (!id) return ids;
  ids.add(id);
  let previous = "";
  while (id && id !== previous) {
    previous = id;
    id = id
      .replace(/^admin-demo-container-\d+-/, "")
      .replace(/^admin-demo-item-\d+-/, "")
      .replace(/^container-shared-/, "")
      .replace(/^item-shared-/, "")
      .replace(/^shared-container-/, "")
      .replace(/^shared-item-/, "")
      .replace(/^shared-virtual-container-/, "")
      .replace(/^shared-virtual-item-/, "");
    if (id) ids.add(id);
  }
  return ids;
}

function copySourceIds(record, kind, fallbackId = "") {
  const ids = new Set();
  const add = (value) => {
    sourceIdVariants(value).forEach((id) => ids.add(id));
  };
  add(fallbackId);
  if (record?._publicCopySourceKind === kind) add(record._publicCopySourceId);
  add(record?.sharedSourceId);
  add(kind === "container" ? record?.sharedSourceContainerId : record?.sharedSourceItemId);
  add(kind === "container" ? record?.publicSourceContainerId : record?.publicSourceItemId);
  add(record?.publicSourceId);
  add(record?.templateSourceId);
  add(record?.sourceEntityId);
  add(record?.sourceId || record?.source_id);
  return ids;
}

function recordSourceContentHash(record, kind, options = {}) {
  return String(record?._publicCopySourceKind === kind ? record?._publicCopySourceContentHash || "" : "").trim();
}

function setsIntersect(left, right) {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function recordIsEditedAfterPublicCopy(record, kind, options = {}) {
  const sourceHash = recordSourceContentHash(record, kind, options);
  if (!sourceHash) return false;
  return publicCopyRecordContentHash(record, kind, options) !== sourceHash;
}

function copiedFromSameSourceWithCompatibleContent(record, kind, fallbackId, sourceIds, sourceContentHashes, options = {}) {
  const copiedFromSameSource = setsIntersect(copySourceIds(record, kind, fallbackId), sourceIds);
  if (!copiedFromSameSource) return false;
  if (!sourceContentHashes.size) return true;
  const targetSourceHash = recordSourceContentHash(record, kind, options);
  if (!targetSourceHash) return true;
  if (!sourceContentHashes.has(targetSourceHash)) return false;
  return !recordIsEditedAfterPublicCopy(record, kind, options);
}

export function summarizePublicCopyDuplicates({
  sourceSnapshot,
  targetContainerIds = [],
  targetItemIds = [],
  containers = {},
  items = {},
  itemCategories,
  itemQuantity,
  hasPrivateSyncBlockedPublicOrigin
}) {
  const sourceContainerIds = new Set();
  const sourceItemIds = new Set();
  Object.entries(sourceSnapshot?.containers || {}).forEach(([id, container]) => {
    copySourceIds(container, "container", id).forEach((sourceId) => sourceContainerIds.add(sourceId));
  });
  Object.entries(sourceSnapshot?.items || {}).forEach(([id, item]) => {
    copySourceIds(item, "item", id).forEach((sourceId) => sourceItemIds.add(sourceId));
  });
  const sourceContainerContentHashes = new Set(
    Object.values(sourceSnapshot?.containers || {}).map((container) =>
      publicCopyRecordContentHash(container, "container")
    ).filter(Boolean)
  );
  const sourceItemContentHashes = new Set(
    Object.values(sourceSnapshot?.items || {}).map((item) =>
      publicCopyRecordContentHash(item, "item", { itemCategories, itemQuantity })
    ).filter(Boolean)
  );
  const sourceContainerFingerprints = new Set(
    Object.values(sourceSnapshot?.containers || {}).map(publicCopyContainerFingerprint).filter(Boolean)
  );
  const sourceItemFingerprints = new Set(
    Object.values(sourceSnapshot?.items || {}).map((item) =>
      publicCopyItemFingerprint(item, { itemCategories, itemQuantity })
    ).filter(Boolean)
  );
  const sourceItemContentFingerprints = new Set(
    Object.values(sourceSnapshot?.items || {}).map((item) =>
      publicCopyItemContentFingerprint(item, { itemCategories, itemQuantity })
    ).filter(Boolean)
  );
  const result = { containerIds: [], itemIds: [] };
  if (!sourceContainerIds.size && !sourceItemIds.size && !sourceContainerFingerprints.size && !sourceItemFingerprints.size) {
    return result;
  }

  targetContainerIds.forEach((containerId) => {
    const container = containers[containerId];
    if (!container) return;
    const copiedFromSameSource = copiedFromSameSourceWithCompatibleContent(
      container,
      "container",
      containerId,
      sourceContainerIds,
      sourceContainerContentHashes
    );
    const sameId = sourceContainerIds.has(String(containerId));
    const looksLikeSamePublicContainer =
      sourceContainerFingerprints.size &&
      sourceContainerFingerprints.has(publicCopyContainerFingerprint(container));
    if (copiedFromSameSource || sameId || looksLikeSamePublicContainer) result.containerIds.push(containerId);
  });

  targetItemIds.forEach((itemId) => {
    const item = items[itemId];
    if (!item) return;
    const copiedFromSameSource = copiedFromSameSourceWithCompatibleContent(
      item,
      "item",
      itemId,
      sourceItemIds,
      sourceItemContentHashes,
      { itemCategories, itemQuantity }
    );
    const sameId = sourceItemIds.has(String(itemId));
    const blockedPublicOrigin = typeof hasPrivateSyncBlockedPublicOrigin === "function" &&
      hasPrivateSyncBlockedPublicOrigin(item, itemId);
    const looksLikeSamePublicItem =
      !blockedPublicOrigin &&
      sourceItemFingerprints.size &&
      sourceItemFingerprints.has(publicCopyItemFingerprint(item, { itemCategories, itemQuantity }));
    const looksLikeSamePublicItemContent =
      sourceItemContentFingerprints.size &&
      sourceItemContentFingerprints.has(publicCopyItemContentFingerprint(item, { itemCategories, itemQuantity }));
    if (copiedFromSameSource || sameId || looksLikeSamePublicItem || looksLikeSamePublicItemContent) result.itemIds.push(itemId);
  });

  return {
    containerIds: [...new Set(result.containerIds)],
    itemIds: [...new Set(result.itemIds)]
  };
}

export function planPublicCopyMissingItems({
  sourceSnapshot,
  targetContainerIds = [],
  targetItemIds = [],
  containers = {},
  items = {},
  itemCategories,
  itemQuantity,
  hasPrivateSyncBlockedPublicOrigin
}) {
  const targetContainerIdSet = new Set(targetContainerIds);
  const sourceContainers = Object.entries(sourceSnapshot?.containers || {});
  const sourceItems = Object.entries(sourceSnapshot?.items || {});
  const containerMatches = new Map();

  sourceContainers.forEach(([sourceContainerId, sourceContainer]) => {
    const sourceIds = copySourceIds(sourceContainer, "container", sourceContainerId);
    const sourceHashes = new Set([publicCopyRecordContentHash(sourceContainer, "container")].filter(Boolean));
    const sourceFingerprint = publicCopyContainerFingerprint(sourceContainer);
    const match = targetContainerIds.find((targetContainerId) => {
      const targetContainer = containers[targetContainerId];
      if (!targetContainer) return false;
      if (copiedFromSameSourceWithCompatibleContent(targetContainer, "container", targetContainerId, sourceIds, sourceHashes)) return true;
      if (sourceIds.has(String(targetContainerId))) return true;
      return Boolean(sourceFingerprint && publicCopyContainerFingerprint(targetContainer) === sourceFingerprint);
    });
    if (match) containerMatches.set(sourceContainerId, match);
  });

  const sourceParentByItemId = new Map();
  sourceContainers.forEach(([sourceContainerId, sourceContainer]) => {
    (sourceContainer.itemIds || []).forEach((itemId) => sourceParentByItemId.set(itemId, sourceContainerId));
    (sourceContainer.order || []).forEach((entry) => {
      if (entry?.type === "item" && entry.id) sourceParentByItemId.set(entry.id, sourceContainerId);
    });
  });

  const missingItems = [];
  sourceItems.forEach(([sourceItemId, sourceItem]) => {
    const sourceIds = copySourceIds(sourceItem, "item", sourceItemId);
    const sourceHashes = new Set([
      publicCopyRecordContentHash(sourceItem, "item", { itemCategories, itemQuantity })
    ].filter(Boolean));
    const sourceFingerprint = publicCopyItemFingerprint(sourceItem, { itemCategories, itemQuantity });
    const sourceContentFingerprint = publicCopyItemContentFingerprint(sourceItem, { itemCategories, itemQuantity });
    const hasDuplicate = targetItemIds.some((targetItemId) => {
      const targetItem = items[targetItemId];
      if (!targetItem) return false;
      if (copiedFromSameSourceWithCompatibleContent(
        targetItem,
        "item",
        targetItemId,
        sourceIds,
        sourceHashes,
        { itemCategories, itemQuantity }
      )) return true;
      if (sourceIds.has(String(targetItemId))) return true;
      const blockedPublicOrigin = typeof hasPrivateSyncBlockedPublicOrigin === "function" &&
        hasPrivateSyncBlockedPublicOrigin(targetItem, targetItemId);
      if (!blockedPublicOrigin && sourceFingerprint && publicCopyItemFingerprint(targetItem, { itemCategories, itemQuantity }) === sourceFingerprint) return true;
      return Boolean(sourceContentFingerprint && publicCopyItemContentFingerprint(targetItem, { itemCategories, itemQuantity }) === sourceContentFingerprint);
    });
    if (hasDuplicate) return;
    const sourceParentId = sourceParentByItemId.get(sourceItemId) || sourceSnapshot?.rootId || "";
    const targetContainerId = containerMatches.get(sourceParentId) || containerMatches.get(sourceSnapshot?.rootId || "");
    if (!targetContainerId || !targetContainerIdSet.has(targetContainerId)) return;
    missingItems.push({ sourceItemId, targetContainerId });
  });

  return {
    targetContainerIds: [...new Set([...containerMatches.values()])],
    missingItems,
    duplicateItemCount: Math.max(0, sourceItems.length - missingItems.length),
    canCopyMissingItems: missingItems.length > 0
  };
}

export function summarizeLayoutIdDuplicates({
  sourceSnapshot,
  targetContainerIds = [],
  targetItemIds = []
}) {
  const sourceContainerIds = new Set(Object.keys(sourceSnapshot?.containers || {}));
  const sourceItemIds = new Set(Object.keys(sourceSnapshot?.items || {}));
  return {
    containerIds: targetContainerIds.filter((id) => sourceContainerIds.has(id)),
    itemIds: targetItemIds.filter((id) => sourceItemIds.has(id))
  };
}

export function summarizeLayoutTreeIdDuplicates({
  sourceSnapshot,
  targetLayout,
  getLayoutContainerIdSet = () => new Set(),
  getLayoutItemIdSet = () => new Set()
}) {
  if (!targetLayout) return { containerIds: [], itemIds: [] };
  return summarizeLayoutIdDuplicates({
    sourceSnapshot,
    targetContainerIds: [...getLayoutContainerIdSet(targetLayout)],
    targetItemIds: [...getLayoutItemIdSet(targetLayout)]
  });
}

export function planLayoutTreeMissingItems({
  sourceSnapshot,
  targetLayout,
  getLayoutContainerIdSet = () => new Set(),
  getLayoutItemIdSet = () => new Set()
}) {
  if (!sourceSnapshot || !targetLayout) {
    return { missingContainers: [], missingItems: [], duplicateItemCount: 0, canCopyMissingItems: false };
  }
  const targetContainerIds = getLayoutContainerIdSet(targetLayout);
  const targetItemIds = getLayoutItemIdSet(targetLayout);
  const sourceContainers = sourceSnapshot.containers || {};
  const sourceItems = sourceSnapshot.items || {};
  const sourceParentByContainerId = new Map();
  const sourceParentByItemId = new Map();
  Object.entries(sourceContainers).forEach(([containerId, container]) => {
    (container.childIds || []).forEach((childId) => sourceParentByContainerId.set(childId, containerId));
    (container.itemIds || []).forEach((itemId) => sourceParentByItemId.set(itemId, containerId));
    (container.order || []).forEach((entry) => {
      if (entry?.type === "container" && entry.id) sourceParentByContainerId.set(entry.id, containerId);
      if (entry?.type === "item" && entry.id) sourceParentByItemId.set(entry.id, containerId);
    });
  });
  const sourceContainerIds = Object.keys(sourceContainers);
  const missingContainerIdSet = new Set(sourceContainerIds.filter((containerId) => !targetContainerIds.has(containerId)));
  const hasTargetAncestor = (containerId) => {
    let parentId = sourceParentByContainerId.get(containerId) || "";
    const seen = new Set([containerId]);
    while (parentId) {
      if (targetContainerIds.has(parentId)) return true;
      if (seen.has(parentId)) return false;
      seen.add(parentId);
      parentId = sourceParentByContainerId.get(parentId) || "";
    }
    return false;
  };
  const missingContainers = sourceContainerIds
    .filter((containerId) => missingContainerIdSet.has(containerId) && hasTargetAncestor(containerId))
    .map((containerId) => ({
      sourceContainerId: containerId,
      targetParentId: sourceParentByContainerId.get(containerId) || ""
    }));
  const restorableContainerIds = new Set([
    ...targetContainerIds,
    ...missingContainers.map((entry) => entry.sourceContainerId)
  ]);
  const missingItems = Object.keys(sourceItems)
    .filter((itemId) => !targetItemIds.has(itemId))
    .map((itemId) => ({
      sourceItemId: itemId,
      targetContainerId: sourceParentByItemId.get(itemId) || sourceSnapshot.rootId || ""
    }))
    .filter((entry) => entry.targetContainerId && restorableContainerIds.has(entry.targetContainerId));
  return {
    missingContainers,
    missingItems,
    duplicateItemCount: Math.max(0, Object.keys(sourceItems).length - missingItems.length),
    canCopyMissingItems: missingContainers.length > 0 || missingItems.length > 0
  };
}
