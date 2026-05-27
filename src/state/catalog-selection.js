export function normalizeCatalogSelection(selectedIds, visibleIds) {
  const visible = new Set(visibleIds.map(String));
  return new Set([...selectedIds].map(String).filter((id) => visible.has(id)));
}

export function updateCatalogSelection({
  anchorId = "",
  range = false,
  selectedIds,
  targetId,
  toggle = false,
  visibleIds
}) {
  const visible = visibleIds.map(String);
  const target = String(targetId || "");
  if (!target || !visible.includes(target)) {
    return {
      anchorId,
      selectedIds: normalizeCatalogSelection(selectedIds, visible)
    };
  }

  const next = normalizeCatalogSelection(selectedIds, visible);
  if (range) {
    const anchor = visible.includes(String(anchorId || "")) ? String(anchorId) : target;
    const start = visible.indexOf(anchor);
    const end = visible.indexOf(target);
    visible.slice(Math.min(start, end), Math.max(start, end) + 1).forEach((id) => next.add(id));
    return { anchorId: anchor, selectedIds: next };
  }

  if (toggle) {
    if (next.has(target)) next.delete(target);
    else next.add(target);
  } else {
    next.clear();
    next.add(target);
  }

  return { anchorId: target, selectedIds: next };
}

export function catalogActionTargetIds(selectedIds, targetId) {
  const target = String(targetId || "");
  const selected = [...selectedIds].map(String);
  if (target && selected.includes(target) && selected.length > 1) return selected;
  return target ? [target] : [];
}
