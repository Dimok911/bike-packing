import test from "node:test";
import assert from "node:assert/strict";
import { treeRecoveryAppFixture as fixture, command, commandKey, cancelled, copy } from "../fixtures/admin-template-photo-tree-copy-recovery-app-fixture.js";
import { adminTemplatePhotoNamespace } from "../../src/public/admin-template-photo-state.js";
import { AMBIGUOUS_WRITE_KEY } from "../../src/sync/experiment-transport.js";

const noGeneric = f => assert.deepEqual(f.genericCalls, []);
const noOwners = f => { for (const owner of f.record.snapshot.copiedOwners)
  assert.equal(f.state[owner.entityType === "item" ? "items" : "containers"][owner.localId], undefined); };
const dialog = async f => {
  const value = await f.api().prepareAdminTemplateRecovery(f.layoutId); assert.ok(value);
  const facts = await value.inspect(false); assert.equal(facts.recoveryKind, "photo-tree-copy"); return value;
};

test("actual dialog preparation and local inspection use durable V9 facts with no network or generic recovery", async () => {
  const f = await fixture(); await f.capture(); const before = copy(f.state), raw = f.values.get(commandKey(f));
  const recovery = await dialog(f), facts = await recovery.inspect(false);
  assert.equal(facts.id, f.id); assert.equal(facts.stopRequested, false); assert.equal(facts.canStop, true);
  assert.equal(facts.canCompare, false); assert.equal(facts.committedCount, 0);
  assert.deepEqual(f.server.calls, []); assert.deepEqual(f.cancelPosts, []); assert.deepEqual(f.state, before);
  assert.equal(f.values.get(commandKey(f)), raw); assert.equal(f.idb.rows().size, 1); assert.equal(f.values.has(f.planKey), true);
  assert.equal(f.held.size, 0); noOwners(f); noGeneric(f);
});

test("actual OFF partial-stage cancellation preserves its claim and cold recovery uses the same UUID through GET only", async () => {
  const f = await fixture(); await f.capture(); f.controls.unknownStage = true;
  await assert.rejects(f.api().runAdminTemplatePhotoTreeCopyPlan({ binding: f.binding, layoutId: f.layoutId, operationId: f.id }));
  assert.equal(f.server.stagePosts.length, 1); const stageId = f.record.stages[0].operationId, key = `${AMBIGUOUS_WRITE_KEY}:${stageId}`, raw = f.values.get(key);
  f.off(); f.controls.capabilities = ["adminTemplateCausalOperationsV1"];
  // The historical action may be cancelled even if the current source changed.
  f.state.layouts[f.input.sourceLayoutId].note = "later source edit";
  const recovery = await dialog(f), result = await recovery.stop();
  assert.equal(result.stopped, true); assert.equal(result.id, f.id); assert.equal(result.canResume, false);
  assert.equal(f.cancelPosts.length, 1); assert.equal(command(f).cancelRequested, true); assert.deepEqual(command(f).receipt, cancelled(f));
  assert.equal(f.values.get(key), raw); assert.equal(f.idb.rows("stage-dispatches").size, 1);
  const before = f.server.calls.length, cold = await f.api().resumeAdminTemplatePhotoTreeCopyForm(f.layoutId);
  assert.deepEqual(cold, { state: "stopped", operationId: f.id });
  assert.ok(f.server.calls.slice(before).every(row => row.method === "GET"));
  assert.equal(f.cancelPosts.length, 1); assert.equal(f.server.savePosts.length, 0); assert.equal(f.server.stagePosts.length, 1);
  assert.equal(f.state.layouts[f.layoutId].adminCausalSource.photoTreeCopyPending, f.id); assert.equal(f.held.size, 0); noOwners(f); noGeneric(f);
  for (const scope of f.observedScopes) assert.throws(scope.assertCurrent);
});

test("offline cancellation and lost ACK retain the stop; background recovery is GET only and explicit resume uses the original cancel", async () => {
  for (const offline of [false, true]) {
    const f = await fixture(); await f.capture(); f.off(); f.cancellation.unknown = !offline; f.cancellation.offline = offline;
    const recovery = await dialog(f); await assert.rejects(recovery.stop());
    const firstPosts = offline ? 0 : 1;
    assert.equal(f.cancelPosts.length, firstPosts); assert.equal(command(f).cancelRequested, true); assert.equal(command(f).receipt, null);
    f.cancellation.offline = false; const before = f.server.calls.length;
    assert.deepEqual(await f.api().resumeAdminTemplatePhotoTreeCopyForm(f.layoutId), { state: "stopping", operationId: f.id });
    assert.ok(f.server.calls.slice(before).every(row => row.method === "GET")); assert.equal(f.cancelPosts.length, firstPosts);
    const cold = await dialog(f), view = await cold.inspect(false); assert.equal(view.stopRequested, true); assert.equal(view.canResume, true); assert.equal(view.canStop, false);
    f.cancellation.unknown = false; assert.equal((await cold.resume()).stopped, true);
    assert.equal(f.cancelPosts.length, firstPosts + 1); if (!offline) assert.deepEqual(f.cancelPosts[0], f.cancelPosts[1]);
    assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0); assert.equal(f.held.size, 0); noOwners(f); noGeneric(f);
  }
});

test("a late committed save requires every typed stage and applies only target; mirror quota retries without another POST", async () => {
  const f = await fixture(); await f.capture(); f.off(); f.cancellation.lateCommit = true;
  const source = copy(adminTemplatePhotoNamespace(f.state, f.input.sourceLayoutId)), privateItem = copy(f.state.items.privateItem);
  const recovery = await dialog(f), stopped = await recovery.stop();
  assert.equal(stopped.committedCount, 1); assert.equal(stopped.stopped, false); assert.equal(stopped.canResume, true);
  assert.deepEqual(command(f).stageReceipts, f.stages); assert.equal(command(f).cancelRequested, true);
  assert.equal(f.server.calls.filter(row => row.path.includes("/template-photo-assets/tree-copy/")).length, f.stages.length);
  noOwners(f); const before = copy(f.state), posts = f.server.calls.filter(row => row.method === "POST");
  f.controls.rejectWrite = key => key === "mirror"; await assert.rejects(recovery.resume(), /Quota/);
  assert.deepEqual(f.state, before); assert.deepEqual(command(f).receipt, f.receipt);
  f.controls.rejectWrite = null;
  const cold = await dialog(f), result = await cold.resume(); assert.equal(result.applied, true); assert.equal(result.committedCount, 1);
  for (const owner of f.record.snapshot.copiedOwners) assert.ok(f.state[owner.entityType === "item" ? "items" : "containers"][owner.localId]);
  assert.deepEqual(adminTemplatePhotoNamespace(f.state, f.input.sourceLayoutId), source); assert.deepEqual(f.state.items.privateItem, privateItem);
  assert.equal(f.state.layouts[f.layoutId].adminCausalSource.photoTreeCopyPending, undefined);
  assert.deepEqual(JSON.parse(f.values.get("mirror")).layouts[f.layoutId], f.state.layouts[f.layoutId]);
  assert.deepEqual(f.server.calls.filter(row => row.method === "POST"), posts); assert.equal(f.cancelPosts.length, 1);
  assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0); assert.equal(f.held.size, 0); noGeneric(f);
});

test("malformed, missing and foreign-layout V9 pointers fail without generic fallback or network", async () => {
  for (const fault of ["malformed", "missing", "foreign"]) {
    const f = await fixture(); await f.capture(); const source = f.state.layouts[f.layoutId].adminCausalSource; let id = f.layoutId;
    if (fault === "malformed") source.photoTreeCopyPending = false;
    if (fault === "missing") f.idb.rows().clear();
    if (fault === "foreign") {
      id = "foreign-layout"; f.state.layouts[id] = { ...copy(f.state.layouts[f.layoutId]), id };
      f.modeState.adminPublishedEditLayoutId = id;
    }
    const before = copy(f.state), records = [...f.idb.rows().entries()], journals = [...f.values.entries()];
    await assert.rejects(f.api().prepareAdminTemplateRecovery(id));
    assert.deepEqual(f.server.calls, []); assert.deepEqual(f.state, before); assert.deepEqual([...f.values.entries()], journals);
    assert.deepEqual([...f.idb.rows().entries()], records); assert.equal(f.held.size, 0); noGeneric(f);
  }
});

test("cancelled history grants no business capture, dispatch, apply or successor authority", async () => {
  const f = await fixture(); await f.capture(); const recovery = await dialog(f); await recovery.stop();
  const before = copy(f.state), raw = f.values.get(commandKey(f)), api = f.api();
  await assert.rejects(api.captureAdminTemplatePhotoTreeCopyForm(f.record, () => true));
  await assert.rejects(api.runAdminTemplatePhotoTreeCopyPlan({ binding: f.binding, layoutId: f.layoutId, operationId: f.id }));
  const facts = await api.adminTemplatePhotoTreeCopyRecoveryRunner(f.binding, f.layoutId).read(f.id);
  await assert.rejects(api.applyAdminTemplatePhotoTreeCopyFormResult(facts, { recovery: true }));
  assert.equal(api.adminTemplatePhotoTreeCopyEligible(f.input), false);
  await assert.rejects(api.submitAdminTemplatePhotoTreeCopyForm(f.input, { isCurrent: () => true, onDurable: () => assert.fail("No new durable capture") }));
  assert.deepEqual(f.state, before); assert.equal(f.values.get(commandKey(f)), raw); assert.equal(f.idb.rows().size, 1);
  assert.equal(f.cancelPosts.length, 1); assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0);
  assert.equal(f.held.size, 0); noOwners(f); noGeneric(f);
});

test("actual cancellation admission rejects actor and own-plan loss after beginWrite before POST", async () => {
  for (const fault of ["actor", "plan"]) {
    const f = await fixture(); await f.capture(); const recovery = await dialog(f);
    f.controls.afterBegin = () => { if (fault === "actor") f.current.actorId = "other-admin"; else f.values.delete(f.planKey); };
    await assert.rejects(recovery.stop()); assert.equal(f.cancelPosts.length, 0); assert.equal(command(f).cancelRequested, true);
    assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0); assert.equal(f.idb.rows().size, 1);
    assert.equal(f.held.size, 0); noOwners(f); noGeneric(f);
  }
});
