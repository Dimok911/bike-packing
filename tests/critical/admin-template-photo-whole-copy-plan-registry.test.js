import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { wholeCopyClientFixture, copy, hash, commandPrefix } from "../fixtures/admin-template-photo-whole-copy-client-fixture.js";
import { createAdminTemplateSavePlans, adminTemplateDataSourceSnapshot } from "../../src/sync/admin-template-save-plan.js";
import { adminTemplatePhotoWholeCopySourceEditorSnapshot } from "../../src/sync/admin-template-photo-whole-copy-save-plan.js";
import { withAdminTemplateCapture, assertAdminTemplateCaptureLease } from "../../src/sync/admin-template-capture-lease.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";

const prefix = "bike-packing-admin-save-plans-v1:";
async function fixture() {
  const f = await wholeCopyClientFixture(), source = f.intent.body.source;
  const bindings = [f.binding, { ...f.binding, listId: source.listId, itemKey: source.itemKey }];
  const namespace = { source: copy(f.record.snapshot.source), target: null, pending: false }, original = canonical(namespace);
  const calls = [], policy = { stop: false, afterCapture: null };
  const ordinary = Object.fromEntries(["read", "capture", "run", "cancel", "inspect"].map(key => [key, () => { calls.push(key); throw Error("Wrong client"); }]));
  const request = () => ({ operationId: f.id, body: copy(f.intent.body), sourceEditorSnapshot: adminTemplatePhotoWholeCopySourceEditorSnapshot(f.record), recordIntentHash: f.record.intentHash });
  // Explicit fake application inventory/namespace adapter. The real UI adapter
  // does not exist yet: a typed record alone proves no live absence or inventory.
  const admission = ({ plan, record, captureLease, guard }) => {
    guard(); assertAdminTemplateCaptureLease(captureLease, bindings);
    assert.equal(plan.id, f.id); assert.deepEqual(record, f.record);
    assert.equal(canonical(namespace), original); return true;
  };
  const make = (extra = {}) => createAdminTemplateSavePlans({ binding: f.binding, client: ordinary, getContext: () => f.current,
    storage: f.storage, locks: f.locks, enabled: true, photoWholeCopyEnabled: true, photoWholeCopyStore: f.store,
    photoWholeCopyClient: f.make().client, assertWholeCopyAdmission: admission, shouldCancel: () => policy.stop,
    assertCaptureAllowed: async () => { await policy.afterCapture?.(); }, ...extra });
  const session = task => withAdminTemplateCapture({ bindings, locks: f.locks }, task);
  const capture = extra => session(captureLease => make(extra).capturePhotoWholeCopy(request(), { captureLease }));
  const run = extra => session(captureLease => {
    const check = () => admission({ plan: { id: f.id }, record: f.record, captureLease, guard: () => {} });
    const client = f.make({ withDispatchAdmission: async (proof, task) => {
      check(); f.admission.active = true;
      try { return await task({ assertCurrent() { proof.assertCurrent(); check(); } }); }
      finally { f.admission.active = false; }
    } }).client;
    return make({ photoWholeCopyClient: client, ...extra }).run(f.id, { captureLease });
  });
  return { ...f, bindings, namespace, calls, policy, request, admission, makeRegistry: make, session, capture, run,
    plans: () => [...f.values.keys()].filter(key => key.startsWith(prefix)) };
}
const noWrites = f => { assert.deepEqual(f.calls, []); assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.parentPosts.length, 0); };

test("V10 registry stores source comparison, runs typed copy and never projects it as target before-state", async () => {
  const f = await fixture(), saved = await f.capture(), before = copy(f.record);
  assert.equal(saved.plan.version, 10); assert.equal(saved.plan.operations[0].body.base, null);
  assert.equal(saved.plan.sourceEditorSnapshot.metadata.title, "Whole source");
  assert.throws(() => adminTemplateDataSourceSnapshot(saved.plan));
  assert.deepEqual(await f.makeRegistry().read(f.id), saved); assert.deepEqual(await f.makeRegistry().list(), [saved]);
  assert.deepEqual(await f.run(), { state: "committed", receipts: [f.receipt] });
  assert.deepEqual(await f.run(), { state: "committed", receipts: [f.receipt] });
  assert.equal(f.server.parentPosts.length, 1); assert.equal(f.server.stagePosts.length, f.record.stages.length);
  assert.deepEqual(await f.store.read(f.id), before); assert.equal(f.namespace.target, null); assert.deepEqual(f.calls, []);
});

test("V10 requires explicit namespace admission and genuine source plus target lease, not default or async guard", async () => {
  const f = await fixture(), plans = f.makeRegistry();
  await assert.rejects(plans.capturePhotoWholeCopy(f.request()));
  await withAdminTemplateCapture({ bindings: [f.binding], locks: f.locks }, captureLease =>
    assert.rejects(plans.capturePhotoWholeCopy(f.request(), { captureLease })));
  for (const value of [undefined, null, () => {}, () => false, async () => true, async () => { throw Error("Async guard"); }])
    await assert.rejects(f.capture({ assertWholeCopyAdmission: value }));
  assert.equal(f.plans().length, 0); noWrites(f);
  await f.capture(); await assert.rejects(plans.run(f.id));
  await assert.rejects(f.run({ assertWholeCopyAdmission: null }));
  let expired; await f.session(lease => { expired = lease; });
  await assert.rejects(plans.run(f.id, { captureLease: expired })); noWrites(f);
});

test("changed raw source, occupied target and independent inventory block capture and retained dispatch", async () => {
  for (const fault of ["source", "target", "pending"]) {
    const f = await fixture(); await f.capture();
    if (fault === "source") f.namespace.source.metadata.title = "Unsaved source";
    if (fault === "target") f.namespace.target = { id: f.record.snapshot.target.layoutId };
    if (fault === "pending") f.namespace.pending = true;
    await assert.rejects(f.capture()); await assert.rejects(f.run()); noWrites(f);
  }
});

test("namespace rechecks after asynchronous capture policy prevent a late collision from being persisted", async () => {
  const f = await fixture(); f.policy.afterCapture = () => { f.namespace.target = { occupied: true }; };
  await assert.rejects(f.capture()); assert.equal(f.plans().length, 0); noWrites(f);
});

test("quota retains native proof and exact IDs; OFF cannot create a plan or recapture command", async () => {
  const f = await fixture(); await assert.rejects(f.capture({ photoWholeCopyEnabled: false }));
  f.controls.rejectWrite = key => key.startsWith(prefix);
  await assert.rejects(f.capture()); assert.equal(f.plans().length, 0); assert.deepEqual(await f.store.read(f.id), f.record);
  f.controls.rejectWrite = null; const saved = await f.capture();
  f.controls.rejectWrite = () => true;
  assert.deepEqual(await f.capture({ photoWholeCopyEnabled: false }), saved);
  assert.deepEqual(await f.makeRegistry({ photoWholeCopyEnabled: false }).read(f.id), saved); noWrites(f);
});

test("lost parent ACK recovers cold with gate OFF using only known journal and GET", async () => {
  const f = await fixture(); await f.capture(); f.controls.loseParent = true; f.controls.hideParent = true;
  await assert.rejects(f.run()); assert.equal(f.server.parentPosts.length, 1);
  f.controls.hideParent = false; const client = f.make().client, forbidden = () => { throw Error("OFF writer"); };
  const plans = f.makeRegistry({ photoWholeCopyEnabled: false, assertWholeCopyAdmission: null,
    photoWholeCopyClient: { ...client, capture: forbidden, run: forbidden, cancel: forbidden } });
  const start = f.server.calls.length;
  assert.deepEqual(await plans.run(f.id), { state: "committed", receipts: [f.receipt] });
  assert.ok(f.server.calls.slice(start).every(call => call.method === "GET"));
  assert.equal(f.server.parentPosts.length, 1); assert.deepEqual(f.calls, []);
});

test("OFF missing/unknown command and generic cancellation stay paused without mutation", async () => {
  const f = await fixture(); await f.capture();
  const plans = f.makeRegistry({ photoWholeCopyEnabled: false, assertWholeCopyAdmission: null });
  await assert.rejects(plans.run(f.id)); assert.equal(f.server.calls.length, 0);
  await f.make().client.capture(f.record.action);
  await assert.rejects(plans.run(f.id)); assert.ok(f.server.calls.every(call => call.method === "GET"));
  const saved = f.values.get(f.plans()[0]);
  await assert.rejects(plans.cancel(f.id));
  await f.session(captureLease => assert.rejects(f.makeRegistry().cancel(f.id, { captureLease })));
  f.policy.stop = true; await assert.rejects(f.run());
  assert.equal(f.values.get(f.plans()[0]), saved); assert.equal(f.server.cancelPosts.length, 0); noWrites(f);
});

test("forged plan digest, source snapshot, cancel marker or missing typed record cannot authorize V10", async () => {
  for (const fault of ["source", "hash", "cancel", "record"]) {
    const f = await fixture(), saved = copy(await f.capture()), key = f.plans()[0];
    if (fault === "source") saved.plan.sourceEditorSnapshot.metadata.title = "Wrong source";
    if (fault === "hash") saved.plan.recordIntentHash = "a".repeat(64);
    if (fault === "cancel") saved.cancelRequested = true;
    if (fault === "record") f.idb.rows().clear();
    saved.digest = hash(saved.plan); f.values.set(key, canonical(saved));
    await assert.rejects(f.makeRegistry().read(f.id)); await assert.rejects(f.run()); noWrites(f);
  }
});

test("typed journal independently rejects forged stage paths, owner proof and receipt despite client read", async () => {
  const f = await fixture(); await f.capture(); await f.run(); const good = await f.make().client.read(f.id);
  for (const fault of ["hash", "stage", "owner", "receipt", "kind", "dispatch"]) {
    const row = copy(good);
    if (fault === "hash") row.recordIntentHash = "0".repeat(64);
    if (fault === "stage") row.stageReceipts[0].receipt.materialization.target.filePathDigest = row.stageReceipts[0].receipt.materialization.source.filePathDigest;
    if (fault === "owner") row.receipt.result.payload.photoCopy.ownerId = "foreign";
    if (fault === "receipt") row.receipt.result.payload.stateRevision++;
    if (fault === "kind") row.kind = "admin-template-photo-tree-copy";
    if (fault === "dispatch") { row.dispatched = true; row.stageReceipts[0] = null; }
    const plans = f.makeRegistry({ photoWholeCopyEnabled: false, assertWholeCopyAdmission: null,
      photoWholeCopyClient: { binding: f.binding, read: async () => row } });
    await assert.rejects(plans.run(f.id));
  }
  assert.equal(f.server.parentPosts.length, 1); assert.deepEqual(f.calls, []);
});

test("retained V10 fences generic source/target writers regardless of base or exclusion IDs", async () => {
  const f = await fixture(); await f.capture();
  for (const binding of f.bindings) for (const base of [{ stateRevision: 7 }, { operationId: f.id }, null]) {
    const plans = f.makeRegistry({ binding, getContext: () => ({ ...f.current, ...binding }), getExcludedPlans: async () => [f.id] });
    await assert.rejects(plans.capture({ operationId: randomUUID(), exists: base !== null, visibility: base === null ? null : "private", base,
      payload: copy(f.intent.body.photoCopy.sourcePayload), metadata: copy(f.intent.body.metadata) }));
  }
  assert.equal(f.plans().length, 1); noWrites(f);
});

test("context or retained plan replacement after await prevents registry confirmation", async () => {
  for (const fault of ["context", "plan"]) {
    const f = await fixture(); await f.capture();
    const client = f.make().client;
    const read = async id => {
      const result = await client.read(id);
      if (fault === "context") f.current.generation = "changed";
      else f.values.set(f.plans()[0], "null");
      return result;
    };
    await assert.rejects(f.run({ photoWholeCopyClient: { ...client, read } })); noWrites(f);
  }
});
