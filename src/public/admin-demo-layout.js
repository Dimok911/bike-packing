export function importDemoStateAsEditableLayout(targetState, demoState, {
  activate = true,
  applyLayoutArrangement,
  clone,
  createBlankBikePackingState,
  createLayoutArrangementFromCurrentState,
  currentCreateMeta,
  currentDemoTemplate,
  demoPublicListIdForLanguage,
  language,
  listId = "",
  locations = [],
  categories = [],
  normalizeDemoLayoutName,
  normalizeDemoPayloadForLanguage,
  normalizeDictionaryValues,
  normalizePublishedStatePayload,
  normalizeUiLanguage,
  nowIso,
  render,
  renderAfter = true,
  saveState,
  setActivePrivateScope,
  switchView
} = {}) {
  const source = normalizeDemoPayloadForLanguage(normalizePublishedStatePayload(demoState), language) || createBlankBikePackingState();
  const sourceLayout = source.layouts?.[source.activeLayoutId] || Object.values(source.layouts || {})[0];
  if (!sourceLayout) throw new Error("В демо нет укладки.");
  const normalizedLanguage = normalizeUiLanguage(language);
  const demoTemplate = currentDemoTemplate(normalizedLanguage, listId);
  const demoListId = listId || demoTemplate?.listId || demoPublicListIdForLanguage(normalizedLanguage);
  const stamp = Date.now();
  const layoutId = `layout-admin-demo-${stamp}`;
  const containerMap = {};
  const changedAt = nowIso();
  const itemMap = {};

  const copyContainer = (containerId, parentId = null) => {
    if (containerMap[containerId]) return containerMap[containerId];
    const container = source.containers?.[containerId];
    if (!container) return "";
    const nextId = `admin-demo-container-${stamp}-${containerId}`;
    containerMap[containerId] = nextId;
    targetState.containers[nextId] = {
      ...clone(container),
      id: nextId,
      parentId,
      childIds: [],
      itemIds: [],
      order: [],
      adminDemo: true,
      publicCatalogLayoutId: layoutId,
      ...currentCreateMeta(changedAt)
    };
    (container.childIds || []).forEach((id) => copyContainer(id, nextId));
    return nextId;
  };

  const rootContainerIds = (sourceLayout.rootContainerIds || []).map((id) => copyContainer(id, null)).filter(Boolean);
  Object.values(source.items || {}).forEach((item) => {
    const nextContainerId = item.containerId ? containerMap[item.containerId] : "";
    const nextId = `admin-demo-item-${stamp}-${item.id}`;
    itemMap[item.id] = nextId;
    targetState.items[nextId] = {
      ...clone(item),
      id: nextId,
      containerId: nextContainerId,
      adminDemo: true,
      publicCatalogLayoutId: layoutId,
      ...currentCreateMeta(changedAt)
    };
  });
  Object.entries(containerMap).forEach(([sourceId, nextId]) => {
    const sourceContainer = source.containers[sourceId];
    const targetContainer = targetState.containers[nextId];
    if (!sourceContainer || !targetContainer) return;
    targetContainer.childIds = (sourceContainer.childIds || []).map((id) => containerMap[id]).filter(Boolean);
    targetContainer.itemIds = (sourceContainer.itemIds || []).map((id) => itemMap[id]).filter(Boolean);
    targetContainer.order = (sourceContainer.order || []).map((entry) => {
      if (entry.type === "container") {
        const id = containerMap[entry.id];
        return id ? { type: "container", id } : null;
      }
      const id = itemMap[entry.id];
      return id ? { type: "item", id } : null;
    }).filter(Boolean);
  });
  targetState.layouts[layoutId] = {
    id: layoutId,
    name: demoTemplate?.name || normalizeDemoLayoutName(sourceLayout.name, normalizedLanguage),
    rootContainerIds,
    arrangement: createLayoutArrangementFromCurrentState(targetState, rootContainerIds),
    adminDemo: true,
    adminDemoLanguage: normalizedLanguage,
    adminDemoListId: demoListId,
    language: normalizedLanguage,
    locations: normalizeDictionaryValues(source.locations, locations),
    categories: normalizeDictionaryValues(source.categories, categories),
    ...currentCreateMeta(changedAt)
  };
  saveState({ sync: false });
  if (activate) {
    targetState.activeLayoutId = layoutId;
    applyLayoutArrangement(layoutId);
    setActivePrivateScope();
    switchView("packing");
    if (renderAfter) render();
  }
  return targetState.layouts[layoutId];
}

export function repairAdminDemoLayout(layout, {
  normalizeDemoLayoutName,
  normalizeLayoutArrangement,
  state,
  uiLanguage,
  uniqueLayoutIds
} = {}) {
  if (!layout?.adminDemo) return false;
  let changed = false;
  const normalizedName = normalizeDemoLayoutName(layout.name, layout.adminDemoLanguage || uiLanguage);
  if (layout.name !== normalizedName) {
    layout.name = normalizedName;
    changed = true;
  }
  const stamp = String(layout.id || "").match(/^layout-admin-demo-(\d+)/)?.[1] || "";
  const prefix = stamp ? `admin-demo-container-${stamp}-` : "admin-demo-container-";
  const arrangement = normalizeLayoutArrangement(layout, state);
  const arrangedChildIds = new Set();
  Object.values(arrangement.containers || {}).forEach((placement) => {
    (placement?.childIds || []).forEach((childId) => arrangedChildIds.add(childId));
  });
  const arrangedRootIds = uniqueLayoutIds([
    ...(arrangement.rootContainerIds || []),
    ...(layout.rootContainerIds || [])
  ]).filter((containerId) => state.containers?.[containerId]);
  const prefixedRootIds = Object.values(state.containers || {})
    .filter((container) =>
      String(container.id || "").startsWith(prefix) &&
      !arrangedChildIds.has(container.id) &&
      (!arrangement.containers?.[container.id] || !arrangement.containers[container.id].parentId)
    )
    .map((container) => container.id);
  const rootContainerIds = uniqueLayoutIds([...arrangedRootIds, ...prefixedRootIds]);
  if (!rootContainerIds.length) return changed;
  const itemPrefix = stamp ? `admin-demo-item-${stamp}-` : "admin-demo-item-";
  Object.values(state.items || {})
    .filter((item) => String(item.id || "").startsWith(itemPrefix))
    .forEach((item) => {
      const arrangedContainerId = arrangement.items?.[item.id] || "";
      if (arrangedContainerId && state.containers[arrangedContainerId]) {
        item.containerId = arrangedContainerId;
        return;
      }
      if (!item.containerId || !state.containers[item.containerId]) {
        const sourceId = String(item.id).slice(itemPrefix.length);
        const fallbackContainer = Object.values(state.containers || {}).find((container) =>
          String(container.id || "").startsWith(prefix) &&
          String(container.itemIds || []).includes(sourceId)
        );
        if (fallbackContainer) item.containerId = fallbackContainer.id;
      }
    });
  layout.rootContainerIds = rootContainerIds;
  arrangement.rootContainerIds = rootContainerIds;
  normalizeLayoutArrangement(layout, state);
  return true;
}
