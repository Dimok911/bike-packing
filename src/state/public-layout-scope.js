export function isPublicLayoutRecord(layout) {
  return Boolean(layout && (layout.adminDemo || layout.adminSharedSourceId || layout.publicCatalogLayoutId));
}

export function collectLayoutRecordIds(targetState, layout, {
  getLayoutContainerIdSet,
  getLayoutItemIdSet
} = {}) {
  const containerIds = new Set();
  const itemIds = new Set();
  if (!targetState || !layout || !getLayoutContainerIdSet || !getLayoutItemIdSet) {
    return { containerIds, itemIds };
  }
  getLayoutContainerIdSet(targetState, layout).forEach((id) => containerIds.add(id));
  getLayoutItemIdSet(targetState, layout).forEach((id) => itemIds.add(id));
  return { containerIds, itemIds };
}

export function collectPublicLayoutRecordIds(targetState, helpers = {}) {
  const containerIds = new Set();
  const itemIds = new Set();
  Object.values(targetState?.layouts || {}).forEach((layout) => {
    if (!isPublicLayoutRecord(layout)) return;
    const ids = collectLayoutRecordIds(targetState, layout, helpers);
    ids.containerIds.forEach((id) => containerIds.add(id));
    ids.itemIds.forEach((id) => itemIds.add(id));
  });
  return { containerIds, itemIds };
}

export function isPublicCatalogItemRecord(itemId, item, {
  publicRecordIds = { itemIds: new Set() },
  isPublicSyncItem = () => false
} = {}) {
  if (isPublicSyncItem(itemId, item)) return true;
  return publicRecordIds.itemIds.has(itemId);
}

export function isPublicCatalogContainerRecord(containerId, container, {
  publicRecordIds = { containerIds: new Set() },
  isPublicSyncContainer = () => false
} = {}) {
  if (isPublicSyncContainer(containerId, container)) return true;
  return publicRecordIds.containerIds.has(containerId);
}

export function isPrivateCatalogRecord({ scoped = false, isPublic = false } = {}) {
  return Boolean(scoped || !isPublic);
}
