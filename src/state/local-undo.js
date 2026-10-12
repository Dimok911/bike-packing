const RECORD_MAPS = new Set(["items", "containers", "layouts"]);
const SECTIONS = [...RECORD_MAPS, "locations", "categories"];
const META = new Set(["updatedAt", "updatedByDeviceId", "updatedByDeviceName"]);
const PLACEMENT = new Set(["containerId", "parentId", "childIds", "itemIds", "order"]);
export const LOCAL_UNDO_STORAGE_KEY = "bike-packing-local-undo-v1";
export const LOCAL_UNDO_LIMIT = 20;
const MAX_BYTES = 750_000;

function ignoredField(path, key) {
  return path.length === 2 && RECORD_MAPS.has(path[0]) && (META.has(key)
    || (path[0] !== "layouts" && (PLACEMENT.has(key) || (path[0] === "items" && key === "quantity"))));
}

function comparable(value, path = []) {
  if (Array.isArray(value)) return value.map((entry) => comparable(entry, [...path, "[]"]));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().filter((key) => !ignoredField(path, key))
    .map((key) => [key, comparable(value[key], [...path, key])]));
}

const equal = (left, right, path) => JSON.stringify(comparable(left, path)) === JSON.stringify(comparable(right, path));
const valueAt = (state, path) => path.reduce((value, key) => value?.[key], state);
const snapshotValue = (value) => value === undefined ? { exists: false } : { exists: true, value: structuredClone(value) };

export function createLocalUndoEntry(before, after, createdAt = new Date().toISOString()) {
  if (!before || !after) return null;
  const changes = [];
  const walk = (left, right, path) => {
    if (equal(left, right, path)) return;
    if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        if (!ignoredField(path, key)) walk(left[key], right[key], [...path, key]);
      }
    } else changes.push({ path, before: snapshotValue(left), after: snapshotValue(right) });
  };
  for (const section of SECTIONS) walk(before[section], after[section], [section]);
  if (!changes.length) return null;
  const names = [...new Set(changes.map(({ path }) => {
    if (!RECORD_MAPS.has(path[0]) || !path[1]) return "";
    return after[path[0]]?.[path[1]]?.name || before[path[0]]?.[path[1]]?.name || "";
  }).filter(Boolean))];
  return { createdAt, names, changes };
}

export function applyLocalUndoEntry(state, entry) {
  if (!entry?.changes?.length) return null;
  for (const { path } of entry.changes) {
    if (path[0] === "layouts" && state.layouts?.[path[1]]?.locked
      && !entry.changes.some((change) => change.path[0] === "layouts" && change.path[1] === path[1] && change.path[2] === "locked")) return null;
  }
  for (const change of entry.changes) {
    const current = valueAt(state, change.path);
    if (change.after.exists !== (current !== undefined)) return null;
    if (!equal(current, change.after.value, change.path)) return null;
  }
  const restored = structuredClone(state);
  for (const { path, before } of entry.changes) {
    let parent = restored;
    for (const key of path.slice(0, -1)) {
      if (!parent[key] || typeof parent[key] !== "object") parent[key] = {};
      parent = parent[key];
    }
    if (before.exists) parent[path.at(-1)] = structuredClone(before.value);
    else delete parent[path.at(-1)];
  }
  // A newer layout can reference a locally created record. Undoing its
  // creation must not leave that layout pointing at a deleted item or bag.
  const removedItems = new Set(Object.keys(state.items || {}).filter((id) => !restored.items?.[id]));
  const removedContainers = new Set(Object.keys(state.containers || {}).filter((id) => !restored.containers?.[id]));
  for (const layout of Object.values(restored.layouts || {})) {
    const arrangement = layout?.arrangement || {};
    if ((layout.rootContainerIds || []).some((id) => removedContainers.has(id))) return null;
    if (Object.entries(arrangement.items || {}).some(([id, container]) => removedItems.has(id) || removedContainers.has(container))) return null;
    if (Object.entries(arrangement.containers || {}).some(([id, placement]) => removedContainers.has(id)
      || removedContainers.has(placement?.parentId) || (placement?.childIds || []).some((child) => removedContainers.has(child))
      || (placement?.itemIds || []).some((item) => removedItems.has(item)))) return null;
  }
  return restored;
}

export function localUndoReferencesPhoto(entries, id) {
  const contains = (value) => {
    if (!value || typeof value !== "object") return false;
    if (String(value.localId || "") === id || String(value.id || "") === id) return true;
    return Object.values(value).some(contains);
  };
  return Boolean(id) && entries.some((entry) => entry.changes.some((change) => contains(change.before?.value)));
}

export function readLocalUndoEntries(storage, key) {
  try {
    const entries = JSON.parse(storage.getItem(key));
    return Array.isArray(entries) ? entries.filter((entry) => Array.isArray(entry?.changes) && entry.changes.every((change) =>
      Array.isArray(change?.path) && SECTIONS.includes(change.path[0]) && change.path.every((part) => typeof part === "string" && !["__proto__", "constructor", "prototype"].includes(part)) && change.before && change.after
    )).slice(-LOCAL_UNDO_LIMIT) : [];
  } catch { return []; }
}

export function writeLocalUndoEntries(storage, key, entries) {
  const retained = entries.slice(-LOCAL_UNDO_LIMIT);
  while (retained.length && JSON.stringify(retained).length > MAX_BYTES) retained.shift();
  for (;;) {
    try {
      storage.setItem(key, JSON.stringify(retained));
      return retained.length;
    } catch {
      if (!retained.length) return 0;
      retained.shift();
    }
  }
}
