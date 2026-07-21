export function captureHistoryNavigationContext({
  scope = null,
  state,
  view = "",
  viewport = null
} = {}) {
  const activeLayoutId = String(state?.activeLayoutId || "");
  const activeLayout = state?.layouts?.[activeLayoutId] || null;
  return {
    activeLayout: {
      id: activeLayoutId,
      name: String(activeLayout?.name || ""),
      allowEmpty: Boolean(activeLayoutId && activeLayout)
    },
    scope: scope ? { ...scope } : null,
    view: String(view || ""),
    viewport: viewport ? { ...viewport } : null
  };
}

export function retargetMissingHistoryLayout(context, {
  layouts = {},
  replacement = null
} = {}) {
  const previousLayoutId = String(context?.activeLayout?.id || "");
  if (!context || !previousLayoutId || layouts?.[previousLayoutId] || !replacement?.id) return context;
  const scope = context.scope ? { ...context.scope } : null;
  if (scope?.adminPublishedEditLayoutId === previousLayoutId) {
    scope.adminPublishedEditLayoutId = replacement.id;
  }
  return {
    ...context,
    activeLayout: {
      id: replacement.id,
      name: String(replacement.name || context.activeLayout.name || ""),
      allowEmpty: true
    },
    scope
  };
}

export function preferredHistoryLayout(context) {
  const preferred = context?.activeLayout;
  if (!preferred?.id) return null;
  return { ...preferred };
}

export function restoreHistoryActiveLayout(state, layout, {
  applyLayoutArrangement = () => {}
} = {}) {
  if (!layout?.id || !state?.layouts?.[layout.id]) return false;
  if (state.activeLayoutId === layout.id) return true;
  state.activeLayoutId = layout.id;
  applyLayoutArrangement(layout.id);
  return true;
}

export function restoreHistoryNavigationContext(context, {
  currentView = () => "",
  restoreLayout = () => {},
  restoreScope = () => {},
  restoreViewport = () => {},
  switchView = () => {}
} = {}) {
  if (!context) return false;
  if (context.scope) restoreScope(context.scope);
  if (context.activeLayout?.id) restoreLayout(context.activeLayout);
  if (context.view && currentView() !== context.view) switchView(context.view);
  if (context.viewport) restoreViewport(context.viewport);
  return true;
}
