export function privateContainerTreeCopyRoute({
  copyAction = "",
  duplicateContainerIds = [],
  duplicateItemIds = []
} = {}) {
  if (copyAction === "cancel") return "cancel";
  if (copyAction === "copy-missing-local") return "copy-missing-local";

  const hasDuplicates = Boolean(duplicateContainerIds.length || duplicateItemIds.length);
  if (!hasDuplicates) return "link-existing";
  if (copyAction === "copy-all") return "duplicate-explicit";
  return "cancel";
}

export function copyCrossesPublicNamespaceBoundary({
  sourceIsPublic = false,
  targetIsPublic = false
} = {}) {
  return Boolean(sourceIsPublic || targetIsPublic);
}

export function itemCopyNamespacePolicy({
  sourceLayoutIsPublic = false,
  sourceRecordHasPublicOrigin = false,
  targetIsPublic = false
} = {}) {
  const sourceIsPublicCopy = Boolean(sourceLayoutIsPublic || sourceRecordHasPublicOrigin);
  return {
    sourceIsPublicCopy,
    crossesPublicNamespace: copyCrossesPublicNamespaceBoundary({
      sourceIsPublic: sourceIsPublicCopy,
      targetIsPublic
    })
  };
}

export function itemRecordIsPublicNamespaceSource(record, {
  hasPrivateSyncBlockedPublicOrigin = () => false
} = {}) {
  if (!record || typeof record !== "object") return false;
  return Boolean(
    record.publicCatalogLayoutId ||
    hasPrivateSyncBlockedPublicOrigin(record, record.id || "")
  );
}

export function shouldCopyPhotosToCurrentListForLayoutCopy({
  targetIsPublic = false,
  sourceIsPublicCopy = false
} = {}) {
  return Boolean(targetIsPublic || sourceIsPublicCopy);
}

export function photoDuplicateOptionsForLayoutCopy({
  targetIsPublic = false,
  sourceIsPublicCopy = false
} = {}) {
  const crossesPublicNamespaceBoundary = shouldCopyPhotosToCurrentListForLayoutCopy({
    targetIsPublic,
    sourceIsPublicCopy
  });
  return {
    copyRemotePhotosToCurrentList: true,
    dropMissingLocalPhotos: crossesPublicNamespaceBoundary
  };
}
