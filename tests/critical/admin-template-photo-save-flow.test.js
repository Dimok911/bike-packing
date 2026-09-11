import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createAdminTemplateSavePlans, adminTemplateDataSourceSnapshot } from "../../src/sync/admin-template-save-plan.js";
import { createAdminTemplateSaveFlow } from "../../src/public/admin-template-causal-save-flow.js";
import { adminTemplatePhotoEditorSnapshot } from "../../src/public/admin-template-photo-state.js";
import { adminTemplateIntent, canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminPhotoRecordFixture } from "../fixtures/admin-template-photo-record-fixture.js";

const paused = { code: "admin-template-plan-paused", isAdminTemplateBlocked: true };
const blocked = { code: "admin-template-ui-paused", isAdminTemplateBlocked: true };
const clone = value => structuredClone(value);
const hash = value => createHash("sha256").update(canonicalTemplateJson(value)).digest("hex");

async function fixture() {
  const original = await adminPhotoRecordFixture(), { binding, action, snapshot: selected } = original;
  const state = clone(selected.state), metadata = clone(selected.metadata), layoutId = selected.layoutId, layout = state.layouts[layoutId];
  const context = { ...binding, scope: "admin-template", admin: true, generation: "selected-form" };
  const values = new Map(), intents = new Map(), calls = [], notifications = [], applied = [], persisted = [], genericPersisted = [];
  const controls = { storageDrop: false, storageFail: false, persist: true, apply: true, afterRun: null, receiptMode: "committed" };
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem(key, value) {
      if (controls.storageFail) throw Error("Plan storage unavailable");
      if (!controls.storageDrop) values.set(key, value);
    } };
  const tails = new Map(), locks = { request(key, task) {
    const next = (tails.get(key) || Promise.resolve()).catch(() => {}).then(task); tails.set(key, next); return next;
  } };
  const intent = adminTemplateIntent({ ...binding, ...action }), { id, body: _body, ...identity } = intent;
  const { id: _id, ...digestInput } = intent, confirmedPayload = clone(action.body.payload);
  const added = action.body.photoAppend.assets.map((asset, index) => {
    const photo = { id: asset.photoId, photoId: asset.photoId, assetId: asset.assetId, listId: binding.listId, status: "synced",
      url: `https://example.test/bike-packing/lists/${binding.listId}/photos/${asset.photoId}/file`,
      thumbUrl: `https://example.test/bike-packing/lists/${binding.listId}/photos/${asset.photoId}/thumb`,
      fileName: original.files[index].stage.file.fileName, type: original.files[index].file.type,
      size: original.files[index].file.size, width: null, height: null };
    confirmedPayload.items[asset.entityId].photos.push(photo);
    const { photoId: _photoId, ...reference } = asset; return { ...reference, photo };
  });
  const receipt = { operation: { id, ...identity, payloadDigest: hash(digestInput), state: "committed" }, result: { status: 200, payload: {
    ok: true, listId: binding.listId, itemKey: binding.itemKey, stateRevision: 8, visibility: "private", indexes: [],
    photoAppend: { version: 1, ownerId: "template-owner", added, confirmedPayload, confirmedPayloadDigest: hash(confirmedPayload) }
  } } };
  // This is the already-validated client boundary. Stage/file and full receipt
  // validation use their real clients in the adjacent photo-client test suite.
  const client = { async capture(input) {
    const previous = intents.get(input.operationId);
    if (previous) assert.deepEqual(input, previous); else intents.set(input.operationId, clone(input));
    calls.push({ kind: "capture", id: input.operationId });
  }, async run(operationId) {
    assert.equal(operationId, action.operationId); calls.push({ kind: "run", id: operationId });
    const result = clone(receipt);
    if (controls.receiptMode === "rejected") {
      result.operation.state = "rejected"; result.result = { status: 409, payload: { ok: false, code: "template_photo_asset_not_ready" } };
    }
    if (controls.receiptMode === "wrong-id") result.operation.id = crypto.randomUUID();
    if (controls.receiptMode === "missing-revision") delete result.result.payload.stateRevision;
    await controls.afterRun?.(); return result;
  } };
  const plans = extra => createAdminTemplateSavePlans({ binding, client, getContext: () => context, storage, locks, enabled: true, ...extra });
  const snapshot = () => adminTemplatePhotoEditorSnapshot(state, layoutId, metadata);
  const capture = () => plans().capturePhoto({ operationId: action.operationId, body: action.body, editorSnapshot: snapshot() });
  const pending = () => {
    layout.adminCausalSource = { ...layout.adminCausalSource, planId: action.operationId,
      base: { operationId: action.operationId }, photoAppendPending: action.operationId };
    layout.templateDraftSyncPending = true;
  };
  const make = () => createAdminTemplateSaveFlow({ getLayout: selectedId => selectedId === layoutId ? layout : null,
    getContext: () => context, snapshot, plansFor: () => plans(), enabled: true,
    applyPhotoResult(selectedId, input) {
      applied.push({ selectedId, ...clone(input) });
      if (!controls.apply) return false;
      // The application adoption callback owns one atomic projection/persist.
      // Model its commit point: failed persistence leaves the live view intact.
      const next = clone(layout); next.adminCausalSource = clone(input.source);
      next.templatePublished = input.receipt.result.payload.visibility === "public";
      next.templateDraftServerHydrated = true; delete next.templateDraftSyncPending;
      persisted.push(clone(next));
      if (controls.persist === "throw") throw Error("Photo adoption persistence failed");
      if (controls.persist === false) return false;
      for (const key of Object.keys(layout)) delete layout[key];
      Object.assign(layout, next);
      return true;
    }, persist() {
      genericPersisted.push(clone(layout));
      if (controls.persist === "throw") throw Error("Editor persistence failed");
      return controls.persist;
    }, notify: status => notifications.push(status) });
  return { original, action, binding, state, metadata, layoutId, layout, context, values, controls, calls, notifications,
    applied, persisted, genericPersisted, receipt, plans, snapshot, capture, pending, make };
}

test("photo plan capture survives cold read/list and freezes the separate pending editor view before hashing", async () => {
  const f = await fixture(), input = { operationId: f.action.operationId, body: clone(f.action.body), editorSnapshot: f.snapshot() };
  const before = clone(input), pending = f.plans().capturePhoto(input);
  input.body.metadata.title = "Later server title";
  input.body.payload.items["server-item"].name = "Later request";
  input.editorSnapshot.payload.items["local-item"].photos[1].fileName = "Later selected view.png";
  const saved = await pending;
  assert.equal(saved.plan.version, 5); assert.equal(saved.cancelRequested, false);
  assert.deepEqual(saved.plan.operations[0].body, before.body); assert.deepEqual(saved.plan.editorSnapshot, before.editorSnapshot);
  assert.equal(saved.digest, hash(saved.plan));
  assert.deepEqual(await f.plans().read(f.action.operationId), saved);
  assert.deepEqual(await f.plans().list(), [saved]);
  assert.deepEqual(await f.plans().capturePhoto(before), saved);
  assert.equal(f.values.size, 1); assert.equal(f.calls.length, 0);
  saved.plan.editorSnapshot.payload.items["local-item"].name = "Caller mutation";
  assert.deepEqual((await f.plans().read(f.action.operationId)).plan.editorSnapshot, before.editorSnapshot);
});

test("capturePhoto requires a successful exact storage readback and leaves no client operation on failure", async () => {
  for (const failure of ["storageDrop", "storageFail"]) {
    const f = await fixture(); f.controls[failure] = true;
    await assert.rejects(f.capture());
    assert.equal(await f.plans().read(f.action.operationId), null);
    assert.deepEqual(await f.plans().list(), []); assert.equal(f.calls.length, 0);
  }
});

test("a corrupted photo editor snapshot digest blocks read, list and execution", async () => {
  const f = await fixture(); await f.capture();
  const [key, raw] = [...f.values][0], altered = JSON.parse(raw);
  altered.plan.editorSnapshot.payload.items["local-item"].photos[1].fileName = "Different selected view.png";
  f.values.set(key, JSON.stringify(altered));
  await assert.rejects(f.plans().read(f.action.operationId), paused);
  await assert.rejects(f.plans().list(), paused);
  await assert.rejects(f.plans().run(f.action.operationId), paused);
  assert.equal(f.calls.length, 0);
});

test("a version five pending photo plan is explicitly unavailable as another copy's data source", async () => {
  const f = await fixture(), saved = await f.capture();
  assert.throws(() => adminTemplateDataSourceSnapshot(saved.plan, [saved]), paused);
  assert.throws(() => adminTemplateDataSourceSnapshot(saved.plan, [saved], { receipts: [{ intent: saved.plan.operations[0], receipt: f.receipt }] }), paused);
  assert.deepEqual(await f.plans().read(f.action.operationId), saved); assert.equal(f.calls.length, 0);
});

test("flow applies a committed version five receipt using the exact local pending editor snapshot", async () => {
  const f = await fixture(), saved = await f.capture(); f.pending();
  const result = await f.make().flush(f.layoutId);
  assert.equal(result.state, "committed"); assert.equal(result.applied, true);
  assert.equal(f.applied.length, 1); assert.equal(f.applied[0].selectedId, f.layoutId);
  assert.deepEqual(f.applied[0].plan, saved.plan); assert.deepEqual(f.applied[0].receipt, f.receipt);
  assert.deepEqual(f.applied[0].source.base, { stateRevision: 8 });
  assert.equal(f.applied[0].source.planId, null); assert.equal(Object.hasOwn(f.applied[0].source, "photoAppendPending"), false);
  assert.deepEqual(f.layout.adminCausalSource.base, { stateRevision: 8 });
  assert.equal(f.layout.adminCausalSource.planId, null); assert.equal(f.layout.templateDraftSyncPending, undefined);
  assert.equal(f.layout.templateDraftServerHydrated, true); assert.deepEqual(f.notifications, ["committed"]);
  assert.equal(f.persisted.length, 1);
  assert.equal(f.genericPersisted.length, 0, "Version five must not perform a second generic persistence after atomic adoption");
  assert.deepEqual(await f.make().flush(f.layoutId), { state: "idle" }); assert.equal(f.applied.length, 1);
});

test("an older photo receipt cannot replace a newer visible edit or newer operation pointer", async () => {
  for (const mode of ["editor", "pointer"]) {
    const f = await fixture(); await f.capture(); f.pending();
    const newerId = crypto.randomUUID();
    f.controls.afterRun = () => {
      if (mode === "editor") f.state.items["local-item"].name = "New unsent edit";
      else f.layout.adminCausalSource = { ...f.layout.adminCausalSource, planId: newerId, base: { operationId: newerId } };
    };
    const result = await f.make().flush(f.layoutId);
    assert.equal(result.state, "committed"); assert.equal(result.applied, false);
    assert.equal(f.applied.length, 0); assert.equal(f.persisted.length, 0); assert.deepEqual(f.notifications, []);
    assert.equal(f.layout.templateDraftSyncPending, true); assert.equal(f.layout.adminCausalSource.photoAppendPending, f.action.operationId);
    if (mode === "editor") assert.equal(f.state.items["local-item"].name, "New unsent edit");
    else assert.equal(f.layout.adminCausalSource.planId, newerId);
  }
});

test("noncommitted or unmatched final receipts never invoke photo adoption", async () => {
  for (const mode of ["rejected", "wrong-id", "missing-revision"]) {
    const f = await fixture(); await f.capture(); f.pending(); f.controls.receiptMode = mode;
    const before = clone(f.layout), pending = f.make().flush(f.layoutId);
    if (mode === "rejected") assert.equal((await pending).state, "rejected");
    else await assert.rejects(pending, blocked);
    assert.equal(f.applied.length, 0); assert.equal(f.persisted.length, 0);
    assert.deepEqual(f.layout, before); assert.equal(f.notifications.includes("committed"), false);
  }
});

test("the photo pending marker blocks every ordinary save and administrative command", async () => {
  const f = await fixture(); await f.capture(); f.pending(); const before = [...f.values], flow = f.make();
  await assert.rejects(flow.capture(f.layoutId), blocked);
  for (const command of [{ kind: "template.metadata", metadata: { title: "Changed title", language: "ru" } },
    { kind: "template.publication", published: true }, { kind: "template.archive" }, { kind: "template.delete" }]) {
    await assert.rejects(flow.captureCommand(f.layoutId, command), blocked);
  }
  assert.deepEqual([...f.values], before); assert.equal(f.calls.length, 0); assert.equal(f.persisted.length, 0);
  assert.equal(flow.hasPendingCapture(f.layoutId), false);
});

test("false photo adoption keeps the original pointer and pending flags for exact retry", async () => {
  const f = await fixture(); await f.capture(); f.pending(); f.controls.apply = false;
  const before = clone(f.layout); await assert.rejects(f.make().flush(f.layoutId), blocked);
  assert.deepEqual(f.layout, before); assert.equal(f.persisted.length, 0); assert.deepEqual(f.notifications, []);
  assert.equal((await f.plans().read(f.action.operationId)).plan.id, f.action.operationId);
  f.controls.apply = true;
  assert.equal((await f.make().flush(f.layoutId)).applied, true);
});

test("photo-plan recovery restores the pending marker and blocks ordinary writes after a lost editor pointer", async () => {
  const f = await fixture(); await f.capture();
  const flow = f.make(); assert.deepEqual(await flow.recover(f.layoutId), { state: "pending" });
  assert.equal(f.layout.adminCausalSource.planId, f.action.operationId);
  assert.deepEqual(f.layout.adminCausalSource.base, { operationId: f.action.operationId });
  assert.equal(f.layout.adminCausalSource.photoAppendPending, f.action.operationId);
  assert.equal(f.layout.templateDraftSyncPending, true);
  await assert.rejects(flow.capture(f.layoutId), blocked);
  await assert.rejects(flow.captureCommand(f.layoutId, { kind: "template.metadata", metadata: { title: "Changed", language: "ru" } }), blocked);
  assert.equal(f.calls.length, 0); assert.equal((await f.plans().list()).length, 1);
});

test("failed editor persistence cannot report a photo plan as applied or committed", async () => {
  for (const mode of [false, "throw"]) {
    const f = await fixture(); await f.capture(); f.pending(); f.controls.persist = mode;
    await assert.rejects(f.make().flush(f.layoutId));
    assert.equal(f.notifications.includes("committed"), false);
    assert.equal(f.genericPersisted.length, 0);
    assert.equal((await f.plans().read(f.action.operationId)).plan.id, f.action.operationId);
    assert.equal(f.layout.adminCausalSource.planId, f.action.operationId, "A failed persistence cannot lose the in-memory recovery pointer");
    assert.equal(f.layout.adminCausalSource.photoAppendPending, f.action.operationId);
    assert.equal(f.layout.templateDraftSyncPending, true);
    f.controls.persist = true;
    assert.equal((await f.make().flush(f.layoutId)).applied, true);
    assert.equal(f.genericPersisted.length, 0);
  }
});
