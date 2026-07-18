export const GUEST_SHARED_LINK_COPY_TARGET_FLAG = "guestSharedLinkCopyTarget";
export const GUEST_SHARED_LINK_DETACHED_ITEM_IDS = "guestSharedLinkDetachedItemIds";

export function guestSharedLinkDetachedItemIds(layout) {
  return [...new Set((layout?.[GUEST_SHARED_LINK_DETACHED_ITEM_IDS] || [])
    .map((itemId) => String(itemId || "").trim())
    .filter(Boolean))];
}

export function recordGuestSharedLinkDetachedItem(targetState, layoutId, itemId) {
  const layout = targetState?.layouts?.[layoutId];
  const normalizedItemId = String(itemId || "").trim();
  if (!layout || layout.adminDemo || layout.adminSharedSourceId || layout.publicCatalogLayoutId) return false;
  if (!normalizedItemId || !targetState?.items?.[normalizedItemId]) return false;
  layout[GUEST_SHARED_LINK_DETACHED_ITEM_IDS] = [...new Set([
    ...guestSharedLinkDetachedItemIds(layout),
    normalizedItemId
  ])];
  return true;
}

function copyTargetLayouts(targetState, isCopyTargetLayout) {
  return Object.values(targetState?.layouts || {}).filter((layout) =>
    typeof isCopyTargetLayout === "function" ? isCopyTargetLayout(layout) : Boolean(layout?.id)
  );
}

export function ensureGuestSharedLinkCopyTargetLayout(targetState, {
  changedAt = "",
  createEmptyLayoutArrangement = () => ({ rootContainerIds: [], containers: {}, items: {}, packedItems: {} }),
  createMeta = () => ({}),
  defaultName = "New layout",
  dictionaries = {},
  guestDemoCopyFlag = "guestDemoCopy",
  id = "",
  isCopyTargetLayout = null,
  uniqueLayoutName = (name) => name
} = {}) {
  if (!targetState || typeof targetState !== "object") return { layoutId: "", created: false };
  const existing = copyTargetLayouts(targetState, isCopyTargetLayout)[0];
  if (existing?.id) return { layoutId: existing.id, created: false };

  const layoutId = String(id || `layout-shared-guest-${Date.now()}-${Math.random().toString(16).slice(2)}`).trim();
  if (!layoutId) return { layoutId: "", created: false };
  const arrangement = createEmptyLayoutArrangement();
  targetState.layouts = targetState.layouts && typeof targetState.layouts === "object" ? targetState.layouts : {};
  targetState.layouts[layoutId] = {
    id: layoutId,
    name: uniqueLayoutName(defaultName),
    rootContainerIds: [],
    arrangement,
    locations: [...(dictionaries.locations || [])],
    categories: [...(dictionaries.categories || [])],
    [guestDemoCopyFlag]: true,
    [GUEST_SHARED_LINK_COPY_TARGET_FLAG]: true,
    guestDemoCopyCreatedAt: changedAt,
    ...createMeta(changedAt)
  };
  targetState.activeLayoutId = layoutId;
  return { layoutId, created: true };
}
