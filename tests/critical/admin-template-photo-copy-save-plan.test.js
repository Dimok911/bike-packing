import test from "node:test";
import assert from "node:assert/strict";
import { adminPhotoCopyClientFixture as fixture, copy, hash } from "../fixtures/admin-template-photo-copy-client-fixture.js";
import { adminTemplatePhotoCopySavePlan, adminTemplatePhotoCopyEditorSnapshot, assertAdminTemplatePhotoCopyPlanRecord } from "../../src/sync/admin-template-photo-copy-save-plan.js";
import { createAdminTemplateSavePlans, adminTemplateDataSourceSnapshot } from "../../src/sync/admin-template-save-plan.js";
import { adminTemplateIntent, canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";

const prefix = "bike-packing-admin-save-plans-v1:";
const input = f => ({ operationId: f.id, body: copy(f.record.action.body), editorSnapshot: adminTemplatePhotoCopyEditorSnapshot(f.record), recordIntentHash: f.record.intentHash });
const rows = f => [...f.values.keys()].filter(key => key.startsWith(prefix));
const noPosts = f => { assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0); };
function make(f, options = {}) {
  const copyClient = f.make().client, ordinaryCalls = [];
  const ordinary = Object.fromEntries(["capture", "read", "run", "cancel", "inspect"].map(key => [key, () => { ordinaryCalls.push(key); throw Error("Wrong ordinary client"); }]));
  const plans = createAdminTemplateSavePlans({ binding: f.binding, getContext: () => f.current, client: ordinary,
    photoCopyStore: f.store, photoCopyClient: copyClient, photoCopyEnabled: true, enabled: true,
    storage: f.storage, locks: f.locks, ...options });
  return { plans, copyClient, ordinaryCalls };
}

for (const entityType of ["item", "container"]) test(`V8 ${entityType}: freezes exact target-before and uses only real copy client with the retained record`, async () => {
  const f = await fixture({ entityType }), request = input(f), original = copy(request), { plans, ordinaryCalls } = make(f);
  const pending = plans.capturePhotoCopy(request);
  request.body.photoCopy.fields.name = "Changed later"; request.editorSnapshot.payload.items = {};
  const saved = await pending;
  assert.deepEqual(saved.plan, adminTemplatePhotoCopySavePlan({ ...original, binding: f.binding }));
  assert.equal(saved.plan.version, 8); assert.equal(Object.hasOwn(saved.plan, "photoSnapshot"), false);
  assert.deepEqual(await plans.read(f.id), saved); assert.deepEqual((await plans.list())[0], saved);
  assert.equal(Object.hasOwn(saved.plan.editorSnapshot.payload.items, f.record.snapshot.copiedOwner.localId), false);
  const result = await plans.run(f.id);
  assert.equal(result.state, "committed"); assert.deepEqual(result.receipts, [f.receipt]);
  assert.equal(f.server.stagePosts.length, 2); assert.equal(f.server.savePosts.length, 1); assert.deepEqual(ordinaryCalls, []);
  assert.deepEqual(await make(f).plans.run(f.id), result); assert.equal(f.server.savePosts.length, 1);
  assert.throws(() => adminTemplateDataSourceSnapshot(saved.plan));
  assert.throws(() => adminTemplateIntent({ ...f.binding, ...f.record.action }));
});

test("V8 plan quota retains the original IDB selection and permits only a same-input retry", async () => {
  const f = await fixture(), request = input(f), original = copy(request), { plans } = make(f);
  f.controls.rejectWrite = key => key.startsWith(prefix);
  await assert.rejects(plans.capturePhotoCopy(request)); assert.equal(rows(f).length, 0);
  assert.equal((await f.store.read(f.id)).intentHash, request.recordIntentHash); assert.deepEqual(request, original); noPosts(f);
  f.controls.rejectWrite = null; assert.equal((await plans.capturePhotoCopy(request)).plan.id, f.id);
});

test("V8 rejects forged body/hash/target-before/version and missing or corrupt source proof even with recomputed journal digest", async () => {
  for (const fault of ["body", "hash", "target", "version", "missing", "source-proof"]) {
    const f = await fixture(), { plans } = make(f), saved = await plans.capturePhotoCopy(input(f)), key = rows(f)[0];
    if (fault === "body") saved.plan.operations[0].body.photoCopy.fields.name = "Different action";
    if (fault === "hash") saved.plan.recordIntentHash = hash("different record");
    if (fault === "target") saved.plan.editorSnapshot.payload.locations = ["different raw dictionary"];
    if (fault === "version") saved.plan.version = 7;
    if (fault === "missing") f.idb.rows().clear();
    if (fault === "source-proof") {
      const record = [...f.idb.rows().values()][0], decoded = JSON.parse(record.intentJson);
      Object.values(decoded.snapshot.source.beforeState.items)[0].name = "Unsent source change";
      // Even a self-consistent encoded hash cannot replace the actual source proof.
      record.intentJson = canonicalTemplateJson(decoded); record.intentHash = hash(decoded);
    }
    saved.digest = hash(saved.plan); f.values.set(key, JSON.stringify(saved));
    for (const method of ["read", "run", "cancel"]) await assert.rejects(plans[method](f.id));
    noPosts(f);
  }
});

test("V8 re-prepares a supplied decoded record instead of trusting its advertised intentHash", async () => {
  const f = await fixture(), plan = adminTemplatePhotoCopySavePlan({ ...input(f), binding: f.binding });
  for (const fault of ["source", "target", "stages", "extra"]) {
    const record = copy(f.record);
    if (fault === "source") Object.values(record.snapshot.source.beforeState.items)[0].name = "Changed";
    if (fault === "target") record.snapshot.target.beforeState.packedItems = { alien: true };
    if (fault === "stages") record.stages[0].target.entityId = "different";
    if (fault === "extra") record.receipt = f.receipt;
    await assert.rejects(assertAdminTemplatePhotoCopyPlanRecord(plan, { binding: f.binding, read: async () => record }));
  }
  noPosts(f);
});

test("V8 own OFF allows exact reads under quota and GET-only reconciliation of a locally unknown committed copy", async () => {
  const f = await fixture(), active = make(f); await active.plans.capturePhotoCopy(input(f));
  f.controls.loseSave = true; f.controls.hideSave = true;
  await assert.rejects(active.plans.run(f.id)); assert.equal(f.server.savePosts.length, 1);
  assert.equal((await active.copyClient.read(f.id)).receipt, null);
  f.controls.hideSave = false;
  const forbidden = () => { throw Error("OFF cannot dispatch or capture"); };
  const off = make(f, { photoCopyEnabled: false, photoCopyClient: { ...active.copyClient, capture: forbidden, run: forbidden } });
  const result = await off.plans.run(f.id); assert.equal(result.state, "committed"); assert.deepEqual(result.receipts, [f.receipt]);
  assert.equal(f.server.savePosts.length, 1); assert.equal(f.server.stagePosts.length, 2);
  f.controls.quota = true;
  assert.deepEqual(await off.plans.capturePhotoCopy(input(f)), await off.plans.read(f.id));
  assert.deepEqual(await off.plans.run(f.id), result);
});

test("V8 own OFF forbids new plan and cannot resolve missing or still-unknown commands by dispatching", async () => {
  const f = await fixture(), off = make(f, { photoCopyEnabled: false });
  await assert.rejects(off.plans.capturePhotoCopy(input(f))); assert.equal(rows(f).length, 0);
  const active = make(f); await active.plans.capturePhotoCopy(input(f));
  await assert.rejects(off.plans.run(f.id)); assert.equal(f.server.calls.length, 0);
  await active.copyClient.capture(f.record.action);
  await assert.rejects(off.plans.run(f.id)); noPosts(f);
});

test("V8 cancellation pauses before client capture if no explicit copy cancel exists; supplied cancel uses the same record and UUID even OFF", async () => {
  const f = await fixture(), active = make(f); await active.plans.capturePhotoCopy(input(f));
  const { cancel: unusedCancel, ...withoutCancel } = active.copyClient;
  await assert.rejects(make(f, { photoCopyClient: withoutCancel }).plans.cancel(f.id));
  assert.equal(await active.copyClient.read(f.id), null); noPosts(f);
  await active.copyClient.capture(f.record.action);
  const ids = [], receipt = { operation: { ...copy(f.receipt.operation), state: "rejected" }, result: { status: 409, payload: { ok: false, code: "operation_cancelled" } } };
  const off = make(f, { photoCopyEnabled: false, photoCopyClient: { ...active.copyClient, cancel: async id => { ids.push(id); return receipt; } } });
  assert.equal((await off.plans.cancel(f.id)).state, "cancelled"); assert.deepEqual(ids, [f.id]); noPosts(f);
  assert.equal((await f.store.read(f.id)).intentHash, f.record.intentHash);
});

test("V8 rejects missing/foreign client bindings before any method can act", async () => {
  for (const binding of [undefined, "actor", "target"]) {
    const f = await fixture(), active = make(f); await active.plans.capturePhotoCopy(input(f)); const called = [];
    const bad = { ...active.copyClient, binding: binding === undefined ? undefined : { ...f.binding, [binding === "actor" ? "actorId" : "listId"]: "foreign" },
      capture: async () => called.push("capture"), read: async () => called.push("read") };
    for (const enabled of [true, false]) await assert.rejects(make(f, { photoCopyClient: bad, photoCopyEnabled: enabled }).plans.run(f.id));
    assert.deepEqual(called, []); noPosts(f);
  }
});

test("V8 cannot overtake ordinary/upload plans at its base and cannot be their pending predecessor", async () => {
  for (const type of ["ordinary", "upload"]) for (const first of ["copy", "other"]) {
    const f = await fixture(), { plans } = make(f);
    const ordinary = { operationId: crypto.randomUUID(), base: copy(f.intent.body.base), exists: true, visibility: "private",
      payload: copy(f.intent.body.payload), metadata: copy(f.intent.body.metadata) };
    const upload = { operationId: crypto.randomUUID(), body: { ...copy(f.intent.body), photoAppend: { version: 1, assets: [{
      assetId: crypto.randomUUID(), assetDigest: hash("upload"), entityType: "item", entityId: "old-item", photoId: "upload-new"
    }] } }, editorSnapshot: copy(input(f).editorSnapshot) }; delete upload.body.photoCopy;
    const other = () => type === "ordinary" ? plans.capture(ordinary) : plans.capturePhoto(upload);
    if (first === "copy") {
      await plans.capturePhotoCopy(input(f)); await assert.rejects(other);
      ordinary.base = { operationId: f.id }; await assert.rejects(plans.capture(ordinary));
    } else { await other(); await assert.rejects(plans.capturePhotoCopy(input(f))); }
    assert.equal((await plans.list()).length, 1); noPosts(f);
  }
});

test("V8 honors only explicit adopted-plan exclusions and never treats its cancel marker as an exclusion", async () => {
  const f = await fixture(), original = make(f); await original.plans.capturePhotoCopy(input(f));
  const ordinary = { operationId: crypto.randomUUID(), base: copy(f.intent.body.base), exists: true, visibility: "private",
    payload: copy(f.intent.body.payload), metadata: copy(f.intent.body.metadata) };
  const { cancel: unusedCancel, ...withoutCancel } = original.copyClient;
  await assert.rejects(make(f, { photoCopyClient: withoutCancel }).plans.cancel(f.id));
  await assert.rejects(original.plans.capture(ordinary));
  await make(f, { getExcludedPlans: async () => [f.id] }).plans.capture(ordinary);
  assert.equal(rows(f).length, 2); assert.equal((await f.store.read(f.id)).intentHash, f.record.intentHash); noPosts(f);
});

test("V8 context changes while loading its record block capture and leave no plan", async () => {
  const f = await fixture(), photoCopyStore = { binding: f.binding, async read(id) { const row = await f.store.read(id); f.current.generation = "changed"; return row; } };
  await assert.rejects(make(f, { photoCopyStore }).plans.capturePhotoCopy(input(f)));
  assert.equal(rows(f).length, 0); noPosts(f);
});

test("V8 record removal after client capture/commit/GET prevents an adoptable result", async () => {
  for (const phase of ["capture", "commit", "inspect"]) {
    const f = await fixture(), active = make(f); await active.plans.capturePhotoCopy(input(f));
    if (phase === "capture") {
      const client = { ...active.copyClient, async capture(action) { const row = await active.copyClient.capture(action); f.idb.rows().clear(); return row; } };
      await assert.rejects(make(f, { photoCopyClient: client }).plans.run(f.id)); noPosts(f);
    } else if (phase === "commit") {
      f.controls.afterRequest = (path, method) => { if (path.endsWith("/template-operations") && method === "POST") f.idb.rows().clear(); };
      await assert.rejects(active.plans.run(f.id)); assert.equal(f.server.savePosts.length, 1);
    } else {
      await active.copyClient.capture(f.record.action); f.server.saved = copy(f.receipt); f.stages.forEach(stage => f.server.stages.set(stage.receipt.manifest.operationId, stage));
      const client = { ...active.copyClient, async inspect(id) { const receipt = await active.copyClient.inspect(id); f.idb.rows().clear(); return receipt; } };
      await assert.rejects(make(f, { photoCopyEnabled: false, photoCopyClient: client }).plans.run(f.id)); noPosts(f);
    }
    await assert.rejects(active.plans.read(f.id));
  }
});
