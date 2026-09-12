import test from "node:test";
import assert from "node:assert/strict";
import { treeAppRunnerFixture, planPrefix } from "../fixtures/admin-template-photo-tree-copy-runner-fixture.js";
import { copy, hash, commandPrefix } from "../fixtures/admin-template-photo-tree-copy-client-fixture.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminTemplateSavePlan } from "../../src/sync/admin-template-save-plan.js";
import { ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED } from "../../src/sync/admin-template-photo-tree-copy-protocol.js";

const noPosts = f => { assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0); };
const commandKey = f => commandPrefix + encodeURIComponent(canonicalTemplateJson(f.binding)) + ":" + f.id;
const off = f => { for (const key of Object.keys(f.flags)) f.flags[key] = false; };

for (const pending of [false, true]) test(`actual app runner proves ${pending ? "own pending" : "confirmed before"} namespaces, dispatches fixed V9 and returns detached proof without applying`, async () => {
  const f = await treeAppRunnerFixture(); if (pending) f.pending(); const before = copy(f.state), raw = f.values.get(f.planKey);
  assert.equal(ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED, false, "only the app harness injects the internal test flag");
  if (!pending) {
    await f.make().client.capture(f.record.action);
    const rawCommand = f.values.get(commandKey(f)), originalCommand = JSON.parse(rawCommand);
    assert.equal(Object.keys(originalCommand).length, 8); assert.equal(Object.hasOwn(originalCommand, "cancelRequested"), false);
    await f.make().client.read(f.id); assert.equal(f.values.get(commandKey(f)), rawCommand, "legacy eight-field read must not rewrite bytes");
    f.values.set(commandKey(f), canonicalTemplateJson({ ...originalCommand, cancelRequested: false }));
  }
  const result = await f.run(); assert.deepEqual(result, { plan: f.plan, record: f.record, receipt: f.receipt, stageReceipts: f.stages });
  const command = JSON.parse(f.values.get(commandKey(f)));
  assert.equal(Object.hasOwn(command, "cancelRequested"), !pending);
  if (!pending) assert.equal(command.cancelRequested, false);
  assert.deepEqual(f.state, before); assert.equal(f.values.get(f.planKey), raw); assert.equal(f.idb.rows().size, 1);
  assert.equal(f.server.stagePosts.length, 4); assert.equal(f.server.savePosts.length, 1); assert.equal(f.held.size, 0);
  const entered = f.lockEvents.filter(([event]) => event === "enter").map(([, key]) => key), common = "bike-packing-admin-template-photo-capture:";
  assert.ok(entered[0].startsWith(common)); assert.ok(entered[1].startsWith(common));
  assert.ok(entered.indexOf(f.planKey) > 1); assert.equal(entered.filter(key => key.startsWith(common)).length, 2);
  assert.ok(!entered.some(key => key.startsWith("bike-packing-admin-order-v1:")));
  for (const scope of f.scopes) assert.throws(scope.assertCurrent);
  for (const session of f.sessions) { assert.throws(session.assertCurrent); assert.throws(session.getContext); }
  result.record.snapshot.source.beforeState.items = {}; result.plan.editorSnapshot.payload.items = {}; result.receipt.operation.state = "forged";
  assert.deepEqual(await f.store.read(f.id), f.record); assert.equal(JSON.parse(f.values.get(commandKey(f))).receipt.operation.state, "committed");
  if (!pending) { off(f); assert.deepEqual(await f.run(), { plan: f.plan, record: f.record, receipt: f.receipt, stageReceipts: f.stages }); }
  assert.equal(f.server.stagePosts.length, 4); assert.equal(f.server.savePosts.length, 1);
});

test("actual plan removal after transport beginWrite is synchronously rejected before POST and retains record/claim", async () => {
  const f = await treeAppRunnerFixture(); let triggered = false;
  f.controls.afterBegin = () => { triggered = true; f.values.delete(f.planKey); };
  await assert.rejects(f.run()); assert.ok(triggered); noPosts(f); assert.equal(f.idb.rows().size, 1);
  assert.ok(f.idb.rows("stage-dispatches").size > 0); assert.equal(f.held.size, 0);
});

test("real namespace proofs refuse dirty source/target, foreign markers and global new-ID collisions before any auth/POST", async () => {
  const f = await treeAppRunnerFixture(), before = copy(f.state);
  for (const mutate of [
    () => { f.state.layouts[f.sides[0].layoutId].name = "unsaved source"; },
    () => { f.state.layouts[f.layoutId].arrangement.opaque = { changed: true }; },
    () => { f.pending(); f.state.layouts[f.layoutId].adminCausalSource.photoTreeCopyPending = crypto.randomUUID(); },
    () => { f.state.items[f.record.snapshot.copiedOwners[0].localId] = { id: f.record.snapshot.copiedOwners[0].localId, name: "Other draft" }; }
  ]) {
    mutate(); const dirty = copy(f.state); await assert.rejects(f.run()); assert.deepEqual(f.state, dirty);
    for (const key of Object.keys(f.state)) delete f.state[key]; Object.assign(f.state, copy(before));
  }
  assert.equal(f.server.calls.length, 0); noPosts(f);
});

test("actual namespace loss after beginWrite blocks POST through the enclosing inventory/namespace guard", async () => {
  const f = await treeAppRunnerFixture();
  f.controls.afterBegin = () => { f.state.layouts[f.sides[0].layoutId].name = "new edit after admission"; };
  await assert.rejects(f.run()); noPosts(f); assert.equal(f.state.layouts[f.sides[0].layoutId].name, "new edit after admission");
  assert.equal(f.idb.rows().size, 1); assert.equal(f.held.size, 0);
});

test("cold all-OFF lost ACK reconciles the same plan through GET only, preserving pending state and every allocation", async () => {
  const f = await treeAppRunnerFixture(); f.pending(); const before = copy(f.state), original = f.values.get(f.planKey);
  f.controls.loseSave = true; f.controls.hideSave = true; await assert.rejects(f.run());
  assert.equal(f.server.savePosts.length, 1); assert.equal(f.server.stagePosts.length, 4);
  f.controls.hideSave = false; off(f); const start = f.server.calls.length, result = await f.run();
  assert.deepEqual(result, { plan: f.plan, record: f.record, receipt: f.receipt, stageReceipts: f.stages });
  assert.ok(f.server.calls.length > start); assert.ok(f.server.calls.slice(start).every(row => row.method === "GET"));
  assert.deepEqual(f.state, before); assert.equal(f.values.get(f.planKey), original); assert.equal(f.idb.rows().size, 1);
  assert.equal(f.server.savePosts.length, 1); assert.equal(f.server.stagePosts.length, 4);
});

test("all-OFF missing/unknown command never captures or posts; unproved plan kind cannot reach the scoped registry", async () => {
  const f = await treeAppRunnerFixture(); off(f); await assert.rejects(f.run()); assert.equal(f.server.calls.length, 0); noPosts(f);
  await f.make().client.capture(f.record.action); const raw = f.values.get(commandKey(f));
  await assert.rejects(f.run()); assert.ok(f.server.calls.every(row => row.method === "GET"));
  assert.equal(f.values.get(commandKey(f)), raw); assert.equal(f.idb.rows("stage-dispatches").size, 0); noPosts(f);
  const ordinary = adminTemplateSavePlan({ binding: f.binding, operationId: f.id, base: f.intent.body.base,
    exists: true, visibility: "private", payload: f.intent.body.payload, metadata: f.intent.body.metadata });
  f.values.set(f.planKey, canonicalTemplateJson({ version: 1, plan: ordinary, digest: hash(ordinary), cancelRequested: false }));
  const before = f.server.calls.length, locks = f.lockEvents.length; await assert.rejects(f.run());
  assert.equal(f.server.calls.length, before); assert.equal(f.lockEvents.length, locks);
});

test("known cancelled parent is returned as a rejected fact with all-OFF, without adoption, marker removal or generic cancel", async () => {
  const f = await treeAppRunnerFixture(); f.pending(); await f.make().client.capture(f.record.action);
  const journal = JSON.parse(f.values.get(commandKey(f))), receipt = { operation: { ...copy(f.receipt.operation), state: "rejected" },
    result: { status: 409, payload: { ok: false, code: "operation_cancelled", cancellation: {
      version: 1, operationId: f.id, noBusinessEffects: true, operationCannotApply: true } } } };
  journal.receipt = receipt; f.values.set(commandKey(f), canonicalTemplateJson(journal));
  const stopKey = "bike-packing-admin-stop-v1:" + encodeURIComponent(canonicalTemplateJson(f.binding)) + ":" + f.id;
  f.values.set(stopKey, "{");
  off(f); const before = copy(f.state), raw = f.values.get(f.planKey), result = await f.run();
  assert.deepEqual(result.receipt, receipt); assert.deepEqual(result.stageReceipts, f.record.stages.map(() => null));
  assert.deepEqual(f.state, before); assert.equal(f.values.get(f.planKey), raw); assert.equal(f.values.get(stopKey), "{");
  assert.equal(f.server.calls.length, 0); noPosts(f);
});

test("own stop presence, including malformed or late after beginWrite, pauses ON without interpreting or deleting a cancellation proof", async () => {
  const f = await treeAppRunnerFixture(), key = "bike-packing-admin-stop-v1:" + encodeURIComponent(canonicalTemplateJson(f.binding)) + ":" + f.id;
  for (const marker of ["{", "null", canonicalTemplateJson({ version: 1, id: f.id })]) {
    f.values.set(key, marker); await assert.rejects(f.run()); assert.equal(f.values.get(key), marker);
  }
  assert.equal(f.server.calls.length, 0); noPosts(f);
  f.values.delete(key); let triggered = false;
  f.controls.afterBegin = () => { triggered = true; f.values.set(key, "late stop"); };
  await assert.rejects(f.run()); assert.ok(triggered); assert.equal(f.values.get(key), "late stop"); noPosts(f);
  assert.equal(f.idb.rows().size, 1); assert.equal(f.held.size, 0);
});

test("a released app session cannot authorize another dispatch or disclose an active context", async () => {
  const f = await treeAppRunnerFixture(); f.controls.unknownStage = true; await assert.rejects(f.run());
  const session = f.sessions[0]; assert.ok(session); assert.throws(session.assertCurrent); assert.throws(session.getContext);
  await assert.rejects(session.withDispatchAdmission({ intent: f.intent, recordIntentHash: f.record.intentHash, assertCurrent() {} }, () => assert.fail("Expired")));
  for (const scope of f.scopes) assert.throws(scope.assertCurrent); assert.equal(f.held.size, 0);
});

test("strict optional cancel marker preserves false but pauses true in both app modes, including after beginWrite", async () => {
  const f = await treeAppRunnerFixture(); await f.make().client.capture(f.record.action);
  const original = JSON.parse(f.values.get(commandKey(f))), before = copy(f.state);
  for (const marker of [true, "false", null, 0]) {
    const raw = canonicalTemplateJson({ ...original, receipt: f.receipt, stageReceipts: f.stages, dispatched: true, cancelRequested: marker });
    f.values.set(commandKey(f), raw);
    for (const enabled of [true, false]) {
      for (const key of Object.keys(f.flags)) f.flags[key] = enabled;
      await assert.rejects(f.run());
      assert.equal(f.values.get(commandKey(f)), raw); assert.deepEqual(f.state, before);
    }
  }
  assert.equal(f.server.calls.length, 0); noPosts(f);
  for (const key of Object.keys(f.flags)) f.flags[key] = true;
  f.values.set(commandKey(f), canonicalTemplateJson({ ...original, cancelRequested: false })); let triggered = false;
  f.controls.afterBegin = () => {
    triggered = true; const saved = JSON.parse(f.values.get(commandKey(f)));
    f.values.set(commandKey(f), canonicalTemplateJson({ ...saved, cancelRequested: true }));
  };
  await assert.rejects(f.run()); assert.ok(triggered); noPosts(f);
  assert.equal(JSON.parse(f.values.get(commandKey(f))).cancelRequested, true);
  assert.equal(f.idb.rows().size, 1); assert.ok(f.idb.rows("stage-dispatches").size > 0);
  assert.equal(f.held.size, 0);
});