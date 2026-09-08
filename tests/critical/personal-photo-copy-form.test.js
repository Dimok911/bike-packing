import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPersonalPhotoCopyFormSession } from "../../src/sync/personal-photo-copy-form.js";
import { PERSONAL_PHOTO_COPY_FORM_ENABLED } from "../../src/sync/personal-photo-copy-source.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { assertPersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-outbox-record.js";
import { personalPhotoFormManifest, validatePersonalPhotoFormResult } from "../../src/sync/personal-photo-form-protocol.js";
import { personalPhotoRecoveryCancellationHead } from "../../src/sync/personal-photo-recovery-cancel.js";
import { inspectPersonalPhotoRecovery } from "../../src/sync/personal-photo-recovery-inventory.js";
import { personalPendingPhotoCopyDeletionForm, personalPhotoCopyResultReference, isPersonalPendingPhotoCopyDeletion } from "../../src/sync/personal-pending-photo-copy-deletion.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";
import { cloneStateForSyncPayload } from "../../src/sync/serialize.js";

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture(entityType = "item") {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const context = { ...binding, generation: "before", scope: "personal" }, values = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const base = { items: {}, containers: {}, layouts: {} }, collection = entityType === "item" ? "items" : "containers";
  base[collection].source = { id: "source", name: "Chosen source", weight: 38, customSourceValue: { immutable: true },
    ...(entityType === "item" ? { quantity: 1, containerId: "" } : { parentId: null, childIds: [], itemIds: [], order: [] }),
    photos: [1, 2].map(i => ({ id: `source-photo-${i}`, photoId: `source-photo-${i}`, assetId: randomUUID(), listId: "list", status: "synced",
      url: `/source/${i}`, thumbUrl: `/thumb/${i}`, fileName: `${i}.png`, type: "image/png", size: 20, width: 1, height: 1 })) };
  const owner = base[collection].source;
  const outboxOptions = { ...binding, storage, photoEnabled: true, photoFormEnabled: true, photoCopyEnabled: true, photoBatchCancellationEnabled: true };
  const outbox = createPersonalSaveOutbox(outboxOptions); outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 7 });
  const store = { binding, ids: async () => [], read: async () => assert.fail("Copy never reads an upload") };
  const request = { binding, snapshot: structuredClone(base), basePayload: structuredClone(base), baseStateRevision: 7,
    entityType, sourceId: "source", fields: { name: "Frozen copy", createdAt: "2026-09-08T10:00:00Z" } };
  const response = { version: 1, ok: true, readOnly: true, environment: binding.environment, actorId: "actor", listId: "list", stateRevision: 7,
    owner: { entityType, entityId: "source", entityRevision: 5, payload: structuredClone(owner) },
    photos: owner.photos.map((photo, i) => ({ photoId: photo.id, assetId: photo.assetId, photoRevision: i + 2 })) };
  const events = [], options = { outbox, store, getContext: () => context, enabled: true,
    readOwner: async () => { events.push("get"); return response; }, onDurable: record => { assertPersonalPhotoFormRecord(record); assert.equal(outbox.list().length, 1); events.push("view"); } };
  return { binding, base, collection, storage, values, context, outbox, outboxOptions, store, request, response, events, options };
}

for (const type of ["item", "container"]) test(`copy ${type} freezes all IDs before confirmation, source read and durable view`, async () => {
  const f = fixture(type), scan = deferred(); f.store.ids = async () => { await scan.promise; return []; };
  let uuids = 0;
  const session = createPersonalPhotoCopyFormSession({ ...f.options, createUuid: () => { uuids++; return randomUUID(); } });
  session.prepare(f.request); const frozenIds = session.recoveryCopy().ids;
  assert.equal(uuids, 6); assert.deepEqual(f.events, []); assert.equal(f.outbox.list().length, 0);
  f.request.fields.name = "Late name"; f.request.basePayload[f.collection].source.weight = 99;
  const promise = session.submit(); assert.equal(session.submit(), promise); scan.resolve();
  const { record } = await promise;
  assert.equal(uuids, 6); assert.equal(record.action.operationId, frozenIds[0]); assert.equal(record.action.body.fields.name, "Frozen copy");
  assert.equal(record.action.body.copySource.entityRevision, 5); assert.equal(record.action.body.copySource.payload.weight, 38);
  assert.deepEqual(record.action.body.changes.map(c => c.source.photoRevision), [2, 3]);
  const owner = record.photoState.payload[f.collection][record.action.body.entityId];
  assert.equal(owner.weight, 38); assert.deepEqual(owner.customSourceValue, { immutable: true });
  assert.deepEqual(owner.photos.map(p => p.status), ["pending", "pending"]); assert.equal(record.photoState.fileIntentHash, null);
  assert.deepEqual(f.events, ["get", "view"]);
  const reader = createPersonalSaveOutbox({ ...f.binding, storage: f.storage });
  assert.deepEqual(reader.recover().action, record.action);
  assert.equal((await inspectPersonalPhotoRecovery({ ...f.options, outbox: reader })).entries[0].state, "linked");
  await assert.rejects(reader.drain({ queue: {}, getContext: f.options.getContext }));
});

test("copy failure preserves the chosen recovery preview without applying or reallocating IDs", async () => {
  for (const mode of ["quota", "changed-source", "deleted-source", "account", "pending"]) {
    const f = fixture(), session = createPersonalPhotoCopyFormSession(f.options); session.prepare(f.request);
    const ids = session.recoveryCopy().ids;
    if (mode === "quota") f.storage.setItem = () => { throw Error("quota"); };
    if (mode === "changed-source") f.response.owner.payload.name = "Newer";
    if (mode === "deleted-source") f.response.owner = null;
    if (mode === "account") f.context.actorId = "other";
    if (mode === "pending") f.outbox.capture({ snapshot: f.base, body: { payload: f.base, baseStateRevision: 7 } });
    const before = [...f.values], promise = session.submit(); await assert.rejects(promise); assert.equal(session.submit(), promise);
    assert.deepEqual([...f.values], before); assert.equal(f.events.includes("view"), false);
    if (mode !== "account") assert.deepEqual(session.recoveryCopy().ids, ids);
  }
  assert.equal(PERSONAL_PHOTO_COPY_FORM_ENABLED, false);
  const f = fixture(); f.options.outbox = createPersonalSaveOutbox({ ...f.outboxOptions, photoCopyEnabled: false });
  f.options.outbox.adoptRemoteBaseline({ snapshot: f.base, payload: f.base, stateRevision: 7 });
  await assert.rejects(createPersonalPhotoCopyFormSession(f.options).submit(f.request), { code: "photo-copy-disabled" });
});

test("copy source manifest rejects incomplete, mixed, cross-owner and mutable field selections", async () => {
  const f = fixture(), { record } = await createPersonalPhotoCopyFormSession(f.options).submit(f.request);
  for (const mutate of [b => { b.copySource.payload.photos.reverse(); }, b => { b.copySource.entityId = b.entityId; },
    b => { b.copySource.entityRevision = "5"; }, b => { b.copySource.payload.sharedSourceId = "template"; },
    b => { b.copySource.payload.photos[0].status = "pending"; }, b => { b.changes.pop(); },
    b => { b.changes[0].source.photoRevision = 6; }, b => { b.changes[0].source.assetId = randomUUID(); },
    b => { b.changes[0].source.listId = "foreign"; }, b => { b.changes[1].index = 0; },
    b => { b.fields.weight = 900; }, b => { b.baseEntityRevision = 5; }, b => { delete b.copySource; }]) {
    const body = structuredClone(record.action.body); mutate(body); assert.throws(() => personalPhotoFormManifest(body));
  }
  const changed = structuredClone(record); changed.photoState.payload.items.source.name = "Hidden edit";
  assert.throws(() => assertPersonalPhotoFormRecord(changed));
  const foreign = structuredClone(record); foreign.action.body.copySource.listId = "foreign";
  foreign.action.body.copySource.payload.photos.forEach(p => { p.listId = "foreign"; });
  foreign.action.body.changes.forEach(c => { c.source.listId = "foreign"; });
  assert.throws(() => assertPersonalPhotoFormRecord(foreign));
});

test("copy receipt must prove the full copied owner and every immutable photo identity and metadata", async () => {
  const f = fixture(), { record } = await createPersonalPhotoCopyFormSession(f.options).submit(f.request);
  const body = record.action.body, payload = structuredClone(record.photoState.payload), owner = payload.items[body.entityId];
  owner.photos = body.changes.map((change, index) => ({ ...body.copySource.payload.photos[index], id: change.photoId, photoId: change.photoId,
    assetId: change.assetId, url: `/result/${change.photoId}`, thumbUrl: `/result-thumb/${change.photoId}` }));
  const result = { ok: true, stateRevision: 8, list: { id: "list", stateRevision: 8, payload },
    photoForm: { entityType: "item", entityId: body.entityId, created: true },
    photoChanges: body.changes.map((change, index) => ({ index, action: "copy", entityType: "item", entityId: body.entityId,
      photoId: change.photoId, assetId: change.assetId, photoIds: owner.photos.slice(0, index + 1).map(p => p.id), photo: owner.photos[index] })) };
  assert.equal(validatePersonalPhotoFormResult(result, { body, listId: "list" }), true);
  for (const mutate of [r => { r.list.payload.items[body.entityId].customSourceValue.immutable = false; },
    r => { r.photoChanges.pop(); }, r => { r.photoForm.created = false; },
    r => { r.photoChanges[0].assetId = randomUUID(); }, r => { r.list.payload.items[body.entityId].photos.reverse(); },
    r => { r.photoChanges[0].photo.width++; r.list.payload.items[body.entityId].photos[0].width++; }]) {
    const changed = structuredClone(result); mutate(changed); assert.equal(validatePersonalPhotoFormResult(changed, { body, listId: "list" }), false);
  }
  assert.equal(personalPhotoRecoveryCancellationHead(record, { batchEnabled: true, formEnabled: true, editEnabled: true, copyEnabled: false }), false);
  assert.equal(personalPhotoRecoveryCancellationHead(record, { batchEnabled: true, formEnabled: true, editEnabled: false, copyEnabled: true }), true);
});

for (const entityType of ["item", "container"]) test(`pending ${entityType} copy deletion validates every result edge and cannot revive either owner`, async () => {
  const f = fixture(entityType), { record: form } = await createPersonalPhotoCopyFormSession(f.options).submit(f.request);
  const reference = personalPhotoCopyResultReference(form), targetId = form.action.body.entityId;
  for (const firstId of ["source", targetId]) {
    const first = preparePersonalDeletionBatch(form.photoState.payload, { type: entityType, id: firstId });
    const child = { action: { ...f.binding, operationId: randomUUID(), kind: "list.update", generation: 2,
      body: { payload: first.snapshot, baseStateRevision: 7, userDeletion: first.intent, photoResults: reference,
        causal: { baseOperationId: form.action.operationId, dependsOn: [{ operationId: form.action.operationId, listId: "list" }], reads: [] } } },
      mergeBase: { payload: form.photoState.payload, stateRevision: 7 } };
    assert.equal(isPersonalPendingPhotoCopyDeletion({ form, basePayload: form.photoState.payload, payload: first.snapshot, userDeletion: first.intent, listId: "list" }), true);
    assert.equal(personalPendingPhotoCopyDeletionForm({ records: [form, child], operationId: child.action.operationId, listId: "list" }), form);
    const second = preparePersonalDeletionBatch(first.snapshot, { type: entityType, id: firstId === "source" ? targetId : "source" });
    const grandchild = { action: { ...f.binding, operationId: randomUUID(), kind: "list.update", generation: 3,
      body: { payload: second.snapshot, baseStateRevision: 7, userDeletion: second.intent, photoResults: reference,
        causal: { baseOperationId: child.action.operationId, dependsOn: [{ operationId: child.action.operationId, listId: "list" },
          { operationId: form.action.operationId, listId: "list" }], reads: [] } } }, mergeBase: { payload: first.snapshot, stateRevision: 7 } };
    const resolve = records => personalPendingPhotoCopyDeletionForm({ records, operationId: grandchild.action.operationId, listId: "list" });
    assert.equal(resolve([grandchild, form, child]), form);
    for (const mutate of [records => { records[0].action.body.causal.dependsOn.pop(); },
      records => { records[0].action.body.photoResults.operationId = randomUUID(); },
      records => { records[0].mergeBase.payload = {}; },
      records => { records[0].action.body.payload[f.collection][firstId] = { id: firstId, name: "Revived", photos: [] }; },
      records => { records[2].action.body.payload[f.collection].hidden = { id: "hidden", photos: [{ id: "pending", status: "pending" }] }; },
      records => { records[0].action.body.causal.baseOperationId = records[0].action.operationId; }]) {
      const records = structuredClone([grandchild, form, child]); mutate(records); assert.equal(resolve(records), null);
    }
  }
});

test("outbox captures source/copy deletion only with its independent gate and derives result links from the stored chain", async () => {
  for (const entityType of ["item", "container"]) for (const target of ["source", "copy"]) {
    const f = fixture(entityType), { record: form } = await createPersonalPhotoCopyFormSession(f.options).submit(f.request);
    const sourceId = target === "source" ? "source" : form.action.body.entityId;
    const deletion = preparePersonalDeletionBatch(form.photoState.payload, { type: entityType, id: sourceId });
    const input = { snapshot: deletion.snapshot, body: { payload: deletion.snapshot, baseStateRevision: 7, userDeletion: deletion.intent } };
    const before = [...f.values]; assert.throws(() => f.outbox.capture(input), { code: "photo-copy-pending" }); assert.deepEqual([...f.values], before);
    const outbox = createPersonalSaveOutbox({ ...f.outboxOptions, pendingPhotoCopyDeletionEnabled: true });
    assert.throws(() => outbox.capture({ ...input, body: { ...input.body, photoResults: personalPhotoCopyResultReference(form) } }), { code: "input" });
    const record = outbox.capture(input);
    assert.deepEqual(record.action.body.photoResults, personalPhotoCopyResultReference(form));
    assert.equal(record.action.body.causal.baseOperationId, form.action.operationId);
    assert.equal(personalPendingPhotoCopyDeletionForm({ records: outbox.list(), operationId: record.action.operationId, listId: "list" }).action.operationId, form.action.operationId);
    const next = preparePersonalDeletionBatch(deletion.snapshot, { type: entityType, id: target === "source" ? form.action.body.entityId : "source" });
    const child = outbox.capture({ snapshot: next.snapshot, body: { payload: next.snapshot, baseStateRevision: 7, userDeletion: next.intent } });
    assert.equal(child.action.body.causal.baseOperationId, record.action.operationId);
    assert.deepEqual(child.action.body.causal.dependsOn.map(dep => dep.operationId), [record.action.operationId, form.action.operationId]);
    assert.deepEqual(outbox.list().find(record => record.action.operationId === form.action.operationId), form);
    const frozen = [...f.values];
    const reader = createPersonalSaveOutbox({ ...f.binding, storage: f.storage });
    assert.deepEqual(reader.capture({ snapshot: { ...next.snapshot, showItemMeta: true }, body: { payload: next.snapshot, baseStateRevision: 7 } }), child);
    assert.deepEqual([...f.values], frozen);
    assert.throws(() => outbox.capture({ snapshot: f.base, body: { payload: f.base, baseStateRevision: 7 } }), { code: "photo-copy-pending" });
    assert.deepEqual([...f.values], frozen);
  }
});

test("pending bag copy survives source deletion with projected catalog fields and cannot acquire a hidden placement", async () => {
  const f = fixture("container"), project = value => cloneStateForSyncPayload(value, { forSync: true });
  f.request.basePayload = project(f.base); f.options.snapshotToPayload = project;
  f.response.owner.payload = structuredClone(f.request.basePayload.containers.source);
  f.outbox.adoptRemoteBaseline({ snapshot: f.base, payload: f.request.basePayload, stateRevision: 7 });
  const { record: form } = await createPersonalPhotoCopyFormSession(f.options).submit(f.request);
  const deletion = preparePersonalDeletionBatch(form.photoState.payload, { type: "container", id: "source" });
  const input = { snapshot: deletion.snapshot, body: { payload: project(deletion.snapshot), baseStateRevision: 7, userDeletion: deletion.intent } };
  const outbox = createPersonalSaveOutbox({ ...f.outboxOptions, pendingPhotoCopyDeletionEnabled: true });
  const record = outbox.capture(input);
  assert.equal(record.action.body.payload.containers[form.action.body.entityId].childIds, undefined);
  for (const mutate of [payload => { payload.containers[form.action.body.entityId].childIds = ["hidden"]; },
    payload => { payload.layouts.hidden = { arrangement: { containers: { [form.action.body.entityId]: {} } } }; }]) {
    const payload = structuredClone(input.body.payload); mutate(payload);
    assert.equal(isPersonalPendingPhotoCopyDeletion({ form, basePayload: form.photoState.payload, payload, userDeletion: deletion.intent, listId: "list" }), false);
  }
});
