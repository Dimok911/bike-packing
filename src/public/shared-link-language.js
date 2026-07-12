export function shouldPreserveLinkedSharedListOnLanguageChange({
  isSharedListRoute = false,
  linkedLayoutId = "",
  activeReadOnlyLayoutId = ""
} = {}) {
  const linkedId = String(linkedLayoutId || "").trim();
  const activeId = String(activeReadOnlyLayoutId || "").trim();
  return Boolean(isSharedListRoute && linkedId && activeId === linkedId);
}
