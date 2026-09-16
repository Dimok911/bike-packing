import test from "node:test";
import assert from "node:assert/strict";
import { wholeCopyClientFixture } from "../fixtures/admin-template-photo-whole-copy-client-fixture.js";
import { seedWholeCopyAcceptanceFacts } from "../fixtures/admin-template-photo-whole-copy-acceptance-fixture.js";
import { adminTemplatePhotoWholeCopyAcceptanceKey, readAdminTemplatePhotoWholeCopyAcceptance } from "../../src/public/admin-template-photo-whole-copy-acceptance.js";
import { withAdminTemplateCapture } from "../../src/sync/admin-template-capture-lease.js";
import { adminTemplatePhotoWholeCopySavePlan, adminTemplatePhotoWholeCopySourceEditorSnapshot } from "../../src/sync/admin-template-photo-whole-copy-save-plan.js";
import { applyAdminTemplatePhotoWholeCopyResult as apply } from "../../src/public/admin-template-photo-whole-copy-apply.js";

const copy = structuredClone;
async function fixture() {
  const f = await wholeCopyClientFixture(), state = copy(f.record.snapshot.source.beforeState), key = "private-mirror";
  state.items.private = { id: "private", name: "Unrelated", quantity: 1, containerId: "" };
  state.preferences = { filter: "old" }; state.packedItems = { private: true };
  const plan = adminTemplatePhotoWholeCopySavePlan({ binding: f.binding, operationId: f.id, body: f.record.action.body,
    sourceEditorSnapshot: adminTemplatePhotoWholeCopySourceEditorSnapshot(f.record), recordIntentHash: f.record.intentHash });
  f.plan = plan; await seedWholeCopyAcceptanceFacts(f);
  const acceptanceKey = adminTemplatePhotoWholeCopyAcceptanceKey(f.binding, f.id);
  const values = new Map([...f.values, [key, JSON.stringify(state)]]), hooks = { set: null, get: null }, writes = [], allWrites = [];
  const storage = { getItem(name) { hooks.get?.(name); return values.get(name) ?? null; },
    setItem(name, value) { allWrites.push(name); if (name === key) writes.push(value); if (hooks.set) hooks.set(name, value); else values.set(name, value); } };
  const mirrorContext = { storage, key, scopeKey: `id:${f.binding.actorId}` };
  const bindings = [f.record.snapshot.source.ownerMap.binding, f.binding];
  const input = { plan, store: f.store, receipt: copy(f.receipt), stageReceipts: copy(f.stages),
    getState: () => state, getContext: () => f.current, getMirrorContext: () => mirrorContext };
  return Object.assign(f, { state, plan, values, hooks, writes, allWrites, acceptanceKey, key, bindings, input, mirrorContext,
    mirror: () => JSON.parse(values.get(key)),
    readAcceptance: () => readAdminTemplatePhotoWholeCopyAcceptance({ binding: f.binding, operationId: f.id, store: f.store,
      getContext: input.getContext, getMirrorContext: input.getMirrorContext }, () => {}),
    run: (guard = () => {}) => withAdminTemplateCapture({ bindings, locks: f.locks }, captureLease => apply({ ...input, captureLease }, guard)) });
}
const noServerEffects = f => {
  assert.deepEqual(f.server.calls, []); assert.equal(f.idb.rows("stage-dispatches").size, 0);
};

test("async mirror confirmation precedes acceptance and live application; rejected IDB write is retryable", async () => {
  const f = await fixture(), before = copy(f.state), original = f.values.get(f.key);
  f.input.persistMirror = async () => { throw new DOMException("IDB full", "QuotaExceededError"); };
  await assert.rejects(f.run(), { name: "QuotaExceededError" });
  assert.deepEqual(f.state, before); assert.equal(f.values.get(f.key), original);
  assert.equal(f.values.has(f.acceptanceKey), false);
  let entered, finish;
  const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { finish = resolve; });
  f.input.persistMirror = async (key, raw) => { entered(); await gate; f.values.set(key, raw); };
  const pending = f.run(); await waiting;
  assert.deepEqual(f.state, before); assert.equal(f.values.has(f.acceptanceKey), false);
  finish(); const result = await pending;
  assert.equal(result.state, "applied"); assert.ok(f.values.has(f.acceptanceKey));
  assert.ok(f.state.layouts[f.record.snapshot.target.layoutId]); noServerEffects(f);
});

test("editor changes during an async mirror write retain the target in storage without accepting over the changed editor", async () => {
  const f = await fixture(), targetId = f.record.snapshot.target.layoutId;
  f.input.persistMirror = async (key, raw) => {
    await Promise.resolve(); f.values.set(key, raw); f.current.generation = "changed while persisting";
  };
  await assert.rejects(f.run());
  assert.ok(f.mirror().layouts[targetId]); assert.equal(f.state.layouts[targetId], undefined);
  assert.equal(f.values.has(f.acceptanceKey), false); noServerEffects(f);
});

test("whole copy applies the verified target only after persistence, preserving fresh unrelated live and mirror values", async () => {
  const f = await fixture(), before = copy(f.state), sourceId = f.record.snapshot.source.layoutId;
  const mirror = f.mirror(); mirror.items.private.quantity = 19; mirror.preferences.filter = "other tab";
  f.values.set(f.key, JSON.stringify(mirror));
  let changed = false;
  f.idb.controls.onGet = () => { if (!changed) { changed = true; f.state.items.private.quantity = 23; f.state.preferences.filter = "live edit"; } };
  const sourceRef = f.state.layouts[sourceId], privateRef = f.state.items.private;
  f.hooks.set = (key, value) => {
    assert.equal(Object.hasOwn(f.state.layouts, f.record.snapshot.target.layoutId), false);
    f.values.set(key, value); f.state.items.late = { id: "late", name: "After persist" };
  };
  const result = await f.run();
  assert.equal(result.state, "applied"); assert.equal(f.writes.length, 1);
  assert.deepEqual(f.allWrites, [f.key, f.acceptanceKey]);
  assert.deepEqual((await f.readAcceptance()).acceptance, result.acceptance);
  assert.equal(f.state.items.private.quantity, 23); assert.equal(f.mirror().items.private.quantity, 19);
  assert.equal(f.state.preferences.filter, "live edit"); assert.equal(f.mirror().preferences.filter, "other tab");
  assert.equal(f.state.items.private, privateRef); assert.equal(f.state.layouts[sourceId], sourceRef);
  assert.deepEqual(f.state.layouts[sourceId], before.layouts[sourceId]); assert.equal(f.state.items.late.name, "After persist");
  assert.equal(f.state.activeLayoutId, before.activeLayoutId); assert.deepEqual(f.state.packedItems, before.packedItems);
  assert.deepEqual(f.state.locations, before.locations); assert.deepEqual(f.state.categories, before.categories);
  assert.deepEqual(f.state.layouts[result.layoutId], result.targetSnapshot.beforeState.layouts[result.layoutId]);
  assert.equal(f.state.layouts[result.layoutId].adminCausalSource.base.stateRevision, 1);
  for (const owner of f.record.snapshot.copiedOwners) assert.ok(f.state[owner.entityType === "item" ? "items" : "containers"][owner.localId]);
  assert.deepEqual(await f.store.read(f.id), f.record); noServerEffects(f);
});

test("quota preserves live source and absent target; retry uses identical allocated identities", async () => {
  const f = await fixture(), before = copy(f.state), raw = f.values.get(f.key);
  f.hooks.set = () => { throw Object.assign(Error("full"), { name: "QuotaExceededError" }); };
  await assert.rejects(f.run(), { name: "QuotaExceededError" });
  assert.deepEqual(f.state, before); assert.equal(f.values.get(f.key), raw); assert.deepEqual(await f.store.read(f.id), f.record);
  f.hooks.set = null; const result = await f.run(); assert.equal(result.operationId, f.id); noServerEffects(f);
});

test("successful mirror write with lost readback can retry while live target remains absent", async () => {
  const f = await fixture(), before = copy(f.state);
  f.hooks.set = (key, value) => { f.values.set(key, value); f.hooks.get = () => { throw Error("readback lost"); }; };
  await assert.rejects(f.run(), /readback lost/); assert.deepEqual(f.state, before);
  f.hooks.set = null; f.hooks.get = null;
  const result = await f.run(); assert.equal(result.state, "applied"); assert.equal(f.writes.length, 1);
  // An already-present live target requires the separate cold-adoption path.
  await assert.rejects(f.run()); assert.equal(f.writes.length, 1); noServerEffects(f);
});

test("whole acceptance quota leaves confirmed mirror and absent live target, then retry finishes same copy", async () => {
  const f = await fixture(), before = copy(f.state);
  f.hooks.set = (key, value) => {
    if (key === f.acceptanceKey) throw Error("acceptance quota");
    f.values.set(key, value);
  };
  await assert.rejects(f.run(), /acceptance quota/);
  assert.deepEqual(f.state, before); assert.equal(f.writes.length, 1); assert.equal(await f.readAcceptance(), null);
  assert.equal(f.mirror().layouts[f.record.snapshot.target.layoutId].adminCausalSource.base.stateRevision, 1);
  f.hooks.set = null;
  const result = await f.run();
  assert.equal(result.operationId, f.id); assert.equal(f.writes.length, 1);
  assert.deepEqual((await f.readAcceptance()).acceptance, result.acceptance); noServerEffects(f);
});

test("changed source, occupied target and mirror aliases reject before persistence", async () => {
  for (const fault of ["source", "target", "mirror-target", "mirror-alias", "late-alias"]) {
    const f = await fixture(), target = f.record.snapshot.target, owner = f.record.snapshot.copiedOwners[0];
    if (fault === "source") f.state.layouts[f.record.snapshot.source.layoutId].note += " later";
    if (fault === "target") f.state.layouts[target.layoutId] = { id: target.layoutId };
    const mirror = f.mirror();
    if (fault === "mirror-target") mirror.layouts[target.layoutId] = { id: target.layoutId };
    if (fault === "mirror-alias") mirror.items.private.containerId = owner.localId;
    f.values.set(f.key, JSON.stringify(mirror));
    if (fault === "late-alias") f.idb.controls.onGet = () => { f.state.items.private.containerId = owner.localId; };
    await assert.rejects(f.run()); assert.equal(f.writes.length, 0); noServerEffects(f);
  }
});

test("full parent/stage receipt and genuine current source-target lease are mandatory", async () => {
  for (const fault of ["receipt", "stage", "fake-lease", "expired-lease", "source-only-lease"]) {
    const f = await fixture(), before = copy(f.state);
    if (fault === "receipt") f.input.receipt.result.payload.stateRevision++;
    if (fault === "stage") f.input.stageReceipts[0].receipt.assetDigest = "0".repeat(64);
    if (fault === "fake-lease") await assert.rejects(apply({ ...f.input, captureLease: {} }, () => {}));
    else if (fault === "expired-lease") {
      const lease = await withAdminTemplateCapture({ bindings: f.bindings, locks: f.locks }, value => value);
      await assert.rejects(apply({ ...f.input, captureLease: lease }, () => {}));
    } else if (fault === "source-only-lease") {
      await withAdminTemplateCapture({ bindings: [f.bindings[0]], locks: f.locks }, captureLease =>
        assert.rejects(apply({ ...f.input, captureLease }, () => {})));
    } else await assert.rejects(f.run());
    assert.deepEqual(f.state, before); assert.equal(f.writes.length, 0); noServerEffects(f);
  }
});

test("context changes during awaits and storage callbacks never install the target", async () => {
  for (const fault of ["actor", "scope", "selection", "after-write", "false-guard", "async-guard"]) {
    const f = await fixture(), targetId = f.record.snapshot.target.layoutId;
    f.idb.controls.onGet = () => {
      if (fault === "actor") f.current.actorId = "other";
      if (fault === "scope") f.mirrorContext.scopeKey = "id:other";
      if (fault === "selection") f.state.activeLayoutId = "other";
    };
    if (fault === "after-write") f.hooks.set = (key, value) => { f.values.set(key, value); f.current.generation = "later"; };
    await assert.rejects(f.run(fault === "false-guard" ? () => false : fault === "async-guard" ? async () => {} : () => {}));
    assert.equal(Object.hasOwn(f.state.layouts, targetId), false);
    assert.equal(f.writes.length, fault === "after-write" ? 1 : 0); noServerEffects(f);
  }
});
