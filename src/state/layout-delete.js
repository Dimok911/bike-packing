import {
  adminSharedTemplateIdentityKeys,
  isTemplateCopySharedId
} from "./layout-manage.js";

export function removeLayoutTreeFromState(targetState, layoutId) {
  const layout = targetState?.layouts?.[layoutId];
  if (!layout) return false;
  const containersToDelete = new Set();
  const itemsToDelete = new Set();
  const collect = (containerId) => {
    const container = targetState.containers?.[containerId];
    if (!container || containersToDelete.has(containerId)) return;
    containersToDelete.add(containerId);
    (container.itemIds || []).forEach((itemId) => itemsToDelete.add(itemId));
    (container.childIds || []).forEach(collect);
  };
  (layout.rootContainerIds || []).forEach(collect);
  delete targetState.layouts[layoutId];
  containersToDelete.forEach((containerId) => delete targetState.containers?.[containerId]);
  itemsToDelete.forEach((itemId) => delete targetState.items?.[itemId]);
  Object.keys(targetState.collapsedContainers || {}).forEach((containerId) => {
    if (containersToDelete.has(containerId)) delete targetState.collapsedContainers[containerId];
  });
  if (targetState.activeLayoutId === layoutId) {
    targetState.activeLayoutId = Object.values(targetState.layouts || {})[0]?.id || "";
  }
  return true;
}

export function removeManagedSharedLayoutTreesFromState(targetState, sharedId) {
  const id = String(sharedId || "").trim();
  if (!targetState?.layouts || !id) return [];
  const layoutIds = Object.values(targetState.layouts)
    .filter((layout) => layout?.adminSharedSourceId === id)
    .map((layout) => layout.id)
    .filter(Boolean);
  return layoutIds.filter((layoutId) => removeLayoutTreeFromState(targetState, layoutId));
}

export function removeManagedDemoTemplateTreesFromState(targetState, {
  listId = "",
  language = "ru"
} = {}) {
  const id = String(listId || "").trim();
  const normalizedLanguage = String(language || "ru").trim().toLowerCase() || "ru";
  if (!targetState?.layouts || !id) return [];
  const layoutIds = Object.values(targetState.layouts)
    .filter((layout) =>
      layout?.adminDemo &&
      (
        String(layout.adminDemoListId || "").trim() === id ||
        (!layout.adminDemoListId && String(layout.adminDemoLanguage || "").trim().toLowerCase() === normalizedLanguage)
      )
    )
    .map((layout) => layout.id)
    .filter(Boolean);
  return layoutIds.filter((layoutId) => removeLayoutTreeFromState(targetState, layoutId));
}

function hasSharedTemplateIdentityOverlap(layout, targetKeys, fallbackLanguage) {
  if (!layout?.adminTemplateCopy || !targetKeys?.size) return false;
  const layoutKeys = adminSharedTemplateIdentityKeys({
    sharedId: layout.adminSharedSourceId,
    name: layout.name,
    language: layout.language || fallbackLanguage,
    adminTemplateCopy: true
  });
  return layoutKeys.some((key) => targetKeys.has(key));
}

export function removeManagedSharedTemplateTreesFromState(targetState, {
  sharedId = "",
  name = "",
  language = "ru"
} = {}) {
  const id = String(sharedId || "").trim();
  if (!targetState?.layouts || !id) return [];
  const fallbackLanguage = String(language || "ru").trim().toLowerCase() || "ru";
  const targetKeys = new Set(adminSharedTemplateIdentityKeys({
    sharedId: id,
    name,
    language: fallbackLanguage,
    runtimeSharedTemplate: isTemplateCopySharedId(id)
  }));
  const layoutIds = Object.values(targetState.layouts)
    .filter((layout) => {
      if (!layout?.adminSharedSourceId) return false;
      if (layout.adminSharedSourceId === id) return true;
      return isTemplateCopySharedId(id) && hasSharedTemplateIdentityOverlap(layout, targetKeys, fallbackLanguage);
    })
    .map((layout) => layout.id)
    .filter(Boolean);
  return layoutIds.filter((layoutId) => removeLayoutTreeFromState(targetState, layoutId));
}

export function removeUnconfirmedManagedSharedTemplateTreesFromState(targetState, {
  confirmedSharedLayouts = [],
  fallbackLanguage = "ru"
} = {}) {
  if (!targetState?.layouts) return [];
  const normalizedFallbackLanguage = String(fallbackLanguage || "ru").trim().toLowerCase() || "ru";
  const confirmedKeys = new Set(confirmedSharedLayouts.flatMap((layout) =>
    adminSharedTemplateIdentityKeys({
      sharedId: layout.id,
      name: layout.name,
      language: layout.language || normalizedFallbackLanguage,
      runtimeSharedTemplate: true
    })
  ));
  const layoutIds = Object.values(targetState.layouts)
    .filter((layout) => {
      if (!layout?.adminSharedSourceId || layout.adminDemo) return false;
      if (!layout.adminTemplateCopy) {
        return !confirmedSharedLayouts.some((confirmed) =>
          String(confirmed?.id || "").trim() === String(layout.adminSharedSourceId || "").trim()
        );
      }
      return !hasSharedTemplateIdentityOverlap(layout, confirmedKeys, normalizedFallbackLanguage);
    })
    .map((layout) => layout.id)
    .filter(Boolean);
  return layoutIds.filter((layoutId) => removeLayoutTreeFromState(targetState, layoutId));
}
