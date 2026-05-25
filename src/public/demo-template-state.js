import { clonePlain } from "../utils/json.js";

const DEMO_LAYOUT_ID = "layout-main";

function normalizeText(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function layoutHasRoots(layout) {
  return (Array.isArray(layout?.rootContainerIds) && layout.rootContainerIds.length > 0) ||
    (Array.isArray(layout?.arrangement?.rootContainerIds) && layout.arrangement.rootContainerIds.length > 0);
}

function collectDemoLayoutTreeIds(state, layout) {
  const containers = state?.containers && typeof state.containers === "object" ? state.containers : {};
  const arrangement = layout?.arrangement && typeof layout.arrangement === "object" ? layout.arrangement : {};
  const arrangementContainers = arrangement.containers && typeof arrangement.containers === "object"
    ? arrangement.containers
    : {};
  const containerIds = new Set();
  const itemIds = new Set();
  const visit = (containerId) => {
    if (!containerId || containerIds.has(containerId)) return;
    const container = containers[containerId];
    const placement = arrangementContainers[containerId];
    if (!container && !placement) return;
    containerIds.add(containerId);
    const childIds = uniqueValues([
      ...(Array.isArray(container?.childIds) ? container.childIds : []),
      ...(Array.isArray(placement?.childIds) ? placement.childIds : []),
      ...(Array.isArray(container?.order) ? container.order : [])
        .filter((entry) => entry?.type === "container")
        .map((entry) => entry.id),
      ...(Array.isArray(placement?.order) ? placement.order : [])
        .filter((entry) => entry?.type === "container")
        .map((entry) => entry.id)
    ]);
    const placedItemIds = uniqueValues([
      ...(Array.isArray(container?.itemIds) ? container.itemIds : []),
      ...(Array.isArray(placement?.itemIds) ? placement.itemIds : []),
      ...(Array.isArray(container?.order) ? container.order : [])
        .filter((entry) => entry?.type === "item")
        .map((entry) => entry.id),
      ...(Array.isArray(placement?.order) ? placement.order : [])
        .filter((entry) => entry?.type === "item")
        .map((entry) => entry.id)
    ]);
    placedItemIds.forEach((itemId) => itemIds.add(itemId));
    childIds.forEach(visit);
  };
  uniqueValues([
    ...(Array.isArray(layout?.rootContainerIds) ? layout.rootContainerIds : []),
    ...(Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : [])
  ]).forEach(visit);
  const arrangementItems = arrangement.items && typeof arrangement.items === "object" ? arrangement.items : {};
  Object.entries(arrangementItems).forEach(([itemId, containerId]) => {
    if (containerIds.has(containerId)) itemIds.add(itemId);
  });
  return { containerIds, itemIds };
}

export function normalizeDemoTemplateName(name = "", {
  fallbackName = "Demo layout"
} = {}) {
  const text = normalizeText(name);
  const fallback = normalizeText(fallbackName) || "Demo layout";
  return text || fallback;
}

export function normalizePublishedDemoTemplatePayload(payload, options = {}) {
  if (!payload || typeof payload !== "object") return null;
  const next = clonePlain(payload);
  const layouts = next.layouts && typeof next.layouts === "object" ? next.layouts : {};
  const layoutValues = Object.values(layouts);
  const activeLayout = layouts[next.activeLayoutId] || null;
  const sourceLayout = (layoutHasRoots(activeLayout) ? activeLayout : null) ||
    layoutValues.find(layoutHasRoots) ||
    activeLayout ||
    layoutValues[0] ||
    null;
  if (!sourceLayout || typeof sourceLayout !== "object") return next;
  const demoLayout = clonePlain(sourceLayout);
  demoLayout.id = DEMO_LAYOUT_ID;
  demoLayout.name = normalizeDemoTemplateName(demoLayout.name, options);
  delete demoLayout.adminDemo;
  delete demoLayout.adminSharedSourceId;
  delete demoLayout.adminTemplateCopy;
  delete demoLayout.publicCatalogLayoutId;
  next.layouts = { [DEMO_LAYOUT_ID]: demoLayout };
  next.activeLayoutId = DEMO_LAYOUT_ID;
  const { containerIds, itemIds } = collectDemoLayoutTreeIds(next, demoLayout);
  next.containers = Object.fromEntries(
    Object.entries(next.containers && typeof next.containers === "object" ? next.containers : {})
      .filter(([containerId]) => containerIds.has(containerId))
  );
  next.items = Object.fromEntries(
    Object.entries(next.items && typeof next.items === "object" ? next.items : {})
      .filter(([itemId]) => itemIds.has(itemId))
  );
  return next;
}

function updatedTime(layout) {
  const time = Date.parse(layout?.updatedAt || layout?.createdAt || "");
  return Number.isFinite(time) ? time : 0;
}

export function guestDemoCopyCleanupPlan({
  layouts = {},
  activeLayoutId = "",
  isGuestDemoCopy = (layout) => Boolean(layout?.guestDemoCopy),
  hasUserEdits = () => false
} = {}) {
  const copies = Object.values(layouts || {}).filter((layout) => layout?.id && isGuestDemoCopy(layout));
  const uneditedCopies = copies.filter((layout) => !hasUserEdits(layout));
  if (uneditedCopies.length <= 1) {
    return {
      keepLayoutId: uneditedCopies[0]?.id || "",
      removeLayoutIds: []
    };
  }
  const activeUnedited = uneditedCopies.find((layout) => layout.id === activeLayoutId) || null;
  const keep = activeUnedited || [...uneditedCopies].sort((a, b) => updatedTime(b) - updatedTime(a))[0];
  return {
    keepLayoutId: keep?.id || "",
    removeLayoutIds: uneditedCopies
      .filter((layout) => layout.id !== keep?.id)
      .map((layout) => layout.id)
  };
}
