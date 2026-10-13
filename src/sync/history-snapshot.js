import { clonePlain } from "../utils/json.js";
import { recoverMissingTemporaryContainers, temporaryContainerId } from "../state/layout-temporary-containers.js";

// Historical snapshots are evidence: do not run live cleanup, active-layout
// projection or catalog migrations on them just to display history.
export function historySnapshot(payload) {
  if (!payload || typeof payload !== "object") return null;
  return clonePlain(payload);
}

export function comparableHistorySnapshots(before, after) {
  const from = historySnapshot(before) || {};
  const to = historySnapshot(after) || {};
  recoverMissingTemporaryContainers(from);
  recoverMissingTemporaryContainers(to);
  for (const [layoutId, layout] of Object.entries(from.layouts || {})) {
    const oldArrangement = layout?.arrangement;
    const newArrangement = to.layouts?.[layoutId]?.arrangement;
    if (!oldArrangement?.containers || !newArrangement?.containers) continue;
    const replacements = new Map();
    for (const [id, placement] of Object.entries(oldArrangement.containers)) {
      const source = from.containers?.[id];
      if (!source || source.nestable === true || !placement?.parentId) continue;
      const baseId = temporaryContainerId(layout.id || layoutId, id);
      // Entity sync writes the new catalog record before its layout placement.
      // The intermediate history snapshot still points at the original ID.
      const candidates = Object.keys(to.containers || {}).filter((key) =>
        key === baseId || (key.startsWith(`${baseId}-`) && /^[1-9]\d*$/.test(key.slice(baseId.length + 1)) && Number(key.slice(baseId.length + 1)) >= 2)
      );
      // Old clients could allocate a suffixed ID while an earlier catalog-only
      // copy was already present. The actual layout placement disambiguates
      // these identities; matching display names cannot do that safely.
      const placedCandidates = candidates.filter(key => newArrangement.containers[key]);
      const matchingCandidates = !newArrangement.containers[id] && placedCandidates.length
        ? placedCandidates : candidates;
      if (matchingCandidates.length !== 1 || oldArrangement.containers[matchingCandidates[0]]) continue;
      const nextId = matchingCandidates[0];
      if (!to.containers?.[nextId]) continue;
      if (!from.containers[nextId]) from.containers[nextId] = { ...clonePlain(source), id: nextId };
      if (!newArrangement.containers[id] && newArrangement.containers[nextId]) replacements.set(id, nextId);
    }
    if (!replacements.size) continue;
    const replace = (id) => replacements.get(id) || id;
    oldArrangement.containers = Object.fromEntries(Object.entries(oldArrangement.containers).map(([id, placement]) => [replace(id), {
      ...placement,
      parentId: replace(placement.parentId),
      childIds: (placement.childIds || []).map(replace),
      order: (placement.order || []).map(entry => ({ ...entry, id: entry.type === "container" ? replace(entry.id) : entry.id }))
    }]));
    oldArrangement.items = Object.fromEntries(Object.entries(oldArrangement.items || {}).map(([id, parent]) => [id, replace(parent)]));
  }
  return [from, to];
}
