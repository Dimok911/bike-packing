import test from "node:test";
import assert from "node:assert/strict";
import { treeCopyProjectionFixture } from "../fixtures/admin-template-photo-tree-copy-projection-fixture.js";
import { applyAdminTemplatePhotoTreeCopyResult as apply } from "../../src/public/admin-template-photo-tree-copy-apply.js";
import { seedTreeCopyAcceptanceFacts } from "../fixtures/admin-template-photo-tree-copy-acceptance-fixture.js";
import { installRuntimeActiveLayoutId } from "../../src/state/active-layout-runtime.js";

const copy = value => structuredClone(value);
async function fixture() {
  const f = await treeCopyProjectionFixture(), targetId = f.record.snapshot.target.layoutId;
  await seedTreeCopyAcceptanceFacts(f);
  const key = "test-private-mirror", values = new Map([...f.values, [key, JSON.stringify(f.state)]]), hooks = { set: null, get: null }, writes = [];
  const storage = {
    getItem(name) { if (name === key) hooks.get?.(name); return values.get(name) ?? null; },
    setItem(name, value) { if (name !== key) { values.set(name, value); return; }
      writes.push([name, value]); if (hooks.set) hooks.set(name, value); else values.set(name, value); }
  };
  const mirrorContext = { storage, key, scopeKey: `id:${f.binding.actorId}` };
  const input = { plan: f.plan, store: f.store, receipt: copy(f.receipt), stageReceipts: copy(f.stages),
    getState: () => f.state, getContext: () => f.current, getMirrorContext: () => mirrorContext };
  const pending = () => {
    const layout = f.state.layouts[targetId];
    layout.adminCausalSource = { ...layout.adminCausalSource, planId: f.id, base: { operationId: f.id }, photoTreeCopyPending: f.id };
    layout.templateDraftSyncPending = true;
  };
  return Object.assign(f, { input, key, values, storage, hooks, mirrorContext, writes, targetId, pending,
    mirror: () => JSON.parse(values.get(key)), run: (guard = () => {}) => apply(input, guard) });
}
const noServerEffects = f => { assert.deepEqual(f.server.calls, []); assert.equal(f.idb.rows("stage-dispatches").size, 0); };

test("confirmed apply handles a non-enumerable active layout and still rejects a changed runtime selection", async () => {
  const f = await fixture(); installRuntimeActiveLayoutId(f.state, f.targetId);
  const result = await f.run();
  assert.equal(result.state, "applied");
  assert.deepEqual(f.state.packedItems, result.targetSnapshot.beforeState.packedItems);
  assert.equal(f.state.activeLayoutId, f.targetId);
  assert.equal(Object.getOwnPropertyDescriptor(f.state, "activeLayoutId").enumerable, false);
  const changed = await fixture(); installRuntimeActiveLayoutId(changed.state, changed.targetId);
  changed.idb.controls.onGet = () => { changed.state.activeLayoutId = changed.record.snapshot.source.layoutId; };
  await assert.rejects(changed.run(), { code: "admin-template-photo-tree-copy-apply-context" });
  assert.equal(changed.writes.length, 0); noServerEffects(changed);
});

test("full receipt applies only target after durable write, preserving latest unrelated live and mirror values", async () => {
  const f = await fixture(), before = copy(f.state), mirror = f.mirror(); f.pending();
  mirror.items["private-item"].quantity = 19; mirror.unrelatedTopLevel.newer = "another tab";
  f.values.set(f.key, JSON.stringify(mirror));
  let changed = false;
  const result = await f.run(() => {
    if (!changed) { changed = true; f.state.items["private-item"].quantity = 23; f.state.unrelatedTopLevel.newer = "live edit"; }
  });
  assert.equal(result.state, "applied"); assert.equal(f.writes.length, 1);
  assert.equal(f.state.items["private-item"].quantity, 23); assert.equal(f.mirror().items["private-item"].quantity, 19);
  assert.equal(f.state.unrelatedTopLevel.newer, "live edit"); assert.equal(f.mirror().unrelatedTopLevel.newer, "another tab");
  assert.deepEqual(f.state.layouts[f.record.snapshot.source.layoutId], before.layouts[f.record.snapshot.source.layoutId]);
  assert.deepEqual(f.state.categories, before.categories); assert.deepEqual(f.state.locations, before.locations);
  assert.deepEqual(f.state.packedItems, before.packedItems); assert.equal(f.state.activeLayoutId, before.activeLayoutId);
  for (const owner of f.record.snapshot.copiedOwners) assert.ok(f.state[owner.entityType === "item" ? "items" : "containers"][owner.localId]);
  assert.equal(f.state.layouts[f.targetId].adminCausalSource.base.stateRevision, 12); noServerEffects(f);
});

test("quota keeps live target, full record and receipt intact; retry uses the same IDs", async () => {
  const f = await fixture(); f.pending(); const before = copy(f.state), raw = f.values.get(f.key);
  f.hooks.set = () => { throw Object.assign(Error("full"), { name: "QuotaExceededError" }); };
  await assert.rejects(f.run(), { name: "QuotaExceededError" });
  assert.deepEqual(f.state, before); assert.equal(f.values.get(f.key), raw); assert.deepEqual(await f.store.read(f.id), f.record);
  f.hooks.set = null; const result = await f.run(); assert.equal(result.operationId, f.id); assert.equal(result.state, "applied"); noServerEffects(f);
});

test("write succeeded but readback lost: live remains pending, same receipt can finish without a second write", async () => {
  const f = await fixture(); f.pending(); const before = copy(f.state);
  f.hooks.set = (name, value) => { f.values.set(name, value); f.hooks.get = () => { throw Error("readback lost"); }; };
  await assert.rejects(f.run(), /readback lost/); assert.deepEqual(f.state, before);
  f.hooks.set = null; f.hooks.get = null;
  assert.equal((await f.run()).state, "applied"); assert.equal(f.writes.length, 1);
  assert.equal((await f.run()).state, "already-applied"); assert.equal(f.writes.length, 1); noServerEffects(f);
});

test("cold confirmed mirror is recognized by full proof, with active packed hydration and isolated dictionaries", async () => {
  const f = await fixture(); f.state.activeLayoutId = f.targetId;
  f.values.set(f.key, JSON.stringify(f.state)); const dictionaries = copy([f.state.locations, f.state.categories]);
  const result = await f.run(); assert.deepEqual(f.state.packedItems, result.targetSnapshot.beforeState.packedItems);
  f.state = copy(f.mirror());
  assert.equal((await f.run()).state, "already-applied"); assert.equal(f.writes.length, 1);
  assert.deepEqual([f.state.locations, f.state.categories], dictionaries); noServerEffects(f);
});

test("dirty live source/target, foreign pending marker or newer mirror target never get overwritten", async () => {
  for (const fault of ["source", "target", "pending", "mirror"]) {
    const f = await fixture();
    if (fault === "source") f.state.layouts[f.record.snapshot.source.layoutId].name += " later";
    if (fault === "target") f.state.layouts[f.targetId].note = "unsaved later note";
    if (fault === "pending") { f.pending(); f.state.layouts[f.targetId].adminCausalSource.photoTreeCopyPending = crypto.randomUUID(); }
    if (fault === "mirror") { const value = f.mirror(); value.layouts[f.targetId].note = "another tab"; f.values.set(f.key, JSON.stringify(value)); }
    const before = copy(f.state), raw = f.values.get(f.key); await assert.rejects(f.run());
    assert.deepEqual(f.state, before); assert.equal(f.values.get(f.key), raw); assert.equal(f.writes.length, 0); noServerEffects(f);
  }
});

test("global ID collisions in the latest shared mirror refuse before storage mutation", async () => {
  const f = await fixture(), mirror = f.mirror(), id = f.record.snapshot.copiedOwners[0].localId;
  mirror.items[id] = { id, name: "unrelated local item" }; f.values.set(f.key, JSON.stringify(mirror));
  const before = copy(f.state); await assert.rejects(f.run(), /местный шаблон/);
  assert.equal(f.writes.length, 0); assert.deepEqual(f.state, before); noServerEffects(f);
});

test("actor, scope, document guard or selected namespace change during IDB awaits pauses before effects", async () => {
  for (const fault of ["actor", "scope", "guard", "namespace"]) {
    const f = await fixture(); let changed = false, active = true;
    f.idb.controls.onGet = () => {
      if (changed) return; changed = true;
      if (fault === "actor") f.current.actorId = "other";
      if (fault === "scope") f.mirrorContext.scopeKey = "id:other";
      if (fault === "guard") active = false;
      if (fault === "namespace") f.state.layouts[f.targetId].note = "changed while waiting";
    };
    await assert.rejects(f.run(() => { if (!active) throw Error("expired scope"); }));
    assert.ok(changed); assert.equal(f.writes.length, 0); noServerEffects(f);
  }
});

test("full forged receipt or stage fails before persistence, even with matching operation UUID", async () => {
  for (const fault of ["receipt", "stage"]) {
    const f = await fixture(), before = copy(f.state);
    if (fault === "receipt") f.input.receipt.result.payload.stateRevision++;
    else f.input.stageReceipts[0].receipt.assetDigest = "0".repeat(64);
    await assert.rejects(f.run()); assert.equal(f.writes.length, 0); assert.deepEqual(f.state, before); noServerEffects(f);
  }
});

test("late unrelated live edits survive storage hooks; foreign mirror readback is never rolled back", async () => {
  const f = await fixture();
  f.hooks.set = (name, value) => { f.values.set(name, value); f.state.items["late-private-item"] = { id: "late-private-item", name: "later" }; };
  await f.run(); assert.equal(f.state.items["late-private-item"].name, "later");
  const other = await fixture(), before = copy(other.state);
  other.hooks.set = (name, value) => { const next = JSON.parse(value); next.unrelatedTopLevel.later = "another writer"; other.values.set(name, JSON.stringify(next)); };
  await assert.rejects(other.run()); assert.deepEqual(other.state, before);
  assert.equal(other.mirror().unrelatedTopLevel.later, "another writer"); noServerEffects(other);
});

test("rejected async guards are refused synchronously without unhandled rejection or storage writes", async () => {
  const f = await fixture(); await assert.rejects(f.run(async () => { throw Error("async authority"); }));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.writes.length, 0); noServerEffects(f);
});

test("last storage read changing actor or target is checked before any live replacement", async () => {
  for (const fault of ["actor", "target"]) {
    const f = await fixture(); f.pending(); const before = copy(f.state); let reads = 0;
    f.hooks.set = (name, value) => {
      f.values.set(name, value);
      f.hooks.get = () => {
        if (++reads !== 2) return;
        if (fault === "actor") f.current.actorId = "other";
        else f.state.layouts[f.targetId].note = "late note";
      };
    };
    await assert.rejects(f.run()); assert.equal(reads, 2);
    if (fault === "target") before.layouts[f.targetId].note = "late note";
    assert.deepEqual(f.state, before); assert.equal(f.writes.length, 1); noServerEffects(f);
  }
});

test("prewrite storage read changing actor, scope or target refuses before mirror mutation", async () => {
  for (const fault of ["actor", "scope", "target", "alias"]) {
    const f = await fixture(); let reads = 0;
    f.hooks.get = () => {
      if (++reads !== 2) return;
      if (fault === "actor") f.current.actorId = "other";
      if (fault === "scope") f.mirrorContext.scopeKey = "id:other";
      if (fault === "target") f.state.layouts[f.targetId].note = "new note";
      if (fault === "alias") f.state.layouts["private-layout"].arrangement.rootContainerIds.push(f.record.snapshot.copiedOwners[0].localId);
    };
    await assert.rejects(f.run()); assert.equal(reads, 2); assert.equal(f.writes.length, 0); noServerEffects(f);
  }
});

test("latest mirror and live schema references cannot alias newly copied owners; opaque strings remain data", async () => {
  for (const fault of ["mirror-root", "mirror-item", "late-live", "opaque"]) {
    const f = await fixture(), owner = f.record.snapshot.copiedOwners.find(row => row.entityType === (fault === "mirror-item" ? "item" : "container"));
    const mirror = f.mirror(); let changed = false;
    if (fault === "mirror-root") mirror.layouts["private-layout"].arrangement.rootContainerIds.push(owner.localId);
    if (fault === "mirror-item") mirror.layouts["private-layout"].arrangement.items[owner.localId] = "private-bag";
    if (fault === "opaque") mirror.unrelatedTopLevel.opaqueCopiedId = owner.localId;
    f.values.set(f.key, JSON.stringify(mirror));
    f.idb.controls.onGet = () => {
      if (fault !== "late-live" || changed) return; changed = true;
      f.state.layouts["private-layout"].arrangement.rootContainerIds.push(owner.localId);
    };
    if (fault === "opaque") { await f.run(); assert.equal(f.mirror().unrelatedTopLevel.opaqueCopiedId, owner.localId); }
    else { await assert.rejects(f.run()); assert.equal(f.writes.length, 0); }
    noServerEffects(f);
  }
});
