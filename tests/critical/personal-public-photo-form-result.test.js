import test from "node:test";
import assert from "node:assert/strict";
import { personalPublicPendingPhotoInventory, assertPersonalPublicPhotoFormReference,
  assertPersonalPublicPhotoFormSummary, personalPublicPhotoFormSummary, assertPersonalPublicPhotoFormBase,
  validatePersonalPublicPhotoFormResult } from "../../src/sync/personal-public-photo-form-result.js";

const uuid = n => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const listId = "personal-list";
const photo = n => ({ id: `photo-${n}`, photoId: `photo-${n}`, assetId: uuid(n), listId, status: "pending" });
function fixture() {
  const base = { items: { thing: { id: "thing", name: "Private copy", custom: { full: true }, photos: [photo(1), photo(2)] } },
    containers: { bag: { id: "bag", photos: [photo(3)] }, other: { id: "other", photos: [photo(4)] } } };
  const body = { version: 1, action: "form", entityType: "item", entityId: "thing", baseEntityRevision: null,
    ownerResult: { version: 2, operationId: uuid(10), publicOperationId: uuid(9), owner: structuredClone(base.items.thing),
      pendingPhotos: personalPublicPendingPhotoInventory(base, listId) },
    changes: [
      { action: "delete", entityType: "item", entityId: "thing", expectedPhotoIds: ["photo-1", "photo-2"], photoId: "photo-1", assetId: uuid(1) },
      { action: "attach", entityType: "item", entityId: "thing", expectedPhotoIds: ["photo-2"], photoId: "photo-5", assetId: uuid(5), index: 1 },
      { action: "order", entityType: "item", entityId: "thing", expectedPhotoIds: ["photo-2", "photo-5"], photoIds: ["photo-5", "photo-2"] }
    ] };
  return { base, body };
}

test("public photo continuation retains other owners and computes exact deletion, attachment and order", () => {
  const { base, body } = fixture(), original = structuredClone({ base, body });
  const summary = personalPublicPhotoFormSummary(body, listId);
  assert.deepEqual(summary, { version: 1, publicOperationId: uuid(9), pendingPhotos: [
    { entityType: "container", entityId: "bag", photos: [photo(3)] },
    { entityType: "container", entityId: "other", photos: [photo(4)] },
    { entityType: "item", entityId: "thing", photos: [photo(5), photo(2)] }
  ] });
  assert.deepEqual(assertPersonalPublicPhotoFormSummary(summary, listId), summary);
  assert.deepEqual({ base, body }, original);
  summary.pendingPhotos[0].photos.reverse();
  assert.deepEqual(body.ownerResult.pendingPhotos, original.body.ownerResult.pendingPhotos);
});

test("public photo inventory rejects forged identity, list, metadata, duplicated files and ambiguous owner ordering", () => {
  const { body } = fixture();
  for (const mutate of [
    b => b.ownerResult.version = 1,
    b => b.ownerResult.publicOperationId = "not-a-uuid",
    b => b.ownerResult.pendingPhotos.reverse(),
    b => b.ownerResult.pendingPhotos.pop(),
    b => b.ownerResult.pendingPhotos[2].photos.reverse(),
    b => b.ownerResult.pendingPhotos[2].entityType = "container",
    b => b.ownerResult.pendingPhotos[0].photos[0].listId = "other-list",
    b => b.ownerResult.pendingPhotos[0].photos[0].url = "https://unbound.example/photo",
    b => b.ownerResult.pendingPhotos[0].photos[0].assetId = uuid(2),
    b => b.ownerResult.pendingPhotos.push(structuredClone(b.ownerResult.pendingPhotos[0])),
    b => b.ownerResult.pendingPhotos[0].photos = [],
    b => b.ownerResult.owner.id = "bag",
  ]) { const changed = structuredClone(body); mutate(changed); assert.throws(() => assertPersonalPublicPhotoFormReference(changed, listId)); }
  assert.throws(() => assertPersonalPublicPhotoFormReference(body, "another-list"));
});

test("public photo result cannot reuse another pending asset or hide remaining imported photos", () => {
  const { body } = fixture();
  for (const mutate of [
    b => b.changes[1].assetId = uuid(3),
    b => b.changes[1].photoId = "photo-3",
    b => b.changes[1].index = 4,
    b => b.changes[0].assetId = uuid(4),
    b => b.changes[2].photoIds = ["photo-5", "photo-5"],
    b => b.changes[2].photoIds = ["photo-5"],
    b => b.changes[2].expectedPhotoIds.reverse(),
  ]) { const changed = structuredClone(body); mutate(changed); assert.throws(() => personalPublicPhotoFormSummary(changed, listId)); }
  body.changes = [body.changes[0], { action: "delete", entityType: "item", entityId: "thing", expectedPhotoIds: ["photo-2"], photoId: "photo-2", assetId: uuid(2) }];
  assert.deepEqual(personalPublicPhotoFormSummary(body, listId).pendingPhotos, body.ownerResult.pendingPhotos.slice(0, 2));
});

test("public form base proof rejects an omitted sibling or changed business owner even when the inventory itself is well formed", () => {
  const { base, body } = fixture();
  assert.deepEqual(assertPersonalPublicPhotoFormBase(body, base, listId), body.ownerResult);
  const omitted = structuredClone(body); omitted.ownerResult.pendingPhotos.shift();
  assert.doesNotThrow(() => assertPersonalPublicPhotoFormReference(omitted, listId));
  assert.throws(() => assertPersonalPublicPhotoFormBase(omitted, base, listId));
  const changed = structuredClone(body); changed.ownerResult.owner.custom.full = false;
  assert.throws(() => assertPersonalPublicPhotoFormBase(changed, base, listId));
  base.items.thing.photos.push({ ...photo(8), status: "synced", listId: "another-list" });
  body.ownerResult.owner = structuredClone(base.items.thing);
  assert.throws(() => assertPersonalPublicPhotoFormBase(body, base, listId));
});

test("public form receipt binds inherited sibling tuples and the exact new summary", () => {
  const { body } = fixture(), summary = personalPublicPhotoFormSummary(body, listId), result = { publicPhotoForm: summary,
    list: { payload: { items: {}, containers: {} } } };
  for (const row of summary.pendingPhotos) result.list.payload[row.entityType === "item" ? "items" : "containers"][row.entityId] = {
    id: row.entityId, photos: row.photos.map(photo => ({ ...photo, status: "synced", url: `/original/${photo.id}` })) };
  assert.equal(validatePersonalPublicPhotoFormResult(result, body, listId), true);
  for (const mutate of [r => { delete r.publicPhotoForm; }, r => { r.publicPhotoForm.publicOperationId = uuid(123); },
    r => { r.publicPhotoForm.pendingPhotos.shift(); }, r => { r.list.payload.containers.bag.photos[0].assetId = uuid(42); },
    r => { r.list.payload.containers.bag.photos[0].listId = "other"; }, r => { r.list.payload.containers.bag.photos[0].status = "pending"; },
    r => { r.list.payload.containers.bag.photos = []; }, r => { r.list.payload.items.thing.photos.reverse(); },
    r => { r.list.payload.containers.bag.photos.push(structuredClone(r.list.payload.containers.bag.photos[0])); }]) {
    const changed = structuredClone(result); mutate(changed);
    assert.equal(validatePersonalPublicPhotoFormResult(changed, body, listId), false, mutate.toString());
  }
});
