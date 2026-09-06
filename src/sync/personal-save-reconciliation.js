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
export function planPersonalPayloadReconciliation({ base, local, remote } = {}) {
  if (!base || !revision(base.stateRevision) || !object(base.payload)) return { blocked: "missing-base" };
  if (!remote || !revision(remote.stateRevision) || !object(remote.payload)) return { blocked: "remote-unavailable" };
  if (remote.stateRevision < base.stateRevision || !object(local)) return { blocked: "revision" };
  if ([base.payload, local, remote.payload].some(containsPhotos)) return { blocked: "files-not-supported" };
  const before = base.payload, after = remote.payload, payload = {}, conflicts = [];
  const maps = { items: "item", containers: "container", layouts: "layout" };
  for (const key of new Set([...Object.keys(before), ...Object.keys(local), ...Object.keys(after)])) {
    if (has(maps, key)) {
      if ([before, local, after].some(value => has(value, key) && !validMap(value[key]))) return { blocked: "invalid-map" };
      Object.defineProperty(payload, key, { enumerable: true, configurable: true, writable: true,
        value: mergeRecordMap(maps[key], before[key] || {}, local[key] || {}, after[key] || {}, conflicts,
          { valuesEqual: equal, mergeIndependentRecordFields: true }) });
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
  return conflicts.length ? { conflicts } : { payload, conflicts: [] };
}
