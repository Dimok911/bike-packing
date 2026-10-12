import { clonePlain } from "../utils/json.js";
import { publicCopyStableHash } from "../public/copy-duplicates.js";

// Catalog bags/items are shared; a non-reusable nested pouch belongs to one layout.
export function isolateTemporaryContainersForLayout(state, layout, { applyToCurrentState = false } = {}) {
  const replacements = new Map();
  const arrangement = layout?.arrangement;
  if (!state?.containers || !layout?.id || !arrangement?.containers) return replacements;
  for (const [id, placement] of Object.entries(arrangement.containers)) {
    const source = state.containers[id];
    if (!source || !placement?.parentId || source.nestable === true) continue;
    const shared = Object.values(state.layouts || {}).some((other) =>
      other?.id !== layout.id && other?.arrangement?.containers?.[id]
    );
    if (!shared) continue;
    // Stable across devices loading the same legacy state; never use the old
    // "-isolated-" marker, whose records are intentionally merged by repair.
    const baseId = `pouch-${publicCopyStableHash(JSON.stringify([layout.id, id])).slice(6)}-${publicCopyStableHash(JSON.stringify([id, layout.id])).slice(6)}`;
    let copyId = baseId;
    for (let suffix = 2; state.containers[copyId]; suffix += 1) copyId = `${baseId}-${suffix}`;
    state.containers[copyId] = { ...clonePlain(source), ...clonePlain(placement), id: copyId };
    if (Object.hasOwn(state.collapsedContainers || {}, id)) {
      state.collapsedContainers[copyId] = state.collapsedContainers[id];
    }
    replacements.set(id, copyId);
  }
  if (!replacements.size) return replacements;
  const replace = (id) => replacements.get(id) || id;
  const rewritePlacement = (placement) => ({
    ...placement,
    parentId: replace(placement.parentId),
    childIds: (placement.childIds || []).map(replace),
    itemIds: [...(placement.itemIds || [])],
    order: (placement.order || []).map((entry) => ({
      ...entry, id: entry.type === "container" ? replace(entry.id) : entry.id
    }))
  });
  arrangement.containers = Object.fromEntries(Object.entries(arrangement.containers)
    .map(([id, placement]) => [replace(id), rewritePlacement(placement)]));
  arrangement.items = Object.fromEntries(Object.entries(arrangement.items || {})
    .map(([id, containerId]) => [id, replace(containerId)]));
  for (const copyId of replacements.values()) {
    Object.assign(state.containers[copyId], clonePlain(arrangement.containers[copyId]));
  }
  if (applyToCurrentState) {
    for (const [id, placement] of Object.entries(arrangement.containers)) {
      if (state.containers[id]) Object.assign(state.containers[id], clonePlain(placement));
    }
    for (const [id, containerId] of Object.entries(arrangement.items)) {
      if (state.items?.[id]) state.items[id].containerId = containerId;
    }
  }
  return replacements;
}
