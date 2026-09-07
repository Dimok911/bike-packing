import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { createPersonalPhotoFormSubmitter } from "../../src/sync/personal-photo-form-submit.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";
import { drainPersonalPhotoForm } from "../../src/sync/personal-photo-form-drain.js";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";

async function fixture() {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const context = { ...binding, scope: "personal", generation: "saved" }, values = new Map(), encoded = new Map(), events = [];
  const base = { items: {}, containers: {}, layouts: {} };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const outbox = createPersonalSaveOutbox({ ...binding, storage, photoEnabled: true, photoBatchEnabled: true, photoFormEnabled: true });
  outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 1 });
  const store = { binding, ids: async () => [...encoded.keys()], read: id => decodePersonalPhotoFormRecord(encoded.get(id), binding, id),
    captureForm: async value => { encoded.set(value.action.operationId, await encodePersonalPhotoFormRecord({ binding, ...value })); } };
  const getContext = () => context;
  const saved = await createPersonalPhotoFormSubmitter({ enabled: true, outbox, store, getContext, onDurable() {} }).submit({ binding,
    snapshot: base, basePayload: base, baseStateRevision: 1, entityType: "item", entityId: "item", baseEntityRevision: 0,
    fields: { name: "Frozen form" }, files: [1, 2].map(i => ({ fileName: `${i}.png`, file: new Blob([String(i)], { type: "image/png" }) })) });
  const action = saved.record.action, digest = createHash("sha256").update(canonicalListOperationJson({ environment: binding.environment,
    actorId: binding.actorId, kind: action.kind, listId: binding.listId, body: action.body })).digest("hex");
  const f = { binding, context, outbox, store, encoded, events, action, committed: false, hidden: false, lostAck: false, failFile: false, rejected: false };
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
  f.options = { enabled: true, outbox, store, staging, queue, getContext, readRemote: async () => { events.push("state-GET"); return f.remote; },
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
