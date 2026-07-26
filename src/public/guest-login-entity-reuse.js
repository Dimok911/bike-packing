import {
  createEmptyLayoutArrangement,
  uniqueLayoutIds
} from "../state/layout-arrangement.js";
import {
  getLayoutContainerIdSet,
  getLayoutItemIdSet
} from "../state/layout-ops.js";
import { publicCopyRecordContentHash } from "./copy-duplicates.js";
import { publicCopySourceIdFromRecord } from "./copy-public-to-private.js";
import { guestSharedLinkDetachedItemIds } from "./guest-shared-link-target.js";

function normalizedText(value) {
  return String(value || "").trim();
}

function recordTime(record) {
  const value = Date.parse(record?.createdAt || record?.updatedAt || "");
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function stableRecordIds(ids, records) {
  return [...new Set(ids)].sort((left, right) => {
    const timeDifference = recordTime(records?.[left]) - recordTime(records?.[right]);
    if (timeDifference) return timeDifference;
    return String(left).localeCompare(String(right));
  });
}

export function guestTemplateEntityReuseKey(layout) {
  const demoListId = normalizedText(layout?.demoSourceListId);
  if (demoListId) return `demo:${demoListId}`;
  if (layout?._publicCopySourceKind === "layout") {
    const sharedSourceId = normalizedText(layout._publicCopySourceId);
    if (sharedSourceId) return `shared:${sharedSourceId}`;
  }
  return "";
}

function entityMatchKey(record, kind, fallbackId) {
  const sourceId = publicCopySourceIdFromRecord(record, kind, fallbackId);
  if (!sourceId) return "";
  const contentHash = publicCopyRecordContentHash({
    ...record,
    photos: []
  }, kind);
  return contentHash ? `${sourceId}\u001f${contentHash}` : "";
}

function isReusablePrivateLayout(layout) {
  return Boolean(layout && !layout.adminDemo && !layout.adminSharedSourceId);
}

function candidatePrivateLayoutEntityIds(targetState, kind) {
  const ids = new Set();
  Object.values(targetState?.layouts || {}).forEach((layout) => {
    if (!isReusablePrivateLayout(layout)) return;
    const layoutIds = kind === "container"
      ? getLayoutContainerIdSet(targetState, layout)
      : getLayoutItemIdSet(targetState, layout);
    layoutIds.forEach((id) => ids.add(id));
    if (kind === "item") {
      guestSharedLinkDetachedItemIds(layout).forEach((id) => {
        if (targetState?.items?.[id]) ids.add(id);
      });
    }
  });
  return ids;
}

function assignReusableEntityIds(sourceIds, sourceRecords, targetIds, targetRecords, kind) {
  const candidatesByKey = new Map();
  stableRecordIds(targetIds, targetRecords).forEach((targetId) => {
    const key = entityMatchKey(targetRecords?.[targetId], kind, targetId);
    if (!key) return;
    if (!candidatesByKey.has(key)) candidatesByKey.set(key, []);
    candidatesByKey.get(key).push(targetId);
  });

  const assignments = new Map();
  const usedTargetIds = new Set();
  sourceIds.forEach((sourceId) => {
    const key = entityMatchKey(sourceRecords?.[sourceId], kind, sourceId);
    if (!key) return;
    const targetId = (candidatesByKey.get(key) || []).find((id) => !usedTargetIds.has(id));
    if (!targetId) return;
    assignments.set(sourceId, targetId);
    usedTargetIds.add(targetId);
  });
  return assignments;
}

export function planGuestTemplateEntityReuse(targetState, sourceState, sourceLayout) {
  const templateKey = guestTemplateEntityReuseKey(sourceLayout);
  const sourceContainerIds = [...getLayoutContainerIdSet(sourceState, sourceLayout)];
  const sourceItemIds = uniqueLayoutIds([
    ...getLayoutItemIdSet(sourceState, sourceLayout),
    ...guestSharedLinkDetachedItemIds(sourceLayout)
  ]).filter((id) => sourceState?.items?.[id]);
  return {
    templateKey,
    containers: assignReusableEntityIds(
      sourceContainerIds,
      sourceState?.containers || {},
      candidatePrivateLayoutEntityIds(targetState, "container"),
      targetState?.containers || {},
      "container"
    ),
    items: assignReusableEntityIds(
      sourceItemIds,
      sourceState?.items || {},
      candidatePrivateLayoutEntityIds(targetState, "item"),
      targetState?.items || {},
      "item"
    )
  };
}

function mappedExistingId(idMap, sourceId, records) {
  const id = idMap.get(sourceId);
  return id && records?.[id] ? id : "";
}

function mappedIds(values, idMap, records) {
  return uniqueLayoutIds((Array.isArray(values) ? values : [])
    .map((id) => mappedExistingId(idMap, id, records))
    .filter(Boolean));
}

function mappedOrder(values, containerIdMap, itemIdMap, targetState) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).map((entry) => {
    if (entry?.type === "container") {
      const id = mappedExistingId(containerIdMap, entry.id, targetState?.containers);
      return id ? { type: "container", id } : null;
    }
    if (entry?.type === "item") {
      const id = mappedExistingId(itemIdMap, entry.id, targetState?.items);
      return id ? { type: "item", id } : null;
    }
    return null;
  }).filter((entry) => {
    if (!entry) return false;
    const key = `${entry.type}:${entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function remapGuestLayoutArrangement(sourceLayout, targetState, {
  containerIdMap = new Map(),
  itemIdMap = new Map(),
  fallbackArrangement = () => createEmptyLayoutArrangement()
} = {}) {
  const source = sourceLayout?.arrangement;
  if (
    !source ||
    typeof source !== "object" ||
    !source.containers ||
    typeof source.containers !== "object"
  ) {
    return fallbackArrangement();
  }

  const arrangement = createEmptyLayoutArrangement();
  arrangement.rootContainerIds = mappedIds(
    uniqueLayoutIds([
      ...(sourceLayout?.rootContainerIds || []),
      ...(source.rootContainerIds || [])
    ]),
    containerIdMap,
    targetState?.containers
  );

  Object.entries(source.containers || {}).forEach(([sourceContainerId, placement]) => {
    const containerId = mappedExistingId(containerIdMap, sourceContainerId, targetState?.containers);
    if (!containerId || !placement || typeof placement !== "object") return;
    arrangement.containers[containerId] = {
      parentId: mappedExistingId(containerIdMap, placement.parentId, targetState?.containers),
      itemIds: mappedIds(placement.itemIds, itemIdMap, targetState?.items),
      childIds: mappedIds(placement.childIds, containerIdMap, targetState?.containers),
      order: mappedOrder(placement.order, containerIdMap, itemIdMap, targetState)
    };
  });

  Object.entries(source.items || {}).forEach(([sourceItemId, sourceContainerId]) => {
    const itemId = mappedExistingId(itemIdMap, sourceItemId, targetState?.items);
    const containerId = mappedExistingId(containerIdMap, sourceContainerId, targetState?.containers);
    if (itemId && containerId) arrangement.items[itemId] = containerId;
  });
  Object.entries(arrangement.containers).forEach(([containerId, placement]) => {
    placement.itemIds.forEach((itemId) => {
      arrangement.items[itemId] = containerId;
    });
  });
  Object.entries(source.packedItems || {}).forEach(([sourceItemId, packed]) => {
    const itemId = mappedExistingId(itemIdMap, sourceItemId, targetState?.items);
    if (packed && itemId && arrangement.items[itemId]) arrangement.packedItems[itemId] = true;
  });

  if (arrangement.rootContainerIds.length && !Object.keys(arrangement.containers).length) {
    return fallbackArrangement();
  }
  return arrangement;
}
