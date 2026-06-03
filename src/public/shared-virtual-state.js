export function sharedVirtualLayoutId(layoutId) {
  return `shared-virtual-layout-${layoutId}`;
}

export function sharedVirtualContainerId(rootId) {
  return `shared-virtual-container-${rootId}`;
}

export function sharedVirtualItemId(itemId) {
  return `shared-virtual-item-${itemId}`;
}

export function originalSharedId(virtualId, prefix) {
  return String(virtualId || "").startsWith(prefix) ? String(virtualId).slice(prefix.length) : "";
}

export function publicVirtualLayoutMarkers(layout, virtualLayoutId, { demoSharedLayoutId = "", uiLanguage = "ru" } = {}) {
  if (layout?.id === demoSharedLayoutId) {
    return {
      adminDemo: true,
      adminDemoLanguage: layout.language || uiLanguage,
      publicCatalogLayoutId: virtualLayoutId
    };
  }
  return {
    adminSharedSourceId: layout?.id || "",
    publicCatalogLayoutId: virtualLayoutId
  };
}

export function createSharedVirtualState(layout, {
  cloneValue,
  collapsedDefaultsForTemplateContainers,
  createLayoutArrangementFromCurrentState,
  demoSharedLayoutId = "",
  locations = [],
  normalizePublishedStatePayload,
  publicReadonlyItemDisplayMode,
  sharedGearPhotos,
  sharedVirtualCollapsedContainers = {},
  shouldShowItemLabelsForMode,
  uiLanguage = "ru"
} = {}) {
  const publishedState = normalizePublishedStatePayload(layout?.statePayload);
  if (publishedState) {
    return createSharedVirtualStateFromPublishedState(layout, publishedState, {
      cloneValue,
      collapsedDefaultsForTemplateContainers,
      createLayoutArrangementFromCurrentState,
      demoSharedLayoutId,
      locations,
      publicReadonlyItemDisplayMode,
      sharedVirtualCollapsedContainers,
      shouldShowItemLabelsForMode,
      uiLanguage
    });
  }

  const virtualLayoutId = sharedVirtualLayoutId(layout?.id || "shared");
  const containers = {};
  const items = {};
  const rootContainerIds = [];
  const changedAt = "1970-01-01T00:00:00.000Z";
  const publicMarkers = publicVirtualLayoutMarkers(layout, virtualLayoutId, { demoSharedLayoutId, uiLanguage });
  const fallbackLocation = locations[0] || "";
  sharedLayoutRoots(layout).forEach((root) => {
    const containerId = sharedVirtualContainerId(root.id);
    rootContainerIds.push(containerId);
    containers[containerId] = {
      id: containerId,
      name: root.name,
      parentId: null,
      childIds: [],
      itemIds: [],
      order: [],
      weight: Number(root.weightGrams || 0),
      volume: Number(root.volumeLiters || 0),
      color: "",
      location: fallbackLocation,
      note: root.description || "",
      photos: sharedGearPhotos(root, changedAt),
      createdAt: changedAt,
      updatedAt: changedAt,
      sharedSourceId: root.id,
      ...publicMarkers
    };
    (root.items || []).forEach((item) => {
      const itemId = sharedVirtualItemId(item.id);
      items[itemId] = {
        id: itemId,
        name: item.name,
        weight: Number(item.weightGrams || 0),
        quantity: 1,
        location: fallbackLocation,
        category: "",
        categories: [],
        containerId,
        note: item.description || "",
        photos: sharedGearPhotos(item, changedAt),
        createdAt: changedAt,
        updatedAt: changedAt,
        sharedSourceId: item.id,
        ...publicMarkers
      };
      containers[containerId].itemIds.push(itemId);
      containers[containerId].order.push({ type: "item", id: itemId });
    });
  });
  return {
    items,
    containers,
    layouts: {
      [virtualLayoutId]: {
        id: virtualLayoutId,
        name: layout?.name || "Шаблон",
        rootContainerIds,
        arrangement: createLayoutArrangementFromCurrentState({ items, containers, layouts: {}, activeLayoutId: virtualLayoutId }, rootContainerIds),
        createdAt: changedAt,
        updatedAt: changedAt,
        ...publicMarkers
      }
    },
    activeLayoutId: virtualLayoutId,
    collapsedContainers: sharedVirtualCollapsedState(layout, containers, rootContainerIds, {
      collapsedDefaultsForTemplateContainers,
      sharedVirtualCollapsedContainers
    }),
    packedItems: {},
    locations: [fallbackLocation],
    itemDisplayMode: "meta-photos",
    showItemMeta: true,
    categories: []
  };
}

export function createSharedVirtualStateFromPublishedState(layout, sourceState, {
  cloneValue,
  collapsedDefaultsForTemplateContainers,
  createLayoutArrangementFromCurrentState,
  demoSharedLayoutId = "",
  locations = [],
  publicReadonlyItemDisplayMode,
  sharedVirtualCollapsedContainers = {},
  shouldShowItemLabelsForMode,
  uiLanguage = "ru"
} = {}) {
  const sourceLayout = sourceState.layouts?.[sourceState.activeLayoutId] || Object.values(sourceState.layouts || {})[0];
  const virtualLayoutId = sharedVirtualLayoutId(layout?.id || sourceLayout?.id || "shared");
  const publicMarkers = publicVirtualLayoutMarkers(layout, virtualLayoutId, { demoSharedLayoutId, uiLanguage });
  const displayMode = publicReadonlyItemDisplayMode(sourceState.itemDisplayMode);
  const containerMap = new Map();
  const itemMap = new Map();
  const containers = {};
  const items = {};
  const changedAt = sourceLayout?.updatedAt || "1970-01-01T00:00:00.000Z";

  const mapContainerId = (id) => {
    if (!containerMap.has(id)) containerMap.set(id, sharedVirtualContainerId(id));
    return containerMap.get(id);
  };
  const mapItemId = (id) => {
    if (!itemMap.has(id)) itemMap.set(id, sharedVirtualItemId(id));
    return itemMap.get(id);
  };
  const copyItem = (itemId, containerId = "") => {
    const item = sourceState.items?.[itemId];
    if (!item) return "";
    const nextId = mapItemId(itemId);
    if (items[nextId]) return nextId;
    items[nextId] = {
      ...cloneValue(item),
      id: nextId,
      containerId,
      sharedSourceId: itemId,
      createdAt: item.createdAt || changedAt,
      updatedAt: item.updatedAt || changedAt,
      ...publicMarkers
    };
    return nextId;
  };
  const copyContainer = (containerId, parentId = null) => {
    const container = sourceState.containers?.[containerId];
    if (!container) return "";
    const nextId = mapContainerId(containerId);
    if (containers[nextId]) return nextId;
    containers[nextId] = {
      ...cloneValue(container),
      id: nextId,
      parentId,
      childIds: [],
      itemIds: [],
      order: [],
      sharedSourceId: containerId,
      createdAt: container.createdAt || changedAt,
      updatedAt: container.updatedAt || changedAt,
      ...publicMarkers
    };
    containers[nextId].childIds = (container.childIds || []).map((id) => copyContainer(id, nextId)).filter(Boolean);
    containers[nextId].itemIds = (container.itemIds || []).map((id) => copyItem(id, nextId)).filter(Boolean);
    containers[nextId].order = (container.order || []).map((entry) => {
      if (entry.type === "container") {
        const id = copyContainer(entry.id, nextId);
        return id ? { type: "container", id } : null;
      }
      const id = copyItem(entry.id, nextId);
      return id ? { type: "item", id } : null;
    }).filter(Boolean);
    if (!containers[nextId].order.length) {
      containers[nextId].order = [
        ...containers[nextId].itemIds.map((id) => ({ type: "item", id })),
        ...containers[nextId].childIds.map((id) => ({ type: "container", id }))
      ];
    }
    return nextId;
  };

  const rootContainerIds = (sourceLayout?.rootContainerIds || []).map((id) => copyContainer(id, null)).filter(Boolean);
  Object.keys(sourceState.containers || {}).forEach((containerId) => {
    if (!containerMap.has(containerId)) copyContainer(containerId, null);
  });
  Object.keys(sourceState.items || {}).forEach((itemId) => {
    if (!itemMap.has(itemId)) copyItem(itemId, "");
  });
  return {
    items,
    containers,
    layouts: {
      [virtualLayoutId]: {
        ...(sourceLayout ? cloneValue(sourceLayout) : {}),
        id: virtualLayoutId,
        name: layout?.name || sourceLayout?.name || "Шаблон",
        rootContainerIds,
        arrangement: createLayoutArrangementFromCurrentState({ items, containers, layouts: {}, activeLayoutId: virtualLayoutId }, rootContainerIds),
        createdAt: sourceLayout?.createdAt || changedAt,
        updatedAt: sourceLayout?.updatedAt || changedAt,
        ...publicMarkers
      }
    },
    activeLayoutId: virtualLayoutId,
    collapsedContainers: sharedVirtualCollapsedState(layout, containers, rootContainerIds, {
      collapsedDefaultsForTemplateContainers,
      sharedVirtualCollapsedContainers
    }),
    packedItems: {},
    locations: [...(sourceState.locations || [locations[0] || ""])],
    itemDisplayMode: displayMode,
    showItemMeta: shouldShowItemLabelsForMode(displayMode),
    categories: [...(sourceState.categories || [])],
    collectionMode: false,
    showOnlyUnpacked: false
  };
}

function sharedVirtualCollapsedState(layout, containers, rootContainerIds = [], {
  collapsedDefaultsForTemplateContainers,
  sharedVirtualCollapsedContainers = {}
} = {}) {
  if (!layout?.linkedSharedList) return { ...sharedVirtualCollapsedContainers };
  return collapsedDefaultsForTemplateContainers(containers, sharedVirtualCollapsedContainers, rootContainerIds);
}

function sharedLayoutRoots(layout) {
  return Array.isArray(layout?.roots) ? layout.roots : [];
}
