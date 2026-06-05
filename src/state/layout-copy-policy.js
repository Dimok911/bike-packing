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
  const copyRemotePhotosToCurrentList = shouldCopyPhotosToCurrentListForLayoutCopy({
    targetIsPublic,
    sourceIsPublicCopy
  });
  return {
    copyRemotePhotosToCurrentList,
    dropMissingLocalPhotos: copyRemotePhotosToCurrentList
  };
}
