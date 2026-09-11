import test from "node:test";
import assert from "node:assert/strict";
import { adminTemplateIntent } from "../../src/sync/admin-template-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_EDIT_ENABLED, TEMPLATE_PHOTO_EDIT_CAPABILITY, adminTemplatePhotoEdit,
  assertAdminTemplatePhotoEditPayload, validateAdminTemplatePhotoEditResultStructure, validateAdminTemplatePhotoEditResult } from "../../src/sync/admin-template-photo-edit-protocol.js";
import { adminPhotoEditFixture as fixture, copy, hash } from "../fixtures/admin-template-photo-edit-fixture.js";

for (const entityType of ["item", "container"]) test(`${entityType}: exact order/subset preserves aliases, metadata and the complete unselected payload`, async () => {
  const f = fixture({ entityType });
  assert.equal(ADMIN_TEMPLATE_PHOTO_EDIT_ENABLED, false); assert.equal(TEMPLATE_PHOTO_EDIT_CAPABILITY, "adminTemplatePhotoEditV1");
  const edit = adminTemplatePhotoEdit(f.body, f.action.operationId);
  assert.deepEqual(edit.photoIds, ["фото-3", "photo-1"]); assert.equal(Object.isFrozen(edit.photoIds), true);
  assert.equal(assertAdminTemplatePhotoEditPayload(f.sourcePayload, f.body.payload, edit), true);
  assert.equal(validateAdminTemplatePhotoEditResultStructure(f.result, f.intent), true);
  assert.equal(await validateAdminTemplatePhotoEditResult(f.result, { intent: f.intent }), true);
  assert.deepEqual(f.result.removedPhotoIds, ["photo-2"]);
});

test("all-remove has an empty confirmed array; unchanged legacy photoId-only refs survive reorder verbatim", async () => {
  for (const photoIds of [[], ["photo-2", "фото-3", "photo-1"]]) {
    const f = fixture({ photoIds }); assert.equal(await validateAdminTemplatePhotoEditResult(f.result, { intent: f.intent }), true);
    if (photoIds.length) { assert.equal(f.result.confirmedPayload.items.pump.photos[0].photoId, "photo-2"); assert.equal(Object.hasOwn(f.result.confirmedPayload.items.pump.photos[0], "id"), false); }
    else assert.deepEqual(f.result.removedPhotoIds, ["photo-1", "photo-2", "фото-3"]);
  }
});

test("photo edits accept more than fifty surviving references and Unicode IDs without importing file-package limits", () => {
  const f = fixture(), row = f.body.payload.items.pump;
  row.photos = Array.from({ length: 61 }, (_, index) => ({ id: `фото-${index}`, opaque: index }));
  f.body.photoEdit.photoIds = row.photos.map(photo => photo.id).reverse();
  assert.equal(adminTemplatePhotoEdit(f.body, f.action.operationId).photoIds.length, 61);
});

test("new IDs, duplicate aliases, other owners and composite/unconfirmed sources fail before capture", () => {
  const mutations = [b => b.photoEdit.photoIds.push("new"), b => b.photoEdit.photoIds.push("photo-1"),
    b => { b.payload.items.pump.photos[0].photoId = "conflicting"; }, b => { b.photoEdit.entityId = "missing"; },
    b => { b.photoEdit.photoIds = ["constructor"]; }, b => { b.photoEdit.photoIds = ["x".repeat(192)]; },
    b => { b.base = { operationId: crypto.randomUUID() }; }, b => { b.source = {}; }, b => { b.photoAppend = {}; },
    b => { b.payload.containers.bag.photos = [copy(b.payload.items.pump.photos[0])]; }, b => { b.photoEdit.extra = true; }];
  for (const mutate of mutations) { const f = fixture(); mutate(f.body); assert.throws(() => adminTemplateIntent({ ...f.binding, ...f.action })); }
});

test("only selected form fields may differ from the raw source; packed, unknown and unselected values cannot vanish", () => {
  for (const mutate of [p => { delete p.opaque; }, p => { p.layouts.source.arrangement.packedItems.pump = true; },
    p => { p.containers.bag.name = "Other"; }, p => { p.items.pump.photos.reverse(); }, p => { p.items.pump.photos[0].metadata.credit = "Other"; }]) {
    const f = fixture(); mutate(f.body.payload); assert.throws(() => assertAdminTemplatePhotoEditPayload(f.sourcePayload, f.body.payload, f.body.photoEdit));
  }
});

test("receipt full equality rejects fabricated references and unrelated drift even with a recomputed hash", async () => {
  const mutations = [r => r.photoIds.reverse(), r => r.removedPhotoIds.push("invented"),
    r => { r.confirmedPayload.items.pump.photos[0].metadata.credit = "Other"; }, r => { delete r.confirmedPayload.opaque; },
    r => { r.confirmedPayload.containers.bag.name = "Other"; }, r => { r.confirmedPayload.items.pump.photos.reverse(); },
    r => { r.ownerId = ""; }, r => { r.entityType = "container"; }];
  for (const mutate of mutations) { const f = fixture(); mutate(f.result); f.result.confirmedPayloadDigest = hash(f.result.confirmedPayload);
    assert.equal(await validateAdminTemplatePhotoEditResult(f.result, { intent: f.intent }), false); }
  const f = fixture(); f.result.confirmedPayloadDigest = "0".repeat(64);
  assert.equal(await validateAdminTemplatePhotoEditResult(f.result, { intent: f.intent }), false);
});

test("async result verification freezes both proof and source before yielding", async () => {
  const f = fixture(), pending = validateAdminTemplatePhotoEditResult(f.result, { intent: f.intent });
  f.result.confirmedPayload.items.pump.name = "Later"; f.intent.body.photoEdit.photoIds = [];
  assert.equal(await pending, true);
});
