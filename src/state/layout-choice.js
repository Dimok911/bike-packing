import { uniqueLayoutIds } from "./layout-arrangement.js";

export function layoutArrangementScore(targetState, layout) {
  if (!layout || typeof layout !== "object") return 0;
  const containers = targetState?.containers || {};
  const arrangement = layout.arrangement && typeof layout.arrangement === "object" ? layout.arrangement : {};
  const roots = uniqueLayoutIds([
    ...(Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : []),
    ...(Array.isArray(layout.rootContainerIds) ? layout.rootContainerIds : [])
  ]).filter((containerId) => containers[containerId]).length;
  return layoutArrangementContentScore(targetState, layout) + roots;
}

export function layoutArrangementContentScore(targetState, layout) {
  if (!layout || typeof layout !== "object") return 0;
  const containers = targetState?.containers || {};
  const items = targetState?.items || {};
  const arrangement = layout.arrangement && typeof layout.arrangement === "object" ? layout.arrangement : {};
  const arrangedItems = arrangement.items && typeof arrangement.items === "object"
    ? Object.entries(arrangement.items).filter(([itemId, containerId]) => items[itemId] && containers[containerId]).length
    : 0;
  const linkedItems = Object.values(arrangement.containers || {}).reduce((sum, placement) => {
    return sum + uniqueLayoutIds(Array.isArray(placement?.itemIds) ? placement.itemIds : []).filter((itemId) => items[itemId]).length;
  }, 0);
  const nestedContainers = Object.values(arrangement.containers || {}).filter((placement) =>
    placement?.parentId && containers[placement.parentId]
  ).length;
  return Math.max(arrangedItems, linkedItems) + nestedContainers;
}

export function isMeaningfulLayout(targetState, layout) {
  return layoutArrangementContentScore(targetState, layout) > 0;
}

export function bestMeaningfulLayoutId(targetState) {
  return Object.values(targetState?.layouts || {})
    .filter((layout) => layout && !layout.adminDemo && !layout.adminSharedSourceId)
    .sort((a, b) => layoutArrangementScore(targetState, b) - layoutArrangementScore(targetState, a))[0]?.id || "";
}

export function resolvePreferredLayoutId(targetState, preferredLayoutId = "", preferredLayoutName = "", { allowEmptyPreferred = false } = {}) {
  const layouts = targetState?.layouts || {};
  if (allowEmptyPreferred && preferredLayoutId && layouts[preferredLayoutId]) return preferredLayoutId;
  if (preferredLayoutId && isMeaningfulLayout(targetState, layouts[preferredLayoutId])) return preferredLayoutId;
  const normalizedName = String(preferredLayoutName || "").trim().toLowerCase();
  if (normalizedName) {
    const byName = Object.values(layouts).find((layout) =>
      String(layout?.name || "").trim().toLowerCase() === normalizedName &&
      isMeaningfulLayout(targetState, layout)
    );
    if (byName?.id) return byName.id;
  }
  const activeLayout = layouts[targetState?.activeLayoutId];
  if (isMeaningfulLayout(targetState, activeLayout)) return activeLayout.id;
  const bestLayoutId = bestMeaningfulLayoutId(targetState);
  if (bestLayoutId) return bestLayoutId;
  if (preferredLayoutId && layouts[preferredLayoutId]) return preferredLayoutId;
  return "";
}
