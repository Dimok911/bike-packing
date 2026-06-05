export function mergePublishedSharedStateIntoAdminLayout(layout, editableLayout, {
  changedAt,
  copyPublishedContainerToState,
  ensureLayoutDictionaries,
  hasRemotePhotoUrl,
  normalizeLayoutArrangement,
  normalizePhotoUrlFields,
  normalizeSharedGearName,
  sameJson,
  sourceState,
  state,
  touchLayout,
  clone
} = {}) {
  const sourceLayout = sourceState?.layouts?.[sourceState.activeLayoutId] || Object.values(sourceState?.layouts || {})[0];
  if (!sourceState || !sourceLayout || !editableLayout) return false;
  ensureLayoutDictionaries(editableLayout, sourceState);
  const layoutContainerIds = new Set();
  const collectContainer = (containerId) => {
    const container = state.containers?.[containerId];
    if (!container || layoutContainerIds.has(containerId)) return;
    layoutContainerIds.add(containerId);
    (container.childIds || []).forEach(collectContainer);
  };
  layoutRootContainerIds(editableLayout).forEach(collectContainer);

  const containersBySource = new Map();
  const containersByName = new Map();
  layoutContainerIds.forEach((containerId) => {
    const container = state.containers?.[containerId];
    if (!container) return;
    if (container.sharedSourceId) containersBySource.set(container.sharedSourceId, container);
    if (container.name) containersByName.set(normalizeSharedGearName(container.name), container);
  });

  const itemsBySource = new Map();
  const itemsByName = new Map();
  Object.values(state.items || {}).forEach((item) => {
    if (!item || !layoutContainerIds.has(item.containerId)) return;
    if (item.sharedSourceId) itemsBySource.set(item.sharedSourceId, item);
    if (item.name) itemsByName.set(normalizeSharedGearName(item.name), item);
  });

  let changed = false;
  const rootBySource = new Map();
  const rootByName = new Map();
  const rememberRoot = (containerId) => {
    const container = state.containers?.[containerId];
    if (!container) return;
    if (container.sharedSourceId) rootBySource.set(container.sharedSourceId, containerId);
    if (container.name) rootByName.set(normalizeSharedGearName(container.name), containerId);
  };
  layoutRootContainerIds(editableLayout).forEach(rememberRoot);

  const idMap = { containers: new Map(), items: new Map() };
  const sourceRootIds = layoutRootContainerIds(sourceLayout);
  sourceRootIds.forEach((sourceRootId) => {
    const sourceContainer = sourceState.containers?.[sourceRootId];
    if (!sourceContainer) return;
    const existingRootId =
      rootBySource.get(sourceRootId) ||
      rootByName.get(normalizeSharedGearName(sourceContainer.name));
    if (existingRootId) return;
    if (typeof copyPublishedContainerToState !== "function") return;
    const copiedRootId = copyPublishedContainerToState(sourceState, sourceRootId, {
      targetLayoutId: editableLayout.id,
      changedAt,
      idMap,
      preserveSource: true,
      sourceLayoutId: sourceLayout.id
    });
    if (!copiedRootId || !state.containers?.[copiedRootId]) return;
    collectContainer(copiedRootId);
    rememberRoot(copiedRootId);
    changed = true;
  });

  const syncEntity = (target, source, sourceId) => {
    if (!target || !source) return;
    if (sourceId && target.sharedSourceId !== sourceId) {
      target.sharedSourceId = sourceId;
      changed = true;
    }
    if (syncPublishedEntityPhotos(target, source, { clone, hasRemotePhotoUrl, normalizePhotoUrlFields, sameJson })) {
      target.updatedAt = source.updatedAt || changedAt;
      changed = true;
    }
  };
  const syncContainerTree = (sourceContainerId) => {
    const sourceContainer = sourceState.containers?.[sourceContainerId];
    if (!sourceContainer) return;
    const targetContainer =
      containersBySource.get(sourceContainerId) ||
      containersByName.get(normalizeSharedGearName(sourceContainer.name));
    syncEntity(targetContainer, sourceContainer, sourceContainerId);
    (sourceContainer.itemIds || []).forEach((sourceItemId) => {
      const sourceItem = sourceState.items?.[sourceItemId];
      if (!sourceItem) return;
      const targetItem =
        itemsBySource.get(sourceItemId) ||
        itemsByName.get(normalizeSharedGearName(sourceItem.name));
      syncEntity(targetItem, sourceItem, sourceItemId);
    });
    (sourceContainer.childIds || []).forEach(syncContainerTree);
  };

  sourceRootIds.forEach(syncContainerTree);
  if (changed) {
    normalizeLayoutArrangement(editableLayout, state);
    touchLayout(editableLayout.id, changedAt);
  }
  return changed;
}

function layoutRootContainerIds(layout) {
  return [...new Set([
    ...(Array.isArray(layout?.arrangement?.rootContainerIds) ? layout.arrangement.rootContainerIds : []),
    ...(Array.isArray(layout?.rootContainerIds) ? layout.rootContainerIds : [])
  ])].filter(Boolean);
}

export function syncPublishedEntityPhotos(target, source, {
  clone,
  hasRemotePhotoUrl,
  normalizePhotoUrlFields,
  sameJson
} = {}) {
  const sourcePhotos = (Array.isArray(source?.photos) ? source.photos : [])
    .map((photo) => normalizePhotoUrlFields(clone(photo)))
    .filter(hasRemotePhotoUrl);
  if (!sourcePhotos.length) return false;
  const currentPhotos = (Array.isArray(target?.photos) ? target.photos : [])
    .map((photo) => normalizePhotoUrlFields(clone(photo)))
    .filter(hasRemotePhotoUrl);
  if (sameJson(currentPhotos, sourcePhotos)) return false;
  target.photos = sourcePhotos;
  return true;
}

export function mergeBuiltInSharedEntriesIntoAdminLayout(layout, editableLayout, {
  addItemToLayoutArrangement,
  changedAt,
  copySharedItemToState,
  copySharedRootToState,
  ensureLayoutDictionaries,
  normalizeLayoutArrangement,
  normalizeSharedGearName,
  state,
  touchLayout,
  writeContainerTreeToLayoutArrangement
} = {}) {
  if (!layout || !editableLayout || !Array.isArray(layout.roots) || !layout.roots.length) return false;
  ensureLayoutDictionaries(editableLayout);
  const layoutContainerIds = new Set();
  const collectContainer = (containerId) => {
    const container = state.containers?.[containerId];
    if (!container || layoutContainerIds.has(containerId)) return;
    layoutContainerIds.add(containerId);
    (container.childIds || []).forEach(collectContainer);
  };
  (editableLayout.rootContainerIds || []).forEach(collectContainer);

  const rootBySource = new Map();
  const rootByName = new Map();
  (editableLayout.rootContainerIds || []).forEach((containerId) => {
    const container = state.containers?.[containerId];
    if (!container) return;
    if (container.sharedSourceId) rootBySource.set(container.sharedSourceId, containerId);
    if (container.name) rootByName.set(normalizeSharedGearName(container.name), containerId);
  });

  const itemKeys = new Set();
  Object.values(state.items || {}).forEach((item) => {
    if (!item || !layoutContainerIds.has(item.containerId)) return;
    if (item.sharedSourceId) itemKeys.add(`source:${item.sharedSourceId}`);
    if (item.name) itemKeys.add(`name:${normalizeSharedGearName(item.name)}`);
  });

  let changed = false;
  layout.roots.forEach((root) => {
    let containerId =
      rootBySource.get(root.id) ||
      rootBySource.get(`shared-root-${root.id}`) ||
      rootByName.get(normalizeSharedGearName(root.name));

    if (!containerId) {
      containerId = copySharedRootToState(root, { targetLayoutId: "", changedAt, preserveSource: true });
      editableLayout.rootContainerIds = [...(editableLayout.rootContainerIds || []), containerId];
      writeContainerTreeToLayoutArrangement(state, editableLayout.id, containerId);
      changed = true;
      (root.items || []).forEach((item) => {
        itemKeys.add(`source:${item.id}`);
        itemKeys.add(`source:shared-item-${item.id}`);
        itemKeys.add(`name:${normalizeSharedGearName(item.name)}`);
      });
      return;
    }

    const container = state.containers?.[containerId];
    if (!container) return;
    (root.items || []).forEach((item) => {
      const sourceKey = `source:${item.id}`;
      const publishedSourceKey = `source:shared-item-${item.id}`;
      const nameKey = `name:${normalizeSharedGearName(item.name)}`;
      if (itemKeys.has(sourceKey) || itemKeys.has(publishedSourceKey) || itemKeys.has(nameKey)) return;
      const copiedItemId = copySharedItemToState(item, { containerId, changedAt, preserveSource: true });
      if (copiedItemId) addItemToLayoutArrangement(editableLayout, copiedItemId, containerId);
      itemKeys.add(sourceKey);
      itemKeys.add(publishedSourceKey);
      itemKeys.add(nameKey);
      changed = true;
    });
  });

  if (changed) {
    normalizeLayoutArrangement(editableLayout, state);
    touchLayout(editableLayout.id, changedAt);
  }
  return changed;
}
