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
