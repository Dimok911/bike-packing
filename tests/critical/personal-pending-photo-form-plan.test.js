import test from "node:test";
import { cloneStateForSyncPayload } from "../../src/sync/serialize.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { preparePersonalPendingPhotoForm as prepare } from "../../src/sync/personal-pending-photo-form-plan.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";
import { personalPhotoFormManifest, validatePersonalPhotoFormResult } from "../../src/sync/personal-photo-form-protocol.js";

function fixture(type = "item") {
  const photos = [0, 1, 2].map(index => ({ id: `photo-${index}`, photoId: `photo-${index}`, assetId: randomUUID(), listId: "list", status: "pending" }));
  photos[0] = { ...photos[0], status: "synced", url: "/original", fileName: "original.png" };
  const owner = { id: "owner", name: "Frozen predecessor", custom: { preserved: "exact" }, photos };
  const basePayload = { items: {}, containers: {}, layouts: {} }; basePayload[type === "item" ? "items" : "containers"].owner = owner;
  return { binding: { environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list" }, baseStateRevision: 3,
    parentOperationId: randomUUID(), entityType: type, entityId: "owner", basePayload, snapshot: structuredClone(basePayload),
    fields: { name: "Second complete form", weight: 42 }, files: [0, 1].map(index => ({ fileName: `new-${index}.png`, file: new Blob([`new bytes ${index}`], { type: "image/png" }) })),
    photoSelection: { retainedPhotoIds: ["photo-2", "photo-0"], order: [{ fileIndex: 1 }, { photoId: "photo-2" }, { fileIndex: 0 }, { photoId: "photo-0" }] } };
}

test("pending compiler passes the real application projection without inventing synced photo metadata", () => {
  for (const type of ["item", "container"]) {
    const f = fixture(type), collection = type === "item" ? "items" : "containers";
    Object.assign(f.snapshot[collection].owner.photos[0], { thumbUrl: "/original-thumb", type: "image/png", size: 1, width: 1, height: 1 });
    const project = value => cloneStateForSyncPayload(value, { forSync: true });
    f.basePayload = project(f.snapshot); f.snapshot = structuredClone(f.basePayload);
    const plan = prepare(f, { enabled: true, snapshotToPayload: project });
    assert.deepEqual(project(plan.snapshot), plan.payload);
    assert.equal(plan.body.ownerResult.owner.photos[2].status, "pending");
    assert.equal(Object.hasOwn(plan.body.ownerResult.owner.photos[2], "url"), false);
  }
});

test("another pending form preserves exact inherited photos and retains only its own new files in the real codec", async () => {
  for (const type of ["item", "container"]) {
    const f = fixture(type), base = structuredClone(f.basePayload), plan = prepare(f, { enabled: true });
    const manifest = personalPhotoFormManifest(plan.body), collection = type === "item" ? "items" : "containers";
    assert.deepEqual(plan.body.ownerResult.owner, base[collection].owner);
    assert.deepEqual(plan.body.changes.map(change => change.action), ["delete", "attach", "attach", "order"]);
    assert.equal(plan.body.baseEntityRevision, null); assert.equal(plan.body.changes[0].basePhotoRevision, null);
    assert.ok(plan.body.changes.every(change => change.baseEntityRevision === null));
    assert.equal(manifest.created, false); assert.equal(manifest.ownerResult.operationId, f.parentOperationId);
    assert.deepEqual(plan.payload[collection].owner.photos.filter(photo => photo.id.startsWith("photo-" ) && base[collection].owner.photos.some(old => old.id === photo.id)), [base[collection].owner.photos[2], base[collection].owner.photos[0]]);
    const action = { ...f.binding, operationId: plan.operationId, generation: 2, kind: "photos.mutate", body: plan.body };
    const saved = await decodePersonalPhotoFormRecord(await encodePersonalPhotoFormRecord({ binding: f.binding, action, snapshot: plan.snapshot, files: plan.files }), f.binding, plan.operationId);
    assert.deepEqual(saved.action, action); assert.deepEqual(await Promise.all(saved.files.map(part => part.file.text())), ["new bytes 0", "new bytes 1"]);
    assert.deepEqual(f.basePayload, base);
  }
});

test("a dependent result may materialize inherited pending references but cannot drop unknown business fields", () => {
  const f = fixture(), plan = prepare(f, { enabled: true }), owner = structuredClone(plan.payload.items.owner);
  owner.photos = owner.photos.map(photo => photo.status === "pending" ? { ...photo, status: "synced", url: `/published/${photo.id}`, thumbUrl: `/thumb/${photo.id}` } : photo);
  const changes = personalPhotoFormManifest(plan.body).photos.map(entry => ({ ...entry,
    ...(entry.action === "attach" ? { photo: owner.photos.find(photo => photo.id === entry.photoId) } : {}) }));
  const result = { ok: true, stateRevision: 8, list: { id: "list", stateRevision: 8, payload: { ...plan.payload, items: { owner } } },
    photoForm: { entityType: "item", entityId: "owner", created: false }, photoChanges: changes };
  const expected = { kind: "photos.mutate", listId: "list", body: plan.body };
  assert.equal(validatePersonalPhotoFormResult(result, expected), true);
  for (const mutate of [value => { delete value.custom; }, value => { value.photos[1].assetId = randomUUID(); },
    value => { value.photos.at(-1).url = "/changed-old-file"; }]) {
    const broken = structuredClone(result); mutate(broken.list.payload.items.owner); assert.equal(validatePersonalPhotoFormResult(broken, expected), false);
  }
});

test("pending compiler refuses an unbound source, lossy fields, another pending owner and the disabled gate", () => {
  assert.throws(() => prepare(fixture()));
  for (const mutate of [f => { f.parentOperationId = "missing"; }, f => { f.fields.weight = NaN; },
    f => { f.basePayload.items.other = { id: "other", photos: [structuredClone(f.basePayload.items.owner.photos[1])] }; f.snapshot = structuredClone(f.basePayload); },
    f => { f.basePayload.items.owner.photos[1].extra = "invented"; f.snapshot = structuredClone(f.basePayload); }]) {
    const f = fixture(); mutate(f); assert.throws(() => prepare(f, { enabled: true }));
  }
});
