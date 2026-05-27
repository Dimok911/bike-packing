export function buildRemoteSaveBody({
  dataItemKey,
  dataScopeKey,
  forceOverwrite = false,
  nowIso,
  serializeState,
  syncDevice,
  syncMeta
} = {}) {
  const sourceUpdatedAt = syncMeta.localUpdatedAt || nowIso();
  const payload = serializeState({ forSync: true });
  return {
    scopeKey: dataScopeKey,
    itemKey: dataItemKey,
    baseServerUpdatedAt: forceOverwrite ? null : (syncMeta.serverUpdatedAt || null),
    baseStateRevision: syncMeta.stateRevision ?? null,
    stateRevision: syncMeta.stateRevision ?? null,
    clientUpdatedAt: sourceUpdatedAt,
    clientDeviceId: syncDevice.id,
    clientDeviceName: syncDevice.name,
    sourceUpdatedAt,
    sourceDeviceId: syncDevice.id,
    sourceDeviceName: syncDevice.name,
    force: forceOverwrite,
    forceOverwrite,
    fullReplace: forceOverwrite,
    payload
  };
}

export function buildListSaveBody({
  forceOverwrite = false,
  nowIso,
  serializeState,
  syncDevice,
  syncMeta
} = {}) {
  const sourceUpdatedAt = syncMeta.localUpdatedAt || nowIso();
  const payload = serializeState({ forSync: true });
  return {
    baseServerUpdatedAt: forceOverwrite ? null : (syncMeta.serverUpdatedAt || null),
    baseStateRevision: syncMeta.stateRevision ?? null,
    stateRevision: syncMeta.stateRevision ?? null,
    clientUpdatedAt: sourceUpdatedAt,
    clientDeviceId: syncDevice.id,
    clientDeviceName: syncDevice.name,
    force: forceOverwrite,
    forceOverwrite,
    fullReplace: forceOverwrite,
    payload
  };
}

export function rememberConflictRemoteMeta(record, meta, updatedAt = "", {
  rememberRemoteIntegrityMeta = () => {},
  saveSyncMeta = () => {},
  syncMeta
} = {}) {
  rememberRemoteIntegrityMeta(record || meta || {});
  if (updatedAt) syncMeta.serverUpdatedAt = updatedAt;
  saveSyncMeta();
}

export function pruneAdminPublishedDraftsForSync(cloned, {
  getPublicLayoutRecordIds,
  guestDemoCopyFlag,
  isPublicSyncContainer = () => false,
  isPublicSyncItem = () => false
} = {}) {
  const layouts = cloned.layouts || {};
  const publicRecordIds = getPublicLayoutRecordIds(cloned);
  const draftLayoutIds = Object.values(layouts)
    .filter((layout) => layout?.adminDemo || layout?.adminSharedSourceId || layout?.publicCatalogLayoutId || layout?.[guestDemoCopyFlag])
    .map((layout) => layout.id)
    .filter(Boolean);
  const draftContainers = new Set();
  const collectDraftContainer = (containerId) => {
    const container = cloned.containers?.[containerId];
    if (!container || draftContainers.has(containerId)) return;
    draftContainers.add(containerId);
    (container.childIds || []).forEach(collectDraftContainer);
  };
  draftLayoutIds.forEach((layoutId) => {
    (layouts[layoutId]?.rootContainerIds || []).forEach(collectDraftContainer);
    delete layouts[layoutId];
  });

  const retainedContainers = new Set();
  const collectRetainedContainer = (containerId) => {
    const container = cloned.containers?.[containerId];
    if (!container || retainedContainers.has(containerId)) return;
    retainedContainers.add(containerId);
    (container.childIds || []).forEach(collectRetainedContainer);
  };
  Object.values(layouts).forEach((layout) => {
    (layout.rootContainerIds || []).forEach(collectRetainedContainer);
  });

  const containersToDrop = new Set();
  draftContainers.forEach((containerId) => {
    if (!retainedContainers.has(containerId)) collectContainerTreeForDrop(cloned, containerId, containersToDrop);
  });
  Object.entries(cloned.containers || {}).forEach(([containerId, container]) => {
    if (publicRecordIds.containerIds.has(containerId) || isPublicSyncContainer(containerId, container)) {
      collectContainerTreeForDrop(cloned, containerId, containersToDrop);
    }
  });
  containersToDrop.forEach((containerId) => {
    delete cloned.containers[containerId];
  });
  Object.entries(cloned.items || {}).forEach(([itemId, item]) => {
    if (
      publicRecordIds.itemIds.has(itemId) ||
      isPublicSyncItem(itemId, item) ||
      (item?.containerId && (!cloned.containers?.[item.containerId] || containersToDrop.has(item.containerId)))
    ) {
      delete cloned.items[itemId];
    }
  });
  Object.values(cloned.containers || {}).forEach((container) => {
    container.childIds = (container.childIds || []).filter((id) => cloned.containers?.[id]);
    container.itemIds = (container.itemIds || []).filter((id) => cloned.items?.[id]);
    container.order = (container.order || []).filter((entry) => {
      if (entry?.type === "container") return Boolean(cloned.containers?.[entry.id]);
      if (entry?.type === "item") return Boolean(cloned.items?.[entry.id]);
      return false;
    });
  });
  Object.values(cloned.layouts || {}).forEach((layout) => {
    layout.rootContainerIds = (layout.rootContainerIds || []).filter((id) => cloned.containers?.[id]);
    if (layout.arrangement && typeof layout.arrangement === "object") {
      const arrangement = layout.arrangement;
      arrangement.rootContainerIds = (arrangement.rootContainerIds || layout.rootContainerIds || []).filter((id) => cloned.containers?.[id]);
      arrangement.containers = arrangement.containers && typeof arrangement.containers === "object" ? arrangement.containers : {};
      Object.entries(arrangement.containers).forEach(([containerId, placement]) => {
        if (!cloned.containers?.[containerId] || !placement || typeof placement !== "object") {
          delete arrangement.containers[containerId];
          return;
        }
        placement.parentId = placement.parentId && cloned.containers?.[placement.parentId] ? placement.parentId : "";
        placement.childIds = (placement.childIds || []).filter((id) => cloned.containers?.[id]);
        placement.itemIds = (placement.itemIds || []).filter((id) => cloned.items?.[id]);
        placement.order = (placement.order || []).filter((entry) => {
          if (entry?.type === "container") return Boolean(cloned.containers?.[entry.id]);
          if (entry?.type === "item") return Boolean(cloned.items?.[entry.id]);
          return false;
        });
      });
      arrangement.items = arrangement.items && typeof arrangement.items === "object" ? arrangement.items : {};
      Object.entries(arrangement.items).forEach(([itemId, containerId]) => {
        if (!cloned.items?.[itemId] || !cloned.containers?.[containerId]) delete arrangement.items[itemId];
      });
      arrangement.packedItems = arrangement.packedItems && typeof arrangement.packedItems === "object" ? arrangement.packedItems : {};
      Object.keys(arrangement.packedItems).forEach((itemId) => {
        if (!cloned.items?.[itemId]) delete arrangement.packedItems[itemId];
      });
    }
  });

  if (draftLayoutIds.includes(cloned.activeLayoutId)) {
    cloned.activeLayoutId = Object.values(layouts)[0]?.id || "";
  }
}

function collectContainerTreeForDrop(targetState, containerId, containerIdsToDrop) {
  if (!containerId || containerIdsToDrop.has(containerId)) return;
  const container = targetState?.containers?.[containerId];
  if (!container) return;
  containerIdsToDrop.add(containerId);
  (container.childIds || []).forEach((childId) => collectContainerTreeForDrop(targetState, childId, containerIdsToDrop));
  Object.entries(targetState.containers || {}).forEach(([childId, child]) => {
    if (child?.parentId === containerId) collectContainerTreeForDrop(targetState, childId, containerIdsToDrop);
  });
}
