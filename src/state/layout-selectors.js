import {
  isGeneratedCatalogContainerStateArtifact,
  isGeneratedCatalogContainerSyncArtifact
} from "../public/generated-artifacts.js";
import {
  getLayoutDescendantContainerIds,
  getItemContainerIdInLayout,
  getLayoutContainerIdSet
} from "./layout-ops.js";
import { normalizeLayoutArrangement } from "./layout-normalize.js";

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

export function visibleItemLayoutPlacements(targetState, item, {
  containerPath = (containerId) => containerId
} = {}) {
  if (!item?.id) return [];
  return Object.values(targetState?.layouts || {}).flatMap((layout) => {
    normalizeLayoutArrangement(layout, targetState);
    const containerId = getItemContainerIdInLayout(targetState, layout, item.id);
    if (!containerId || !targetState.containers?.[containerId]) return [];
    const rootId = getVisibleLayoutRootIds(targetState, layout).find((id) =>
      id === containerId || getLayoutDescendantContainerIds(layout, id).includes(containerId)
    );
    const root = rootId ? targetState.containers[rootId] : null;
    if (!root) return [];
    const path = containerPath(containerId);
    const place = rootId === containerId ? "" : `, \u043c\u0435\u0441\u0442\u043e \u00ab${path}\u00bb`;
    const label = `${layout.name}: \u0441\u0443\u043c\u043a\u0430 \u00ab${root.name}\u00bb${place}`;
    return [{
      layoutId: layout.id || "",
      layoutName: layout.name || "",
      rootId,
      rootName: root.name || "",
      containerId,
      path,
      isRoot: rootId === containerId,
      label
    }];
  });
}

export function visibleItemLayoutPlacementLabels(targetState, item, options = {}) {
  return visibleItemLayoutPlacements(targetState, item, options).map((placement) => placement.label);
}

export function layoutContainerPath(targetState, layout, containerId, { separator = " / " } = {}) {
  const names = [];
  const seen = new Set();
  let currentId = containerId || "";
  const arrangement = layout?.arrangement && typeof layout.arrangement === "object"
    ? layout.arrangement
    : null;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const container = targetState?.containers?.[currentId];
    if (!container) break;
    names.unshift(container.name || currentId);
    const placementParentId = arrangement?.containers?.[currentId]?.parentId || "";
    const fallbackParentId = !arrangement ? container.parentId || "" : "";
    const parentId = placementParentId || fallbackParentId;
    currentId = parentId && targetState?.containers?.[parentId] ? parentId : "";
  }

  return names.join(separator);
}

export function isRootContainerInLayout(layout, containerId) {
  return Boolean(layout?.rootContainerIds?.includes(containerId));
}

export function activeEditableLayoutId(targetState, {
  adminLayoutId = "",
  isAdminEditableLayout = () => false
} = {}) {
  const adminId = String(adminLayoutId || "").trim();
  if (adminId && targetState?.layouts?.[adminId] && isAdminEditableLayout(targetState.layouts[adminId], adminId)) {
    return adminId;
  }
  return targetState?.activeLayoutId || "";
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
  if (container.nestable === true) return true;
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

export function userEditableLayouts(targetState, { canUseLocalEditableState = () => false } = {}) {
  return Object.values(targetState?.layouts || {}).filter((layout) =>
    layout &&
    canUseLocalEditableState(layout.id) &&
    !layout.adminDemo &&
    !layout.adminSharedSourceId
  );
}

export function canDeleteActiveLayout(targetState, {
  canUseLocalEditableState = () => false,
  isReadOnlyStateScope = () => false,
  isSharedLayoutView = () => false
} = {}) {
  const layout = targetState?.layouts?.[targetState?.activeLayoutId];
  return Boolean(
    layout &&
    userEditableLayouts(targetState, { canUseLocalEditableState }).some((entry) => entry.id === layout.id) &&
    !isReadOnlyStateScope() &&
    !isSharedLayoutView()
  );
}
