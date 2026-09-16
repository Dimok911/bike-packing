import test from "node:test";
import assert from "node:assert/strict";
import { treeCopyProjectionFixture } from "../fixtures/admin-template-photo-tree-copy-projection-fixture.js";
import { withAdminTemplateCapture } from "../../src/sync/admin-template-capture-lease.js";
import { persistAdminTemplatePhotoTreeCopyPending as persist } from "../../src/public/admin-template-photo-tree-copy-pending.js";
import { installRuntimeActiveLayoutId } from "../../src/state/active-layout-runtime.js";

const copy = value => structuredClone(value);
function mark(state, record) {
  const layout = state.layouts[record.snapshot.target.layoutId], id = record.action.operationId;
  layout.adminCausalSource = { ...layout.adminCausalSource, planId: id, base: { operationId: id }, photoTreeCopyPending: id };
  layout.templateDraftSyncPending = true;
}
async function fixture() {
  const f = await treeCopyProjectionFixture(), key = "pending-private-mirror", writes = [], hooks = { get: null, set: null };
  const values = new Map([[key, JSON.stringify(f.state)]]), storage = {
    getItem(name) { hooks.get?.(name); return values.get(name) ?? null; },
    setItem(name, value) { writes.push([name, value]); if (hooks.set) return hooks.set(name, value); values.set(name, value); }
  };
  const mirrorContext = { storage, key, scopeKey: `id:${f.binding.actorId}` }, bindings = [f.binding,
    { ...f.binding, listId: f.record.action.body.photoCopy.source.listId, itemKey: f.record.action.body.photoCopy.source.itemKey }];
  const input = { record: copy(f.record), getState: () => f.state, getContext: () => f.current, getMirrorContext: () => mirrorContext };
  const run = (guard = () => {}, overrides = {}) => withAdminTemplateCapture({ bindings, locks: f.locks }, captureLease =>
    persist({ ...input, captureLease, ...overrides }, guard));
  return Object.assign(f, { input, bindings, run, key, storage, values, writes, hooks, mirrorContext,
    mirror: () => JSON.parse(values.get(key)), targetId: f.record.snapshot.target.layoutId, sourceId: f.record.snapshot.source.layoutId });
}
const noEffects = f => {
  assert.deepEqual(f.server.calls, []); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  for (const owner of f.record.snapshot.copiedOwners) for (const type of ["layouts", "items", "containers"])
    assert.equal(Object.hasOwn(f.state[type], owner.localId), false);
};
async function duringHash(change, task) {
  const original = crypto.subtle.digest; let called = false;
  crypto.subtle.digest = function (...args) { if (!called) { called = true; change(); } return original.apply(this, args); };
  try { const result = await task(); assert.ok(called); return result; }
  finally { crypto.subtle.digest = original; }
}

test("pending captures the application's non-enumerable runtime selection and still fences a selection change", async () => {
  const f = await fixture(); installRuntimeActiveLayoutId(f.state, f.targetId);
  assert.equal(Object.keys(f.state).includes("activeLayoutId"), false);
  assert.equal((await f.run()).state, "pending");
  assert.equal(f.state.activeLayoutId, f.targetId);
  assert.equal(Object.getOwnPropertyDescriptor(f.state, "activeLayoutId").enumerable, false);
  const changed = await fixture(); installRuntimeActiveLayoutId(changed.state, changed.targetId);
  await duringHash(() => { changed.state.activeLayoutId = changed.sourceId; }, () =>
    assert.rejects(changed.run(), { code: "admin-template-photo-tree-copy-pending-context" }));
  assert.equal(changed.writes.length, 0); noEffects(changed);
});

test("pending persists only four target fields before live mutation and preserves latest unrelated data", async () => {
  const f = await fixture(), before = copy(f.state), expected = copy(before), mirror = f.mirror(); mark(expected, f.record);
  mirror.items["private-item"].quantity = 29; mirror.unrelatedTopLevel.newer = "other tab";
  f.values.set(f.key, JSON.stringify(mirror));
  const layouts = f.state.layouts, items = f.state.items, containers = f.state.containers, source = f.state.layouts[f.sourceId];
  f.hooks.set = (name, value) => {
    assert.deepEqual(f.state, before, "durable write happens while live still has the original namespace");
    f.values.set(name, value); f.state.items["private-item"].quantity = 31;
  };
  const result = await f.run(); expected.items["private-item"].quantity = 31;
  assert.deepEqual(f.state, expected); assert.deepEqual(result, { state: "pending", operationId: f.id, layoutId: f.targetId, recordIntentHash: f.record.intentHash });
  mark(mirror, f.record); assert.deepEqual(f.mirror(), mirror); assert.equal(f.writes.length, 1);
  assert.equal(f.state.layouts, layouts); assert.equal(f.state.items, items); assert.equal(f.state.containers, containers);
  assert.equal(f.state.layouts[f.sourceId], source); noEffects(f);
});

test("exact before and own pending combinations finish idempotently without redundant mirror writes", async () => {
  for (const livePending of [false, true]) for (const mirrorPending of [false, true]) {
    const f = await fixture(); if (livePending) mark(f.state, f.record);
    if (mirrorPending) { const mirror = f.mirror(); mark(mirror, f.record); f.values.set(f.key, JSON.stringify(mirror)); }
    const result = await f.run(); assert.equal(result.state, livePending ? "already-pending" : "pending");
    assert.equal(f.writes.length, mirrorPending ? 0 : 1);
    const liveLayout = f.state.layouts[f.targetId];
    assert.equal((await f.run()).state, "already-pending"); assert.equal(f.writes.length, mirrorPending ? 0 : 1);
    assert.equal(f.state.layouts[f.targetId], liveLayout); noEffects(f);
  }
});

test("full typed reproof rejects forged hash, manifest, raw source and extra record fields before writes", async () => {
  for (const fault of ["hash", "manifest", "source", "extra"]) {
    const f = await fixture(), before = copy(f.state), raw = f.values.get(f.key);
    if (fault === "hash") f.input.record.intentHash = "0".repeat(64);
    if (fault === "manifest") f.input.record.stages[0].assetDigest = "0".repeat(64);
    if (fault === "source") f.input.record.snapshot.source.beforeState.layouts[f.sourceId].name += " forged";
    if (fault === "extra") f.input.record.trusted = true;
    await assert.rejects(f.run()); assert.deepEqual(f.state, before); assert.equal(f.values.get(f.key), raw);
    assert.equal(f.writes.length, 0); noEffects(f);
  }
});

test("both namespaces reject edits, foreign or incomplete pending pointers in live and mirror", async () => {
  for (const where of ["live", "mirror"]) for (const fault of ["source", "target", "foreign", "partial", "extra"]) {
    const f = await fixture(), value = where === "live" ? f.state : f.mirror(), layout = value.layouts[f.targetId];
    if (fault === "source") value.layouts[f.sourceId].name += " later";
    if (fault === "target") layout.note = "later local edit";
    if (fault === "foreign") { mark(value, f.record); layout.adminCausalSource.photoTreeCopyPending = crypto.randomUUID(); }
    if (fault === "partial") { mark(value, f.record); delete layout.templateDraftSyncPending; }
    if (fault === "extra") { mark(value, f.record); layout.adminCausalSource.photoCopyPending = f.id; }
    if (where === "mirror") f.values.set(f.key, JSON.stringify(value));
    const before = copy(f.state), raw = f.values.get(f.key); await assert.rejects(f.run());
    assert.deepEqual(f.state, before); assert.equal(f.values.get(f.key), raw); assert.equal(f.writes.length, 0); noEffects(f);
  }
});

test("genuine live source and target lease is mandatory; fake, expired and target-only leases fail closed", async () => {
  const f = await fixture(), before = copy(f.state), raw = f.values.get(f.key); let expired;
  await withAdminTemplateCapture({ bindings: f.bindings, locks: f.locks }, lease => { expired = lease; });
  for (const captureLease of [undefined, true, {}, expired]) await assert.rejects(persist({ ...f.input, captureLease }, () => {}));
  await withAdminTemplateCapture({ bindings: [f.binding], locks: f.locks }, captureLease =>
    assert.rejects(persist({ ...f.input, captureLease }, () => {})));
  let orphaned;
  await withAdminTemplateCapture({ bindings: f.bindings, locks: f.locks }, captureLease => {
    orphaned = persist({ ...f.input, captureLease }, () => {}); orphaned.catch(() => {});
  });
  await assert.rejects(orphaned, { code: "admin-template-capture-lease" });
  assert.equal(f.writes.length, 0); assert.deepEqual(f.state, before); assert.equal(f.values.get(f.key), raw); noEffects(f);
});

test("quota refusal preserves live and retained record; retry keeps exactly the same operation", async () => {
  const f = await fixture(), before = copy(f.state), raw = f.values.get(f.key);
  f.hooks.set = () => { throw Object.assign(Error("quota"), { name: "QuotaExceededError" }); };
  await assert.rejects(f.run(), { name: "QuotaExceededError" }); assert.deepEqual(f.state, before); assert.equal(f.values.get(f.key), raw);
  assert.deepEqual(await f.store.read(f.id), f.record); f.hooks.set = null;
  assert.equal((await f.run()).operationId, f.id); assert.equal(f.writes.length, 2); noEffects(f);
});

test("lost readback leaves live unchanged and own durable mirror is reused without another write", async () => {
  const f = await fixture(), before = copy(f.state);
  f.hooks.set = (name, value) => { f.values.set(name, value); f.hooks.get = () => { throw Error("readback lost"); }; };
  await assert.rejects(f.run(), /readback lost/); assert.deepEqual(f.state, before); assert.equal(f.writes.length, 1);
  f.hooks.set = null; f.hooks.get = null;
  assert.equal((await f.run()).state, "pending"); assert.equal((await f.run()).state, "already-pending");
  assert.equal(f.writes.length, 1); noEffects(f);
});

test("foreign readback and prewrite replacement are never overwritten by a blind mirror rollback", async () => {
  for (const phase of ["prewrite", "readback"]) {
    const f = await fixture(), before = copy(f.state); let reads = 0;
    if (phase === "prewrite") f.hooks.get = () => {
      if (++reads === 2) { const mirror = f.mirror(); mirror.unrelatedTopLevel.newer = "concurrent mirror"; f.values.set(f.key, JSON.stringify(mirror)); }
    };
    else f.hooks.set = (name, value) => { const mirror = JSON.parse(value); mirror.unrelatedTopLevel.newer = "concurrent mirror"; f.values.set(name, JSON.stringify(mirror)); };
    await assert.rejects(f.run()); assert.deepEqual(f.state, before); assert.equal(f.mirror().unrelatedTopLevel.newer, "concurrent mirror");
    assert.equal(f.writes.length, phase === "prewrite" ? 0 : 1); noEffects(f);
  }
});

test("record input is detached before the first hashing await", async () => {
  const f = await fixture();
  const result = await duringHash(() => { f.input.record.intentHash = "0".repeat(64); f.input.record.snapshot.target.metadata.name = "late input mutation"; }, () => f.run());
  assert.equal(result.recordIntentHash, f.record.intentHash); assert.equal(result.operationId, f.id);
  const expected = copy(f.record.snapshot.target.beforeState.layouts[f.targetId]);
  const state = { layouts: { [f.targetId]: expected } }; mark(state, f.record);
  assert.deepEqual(f.state.layouts[f.targetId], expected); noEffects(f);
});

test("actor, generation, lifecycle, mirror scope and selected namespace changes during hashing prevent writes", async () => {
  for (const fault of ["actor", "generation", "lifecycle", "scope", "source", "target", "layout-ref"]) {
    const f = await fixture(); let active = true;
    await assert.rejects(duringHash(() => {
      if (fault === "actor") f.current.actorId = "other";
      if (fault === "generation") f.current.generation = "new-document";
      if (fault === "lifecycle") active = false;
      if (fault === "scope") f.mirrorContext.scopeKey = "id:other";
      if (fault === "source") f.state.layouts[f.sourceId].note = "new source note";
      if (fault === "target") f.state.layouts[f.targetId].note = "new target note";
      if (fault === "layout-ref") f.state.layouts[f.targetId] = copy(f.state.layouts[f.targetId]);
    }, () => f.run(() => { if (!active) throw Error("document ended"); })));
    assert.equal(f.writes.length, 0); assert.equal(f.state.layouts[f.targetId].adminCausalSource.photoTreeCopyPending, undefined); noEffects(f);
  }
});

test("storage callbacks changing context or target are checked before writes and before live mutation", async () => {
  for (const phase of ["prewrite", "set", "readback", "last-read"]) for (const fault of ["actor", "target"]) {
    const f = await fixture(); let reads = 0, postwriteReads = 0;
    const change = () => { if (fault === "actor") f.current.actorId = "other"; else f.state.layouts[f.targetId].note = "late target edit"; };
    f.hooks.get = () => { if (phase === "prewrite" && ++reads === 2) change(); };
    f.hooks.set = (name, value) => {
      f.values.set(name, value); if (phase === "set") change();
      f.hooks.get = () => { postwriteReads++; if (phase === "readback" && postwriteReads === 1 || phase === "last-read" && postwriteReads === 2) change(); };
    };
    await assert.rejects(f.run()); assert.equal(f.state.layouts[f.targetId].adminCausalSource.photoTreeCopyPending, undefined);
    if (fault === "target") assert.equal(f.state.layouts[f.targetId].note, "late target edit");
    assert.equal(f.writes.length, phase === "prewrite" ? 0 : 1); noEffects(f);
  }
});

test("malformed mirror, missing source and wrong account storage refuse before writes", async () => {
  for (const fault of ["missing", "json", "source", "account"]) {
    const f = await fixture(), before = copy(f.state);
    if (fault === "missing") f.values.delete(f.key);
    if (fault === "json") f.values.set(f.key, "{");
    if (fault === "source") { const mirror = f.mirror(); delete mirror.layouts[f.sourceId]; f.values.set(f.key, JSON.stringify(mirror)); }
    if (fault === "account") f.mirrorContext.scopeKey = "id:other";
    await assert.rejects(f.run()); assert.equal(f.writes.length, 0); assert.deepEqual(f.state, before); noEffects(f);
  }
});

test("async or false authority and async storage callbacks never authorize live mutation", async () => {
  for (const fault of ["false", "async", "state", "storage"]) {
    const f = await fixture(), before = copy(f.state);
    if (fault === "state") f.input.getState = async () => f.state;
    if (fault === "storage") f.storage.getItem = async () => f.values.get(f.key);
    const guard = fault === "false" ? () => false : fault === "async" ? async () => { throw Error("async guard"); } : () => {};
    await assert.rejects(f.run(guard)); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.writes.length, 0); assert.deepEqual(f.state, before); noEffects(f);
  }
});

test("no callback, storage operation or await runs after the live target mutation", async () => {
  const f = await fixture(); let afterReturn = false;
  const stillBefore = () => {
    assert.equal(afterReturn, false); assert.equal(f.state.layouts[f.targetId].adminCausalSource.photoTreeCopyPending, undefined);
  };
  for (const name of ["getState", "getContext", "getMirrorContext"]) {
    const original = f.input[name]; f.input[name] = () => { stillBefore(); return original(); };
  }
  f.hooks.get = stillBefore; f.hooks.set = (name, value) => { stillBefore(); f.values.set(name, value); };
  assert.equal((await f.run(stillBefore)).state, "pending"); afterReturn = true;
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.writes.length, 1); noEffects(f);
});
