import test from "node:test";
import { cloneStateForSyncPayload } from "../../src/sync/serialize.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { preparePersonalPendingPhotoForm as prepare } from "../../src/sync/personal-pending-photo-form-plan.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";
import { personalPhotoFormManifest, validatePersonalPhotoFormResult } from "../../src/sync/personal-photo-form-protocol.js";
import { personalPublicPendingPhotoInventory, personalPublicPhotoFormSummary } from "../../src/sync/personal-public-photo-form-result.js";

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
  for (const type of ["item", "container"]) for (const fileless of [false, true]) {
    const f = fixture(type), collection = type === "item" ? "items" : "containers";
    if (fileless) { f.files = []; f.photoSelection = null; f.photoIds = ["photo-2", "photo-0"]; }
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

for (const selected of [["photo-2", "photo-0"], [], ["photo-2", "photo-1", "photo-0"]]) test(`pending fileless edit freezes deletion/order and the complete owner (${selected.join(",") || "delete all"})`, () => {
  const f = fixture(); f.files = []; f.photoSelection = null; f.photoIds = selected;
  const before = structuredClone(f.basePayload), plan = prepare(f, { enabled: true });
  assert.equal(plan.files.length, 0); assert.equal(plan.body.baseEntityRevision, null);
  assert.deepEqual(plan.body.ownerResult.owner, before.items.owner);
  assert.deepEqual(plan.payload.items.owner.photos.map(photo => photo.id), selected);
  assert.ok(plan.body.changes.length > 0); assert.ok(plan.body.changes.every(change => change.action !== "attach" && change.baseEntityRevision === null));
  assert.ok(plan.body.changes.filter(change => change.action === "delete").every(change => change.basePhotoRevision === null));
  assert.deepEqual(f.basePayload, before);
});

test("pending fileless edit refuses no-op order, duplicate IDs and ambiguous new-file input", () => {
  for (const photoIds of [["photo-0", "photo-1", "photo-2"], ["photo-0", "photo-0"], ["unknown"]]) {
    const f = fixture(); f.files = []; f.photoSelection = null; f.photoIds = photoIds;
    assert.throws(() => prepare(f, { enabled: true }));
  }
  assert.throws(() => prepare({ ...fixture(), photoIds: [] }, { enabled: true }));
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

function publicFixture(type = "item") {
  const f = fixture(type), other = type === "item" ? "containers" : "items";
  f.publicOperationId = randomUUID();
  f.basePayload[other].sibling = { id: "sibling", name: "Other imported owner", custom: { keep: "all fields" },
    photos: [0, 1].map(i => ({ id: `sibling-${i}`, photoId: `sibling-${i}`, assetId: randomUUID(), listId: "list", status: "pending" })) };
  Object.assign(f.basePayload[type === "item" ? "items" : "containers"].owner.photos[0],
    { thumbUrl: "/original-thumb", type: "image/png", size: 1, width: 1, height: 1 });
  f.snapshot = structuredClone(f.basePayload);
  return f;
}

test("public pending compiler freezes every imported owner's photos and stores only the new form's bytes", async () => {
  for (const type of ["item", "container"]) {
    const f = publicFixture(type), project = value => cloneStateForSyncPayload(value, { forSync: true });
    f.basePayload = project(f.snapshot); f.snapshot = structuredClone(f.basePayload);
    const before = structuredClone(f.basePayload), plan = prepare(f, { enabled: true, publicEnabled: true, snapshotToPayload: project });
    const other = type === "item" ? "containers" : "items", ref = personalPhotoFormManifest(plan.body).ownerResult;
    assert.equal(ref.version, 2); assert.equal(ref.publicOperationId, f.publicOperationId);
    assert.equal(ref.operationId, f.parentOperationId);
    assert.deepEqual(ref.pendingPhotos, personalPublicPendingPhotoInventory(before, "list"));
    assert.deepEqual(plan.payload[other].sibling, before[other].sibling);
    assert.deepEqual(project(plan.snapshot), plan.payload);
    assert.deepEqual(personalPublicPhotoFormSummary(plan.body, "list").pendingPhotos,
      personalPublicPendingPhotoInventory(plan.payload, "list"));
    const action = { ...f.binding, operationId: plan.operationId, generation: 2, kind: "photos.mutate", body: plan.body };
    const stored = await decodePersonalPhotoFormRecord(await encodePersonalPhotoFormRecord({ binding: f.binding,
      action, snapshot: plan.snapshot, files: plan.files }), f.binding, plan.operationId);
    assert.deepEqual(stored.action, action);
    assert.deepEqual(await Promise.all(stored.files.map(file => file.file.text())), ["new bytes 0", "new bytes 1"]);
    assert.deepEqual(f.basePayload, before);
  }
});

test("public fileless deletion keeps sibling files and a later form can select a different imported owner", () => {
  const f = publicFixture(); f.files = []; f.photoSelection = null; f.photoIds = [];
  const first = prepare(f, { enabled: true, publicEnabled: true });
  assert.deepEqual(first.payload.items.owner.photos, []); assert.equal(first.files.length, 0);
  assert.deepEqual(first.payload.containers.sibling, f.basePayload.containers.sibling);
  const second = prepare({ ...f, snapshot: first.snapshot, basePayload: first.payload,
    parentOperationId: first.operationId, entityType: "container", entityId: "sibling", photoIds: ["sibling-1", "sibling-0"],
    fields: { name: "Other owner after first form" } }, { enabled: true, publicEnabled: true });
  assert.equal(second.body.ownerResult.publicOperationId, f.publicOperationId);
  assert.equal(second.body.ownerResult.operationId, first.operationId);
  assert.deepEqual(second.body.ownerResult.pendingPhotos, personalPublicPendingPhotoInventory(first.payload, "list"));
  assert.deepEqual(second.payload.items.owner, first.payload.items.owner);
  assert.deepEqual(second.payload.containers.sibling.photos.map(photo => photo.id), ["sibling-1", "sibling-0"]);
});

test("public pending forms require their own gate, exact sibling references and independent action IDs", () => {
  assert.throws(() => prepare(publicFixture(), { enabled: true }));
  assert.throws(() => prepare(publicFixture(), { publicEnabled: true }));
  for (const mutate of [f => { f.publicOperationId = "unbound"; },
    f => { f.basePayload.containers.sibling.photos[0].listId = "foreign"; },
    f => { f.basePayload.containers.sibling.photos[0].url = "/invented"; },
    f => { f.basePayload.containers.sibling.photos[0].assetId = f.basePayload.items.owner.photos[1].assetId; }]) {
    const f = publicFixture(); mutate(f); f.snapshot = structuredClone(f.basePayload);
    assert.throws(() => prepare(f, { enabled: true, publicEnabled: true }));
  }
  const f = publicFixture(); f.files = []; f.photoSelection = null; f.photoIds = [];
  assert.throws(() => prepare(f, { enabled: true, publicEnabled: true, createUuid: () => f.publicOperationId }));
});
