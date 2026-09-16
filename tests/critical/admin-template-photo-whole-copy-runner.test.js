import test from "node:test";
import assert from "node:assert/strict";
import { wholeAppRunnerFixture, planPrefix } from "../fixtures/admin-template-photo-whole-copy-runner-fixture.js";
import { copy, hash, commandPrefix } from "../fixtures/admin-template-photo-whole-copy-client-fixture.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminTemplateSavePlan } from "../../src/sync/admin-template-save-plan.js";
import { ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED } from "../../src/sync/admin-template-photo-whole-copy-protocol.js";

const noPosts = f => { assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.parentPosts.length, 0); assert.equal(f.server.cancelPosts.length, 0); };
const commandKey = f => commandPrefix + encodeURIComponent(canonicalTemplateJson(f.binding)) + ":" + f.id;
const off = f => { for (const key of Object.keys(f.flags)) f.flags[key] = false; };

test("actual whole-copy runner dispatches retained allocations and parent once while target remains absent", async () => {
  const f = await wholeAppRunnerFixture(), before = copy(f.state), raw = f.values.get(f.planKey);
  assert.equal(ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED, false);
  assert.equal(f.state.layouts[f.target.layoutId], undefined);
  assert.equal(f.modeState.adminPublishedEditLayoutId, f.source.layoutId);
  const result = await f.run();
  assert.deepEqual(result, { plan: f.plan, record: f.record, receipt: f.receipt, stageReceipts: f.stages });
  assert.deepEqual(f.state, before); assert.equal(f.values.get(f.planKey), raw); assert.equal(f.idb.rows().size, 1);
  assert.deepEqual(f.server.stagePosts.map(row => row.manifest.operationId), f.record.stages.map(row => row.operationId));
  assert.deepEqual(f.server.parentPosts, [f.expectedEnvelope]); assert.equal(f.server.cancelPosts.length, 0);
  const entered = f.lockEvents.filter(([event]) => event === "enter").map(([, key]) => key);
  assert.equal(entered.filter(key => key.startsWith("bike-packing-admin-template-photo-capture:")).length, 2);
  assert.ok(entered.indexOf(f.planKey) > 1); assert.equal(f.held.size, 0);
  for (const scope of f.scopes) assert.throws(scope.assertCurrent);
  for (const session of f.sessions) { assert.throws(session.assertCurrent); assert.throws(session.getContext); }
  result.record.snapshot.source.beforeState.items = {}; result.plan.sourceEditorSnapshot.payload.items = {};
  result.receipt.operation.state = "forged";
  assert.deepEqual(await f.store.read(f.id), f.record);
  assert.equal(JSON.parse(f.values.get(commandKey(f))).receipt.operation.state, "committed");
});

test("actual whole-copy runner recovers a lost parent ACK with all gates OFF through GET only", async () => {
  const f = await wholeAppRunnerFixture(), before = copy(f.state), rawPlan = f.values.get(f.planKey);
  f.controls.loseParent = true; f.controls.hideParent = true; await assert.rejects(f.run());
  assert.equal(f.server.parentPosts.length, 1); assert.equal(f.server.stagePosts.length, f.record.stages.length);
  f.controls.hideParent = false; off(f); const start = f.server.calls.length;
  const result = await f.run();
  assert.deepEqual(result, { plan: f.plan, record: f.record, receipt: f.receipt, stageReceipts: f.stages });
  assert.ok(f.server.calls.length > start); assert.ok(f.server.calls.slice(start).every(row => row.method === "GET"));
  assert.deepEqual(f.state, before); assert.equal(f.values.get(f.planKey), rawPlan);
  assert.equal(f.server.parentPosts.length, 1); assert.equal(f.server.stagePosts.length, f.record.stages.length);
  assert.equal(f.state.layouts[f.target.layoutId], undefined); assert.equal(f.held.size, 0);
});

test("actual whole-copy namespaces block occupied target, dirty source and allocated owner collision before HTTP", async () => {
  const f = await wholeAppRunnerFixture(), before = copy(f.state);
  for (const mutate of [
    () => { f.state.layouts[f.target.layoutId] = { id: f.target.layoutId, name: "Independent local layout" }; },
    () => { f.state.layouts[f.source.layoutId].name = "New source draft"; },
    () => { const owner = f.record.snapshot.copiedOwners[0]; f.state[owner.entityType === "item" ? "items" : "containers"][owner.localId] = { id: owner.localId, name: "Unrelated owner" }; }
  ]) {
    mutate(); const dirty = copy(f.state); await assert.rejects(f.run()); assert.deepEqual(f.state, dirty);
    for (const key of Object.keys(f.state)) delete f.state[key]; Object.assign(f.state, copy(before));
  }
  assert.equal(f.server.calls.length, 0); noPosts(f); assert.equal(f.held.size, 0);
});

test("actual whole-copy inventory sees independent typed save plans on source and absent target", async () => {
  const f = await wholeAppRunnerFixture();
  for (const [index, binding] of f.bindings.entries()) {
    const id = crypto.randomUUID(), independent = adminTemplateSavePlan({ binding, operationId: id,
      base: index === 0 ? f.record.action.body.source.base : null, exists: index === 0, visibility: index === 0 ? "private" : null,
      payload: { items: {}, containers: {}, layouts: {} }, metadata: { title: "Independent plan", description: "", language: "en" } });
    const key = planPrefix + encodeURIComponent(canonicalTemplateJson(binding)) + ":" + id;
    const raw = canonicalTemplateJson({ version: 1, plan: independent, digest: hash(independent), cancelRequested: false });
    f.values.set(key, raw); const before = copy(f.state);
    await assert.rejects(f.run()); assert.equal(f.values.get(key), raw); assert.deepEqual(f.state, before);
    f.values.delete(key);
  }
  assert.equal(f.server.calls.length, 0); noPosts(f); assert.equal(f.held.size, 0);
});

test("actual whole-copy guards recheck source, plan and changed journal bytes after beginWrite before any staged POST", async () => {
  for (const change of ["source", "plan", "journal"]) {
    const f = await wholeAppRunnerFixture(); let triggered = false;
    f.controls.afterBegin = () => {
      triggered = true;
      if (change === "source") f.state.layouts[f.source.layoutId].name = "Edit after admission";
      else if (change === "plan") f.values.delete(f.planKey);
      else {
        const row = JSON.parse(f.values.get(commandKey(f)));
        row.cancelRequested = true;
        f.values.set(commandKey(f), canonicalTemplateJson(row));
      }
    };
    await assert.rejects(f.run()); assert.ok(triggered); noPosts(f);
    assert.equal(f.idb.rows().size, 1); assert.ok(f.idb.rows("stage-dispatches").size > 0);
    assert.equal(f.held.size, 0); assert.equal(f.state.layouts[f.target.layoutId], undefined);
  }
});

test("actual whole-copy all-OFF missing or unknown journal never captures, allocates or posts", async () => {
  const f = await wholeAppRunnerFixture(); off(f); const before = copy(f.state), plan = f.values.get(f.planKey);
  await assert.rejects(f.run()); assert.equal(f.server.calls.length, 0); assert.equal(f.values.has(commandKey(f)), false);
  await f.make().client.capture(f.record.action); const raw = f.values.get(commandKey(f));
  await assert.rejects(f.run()); assert.ok(f.server.calls.every(row => row.method === "GET"));
  assert.equal(f.values.get(commandKey(f)), raw); assert.equal(f.values.get(f.planKey), plan); assert.deepEqual(f.state, before);
  assert.equal(f.idb.rows("stage-dispatches").size, 0); noPosts(f);
});

test("actual whole-copy runner binds selected source context rather than fabricating target editor context", async () => {
  const f = await wholeAppRunnerFixture();
  await assert.rejects(f.run({ binding: f.binding, layoutId: f.target.layoutId, operationId: f.id }));
  assert.equal(f.server.calls.length, 0); noPosts(f);
  let changed = false;
  f.controls.afterPrepare = () => { changed = true; f.modeState.adminPublishedEditLayoutId = "private"; };
  await assert.rejects(f.run()); assert.ok(changed); noPosts(f); assert.equal(f.held.size, 0);
  assert.equal(f.state.layouts[f.target.layoutId], undefined);
});

test("actual whole-copy inventory and registry refuse a journal whose typed IDB record disappeared", async () => {
  const f = await wholeAppRunnerFixture(); await f.make().client.capture(f.record.action);
  const raw = f.values.get(commandKey(f)), plan = f.values.get(f.planKey);
  f.idb.rows().clear();
  await assert.rejects(f.build().adminTemplatePhotoWholeCopyInventory(f.binding, f.source.layoutId, true));
  await assert.rejects(f.run());
  assert.equal(f.values.get(commandKey(f)), raw); assert.equal(f.values.get(f.planKey), plan);
  assert.equal(f.server.calls.length, 0); noPosts(f); assert.equal(f.state.layouts[f.target.layoutId], undefined);
});
