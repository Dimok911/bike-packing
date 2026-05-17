import {
  isGeneratedCatalogContainerStateArtifact,
  isGeneratedCatalogContainerSyncArtifact
} from "../public/generated-artifacts.js";
import { clonePlain } from "../utils/json.js";
import {
  createEmptyLayoutArrangement,
  createLayoutArrangementFromCurrentState,
  uniqueLayoutIds
} from "./layout-arrangement.js";
import { repairContainerMembershipFromItemLinks } from "./repair.js";

const DEFAULT_LAYOUT_NAME = "РўРµРєСѓС‰Р°СЏ СѓРєР»Р°РґРєР°";

export function normalizeLayoutFields(targetState) {
  const containers = targetState.containers && typeof targetState.containers === "object" ? targetState.containers : {};
  const rootContainerIds = Object.values(containers)
    .filter((container) => container && !container.parentId)
    .map((container) => container.id)
    .filter(Boolean);
  const privateRootContainerIds = rootContainerIds.filter((containerId) =>
    !isGeneratedCatalogContainerSyncArtifact(containerId, containers[containerId]) &&
    !isGeneratedCatalogContainerStateArtifact(containerId, containers[containerId], targetState)
  );
  const containerIdSet = new Set(Object.keys(containers));
  if (!targetState.layouts || typeof targetState.layouts !== "object") targetState.layouts = {};

  Object.entries(targetState.layouts).forEach(([layoutId, layout]) => {
    if (!layout || typeof layout !== "object") {
      delete targetState.layouts[layoutId];
      return;
    }
    layout.id = layout.id || layoutId;
    layout.name = String(layout.name || DEFAULT_LAYOUT_NAME).trim() || DEFAULT_LAYOUT_NAME;
    const seen = new Set();
    const publicLayout = Boolean(layout.adminDemo || layout.adminSharedSourceId);
    layout.rootContainerIds = (Array.isArray(layout.rootContainerIds) ? layout.rootContainerIds : [])
      .filter((containerId) => containerIdSet.has(containerId))
      .filter((containerId) => publicLayout ||
        (
          !isGeneratedCatalogContainerSyncArtifact(containerId, containers[containerId]) &&
          !isGeneratedCatalogContainerStateArtifact(containerId, containers[containerId], targetState)
        )
      )
      .filter((containerId) => {
        if (seen.has(containerId)) return false;
        seen.add(containerId);
        return true;
      });
    const hasStoredArrangement = Boolean(
      layout.arrangement &&
      typeof layout.arrangement === "object" &&
      (Array.isArray(layout.arrangement.rootContainerIds) ||
        (layout.arrangement.containers && typeof layout.arrangement.containers === "object") ||
        (layout.arrangement.items && typeof layout.arrangement.items === "object"))
    );
    const fallbackRootIds = publicLayout ? [] : privateRootContainerIds;
    if (!layout.rootContainerIds.length && !hasStoredArrangement && fallbackRootIds.length) {
      layout.rootContainerIds = [...fallbackRootIds];
    }
    normalizeLayoutArrangement(layout, targetState);
  });

  const layoutValues = Object.values(targetState.layouts);
  if (!layoutValues.length) {
    const id = "layout-main";
    targetState.layouts[id] = {
      id,
      name: DEFAULT_LAYOUT_NAME,
      rootContainerIds: [...privateRootContainerIds]
    };
  }

  if (!targetState.activeLayoutId || !targetState.layouts[targetState.activeLayoutId]) {
    const firstWithContainers = Object.values(targetState.layouts).find((layout) => layout.rootContainerIds?.length);
    const fallback = firstWithContainers || Object.values(targetState.layouts)[0];
    targetState.activeLayoutId = fallback?.id || "layout-main";
  }
}

export function repairPublishedLayoutArrangement(targetState) {
  const layout = targetState.layouts?.[targetState.activeLayoutId] || Object.values(targetState.layouts || {})[0];
  if (!layout) return;
  const linkedItemCount = Object.values(targetState.items || {}).filter((item) => item?.containerId && targetState.containers?.[item.containerId]).length;
  const linkedChildCount = Object.values(targetState.containers || {}).filter((container) => container?.parentId && targetState.containers?.[container.parentId]).length;
  const arrangement = layout.arrangement;
  const arrangedItemCount = arrangement?.items && typeof arrangement.items === "object" ? Object.keys(arrangement.items).length : 0;
  const arrangedChildCount = arrangement?.containers && typeof arrangement.containers === "object"
    ? Object.values(arrangement.containers).reduce((count, placement) => count + (Array.isArray(placement?.childIds) ? placement.childIds.length : 0), 0)
    : 0;
  const staleArrangement =
    !arrangement ||
    typeof arrangement !== "object" ||
    (linkedItemCount > arrangedItemCount) ||
    (linkedChildCount > arrangedChildCount && arrangedChildCount === 0);
  if (!staleArrangement) return;
  const rootContainerIds = Array.isArray(layout.rootContainerIds) && layout.rootContainerIds.length
    ? layout.rootContainerIds
    : Object.values(targetState.containers || {}).filter((container) => container && !container.parentId).map((container) => container.id).filter(Boolean);
  layout.arrangement = createLayoutArrangementFromCurrentState(targetState, rootContainerIds);
}

export function normalizeLayoutArrangement(layout, targetState) {
  if (!layout || typeof layout !== "object") return createEmptyLayoutArrangement();
  const hadStoredArrangement = Boolean(
    layout.arrangement &&
    typeof layout.arrangement === "object" &&
    layout.arrangement.containers &&
    typeof layout.arrangement.containers === "object" &&
    layout.arrangement.items &&
    typeof layout.arrangement.items === "object"
  );
  if (
    !layout.arrangement ||
    typeof layout.arrangement !== "object" ||
    !layout.arrangement.containers ||
    typeof layout.arrangement.containers !== "object" ||
    !layout.arrangement.items ||
    typeof layout.arrangement.items !== "object"
  ) {
    repairContainerMembershipFromItemLinks(targetState);
    layout.arrangement = createLayoutArrangementFromCurrentState(targetState, layout.rootContainerIds || []);
  }
  const arrangement = layout.arrangement;
  const containers = targetState.containers || {};
  const items = targetState.items || {};
  const containerIdSet = new Set(Object.keys(containers));
  const itemIdSet = new Set(Object.keys(items));
  const uniqueRootIds = [];
  const fallbackRootIds = Object.values(containers)
    .filter((container) => container && !container.parentId)
    .map((container) => container.id)
    .filter(Boolean);
  const sourceRootIds = [
    ...(Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : []),
    ...(Array.isArray(layout.rootContainerIds) ? layout.rootContainerIds : []),
    ...(!hadStoredArrangement ? fallbackRootIds : [])
  ];
  sourceRootIds.forEach((id) => {
    if (!containerIdSet.has(id) || uniqueRootIds.includes(id)) return;
    uniqueRootIds.push(id);
  });
  arrangement.rootContainerIds = uniqueRootIds;
  layout.rootContainerIds = uniqueRootIds;
  arrangement.containers = arrangement.containers && typeof arrangement.containers === "object" ? arrangement.containers : {};
  arrangement.items = arrangement.items && typeof arrangement.items === "object" ? arrangement.items : {};
  Object.entries(arrangement.items).forEach(([itemId, containerId]) => {
    if (!itemIdSet.has(itemId) || !containerIdSet.has(containerId)) delete arrangement.items[itemId];
  });
  if (!hadStoredArrangement) repairBareLayoutRootArrangement(layout, targetState);
  Object.entries(arrangement.containers).forEach(([containerId, placement]) => {
    if (!containerIdSet.has(containerId) || !placement || typeof placement !== "object") {
      delete arrangement.containers[containerId];
      return;
    }
    placement.parentId = placement.parentId && containerIdSet.has(placement.parentId) ? placement.parentId : "";
    placement.itemIds = uniqueLayoutIds(Array.isArray(placement.itemIds) ? placement.itemIds : [])
      .filter((id) => itemIdSet.has(id) && arrangement.items[id] === containerId);
    placement.childIds = uniqueLayoutIds(Array.isArray(placement.childIds) ? placement.childIds : []).filter((id) => containerIdSet.has(id));
    placement.order = (Array.isArray(placement.order) ? placement.order : [])
      .filter((entry) => entry && (entry.type === "item" || entry.type === "container") && entry.id)
      .filter((entry) => entry.type === "item" ? placement.itemIds.includes(entry.id) : placement.childIds.includes(entry.id))
      .filter((entry, index, list) => list.findIndex((item) => item.type === entry.type && item.id === entry.id) === index);
  });
  arrangement.packedItems = arrangement.packedItems && typeof arrangement.packedItems === "object" ? arrangement.packedItems : {};
  Object.keys(arrangement.packedItems).forEach((itemId) => {
    if (!itemIdSet.has(itemId) || !arrangement.items[itemId]) delete arrangement.packedItems[itemId];
  });
  const placedItems = Math.max(
    Object.values(items).filter((item) => item?.containerId && containerIdSet.has(item.containerId)).length,
    Object.values(containers).reduce((sum, container) => {
      return sum + uniqueLayoutIds(Array.isArray(container?.itemIds) ? container.itemIds : []).filter((itemId) => itemIdSet.has(itemId)).length;
    }, 0)
  );
  const arrangedItems = Object.keys(arrangement.items || {}).length;
  if (!hadStoredArrangement && placedItems >= 3 && arrangedItems < Math.max(1, Math.floor(placedItems * 0.5))) {
    repairContainerMembershipFromItemLinks(targetState);
    const rebuilt = createLayoutArrangementFromCurrentState(targetState, layout.rootContainerIds || uniqueRootIds);
    if (Object.keys(rebuilt.items || {}).length > arrangedItems) {
      layout.arrangement = rebuilt;
      return normalizeLayoutArrangement(layout, targetState);
    }
  }
  return arrangement;
}

export function snapshotContainerTreeFromLayoutArrangement(containerId, { sourceLayoutId = "", excludeLayoutId = "", targetState } = {}) {
  const source = sourceLayoutId
    ? targetState.layouts?.[sourceLayoutId]
    : findBestSourceLayoutForContainerTree(containerId, { excludeLayoutId, targetState });
  const arrangement = source?.arrangement;
  if (!arrangement || typeof arrangement !== "object" || !arrangement.containers?.[containerId]) return null;
  const containers = {};
  const items = {};
  const visitedContainers = new Set();
  const copyItem = (itemId, parentId) => {
    if (items[itemId]) return;
    const item = targetState.items?.[itemId];
    if (item) items[itemId] = { ...clonePlain(item), containerId: parentId };
  };
  const copyContainer = (id, parentId = null) => {
    if (visitedContainers.has(id)) return;
    const container = targetState.containers?.[id];
    const placement = arrangement.containers?.[id];
    if (!container || !placement) return;
    visitedContainers.add(id);
    const itemIds = uniqueLayoutIds(Array.isArray(placement.itemIds) ? placement.itemIds : []).filter((itemId) => targetState.items?.[itemId]);
    const childIds = uniqueLayoutIds(Array.isArray(placement.childIds) ? placement.childIds : []).filter((childId) => targetState.containers?.[childId]);
    const itemSet = new Set(itemIds);
    const childSet = new Set(childIds);
    const order = (Array.isArray(placement.order) ? placement.order : [])
      .filter((entry) => entry && (entry.type === "item" || entry.type === "container") && entry.id)
      .filter((entry) => entry.type === "item" ? itemSet.has(entry.id) : childSet.has(entry.id))
      .map((entry) => ({ type: entry.type, id: entry.id }));
    containers[id] = {
      ...clonePlain(container),
      parentId,
      childIds,
      itemIds,
      order: order.length ? order : [
        ...itemIds.map((itemId) => ({ type: "item", id: itemId })),
        ...childIds.map((childId) => ({ type: "container", id: childId }))
      ]
    };
    itemIds.forEach((itemId) => copyItem(itemId, id));
    childIds.forEach((childId) => copyContainer(childId, id));
  };
  copyContainer(containerId, null);
  return containers[containerId] ? { rootId: containerId, containers, items } : null;
}

function repairBareLayoutRootArrangement(layout, targetState) {
  const arrangement = layout?.arrangement;
  if (!layout || !arrangement || typeof arrangement !== "object") return false;
  let repaired = false;
  (layout.rootContainerIds || []).forEach((rootId) => {
    const currentScore = layoutArrangementContainerTreeScore(arrangement, rootId);
    const sourceLayout = findBestSourceLayoutForContainerTree(rootId, { excludeLayoutId: layout.id, targetState });
    const sourceArrangement = sourceLayout?.arrangement;
    const sourceScore = layoutArrangementContainerTreeScore(sourceArrangement, rootId);
    if (!sourceArrangement || sourceScore <= currentScore) return;
    const snapshot = snapshotContainerTreeFromLayoutArrangement(rootId, { sourceLayoutId: sourceLayout.id, targetState });
    if (!snapshot) return;
    Object.entries(snapshot.containers).forEach(([snapshotContainerId, container]) => {
      arrangement.containers[snapshotContainerId] = {
        parentId: container.parentId || "",
        itemIds: [...(container.itemIds || [])],
        childIds: [...(container.childIds || [])],
        order: (container.order || []).map((entry) => ({ type: entry.type, id: entry.id }))
      };
    });
    Object.entries(snapshot.items).forEach(([itemId, item]) => {
      if (item?.containerId) arrangement.items[itemId] = item.containerId;
    });
    repaired = true;
  });
  return repaired;
}

function findBestSourceLayoutForContainerTree(containerId, { excludeLayoutId = "", targetState } = {}) {
  return Object.values(targetState.layouts || {})
    .filter((layout) => layout?.id !== excludeLayoutId)
    .map((layout) => ({
      layout,
      score: layoutArrangementContainerTreeScore(layout?.arrangement, containerId) +
        ((layout?.arrangement?.rootContainerIds || layout?.rootContainerIds || []).includes(containerId) ? 1000 : 0)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.layout || null;
}

function layoutArrangementContainerTreeScore(arrangement, containerId) {
  if (!arrangement || typeof arrangement !== "object" || !arrangement.containers?.[containerId]) return 0;
  const visited = new Set();
  const walk = (id) => {
    if (visited.has(id)) return 0;
    const placement = arrangement.containers?.[id];
    if (!placement) return 0;
    visited.add(id);
    const itemCount = Array.isArray(placement.itemIds) ? placement.itemIds.length : 0;
    const childIds = Array.isArray(placement.childIds) ? placement.childIds : [];
    return 1 + itemCount + childIds.reduce((sum, childId) => sum + walk(childId), 0);
  };
  return walk(containerId);
}
