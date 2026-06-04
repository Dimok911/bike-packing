import { clonePlain } from "../utils/json.js";

const REPAIR_BASE_STATE_KEY = "__layoutEntityRepairBaseState";

export function isolateLinkedLayoutEntities(targetState) {
  return repairAccidentalIsolatedLayoutEntities(targetState);
}

export function repairAccidentalIsolatedLayoutEntities(targetState) {
  const report = {
    clonedContainers: 0,
    clonedItems: 0,
    mergedContainers: 0,
    mergedItems: 0,
    layoutIds: []
  };
  if (!targetState?.layouts || !targetState?.containers || !targetState?.items) return report;

  const containerReplacements = isolatedEntityReplacementMap(targetState.containers, "container");
  const itemReplacements = isolatedEntityReplacementMap(targetState.items, "item");
  if (!containerReplacements.size && !itemReplacements.size) return report;

  const touchedLayouts = new Set();
  Object.values(targetState.layouts).filter(Boolean).forEach((layout) => {
    if (rewriteLayoutEntityIds(layout, { containerReplacements, itemReplacements })) {
      touchedLayouts.add(layout.id || "");
    }
  });
  rewriteStateKeyMap(targetState.collapsedContainers, containerReplacements);
  rewriteStateKeyMap(targetState.packedItems, itemReplacements);

  containerReplacements.forEach((sourceId, duplicateId) => {
    if (targetState.containers?.[duplicateId] && targetState.containers?.[sourceId]) {
      delete targetState.containers[duplicateId];
      report.mergedContainers += 1;
    }
  });
  itemReplacements.forEach((sourceId, duplicateId) => {
    if (targetState.items?.[duplicateId] && targetState.items?.[sourceId]) {
      delete targetState.items[duplicateId];
      report.mergedItems += 1;
    }
  });
  report.layoutIds = [...touchedLayouts].filter(Boolean);
  return report;
}

export function layoutEntityRepairChanged(report) {
  return Boolean((report?.mergedContainers || 0) || (report?.mergedItems || 0));
}

export function rememberLayoutEntityRepairBaseState(targetState, baseState, report) {
  if (!targetState || !baseState || !layoutEntityRepairChanged(report)) return targetState;
  Object.defineProperty(targetState, REPAIR_BASE_STATE_KEY, {
    value: baseState,
    configurable: true,
    enumerable: false,
    writable: true
  });
  return targetState;
}

export function layoutEntityRepairBaseState(targetState) {
  return targetState?.[REPAIR_BASE_STATE_KEY] || null;
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

function isolatedEntityReplacementMap(records, kind) {
  const replacements = new Map();
  Object.keys(records || {}).forEach((id) => {
    const sourceId = isolatedSourceId(id, kind);
    if (!sourceId || !records[sourceId]) return;
    replacements.set(id, sourceId);
  });
  return replacements;
}

function isolatedSourceId(id, kind) {
  const value = String(id || "");
  const marker = "-isolated-";
  const markerIndex = value.lastIndexOf(marker);
  if (markerIndex <= 0) return "";
  const suffix = value.slice(markerIndex + marker.length);
  if (!/^\d+(?:-.+)?$/.test(suffix)) return "";
  const prefix = `${kind}-`;
  const encodedSource = value.slice(0, markerIndex);
  if (!encodedSource.startsWith(prefix)) return "";
  return encodedSource.slice(prefix.length);
}

function rewriteLayoutEntityIds(layout, { containerReplacements, itemReplacements }) {
  let changed = false;
  const replaceContainerId = (id) => containerReplacements.get(id) || id;
  const replaceItemId = (id) => itemReplacements.get(id) || id;

  const nextRootContainerIds = uniqueIds((layout.rootContainerIds || []).map(replaceContainerId));
  if (!sameArray(layout.rootContainerIds || [], nextRootContainerIds)) {
    layout.rootContainerIds = nextRootContainerIds;
    changed = true;
  }

  const arrangement = layout.arrangement;
  if (!arrangement || typeof arrangement !== "object") return changed;
  const nextArrangementRootIds = uniqueIds((arrangement.rootContainerIds || []).map(replaceContainerId));
  if (!sameArray(arrangement.rootContainerIds || [], nextArrangementRootIds)) {
    arrangement.rootContainerIds = nextArrangementRootIds;
    changed = true;
  }

  const nextContainers = {};
  Object.entries(arrangement.containers || {}).forEach(([containerId, placement]) => {
    const nextContainerId = replaceContainerId(containerId);
    const nextPlacement = rewritePlacement(placement, { replaceContainerId, replaceItemId });
    if (nextContainerId !== containerId || nextPlacement.changed) changed = true;
    nextContainers[nextContainerId] = mergePlacement(nextContainers[nextContainerId], nextPlacement.value);
  });
  arrangement.containers = nextContainers;

  const nextItems = {};
  Object.entries(arrangement.items || {}).forEach(([itemId, containerId]) => {
    const nextItemId = replaceItemId(itemId);
    const nextContainerId = replaceContainerId(containerId);
    if (nextItemId !== itemId || nextContainerId !== containerId) changed = true;
    nextItems[nextItemId] = nextContainerId;
  });
  arrangement.items = nextItems;

  const nextPackedItems = {};
  Object.entries(arrangement.packedItems || {}).forEach(([itemId, value]) => {
    const nextItemId = replaceItemId(itemId);
    if (nextItemId !== itemId) changed = true;
    nextPackedItems[nextItemId] = cloneValue(value);
  });
  arrangement.packedItems = nextPackedItems;
  return changed;
}

function rewritePlacement(placement, { replaceContainerId, replaceItemId }) {
  const source = placement && typeof placement === "object" ? placement : {};
  const next = {
    parentId: source.parentId ? replaceContainerId(source.parentId) : "",
    itemIds: uniqueIds((source.itemIds || []).map(replaceItemId)),
    childIds: uniqueIds((source.childIds || []).map(replaceContainerId)),
    order: uniqueOrder((source.order || []).map((entry) => {
      if (entry?.type === "item") return { type: "item", id: replaceItemId(entry.id) };
      if (entry?.type === "container") return { type: "container", id: replaceContainerId(entry.id) };
      return null;
    }).filter(Boolean))
  };
  const changed =
    next.parentId !== (source.parentId || "") ||
    !sameArray(next.itemIds, source.itemIds || []) ||
    !sameArray(next.childIds, source.childIds || []) ||
    !sameOrder(next.order, source.order || []);
  return { value: next, changed };
}

function mergePlacement(left, right) {
  if (!left) return right;
  const itemIds = uniqueIds([...(left.itemIds || []), ...(right.itemIds || [])]);
  const childIds = uniqueIds([...(left.childIds || []), ...(right.childIds || [])]);
  const known = new Set([
    ...itemIds.map((id) => `item:${id}`),
    ...childIds.map((id) => `container:${id}`)
  ]);
  const order = uniqueOrder([...(left.order || []), ...(right.order || [])])
    .filter((entry) => known.has(`${entry.type}:${entry.id}`));
  const orderKeys = new Set(order.map((entry) => `${entry.type}:${entry.id}`));
  return {
    parentId: left.parentId || right.parentId || "",
    itemIds,
    childIds,
    order: [
      ...order,
      ...itemIds.filter((id) => !orderKeys.has(`item:${id}`)).map((id) => ({ type: "item", id })),
      ...childIds.filter((id) => !orderKeys.has(`container:${id}`)).map((id) => ({ type: "container", id }))
    ]
  };
}

function rewriteStateKeyMap(map, replacements) {
  if (!map || typeof map !== "object" || !replacements.size) return;
  Object.entries(map).forEach(([id, value]) => {
    const nextId = replacements.get(id);
    if (!nextId) return;
    delete map[id];
    if (!Object.prototype.hasOwnProperty.call(map, nextId)) map[nextId] = cloneValue(value);
  });
}

function cloneValue(value) {
  return value === undefined ? value : clonePlain(value);
}

function uniqueIds(ids) {
  const seen = new Set();
  return (ids || []).filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function uniqueOrder(order) {
  const seen = new Set();
  return (order || []).filter((entry) => {
    const key = `${entry?.type}:${entry?.id}`;
    if (!entry?.type || !entry?.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameArray(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function sameOrder(left, right) {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => entry.type === right[index]?.type && entry.id === right[index]?.id);
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
