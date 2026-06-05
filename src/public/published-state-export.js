import { COLLAPSE_DEFAULTS_VERSION } from "../config/constants.js";

export function exportLayoutAsPublishedState(targetState, layoutId, {
  clone,
  createLayoutArrangementFromCurrentState,
  cssSafeId,
  ensureLayoutDictionaries,
  fallbackName = "",
  locations = [],
  categories = [],
  normalizePublishedStatePayload,
  stripPublishedPublicOriginMarkers
} = {}) {
  const layout = targetState.layouts?.[layoutId];
  if (!layout) throw new Error("Укладка не найдена.");
  const containers = {};
  const items = {};
  const containerIdMap = new Map();
  const itemIdMap = new Map();
  const mapContainerId = (containerId) => {
    if (containerIdMap.has(containerId)) return containerIdMap.get(containerId);
    const container = targetState.containers?.[containerId];
    const nextId = uniquePublishedRecordId(containers, cleanPublishedEntityId("container", container, containerId, { cssSafeId }));
    containerIdMap.set(containerId, nextId);
    return nextId;
  };
  const mapItemId = (itemId) => {
    if (itemIdMap.has(itemId)) return itemIdMap.get(itemId);
    const item = targetState.items?.[itemId];
    const nextId = uniquePublishedRecordId(items, cleanPublishedEntityId("item", item, itemId, { cssSafeId }));
    itemIdMap.set(itemId, nextId);
    return nextId;
  };
  const copyItemRecord = (itemId, containerId = "") => {
    const item = targetState.items?.[itemId];
    if (!item) return "";
    const nextItemId = mapItemId(itemId);
    if (items[nextItemId]) return nextItemId;
    items[nextItemId] = clone(item);
    items[nextItemId].id = nextItemId;
    items[nextItemId].containerId = containerId;
    stripPublishedPublicOriginMarkers(items[nextItemId]);
    return nextItemId;
  };
  const uniqueIds = (list = []) => {
    const result = [];
    list.forEach((id) => {
      if (typeof id === "string" && id && !result.includes(id)) result.push(id);
    });
    return result;
  };
  const placementForContainer = (containerId) => {
    const placement = layout.arrangement?.containers?.[containerId];
    const container = targetState.containers?.[containerId];
    if (placement && typeof placement === "object") {
      const orderEntries = Array.isArray(placement.order) ? placement.order : [];
      const itemIds = uniqueIds([
        ...(Array.isArray(placement.itemIds) ? placement.itemIds : []),
        ...orderEntries.filter((entry) => entry?.type === "item").map((entry) => entry.id)
      ]).filter((id) => targetState.items?.[id]);
      const childIds = uniqueIds([
        ...(Array.isArray(placement.childIds) ? placement.childIds : []),
        ...orderEntries.filter((entry) => entry?.type === "container").map((entry) => entry.id)
      ]).filter((id) => targetState.containers?.[id]);
      return {
        parentId: placement.parentId || "",
        itemIds,
        childIds,
        order: orderEntries
      };
    }
    return {
      parentId: container?.parentId || "",
      itemIds: uniqueIds(Array.isArray(container?.itemIds) ? container.itemIds : []).filter((id) => targetState.items?.[id]),
      childIds: uniqueIds(Array.isArray(container?.childIds) ? container.childIds : []).filter((id) => targetState.containers?.[id]),
      order: Array.isArray(container?.order) ? container.order : []
    };
  };
  const remapOrder = (order = []) => order.map((entry) => {
    if (entry?.type === "container") {
      const id = containerIdMap.get(entry.id);
      return id ? { type: "container", id } : null;
    }
    if (entry?.type === "item") {
      const id = itemIdMap.get(entry.id);
      return id ? { type: "item", id } : null;
    }
    return null;
  }).filter(Boolean);
  const walk = (containerId, parentId = null) => {
    const container = targetState.containers?.[containerId];
    if (!container) return "";
    const placement = placementForContainer(containerId);
    const nextContainerId = mapContainerId(containerId);
    if (containers[nextContainerId]) return nextContainerId;
    containers[nextContainerId] = clone(container);
    containers[nextContainerId].id = nextContainerId;
    containers[nextContainerId].parentId = parentId;
    delete containers[nextContainerId].adminDemo;
    delete containers[nextContainerId].adminSharedSourceId;
    delete containers[nextContainerId].publicCatalogLayoutId;
    placement.itemIds.forEach((itemId) => {
      copyItemRecord(itemId, nextContainerId);
    });
    placement.childIds.forEach((childId) => walk(childId, nextContainerId));
    containers[nextContainerId].childIds = placement.childIds.map((id) => containerIdMap.get(id)).filter(Boolean);
    containers[nextContainerId].itemIds = placement.itemIds.map((id) => itemIdMap.get(id)).filter(Boolean);
    containers[nextContainerId].order = remapOrder(placement.order || []);
    if (!containers[nextContainerId].order.length) {
      containers[nextContainerId].order = [
        ...containers[nextContainerId].itemIds.map((id) => ({ type: "item", id })),
        ...containers[nextContainerId].childIds.map((id) => ({ type: "container", id }))
      ];
    }
    stripPublishedPublicOriginMarkers(containers[nextContainerId]);
    return nextContainerId;
  };
  const rootContainerIds = uniqueIds([
    ...(Array.isArray(layout.arrangement?.rootContainerIds) ? layout.arrangement.rootContainerIds : []),
    ...(Array.isArray(layout.rootContainerIds) ? layout.rootContainerIds : [])
  ]).map((id) => walk(id, null)).filter(Boolean);
  Object.entries(targetState.containers || {}).forEach(([containerId, container]) => {
    if (!container || containerIdMap.has(containerId)) return;
    if (container.publicCatalogLayoutId !== layoutId) return;
    walk(containerId, null);
  });
  Object.entries(targetState.items || {}).forEach(([itemId, item]) => {
    if (!item || itemIdMap.has(itemId)) return;
    if (item.publicCatalogLayoutId !== layoutId) return;
    copyItemRecord(itemId, "");
  });
  const dictionaryOwner = ensureLayoutDictionaries(layout);
  const publishedLocations = publishedDictionaryValues("location", dictionaryOwner, locations, { containers, items });
  const publishedCategories = publishedDictionaryValues("category", dictionaryOwner, categories, { containers, items });
  const demoLayout = {
    ...clone(layout),
    id: "layout-main",
    name: layout.name || fallbackName,
    rootContainerIds
  };
  delete demoLayout.adminDemo;
  delete demoLayout.adminSharedSourceId;
  delete demoLayout.sharedSourceId;
  delete demoLayout.publicCatalogLayoutId;
  stripPublishedPublicOriginMarkers(demoLayout);
  const demoState = {
    locations: publishedLocations,
    categories: publishedCategories,
    containers,
    items,
    layouts: { "layout-main": demoLayout },
    activeLayoutId: "layout-main",
    collapsedContainers: {},
    collapseDefaultsVersion: COLLAPSE_DEFAULTS_VERSION,
    showItemMeta: true,
    showFilterContext: false,
    collectionMode: false,
    showOnlyUnpacked: false,
    packedItems: {}
  };
  demoLayout.arrangement = createLayoutArrangementFromCurrentState(demoState, demoLayout.rootContainerIds);
  return normalizePublishedStatePayload(demoState) || demoState;
}

export function cleanPublishedEntityId(type, entity, fallbackId = "", { cssSafeId } = {}) {
  const prefix = type === "container" ? "container" : "item";
  const toSafeId = typeof cssSafeId === "function" ? cssSafeId : fallbackSafeId;
  const sourceSeed = cleanGeneratedEntityId(entity?.sharedSourceId || entity?.id || fallbackId);
  const nameSeed = entity?.name ? toSafeId(entity.name) : "";
  let seed = sourceSeed || nameSeed || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  seed = String(seed).trim();
  if (!seed.startsWith(`${prefix}-`)) seed = `${prefix}-${seed}`;
  seed = seed.replace(/[^a-zа-я0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return seed || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fallbackSafeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-я0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function cleanGeneratedEntityId(value) {
  let id = String(value || "").trim();
  if (!id) return "";
  let previous = "";
  while (id && id !== previous) {
    previous = id;
    id = id
      .replace(/^admin-demo-container-\d+-/, "")
      .replace(/^admin-demo-item-\d+-/, "")
      .replace(/^container-shared-/, "")
      .replace(/^item-shared-/, "")
      .replace(/^shared-container-/, "")
      .replace(/^shared-item-/, "")
      .replace(/^shared-virtual-container-/, "")
      .replace(/^shared-virtual-item-/, "");
  }
  return id;
}

export function uniquePublishedRecordId(records, preferredId) {
  if (!records?.[preferredId]) return preferredId;
  let index = 2;
  while (records[`${preferredId}-${index}`]) index += 1;
  return `${preferredId}-${index}`;
}

function publishedDictionaryValues(type, owner, defaults = [], { containers = {}, items = {} } = {}) {
  const values = [...(owner?.[type === "location" ? "locations" : "categories"] || defaults)];
  const addRecord = (record) => {
    if (!record || typeof record !== "object") return;
    if (type === "location") {
      if (record.location) values.push(record.location);
      return;
    }
    if (Array.isArray(record.categories)) values.push(...record.categories);
    else if (record.category) values.push(record.category);
  };
  Object.values(containers || {}).forEach(addRecord);
  Object.values(items || {}).forEach(addRecord);
  return uniqueTextValues(values);
}

function uniqueTextValues(values = []) {
  const result = [];
  values.forEach((value) => {
    if (typeof value !== "string") return;
    const normalized = value.trim();
    if (normalized && !result.includes(normalized)) result.push(normalized);
  });
  return result;
}
