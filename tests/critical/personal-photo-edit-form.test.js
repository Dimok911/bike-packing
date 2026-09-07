import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readPersonalPhotoOwnerState } from "../../src/sync/personal-photo-owner-state.js";
import { createPersonalPhotoEditFormSession, preparePersonalPhotoEditForm } from "../../src/sync/personal-photo-edit-form.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { assertPersonalPhotoFormRecord, assertPersonalPhotoFormFile } from "../../src/sync/personal-photo-form-outbox-record.js";
import { inspectPersonalPhotoRecovery } from "../../src/sync/personal-photo-recovery-inventory.js";
import { drainPersonalPhotoForm } from "../../src/sync/personal-photo-form-drain.js";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { personalPhotoEditSelection } from "../../src/ui/personal-photo-form-files.js";
import { personalPhotoPublicationManifest } from "../../src/sync/personal-photo-publication-protocol.js";
import { personalPhotoFormManifest, validatePersonalPhotoFormResult } from "../../src/sync/personal-photo-form-protocol.js";

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture(type = "item", mode = "delete") {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const context = { ...binding, scope: "personal", generation: "before", form: "opened", formDraft: "fixed" }, values = new Map();
  const photos = [1, 2, 3].map(n => ({ id: `photo-${n}`, photoId: `photo-${n}`, assetId: randomUUID(), listId: "list", status: "synced",
    url: `/photo/${n}`, thumbUrl: `/thumb/${n}`, type: "image/png", fileName: `${n}.png`, size: 20, width: 1, height: 1 }));
  const collection = type === "item" ? "items" : "containers", base = { items: {}, containers: {}, layouts: {} };
  base[collection].owner = { id: "owner", name: "Original", weight: 3, photos };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const outboxOptions = { ...binding, storage, photoEnabled: true, photoFormEnabled: true, photoEditEnabled: true, photoBatchCancellationEnabled: true };
  const outbox = createPersonalSaveOutbox(outboxOptions); outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 7 });
  const store = { binding, ids: async () => [], read: async () => { throw Error("Fileless action must not read file records"); } };
  const response = { ok: true, version: 1, readOnly: true, environment: binding.environment, actorId: "actor", listId: "list", stateRevision: 7,
    owner: { entityType: type, entityId: "owner", entityRevision: 5, payload: structuredClone(base[collection].owner) },
    photos: photos.map((photo, index) => ({ photoId: photo.id, assetId: photo.assetId, photoRevision: index + 2 })) };
  const request = { binding, snapshot: structuredClone(base), basePayload: structuredClone(base), baseStateRevision: 7,
    created: false, entityType: type, entityId: "owner", fields: { name: "Chosen", weight: 23 },
    photoIds: mode === "order" ? photos.map(photo => photo.id).reverse() : mode === "delete-order" ? [photos[2].id, photos[1].id] : [photos[2].id] };
  const events = [], options = { outbox, store, getContext: () => context, enabled: true,
    readOwner: async path => { events.push(path); return response; }, onDurable: () => { events.push("view"); } };
  return { binding, context, values, storage, outboxOptions, outbox, store, response, request, options, events, collection, base };
}

test("owner reader binds an exact frozen photo array and three distinct revisions", async () => {
  const f = fixture(); const result = await readPersonalPhotoOwnerState(f.request, f.options);
  assert.equal(result.baseEntityRevision, 5); assert.deepEqual(result.photoRevisions.map(photo => photo.photoRevision), [2, 3, 4]);
  assert.match(f.events[0], /\/photo-owner-state\?entityType=item&entityId=owner$/);
  assert.equal(f.outbox.list().length, 0);
});

test("owner reader refuses wrong scope, newer lists, altered owners, duplicate heads and manufactured photo revisions", async () => {
  for (const mutate of [r => { r.actorId = "other"; }, r => { r.environment = "production"; }, r => { r.listId = "other"; },
    r => { r.stateRevision++; }, r => { r.readOnly = false; }, r => { r.owner.payload.name = "Changed"; },
    r => { r.owner.entityRevision = 8; }, r => { r.photos.reverse(); }, r => { r.photos.pop(); },
    r => { r.photos[0] = r.photos[1]; }, r => { r.photos[0].photoRevision = 7; }, r => { r.photos[0].photoRevision = "2"; }]) {
    const f = fixture(); mutate(f.response); await assert.rejects(readPersonalPhotoOwnerState(f.request, f.options), { code: "photo-owner-state" });
    assert.equal(f.outbox.list().length, 0);
  }
  const f = fixture(), wait = deferred(); f.options.readOwner = async () => { await wait.promise; return f.response; };
  const read = readPersonalPhotoOwnerState(f.request, f.options); f.context.form = "reopened"; wait.resolve(); await assert.rejects(read);
});

for (const type of ["item", "container"]) for (const mode of ["delete", "order", "delete-order"]) test(`fileless ${type} ${mode} freezes once, links before view and survives a reader-only reload`, async () => {
  const f = fixture(type, mode), scan = deferred(); f.store.ids = async () => { await scan.promise; return []; };
  let uuids = 0;
  const session = createPersonalPhotoEditFormSession({ ...f.options, createUuid: () => { uuids++; return randomUUID(); } });
  const promise = session.submit(f.request), id = session.state().operationId, desired = [...f.request.photoIds];
  f.request.fields.name = "Late typing"; f.request.photoIds.reverse();
  assert.equal(session.submit(f.request), promise); assert.equal(uuids, 1); assert.deepEqual(f.events, []);
  assert.equal(session.recoveryCopy().preview[f.collection].owner.name, "Chosen");
  scan.resolve(); const { record } = await promise;
  assert.equal(record.action.operationId, id); assert.equal(record.photoState.fileIntentHash, null); assert.equal(record.photoState.fileInventoryVersion, undefined);
  assert.equal(record.action.body.baseEntityRevision, 5); assert.equal(record.action.body.fields.name, "Chosen");
  assert.deepEqual(record.photoState.payload[f.collection].owner.photos.map(photo => photo.id), desired);
  if (mode === "delete") assert.deepEqual(record.action.body.changes.map(change => change.basePhotoRevision), [2, 3]);
  if (mode === "delete-order") {
    assert.deepEqual(record.action.body.changes.map(change => change.action), ["delete", "order"]);
    assert.deepEqual(record.action.body.changes[1].expectedPhotoIds, ["photo-2", "photo-3"]);
    assert.deepEqual(record.action.body.changes[1].photoIds, desired);
    const corrupt = structuredClone(record); corrupt.action.body.changes[1].expectedPhotoIds = ["photo-1", "photo-2", "photo-3"];
    assert.throws(() => assertPersonalPhotoFormRecord(corrupt));
  }
  assertPersonalPhotoFormRecord(record); assert.throws(() => assertPersonalPhotoFormFile(record, {}, f.binding));
  assert.equal(f.events.at(-1), "view"); assert.deepEqual(session.recoveryCopy().files, []);
  const reloaded = createPersonalSaveOutbox({ ...f.outboxOptions, photoEnabled: false, photoEditEnabled: false });
  assert.deepEqual(reloaded.recover(), record);
  const inventory = await inspectPersonalPhotoRecovery({ ...f.options, outbox: reloaded });
  assert.deepEqual(inventory.entries.map(entry => [entry.operationId, entry.state, entry.fileless]), [[id, "linked", true]]);
  await assert.rejects(reloaded.drain({ getContext: f.options.getContext, queue: { run: () => { throw Error("must not send"); } } }));
});

test("mixed form requires every intermediate receipt and cannot enable mixed photo-only batches", async () => {
  const f = fixture("item", "delete-order"), { record } = await createPersonalPhotoEditFormSession(f.options).submit(f.request);
  const body = record.action.body, manifest = personalPhotoFormManifest(body);
  assert.throws(() => personalPhotoPublicationManifest({ version: 1, action: "batch", changes: body.changes, allowDeleteThenOrder: true }));
  const result = { stateRevision: 8, list: { id: "list", stateRevision: 8, payload: record.photoState.payload },
    photoForm: { entityType: "item", entityId: "owner", created: false }, photoChanges: manifest.photos };
  const expected = { listId: "list", body };
  assert.equal(validatePersonalPhotoFormResult(result, expected), true);
  for (const index of [0, 1]) {
    const changed = structuredClone(result); changed.photoChanges[index].photoIds.reverse();
    assert.equal(validatePersonalPhotoFormResult(changed, expected), false);
  }
  const after = structuredClone(body); after.changes.push({ ...after.changes[0], photoId: "photo-2", expectedPhotoIds: ["photo-3", "photo-2"] });
  assert.throws(() => personalPhotoFormManifest(after));
  const repeated = structuredClone(body); repeated.changes.push({ ...repeated.changes[1], expectedPhotoIds: ["photo-3", "photo-2"] });
  assert.throws(() => personalPhotoFormManifest(repeated));
});

test("fileless form cannot disguise new bytes or invent a survivor; every missing photo is explicit", async () => {
  const f = fixture(), versions = await readPersonalPhotoOwnerState(f.request, f.options);
  for (const change of [r => { r.photoIds = ["foreign"]; }, r => { r.photoIds = ["photo-3", "photo-2", "foreign"]; },
    r => { r.photoIds = ["photo-3", "photo-3"]; }, r => { r.fields.photos = []; }, r => { r.fields.parentId = "other"; }]) {
    const request = structuredClone(f.request); change(request);
    assert.throws(() => preparePersonalPhotoEditForm({ ...request, ...versions, operationId: randomUUID() }, { enabled: true }));
  }
  const photos = f.base.items.owner.photos;
  assert.deepEqual(personalPhotoEditSelection({ draft: { photos: [photos[2]], deletedPhotos: photos.slice(0, 2) }, basePhotos: photos, binding: f.binding }), ["photo-3"]);
  assert.throws(() => personalPhotoEditSelection({ draft: { photos: [photos[2]], deletedPhotos: [] }, basePhotos: photos, binding: f.binding }));
  assert.throws(() => personalPhotoEditSelection({ draft: { photos: [{ ...photos[2], assetId: randomUUID() }], deletedPhotos: photos.slice(0, 2) }, basePhotos: photos, binding: f.binding }));
});

test("quota or a changed preflight cannot release the original form or silently allocate a retry", async () => {
  for (const mode of ["quota", "newer", "context", "pending", "disabled"]) {
    const f = fixture();
    if (mode === "quota") f.storage.setItem = () => { throw Error("quota"); };
    if (mode === "newer") f.response.stateRevision++;
    if (mode === "context") f.options.readOwner = async () => { f.context.generation = "changed"; return f.response; };
    if (mode === "pending") f.outbox.capture({ snapshot: f.base, body: { payload: f.base, baseStateRevision: 7 } });
    const before = [...f.values];
    const session = createPersonalPhotoEditFormSession({ ...f.options, enabled: mode !== "disabled" });
    const promise = session.submit(f.request); await assert.rejects(promise);
    assert.equal(session.submit(f.request), promise); assert.deepEqual([...f.values], before); assert.equal(f.events.includes("view"), false);
    if (mode !== "disabled") assert.equal(session.recoveryCopy().preview.items.owner.name, "Chosen");
  }
});

async function captured() {
  const f = fixture(), { record } = await createPersonalPhotoEditFormSession(f.options).submit(f.request);
  const action = record.action, digest = createHash("sha256").update(canonicalListOperationJson({ environment: f.binding.environment,
    actorId: f.binding.actorId, kind: action.kind, listId: action.listId, body: action.body })).digest("hex");
  f.committed = false; f.rejected = false; f.unknown = false; f.posts = 0;
  const unknown = () => Object.assign(Error("lost exact ACK"), { isOperationReceiptError: true });
  f.proof = () => ({ historicalOnly: true, operation: { id: action.operationId, environment: f.binding.environment, actorId: f.binding.actorId,
    listId: action.listId, kind: action.kind, payloadDigest: digest, state: f.committed ? "committed" : "rejected" },
    stateRevision: f.committed ? 8 : 7, resultStatus: f.committed ? 200 : 409, rejectionCode: f.committed ? null : "operation_cancelled" });
  f.queue = { inspect: async () => { if (f.unknown || !f.committed && !f.rejected) throw unknown(); return f.proof(); },
    run: async () => { if (!f.committed) { f.posts++; f.committed = true; } if (f.unknown) throw unknown(); return { ok: true }; },
    supportsCancellation: () => true, cancelExact: async () => { f.rejected = true; return f.proof(); } };
  f.drain = { ...f.options, queue: f.queue, staging: { stage: () => { throw Error("No upload in fileless form"); } },
    readRemote: async () => ({ id: "list", ownerId: "actor", stateRevision: 8, payload: record.photoState.payload }),
    onAdopted: value => { f.adopted = value; } };
  f.record = record; return f;
}

test("fileless lost ACK reload reconciles the exact action once, retains proof and permits the next field edit", async () => {
  const f = await captured(); f.unknown = true;
  await assert.rejects(drainPersonalPhotoForm(f.drain)); assert.equal(f.posts, 1); assert.equal(f.outbox.hasPending(), true);
  const reloaded = createPersonalSaveOutbox(f.outboxOptions); f.unknown = false;
  await drainPersonalPhotoForm({ ...f.drain, outbox: reloaded });
  assert.equal(f.posts, 1); assert.equal(reloaded.hasPending(), false);
  const inventory = await inspectPersonalPhotoRecovery({ ...f.options, outbox: reloaded });
  assert.equal(inventory.entries[0].state, "settled-retained"); assert.equal(inventory.entries[0].exactReceiptCached, true);
  const next = structuredClone(f.adopted.snapshot); next.items.owner.name = "Next field edit";
  reloaded.capture({ snapshot: next, body: { payload: next, baseStateRevision: 8 } });
  assert.equal(reloaded.list().length, 2);
});

test("fileless exact cancellation reads the original receipt or fences it without touching file stages", async () => {
  for (const committed of [false, true]) {
    const f = await captured(); f.committed = committed;
    const result = await f.outbox.cancelPhotoUpload({ queue: f.queue, getContext: f.options.getContext });
    assert.equal(result.alreadyPublished, committed); assert.deepEqual(result.stageReceipts, []); assert.equal(f.posts, 0);
    assert.equal(result.ownerReceipt.operation.id, f.record.action.operationId); assert.equal(f.outbox.hasPending(), true);
    assert.equal(f.outbox.recover().action.operationId, f.record.action.operationId);
  }
});
