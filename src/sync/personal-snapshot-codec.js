// A list operation already owns the complete business payload. Keep only the
// local-only differences instead of a second full copy of bags/items/layouts.
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

// These fields are omitted from the server payload. A later UI-only mirror may
// supply them, but must never replace business data or placement/packed state.
export function personalSnapshotWithUiPreferences(snapshot, mirrorJson) {
  const result = clone(snapshot);
  let mirror;
  try { mirror = JSON.parse(mirrorJson); } catch { return result; }
  if (!object(mirror)) return result;
  for (const key of ["collapsedContainers", "itemDisplayMode", "showItemMeta", "showFilterContext", "collectionMode", "showOnlyUnpacked"]) {
    if (own(mirror, key)) result[key] = clone(mirror[key]);
  }
  return result;
}

export function encodePersonalSnapshot(payload, snapshot) {
  const changes = [];
  const visit = (before, after, path) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    if (object(before) && object(after)) {
      for (const key of Object.keys(before)) if (!own(after, key)) changes.push({ path: [...path, key], remove: true });
      for (const key of Object.keys(after)) {
        if (own(before, key)) visit(before[key], after[key], [...path, key]);
        else changes.push({ path: [...path, key], value: after[key] });
      }
    } else changes.push({ path, value: after });
  };
  visit(payload, snapshot, []);
  return clone(changes);
}

export function decodePersonalSnapshot(payload, changes) {
  if (!Array.isArray(changes)) throw Error("Invalid local snapshot patch");
  let result = clone(payload);
  for (const change of changes) {
    if (!Array.isArray(change?.path) || !change.path.every(key => typeof key === "string")
      || (change.remove === true ? own(change, "value") : !own(change, "value"))) throw Error("Invalid snapshot change");
    if (!change.path.length) {
      if (change.remove) throw Error("Cannot remove snapshot root");
      result = clone(change.value);
      continue;
    }
    let parent = result;
    for (const key of change.path.slice(0, -1)) {
      if (!object(parent) || !own(parent, key)) throw Error("Missing snapshot parent");
      parent = parent[key];
    }
    if (!object(parent)) throw Error("Invalid snapshot parent");
    const key = change.path.at(-1);
    if (change.remove) delete parent[key];
    else Object.defineProperty(parent, key, { value: clone(change.value), enumerable: true, configurable: true, writable: true });
  }
  return result;
}
