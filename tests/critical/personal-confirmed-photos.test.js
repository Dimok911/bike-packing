import test from "node:test";
import assert from "node:assert/strict";
import { preservesConfirmedPersonalPhotos, preservesConfirmedPersonalPhotoChain, PERSONAL_PHOTO_OWNER_DELETION_ENABLED } from "../../src/sync/personal-confirmed-photos.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";

function fixture() {
  const photo = { id: "photo-a", photoId: "photo-a", assetId: "05c59e77-bd27-42bf-879f-83bfa3b27ab5", listId: "list", status: "synced",
    url: "https://example.test/full", thumbUrl: "https://example.test/thumb", fileName: "photo.jpg", type: "image/jpeg", size: 10, width: 1, height: 1 };
  return { items: { item: { id: "item", name: "Before", photos: [photo] } }, containers: {}, layouts: {} };
}
test("DB fields and placement can retain exact confirmed photos without authorizing a file mutation", () => {
  const base = fixture(), candidate = structuredClone(base);
  candidate.items.item.name = "Edited"; candidate.items.other = { id: "other", name: "No file" };
  candidate.layouts.layout = { id: "layout", arrangement: { items: { item: "bag" } } };
  assert.equal(preservesConfirmedPersonalPhotos(base, candidate, "list"), true);
  assert.equal(preservesConfirmedPersonalPhotos({ items: {}, containers: {} }, { items: {}, containers: {} }, "list"), true);
});
test("DB candidate cannot remove, copy, move, replace or alter an existing photo reference", () => {
  for (const mutate of [p => { delete p.items.item; }, p => { p.items.item.photos = []; },
    p => { p.items.other = { ...p.items.item, id: "other" }; },
    p => { p.containers.bag = { id: "bag", photos: p.items.item.photos }; p.items.item.photos = []; },
    p => { p.items.item.photos[0].url += "?different"; }, p => { p.items.item.photos[0].width++; },
    p => { p.items.item.photos[0].assetId = "679de067-231b-49a9-9d79-8aa0d1dc1107"; }]) {
    const base = fixture(), candidate = structuredClone(base); mutate(candidate);
    assert.equal(preservesConfirmedPersonalPhotos(base, candidate, "list"), false);
  }
});
test("photo retention is not a legacy, pending, malformed or cross-list escape hatch", () => {
  for (const mutate of [p => { p.items.item.photos[0].status = "pending"; }, p => { delete p.items.item.photos[0].assetId; },
    p => { p.items.item.photos[0].listId = "other"; }, p => { p.items.item.photos[0].localId = "local"; },
    p => { p.items.item.photos[0].extra = true; }, p => { p.items.item.photos = {}; }, p => { p.items.item.photos = null; },
    p => { p.items.item.id = "wrong"; }]) {
    const base = fixture(); mutate(base);
    assert.equal(preservesConfirmedPersonalPhotos(base, structuredClone(base), "list"), false);
  }
});

function chain() {
  const base = fixture(), first = structuredClone(base), second = structuredClone(base);
  first.items.item.name = "First"; second.items.item.name = "Second";
  return { operationId: "b", listId: "list", records: [
    { action: { operationId: "a", listId: "list", kind: "list.update", previousLocalOperationId: "settled-form",
      body: { payload: first, causal: { dependsOn: [], reads: [] } } }, mergeBase: { payload: base, stateRevision: 3 } },
    { action: { operationId: "b", listId: "list", kind: "list.update",
      body: { payload: second, causal: { baseOperationId: "a", dependsOn: [{ operationId: "a", listId: "list" }], reads: [] } } } }
  ] };
}

test("every queued DB step preserves files; a retained historical form is not dispatched", () => {
  const input = chain();
  input.records.unshift({ action: { operationId: "settled-form", listId: "list", kind: "photos.mutate", body: { action: "form" } } });
  assert.equal(preservesConfirmedPersonalPhotoChain(input), true);
  input.records.reverse();
  assert.equal(preservesConfirmedPersonalPhotoChain(input), true);
});

test("matching final photos cannot hide an intermediate delete or an unconfirmed photo predecessor", () => {
  for (const mutate of [input => { input.records[0].action.body.payload.items.item.photos = []; },
    input => { input.records[0].action.kind = "photos.mutate"; },
    input => { input.records[0].action.kind = "list.restore"; },
    input => { input.records[1].mergeBase = { payload: fixture() }; }]) {
    const input = chain(); mutate(input);
    assert.equal(preservesConfirmedPersonalPhotoChain(input), false);
  }
});

test("missing, duplicate, cyclic, foreign or baseless chain fails closed", () => {
  for (const mutate of [input => { input.records.shift(); }, input => { input.records.push(input.records[0]); },
    input => { input.records[0].action.body.causal.baseOperationId = "b"; },
    input => { input.records[0].action.listId = "foreign"; }, input => { delete input.records[0].mergeBase; },
    input => { input.operationId = "missing"; }, input => { input.records[1].action.body.payload.items.item.photos = null; }]) {
    const input = chain(); mutate(input);
    assert.equal(preservesConfirmedPersonalPhotoChain(input), false);
  }
});
test("changing the order of two confirmed photos needs an explicit file-owner action", () => {
  const base = fixture(), first = base.items.item.photos[0];
  base.items.item.photos.push({ ...first, id: "photo-b", photoId: "photo-b", assetId: "679de067-231b-49a9-9d79-8aa0d1dc1107" });
  const candidate = structuredClone(base); candidate.items.item.photos.reverse();
  assert.equal(preservesConfirmedPersonalPhotos(base, candidate, "list"), false);
});

test("explicit owner deletion is independently gated and cannot disguise a photo-only removal", () => {
  assert.equal(PERSONAL_PHOTO_OWNER_DELETION_ENABLED, false);
  const base = fixture(), candidate = structuredClone(base), userDeletion = { type: "item", id: "item" };
  delete candidate.items.item;
  assert.equal(preservesConfirmedPersonalPhotos(base, candidate, "list"), false);
  assert.equal(preservesConfirmedPersonalPhotos(base, candidate, "list", { userDeletion }), true);
  candidate.items.item = { ...base.items.item, photos: [] };
  assert.equal(preservesConfirmedPersonalPhotos(base, candidate, "list", { userDeletion }), false);
  delete candidate.items.item;
  for (const mutate of [p => { p.items.item.photos[0].status = "pending"; },
    p => { p.items.item.photos[0].listId = "other"; }, p => { delete p.items.item.photos[0].assetId; }]) {
    const invalid = structuredClone(base); mutate(invalid);
    assert.equal(preservesConfirmedPersonalPhotos(invalid, candidate, "list", { userDeletion }), false);
  }
});

test("container cascade removes child owner photos but preserves reusable bags and all item photos exactly", () => {
  const base = fixture(), photo = base.items.item.photos[0];
  for (const [id, assetId, nestable] of [["bag", "acc73342-1fe2-4f11-a8d9-b9d92d287a1a", false],
    ["pocket", "bfe5ee25-842b-4357-be49-393354dc5099", false], ["nested", "b65c799b-2740-418b-b8f8-5e551293f5bb", true]]) {
    base.containers[id] = { id, nestable, parentId: id === "bag" ? null : "bag",
      childIds: id === "bag" ? ["pocket", "nested"] : [], itemIds: [], order: [],
      photos: [{ ...photo, id, photoId: id, assetId }] };
  }
  const userDeletion = { type: "container", id: "bag" };
  const candidate = preparePersonalDeletionBatch(base, userDeletion).snapshot;
  assert.deepEqual(Object.keys(candidate.containers), ["nested"]);
  assert.equal(preservesConfirmedPersonalPhotos(base, candidate, "list", { userDeletion }), true);
  for (const mutate of [p => { p.items.item.photos = []; }, p => { delete p.containers.nested; },
    p => { p.containers.nested.photos[0].url += "?changed"; },
    p => { p.containers.extra = { ...base.containers.bag, id: "extra" }; }]) {
    const invalid = structuredClone(candidate); mutate(invalid);
    assert.equal(preservesConfirmedPersonalPhotos(base, invalid, "list", { userDeletion }), false);
  }
});

test("each deletion in a causal chain needs its own explicit intent; a later save cannot restore removed photos", () => {
  const input = chain(); delete input.records[0].action.body.payload.items.item;
  delete input.records[1].action.body.payload.items.item;
  input.records[0].action.body.userDeletion = { type: "item", id: "item" };
  assert.equal(preservesConfirmedPersonalPhotoChain(input), false);
  assert.equal(preservesConfirmedPersonalPhotoChain({ ...input, allowOwnerDeletion: true }), true);
  input.records[1].action.body.payload = fixture();
  assert.equal(preservesConfirmedPersonalPhotoChain({ ...input, allowOwnerDeletion: true }), false);
});
