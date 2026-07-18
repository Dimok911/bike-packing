export function getPackingEntryAfterPointer(zone, pointerY, placeholder = null) {
  placeholder?.remove?.();
  const entries = [...(zone?.children || [])].filter((child) =>
    (child.classList?.contains("item-card") || child.classList?.contains("subcontainer")) &&
    !child.classList.contains("dragging")
  );
  return entries.reduce(
    (closest, entry) => {
      const box = entry.getBoundingClientRect();
      const offset = pointerY - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, entry };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, entry: null }
  ).entry;
}
