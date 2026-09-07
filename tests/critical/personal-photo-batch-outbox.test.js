import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { PERSONAL_PHOTO_BATCH_OUTBOX_ENABLED } from "../../src/sync/personal-photo-outbox-record.js";
import { preparePersonalPhotoAttachmentBatch } from "../../src/sync/personal-photo-batch-plan.js";
import { encodePersonalPhotoBatchRecord, decodePersonalPhotoBatchRecord } from "../../src/sync/personal-photo-batch-record.js";
import { inspectPersonalPhotoRecovery } from "../../src/sync/personal-photo-recovery-inventory.js";

async function fixture() {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const context = { ...binding, scope: "personal", generation: "edit" }, values = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const base = { items: { item: { id: "item", name: "Unchanged", photos: [] } }, containers: {}, layouts: {} };
  const make = (batch = true) => createPersonalSaveOutbox({ storage, ...binding, photoEnabled: true, photoBatchEnabled: batch });
  const outbox = make(); outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 5 });
  const prepared = preparePersonalPhotoAttachmentBatch({ binding, snapshot: base, basePayload: base, baseStateRevision: 5,
    entityType: "item", entityId: "item", baseEntityRevision: 3,
    files: [1, 2].map(i => ({ fileName: `photo-${i}.png`, file: new Blob([`bytes-${i}`], { type: "image/png" }), thumb: null })) }, { enabled: true });
  const plan = outbox.preparePhoto(prepared);
  const encoded = await encodePersonalPhotoBatchRecord({ binding, ...plan, files: prepared.files });
  const store = { binding, ids: async () => [plan.action.operationId], read: id => decodePersonalPhotoBatchRecord(encoded, binding, id) };
  return { binding, context, getContext: () => context, values, storage, base, prepared, plan, encoded, store, make, outbox };
}

test("one gated photo batch binds all files to one causal owner action and blocks an overtaking DB save", async () => {
  assert.equal(PERSONAL_PHOTO_BATCH_OUTBOX_ENABLED, false);
  const f = await fixture(), disabled = f.make(false); disabled.adoptRemoteBaseline({ snapshot: f.base, payload: f.base, stateRevision: 5 });
  assert.throws(() => disabled.preparePhoto(f.prepared), { code: "photo-composite" });
  const record = await f.outbox.capturePhoto({ plan: f.plan, store: f.store, getContext: f.getContext });
  assert.equal(record.photoState.fileInventoryVersion, 2); assert.equal(record.photoState.fileIntentHash, f.encoded.intentHash);
  assert.equal(f.values.size, 1); assert.deepEqual(f.make(false).recover(), record);
  const inventory = await inspectPersonalPhotoRecovery({ outbox: f.outbox, store: f.store, getContext: f.getContext });
  assert.equal(inventory.entries[0].state, "linked"); assert.equal(inventory.entries[0].photoCount, 2);
  assert.throws(() => f.outbox.capture({ snapshot: f.base, body: { baseStateRevision: 5, payload: f.base } }), { code: "photo-pending" });
  await assert.rejects(f.make(false).drain({ queue: { run: () => assert.fail("no publication") }, getContext: f.getContext }), { code: "photo-batch-disabled" });
});

test("owner publication waits for every exact file receipt and reload retains the complete unchanged batch", async () => {
  const f = await fixture(); await f.outbox.capturePhoto({ plan: f.plan, store: f.store, getContext: f.getContext });
  const ids = f.plan.action.body.changes.map(change => change.assetId), before = [...f.values], calls = [];
  let failSecond = true;
  const staging = { stage: async (id, stageId) => {
    assert.equal(id, f.plan.action.operationId); calls.push(stageId);
    if (failSecond && stageId === ids[1]) throw Error("lost last file receipt");
    return { historicalStageOnly: true, actionOperationId: id, operation: { id: stageId }, asset: { id: stageId, state: "ready" } };
  } };
  const queue = { run: async input => { calls.push("owner"); assert.equal(input.operationId, f.plan.action.operationId);
    assert.deepEqual(JSON.parse(input.body), f.plan.action.body); return { list: { id: f.binding.listId } }; } };
  const options = { queue, photoStore: f.store, photoStaging: staging, getContext: f.getContext };
  await assert.rejects(f.outbox.drain(options), /lost last file receipt/); assert.deepEqual(calls, ids); assert.deepEqual([...f.values], before);
  failSecond = false; await f.make().drain(options);
  assert.deepEqual(calls, [...ids, ...ids, "owner", "owner"]); assert.deepEqual([...f.values], before);
  assert.equal(f.make().hasPending(), true, "receipt alone is not a current-state adoption");
});

test("missing damaged swapped or differently bound batch data cannot register or dispatch a partial photo action", async () => {
  for (const mode of ["missing", "bytes", "order", "snapshot", "action"]) {
    const f = await fixture();
    const saved = await f.store.read(f.plan.action.operationId);
    if (mode === "bytes") saved.files[1].file = new Blob([]);
    if (mode === "order") saved.files.reverse();
    if (mode === "snapshot") saved.snapshot.items.item.name = "Another draft";
    if (mode === "action") saved.action.operationId = crypto.randomUUID();
    const store = { ...f.store, read: async () => mode === "missing" ? null : saved };
    await assert.rejects(f.outbox.capturePhoto({ plan: f.plan, store, getContext: f.getContext }));
    assert.equal(f.values.size, 0);
  }
  const f = await fixture(); await f.outbox.capturePhoto({ plan: f.plan, store: f.store, getContext: f.getContext });
  const missing = { ...f.store, ids: async () => [], read: async () => null };
  const inventory = await inspectPersonalPhotoRecovery({ outbox: f.outbox, store: missing, getContext: f.getContext });
  assert.equal(inventory.entries[0].state, "missing-file"); assert.equal(inventory.entries[0].stageOperationIds.length, 2);
  await assert.rejects(f.outbox.drain({ getContext: f.getContext, photoStore: missing,
    photoStaging: { stage: () => assert.fail("no file dispatch") }, queue: { run: () => assert.fail("no owner dispatch") } }));
});

test("quota or a competing tab after batch file commit retains the entire package without an outbox fragment", async () => {
  for (const mode of ["quota", "tab"]) {
    const f = await fixture(), before = [...f.values];
    if (mode === "quota") f.storage.setItem = () => { throw Error("quota"); };
    else {
      const original = f.store.read;
      f.store.read = async id => {
        const saved = await original(id), competitor = f.make(); competitor.adoptRemoteBaseline({ snapshot: f.base, payload: f.base, stateRevision: 5 });
        const snapshot = structuredClone(f.base); snapshot.items.item.name = "Other tab";
        competitor.capture({ snapshot, body: { baseStateRevision: 5, payload: snapshot } }); return saved;
      };
    }
    await assert.rejects(f.outbox.capturePhoto({ plan: f.plan, store: f.store, getContext: f.getContext }),
      error => error.isPersonalSaveBlocked && error.unconfirmedMemoryDraft.items.item.photos.length === 2);
    assert.equal((await decodePersonalPhotoBatchRecord(f.encoded, f.binding, f.plan.action.operationId)).files.length, 2);
    if (mode === "quota") assert.deepEqual([...f.values], before);
    else { assert.equal(f.make().recover().action.kind, "list.update"); assert.equal(f.values.size, 1); }
  }
});
