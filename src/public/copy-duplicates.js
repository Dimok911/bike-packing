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
  const categories = itemCategories(item).map(publicCopyComparableText).sort().join("|");
  return [
    publicCopyComparableText(item.name),
    Number(item.weight || 0),
    itemQuantity(item),
    publicCopyComparableText(item.location),
    categories,
    publicCopyPhotoKey(item)
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
  const sourceContainerIds = new Set(Object.keys(sourceSnapshot?.containers || {}).map(String));
  const sourceItemIds = new Set(Object.keys(sourceSnapshot?.items || {}).map(String));
  const sourceContainerFingerprints = new Set(
    Object.values(sourceSnapshot?.containers || {}).map(publicCopyContainerFingerprint).filter(Boolean)
  );
  const sourceItemFingerprints = new Set(
    Object.values(sourceSnapshot?.items || {}).map((item) =>
      publicCopyItemFingerprint(item, { itemCategories, itemQuantity })
    ).filter(Boolean)
  );
  const result = { containerIds: [], itemIds: [] };
  if (!sourceContainerIds.size && !sourceItemIds.size && !sourceContainerFingerprints.size && !sourceItemFingerprints.size) {
    return result;
  }

  targetContainerIds.forEach((containerId) => {
    const container = containers[containerId];
    if (!container) return;
    const copiedFromSameSource =
      container._publicCopySourceKind === "container" &&
      sourceContainerIds.has(String(container._publicCopySourceId || ""));
    const sameId = sourceContainerIds.has(String(containerId));
    const looksLikeSamePublicContainer =
      sourceContainerFingerprints.size &&
      sourceContainerFingerprints.has(publicCopyContainerFingerprint(container));
    if (copiedFromSameSource || sameId || looksLikeSamePublicContainer) result.containerIds.push(containerId);
  });

  targetItemIds.forEach((itemId) => {
    const item = items[itemId];
    if (!item) return;
    const copiedFromSameSource =
      item._publicCopySourceKind === "item" &&
      sourceItemIds.has(String(item._publicCopySourceId || ""));
    const sameId = sourceItemIds.has(String(itemId));
    const blockedPublicOrigin = typeof hasPrivateSyncBlockedPublicOrigin === "function" &&
      hasPrivateSyncBlockedPublicOrigin(item, itemId);
    const looksLikeSamePublicItem =
      !blockedPublicOrigin &&
      sourceItemFingerprints.size &&
      sourceItemFingerprints.has(publicCopyItemFingerprint(item, { itemCategories, itemQuantity }));
    if (copiedFromSameSource || sameId || looksLikeSamePublicItem) result.itemIds.push(itemId);
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
