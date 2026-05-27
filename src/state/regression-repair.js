import { isMeaningfulPackingState, stateStats } from "./diagnostics.js";
import {
  createLayoutArrangementFromCurrentState,
  uniqueLayoutIds
} from "./layout-arrangement.js";
import { migrateContainerOrder } from "./normalize.js";
import { repairContainerMembershipFromItemLinks } from "./repair.js";

export function repairPlacementRegressionFromReference(targetState, referenceState) {
  if (!targetState || !referenceState || !isMeaningfulPackingState(targetState) || !isMeaningfulPackingState(referenceState)) return false;
  const repairedHierarchy = repairContainerHierarchyRegressionFromReference(targetState, referenceState);
  const before = stateStats(targetState);
  const reference = stateStats(referenceState);
  const beforePlacement = Math.max(before.placedItems, before.linkedItems, before.arrangedItems);
  const referencePlacement = Math.max(reference.placedItems, reference.linkedItems, reference.arrangedItems);
  if (referencePlacement < 10 || beforePlacement >= Math.max(1, Math.floor(referencePlacement * 0.5))) return repairedHierarchy;
  if (before.items < Math.max(1, Math.floor(reference.items * 0.5))) return repairedHierarchy;

  let repaired = 0;
  Object.entries(targetState.items || {}).forEach(([itemId, item]) => {
    const referenceItem = referenceState.items?.[itemId];
    const referenceContainerId = referenceItem?.containerId;
    if (!item || !referenceContainerId || !targetState.containers?.[referenceContainerId]) return;
    if (item.containerId && targetState.containers[item.containerId]) return;
    item.containerId = referenceContainerId;
    repaired += 1;
  });
  if (!repaired) return false;

  targetState.packedItems = targetState.packedItems && typeof targetState.packedItems === "object" ? targetState.packedItems : {};
  Object.entries(referenceState.packedItems || {}).forEach(([itemId, value]) => {
    if (value && targetState.items?.[itemId]) targetState.packedItems[itemId] = true;
  });
  repairContainerMembershipFromItemLinks(targetState);
  migrateContainerOrder(targetState);
  const layout = targetState.layouts?.[targetState.activeLayoutId];
  if (layout) {
    layout.arrangement = createLayoutArrangementFromCurrentState(targetState, layout.rootContainerIds || []);
    layout.rootContainerIds = [...layout.arrangement.rootContainerIds];
  }
  return true;
}

export function repairContainerHierarchyRegressionFromReference(targetState, referenceState) {
  const before = stateStats(targetState);
  const reference = stateStats(referenceState);
  if (reference.nestedContainers < 6) return false;
  if (before.nestedContainers >= Math.max(1, Math.floor(reference.nestedContainers * 0.5))) return false;
  if (before.containers < Math.max(1, Math.floor(reference.containers * 0.5))) return false;

  let repaired = 0;
  Object.entries(referenceState.containers || {}).forEach(([containerId, referenceContainer]) => {
    const targetContainer = targetState.containers?.[containerId];
    const referenceParentId = referenceContainer?.parentId;
    if (!targetContainer || !referenceParentId || !targetState.containers?.[referenceParentId]) return;
    if (targetContainer.parentId && targetState.containers[targetContainer.parentId]) return;
    targetContainer.parentId = referenceParentId;
    repaired += 1;
  });
  if (!repaired) return false;

  Object.values(targetState.containers || {}).forEach((container) => {
    if (!container || typeof container !== "object") return;
    container.childIds = [];
  });
  Object.entries(targetState.containers || {}).forEach(([containerId, container]) => {
    const parentId = container?.parentId;
    if (!parentId || !targetState.containers?.[parentId]) return;
    const parent = targetState.containers[parentId];
    if (!parent.childIds.includes(containerId)) parent.childIds.push(containerId);
  });
  Object.entries(targetState.containers || {}).forEach(([containerId, container]) => {
    const referenceContainer = referenceState.containers?.[containerId];
    const validItemIds = new Set(container.itemIds || []);
    const validChildIds = new Set(container.childIds || []);
    const restoredOrder = [];
    (referenceContainer?.order || []).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      if (entry.type === "item" && validItemIds.has(entry.id)) restoredOrder.push({ type: "item", id: entry.id });
      if (entry.type === "container" && validChildIds.has(entry.id)) restoredOrder.push({ type: "container", id: entry.id });
    });
    container.itemIds.forEach((itemId) => {
      if (!restoredOrder.some((entry) => entry.type === "item" && entry.id === itemId)) restoredOrder.push({ type: "item", id: itemId });
    });
    container.childIds.forEach((childId) => {
      if (!restoredOrder.some((entry) => entry.type === "container" && entry.id === childId)) restoredOrder.push({ type: "container", id: childId });
    });
    container.order = restoredOrder;
  });
  const layout = targetState.layouts?.[targetState.activeLayoutId];
  if (layout) {
    const referenceLayout = referenceState.layouts?.[referenceState.activeLayoutId] || referenceState.layouts?.[targetState.activeLayoutId];
    const referenceRoots = uniqueLayoutIds(referenceLayout?.rootContainerIds || []).filter((id) =>
      targetState.containers?.[id] && !targetState.containers[id].parentId
    );
    layout.rootContainerIds = referenceRoots.length
      ? referenceRoots
      : Object.values(targetState.containers || {}).filter((container) => !container.parentId).map((container) => container.id);
    layout.arrangement = createLayoutArrangementFromCurrentState(targetState, layout.rootContainerIds);
  }
  return true;
}
