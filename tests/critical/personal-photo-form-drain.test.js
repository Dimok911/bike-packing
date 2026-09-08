import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { createPersonalPhotoFormSubmitter } from "../../src/sync/personal-photo-form-submit.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";
import { drainPersonalPhotoForm } from "../../src/sync/personal-photo-form-drain.js";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";
import { PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED, isPersonalPendingPhotoOwnerDeletion,
  personalPendingPhotoOwnerDeletionForm } from "../../src/sync/personal-pending-photo-owner-deletion.js";

async function fixture({ type = "item", pendingDeletion = false } = {}) {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const context = { ...binding, scope: "personal", generation: "saved" }, values = new Map(), encoded = new Map(), events = [];
  const base = { items: {}, containers: {}, layouts: {} };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const outbox = createPersonalSaveOutbox({ ...binding, storage, photoEnabled: true, photoBatchEnabled: true, photoFormEnabled: true,
    pendingPhotoOwnerDeletionEnabled: pendingDeletion });
  outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 1 });
  const store = { binding, ids: async () => [...encoded.keys()], read: id => decodePersonalPhotoFormRecord(encoded.get(id), binding, id),
    captureForm: async value => { encoded.set(value.action.operationId, await encodePersonalPhotoFormRecord({ binding, ...value })); } };
  const getContext = () => context;
  const saved = await createPersonalPhotoFormSubmitter({ enabled: true, outbox, store, getContext, onDurable() {} }).submit({ binding,
    snapshot: base, basePayload: base, baseStateRevision: 1, entityType: type, entityId: "item", baseEntityRevision: 0,
    fields: { name: "Frozen form" }, files: [1, 2].map(i => ({ fileName: `${i}.png`, file: new Blob([String(i)], { type: "image/png" }) })) });
  const action = saved.record.action, digest = createHash("sha256").update(canonicalListOperationJson({ environment: binding.environment,
    actorId: binding.actorId, kind: action.kind, listId: binding.listId, body: action.body })).digest("hex");
  const f = { binding, context, outbox, storage, store, encoded, events, action, committed: false, hidden: false, lostAck: false, failFile: false, rejected: false };
  const unknown = () => Object.assign(Error("unknown receipt"), { isOperationReceiptError: true });
  const queue = { async inspect() {
    events.push("owner-GET");
    if (f.hidden || !f.committed && !f.rejected) throw unknown();
    return { historicalOnly: true, operation: { id: action.operationId, environment: binding.environment, actorId: binding.actorId,
      listId: binding.listId, kind: action.kind, payloadDigest: digest, state: f.rejected ? "rejected" : "committed" },
      stateRevision: f.rejected ? 1 : 2, resultStatus: f.rejected ? 409 : 200, rejectionCode: f.rejected ? "stale_photo_owner_revision" : null };
  }, async run() {
    if (!f.committed) { events.push("owner-POST"); f.committed = true; }
    if (f.lostAck) throw unknown(); return { ok: true };
  } };
  const staging = { async stage(id, assetId) {
    events.push(`file:${assetId}`); if (f.failFile) throw Error("file ACK unknown");
    return { historicalStageOnly: true, actionOperationId: id, operation: { id: assetId }, asset: { id: assetId, state: "ready" } };
  } };
  f.remote = { id: "list", ownerId: "actor", stateRevision: 3, payload: { ...base, note: "Fresh server after owner deletion" } };
  f.options = { enabled: true, pendingOwnerDeletionEnabled: pendingDeletion, outbox, store, staging, queue, getContext, readRemote: async () => { events.push("state-GET"); return f.remote; },
    onAdopted(record) { events.push("adopt"); f.adopted = record; } };
  return f;
}

test("form drain uploads through existing adapters and adopts fresh state, never the historical form snapshot", async () => {
  const f = await fixture();
  const result = await drainPersonalPhotoForm(f.options);
  assert.equal(result.operationId, f.action.operationId); assert.equal(result.fileRetained, true);
  assert.equal(f.events.filter(e => e === "owner-POST").length, 1); assert.equal(f.events.filter(e => e.startsWith("file:")).length, 2);
  assert.deepEqual(f.adopted.snapshot, f.remote.payload); assert.equal(f.adopted.snapshot.items.item, undefined);
  assert.equal(f.outbox.hasPending(), false); assert.equal(f.encoded.size, 1);
});

function deletePendingOwner(f) {
  const parent = f.outbox.recover(), intent = { type: parent.action.body.entityType, id: parent.action.body.entityId };
  const prepared = preparePersonalDeletionBatch(parent.snapshot, intent);
  return f.outbox.capture({ snapshot: prepared.snapshot, body: { payload: prepared.snapshot, userDeletion: intent, baseStateRevision: 1 } });
}

function deletionQueue(f, deletion) {
  const original = f.options.queue, action = deletion.action;
  const digest = createHash("sha256").update(canonicalListOperationJson({ environment: f.binding.environment,
    actorId: f.binding.actorId, kind: action.kind, listId: action.listId, body: action.body })).digest("hex");
  f.options.queue = {
    async inspect(input) {
      if (input.operationId !== action.operationId) return original.inspect(input);
      f.events.push("delete-GET");
      if (!f.deleted || f.hideDeletion) throw Object.assign(Error("unknown deletion"), { isOperationReceiptError: true });
      return { historicalOnly: true, operation: { id: action.operationId, environment: f.binding.environment, actorId: f.binding.actorId,
        listId: action.listId, kind: action.kind, payloadDigest: digest, state: "committed" }, stateRevision: 3, resultStatus: 200 };
    },
    async run(input) {
      if (input.operationId !== action.operationId) {
        if (f.rejected) throw Object.assign(Error("owner rejected"), { isOperationReceiptError: true });
        return original.run(input);
      }
      assert.equal(f.committed, true, "DELETE requires the exact parent result");
      if (!f.deleted) { f.events.push("delete-PUT"); f.deleted = true; }
      if (f.hideDeletion) throw Object.assign(Error("lost deletion ACK"), { isOperationReceiptError: true });
      return { ok: true };
    }
  };
}

test("pending-owner deletion is independently disabled and requires its exact immutable form", async () => {
  assert.equal(PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED, false);
  const disabled = await fixture(); assert.throws(() => deletePendingOwner(disabled), { code: "photo-pending" });
  const f = await fixture({ pendingDeletion: true }), parent = f.outbox.recover();
  const value = { parent, payload: preparePersonalDeletionBatch(parent.photoState.payload, { type: "item", id: "item" }).snapshot,
    userDeletion: { type: "item", id: "item" }, listId: "list" };
  assert.equal(isPersonalPendingPhotoOwnerDeletion(value), true);
  for (const mutate of [v => { v.userDeletion = null; }, v => { v.listId = "other"; },
    v => { v.payload.items.item = { id: "item", photos: [] }; }, v => { v.parent.photoState.payload.items.item.photos[0].assetId = "foreign"; },
    v => { v.payload.items.other = { id: "other", photos: v.parent.photoState.payload.items.item.photos }; }]) {
    const invalid = structuredClone(value); mutate(invalid); assert.equal(isPersonalPendingPhotoOwnerDeletion(invalid), false);
  }
  const deletion = deletePendingOwner(f);
  assert.deepEqual(deletion.action.body.causal, { dependsOn: [{ operationId: parent.action.operationId, listId: "list" }],
    reads: [], baseOperationId: parent.action.operationId });
  const args = { records: f.outbox.list(), operationId: deletion.action.operationId, listId: "list" };
  assert.equal(personalPendingPhotoOwnerDeletionForm(args).action.operationId, parent.action.operationId);
  const later = structuredClone(deletion); later.action.operationId = "later";
  later.action.body.causal.baseOperationId = deletion.action.operationId;
  assert.ok(personalPendingPhotoOwnerDeletionForm({ ...args, records: [...args.records, later], operationId: "later" }));
  later.action.body.payload.items.item = { id: "item", photos: [] };
  assert.equal(personalPendingPhotoOwnerDeletionForm({ ...args, records: [...args.records, later], operationId: "later" }), null);
});

for (const type of ["item", "container"]) test(`pending ${type} deletion waits for files and exact parent ACK across restart`, async () => {
  const f = await fixture({ type, pendingDeletion: true }), deletion = deletePendingOwner(f); deletionQueue(f, deletion);
  f.lostAck = true; f.hidden = true;
  await assert.rejects(drainPersonalPhotoForm(f.options));
  assert.equal(f.deleted, undefined); assert.equal(f.events.filter(e => e.startsWith("file:")).length, 2);
  assert.equal(f.events.filter(e => e === "owner-POST").length, 1);
  f.options.outbox = f.outbox = createPersonalSaveOutbox({ ...f.binding, storage: f.storage, photoEnabled: true, photoBatchEnabled: true,
    photoFormEnabled: true, pendingPhotoOwnerDeletionEnabled: true });
  assert.deepEqual(f.outbox.recover().action, deletion.action);
  f.lostAck = false; f.hidden = false; f.failFile = true; f.hideDeletion = true;
  await assert.rejects(drainPersonalPhotoForm(f.options));
  assert.equal(f.deleted, true); assert.equal(f.adopted, undefined);
  assert.equal(f.events.filter(e => e.startsWith("file:")).length, 2, "committed form skips native staging");
  f.hideDeletion = false;
  await drainPersonalPhotoForm(f.options);
  assert.equal(f.events.filter(e => e === "delete-PUT").length, 1);
  assert.deepEqual(f.adopted.snapshot, f.remote.payload); assert.equal(f.outbox.hasPending(), false);
  assert.equal(f.encoded.size, 1); assert.deepEqual(f.outbox.recover().action, deletion.action);
});

test("deletion captured while a file is in flight supersedes the old worker without adopting the form", async () => {
  const f = await fixture({ pendingDeletion: true }), stage = f.options.staging.stage;
  let deletion;
  f.options.staging.stage = async (...args) => {
    const proof = await stage(...args); deletion = deletePendingOwner(f); f.context.generation = "deleted"; return proof;
  };
  await assert.rejects(drainPersonalPhotoForm(f.options), { code: "photo-form-superseded" });
  assert.equal(f.adopted, undefined); assert.equal(f.events.includes("owner-POST"), false);
  f.options.staging.stage = stage; deletionQueue(f, deletion);
  await drainPersonalPhotoForm(f.options);
  assert.equal(f.events.filter(e => e === "owner-POST").length, 1); assert.equal(f.events.filter(e => e === "delete-PUT").length, 1);
  assert.equal(f.adopted.snapshot.items.item, undefined);
});

test("rejected parent and deletion storage quota retain the original form/files without dispatching DELETE", async () => {
  const f = await fixture({ pendingDeletion: true }), parent = f.outbox.recover(), setItem = f.storage.setItem;
  f.storage.setItem = () => { throw Error("quota"); };
  assert.throws(() => deletePendingOwner(f), { code: "quota" });
  assert.deepEqual(f.outbox.recover(), parent); assert.equal(f.encoded.size, 1);
  f.storage.setItem = setItem;
  deletionQueue(f, deletePendingOwner(f)); f.rejected = true;
  await assert.rejects(drainPersonalPhotoForm(f.options));
  assert.equal(f.events.some(e => e === "delete-PUT" || e.startsWith("file:")), false);
  assert.equal(f.adopted, undefined); assert.equal(f.outbox.hasPending(), true); assert.equal(f.encoded.size, 1);
});

test("already committed form skips all file processing and cannot resurrect its subsequently removed owner", async () => {
  const f = await fixture(); f.committed = true; f.failFile = true;
  await drainPersonalPhotoForm(f.options);
  assert.equal(f.events.some(e => e.startsWith("file:") || e === "owner-POST"), false);
  assert.equal(f.adopted.snapshot.items.item, undefined); assert.equal(f.encoded.size, 1);
});

test("failure of the initial owner-status GET stops before touching any file", async () => {
  const f = await fixture(); f.options.queue.inspect = async () => { throw Error("network unavailable before any upload"); };
  await assert.rejects(drainPersonalPhotoForm(f.options), /network unavailable/);
  assert.deepEqual(f.events, []); assert.equal(f.outbox.hasPending(), true); assert.equal(f.encoded.size, 1);
});

test("lost owner ACK remains pending until exact GET returns, then adopts without repeating any file or owner POST", async () => {
  const f = await fixture(); f.lostAck = true; f.hidden = true;
  await assert.rejects(drainPersonalPhotoForm(f.options)); assert.equal(f.adopted, undefined); assert.equal(f.outbox.hasPending(), true);
  const count = f.events.length; f.hidden = false;
  await drainPersonalPhotoForm(f.options);
  assert.equal(f.events.slice(count).some(e => e.startsWith("file:") || e === "owner-POST"), false);
  assert.deepEqual(f.adopted.snapshot, f.remote.payload);
});

test("file failure, owner rejection, scope change and disabled gate cannot adopt or dispatch another owner", async () => {
  for (const mode of ["file", "rejection", "context", "disabled"]) {
    const f = await fixture();
    if (mode === "file") f.failFile = true;
    if (mode === "rejection") f.rejected = true;
    if (mode === "disabled") f.options.enabled = false;
    if (mode === "context") { const ids = f.store.ids; f.store.ids = async () => { f.context.actorId = "other"; return ids(); }; }
    await assert.rejects(drainPersonalPhotoForm(f.options));
    assert.equal(f.adopted, undefined); assert.equal(f.events.includes("owner-POST"), false);
    assert.equal(f.outbox.hasPending(), true); assert.equal(f.encoded.size, 1);
  }
});
