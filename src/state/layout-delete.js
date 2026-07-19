import {
  adminSharedTemplateIdentityKeys,
  isTemplateCopySharedId
} from "./layout-manage.js";

export function removeLayoutTreeFromState(targetState, layoutId, {
  deleteUnreferencedEntities = false
} = {}) {
  const layout = targetState?.layouts?.[layoutId];
  if (!layout) return false;
  const candidates = collectLayoutEntityReferences(targetState, layout);
  delete targetState.layouts[layoutId];
  if (deleteUnreferencedEntities) {
    const retained = collectStateLayoutEntityReferences(targetState);
    candidates.containers.forEach((containerId) => {
      if (!retained.containers.has(containerId)) delete targetState.containers?.[containerId];
    });
    candidates.items.forEach((itemId) => {
      if (!retained.items.has(itemId)) delete targetState.items?.[itemId];
    });
  }
  Object.keys(targetState.collapsedContainers || {}).forEach((containerId) => {
    if (!targetState.containers?.[containerId]) delete targetState.collapsedContainers[containerId];
  });
  Object.keys(targetState.packedItems || {}).forEach((itemId) => {
    if (!targetState.items?.[itemId]) delete targetState.packedItems[itemId];
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
  return layoutIds.filter((layoutId) => removeLayoutTreeFromState(targetState, layoutId, {
    deleteUnreferencedEntities: true
  }));
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
  return layoutIds.filter((layoutId) => removeLayoutTreeFromState(targetState, layoutId, {
    deleteUnreferencedEntities: true
  }));
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
  return layoutIds.filter((layoutId) => removeLayoutTreeFromState(targetState, layoutId, {
    deleteUnreferencedEntities: true
  }));
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
      // An unpublished local template is the recovery copy for an unpublish
      // request whose server response may have been lost. Catalog refresh must
      // never interpret that draft as a stale public template and delete it.
      if (layout.templatePublished === false) return false;
      if (!layout.adminTemplateCopy) {
        return !confirmedSharedLayouts.some((confirmed) =>
          String(confirmed?.id || "").trim() === String(layout.adminSharedSourceId || "").trim()
        );
      }
      return !hasSharedTemplateIdentityOverlap(layout, confirmedKeys, normalizedFallbackLanguage);
    })
    .map((layout) => layout.id)
    .filter(Boolean);
  return layoutIds.filter((layoutId) => removeLayoutTreeFromState(targetState, layoutId, {
    deleteUnreferencedEntities: true
  }));
}

function collectStateLayoutEntityReferences(targetState) {
  const result = { containers: new Set(), items: new Set() };
  Object.values(targetState?.layouts || {}).forEach((layout) => {
    const refs = collectLayoutEntityReferences(targetState, layout);
    refs.containers.forEach((id) => result.containers.add(id));
    refs.items.forEach((id) => result.items.add(id));
  });
  return result;
}

export function collectLayoutEntityReferences(targetState, layout) {
  const result = { containers: new Set(), items: new Set() };
  const collectContainerTree = (containerId) => {
    if (!containerId || result.containers.has(containerId) || !targetState?.containers?.[containerId]) return;
    result.containers.add(containerId);
    (targetState.containers[containerId].itemIds || []).forEach((itemId) => {
      if (targetState.items?.[itemId]) result.items.add(itemId);
    });
    (targetState.containers[containerId].childIds || []).forEach(collectContainerTree);
  };
  (layout?.rootContainerIds || []).forEach(collectContainerTree);

  const arrangement = layout?.arrangement;
  if (!arrangement || typeof arrangement !== "object") return result;
  (arrangement.rootContainerIds || []).forEach((id) => {
    if (targetState?.containers?.[id]) result.containers.add(id);
  });
  Object.entries(arrangement.containers || {}).forEach(([containerId, placement]) => {
    if (targetState?.containers?.[containerId]) result.containers.add(containerId);
    if (!placement || typeof placement !== "object") return;
    if (placement.parentId && targetState?.containers?.[placement.parentId]) result.containers.add(placement.parentId);
    (placement.childIds || []).forEach((id) => {
      if (targetState?.containers?.[id]) result.containers.add(id);
    });
    (placement.itemIds || []).forEach((id) => {
      if (targetState?.items?.[id]) result.items.add(id);
    });
    (placement.order || []).forEach((entry) => {
      if (entry?.type === "container" && targetState?.containers?.[entry.id]) result.containers.add(entry.id);
      if (entry?.type === "item" && targetState?.items?.[entry.id]) result.items.add(entry.id);
    });
  });
  Object.entries(arrangement.items || {}).forEach(([itemId, containerId]) => {
    if (targetState?.items?.[itemId]) result.items.add(itemId);
    if (targetState?.containers?.[containerId]) result.containers.add(containerId);
  });
  Object.keys(arrangement.packedItems || {}).forEach((itemId) => {
    if (targetState?.items?.[itemId]) result.items.add(itemId);
  });
  return result;
}
