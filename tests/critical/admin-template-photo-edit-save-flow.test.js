import test from "node:test";
import assert from "node:assert/strict";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { createAdminTemplateSaveFlow } from "../../src/public/admin-template-causal-save-flow.js";
import { adminTemplatePhotoEditorSnapshot } from "../../src/public/admin-template-photo-state.js";
import { adminPhotoEditFixture, photoEditStorage, copy } from "../fixtures/admin-template-photo-edit-fixture.js";

const blocked = { code: "admin-template-ui-paused", isAdminTemplateBlocked: true };
function fixture() {
  const f = adminPhotoEditFixture(), persistence = photoEditStorage(), state = copy(f.input.photoSnapshot.state), layout = state.layouts[f.layoutId];
  const context = { ...f.binding, scope: "admin-template", admin: true, generation: "one" };
  const applied = [], generic = [], notifications = [], dispatched = [];
  const controls = { apply: true, afterRun: null, receipt: copy(f.receipt) };
  const client = { async capture(input) { dispatched.push(copy(input)); }, async run() { await controls.afterRun?.(); return copy(controls.receipt); } };
  const plans = createAdminTemplateSavePlans({ binding: f.binding, getContext: () => context, client, ...persistence, enabled: true });
  const snapshot = () => adminTemplatePhotoEditorSnapshot(state, f.layoutId, f.metadata);
  const make = () => createAdminTemplateSaveFlow({ getLayout: id => id === f.layoutId ? layout : null, getContext: () => context,
    snapshot, plansFor: () => plans, enabled: true, persist: () => { generic.push(copy(layout)); return true; },
    notify: status => notifications.push(status), applyPhotoEditResult(id, input) {
      applied.push({ id, ...copy(input) });
      if (controls.apply === "throw") throw Error("Atomic mirror unavailable");
      if (!controls.apply) return false;
      layout.adminCausalSource = copy(input.source); delete layout.templateDraftSyncPending; layout.templateDraftServerHydrated = true;
      return true;
    } });
  const capture = () => plans.capturePhotoEdit(f.input);
  const pending = () => { layout.adminCausalSource = { ...layout.adminCausalSource, planId: f.action.operationId,
    base: { operationId: f.action.operationId }, photoEditPending: f.action.operationId }; layout.templateDraftSyncPending = true; };
  return { ...f, ...persistence, state, layout, context, controls, applied, generic, notifications, dispatched, plans, snapshot, make, capture, pending };
}

test("v6 adoption passes the exact durable selection and receipt to the atomic callback without a second generic write", async () => {
  const f = fixture(), saved = await f.capture(); f.pending(); const result = await f.make().flush(f.layoutId);
  assert.equal(result.state, "committed"); assert.equal(result.applied, true); assert.equal(f.applied.length, 1);
  assert.deepEqual(f.applied[0].plan, saved.plan); assert.deepEqual(f.applied[0].receipt, f.receipt);
  assert.deepEqual(f.layout.adminCausalSource.base, { stateRevision: 8 }); assert.equal(f.layout.adminCausalSource.planId, null);
  assert.equal(Object.hasOwn(f.layout.adminCausalSource, "photoEditPending"), false);
  assert.equal(f.generic.length, 0); assert.deepEqual(f.notifications, ["committed"]);
  assert.deepEqual(await f.make().flush(f.layoutId), { state: "idle" }); assert.equal(f.applied.length, 1);
});

test("cold candidate recovery restores the v6 pending marker and blocks every generic save or command", async () => {
  const f = fixture(); await f.capture(); const flow = f.make();
  assert.deepEqual(await flow.recover(f.layoutId), { state: "pending" });
  assert.equal(f.layout.adminCausalSource.photoEditPending, f.action.operationId);
  assert.equal(f.layout.adminCausalSource.planId, f.action.operationId);
  await assert.rejects(flow.capture(f.layoutId), blocked);
  for (const command of [{ kind: "template.metadata", metadata: { title: "Other", language: "ru" } },
    { kind: "template.publication", published: true }, { kind: "template.archive" }, { kind: "template.delete" }]) await assert.rejects(flow.captureCommand(f.layoutId, command), blocked);
  assert.equal((await f.plans.list()).length, 1); assert.equal(f.dispatched.length, 0);
});

test("a failed atomic callback retains the original selected form and permits exact same-plan retry", async () => {
  for (const failure of [false, "throw"]) {
    const f = fixture(); await f.capture(); f.pending(); const before = copy(f.layout); f.controls.apply = failure;
    await assert.rejects(f.make().flush(f.layoutId)); assert.deepEqual(f.layout, before); assert.equal(f.generic.length, 0);
    assert.deepEqual(f.notifications, []); f.controls.apply = true;
    assert.equal((await f.make().flush(f.layoutId)).applied, true);
    assert.equal(f.dispatched.length, 2); assert.deepEqual(f.dispatched[0], f.dispatched[1]);
  }
});

test("newer visible fields or an operation pointer after await cannot be overwritten by the old edit receipt", async () => {
  for (const mode of ["field", "pointer"]) {
    const f = fixture(); await f.capture(); f.pending();
    f.controls.afterRun = () => {
      if (mode === "field") f.state.items["local-item"].name = "New edit";
      else f.layout.adminCausalSource.planId = crypto.randomUUID();
    };
    const result = await f.make().flush(f.layoutId); assert.equal(result.state, "committed"); assert.equal(result.applied, false);
    assert.equal(f.applied.length, 0); assert.equal(f.generic.length, 0); assert.equal(f.layout.templateDraftSyncPending, true);
  }
});

test("rejected and mismatched receipts preserve the v6 selection without adoption", async () => {
  for (const mode of ["rejected", "id", "revision"]) {
    const f = fixture(); await f.capture(); f.pending(); const before = copy(f.layout);
    if (mode === "rejected") { f.controls.receipt.operation.state = "rejected"; f.controls.receipt.result = { status: 409, payload: { ok: false, code: "template_stale_base" } }; }
    else if (mode === "id") f.controls.receipt.operation.id = crypto.randomUUID();
    else delete f.controls.receipt.result.payload.stateRevision;
    if (mode === "rejected") assert.equal((await f.make().flush(f.layoutId)).state, "rejected"); else await assert.rejects(f.make().flush(f.layoutId), blocked);
    assert.deepEqual(f.layout, before); assert.equal(f.applied.length, 0); assert.equal(f.generic.length, 0);
  }
});

test("an ordinary edit in another tab is captured beside a retained v6 without recovering the competing photo view", async () => {
  const f = fixture(), photo = await f.capture();
  f.state.items = copy(f.input.photoSnapshot.beforeState.items);
  f.state.items["local-item"].name = "Other tab ordinary edit";
  const ordinarySnapshot = f.snapshot(), result = await f.make().capture(f.layoutId);
  assert.notEqual(result.operationId, f.action.operationId);
  assert.equal(f.layout.adminCausalSource.planId, result.operationId); assert.equal(f.layout.adminCausalSource.photoEditPending, undefined);
  const rows = await f.plans.list(); assert.equal(rows.length, 2);
  assert.deepEqual(rows.find(row => row.plan.id === f.action.operationId), photo);
  const ordinary = rows.find(row => row.plan.id === result.operationId);
  assert.equal(ordinary.plan.version, 1); assert.deepEqual(ordinary.plan.operations[0].body.payload, ordinarySnapshot.payload);
  assert.equal(f.state.items["local-item"].name, "Other tab ordinary edit");
  assert.deepEqual(f.state.items["local-item"].photos, f.input.photoSnapshot.beforeState.items["local-item"].photos);
  assert.equal(f.applied.length, 0); assert.equal(f.dispatched.length, 0);
  assert.deepEqual(await f.make().recover(f.layoutId), { state: "pending" });
  assert.equal(f.layout.adminCausalSource.planId, result.operationId);
});

test("actor/context changes during client execution cannot apply the receipt in the new editor context", async () => {
  const f = fixture(); await f.capture(); f.pending(); f.controls.afterRun = () => { f.context.generation = "changed"; };
  await assert.rejects(f.make().flush(f.layoutId)); assert.equal(f.applied.length, 0); assert.equal(f.generic.length, 0);
  assert.equal(f.layout.adminCausalSource.planId, f.action.operationId);
});
