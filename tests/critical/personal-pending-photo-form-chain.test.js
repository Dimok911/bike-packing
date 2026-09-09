import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { personalPhotoRecoveryCancellationHead } from "../../src/sync/personal-photo-recovery-cancel.js";
import { preparePersonalPhotoFormAttachments } from "../../src/sync/personal-photo-form-plan.js";
import { preparePersonalPendingPhotoForm } from "../../src/sync/personal-pending-photo-form-plan.js";
import { personalPendingPhotoFormChain as chain } from "../../src/sync/personal-pending-photo-form-chain.js";
import { personalFormPhotoResultReference, personalPendingFormUpdateSource } from "../../src/sync/personal-pending-form-update.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";
import { createPersonalPendingPhotoFormSession } from "../../src/sync/personal-pending-photo-form-session.js";

function fixture() {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list" };
  const base = { items: {}, containers: {}, layouts: {} }, file = () => ({ fileName: "photo.png", file: new Blob(["frozen bytes"], { type: "image/png" }) });
  const first = preparePersonalPhotoFormAttachments({ binding, snapshot: base, basePayload: base, baseStateRevision: 1,
    entityType: "item", entityId: "owner", baseEntityRevision: 0, fields: { name: "First form" }, files: [file()] }, { enabled: true });
  const record = (plan, previous, payload) => ({ version: 1,
    action: { ...binding, operationId: plan.operationId, generation: previous ? previous.action.generation + 1 : 1, kind: "photos.mutate",
      body: { ...plan.body, causal: { ...(previous ? { baseOperationId: previous.action.operationId } : {}),
        dependsOn: previous ? [{ operationId: previous.action.operationId, listId: "list" }] : [], reads: [] } } }, snapshot: plan.snapshot,
    mergeBase: { payload, stateRevision: 1 }, photoState: { version: 1, payload: plan.payload, fileIntentHash: "a".repeat(64), fileInventoryVersion: 2 } });
  const root = record(first, null, base);
  const second = preparePersonalPendingPhotoForm({ binding, snapshot: first.snapshot, basePayload: first.payload, baseStateRevision: 1,
    entityType: "item", entityId: "owner", parentOperationId: root.action.operationId, fields: { name: "Second form" }, files: [file()] }, { enabled: true });
  const next = record(second, root, first.payload), payload = structuredClone(second.payload); payload.items.owner.weight = 17;
  const edit = { action: { ...binding, operationId: randomUUID(), generation: 3, kind: "list.update", body: { payload, baseStateRevision: 1,
    photoResults: personalFormPhotoResultReference(next), causal: { baseOperationId: next.action.operationId,
      dependsOn: [{ operationId: next.action.operationId, listId: "list" }], reads: [] } } }, snapshot: payload, mergeBase: { payload: second.payload, stateRevision: 1 } };
  return { root, next, edit, records: [edit, root, next], listId: "list", operationId: edit.action.operationId };
}

test("multiple file-owning forms and a following DB edit have one complete causal ancestry independent of delivery order", () => {
  const f = fixture(), result = chain(f);
  assert.ok(result); assert.deepEqual(result.forms.map(record => record.action.operationId), [f.root.action.operationId, f.next.action.operationId]);
  assert.equal(result.head.action.operationId, f.edit.action.operationId); assert.equal(f.edit.action.body.photoResults.version, 6);
  assert.equal(personalPendingFormUpdateSource(f)?.action.operationId, f.next.action.operationId);
});

test("pending file chain cannot skip a parent, borrow a checkpoint, transplant fields, change a photo or switch actor", () => {
  for (const mutate of [
    f => { f.records = f.records.filter(record => record !== f.root); }, f => { f.records.push(f.root); },
    f => { f.next.action.body.causal.dependsOn = []; },
    f => { f.next.action.previousLocalOperationId = f.root.action.operationId; delete f.next.action.body.causal.baseOperationId; },
    f => { f.next.action.generation = 9; }, f => { f.next.action.actorId = "other"; },
    f => { f.next.action.body.ownerResult.owner.name = "Different predecessor"; },
    f => { f.edit.action.body.payload.items.owner.photos[0].assetId = randomUUID(); },
    f => { f.edit.action.body.photoResults.operationId = f.root.action.operationId; },
    f => { f.next.action.body.causal.baseOperationId = f.next.action.operationId; f.next.action.body.ownerResult.operationId = f.next.action.operationId; }
  ]) { const f = fixture(); mutate(f); assert.equal(chain(f), null, mutate.toString()); }
});

async function durableFixture() {
  const f = fixture(), values = new Map(), encoded = new Map(), binding = { environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list" };
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = (enabled = true) => createPersonalSaveOutbox({ ...binding, storage, photoEnabled: true, photoFormEnabled: true,
    photoBatchEnabled: true, photoBatchCancellationEnabled: true, photoEditEnabled: true, formOwnerResultEnabled: enabled, pendingFormUpdateEnabled: enabled });
  const outbox = make(), context = { ...binding, scope: "personal", generation: "opened-form" };
  outbox.adoptRemoteBaseline({ snapshot: f.root.mergeBase.payload, payload: f.root.mergeBase.payload, stateRevision: 1 });
  const store = { binding, read: async operationId => decodePersonalPhotoFormRecord(encoded.get(operationId), binding, operationId) };
  const saveFiles = async plan => {
    const files = plan.action.body.changes.filter(change => change.action === "attach").map(change => ({ stage: { operationId: change.assetId,
      entityType: change.entityType, entityId: change.entityId, photoId: change.photoId, fileName: "photo.png" },
      file: new Blob([`bytes for ${change.photoId}`], { type: "image/png" }), thumb: null }));
    encoded.set(plan.action.operationId, await encodePersonalPhotoFormRecord({ binding, action: plan.action, snapshot: plan.snapshot, files }));
  };
  const prepare = record => { const body = structuredClone(record.action.body); delete body.causal;
    return outbox.preparePhoto({ body, snapshot: record.snapshot, payload: record.photoState.payload, operationId: record.action.operationId }); };
  const first = prepare(f.root); await saveFiles(first);
  await outbox.capturePhoto({ plan: first, store, getContext: () => context });
  return { ...f, outbox, make, prepare, saveFiles, store, context, storage, encoded };
}

test("real outbox links two independently retained file records and a DB child, then reads the whole chain with writers disabled", async () => {
  const f = await durableFixture(), plan = f.prepare(f.next); await f.saveFiles(plan);
  const next = await f.outbox.capturePhoto({ plan, store: f.store, getContext: () => f.context });
  assert.deepEqual(next.action.body.ownerResult, plan.action.body.ownerResult);
  assert.equal(f.make(false).recover().action.operationId, next.action.operationId);
  const edit = f.outbox.capture({ snapshot: f.edit.snapshot, body: { payload: f.edit.action.body.payload }, operationId: f.edit.action.operationId });
  assert.equal(edit.action.body.photoResults.version, 6); assert.equal(edit.action.body.photoResults.operationId, next.action.operationId);
  assert.equal(f.make(false).recover().action.operationId, edit.action.operationId);
  for (const record of [f.root, f.next]) {
    const saved = await f.store.read(record.action.operationId);
    assert.equal(saved.files.length, 1); assert.equal(await saved.files[0].file.text(), `bytes for ${record.action.body.changes[0].photoId}`);
  }
  const changed = structuredClone(edit.snapshot); changed.items.owner.weight = 99;
  assert.throws(() => f.make(false).capture({ snapshot: changed, body: { payload: changed } }), { code: "form-pending" });
});

test("a third file-owning form follows an intervening DB edit and keeps all three binary records", async () => {
  const f = await durableFixture(), plan = f.prepare(f.next); await f.saveFiles(plan);
  const second = await f.outbox.capturePhoto({ plan, store: f.store, getContext: () => f.context });
  const edit = f.outbox.capture({ snapshot: f.edit.snapshot, body: { payload: f.edit.action.body.payload, baseStateRevision: 1 } });
  const prepared = preparePersonalPendingPhotoForm({ binding: f.outbox.binding, snapshot: edit.snapshot, basePayload: edit.action.body.payload,
    baseStateRevision: 1, entityType: "item", entityId: "owner", parentOperationId: edit.action.operationId,
    fields: { name: "Third file form" }, files: [{ file: new Blob(["third bytes"], { type: "image/png" }), fileName: "third.png" }] }, { enabled: true });
  const thirdPlan = f.outbox.preparePhoto(prepared); await f.saveFiles(thirdPlan);
  const third = await f.outbox.capturePhoto({ plan: thirdPlan, store: f.store, getContext: () => f.context });
  const result = chain({ records: f.outbox.list(), operationId: third.action.operationId, listId: "list" });
  assert.deepEqual(result.forms.map(record => record.action.operationId), [f.root.action.operationId, second.action.operationId, third.action.operationId]);
  assert.equal(result.steps.length, 4); assert.equal(third.action.body.ownerResult.operationId, edit.action.operationId);
  assert.equal(f.make(false).recover().photoState.payload.items.owner.photos.length, 3);
  for (const form of result.forms) assert.equal((await f.store.read(form.action.operationId)).files.length, 1);
});

test("a fileless manufacturer root supports a later complete file form without inventing an original binary record", async () => {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list" };
  const values = new Map(), encoded = new Map(), base = { items: {}, containers: {}, layouts: {} };
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const outbox = createPersonalSaveOutbox({ ...binding, storage, photoEnabled: true, photoFormEnabled: true, photoBatchEnabled: true,
    manufacturerSourceEnabled: true, formOwnerResultEnabled: true, pendingFormUpdateEnabled: true });
  const context = { ...binding, scope: "personal", generation: "fileless-root" }, store = { binding: outbox.binding, ids: async () => [...encoded.keys()],
    read: id => decodePersonalPhotoFormRecord(encoded.get(id), outbox.binding, id),
    captureForm: async input => encoded.set(input.action.operationId, await encodePersonalPhotoFormRecord({ ...input, binding: outbox.binding })) };
  outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 1 });
  const source = { version: 1, entry: { id: "catalog-bag", brand: "Fixture", imageUrl: "/original.webp", arbitrary: { retained: true } }, imageUrls: ["/original.webp"] };
  const first = preparePersonalPhotoFormAttachments({ binding, snapshot: base, basePayload: base, baseStateRevision: 1,
    entityType: "container", entityId: "bag", baseEntityRevision: 0, fields: { name: "Fileless catalog bag" }, files: [], manufacturerSource: source },
  { enabled: true, manufacturerSourceEnabled: true });
  const root = await outbox.capturePhoto({ plan: outbox.preparePhoto(first), store, getContext: () => context });
  assert.equal(root.photoState.fileIntentHash, null); assert.equal(encoded.size, 0);
  const session = createPersonalPendingPhotoFormSession({ outbox, store, getContext: () => context, enabled: true, onDurable: () => {} });
  const result = await session.submit({ binding: outbox.binding, snapshot: root.snapshot, basePayload: root.photoState.payload, baseStateRevision: 1,
    entityType: "container", entityId: "bag", created: false, parentOperationId: root.action.operationId, fields: { name: "Now with my photo" },
    files: [{ file: new Blob(["my original photo"], { type: "image/png" }), fileName: "my.png" }] });
  assert.equal(result.record.photoState.payload.containers.bag.manufacturerCatalogSource.catalogId, "catalog-bag");
  assert.deepEqual(result.record.action.body.ownerResult.owner, root.photoState.payload.containers.bag);
  assert.equal(encoded.size, 1); assert.equal((await store.read(result.record.action.operationId)).files.length, 1);
});

test("quota after the second native file commit preserves its unlinked bytes and the entire first queued form", async () => {
  const f = await durableFixture(), plan = f.prepare(f.next); await f.saveFiles(plan);
  const before = f.outbox.list(), write = f.storage.setItem;
  f.storage.setItem = (key, value) => { if (key.endsWith(f.next.action.operationId)) throw Error("Injected quota"); write(key, value); };
  await assert.rejects(f.outbox.capturePhoto({ plan, store: f.store, getContext: () => f.context }));
  assert.deepEqual(f.make().list(), before); assert.equal(f.encoded.size, 2);
  assert.equal((await f.store.read(f.next.action.operationId)).files.length, 1);
});

for (const mode of ["pending", "first committed", "all committed", "lost cancellation ACK"]) test(`whole file-chain cancellation retains every original file (${mode})`, async () => {
  const f = await durableFixture(), plan = f.prepare(f.next); await f.saveFiles(plan);
  const next = await f.outbox.capturePhoto({ plan, store: f.store, getContext: () => f.context });
  const edit = f.outbox.capture({ snapshot: f.edit.snapshot, body: { payload: f.edit.action.body.payload }, operationId: f.edit.action.operationId });
  const before = f.outbox.list(), proofs = new Map(), calls = [], stages = [];
  const proof = (action, state) => ({ historicalOnly: true, operation: { id: action.operationId, kind: action.kind,
    ...f.outbox.binding, state, payloadDigest: createHash("sha256").update(canonicalListOperationJson({ environment: action.environment,
      actorId: action.actorId, kind: action.kind, listId: action.listId, body: action.body })).digest("hex") },
    resultStatus: state === "committed" ? 200 : 409, stateRevision: state === "committed" ? 2 : null });
  const forms = before.filter(record => record.action.kind === "photos.mutate");
  if (mode === "first committed") proofs.set(forms[0].action.operationId, proof(forms[0].action, "committed"));
  if (mode === "all committed") for (const form of forms) proofs.set(form.action.operationId, proof(form.action, "committed"));
  let lose = mode === "lost cancellation ACK";
  const queue = { inspect: async request => {
    if (!proofs.has(request.operationId)) throw Object.assign(Error("unknown"), { isOperationReceiptError: true });
    return proofs.get(request.operationId);
  }, supportsCancellation: () => true, cancelExact: async request => {
    const original = before.find(record => record.action.operationId === request.operationId);
    assert.deepEqual(JSON.parse(request.body), original.action.body); calls.push(request.operationId);
    const result = proof(original.action, "rejected"); proofs.set(request.operationId, result);
    if (lose) { lose = false; throw Error("lost cancellation ACK"); } return result;
  } };
  const photoStaging = { inspect: async () => { throw Object.assign(Error("Unknown stage"), { isPhotoStagingBlocked: true }); }, cancel: async (actionId, stageId) => {
    stages.push(stageId); const saved = await f.store.read(actionId), part = saved.files.find(file => file.stage.operationId === stageId);
    return { ok: true, historicalStageOnly: true, actionOperationId: actionId,
      operation: { ...f.outbox.binding, ...part.stage, id: stageId, state: "cancelled", payloadDigest: "d".repeat(64) },
      cancellation: { version: 1, stageOperationId: stageId, fileHash: part.fileMetadata.hash,
        thumbHash: part.fileMetadata.hash, noAssetPublished: true, stageCannotPublish: true } };
  } };
  const options = { queue, photoStaging, photoStore: f.store, getContext: () => f.context };
  const gates = { records: before, batchEnabled: true, formEnabled: true, editEnabled: true, pendingFormUpdateEnabled: true };
  assert.equal(personalPhotoRecoveryCancellationHead(edit, gates), false);
  assert.equal(personalPhotoRecoveryCancellationHead(edit, { ...gates, formOwnerResultEnabled: true }), true);
  await assert.rejects(f.make(false).cancelPhotoUpload(options), { code: "photo-cancellation" });
  if (mode === "lost cancellation ACK") await assert.rejects(f.outbox.cancelPhotoUpload(options), /lost cancellation ACK/);
  const result = await f.outbox.cancelPhotoUpload(options);
  assert.equal(Boolean(result.alreadyPublished), mode === "all committed");
  assert.deepEqual(calls, mode === "all committed" ? [] : [
    ...(mode === "first committed" ? [] : [forms[0].action.operationId]), next.action.operationId, edit.action.operationId]);
  assert.equal(stages.length, mode === "all committed" ? 0 : mode === "first committed" ? 1 : 2);
  assert.deepEqual(f.outbox.list(), before); assert.equal(f.encoded.size, 2);
  for (const form of forms) assert.equal((await f.store.read(form.action.operationId)).files.length, 1);
});

test("pending file session freezes before storage awaits and a repeated save keeps the same IDs and bytes", async () => {
  const f = await durableFixture(); let release, ids = 0, captured = 0, applied = 0, held = false;
  f.store.ids = () => held ? Promise.resolve([...f.encoded.keys()])
    : new Promise(resolve => { held = true; release = () => resolve([...f.encoded.keys()]); });
  f.store.captureForm = async input => { captured++; f.encoded.set(input.action.operationId,
    await encodePersonalPhotoFormRecord({ ...input, binding: f.store.binding })); };
  const session = createPersonalPendingPhotoFormSession({ outbox: f.outbox, store: f.store, getContext: () => f.context, enabled: true,
    createUuid: () => { ids++; return randomUUID(); }, onDurable: () => { applied++; } });
  const input = { binding: f.outbox.binding, snapshot: f.root.snapshot, basePayload: f.root.photoState.payload, baseStateRevision: 1,
    parentOperationId: f.root.action.operationId, entityType: "item", entityId: "owner", created: false, fields: { name: "Frozen next form" },
    files: [{ file: new Blob(["exact next bytes"], { type: "image/png" }), fileName: "next.png" }] };
  const pending = session.submit(input); assert.equal(session.submit(input), pending);
  assert.equal(ids, 3); assert.equal(captured, 0); assert.equal(session.state().phase, "checking-storage");
  input.fields.name = "Later input"; input.files[0].file = new Blob(["different"], { type: "image/png" });
  release(); const result = await pending;
  assert.equal(result.record.action.body.fields.name, "Frozen next form"); assert.equal(applied, 1); assert.equal(captured, 1); assert.equal(ids, 3);
  const saved = await f.store.read(result.record.action.operationId); assert.equal(await saved.files[0].file.text(), "exact next bytes");
});
