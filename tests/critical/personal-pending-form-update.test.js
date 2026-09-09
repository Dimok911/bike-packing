import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { preparePersonalPhotoFormAttachments } from "../../src/sync/personal-photo-form-plan.js";
import { preparePersonalPhotoEditForm } from "../../src/sync/personal-photo-edit-form.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { personalPhotoRecoveryCancellationHead } from "../../src/sync/personal-photo-recovery-cancel.js";
import { isPersonalPendingFormUpdate, personalFormPhotoResultReference, personalPendingFormUpdateSource, validatePersonalPendingFormUpdateResult } from "../../src/sync/personal-pending-form-update.js";

async function fixture({ created = true, fileless = false } = {}) {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const photos = [0, 1, 2].map(index => ({ id: `old-${index}`, photoId: `old-${index}`, assetId: randomUUID(), listId: "list", status: "synced",
    url: `https://files.example/${index}`, thumbUrl: `https://files.example/thumb-${index}`, fileName: `${index}.png`, type: "image/png", size: 12, width: 1, height: 1 }));
  const base = { locations: [], categories: [], items: created ? {} : { owner: { id: "owner", name: "Old owner", photos } }, containers: {}, layouts: {} };
  const input = { binding, snapshot: base, basePayload: base, baseStateRevision: 4, entityType: "item", entityId: "owner",
    baseEntityRevision: created ? 0 : 3, fields: { name: "Frozen owner" } };
  const plan = fileless ? preparePersonalPhotoEditForm({ ...input, operationId: randomUUID(), photoIds: [photos[2].id, photos[0].id],
    photoRevisions: photos.map(photo => ({ photoId: photo.id, assetId: photo.assetId, photoRevision: 3 })) }, { enabled: true })
    : preparePersonalPhotoFormAttachments({ ...input, files: [1, 2].map(index => ({ file: new Blob([`selected file ${index}`], { type: "image/png" }) })) }, { enabled: true });
  const action = { ...binding, operationId: plan.operationId, generation: 1, kind: "photos.mutate", body: plan.body };
  let saved = null;
  if (!fileless) saved = await decodePersonalPhotoFormRecord(await encodePersonalPhotoFormRecord({ binding, action, snapshot: plan.snapshot, files: plan.files }), binding, action.operationId);
  const source = { version: 1, action, snapshot: plan.snapshot, mergeBase: { payload: base, stateRevision: 4 },
    photoState: { version: 1, payload: plan.payload, fileIntentHash: saved?.intentHash || null, ...(saved ? { fileInventoryVersion: 2 } : {}) } };
  return { source, saved, plan, binding };
}
const allowed = (source, payload, options = {}) => isPersonalPendingFormUpdate({ source, basePayload: source.photoState.payload, payload, listId: "list", ...options });
function child(source, previous, payload, userDeletion) {
  return { version: 1, snapshot: structuredClone(payload), action: { ...source.action, kind: "list.update", operationId: randomUUID(),
    generation: previous.action.generation + 1, body: { baseStateRevision: 4, payload, ...(userDeletion ? { userDeletion } : {}),
      photoResults: personalFormPhotoResultReference(source), causal: { baseOperationId: previous.action.operationId, reads: [],
        dependsOn: [...new Set([previous.action.operationId, source.action.operationId])].map(operationId => ({ operationId, listId: "list" })) } } } };
}

for (const mode of ["new", "mixed", "fileless"]) test(`pending ${mode} form allows DB fields and preserves every selected reference`, async () => {
  const { source } = await fixture({ created: mode === "new", fileless: mode === "fileless" });
  const before = structuredClone(source), next = structuredClone(source.photoState.payload);
  next.items.owner.name = "Later user edit"; next.items.other = { id: "other", name: "Another item", photos: [] };
  assert.equal(allowed(source, next), true); assert.deepEqual(source, before);
  for (const mutate of [value => value.items.owner.photos.reverse(), value => value.items.owner.photos.pop(),
    value => { value.items.other.photos = [structuredClone(value.items.owner.photos[0])]; },
    value => { value.items.owner.photos[0].url = "https://invented.example/photo"; },
    value => { delete value.items.owner; }]) {
    const changed = structuredClone(next); mutate(changed); assert.equal(allowed(source, changed), false);
  }
  const deletion = { type: "item", id: "owner" }, removed = preparePersonalDeletionBatch(next, deletion).snapshot;
  assert.equal(allowed(source, removed, { basePayload: next, userDeletion: deletion }), true);
  assert.equal(allowed(source, next, { basePayload: removed }), false);
});

test("descendant receipts preserve the complete edit and materialize only exact pending photo identities", async () => {
  for (const fileless of [false, true]) {
    const { source } = await fixture({ created: !fileless, fileless });
    const expected = child(source, source, structuredClone(source.photoState.payload)).action;
    expected.body.payload.items.owner.weight = 222;
    const payload = structuredClone(expected.body.payload);
    payload.items.owner.photos = payload.items.owner.photos.map(photo => photo.status === "pending" ? { ...photo, status: "synced", url: `https://files.example/${photo.id}` } : photo);
    const result = { ok: true, stateRevision: 6, list: { id: "list", stateRevision: 6, payload } };
    assert.equal(validatePersonalPendingFormUpdateResult(result, expected), true);
    const before = structuredClone(expected);
    for (const mutate of [value => { value.stateRevision = 4; }, value => { value.list.stateRevision = 7; },
      value => { value.list.payload.items.owner.weight = 111; }, value => { delete value.list.payload.layouts; },
      value => value.list.payload.items.owner.photos.reverse(), value => value.list.payload.items.owner.photos.pop(),
      value => { value.list.payload.items.owner.photos[0].assetId = randomUUID(); },
      value => { value.list.payload.items.owner.photos[0].listId = "other-list"; },
      value => { value.list.payload.items.owner.photos[0].status = "pending"; }]) {
      const changed = structuredClone(result); mutate(changed); assert.equal(validatePersonalPendingFormUpdateResult(changed, expected), false);
    }
    assert.deepEqual(expected, before);
  }
});

test("recovery exposes cancellation only for the complete enabled ordinary form ancestry", async () => {
  for (const fileless of [false, true]) {
    const { source } = await fixture({ created: !fileless, fileless }), first = child(source, source, source.photoState.payload);
    const deletion = { type: "item", id: "owner" }, last = child(source, first, preparePersonalDeletionBatch(first.action.body.payload, deletion).snapshot, deletion);
    const flags = { records: [source, first, last], pendingFormUpdateEnabled: true, batchEnabled: true, formEnabled: true, editEnabled: true };
    assert.equal(Boolean(personalPhotoRecoveryCancellationHead(last, flags)), true);
    for (const flag of ["pendingFormUpdateEnabled", "batchEnabled", "formEnabled", ...(fileless ? ["editEnabled"] : [])]) {
      assert.equal(Boolean(personalPhotoRecoveryCancellationHead(last, { ...flags, [flag]: false })), false);
    }
    assert.equal(Boolean(personalPhotoRecoveryCancellationHead(last, { ...flags, records: [source, last] })), false);
  }
});

test("pending form ancestry validates every intermediate payload, parent, generation and binding", async () => {
  const { source } = await fixture(), firstPayload = structuredClone(source.photoState.payload); firstPayload.items.owner.note = "First edit";
  const first = child(source, source, firstPayload), deletion = { type: "item", id: "owner" };
  const second = child(source, first, preparePersonalDeletionBatch(firstPayload, deletion).snapshot, deletion);
  const records = [source, first, second], find = values => personalPendingFormUpdateSource({ records: values, operationId: second.action.operationId, listId: "list" });
  assert.equal(find(records), source);
  assert.equal(personalPendingFormUpdateSource({ records, operationId: source.action.operationId, listId: "list" }), null);
  assert.equal(personalPendingFormUpdateSource({ records, operationId: source.action.operationId, listId: "list", includeSource: true }), source);
  for (const mutate of [values => values.splice(1, 1), values => values.push(structuredClone(values[0])),
    values => { values[1].action.body.payload.items.owner.photos.reverse(); },
    values => { values[1].action.generation++; }, values => { values[1].action.actorId = "other"; },
    values => { values[2].action.body.causal.dependsOn.pop(); },
    values => { values[2].action.body.causal.baseOperationId = values[2].action.operationId; },
    values => { values[2].action.body.payload.items.owner = structuredClone(source.photoState.payload.items.owner); },
    values => { values[1].mergeBase = { payload: {}, stateRevision: 4 }; }]) {
    const changed = structuredClone(records); mutate(changed); assert.equal(find(changed), null);
  }
});

test("actual outbox records a dependent form edit atomically, reloads with writers off and preserves quota failures", async () => {
  const f = await fixture(), values = new Map(); let quota = false;
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (quota) throw new DOMException("Full journal", "QuotaExceededError"); values.set(key, value); }, removeItem: key => values.delete(key) };
  const make = enabled => createPersonalSaveOutbox({ ...f.binding, storage, photoEnabled: true, photoBatchEnabled: true, photoFormEnabled: true, pendingFormUpdateEnabled: enabled });
  const outbox = make(true), base = f.source.mergeBase.payload;
  outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 4 });
  const plan = outbox.preparePhoto({ snapshot: f.plan.snapshot, payload: f.plan.payload, body: f.plan.body, operationId: f.plan.operationId });
  const encoded = await encodePersonalPhotoFormRecord({ binding: f.binding, action: plan.action, snapshot: plan.snapshot, files: f.plan.files });
  const store = { read: operationId => decodePersonalPhotoFormRecord(encoded, f.binding, operationId) };
  const source = await outbox.capturePhoto({ plan, store, getContext: () => ({ ...f.binding, scope: "personal", generation: "editing" }) });
  const snapshot = structuredClone(source.photoState.payload); snapshot.items.owner.weight = 73;
  const record = outbox.capture({ snapshot, body: { payload: snapshot, baseStateRevision: 4 } });
  assert.equal(record.action.body.photoResults.version, 5);
  assert.equal(record.action.body.causal.baseOperationId, source.action.operationId);
  assert.deepEqual(record.action.body.causal.dependsOn, [{ operationId: source.action.operationId, listId: "list" }]);
  const readOnly = make(false); assert.equal(readOnly.hasPending(), true); assert.deepEqual(readOnly.recover(), record);
  const before = [...values], changed = structuredClone(snapshot); changed.items.owner.weight = 74;
  assert.throws(() => readOnly.capture({ snapshot: changed, body: { payload: changed, baseStateRevision: 4 } }), /продолжение/);
  assert.deepEqual([...values], before);
  const next = make(true); quota = true;
  assert.throws(() => next.capture({ snapshot: changed, body: { payload: changed, baseStateRevision: 4 } }));
  assert.deepEqual([...values], before); quota = false;
  assert.deepEqual(make(true).recover(), record); assert.equal((await store.read(source.action.operationId)).files.length, 2);
});
