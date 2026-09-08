import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPersonalPhotoCopyBatchSession } from "../../src/sync/personal-photo-copy-batch.js";
import { PERSONAL_PHOTO_COPY_BATCH_ENABLED, personalPhotoCopyBatchManifest, assertPersonalPhotoCopyBatchRecord,
  validatePersonalPhotoCopyBatchResult } from "../../src/sync/personal-photo-copy-batch-protocol.js";
import { personalPhotoFormManifest } from "../../src/sync/personal-photo-form-protocol.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { inspectPersonalPhotoRecovery } from "../../src/sync/personal-photo-recovery-inventory.js";
import { personalPhotoRecoveryCancellationHead } from "../../src/sync/personal-photo-recovery-cancel.js";

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture(entityType = "item") {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const context = { ...binding, generation: "before", scope: "personal" }, values = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const base = { items: {}, containers: {}, layouts: {} }, collection = entityType === "item" ? "items" : "containers";
  for (const [index, id] of ["first", "second", "empty", "missing"].entries()) {
    base[collection][id] = { id, name: `Chosen ${id}`, weight: 38, customSourceValue: { immutable: id },
      ...(entityType === "item" ? { quantity: 1, containerId: "" } : { parentId: null, childIds: [], itemIds: [], order: [] }),
      ...(id === "missing" ? {} : { photos: index < 2 ? [1, 2].map(i => ({ id: `${id}-${i}`, photoId: `${id}-${i}`,
        assetId: randomUUID(), listId: "list", status: "synced", url: `/source/${id}/${i}`, thumbUrl: `/thumb/${id}/${i}`,
        fileName: `${i}.png`, type: "image/png", size: 20, width: 1, height: 1 })) : [] }) };
  }
  const outboxOptions = { ...binding, storage, photoEnabled: true, photoFormEnabled: true, photoCopyEnabled: true,
    photoCopyBatchEnabled: true, photoBatchCancellationEnabled: true };
  const outbox = createPersonalSaveOutbox(outboxOptions); outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 7 });
  const store = { binding, ids: async () => [], read: async () => assert.fail("Copy never reads an upload") };
  const request = { binding, snapshot: structuredClone(base), basePayload: structuredClone(base), baseStateRevision: 7,
    entityType, sourceIds: ["first", "second", "empty", "missing"], changedAt: "2026-09-08T10:00:00Z", editMeta: {} };
  const responses = Object.fromEntries(request.sourceIds.map(entityId => [entityId, { version: 1, ok: true, readOnly: true,
    environment: binding.environment, actorId: "actor", listId: "list", stateRevision: 7,
    owner: { entityType, entityId, entityRevision: 5, payload: structuredClone(base[collection][entityId]) },
    photos: (base[collection][entityId].photos || []).map((photo, i) => ({ photoId: photo.id, assetId: photo.assetId, photoRevision: i + 2 })) }]));
  const events = [], options = { outbox, store, getContext: () => context, enabled: true,
    readOwner: async path => { const id = new URL(path, "http://test").searchParams.get("entityId"); events.push(`get:${id}`); return responses[id]; },
    onDurable: record => { assertPersonalPhotoCopyBatchRecord(record); assert.equal(outbox.list().length, 1); events.push("view"); } };
  return { binding, base, collection, storage, values, context, outbox, outboxOptions, store, request, responses, events, options };
}

for (const type of ["item", "container"]) test(`selected ${type} copies freeze all sources and identities before any await, including owners without photos`, async () => {
  const f = fixture(type), scan = deferred(); f.store.ids = async () => { await scan.promise; return []; };
  let uuids = 0;
  const session = createPersonalPhotoCopyBatchSession({ ...f.options, createUuid: () => { uuids++; return randomUUID(); } });
  session.prepare(f.request); const ids = session.recoveryCopy().ids;
  assert.equal(uuids, 13); assert.deepEqual(f.events, []); assert.equal(f.outbox.list().length, 0);
  f.request.sourceIds.reverse(); f.request.basePayload[f.collection].second.weight = 99;
  const promise = session.submit(); assert.equal(session.submit(), promise); scan.resolve(); const { record } = await promise;
  assert.equal(uuids, 13); assert.equal(record.action.operationId, ids[0]);
  assert.deepEqual(record.action.body.owners.map(owner => owner.copySource.entityId), ["first", "second", "empty", "missing"]);
  assert.deepEqual(record.action.body.owners.map(owner => owner.copySource.entityRevision), [5, 5, 5, 5]);
  assert.deepEqual(record.action.body.changes.map(c => c.source.photoRevision), [2, 3, 2, 3]);
  for (const owner of record.action.body.owners) {
    const actual = record.photoState.payload[f.collection][owner.entityId];
    assert.equal(actual.weight, 38); assert.deepEqual(actual.customSourceValue, owner.copySource.payload.customSourceValue);
    assert.equal(actual.photos.length, owner.copySource.payload.photos?.length || 0);
  }
  assert.equal(record.photoState.fileIntentHash, null); assert.deepEqual(f.events, ["get:first", "get:second", "get:empty", "get:missing", "view"]);
  const reader = createPersonalSaveOutbox({ ...f.binding, storage: f.storage });
  assert.deepEqual(reader.recover().action, record.action);
  assert.equal((await inspectPersonalPhotoRecovery({ ...f.options, outbox: reader })).entries[0].state, "linked");
  await assert.rejects(reader.drain({ queue: {}, getContext: f.options.getContext }));
  const gates = { batchEnabled: true, formEnabled: true, copyEnabled: true, copyBatchEnabled: true };
  assert.equal(personalPhotoRecoveryCancellationHead(record, gates), true);
  for (const key of Object.keys(gates)) assert.equal(Boolean(personalPhotoRecoveryCancellationHead(record, { ...gates, [key]: false })), false);
});

test("a late source conflict, quota or account change leaves the whole selected batch unapplied and retains exact retry identity", async () => {
  for (const mode of ["quota", "second-source", "last-source", "last-version", "account", "pending", "batch-gate", "copy-gate", "form-gate"]) {
    const f = fixture();
    if (mode.endsWith("-gate")) {
      const key = { "batch-gate": "photoCopyBatchEnabled", "copy-gate": "photoCopyEnabled", "form-gate": "photoFormEnabled" }[mode];
      f.options.outbox = createPersonalSaveOutbox({ ...f.outboxOptions, [key]: false });
      f.options.outbox.adoptRemoteBaseline({ snapshot: f.base, payload: f.base, stateRevision: 7 });
    }
    const session = createPersonalPhotoCopyBatchSession(f.options); session.prepare(f.request); const ids = session.recoveryCopy().ids;
    if (mode === "quota") f.storage.setItem = () => { throw Error("quota"); };
    if (mode === "second-source") f.responses.second.owner.payload.name = "Newer";
    if (mode === "last-source") f.responses.missing.owner = null;
    if (mode === "last-version") f.responses.missing.stateRevision++;
    if (mode === "account") f.context.actorId = "other";
    if (mode === "pending") f.outbox.capture({ snapshot: f.base, body: { payload: f.base, baseStateRevision: 7 } });
    const before = [...f.values], promise = session.submit(); await assert.rejects(promise); assert.equal(session.submit(), promise);
    assert.deepEqual([...f.values], before); assert.equal(f.events.includes("view"), false);
    if (mode !== "account") assert.deepEqual(session.recoveryCopy().ids, ids);
  }
  assert.equal(PERSONAL_PHOTO_COPY_BATCH_ENABLED, false);
});

test("batch manifest excludes omitted owners/photos, duplicate identities, hidden edits and placement without broadening ordinary forms", async () => {
  const f = fixture(), { record } = await createPersonalPhotoCopyBatchSession(f.options).submit(f.request);
  const manifest = personalPhotoCopyBatchManifest(record.action.body);
  assert.throws(() => personalPhotoFormManifest(manifest.forms[2]));
  for (const mutate of [b => { b.changes.pop(); }, b => { b.owners.shift(); }, b => { b.changes.reverse(); },
    b => { b.owners[1].entityId = b.owners[0].entityId; }, b => { b.owners[1].copySource = b.owners[0].copySource; },
    b => { b.owners[0].copySource.entityRevision = "5"; }, b => { b.owners[0].fields.weight = 999; },
    b => { b.owners[0].copySource.payload.adminDemo = true; }, b => { b.changes[2].photoId = b.changes[0].photoId; },
    b => { b.changes[2].assetId = b.changes[0].assetId; }, b => { b.allowEmptyCopy = true; }]) {
    const body = structuredClone(record.action.body); mutate(body); assert.throws(() => personalPhotoCopyBatchManifest(body));
  }
  for (const mutate of [r => { r.action.body.owners.pop(); }, r => { r.photoState.payload.items.first.weight++; },
    r => { r.photoState.payload.items[r.action.body.owners[0].entityId].containerId = "hidden"; },
    r => { delete r.photoState.payload.items[r.action.body.owners.at(-1).entityId]; },
    r => { r.photoState.payload.layouts.hidden = { id: "hidden" }; }]) {
    const changed = structuredClone(record); mutate(changed); assert.throws(() => assertPersonalPhotoCopyBatchRecord(changed));
  }
});

test("receipt proves every selected owner, full unknown fields, every photo and metadata, without accepting partial success", async () => {
  const f = fixture(), { record } = await createPersonalPhotoCopyBatchSession(f.options).submit(f.request);
  const body = record.action.body, payload = structuredClone(record.photoState.payload), photoChanges = [];
  for (const owner of body.owners) {
    const target = payload.items[owner.entityId], changes = body.changes.filter(c => c.entityId === owner.entityId);
    target.photos = changes.map((change, index) => ({ ...owner.copySource.payload.photos[index], id: change.photoId, photoId: change.photoId,
      assetId: change.assetId, url: `/result/${change.photoId}`, thumbUrl: `/result-thumb/${change.photoId}` }));
    for (const [index, change] of changes.entries()) photoChanges.push({ index: photoChanges.length, action: "copy", entityType: "item", entityId: owner.entityId,
      photoId: change.photoId, assetId: change.assetId, photoIds: target.photos.slice(0, index + 1).map(p => p.id), photo: target.photos[index] });
  }
  const result = { ok: true, stateRevision: 8, list: { id: "list", stateRevision: 8, payload }, photoChanges,
    photoCopyBatch: { version: 1, owners: body.owners.map(({ entityType, entityId }) => ({ entityType, entityId })) } };
  assert.equal(validatePersonalPhotoCopyBatchResult(result, { body, listId: "list" }), true);
  for (const mutate of [r => { r.photoChanges.pop(); }, r => { r.photoCopyBatch.owners.pop(); },
    r => { delete r.list.payload.items[body.owners.at(-1).entityId]; },
    r => { r.list.payload.items[body.owners[2].entityId].customSourceValue.immutable = "wrong"; },
    r => { r.photoChanges[2].photo.width++; r.list.payload.items[body.owners[1].entityId].photos[0].width++; }]) {
    const changed = structuredClone(result); mutate(changed); assert.equal(validatePersonalPhotoCopyBatchResult(changed, { body, listId: "list" }), false);
  }
});
