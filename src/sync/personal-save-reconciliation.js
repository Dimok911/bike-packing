import { mergeRecordMap } from "./state-merge.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";

const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const equal = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const revision = value => Number.isSafeInteger(value) && value > 0;
const validMap = value => object(value) && Object.entries(value).every(([id, record]) =>
  id && id === id.trim() && id.length <= 191 && !["__proto__", "prototype", "constructor"].includes(id)
  && object(record) && (!has(record, "id") || record.id === id));
const containsPhotos = value => object(value) || Array.isArray(value)
  ? Object.entries(value).some(([key, child]) => key === "photos" && Array.isArray(child) && child.length > 0 || containsPhotos(child)) : false;

// Pure DB-only three-way comparison. This prepares a candidate, not a receipt
// or permission to abandon/rewrite an old action. The caller must settle exact
// old IDs and publish a NEW revision-checked action before applying this result.
export function planPersonalPayloadReconciliation({ base, local, remote, choices } = {}) {
  if (!base || !revision(base.stateRevision) || !object(base.payload)) return { blocked: "missing-base" };
  if (!remote || !revision(remote.stateRevision) || !object(remote.payload)) return { blocked: "remote-unavailable" };
  if (remote.stateRevision < base.stateRevision || !object(local)) return { blocked: "revision" };
  return comparePayloads({ before: base.payload, local, after: remote.payload, choices });
}

// This comparison uses a frozen editor base, not server revisions or clocks.
// The caller must bind it to an observed local head and register its successor.
export function planPersonalLocalPayloadReconciliation({ base, local, remote, choices } = {}) {
  if (![base, local, remote].every(object)) return { blocked: "missing-base" };
  return comparePayloads({ before: base, local, after: remote, choices });
}

function comparePayloads({ before, local, after, choices }) {
  if ([before, local, after].some(containsPhotos)) return { blocked: "files-not-supported" };
  const payload = {}, conflicts = [];
  const maps = { items: "item", containers: "container", layouts: "layout" };
  for (const key of new Set([...Object.keys(before), ...Object.keys(local), ...Object.keys(after)])) {
    if (has(maps, key)) {
      if ([before, local, after].some(value => has(value, key) && !validMap(value[key]))) return { blocked: "invalid-map" };
      Object.defineProperty(payload, key, { enumerable: true, configurable: true, writable: true,
        value: mergeRecordMap(maps[key], before[key] || {}, local[key] || {}, after[key] || {}, conflicts,
          { valuesEqual: equal, mergeIndependentRecordFields: true,
            conflictLabel: (_type, id, localValue, remoteValue, baseValue) =>
              localValue?.name || remoteValue?.name || baseValue?.name || id }) });
      continue;
    }
    const same = (a, b) => has(a, key) === has(b, key) && equal(a[key], b[key]);
    const localChanged = !same(before, local), remoteChanged = !same(before, after);
    if (localChanged && remoteChanged && !same(local, after)) {
      conflicts.push({ type: "setting", id: key, label: key,
        localHas: has(local, key), remoteHas: has(after, key),
        localValue: has(local, key) ? clone(local[key]) : null,
        remoteValue: has(after, key) ? clone(after[key]) : null,
        baseValue: has(before, key) ? clone(before[key]) : null });
      continue;
    }
    const source = localChanged ? local : after;
    if (has(source, key)) Object.defineProperty(payload, key, { value: clone(source[key]), enumerable: true, configurable: true, writable: true });
  }
  // In particular, dictionary removals are not a union of old/new arrays, and
  // a deleted entity is never implicitly recreated to resolve a conflict.
  if (!conflicts.length) return { payload, conflicts: [] };
  if (choices === undefined) return { conflicts };
  // This is the explicitly labelled whole-server choice, including otherwise
  // compatible local edits. Per-record choices retain compatible changes.
  if (choices === "server") return { payload: clone(after), conflicts: [], resolved: conflicts.length };
  if (!object(choices) || Object.keys(choices).length !== conflicts.length
    || conflicts.some((_conflict, index) => !has(choices, index) || !["local", "remote"].includes(choices[index]))) {
    return { blocked: "incomplete-choices", conflicts };
  }
  for (const [index, conflict] of conflicts.entries()) {
    const side = choices[index], exists = conflict[`${side}Has`], value = conflict[`${side}Value`];
    const target = conflict.type === "setting" ? payload
      : payload[Object.keys(maps).find(key => maps[key] === conflict.type)];
    if (exists) Object.defineProperty(target, conflict.id, { value: clone(value), enumerable: true, configurable: true, writable: true });
    else delete target[conflict.id];
  }
  // Structural validation remains the adapter's responsibility. No missing
  // record/setting is implicitly restored and no old action is rewritten.
  return { payload, conflicts: [], resolved: conflicts.length };
}
