import { clonePlain } from "../utils/json.js";

export function isolateLinkedLayoutEntities(targetState, {
  createId = createIsolatedEntityId
} = {}) {
  if (!targetState?.layouts || !targetState?.containers || !targetState?.items) {
    return { clonedContainers: 0, clonedItems: 0, layoutIds: [] };
  }
  targetState.collapsedContainers = objectOrEmpty(targetState.collapsedContainers);
  targetState.packedItems = objectOrEmpty(targetState.packedItems);

  const ownerByContainerId = new Map();
  const ownerByItemId = new Map();
  const clonedLayouts = new Set();
  const report = { clonedContainers: 0, clonedItems: 0, layoutIds: [] };

  Object.values(targetState.layouts).filter(Boolean).forEach((layout) => {
    const arrangement = layout.arrangement;
    if (!arrangement || typeof arrangement !== "object") return;
    arrangement.rootContainerIds = uniqueIds([
      ...(Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : []),
      ...(Array.isArray(layout.rootContainerIds) ? layout.rootContainerIds : [])
    ]).filter((id) => targetState.containers[id]);
    layout.rootContainerIds = [...arrangement.rootContainerIds];
    arrangement.containers = objectOrEmpty(arrangement.containers);
    arrangement.items = objectOrEmpty(arrangement.items);
    arrangement.packedItems = objectOrEmpty(arrangement.packedItems);

    const layoutId = layout.id || "";
    const cloneMap = { containers: new Map(), items: new Map() };
    const markCloned = () => {
      if (!layoutId || clonedLayouts.has(layoutId)) return;
      clonedLayouts.add(layoutId);
      report.layoutIds.push(layoutId);
    };

    const cloneItemForLayout = (itemId, parentId) => {
      if (!itemId || !targetState.items[itemId]) return "";
      const ownerLayoutId = ownerByItemId.get(itemId);
      if (!ownerLayoutId) {
        ownerByItemId.set(itemId, layoutId);
        return itemId;
      }
      if (ownerLayoutId === layoutId) return itemId;
      if (cloneMap.items.has(itemId)) return cloneMap.items.get(itemId);

      const nextId = createId("item", itemId, targetState);
      cloneMap.items.set(itemId, nextId);
      targetState.items[nextId] = {
        ...clonePlain(targetState.items[itemId]),
        id: nextId,
        containerId: parentId || ""
      };
      if (Object.prototype.hasOwnProperty.call(targetState.packedItems, itemId)) {
        targetState.packedItems[nextId] = clonePlain(targetState.packedItems[itemId]);
      }
      ownerByItemId.set(nextId, layoutId);
      report.clonedItems += 1;
      markCloned();
      return nextId;
    };

    const cloneContainerForLayout = (containerId, parentId = "") => {
      if (!containerId || !targetState.containers[containerId]) return "";
      const placement = arrangement.containers[containerId] || placementFromContainer(targetState.containers[containerId], parentId);
      const ownerLayoutId = ownerByContainerId.get(containerId);
      if (!ownerLayoutId) {
        ownerByContainerId.set(containerId, layoutId);
        reconcileContainerForLayout(containerId, containerId, placement, parentId);
        return containerId;
      }
      if (ownerLayoutId === layoutId) {
        reconcileContainerForLayout(containerId, containerId, placement, parentId);
        return containerId;
      }
      if (cloneMap.containers.has(containerId)) return cloneMap.containers.get(containerId);

      const nextId = createId("container", containerId, targetState);
      cloneMap.containers.set(containerId, nextId);
      targetState.containers[nextId] = {
        ...clonePlain(targetState.containers[containerId]),
        id: nextId,
        parentId: parentId || null,
        itemIds: [],
        childIds: [],
        order: []
      };
      if (Object.prototype.hasOwnProperty.call(targetState.collapsedContainers, containerId)) {
        targetState.collapsedContainers[nextId] = targetState.collapsedContainers[containerId];
      }
      ownerByContainerId.set(nextId, layoutId);
      report.clonedContainers += 1;
      markCloned();

      reconcileContainerForLayout(nextId, containerId, placement, parentId);
      return nextId;
    };

    const reconcileContainerForLayout = (targetContainerId, sourceContainerId, placement, parentId = "") => {
      const itemIds = uniqueIds(Array.isArray(placement.itemIds) ? placement.itemIds : [])
        .map((itemId) => cloneItemForLayout(itemId, targetContainerId))
        .filter(Boolean);
      const childIds = uniqueIds(Array.isArray(placement.childIds) ? placement.childIds : [])
        .map((childId) => cloneContainerForLayout(childId, targetContainerId))
        .filter(Boolean);
      const itemSet = new Set(itemIds);
      const childSet = new Set(childIds);
      const mappedOrder = (Array.isArray(placement.order) ? placement.order : [])
        .map((entry) => {
          if (entry?.type === "item") return { type: "item", id: cloneMap.items.get(entry.id) || entry.id };
          if (entry?.type === "container") return { type: "container", id: cloneMap.containers.get(entry.id) || entry.id };
          return null;
        })
        .filter((entry) => entry && (entry.type === "item" ? itemSet.has(entry.id) : childSet.has(entry.id)));

      targetState.containers[targetContainerId].itemIds = itemIds;
      targetState.containers[targetContainerId].childIds = childIds;
      targetState.containers[targetContainerId].order = mappedOrder.length ? mappedOrder : [
        ...itemIds.map((id) => ({ type: "item", id })),
        ...childIds.map((id) => ({ type: "container", id }))
      ];
      if (targetContainerId !== sourceContainerId) delete arrangement.containers[sourceContainerId];
      arrangement.containers[targetContainerId] = {
        parentId: parentId || "",
        itemIds: [...itemIds],
        childIds: [...childIds],
        order: targetState.containers[targetContainerId].order.map((entry) => ({ type: entry.type, id: entry.id }))
      };
      itemIds.forEach((itemId) => {
        arrangement.items[itemId] = targetContainerId;
      });
    };

    const rootIds = arrangement.rootContainerIds
      .map((rootId) => cloneContainerForLayout(rootId, ""))
      .filter(Boolean);
    arrangement.rootContainerIds = uniqueIds(rootIds);
    layout.rootContainerIds = [...arrangement.rootContainerIds];

    Object.entries(arrangement.containers).forEach(([containerId, placement]) => {
      if (!placement || typeof placement !== "object") return;
      placement.itemIds = uniqueIds(Array.isArray(placement.itemIds) ? placement.itemIds : [])
        .map((itemId) => cloneMap.items.get(itemId) || itemId)
        .filter((itemId) => targetState.items[itemId]);
      placement.childIds = uniqueIds(Array.isArray(placement.childIds) ? placement.childIds : [])
        .map((childId) => cloneMap.containers.get(childId) || childId)
        .filter((childId) => targetState.containers[childId]);
      const itemSet = new Set(placement.itemIds);
      const childSet = new Set(placement.childIds);
      placement.order = (Array.isArray(placement.order) ? placement.order : [])
        .map((entry) => {
          if (entry?.type === "item") return { type: "item", id: cloneMap.items.get(entry.id) || entry.id };
          if (entry?.type === "container") return { type: "container", id: cloneMap.containers.get(entry.id) || entry.id };
          return null;
        })
        .filter((entry) => entry && (entry.type === "item" ? itemSet.has(entry.id) : childSet.has(entry.id)));
      if (!placement.order.length) {
        placement.order = [
          ...placement.itemIds.map((id) => ({ type: "item", id })),
          ...placement.childIds.map((id) => ({ type: "container", id }))
        ];
      }
    });

    Object.entries(arrangement.items).forEach(([itemId, containerId]) => {
      const nextItemId = cloneMap.items.get(itemId) || itemId;
      const nextContainerId = cloneMap.containers.get(containerId) || containerId;
      if (nextItemId !== itemId) delete arrangement.items[itemId];
      if (targetState.items[nextItemId] && targetState.containers[nextContainerId]) {
        arrangement.items[nextItemId] = nextContainerId;
      }
    });
    Object.entries(arrangement.packedItems).forEach(([itemId, value]) => {
      const nextItemId = cloneMap.items.get(itemId);
      if (!nextItemId) return;
      delete arrangement.packedItems[itemId];
      arrangement.packedItems[nextItemId] = clonePlain(value);
    });
  });

  return report;
}

export function findLinkedLayoutEntityIds(targetState) {
  const containerLayouts = new Map();
  const itemLayouts = new Map();
  Object.values(targetState?.layouts || {}).filter(Boolean).forEach((layout) => {
    const layoutId = layout.id || "";
    const arrangement = layout.arrangement;
    if (!layoutId || !arrangement || typeof arrangement !== "object") return;
    (arrangement.rootContainerIds || layout.rootContainerIds || []).forEach((id) => addOwner(containerLayouts, id, layoutId));
    Object.keys(arrangement.containers || {}).forEach((id) => addOwner(containerLayouts, id, layoutId));
    Object.keys(arrangement.items || {}).forEach((id) => addOwner(itemLayouts, id, layoutId));
  });
  return {
    containers: linkedIds(containerLayouts),
    items: linkedIds(itemLayouts)
  };
}

function createIsolatedEntityId(kind, sourceId, targetState) {
  const collection = kind === "item" ? targetState.items : targetState.containers;
  const safeSourceId = String(sourceId || kind).replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || kind;
  for (let index = 1; index < 100000; index += 1) {
    const id = `${kind}-${safeSourceId}-isolated-${index}`;
    if (!collection[id]) return id;
  }
  return `${kind}-${safeSourceId}-isolated-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" ? value : {};
}

function uniqueIds(ids) {
  const seen = new Set();
  return ids.filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function addOwner(map, entityId, layoutId) {
  if (!entityId) return;
  if (!map.has(entityId)) map.set(entityId, new Set());
  map.get(entityId).add(layoutId);
}

function linkedIds(map) {
  return [...map.entries()]
    .filter(([, owners]) => owners.size > 1)
    .map(([id]) => id);
}

function placementFromContainer(container, parentId = "") {
  return {
    parentId: parentId || container?.parentId || "",
    itemIds: Array.isArray(container?.itemIds) ? container.itemIds : [],
    childIds: Array.isArray(container?.childIds) ? container.childIds : [],
    order: Array.isArray(container?.order) ? container.order : []
  };
}
