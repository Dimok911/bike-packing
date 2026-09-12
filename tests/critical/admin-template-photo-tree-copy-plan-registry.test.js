import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { treePlanRegistryFixture as fixture } from "../fixtures/admin-template-photo-tree-copy-plan-registry-fixture.js";
import { copy, hash } from "../fixtures/admin-template-photo-tree-copy-client-fixture.js";
import { adminTemplatePhotoTreeCopySavePlan } from "../../src/sync/admin-template-photo-tree-copy-save-plan.js";
import { adminTemplateDataSourceSnapshot } from "../../src/sync/admin-template-save-plan.js";
import { withAdminTemplateCapture } from "../../src/sync/admin-template-capture-lease.js";

const noPosts = f => { assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0); assert.deepEqual(f.ordinaryCalls, []); };
const ordinary = f => ({ operationId: randomUUID(), exists: true, visibility: "private", base: copy(f.intent.body.base), payload: copy(f.intent.body.payload), metadata: copy(f.intent.body.metadata) });

test("registered V9 captures, reads and executes one exact tree through actual outer admission without reentering common locks", async () => {
  const f = await fixture(), saved = await f.capture();
  assert.deepEqual(saved.plan, adminTemplatePhotoTreeCopySavePlan({ ...f.request(), binding: f.binding }));
  const reader = f.makeRegistry().plans;
  assert.deepEqual(await reader.read(f.id), saved); assert.deepEqual(await reader.list(), [saved]);
  assert.equal(Object.hasOwn(saved.plan.editorSnapshot.payload.items, f.record.snapshot.copiedOwners.at(-1).localId), false);
  const result = await f.run(); assert.deepEqual(result, { state: "committed", receipts: [f.receipt] });
  assert.deepEqual(await f.run(), result); assert.equal(f.server.stagePosts.length, 4); assert.equal(f.server.savePosts.length, 1);
  assert.equal(f.held.size, 0); assert.deepEqual(f.ordinaryCalls, []);
  const common = f.lockEvents.filter(([event, name]) => event === "enter" && name.startsWith("bike-packing-admin-template-photo-capture:"));
  assert.equal(common.length, 6, "two source/target locks per outer capture/run; registry never reacquires them");
  assert.throws(() => adminTemplateDataSourceSnapshot(saved.plan));
  assert.deepEqual((await f.store.read(f.id)).snapshot, f.record.snapshot);
});

test("V9 requires both current common bindings before capture or client capture, including retained commands", async () => {
  const f = await fixture(), { plans } = f.makeRegistry();
  await assert.rejects(plans.capturePhotoTreeCopy(f.request())); assert.equal(f.planRows().length, 0);
  await withAdminTemplateCapture({ bindings: [f.binding], locks: f.locks }, async captureLease => {
    await assert.rejects(plans.capturePhotoTreeCopy(f.request(), { captureLease }));
  });
  await f.capture(); await assert.rejects(plans.run(f.id));
  await withAdminTemplateCapture({ bindings: [f.binding], locks: f.locks }, async captureLease => {
    await assert.rejects(plans.run(f.id, { captureLease }));
  });
  assert.equal(await f.makeRegistry().treeClient.read(f.id), null); noPosts(f);
  let expired;
  await withAdminTemplateCapture({ bindings: f.bindings, locks: f.locks }, lease => { expired = lease; });
  await assert.rejects(plans.run(f.id, { captureLease: expired })); noPosts(f);
});

test("quota at plan persistence retains exact native-format record and fixed IDs for the same retry", async () => {
  const f = await fixture(); f.controls.rejectWrite = key => key.includes("admin-save-plans-v1");
  await assert.rejects(f.capture()); assert.equal(f.planRows().length, 0); assert.deepEqual(await f.store.read(f.id), f.record); noPosts(f);
  f.controls.rejectWrite = null; const saved = await f.capture(); assert.equal(saved.plan.recordIntentHash, f.record.intentHash);
  assert.equal(saved.plan.id, f.id); assert.equal(f.planRows().length, 1); noPosts(f);
});

test("OFF retained capture is read-only under quota, while new OFF capture has no journal effects", async () => {
  const f = await fixture(); await assert.rejects(f.capture({ photoTreeCopyEnabled: undefined }));
  await assert.rejects(f.capture({ photoTreeCopyEnabled: false })); assert.equal(f.planRows().length, 0);
  const saved = await f.capture(); f.controls.quota = true;
  assert.deepEqual(await f.capture({ photoTreeCopyEnabled: false }), saved);
  assert.deepEqual(await f.makeRegistry(null, { photoTreeCopyEnabled: false }).plans.read(f.id), saved); noPosts(f);
});

test("lost ACK cold OFF uses only known read and GET reconciliation, with independent complete receipt/stage proof", async () => {
  const f = await fixture(); await f.capture(); f.controls.loseSave = true; f.controls.hideSave = true;
  await assert.rejects(f.run()); assert.equal(f.server.savePosts.length, 1); assert.equal(f.server.stagePosts.length, 4);
  f.controls.hideSave = false;
  const base = f.makeRegistry(null, { photoTreeCopyEnabled: false }), forbidden = () => { throw Error("OFF cannot capture/run"); };
  const { plans } = f.makeRegistry(null, { photoTreeCopyEnabled: false, photoTreeCopyClient: { ...base.treeClient, capture: forbidden, run: forbidden } });
  const start = f.server.calls.length, result = await plans.run(f.id);
  assert.deepEqual(result, { state: "committed", receipts: [f.receipt] });
  assert.ok(f.server.calls.slice(start).every(row => row.method === "GET"));
  assert.equal(f.server.savePosts.length, 1); assert.equal(f.server.stagePosts.length, 4);
  assert.deepEqual(await plans.run(f.id), result);
});

test("OFF missing or still-unknown command stays paused and cannot infer confirmation from plan or IDB", async () => {
  const f = await fixture(); await f.capture(); const off = f.makeRegistry(null, { photoTreeCopyEnabled: false });
  await assert.rejects(off.plans.run(f.id)); assert.equal(f.server.calls.length, 0);
  await f.makeRegistry().treeClient.capture(f.record.action);
  await assert.rejects(off.plans.run(f.id)); assert.ok(f.server.calls.every(row => row.method === "GET")); noPosts(f);
});

test("generic cancellation and stop requests never call either client cancel or persist a V9 cancel marker", async () => {
  const f = await fixture(), saved = await f.capture(), before = f.values.get(f.planRows()[0]); let cancelCalls = 0;
  const treeClient = { ...f.makeRegistry().treeClient, cancel: async () => { cancelCalls++; return f.receipt; } };
  await f.session(async ({ plans, captureLease }) => { await assert.rejects(plans.cancel(f.id, { captureLease })); }, { photoTreeCopyClient: treeClient });
  await assert.rejects(f.makeRegistry(null, { photoTreeCopyEnabled: false, photoTreeCopyClient: treeClient }).plans.cancel(f.id));
  f.policy.stop = true; await assert.rejects(f.run()); assert.equal(cancelCalls, 0);
  assert.equal(f.values.get(f.planRows()[0]), before); assert.equal(saved.cancelRequested, false); noPosts(f);
});

test("server strong cancellation is a rejected fact only, never V8 adoption or an exclusion", async () => {
  const f = await fixture(); await f.capture(); await f.makeRegistry().treeClient.capture(f.record.action);
  f.server.saved = { operation: { ...copy(f.receipt.operation), state: "rejected" }, result: { status: 409, payload: { ok: false, code: "operation_cancelled",
    cancellation: { version: 1, operationId: f.id, noBusinessEffects: true, operationCannotApply: true } } } };
  const off = f.makeRegistry(null, { photoTreeCopyEnabled: false, getExcludedPlans: async () => [f.id] });
  assert.deepEqual(await off.plans.run(f.id), { state: "rejected", receipts: [f.server.saved] });
  await assert.rejects(off.plans.capture(ordinary(f))); assert.equal(f.planRows().length, 1); noPosts(f);
});

test("numeric-base conflicts and generic predecessor fencing include V9 in either capture order", async () => {
  for (const first of ["tree", "ordinary"]) {
    const f = await fixture(), old = ordinary(f), plans = f.makeRegistry().plans;
    if (first === "tree") {
      await f.capture(); await assert.rejects(plans.capture(old)); old.base = { operationId: f.id }; await assert.rejects(plans.capture(old));
      await assert.rejects(f.makeRegistry(null, { getExcludedPlans: async () => [f.id] }).plans.capture({ ...old, base: copy(f.intent.body.base) }));
    } else { await plans.capture(old); await assert.rejects(f.capture()); }
    assert.equal(f.planRows().length, 1); noPosts(f);
  }
});

test("forged plan hash/body/before-state and recomputed journal digest cannot replace the full retained record", async () => {
  for (const fault of ["body", "hash", "before", "cancel", "record"]) {
    const f = await fixture(), saved = copy(await f.capture()), key = f.planRows()[0];
    if (fault === "body") saved.plan.operations[0].body.photoCopy.fields.name = "changed";
    if (fault === "hash") saved.plan.recordIntentHash = "a".repeat(64);
    if (fault === "before") saved.plan.editorSnapshot.payload.locations = ["changed"];
    if (fault === "cancel") saved.cancelRequested = true;
    if (fault === "record") f.idb.rows().clear();
    saved.digest = hash(saved.plan); f.values.set(key, JSON.stringify(saved));
    const plans = f.makeRegistry().plans;
    await assert.rejects(plans.read(f.id)); await assert.rejects(plans.run(f.id)); noPosts(f);
  }
});

test("client binding and recordIntentHash must match before any returned result is accepted", async () => {
  const f = await fixture(); await f.capture(); let calls = 0;
  for (const binding of [undefined, { ...f.binding, actorId: "foreign" }]) {
    const client = { binding, capture: async () => { calls++; }, read: async () => { calls++; } };
    await f.session(async ({ plans, captureLease }) => assert.rejects(plans.run(f.id, { captureLease })), { photoTreeCopyClient: client });
  }
  assert.equal(calls, 0); noPosts(f);
  await f.run(); const good = await f.makeRegistry().treeClient.read(f.id);
  for (const fault of ["hash", "receipt", "stages", "path", "owner"]) {
    const row = copy(good);
    if (fault === "hash") row.recordIntentHash = "0".repeat(64);
    if (fault === "receipt") row.receipt.result.payload.stateRevision++;
    if (fault === "stages") row.stageReceipts.pop();
    if (fault === "path") row.stageReceipts[1].receipt.materialization.target.filePathDigest = row.stageReceipts[0].receipt.materialization.target.filePathDigest;
    if (fault === "owner") row.receipt.result.payload.photoCopy.owners.pop();
    const plans = f.makeRegistry(null, { photoTreeCopyEnabled: false, photoTreeCopyClient: { binding: f.binding, read: async () => row } }).plans;
    await assert.rejects(plans.run(f.id));
  }
});

test("record removal after client capture or commit prevents exposing a registry result", async () => {
  for (const phase of ["capture", "commit"]) {
    const f = await fixture(); await f.capture();
    await f.session(async ({ treeClient, captureLease, getContext }) => {
      const wrapped = { ...treeClient,
        async capture(input) { const saved = await treeClient.capture(input); if (phase === "capture") f.idb.rows().clear(); return saved; },
        async run(id) { const result = await treeClient.run(id); if (phase === "commit") f.idb.rows().clear(); return result; } };
      const plans = f.makeRegistry({ getContext }, { photoTreeCopyClient: wrapped }).plans;
      await assert.rejects(plans.run(f.id, { captureLease }));
    });
    assert.equal(f.server.savePosts.length, phase === "commit" ? 1 : 0);
  }
});

test("exact capture freezes caller JSON and catches context changes before any durable plan", async () => {
  const f = await fixture();
  await f.session(async ({ plans, captureLease }) => {
    const input = f.request(), expected = copy(input), pending = plans.capturePhotoTreeCopy(input, { captureLease });
    input.body.photoCopy.fields.name = "late"; input.editorSnapshot.payload.items = {};
    assert.deepEqual((await pending).plan.operations[0].body, expected.body);
  });
  const other = await fixture(); other.policy.afterCapture = () => { other.current.generation = "changed"; };
  await assert.rejects(other.capture()); assert.equal(other.planRows().length, 0); noPosts(other);
});

test("plan disappearance/replacement during client capture pauses before POST and never recreates the missing pointer", async () => {
  for (const fault of ["missing", "changed"]) {
    const f = await fixture(); await f.capture();
    await f.session(async ({ treeClient, captureLease, getContext }) => {
      const wrapped = { ...treeClient, async capture(action) {
        const saved = await treeClient.capture(action), key = f.planRows()[0];
        if (fault === "missing") f.values.delete(key);
        else { const row = JSON.parse(f.values.get(key)); row.cancelRequested = true; f.values.set(key, JSON.stringify(row)); }
        return saved;
      } };
      const plans = f.makeRegistry({ getContext }, { photoTreeCopyClient: wrapped }).plans;
      await assert.rejects(plans.run(f.id, { captureLease }));
    });
    assert.deepEqual(await f.store.read(f.id), f.record); noPosts(f);
    assert.equal(f.planRows().length, fault === "missing" ? 0 : 1);
  }
});

test("exact OFF recapture rechecks a retained plan after asynchronous inventory admission", async () => {
  const f = await fixture(); await f.capture();
  f.policy.afterCapture = () => { f.values.delete(f.planRows()[0]); };
  await assert.rejects(f.capture({ photoTreeCopyEnabled: false }));
  assert.equal(f.planRows().length, 0); assert.deepEqual(await f.store.read(f.id), f.record); noPosts(f);
});
