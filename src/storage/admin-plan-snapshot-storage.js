import { canonicalTemplateJson as canonical } from "../sync/admin-template-protocol.js";
import { sameProtocolJson as same } from "../sync/protocol-json-equality.js";

export const ADMIN_PLAN_PREFIX = "bike-packing-admin-save-plans-v1:";
const field = "editorSnapshotReference";
// Cache a PURE text transformation, never a storage proof or permission. A hit
// requires both complete current strings. Every returned guard is newly built
// against this storage and retains all fresh reads before/after async work.
const derivedRows = new Map();
let derivedChars = 0;
function rememberDerived(physical, entry) {
  const size = physical.length + entry.baseRaw.length + entry.raw.length;
  if (size > 384 * 1024) return;
  const previous = derivedRows.get(physical);
  if (previous) { derivedChars -= previous.size; derivedRows.delete(physical); }
  derivedRows.set(physical, { ...entry, size }); derivedChars += size;
  while (derivedRows.size > 64 || derivedChars > 8 * 1024 * 1024) {
    const first = derivedRows.keys().next().value;
    derivedChars -= derivedRows.get(first).size; derivedRows.delete(first);
  }
}
const plain = value => value !== null && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const copy = value => JSON.parse(canonical(value));
const fail = () => { throw Object.assign(Error("Не удалось проверить сохранённый снимок шаблона. Данные сохранены; не очищайте хранилище сайта."),
  { code: "admin-plan-snapshot-storage", isAdminTemplateBlocked: true }); };
export const adminPlanKey = plan => ADMIN_PLAN_PREFIX + encodeURIComponent(canonical(plan.binding)) + ":" + plan.id;
export const isCompactAdminPlanRow = row => plain(row) && Object.hasOwn(row, field);

function difference(before, after, path = [], result = []) {
  if (same(before, after)) return result;
  if (plain(before) && plain(after)) {
    for (const key of Object.keys(before)) if (!Object.hasOwn(after, key)) result.push({ path: [...path, key], remove: true });
    for (const key of Object.keys(after)) {
      if (!Object.hasOwn(before, key)) result.push({ path: [...path, key], value: copy(after[key]) });
      else difference(before[key], after[key], [...path, key], result);
    }
  } else result.push({ path, value: copy(after) });
  return result;
}
function applyChanges(snapshot, changes) {
  let result = copy(snapshot);
  if (!Array.isArray(changes) || changes.length > 10000) fail();
  const seen = new Set();
  for (const change of changes) {
    if (!(exact(change, ["path", "value"]) || exact(change, ["path", "remove"]) && change.remove === true)
      || !Array.isArray(change.path) || change.path.length > 100 || change.path.some(key => typeof key !== "string")) fail();
    const id = canonical(change.path); if (seen.has(id)) fail(); seen.add(id);
    if (!change.path.length) { if (change.remove) fail(); result = copy(change.value); continue; }
    let parent = result;
    for (const key of change.path.slice(0, -1)) { if (!plain(parent) || !Object.hasOwn(parent, key)) fail(); parent = parent[key]; }
    if (!plain(parent)) fail();
    const key = change.path.at(-1);
    if (change.remove) { if (!Object.hasOwn(parent, key)) fail(); delete parent[key]; }
    else Object.defineProperty(parent, key, { value: copy(change.value), enumerable: true, writable: true, configurable: true });
  }
  return result;
}

// The complete base remains in the synchronous journal. Every read fetches its
// current bytes. IndexedDB archives below are recovery copies, never authority
// served through a memory cache. References cannot form chains or cross owners.
export function resolveAdminPlanStorageRow(storage, key, physical = storage.getItem(key)) {
  if (physical === null) return { raw: null, dependencies: [], assertCurrent() { if (storage.getItem(key) !== null) fail(); } };
  const row = JSON.parse(physical), dependencies = [];
  let raw = physical;
  if (isCompactAdminPlanRow(row)) {
    const reference = row[field], plan = row.plan;
    const derived = derivedRows.get(physical), currentBase = typeof reference?.key === "string" ? storage.getItem(reference.key) : null;
    if (derived && derived.key === key && derived.baseRaw === currentBase) {
      raw = derived.raw; dependencies.push({ key: reference.key, raw: currentBase, row: JSON.parse(currentBase) });
    } else {
      if (!exact(row, ["version", "plan", "digest", "cancelRequested", field]) || row.version !== 1
        || !exact(plan, ["version", "id", "binding", "operations"]) || plan.version !== 2 || adminPlanKey(plan) !== key
        || !exact(reference, ["version", "key", "planDigest", "changes"]) || reference.version !== 1
        || typeof reference.key !== "string" || reference.key === key || !reference.key.startsWith(ADMIN_PLAN_PREFIX)
        || !/^[a-f0-9]{64}$/.test(reference.planDigest || "") || canonical(row) !== physical) fail();
      const baseRaw = currentBase; if (baseRaw === null) fail();
      const base = JSON.parse(baseRaw);
      if (isCompactAdminPlanRow(base) || base.plan?.version !== 2 || adminPlanKey(base.plan) !== reference.key
        || !same(base.plan.binding, plan.binding) || base.digest !== reference.planDigest || canonical(base) !== baseRaw) fail();
      dependencies.push({ key: reference.key, raw: baseRaw, row: base });
      const { [field]: ignored, ...saved } = row;
      saved.plan = { ...plan, editorSnapshot: applyChanges(base.plan.editorSnapshot, reference.changes) };
      raw = canonical(saved);
      rememberDerived(physical, { key, baseRaw, raw });
    }
  }
  const assertCurrent = () => {
    if (storage.getItem(key) !== physical || dependencies.some(row => storage.getItem(row.key) !== row.raw)) fail();
  };
  assertCurrent(); return { raw, dependencies, assertCurrent };
}

export async function prepareAdminPlanStorageRow({ storage, key, raw, validate, assertCurrent = () => {}, preferredBase = null }) {
  const row = JSON.parse(raw), before = storage.getItem(key);
  if (row.plan?.version !== 2 || isCompactAdminPlanRow(row)) return { raw, assertCurrent };
  const guard = () => { assertCurrent(); if (storage.getItem(key) !== before) fail(); };
  await validate(key, raw); guard();
  const keys = [];
  for (let i = 0; i < storage.length; i++) { const candidate = storage.key(i); if (candidate?.startsWith(ADMIN_PLAN_PREFIX) && candidate !== key) keys.push(candidate); }
  for (const candidate of keys) {
    const current = JSON.parse(storage.getItem(candidate));
    if (isCompactAdminPlanRow(current) && current[field].key === key) return { raw, assertCurrent: guard };
  }
  keys.sort(); if (preferredBase) { const index = keys.indexOf(preferredBase); if (index >= 0) keys.unshift(...keys.splice(index, 1)); }
  for (const baseKey of keys) {
    const baseRaw = storage.getItem(baseKey); if (baseRaw === null) fail();
    const base = JSON.parse(baseRaw);
    if (base.plan?.version !== 2 || isCompactAdminPlanRow(base) || !same(base.plan.binding, row.plan.binding)) continue;
    await validate(baseKey, baseRaw); guard(); if (storage.getItem(baseKey) !== baseRaw) fail();
    const { editorSnapshot, ...plan } = row.plan;
    const packed = canonical({ ...row, plan, [field]: { version: 1, key: baseKey, planDigest: base.digest,
      changes: difference(base.plan.editorSnapshot, editorSnapshot) } });
    if (packed.length >= raw.length * 0.8) continue;
    // Independently reconstruct before allowing any write or migration.
    const resolved = resolveAdminPlanStorageRow({ getItem: name => name === key ? packed : storage.getItem(name) }, key, packed);
    if (resolved.raw !== raw) fail();
    return { raw: packed, baseKey, assertCurrent() { guard(); if (storage.getItem(baseKey) !== baseRaw) fail(); } };
  }
  return { raw, assertCurrent: guard };
}

// Copy/verify before replacing a single localStorage value atomically. The
// original complete base stays inline, so this works even at the quota limit.
// No operation, receipt, photo or original archive is deleted.
export async function migrateAdminPlanSnapshots({ storage, repository, locks, validate }) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(ADMIN_PLAN_PREFIX)) keys.push(key); }
  const groups = new Map();
  for (const key of keys.sort()) {
    const raw = storage.getItem(key); if (raw === null) fail(); const row = JSON.parse(raw);
    if (row.plan?.version !== 2) continue;
    const bindingKey = canonical(row.plan.binding);
    if (!groups.has(bindingKey)) groups.set(bindingKey, []); groups.get(bindingKey).push(key);
  }
  let migrated = 0, freedChars = 0;
  for (const [bindingKey, names] of groups) {
    if (!locks?.request) fail(); const binding = JSON.parse(bindingKey);
    await locks.request("bike-packing-admin-template-photo-capture:" + bindingKey, async () => {
      // Once an inline row is referenced it is a retained base, never compacted.
      const bases = new Set();
      for (const key of names) { const row = JSON.parse(storage.getItem(key)); if (isCompactAdminPlanRow(row)) bases.add(row[field].key); }
      const baseKey = [...bases][0] || names.find(key => !isCompactAdminPlanRow(JSON.parse(storage.getItem(key))));
      if (!baseKey) fail(); bases.add(baseKey);
      for (const key of names) {
        await locks.request(key, async () => {
          const raw = storage.getItem(key); if (raw === null) fail();
          const proof = resolveAdminPlanStorageRow(storage, key, raw);
          await validate(key, proof.raw); proof.assertCurrent();
          for (const dependency of proof.dependencies) { await validate(dependency.key, dependency.raw); proof.assertCurrent(); }
          if (bases.has(key) || isCompactAdminPlanRow(JSON.parse(raw))) return;
          const prepared = await prepareAdminPlanStorageRow({ storage, key, raw, validate, assertCurrent: proof.assertCurrent, preferredBase: baseKey });
          if (prepared.raw === raw) return;
          const owner = { environment: binding.environment, actorId: binding.actorId, listId: "admin-plan-originals", scopeKey: "id:" + binding.actorId };
          let view = await repository.read(owner); prepared.assertCurrent();
          const original = view.entries.find(row => row.namespace === "journal" && row.key === key);
          if (original && original.raw !== raw) fail();
          if (!original) await repository.commit(owner, { expectedRevision: view.revision, puts: [{ namespace: "journal", key, raw }] });
          prepared.assertCurrent(); view = await repository.read(owner); prepared.assertCurrent();
          if (view.entries.find(row => row.namespace === "journal" && row.key === key)?.raw !== raw) fail();
          storage.setItem(key, prepared.raw);
          const verified = resolveAdminPlanStorageRow(storage, key);
          if (verified.raw !== raw) fail(); verified.assertCurrent();
          migrated++; freedChars += raw.length - prepared.raw.length;
        });
      }
    });
  }
  return { migrated, freedChars };
}
