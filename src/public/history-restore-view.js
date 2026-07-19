export function publishedHistoryTargetMatchesLayout(layout, target, {
  demoPublicListIdForLanguage = () => "",
  normalizeLanguage = (value) => String(value || "").trim().toLowerCase()
} = {}) {
  if (!layout || !target) return false;
  if (target.type === "shared") {
    return Boolean(target.sharedId) && String(layout.adminSharedSourceId || "") === String(target.sharedId);
  }
  if (target.type !== "demo" || !layout.adminDemo) return false;
  const targetLanguage = normalizeLanguage(target.language);
  const layoutLanguage = normalizeLanguage(layout.adminDemoLanguage || layout.language);
  if (targetLanguage && targetLanguage !== layoutLanguage) return false;
  const targetListId = String(target.demoListId || demoPublicListIdForLanguage(targetLanguage) || "").trim();
  const layoutListId = String(layout.adminDemoListId || demoPublicListIdForLanguage(layoutLanguage) || "").trim();
  return !targetListId || targetListId === layoutListId;
}

export function replaceActivePublishedHistoryDraft({
  activateLayout = () => false,
  createWhenMissing = false,
  demoPublicListIdForLanguage = () => "",
  importDemoState = () => null,
  materializeSharedLayout = () => null,
  normalizeLanguage = (value) => String(value || "").trim().toLowerCase(),
  payload,
  removeLayoutTree = () => false,
  state,
  target
} = {}) {
  const activeLayout = state?.layouts?.[state?.activeLayoutId] || null;
  const matchingLayout = publishedHistoryTargetMatchesLayout(activeLayout, target, {
    demoPublicListIdForLanguage,
    normalizeLanguage
  })
    ? activeLayout
    : Object.values(state?.layouts || {}).find((layout) => publishedHistoryTargetMatchesLayout(layout, target, {
        demoPublicListIdForLanguage,
        normalizeLanguage
      })) || null;
  if (!matchingLayout && !createWhenMissing) return null;

  if (matchingLayout?.id) removeLayoutTree(matchingLayout.id);
  const replacement = target.type === "demo"
    ? importDemoState(payload, {
      language: target.language,
      listId: target.demoListId,
      activate: false,
      renderAfter: false
    })
    : materializeSharedLayout(target.sharedId);
  if (!replacement?.id) return null;
  activateLayout(replacement.id, { remember: false });
  return replacement;
}
