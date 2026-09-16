import test from "node:test";
import assert from "node:assert/strict";
import { adminPhotoCreateClientFixture as fixture, copy, hash } from "../fixtures/admin-template-photo-create-client-fixture.js";
import { adminTemplatePhotoCreateSavePlan, adminTemplatePhotoCreateEditorSnapshot } from "../../src/sync/admin-template-photo-create-save-plan.js";
import { adminTemplateDataSourceSnapshot, createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { adminTemplatePhotoSavePlan } from "../../src/sync/admin-template-photo-save-plan.js";
import { adminTemplateIntent } from "../../src/sync/admin-template-protocol.js";
import { createAdminTemplateSaveFlow } from "../../src/public/admin-template-causal-save-flow.js";
import { createAdminTemplateRecovery } from "../../src/public/admin-template-recovery.js";
import { createAdminTemplateStopChoice } from "../../src/public/admin-template-stop-choice.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";

test("V7 freezes the exact create intent and separate candidate, with one original IDB inventory hash", async () => {
  const f = await fixture(), original = copy(f.planInput), { plans } = f.make(), pending = plans.capturePhotoCreate(f.planInput);
  f.planInput.body.photoCreate.fields.name = "Later"; f.planInput.editorSnapshot.payload.items[f.input.snapshot.createdOwner.localId].name = "Later";
  const saved = await pending;
  assert.deepEqual(saved.plan, adminTemplatePhotoCreateSavePlan({ ...original, binding: f.binding })); assert.equal(saved.plan.version, 7);
  assert.equal(saved.plan.recordIntentHash, f.record.intentHash); assert.equal(Object.hasOwn(saved.plan, "photoSnapshot"), false);
  assert.deepEqual(await plans.read(f.id), saved); assert.equal((await plans.run(f.id)).state, "committed");
  assert.equal(f.server.savePosts.length, 1); assert.equal(f.idb.rows().size, 1);
  assert.throws(() => adminTemplateDataSourceSnapshot(saved.plan));
  assert.throws(() => adminTemplatePhotoSavePlan({ ...original, binding: f.binding }));
  assert.throws(() => adminTemplateIntent({ ...f.binding, operationId: f.id, kind: "template.save", body: original.body }));
});

test("own OFF forbids a new plan; known exact V7 capture/read and cancellation survive local quota without another upload", async () => {
  const f = await fixture(), off = f.make({ photoCreateEnabled: false, photoAppendEnabled: false });
  await assert.rejects(off.plans.capturePhotoCreate(f.planInput)); assert.equal(f.values.size, 0);
  const active = f.make(), saved = await active.plans.capturePhotoCreate(f.planInput); await active.client.capture(f.record.action);
  f.controls.quota = true;
  assert.deepEqual(await off.plans.capturePhotoCreate(f.planInput), saved); assert.deepEqual(await off.plans.read(f.id), saved);
  assert.deepEqual((await off.client.capture(f.record.action)).intent, f.intent);
  await assert.rejects(off.plans.cancel(f.id)); assert.equal(f.server.savePosts.length, 0);
  f.controls.quota = false; const result = await off.plans.cancel(f.id);
  assert.equal(result.state, "cancelled"); assert.equal(f.server.stagePosts.length, 0); assert.equal(f.idb.rows().size, 1);
});

test("plan quota retains selected bytes, original IDs and candidate for a same-input retry", async () => {
  const f = await fixture(), original = copy(f.planInput); f.controls.quotaPrefix = "bike-packing-admin-save-plans-v1:";
  await assert.rejects(f.make().plans.capturePhotoCreate(f.planInput)); assert.equal(f.values.size, 0);
  assert.deepEqual(f.planInput, original); assert.equal((await f.store.read(f.id)).intentHash, original.recordIntentHash);
  assert.equal(f.server.calls.length, 0); f.controls.quotaPrefix = null;
  assert.equal((await f.make().plans.capturePhotoCreate(f.planInput)).plan.id, f.id);
});

test("forged V7 candidate/body/hash stays paused even with recomputed outer digest", async () => {
  for (const mode of ["candidate", "hash", "body", "missing-binary", "corrupt-bytes"]) {
    const f = await fixture(), { plans } = f.make(), saved = await plans.capturePhotoCreate(f.planInput);
    const key = [...f.values.keys()][0];
    if (mode === "candidate") saved.plan.editorSnapshot.payload.items[f.input.snapshot.createdOwner.localId].name = "Not submitted";
    if (mode === "body") saved.plan.operations[0].body.photoCreate.fields.name = "Not captured";
    if (mode === "hash") saved.plan.recordIntentHash = hash("different inventory");
    if (mode === "missing-binary") f.idb.rows().clear();
    if (mode === "corrupt-bytes") { const row = [...f.idb.rows().values()][0]; new Uint8Array(row.files[0].file)[0] ^= 1; }
    saved.digest = hash(saved.plan); f.values.set(key, JSON.stringify(saved));
    await assert.rejects(plans.read(f.id)); await assert.rejects(plans.run(f.id)); await assert.rejects(plans.cancel(f.id));
    assert.equal(f.server.calls.length, 0);
  }
});

test("create cannot overtake a retained base or become an ordinary UUID predecessor", async () => {
  for (const first of ["create", "ordinary"]) {
    const f = await fixture(), { plans } = f.make();
    const ordinary = { operationId: crypto.randomUUID(), base: { stateRevision: 7 }, exists: true, visibility: "private",
      payload: copy(f.intent.body.payload), metadata: copy(f.intent.body.metadata) };
    if (first === "ordinary") { await plans.capture(ordinary); await assert.rejects(plans.capturePhotoCreate(f.planInput)); }
    else {
      await plans.capturePhotoCreate(f.planInput); await assert.rejects(plans.capture(ordinary));
      ordinary.base = { operationId: f.id }; await assert.rejects(plans.capture(ordinary));
    }
    assert.equal((await plans.list()).length, 1); assert.equal(f.server.calls.length, 0);
  }
});

test("scope change during required IDB proof prevents V7 capture/read and all client dispatch", async () => {
  const f = await fixture(), photoStore = { binding: f.binding, async read(id) { const value = await f.store.read(id); f.current.generation = "new"; return value; } };
  await assert.rejects(f.make({ photoStore }).plans.capturePhotoCreate(f.planInput));
  assert.equal(f.values.size, 0); assert.equal(f.server.calls.length, 0);
});

async function flowFixture(options = {}) {
  const f = await fixture(), state = copy(f.record.snapshot.state), layoutId = f.record.snapshot.layoutId, layout = state.layouts[layoutId];
  const applied = [], generic = [], controls = { apply: true, persist: true };
  const { plans } = f.make(); await plans.capturePhotoCreate(f.planInput);
  const snapshot = () => adminTemplatePhotoCreateEditorSnapshot({ snapshot: { state, metadata: f.record.snapshot.metadata } });
  const makeFlow = extra => createAdminTemplateSaveFlow({ enabled: true, getLayout: () => layout, getContext: () => f.current, plansFor: () => plans,
    snapshot, persist: () => { generic.push(copy(layout)); return controls.persist; }, applyPhotoCreateResult(id, value) {
      applied.push({ id, ...copy(value) }); if (!controls.apply) return false;
      layout.adminCausalSource = copy(value.source); delete layout.templateDraftSyncPending; return true;
    }, ...extra });
  return { ...f, state, layoutId, layout, applied, generic, controls: { ...f.controls, flow: controls }, serverControls: f.controls, plans, snapshot, makeFlow };
}

test("cold V7 recovery restores the marker and uses only the explicit atomic create callback", async () => {
  const f = await flowFixture(), flow = f.makeFlow();
  assert.deepEqual(await flow.recover(f.layoutId), { state: "pending" }); assert.equal(f.layout.adminCausalSource.photoCreatePending, f.id);
  await assert.rejects(flow.capture(f.layoutId)); await assert.rejects(flow.captureCommand(f.layoutId, { kind: "template.archive" }));
  const genericBefore = f.generic.length; assert.equal((await flow.flush(f.layoutId)).applied, true);
  assert.equal(f.applied.length, 1); assert.deepEqual(f.applied[0].receipt, f.receipt);
  assert.equal(f.generic.length, genericBefore); assert.equal(f.layout.adminCausalSource.base.stateRevision, 8);
  assert.equal(Object.hasOwn(f.layout.adminCausalSource, "photoCreatePending"), false);
});

test("missing callback or its persistence failure preserves the V7 candidate; exact receipt can be applied after retry", async () => {
  for (const missing of [true, false]) {
    const f = await flowFixture(); await f.makeFlow().recover(f.layoutId); const before = copy(f.layout);
    f.controls.flow.apply = false;
    await assert.rejects(f.makeFlow(missing ? { applyPhotoCreateResult: null } : {}).flush(f.layoutId));
    assert.deepEqual(f.layout, before); assert.equal(f.server.savePosts.length, 1);
    f.controls.flow.apply = true; assert.equal((await f.makeFlow().flush(f.layoutId)).applied, true);
    assert.equal(f.server.savePosts.length, 1);
  }
});

test("changed visible fields after save await cannot adopt the older create receipt", async () => {
  const f = await flowFixture(), flow = f.makeFlow(); await flow.recover(f.layoutId);
  f.serverControls.afterRequest = path => { if (path.endsWith("/template-operations")) f.state.items[f.input.snapshot.createdOwner.localId].name = "Changed during request"; };
  const result = await flow.flush(f.layoutId); assert.equal(result.applied, false); assert.equal(f.applied.length, 0);
  assert.equal(f.layout.adminCausalSource.photoCreatePending, f.id);
});

test("quota during cold marker recovery rolls back only its pointer and leaves the complete original record recoverable", async () => {
  const f = await flowFixture(), before = copy(f.layout); f.controls.flow.persist = false;
  await assert.rejects(f.makeFlow().recover(f.layoutId)); assert.deepEqual(f.layout, before);
  assert.equal((await f.store.read(f.id)).intentHash, f.record.intentHash); assert.equal(f.server.calls.length, 0);
  f.controls.flow.persist = true;
  assert.equal((await f.makeFlow().recover(f.layoutId)).state, "pending");
});

test("stopped V7 forbids local fileless replay and can explicitly adopt the server without another save", async () => {
  const f = await flowFixture(), { client } = f.make(); await client.capture(f.record.action); await f.makeFlow().recover(f.layoutId);
  const recovery = createAdminTemplateRecovery({ binding: f.binding, getContext: () => f.current, plans: f.plans, client,
    storage: f.storage, locks: f.locks, enabled: true });
  await recovery.captureStop(f.id, f.snapshot()); await recovery.resumeStop(f.id);
  const server = { ok: true, ...f.binding, exists: true, deleted: false, stateRevision: 7, visibility: "private", indexes: [],
    payload: copy(f.intent.body.payload), metadata: copy(f.intent.body.metadata) };
  const choice = createAdminTemplateStopChoice({ binding: f.binding, layoutId: f.layoutId, priorPlanId: f.id, getContext: () => f.current,
    getSource: () => f.layout.adminCausalSource, snapshot: f.snapshot, client: { ...client, prepare: async () => copy(server) }, plans: f.plans, recovery,
    storage: f.storage, locks: f.locks, enabled: true,
    projectServer: (source, id) => projectAdminTemplateServerVariant(f.layout, source, id, { photoBinding: f.binding, photoOwnerMapEnabled: true }) });
  const opened = await choice.open(); assert.equal(typeof opened.localUnavailableReason, "string");
  await assert.rejects(choice.choose(opened)); assert.equal([...f.values.keys()].some(key => key.startsWith("bike-packing-admin-stop-choice-v1:")), false);
  await choice.choose(opened, { variant: "server" }); const result = await choice.resume();
  assert.equal(result.serverAdoption.source.base.stateRevision, 7); assert.equal(result.serverAdoption.source.planId, null);
  assert.equal(f.server.savePosts.length, 1); assert.equal(f.server.savePosts[0].path.endsWith("/cancel"), true);
  assert.equal(f.server.stagePosts.length, 0); assert.equal((await f.store.read(f.id)).intentHash, f.record.intentHash);
});

test("losing the binary record during client capture or after commit prevents the V7 runner from returning an adoptable result", async () => {
  for (const phase of ["capture", "commit"]) {
    const f = await fixture(), active = f.make(); await active.plans.capturePhotoCreate(f.planInput);
    const client = phase === "capture" ? { ...active.client, async capture(action) { const value = await active.client.capture(action); f.idb.rows().clear(); return value; } } : active.client;
    if (phase === "commit") f.controls.afterRequest = path => { if (path.endsWith("/template-operations")) f.idb.rows().clear(); };
    const plans = createAdminTemplateSavePlans({ binding: f.binding, getContext: () => f.current, photoStore: f.store, client,
      storage: f.storage, locks: f.locks, enabled: true, photoCreateEnabled: true });
    await assert.rejects(plans.run(f.id)); assert.equal(f.server.savePosts.length, phase === "commit" ? 1 : 0);
    await assert.rejects(plans.read(f.id));
  }
});

test("V7 own OFF blocks a queued run even if its supplied client is enabled, but permits known terminal inspection", async () => {
  const f = await fixture(), active = f.make(); await active.plans.capturePhotoCreate(f.planInput);
  const plans = createAdminTemplateSavePlans({ binding: f.binding, getContext: () => f.current, photoStore: f.store, client: active.client,
    storage: f.storage, locks: f.locks, enabled: true, photoCreateEnabled: false });
  await assert.rejects(plans.run(f.id)); assert.equal(await active.client.read(f.id), null); assert.equal(f.server.calls.length, 0);
  await active.client.capture(f.record.action); await assert.rejects(plans.run(f.id)); assert.equal(f.server.calls.length, 0);
  assert.equal((await active.plans.run(f.id)).state, "committed");
  assert.equal((await plans.run(f.id)).state, "committed"); assert.equal(f.server.savePosts.length, 1);
});
