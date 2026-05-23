export function sharedVirtualLayoutId(layoutId) {
  return `shared-virtual-layout-${layoutId}`;
}

export function sharedVirtualContainerId(rootId) {
  return `shared-virtual-container-${rootId}`;
}

export function sharedVirtualItemId(itemId) {
  return `shared-virtual-item-${itemId}`;
}

export function originalSharedId(virtualId, prefix) {
  return String(virtualId || "").startsWith(prefix) ? String(virtualId).slice(prefix.length) : "";
}

export function publicVirtualLayoutMarkers(layout, virtualLayoutId, { demoSharedLayoutId = "", uiLanguage = "ru" } = {}) {
  if (layout?.id === demoSharedLayoutId) {
    return {
      adminDemo: true,
      adminDemoLanguage: layout.language || uiLanguage,
      publicCatalogLayoutId: virtualLayoutId
    };
  }
  return {
    adminSharedSourceId: layout?.id || "",
    publicCatalogLayoutId: virtualLayoutId
  };
}
