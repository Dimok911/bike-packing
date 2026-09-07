import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { preparePersonalPhotoAttachmentBatch } from "../../src/sync/personal-photo-batch-plan.js";
import { encodePersonalPhotoBatchRecord, decodePersonalPhotoBatchRecord } from "../../src/sync/personal-photo-batch-record.js";
import { cancelPersonalPhotoBatch, PERSONAL_PHOTO_BATCH_CANCELLATION_ENABLED } from "../../src/sync/personal-photo-batch-cancellation.js";
import { personalPhotoRecoveryCancellationHead } from "../../src/sync/personal-photo-recovery-cancel.js";
import { inspectPersonalPhotoRecovery } from "../../src/sync/personal-photo-recovery-inventory.js";
import { preparePersonalPhotoFormAttachments } from "../../src/sync/personal-photo-form-plan.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";

async function makeFixture(form) {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" }, entries = new Map();
  const storage = { get length() { return entries.size; }, key: i => [...entries.keys()][i], getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
  const outbox = createPersonalSaveOutbox({ ...binding, storage, photoEnabled: true, photoBatchEnabled: true, photoBatchCancellationEnabled: true, photoFormEnabled: true });
  const base = { items: { item: { id: "item", name: "Frozen", photos: [] } }, containers: {}, layouts: {} };
  outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 1 });
  const prepared = (form ? preparePersonalPhotoFormAttachments : preparePersonalPhotoAttachmentBatch)({ binding, snapshot: base, basePayload: base, baseStateRevision: 1,
    entityType: "item", entityId: "item", baseEntityRevision: 1,
    ...(form ? { fields: { name: "New form title", note: "Must retain with photos" } } : {}),
    files: [1, 2].map(i => ({ file: new Blob([`original${i}`], { type: "image/png" }), thumb: null })) }, { enabled: true });
  const plan = outbox.preparePhoto(prepared), encoded = await (form ? encodePersonalPhotoFormRecord : encodePersonalPhotoBatchRecord)({ binding, ...plan, files: prepared.files });
  const store = { read: id => (form ? decodePersonalPhotoFormRecord : decodePersonalPhotoBatchRecord)(encoded, binding, id) }, calls = [], state = { changed: false, owner: "unknown", secondUnknown: false };
  const record = await outbox.capturePhoto({ plan, store, getContext: () => ({ ...binding, scope: "personal", generation: "editor" }) });
  const digest = createHash("sha256").update(canonicalListOperationJson({ environment: binding.environment, actorId: binding.actorId,
    kind: plan.action.kind, listId: binding.listId, body: plan.action.body })).digest("hex");
  const ownerProof = () => ({ historicalOnly: true, operation: { ...binding, id: plan.action.operationId, kind: "photos.mutate",
    payloadDigest: digest, state: state.owner }, resultStatus: state.owner === "committed" ? 200 : 409, stateRevision: state.owner === "committed" ? 2 : null });
  const stageProof = async id => {
    const saved = await store.read(record.action.operationId), part = saved.files.find(part => part.stage.operationId === id);
    return { ok: true, historicalStageOnly: true, actionOperationId: record.action.operationId,
      operation: { ...binding, ...part.stage, id, state: "cancelled", payloadDigest: "d".repeat(64) },
      cancellation: { version: 1, stageOperationId: id, fileHash: part.fileMetadata.hash, thumbHash: part.fileMetadata.hash, noAssetPublished: true, stageCannotPublish: true } };
  };
  const options = { enabled: true, formEnabled: true, record, binding, store, assertCurrent: () => { if (state.changed) throw Error("editor changed"); },
    queue: { inspect: async () => { calls.push("inspect"); if (state.owner === "unknown") throw Object.assign(Error("unknown"), { isOperationReceiptError: true }); return ownerProof(); },
      supportsCancellation: () => true, cancelExact: async request => { calls.push("cancel-owner"); assert.equal(request.operationId, record.action.operationId);
        assert.deepEqual(JSON.parse(request.body), record.action.body); state.owner = "rejected"; return ownerProof(); } },
    staging: { cancel: async (actionId, stageId) => { assert.equal(actionId, record.action.operationId); calls.push(stageId);
      if (state.secondUnknown && stageId === record.action.body.changes[1].assetId) throw Error("lost cancellation ACK"); return stageProof(stageId); } } };
  return { options, outbox, binding, storage, record, state, calls, entries, store, ownerProof, stageProof };
}

for (const form of [false, true]) test.describe(form ? "card form" : "photo-only batch", () => {
const fixture = () => makeFixture(form);

test("batch cancellation is separately gated and fences the exact owner before settling every unchanged stage", async () => {
  assert.equal(PERSONAL_PHOTO_BATCH_CANCELLATION_ENABLED, false);
  const f = await fixture(), before = [...f.entries];
  await assert.rejects(cancelPersonalPhotoBatch({ ...f.options, enabled: false }), { code: "photo-batch-cancellation" }); assert.deepEqual(f.calls, []);
  const result = await cancelPersonalPhotoBatch(f.options);
  assert.deepEqual(f.calls, ["inspect", "cancel-owner", ...f.record.action.body.changes.map(change => change.assetId)]);
  assert.equal(result.ownerReceipt.operation.state, "rejected"); assert.equal(result.stageReceipts.length, 2); assert.equal(result.fileRetained, true);
  assert.deepEqual([...f.entries], before); assert.equal((await f.store.read(f.record.action.operationId)).files.length, 2);
});

test("lost last cancellation ACK resumes exact receipts without new owner cancellation or rewritten local intent", async () => {
  const f = await fixture(), before = [...f.entries]; f.state.secondUnknown = true;
  await assert.rejects(cancelPersonalPhotoBatch(f.options), /lost cancellation ACK/); assert.equal(f.state.owner, "rejected");
  f.state.secondUnknown = false; const result = await cancelPersonalPhotoBatch(f.options);
  assert.equal(result.stageReceipts.length, 2); assert.equal(f.calls.filter(call => call === "cancel-owner").length, 1);
  assert.deepEqual([...f.entries], before);
});

test("an already committed owner or an execution winner is never relabelled cancelled and no file fence is sent", async () => {
  for (const race of [false, true]) {
    const f = await fixture();
    if (race) f.options.queue.cancelExact = async () => { f.state.owner = "committed"; return f.ownerProof(); };
    else f.state.owner = "committed";
    const result = await cancelPersonalPhotoBatch(f.options);
    assert.equal(result.alreadyPublished, true); assert.equal(result.ownerReceipt.operation.state, "committed"); assert.deepEqual(f.calls, ["inspect"]);
  }
});

test("wrong owner proof, missing part, changed editor and unavailable cancellation capability cannot touch stage records", async () => {
  for (const mode of ["digest", "actor", "missing", "editor", "capability"]) {
    const f = await fixture();
    if (["digest", "actor"].includes(mode)) { f.state.owner = "rejected"; const proof = f.ownerProof(); proof.operation[mode === "digest" ? "payloadDigest" : "actorId"] = "wrong"; f.options.queue.inspect = async () => proof; }
    if (mode === "missing") f.options.store = { read: async () => null };
    if (mode === "editor") f.options.queue.inspect = async () => { f.state.changed = true; throw Object.assign(Error("unknown"), { isOperationReceiptError: true }); };
    if (mode === "capability") f.options.queue.supportsCancellation = () => false;
    await assert.rejects(cancelPersonalPhotoBatch(f.options)); assert.equal(f.calls.some(call => call !== "inspect"), false);
  }
});

test("real outbox cancellation adapter remains gated and preserves its pending batch until an explicit new decision", async () => {
  const f = await fixture(), before = [...f.entries];
  assert.equal(Boolean(personalPhotoRecoveryCancellationHead(f.record)), false);
  assert.equal(Boolean(personalPhotoRecoveryCancellationHead(f.record, { batchEnabled: true })), !form);
  assert.equal(Boolean(personalPhotoRecoveryCancellationHead(f.record, { batchEnabled: true, formEnabled: true })), true);
  const options = { queue: f.options.queue, photoStore: f.store, photoStaging: f.options.staging,
    getContext: () => ({ ...f.binding, scope: "personal", generation: "editor" }) };
  const disabled = createPersonalSaveOutbox({ ...f.binding, storage: f.storage, photoEnabled: true, photoBatchEnabled: true });
  await assert.rejects(disabled.cancelPhotoUpload(options), { code: "photo-batch-cancellation" }); assert.deepEqual(f.calls, []);
  const cancelled = await f.outbox.cancelPhotoUpload(options);
  assert.equal(cancelled.ownerReceipt.operation.state, "rejected"); assert.equal(f.outbox.hasPending(), true);
  assert.deepEqual([...f.entries], before); assert.deepEqual(f.outbox.recover(), f.record);
});

test("applied keep-current decision carries exact photo proof through compact baseline adoption and a later ordinary save", async () => {
  for (const mode of ["compact", "adopt", "later-save"]) {
    const f = await fixture(), getContext = () => ({ ...f.binding, scope: "personal", generation: "editor" });
    await cancelPersonalPhotoBatch(f.options);
    const payload = f.record.mergeBase.payload;
    const decision = await f.outbox.reconcile({ queue: f.options.queue, getContext, resolveRejectedPhoto: async () => "keep-server",
      readRemote: async () => ({ id: f.binding.listId, ownerId: f.binding.actorId, stateRevision: 1, payload }) });
    f.outbox.markApplied({ operationId: decision.action.operationId, stateRevision: 2 });
    if (mode === "adopt") f.outbox.adoptRemoteBaseline({ snapshot: payload, payload, stateRevision: 2 });
    if (mode === "later-save") {
      const next = structuredClone(payload); next.items.item.name = "Later ordinary edit";
      const record = f.outbox.capture({ snapshot: next, body: { baseStateRevision: 2, payload: next } });
      f.outbox.markApplied({ operationId: record.action.operationId, stateRevision: 3 });
    }
    f.outbox.compact();
    const recovered = createPersonalSaveOutbox({ ...f.binding, storage: f.storage });
    const inventory = await inspectPersonalPhotoRecovery({ outbox: recovered,
      store: { ...f.store, binding: f.binding, ids: async () => [f.record.action.operationId] }, getContext });
    assert.equal(inventory.entries[0].state, "settled-retained", mode);
    assert.deepEqual(recovered.photoRecoveryReferences().photoReceipts, [f.ownerProof()]);
  }
});

if (form) test("form cancellation requires its own authority and the keep-current choice identifies discarded fields", async () => {
  const f = await fixture(), getContext = () => ({ ...f.binding, scope: "personal", generation: "editor" });
  await assert.rejects(cancelPersonalPhotoBatch({ ...f.options, formEnabled: false }), { code: "photo-batch-cancellation" });
  assert.deepEqual(f.calls, []);
  await cancelPersonalPhotoBatch(f.options);
  const disabled = createPersonalSaveOutbox({ ...f.binding, storage: f.storage, photoEnabled: true, photoBatchEnabled: true });
  const readRemote = async () => ({ id: f.binding.listId, ownerId: f.binding.actorId, stateRevision: 1, payload: f.record.mergeBase.payload });
  await assert.rejects(disabled.reconcile({ queue: f.options.queue, getContext, readRemote,
    resolveRejectedPhoto: () => assert.fail("a gated form cannot ask for a destructive choice") }), { code: "photo-form-disabled" });
  const decision = await f.outbox.reconcile({ queue: f.options.queue, getContext, readRemote, resolveRejectedPhoto: async details => {
    assert.equal(details.action, "form"); assert.equal(details.photoOperationId, f.record.action.operationId);
    assert.equal(details.localFilesRetained, true); return "keep-server";
  } });
  assert.notEqual(decision.action.operationId, f.record.action.operationId);
  assert.equal(decision.action.body.payload.items.item.name, "Frozen");
  const original = await f.store.read(f.record.action.operationId);
  assert.equal(original.snapshot.items.item.name, "New form title");
  assert.equal(original.snapshot.items.item.note, "Must retain with photos");
  assert.equal(original.files.length, 2);
});
});
