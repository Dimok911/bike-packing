import test from "node:test";
import assert from "node:assert/strict";
import { preparePersonalPhotoFormAttachments } from "../../src/sync/personal-photo-form-plan.js";
import { PERSONAL_PHOTO_FORM_ENABLED, personalPhotoFormManifest, assertPersonalPhotoFormCandidate,
  validatePersonalPhotoFormResult } from "../../src/sync/personal-photo-form-protocol.js";

const photo = () => ({ id: "old", photoId: "old", assetId: crypto.randomUUID(), status: "synced", listId: "list", url: "/old", thumbUrl: "/old-thumb" });
function fixture({ created = false, type = "item" } = {}) {
  const collection = type === "item" ? "items" : "containers", owner = { id: "owner", name: "Original", unknownFutureField: "Do not drop", photos: [photo()] };
  const basePayload = { items: {}, containers: {}, layouts: { layout: { id: "layout", name: "Unrelated", rootContainerIds: [] } } };
  if (!created) basePayload[collection].owner = owner;
  return { binding: { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" },
    snapshot: structuredClone(basePayload), basePayload, baseStateRevision: 17, baseEntityRevision: created ? 0 : 12,
    entityType: type, entityId: "owner", fields: { name: "Changed together", note: "Frozen fields" },
    files: [0, 1].map(index => ({ fileName: `form-${index}.png`, file: new Blob(["same selected bytes"], { type: "image/png" }), thumb: null })) };
}
const prepare = f => preparePersonalPhotoFormAttachments(f, { enabled: true });

test("form attachments freeze new item and bag IDs, business fields, exact owner revision and all equal-but-separate files", async () => {
  for (const created of [true, false]) for (const type of ["item", "container"]) {
    const f = fixture({ created, type }), base = structuredClone(f.basePayload), result = prepare(f);
    const field = type === "item" ? "items" : "containers", owner = result.payload[field].owner;
    assert.equal(owner.name, f.fields.name); assert.equal(result.body.baseEntityRevision, created ? 0 : 12);
    assert.equal(result.body.changes[0].baseEntityRevision, result.body.baseEntityRevision);
    assert.equal(new Set([result.operationId, ...result.files.map(part => part.stage.operationId)]).size, 3);
    assert.equal(owner.photos.length, created ? 2 : 3);
    assert.equal(owner.unknownFutureField, created ? undefined : "Do not drop");
    assert.deepEqual(result.snapshot, result.payload); assert.deepEqual(f.basePayload, base);
    assert.deepEqual(result.payload.layouts, base.layouts);
    f.fields.name = "Late edit"; f.files[0].fileName = "late.png"; f.binding.listId = "other"; f.snapshot.layouts.layout.name = "Changed elsewhere";
    assert.equal(result.body.fields.name, "Changed together"); assert.equal(result.files[0].stage.fileName, "form-0.png");
    assert.equal(result.binding.listId, "list"); assert.equal(await result.files[0].file.text(), "same selected bytes");
    assert.equal(result.snapshot.layouts.layout.name, "Unrelated");
  }
});

test("form preparation does not enable itself, accept other edits or turn malformed fields into deletion", () => {
  assert.equal(PERSONAL_PHOTO_FORM_ENABLED, false);
  assert.throws(() => preparePersonalPhotoFormAttachments(fixture()));
  for (const mutate of [f => { f.snapshot.layouts.layout.name = "Not in this form"; },
    f => { f.fields = { dimensions: NaN }; }, f => { f.fields = { parentId: "elsewhere" }; },
    f => { f.fields = { photos: [] }; }, f => { f.baseEntityRevision = 0; },
    f => { f.binding.scopeKey = "id:other"; }, f => { f.files[0].thumb = new Blob([]); },
    f => { f.files.push({ file: new Blob(["not a photo"], { type: "text/plain" }) }); },
    f => { f.basePayload.items.owner.adminDemo = true; f.snapshot = structuredClone(f.basePayload); },
    f => { f.basePayload.items.owner.photos[0].status = "pending"; f.snapshot = structuredClone(f.basePayload); }]) {
    const f = fixture(); mutate(f); const before = structuredClone(f.snapshot);
    assert.throws(() => prepare(f)); assert.deepEqual(f.snapshot, before);
  }
});

test("caller callbacks cannot replace the frozen binding or files; colliding IDs never become a second logical action", () => {
  const f = fixture(), originalFile = f.files[0].file;
  const result = preparePersonalPhotoFormAttachments(f, { enabled: true, createUuid: () => {
    f.binding.actorId = "other"; f.files[0].file = new Blob(["late"], { type: "image/png" }); return crypto.randomUUID();
  } });
  assert.equal(result.binding.actorId, "actor"); assert.equal(result.files[0].file, originalFile);
  const repeated = crypto.randomUUID();
  assert.throws(() => preparePersonalPhotoFormAttachments(fixture(), { enabled: true, createUuid: () => repeated }));
});

test("complete form candidate permits only requested owner fields and exact new pending photo bindings", () => {
  const f = fixture(), plan = prepare(f);
  assertPersonalPhotoFormCandidate({ body: plan.body, basePayload: f.basePayload, payload: plan.payload, listId: f.binding.listId });
  for (const mutate of [p => { p.payload.layouts.layout.name = "Hidden edit"; }, p => { p.payload.items.owner.unknownFutureField = "lost"; },
    p => { p.payload.items.owner.photos[1].url = "/unverified"; }, p => { p.payload.items.owner.photos[1].listId = "other"; },
    p => { p.body.changes[1].expectedPhotoIds = ["unrelated"]; }, p => { p.body.changes[1].entityId = "another"; }]) {
    const next = structuredClone(plan); mutate(next);
    assert.throws(() => assertPersonalPhotoFormCandidate({ body: next.body, basePayload: f.basePayload, payload: next.payload, listId: "list" }));
  }
});

function serverResult(plan) {
  const payload = structuredClone(plan.payload), collection = plan.body.entityType === "item" ? "items" : "containers";
  const manifest = personalPhotoFormManifest(plan.body);
  const photoChanges = manifest.photos.map(entry => {
    const photo = payload[collection].owner.photos.find(photo => photo.id === entry.photoId);
    Object.assign(photo, { status: "synced", url: `/photos/${photo.id}`, thumbUrl: `/thumbs/${photo.id}` });
    return { ...entry, photo: structuredClone(photo) };
  });
  return { photoForm: { entityType: plan.body.entityType, entityId: "owner", created: manifest.created }, photoChanges,
    stateRevision: 18, list: { id: "list", stateRevision: 18, payload } };
}

test("receipt validation requires every photo AND requested field; old photo-only receipt is not form confirmation", () => {
  for (const created of [true, false]) {
    const plan = prepare(fixture({ created })), expected = { listId: "list", body: plan.body }, good = serverResult(plan);
    const immutable = JSON.stringify(plan.body);
    assert.equal(validatePersonalPhotoFormResult(good, expected), true); assert.equal(JSON.stringify(plan.body), immutable);
    for (const change of [p => { delete p.photoForm; }, p => { p.photoForm.created = !created; },
      p => { p.list.payload.items.owner.name = "Old value"; }, p => { p.photoChanges.pop(); },
      p => { p.list.payload.items.owner.photos.at(-1).assetId = crypto.randomUUID(); }, p => { p.photoChanges[0].photo.status = "pending"; }]) {
      const result = structuredClone(good); change(result); assert.equal(validatePersonalPhotoFormResult(result, expected), false);
    }
  }
});

test("dimensions removal is explicit and the final snapshot limit includes fields and every pending photo", () => {
  const f = fixture(); f.basePayload.items.owner.dimensions = { length: 4 }; f.snapshot = structuredClone(f.basePayload);
  f.fields.dimensions = null; const plan = prepare(f);
  assert.equal(Object.hasOwn(plan.payload.items.owner, "dimensions"), false);
  assert.equal(validatePersonalPhotoFormResult(serverResult(plan), { listId: "list", body: plan.body }), true);
  f.snapshot.layouts.layout.note = "x".repeat(2 * 1024 * 1024); f.basePayload = structuredClone(f.snapshot);
  assert.throws(() => prepare(f));
});
