export function containerCopySnapshotForContext(sourceSnapshot, { includeContents = true } = {}) {
  if (!sourceSnapshot?.rootId || !sourceSnapshot.containers?.[sourceSnapshot.rootId]) return null;
  if (includeContents) return sourceSnapshot;
  const root = sourceSnapshot.containers[sourceSnapshot.rootId];
  return {
    rootId: sourceSnapshot.rootId,
    containers: {
      [sourceSnapshot.rootId]: {
        ...root,
        childIds: [],
        itemIds: [],
        order: []
      }
    },
    items: {}
  };
}

export function copyPublishedContainerToState(targetState, sourceState, containerId, {
  changedAt,
  copiedFromTemplateName = "",
  idMap = null,
  parentId = null,
  preserveSource = false,
  sourceLayoutId = "",
  sourceSnapshot: providedSnapshot = null,
  targetLayoutId = ""
} = {}, {
  appendCopiedFromTemplateNote,
  cloneIsolatedPublicEntity,
  createLayoutArrangementFromCurrentState,
  currentCreateMeta,
  markLocalPublicCopyOrigin,
  publicCopyRecordContentHash = () => "",
  publicCopySourceIdFromRecord,
  snapshotContainerTree,
  stripPublicOriginForPrivateCopy,
  touchLayout
} = {}) {
  const sourceSnapshot = providedSnapshot || snapshotContainerTree(containerId, { sourceLayoutId, targetState: sourceState });
  if (!sourceSnapshot) return "";
  const publicSourceLayoutId = sourceLayoutId || sourceState?.activeLayoutId || Object.values(sourceState?.layouts || {})[0]?.id || "";
  const containerMap = idMap?.containers || new Map();
  const itemMap = idMap?.items || new Map();
  const makeContainerId = (sourceId) => preserveSource
    ? `container-shared-${sourceId}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    : `container-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const makeItemId = (sourceId) => preserveSource
    ? `item-shared-${sourceId}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    : `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const sourceIdForPublicCopy = (record, kind, fallbackId) =>
    publicCopySourceIdFromRecord(record, kind, fallbackId) || fallbackId;

  const copyItem = (sourceItemId, nextContainerId) => {
    const sourceItem = sourceSnapshot.items[sourceItemId] || sourceState.items?.[sourceItemId];
    if (!sourceItem) return "";
    if (itemMap.has(sourceItemId)) return itemMap.get(sourceItemId);
    const publicSourceId = sourceIdForPublicCopy(sourceItem, "item", sourceItemId);
    const nextId = makeItemId(publicSourceId);
    itemMap.set(sourceItemId, nextId);
    if (idMap?.items) idMap.items.set(sourceItemId, nextId);
    targetState.items[nextId] = {
      ...cloneIsolatedPublicEntity(sourceItem),
      id: nextId,
      containerId: nextContainerId,
      ...currentCreateMeta(changedAt)
    };
    markLocalPublicCopyOrigin(
      targetState.items[nextId],
      "item",
      publicSourceId,
      sourceItem._publicCopySourceLayoutId || publicSourceLayoutId,
      publicCopyRecordContentHash(sourceItem, "item")
    );
    if (preserveSource) targetState.items[nextId].sharedSourceId = publicSourceId;
    else {
      stripPublicOriginForPrivateCopy(targetState.items[nextId]);
      appendCopiedFromTemplateNote(targetState.items[nextId], copiedFromTemplateName);
    }
    return nextId;
  };

  const copyContainer = (sourceContainerId, nextParentId = null) => {
    const sourceContainer = sourceSnapshot.containers[sourceContainerId] || sourceState.containers?.[sourceContainerId];
    if (!sourceContainer) return "";
    if (containerMap.has(sourceContainerId)) return containerMap.get(sourceContainerId);
    const publicSourceId = sourceIdForPublicCopy(sourceContainer, "container", sourceContainerId);
    const nextId = makeContainerId(publicSourceId);
    containerMap.set(sourceContainerId, nextId);
    if (idMap?.containers) idMap.containers.set(sourceContainerId, nextId);
    targetState.containers[nextId] = {
      ...cloneIsolatedPublicEntity(sourceContainer),
      id: nextId,
      parentId: nextParentId,
      childIds: [],
      itemIds: [],
      order: [],
      ...currentCreateMeta(changedAt)
    };
    markLocalPublicCopyOrigin(
      targetState.containers[nextId],
      "container",
      publicSourceId,
      sourceContainer._publicCopySourceLayoutId || publicSourceLayoutId,
      publicCopyRecordContentHash(sourceContainer, "container")
    );
    if (preserveSource) targetState.containers[nextId].sharedSourceId = publicSourceId;
    else {
      stripPublicOriginForPrivateCopy(targetState.containers[nextId]);
      appendCopiedFromTemplateNote(targetState.containers[nextId], copiedFromTemplateName);
    }
    targetState.collapsedContainers[nextId] = false;

    const copiedChildren = new Map();
    const copiedItems = new Map();
    targetState.containers[nextId].childIds = (sourceContainer.childIds || []).map((childId) => {
      const copiedId = copyContainer(childId, nextId);
      if (copiedId) copiedChildren.set(childId, copiedId);
      return copiedId;
    }).filter(Boolean);
    targetState.containers[nextId].itemIds = (sourceContainer.itemIds || []).map((itemId) => {
      const copiedId = copyItem(itemId, nextId);
      if (copiedId) copiedItems.set(itemId, copiedId);
      return copiedId;
    }).filter(Boolean);
    targetState.containers[nextId].order = (sourceContainer.order || []).map((entry) => {
      if (entry?.type === "container") {
        const copiedId = copiedChildren.get(entry.id) || containerMap.get(entry.id);
        return copiedId ? { type: "container", id: copiedId } : null;
      }
      if (entry?.type === "item") {
        const copiedId = copiedItems.get(entry.id) || itemMap.get(entry.id);
        return copiedId ? { type: "item", id: copiedId } : null;
      }
      return null;
    }).filter(Boolean);
    if (!targetState.containers[nextId].order.length) {
      targetState.containers[nextId].order = [
        ...targetState.containers[nextId].itemIds.map((itemId) => ({ type: "item", id: itemId })),
        ...targetState.containers[nextId].childIds.map((childId) => ({ type: "container", id: childId }))
      ];
    }
    return nextId;
  };

  const id = copyContainer(sourceSnapshot.rootId || containerId, parentId);
  if (!id) return "";
  if (!parentId && targetLayoutId && targetState.layouts[targetLayoutId]) {
    const layout = targetState.layouts[targetLayoutId];
    layout.rootContainerIds = [...(layout.rootContainerIds || []), id];
    layout.arrangement = createLayoutArrangementFromCurrentState(targetState, layout.rootContainerIds);
    touchLayout(targetLayoutId, changedAt);
  }
  return id;
}
