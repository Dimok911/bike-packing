import test from "node:test";
import assert from "node:assert/strict";
import { wholeCopyClientFixture, copy } from "../fixtures/admin-template-photo-whole-copy-client-fixture.js";
import { createAdminTemplatePhotoWholeCopyAdmission } from "../../src/sync/admin-template-photo-whole-copy-admission.js";
import { assertAdminTemplateCaptureLease } from "../../src/sync/admin-template-capture-lease.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";

const prefix = "bike-packing-admin-template-photo-capture:";
const noPosts = f => { assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.parentPosts.length, 0); };
async function fixture() {
  const f = await wholeCopyClientFixture(), held = new Set(), requested = [], retained = [], calls = [];
  const locks = { async request(name, task) {
    return f.locks.request(name, async () => {
      assert.equal(held.has(name), false); held.add(name); requested.push(name);
      try { return await task(); } finally { held.delete(name); }
    });
  } };
  const source = f.record.action.body.source;
  const bindings = [f.binding, { ...f.binding, listId: source.listId, itemKey: source.itemKey }]
    .sort((a,b) => canonical(a) < canonical(b) ? -1 : 1);
  const controls = { inventory: null, namespaces: null, guard: null }, namespaces = copy(f.record.snapshot);
  let depth = 0;
  // Test inventory/namespace policy only; application implementations supply the
  // complete retained-store inventory and actual source/absent-target authority.
  const enter = label => async (proof, task) => {
    calls.push(label); proof.assertCurrent();
    assert.deepEqual(proof.bindings, bindings);
    assertAdminTemplateCaptureLease(proof.captureLease, bindings);
    await controls[label]?.(proof); proof.assertCurrent();
    assert.deepEqual(await f.store.read(f.id), proof.record);
    let active = true;
    const scope = { kind: `admin-template-photo-whole-copy-${label === "inventory" ? "inventory" : "namespaces"}-v1`,
      bindings: proof.bindings, recordIntentHash: proof.record.intentHash, assertCurrent() {
        assert.equal(active, true); proof.assertCurrent();
        if (label === "namespaces") assert.deepEqual(namespaces, proof.record.snapshot);
        return controls.guard?.(label);
      } };
    retained.push(scope); depth++; f.admission.active = true;
    try { return await task(scope); } finally { active = false; depth--; f.admission.active = depth > 0; }
  };
  const options = { binding: f.binding, store: f.store, getContext: () => f.current, locks,
    withInventory: enter("inventory"), withNamespaces: enter("namespaces") };
  const runner = createAdminTemplatePhotoWholeCopyAdmission(options);
  const run = before => runner.run(f.id, async session => {
    const client = f.make({ locks, getContext: session.getContext, withDispatchAdmission: session.withDispatchAdmission }).client;
    await client.capture(session.record.action); await before?.(session); return client.run(f.id);
  });
  return Object.assign(f, { held, requested, retained, calls, bindings, namespaces, controlsAdmission: controls, options, runner, run });
}

test("whole client retains both real leases and reenters admission before each stage and parent POST", async () => {
  const f = await fixture(); let session;
  f.controls.afterBegin = () => assert.equal([...f.held].filter(name => name.startsWith(prefix)).length, 2);
  assert.deepEqual(await f.run(value => { session = value; }), f.receipt);
  assert.equal(f.server.stagePosts.length, f.record.stages.length); assert.equal(f.server.parentPosts.length, 1);
  assert.equal(f.calls.filter(label => label === "inventory").length, f.record.stages.length + 2);
  assert.deepEqual(f.requested.filter(name => name.startsWith(prefix)), f.bindings.map(binding => prefix + canonical(binding)));
  assert.equal(f.held.size, 0); assert.equal(Object.isFrozen(session.record.snapshot.source.beforeState), true);
  assert.throws(session.assertCurrent); assert.throws(session.getContext);
  assert.throws(() => assertAdminTemplateCaptureLease(session.captureLease, f.bindings));
  for (const scope of f.retained) assert.throws(scope.assertCurrent);
  await assert.rejects(session.withDispatchAdmission({ intent: f.intent, recordIntentHash: f.record.intentHash,
    assertCurrent() {} }, () => assert.fail("Expired dispatch")));
});

test("same whole operation serializes outside client locks and posts each immutable stage once", { timeout: 30000 }, async () => {
  const f = await fixture();
  assert.deepEqual(await Promise.all([f.run(), f.run()]), [f.receipt, f.receipt]);
  assert.equal(f.server.stagePosts.length, f.record.stages.length); assert.equal(f.server.parentPosts.length, 1);
  assert.equal(f.held.size, 0);
});

test("rederived whole record rejects forged stages despite unchanged operation ID/hash", async () => {
  const f = await fixture(), forged = copy(f.record); forged.stages[0].target.photoId = crypto.randomUUID();
  const runner = createAdminTemplatePhotoWholeCopyAdmission({ ...f.options,
    store: { binding: f.binding, read: async () => forged } });
  await assert.rejects(runner.run(f.id, () => assert.fail("Forged record admitted")),
    { code: "admin-template-photo-whole-copy-admission-record" });
  noPosts(f); assert.equal(f.held.size, 0);
});

for (const boundary of ["inventory", "namespaces"]) test(`whole ${boundary} changes block pre-POST and preserve the record`, async () => {
  const f = await fixture(); let count = 0;
  f.controlsAdmission[boundary] = () => { if (++count === 2) throw Error("Authority changed"); };
  await assert.rejects(f.run(), /Authority changed/); noPosts(f);
  assert.deepEqual(await f.store.read(f.id), f.record); assert.equal(f.held.size, 0);
});

test("context change while reading inventory releases both leases without dispatch", async () => {
  const f = await fixture(); f.controlsAdmission.inventory = async () => { f.current.generation = "changed"; };
  await assert.rejects(f.run(), { code: "admin-template-photo-whole-copy-admission-context" });
  noPosts(f); assert.equal(f.held.size, 0);
});

test("tree-shaped source/scope and mismatched nested intent cannot admit whole copy", async () => {
  const f = await fixture();
  await f.runner.run(f.id, async session => {
    for (const mutate of [request => { request.intent.body.photoCopy.source = copy(request.intent.body.source); },
      request => { request.recordIntentHash = "0".repeat(64); }]) {
      const request = { intent: copy(f.intent), recordIntentHash: f.record.intentHash, assertCurrent: session.assertCurrent }; mutate(request);
      await assert.rejects(session.withDispatchAdmission(request, () => assert.fail("Wrong intent")),
        { code: "admin-template-photo-whole-copy-admission-intent" });
    }
  });
  const runner = createAdminTemplatePhotoWholeCopyAdmission({ ...f.options,
    withInventory: (proof, task) => f.options.withInventory(proof, scope => task({ ...scope, kind: "admin-template-photo-tree-copy-inventory-v1" })) });
  await assert.rejects(runner.run(f.id, () => assert.fail("Wrong scope")), { code: "admin-template-photo-whole-copy-admission-scope" });
  noPosts(f);
});

test("async authority after claim fails closed without an unhandled rejection", async t => {
  const f = await fixture(), unhandled = [], observe = error => unhandled.push(error);
  process.on("unhandledRejection", observe); t.after(() => process.off("unhandledRejection", observe));
  f.controls.afterBegin = () => { f.controlsAdmission.guard = () => Promise.reject(Error("Revoked")); };
  await assert.rejects(f.run(), { code: "admin-template-photo-whole-copy-admission-async-guard" });
  noPosts(f); assert.equal(f.idb.rows("stage-dispatches").size, 1); assert.equal(f.held.size, 0);
  assert.deepEqual(await f.store.read(f.id), f.record);
  await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(unhandled, []);
});

test("unawaited nested dispatch expires before it can claim or POST", async () => {
  const f = await fixture(); let pending;
  await f.runner.run(f.id, session => {
    pending = session.withDispatchAdmission({ intent: f.intent, recordIntentHash: f.record.intentHash,
      assertCurrent: session.assertCurrent }, () => assert.fail("Unawaited work admitted"));
    pending.catch(() => {});
  });
  await assert.rejects(pending); noPosts(f); assert.equal(f.held.size, 0);
});
