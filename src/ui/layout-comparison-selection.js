export const LAYOUT_COMPARISON_SELECTION_STORAGE_KEY = "bike-packing-layout-comparison-selection-v1";

function availableLayoutIdSet(availableLayoutIds) {
  return new Set(
    Array.from(availableLayoutIds || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  );
}

export function loadLayoutComparisonSelection(
  storageKey,
  availableLayoutIds,
  storage = globalThis.localStorage
) {
  if (!storageKey || !storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || "null");
    const fromLayoutId = String(parsed?.fromLayoutId || "").trim();
    const toLayoutId = String(parsed?.toLayoutId || "").trim();
    const availableIds = availableLayoutIdSet(availableLayoutIds);
    if (
      !fromLayoutId ||
      !toLayoutId ||
      fromLayoutId === toLayoutId ||
      !availableIds.has(fromLayoutId) ||
      !availableIds.has(toLayoutId)
    ) return null;
    return { fromLayoutId, toLayoutId };
  } catch {
    return null;
  }
}

export function saveLayoutComparisonSelection(
  storageKey,
  selection,
  storage = globalThis.localStorage
) {
  const fromLayoutId = String(selection?.fromLayoutId || "").trim();
  const toLayoutId = String(selection?.toLayoutId || "").trim();
  if (!storageKey || !storage || !fromLayoutId || !toLayoutId || fromLayoutId === toLayoutId) return false;
  try {
    storage.setItem(storageKey, JSON.stringify({ fromLayoutId, toLayoutId }));
    return true;
  } catch {
    return false;
  }
}
