import {
  isGeneratedCatalogContainerStateArtifact,
  isGeneratedCatalogContainerSyncArtifact
} from "../public/generated-artifacts.js";
import {
  getItemContainerIdInLayout,
  getLayoutContainerIdSet
} from "./layout-ops.js";

export function getDescendantContainerIds(targetState, containerId) {
  const container = targetState.containers?.[containerId];
  if (!container) return [];
  return (container.childIds || []).flatMap((childId) => [
    childId,
    ...getDescendantContainerIds(targetState, childId)
  ]);
}

export function getVisibleLayoutRootIds(targetState, layout, { includeGenerated = false } = {}) {
  const rootIds = Array.isArray(layout?.rootContainerIds) ? layout.rootContainerIds : [];
  if (!layout || includeGenerated) return rootIds;
  return rootIds.filter((containerId) => {
    const container = targetState.containers?.[containerId];
    if (!container) return false;
    return !isGeneratedCatalogContainerSyncArtifact(containerId, container) &&
      !isGeneratedCatalogContainerStateArtifact(containerId, container, targetState);
  });
}

export function isItemInLayout(targetState, layout, item) {
  if (!item?.id || !layout) return false;
  return Boolean(getItemContainerIdInLayout(targetState, layout, item.id));
}

export function isRootContainerInLayout(layout, containerId) {
  return Boolean(layout?.rootContainerIds?.includes(containerId));
}

export function isNestedContainerInAnyLayoutArrangement(targetState, containerId) {
  return Object.values(targetState.layouts || {}).some((layout) => {
    const placement = layout?.arrangement?.containers?.[containerId];
    if (placement?.parentId && targetState.containers?.[placement.parentId]) return true;
    return Object.values(layout?.arrangement?.containers || {}).some((parentPlacement) => {
      if (!parentPlacement || typeof parentPlacement !== "object") return false;
      if ((parentPlacement.childIds || []).includes(containerId)) return true;
      return (parentPlacement.order || []).some((entry) => entry?.type === "container" && entry.id === containerId);
    });
  });
}

export function isRootContainerForEditor(targetState, layout, container) {
  if (!container?.id) return false;
  if (isRootContainerInLayout(layout, container.id)) return true;
  if (isNestedContainerInAnyLayoutArrangement(targetState, container.id)) return false;
  return !container.parentId;
}

export function isItemInCatalog(targetState, layout, item, { scoped = false, catalogLayoutId = "" } = {}) {
  if (!scoped) return true;
  if (!item) return false;
  if (item.publicCatalogLayoutId === catalogLayoutId) return true;
  const catalogContainerIds = getLayoutContainerIdSet(targetState, layout);
  if (item.containerId && catalogContainerIds.has(item.containerId)) return true;
  return Boolean(item.containerId && targetState.containers?.[item.containerId]?.publicCatalogLayoutId === catalogLayoutId);
}

export function isRootContainerInCatalog(targetState, layout, container, { scoped = false, catalogLayoutId = "" } = {}) {
  if (!scoped) return true;
  if (!container) return false;
  return isRootContainerInLayout(layout, container.id) || container.publicCatalogLayoutId === catalogLayoutId;
}
