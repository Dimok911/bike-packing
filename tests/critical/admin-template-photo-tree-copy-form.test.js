import test from "node:test";
import assert from "node:assert/strict";
import { treeFormFixture } from "../fixtures/admin-template-photo-tree-copy-form-fixture.js";
import { adminTemplatePhotoNamespace } from "../../src/public/admin-template-photo-state.js";
import { withAdminTemplateCapture } from "../../src/sync/admin-template-capture-lease.js";
import { createAdminTemplatePhotoCopyPickerController } from "../../src/app/app-tail-controllers.js";

test("actual tree form allocates once, captures all durable pointers, sends under admission and applies the complete target", async () => {
  const f = await treeFormFixture(), source = structuredClone(adminTemplatePhotoNamespace(f.state, f.input.sourceLayoutId)), privateItem = structuredClone(f.state.items.privateItem);
  assert.equal(f.form().adminTemplatePhotoTreeCopyEligible(f.input), true);
  const result = await f.submit();
  assert.equal(result.state, "committed"); assert.equal(result.applied, true); assert.equal(f.notifications.length, 1); assert.equal(f.allocations.length, 1);
  assert.equal(f.server.stagePosts.length, 4); assert.equal(f.server.savePosts.length, 1);
  assert.equal(f.state.layouts[f.layoutId].adminCausalSource.base.stateRevision, f.record.action.body.base.stateRevision + 1);
  for (const owner of f.record.snapshot.copiedOwners) assert.ok(f.state[owner.entityType === "item" ? "items" : "containers"][owner.localId]);
  assert.deepEqual(adminTemplatePhotoNamespace(f.state, f.input.sourceLayoutId), source); assert.deepEqual(f.state.items.privateItem, privateItem);
  assert.deepEqual(JSON.parse(f.values.get("mirror")).layouts[f.layoutId], f.state.layouts[f.layoutId]); assert.equal(f.held.size, 0);
});

for (const quota of ["plan", "mirror"]) test(`actual ${quota} quota retains the same choice and UUID for a retry with no extra copy`, async () => {
  const f = await treeFormFixture(), before = structuredClone(f.state);
  f.controls.rejectWrite = key => quota === "plan" ? key.startsWith("bike-packing-admin-save-plans-v1:") : key === "mirror";
  await assert.rejects(f.submit(), /Quota/); assert.deepEqual(f.state, before); assert.equal(f.allocations.length, 1); assert.equal(f.notifications.length, 0);
  assert.equal(f.idb.rows().size, 1); assert.equal(f.server.savePosts.length, 0); assert.equal(f.server.stagePosts.length, 0);
  f.controls.rejectWrite = null; assert.equal((await f.submit()).state, "committed");
  assert.equal(f.allocations.length, 1); assert.equal(f.server.savePosts.length, 1); assert.equal(f.held.size, 0);
});

test("actual OFF selection and changed source refuse before new capture or network", async () => {
  const f = await treeFormFixture(); f.flags.tree = false;
  assert.equal(f.form().adminTemplatePhotoTreeCopyEligible(f.input), false); await assert.rejects(f.submit());
  assert.equal(f.allocations.length, 0); assert.equal(f.idb.rows().size, 0); assert.equal(f.server.calls.length, 0);
  f.flags.tree = true; f.formControls.afterBaseline = () => { f.state.containers[f.input.sourceId].name = "Later unsaved source"; };
  await assert.rejects(f.submit()); assert.equal(f.idb.rows().size, 0); assert.equal(f.server.calls.length, 0);
});

test("capture inventory permits only its missing own pointers, never grants a dispatch scope", async () => {
  const f = await treeFormFixture(), api = f.form(), guards = [];
  await withAdminTemplateCapture({ bindings: f.bindings, locks: f.locks }, async captureLease => {
    const proof = { record: f.record, bindings: f.bindings, captureLease, assertCurrent() {} };
    await api.withAdminTemplatePhotoTreeCopyCaptureInventory(proof, scope => { assert.equal(scope.kind, "admin-template-photo-tree-copy-capture-inventory-v1"); guards.push(scope.assertCurrent); });
    await assert.rejects(api.withAdminTemplatePhotoTreeCopyDispatchInventory(proof, () => assert.fail("No durable plan")));
  });
  assert.throws(guards[0]); assert.equal(f.idb.rows().size, 0); assert.equal(f.server.calls.length, 0);
});

test("new identity or foreign reference appearing during baseline read refuses before any durable capture", async () => {
  for (const fault of ["localId", "serverId", "reference"]) {
    const f = await treeFormFixture(), id = f.record.snapshot.copiedOwners[0][fault === "serverId" ? "serverId" : "localId"];
    const mirror = f.values.get("mirror");
    f.formControls.afterBaseline = () => {
      if (fault === "reference") f.state.layouts.private.rootContainerIds = [id];
      else f.state.items[id] = { id, name: "Unrelated new row" };
    };
    await assert.rejects(f.submit()); assert.equal(f.idb.rows().size, 0); assert.equal(f.server.calls.length, 0);
    assert.equal(f.values.has(f.planKey), false); assert.equal(f.values.get("mirror"), mirror); assert.equal(f.notifications.length, 0);
  }
});

test("actual picker hands its own pending state to actual app submit without invalidating the selected form", async () => {
  const f = await treeFormFixture(), api = f.form(), errors = [], durable = [];
  const controller = createAdminTemplatePhotoCopyPickerController({ getSelection: () => f.input, getSession: () => "same-dialog",
    adminTemplatePhotoCopyFormEnabled: () => true, adminTemplatePhotoCopyEligible: () => false,
    adminTemplatePhotoTreeCopyFormEnabled: api.adminTemplatePhotoTreeCopyFormEnabled,
    adminTemplatePhotoTreeCopyEligible: api.adminTemplatePhotoTreeCopyEligible,
    submitAdminTemplatePhotoCopyForm: () => assert.fail("V9 cannot become shell copy"),
    submitAdminTemplatePhotoTreeCopyForm: api.submitAdminTemplatePhotoTreeCopyForm,
    onBusy() {}, onError: error => errors.push(error), onDurable: record => durable.push(record) });
  assert.equal((await controller.save(1)).state, "committed"); assert.deepEqual(errors, []);
  assert.equal(durable.length, 1); assert.equal(f.server.savePosts.length, 1);
});

test("cold OFF lost ACK and committed mirror quota recover the exact original command through GET only", async () => {
  for (const fault of ["ack", "mirror"]) {
    const f = await treeFormFixture();
    if (fault === "ack") { f.controls.loseSave = true; f.controls.hideSave = true; }
    else f.controls.afterRequest = (path, method) => { if (method === "POST" && path.endsWith("/template-operations")) f.controls.rejectWrite = key => key === "mirror"; };
    await assert.rejects(f.submit()); assert.equal(f.server.savePosts.length, 1);
    assert.equal(f.state.layouts[f.layoutId].adminCausalSource.photoTreeCopyPending, f.id);
    f.controls.hideSave = false; f.controls.rejectWrite = null; f.controls.afterRequest = null; f.flags.tree = false;
    const count = f.server.calls.length, result = await f.form().resumeAdminTemplatePhotoTreeCopyForm(f.layoutId);
    assert.equal(result.state, "committed"); assert.ok(f.server.calls.slice(count).every(call => call.method === "GET"));
    assert.equal(f.server.savePosts.length, 1); assert.equal(f.server.stagePosts.length, 4);
    assert.equal(f.state.layouts[f.layoutId].adminCausalSource.photoTreeCopyPending, undefined); assert.equal(f.held.size, 0);
  }
});

test("malformed or foreign-layout tree pointer pauses instead of falling back to the generic flow", async () => {
  const f = await treeFormFixture(); await f.store.capture({ action: f.record.action, snapshot: f.record.snapshot });
  const source = f.state.layouts[f.layoutId].adminCausalSource;
  for (const marker of [false, null, "wrong-id"]) {
    source.photoTreeCopyPending = marker;
    await assert.rejects(f.form().resumeAdminTemplatePhotoTreeCopyForm(f.layoutId));
  }
  source.photoTreeCopyPending = f.id; source.planId = f.id;
  f.state.layouts["other-layout"] = { ...structuredClone(f.state.layouts[f.layoutId]), id: "other-layout" };
  f.modeState.adminPublishedEditLayoutId = "other-layout";
  await assert.rejects(f.form().resumeAdminTemplatePhotoTreeCopyForm("other-layout"), /другой укладке/);
  assert.equal(f.server.calls.length, 0); assert.equal(f.values.has(f.planKey), false);
});

test("submit and cold resume retain their original session across completed capture and network phases", async () => {
  for (const entry of ["submit", "resume"]) for (const phase of ["capture", "run"]) {
    const f = await treeFormFixture(), real = f.form();
    if (entry === "resume") {
      if (phase === "capture") await f.store.capture({ action: f.record.action, snapshot: f.record.snapshot });
      else await real.captureAdminTemplatePhotoTreeCopyForm(f.record, () => true);
    }
    const name = phase === "capture" ? "captureAdminTemplatePhotoTreeCopyForm" : "runAdminTemplatePhotoTreeCopyPlan";
    // Complete the actual phase, including all storage, locks and receipt proof,
    // then switch context before the calling async function receives its result.
    const api = f.form({ [name]: async (...args) => {
      const result = await real[name](...args); f.current.generation += ":new-session"; return result;
    } });
    const task = entry === "submit" ? api.submitAdminTemplatePhotoTreeCopyForm(f.input, { isCurrent: () => true, onDurable() {} })
      : api.resumeAdminTemplatePhotoTreeCopyForm(f.layoutId);
    await assert.rejects(task, /Контекст .*дерева изменился/);
    assert.equal(f.state.layouts[f.layoutId].adminCausalSource.photoTreeCopyPending, f.id);
    assert.deepEqual(JSON.parse(f.values.get("mirror")).layouts[f.layoutId], f.state.layouts[f.layoutId]);
    for (const owner of f.record.snapshot.copiedOwners) assert.equal(f.state[owner.entityType === "item" ? "items" : "containers"][owner.localId], undefined);
    assert.equal(f.server.savePosts.length, phase === "run" ? 1 : 0);
    assert.equal(f.values.has(f.planKey), true); assert.equal(f.idb.rows().size, 1); assert.equal(f.held.size, 0);
  }
});
