export function publicCopyComparableText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function publicCopyPhotoKey(record) {
  const photo = Array.isArray(record?.photos) ? record.photos.find((entry) => entry?.id || entry?.url || entry?.thumbUrl) : null;
  if (!photo) return "";
  return publicCopyComparableText(photo.id || photo.photoId || photo.url || photo.thumbUrl).replace(/[?#].*$/, "");
}

export function publicCopyItemFingerprint(item, { itemCategories, itemQuantity }) {
  if (!item) return "";
  return [
    publicCopyItemContentFingerprint(item, { itemCategories, itemQuantity }),
    publicCopyPhotoKey(item)
  ].join("\u001f");
}

export function publicCopyItemContentFingerprint(item, { itemCategories, itemQuantity }) {
  if (!item) return "";
  const categories = itemCategories(item).map(publicCopyComparableText).sort().join("|");
  return [
    publicCopyComparableText(item.name),
    Number(item.weight || 0),
    itemQuantity(item),
    publicCopyComparableText(item.location),
    categories
  ].join("\u001f");
}

export function publicCopyContainerFingerprint(container) {
  if (!container) return "";
  return [
    publicCopyComparableText(container.name),
    Number(container.weight || 0),
    Number(container.volume || 0),
    publicCopyComparableText(container.location),
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

function setsIntersect(left, right) {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
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
    const targetSourceIds = copySourceIds(container, "container", containerId);
    const copiedFromSameSource = setsIntersect(targetSourceIds, sourceContainerIds);
    const sameId = sourceContainerIds.has(String(containerId));
    const looksLikeSamePublicContainer =
      sourceContainerFingerprints.size &&
      sourceContainerFingerprints.has(publicCopyContainerFingerprint(container));
    if (copiedFromSameSource || sameId || looksLikeSamePublicContainer) result.containerIds.push(containerId);
  });

  targetItemIds.forEach((itemId) => {
    const item = items[itemId];
    if (!item) return;
    const targetSourceIds = copySourceIds(item, "item", itemId);
    const copiedFromSameSource = setsIntersect(targetSourceIds, sourceItemIds);
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
