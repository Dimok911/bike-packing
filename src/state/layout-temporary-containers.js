import { clonePlain } from "../utils/json.js";
import { publicCopyStableHash } from "../public/copy-duplicates.js";

export function temporaryContainerId(layoutId, sourceId) {
  return `pouch-${publicCopyStableHash(JSON.stringify([layoutId, sourceId])).slice(6)}-${publicCopyStableHash(JSON.stringify([sourceId, layoutId])).slice(6)}`;
}

// Repair only identities that can be proved from the migration's two hashes.
// Never infer identity from a display name or overwrite an existing record.
export function recoverMissingTemporaryContainers(state) {
  let recovered = 0;
  const originals = Object.entries(state?.containers || {});
  for (const [layoutId, layout] of Object.entries(state?.layouts || {})) {
    const placements = layout?.arrangement?.containers || {};
    for (const [sourceId, source] of originals) {
      if (!source || source.nestable === true) continue;
      const id = temporaryContainerId(layout.id || layoutId, sourceId);
      if (!placements[id] || !placements[id].parentId || state.containers[id]) continue;
      state.containers[id] = { ...clonePlain(source), ...clonePlain(placements[id]), id };
      recovered += 1;
    }
  }
  return recovered;
}

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
    const baseId = temporaryContainerId(layout.id, id);
    let copyId = baseId;
    const isPlaced = (candidate) => Object.values(state.layouts || {}).some(other => other?.arrangement?.containers?.[candidate]);
    // A prior entity-sync phase may already have saved this exact migration
    // record, including a user rename, before the layout references arrived.
    for (let suffix = 2; state.containers[copyId] && isPlaced(copyId); suffix += 1) copyId = `${baseId}-${suffix}`;
    state.containers[copyId] = { ...clonePlain(state.containers[copyId] || source), ...clonePlain(placement), id: copyId };
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
