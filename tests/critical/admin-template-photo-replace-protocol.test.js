import test from "node:test";
import assert from "node:assert/strict";
import { adminTemplateIntent } from "../../src/sync/admin-template-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_REPLACE_ENABLED, TEMPLATE_PHOTO_REPLACE_CAPABILITY, adminTemplatePhotoAppend,
  adminTemplatePhotoReplaceSelection, adminTemplatePhotoReplacePayload, assertAdminTemplatePhotoReplacePayload,
  validateAdminTemplatePhotoAppendResultStructure, validateAdminTemplatePhotoAppendResult, validateAdminTemplatePhotoStages,
  adminTemplatePhotoStageDigest } from "../../src/sync/admin-template-photo-append-protocol.js";
import { adminPhotoReplaceFixture as fixture, copy, hash } from "../fixtures/admin-template-photo-replace-fixture.js";

const invalid = { code: "admin-template-photo-append" };
for (const entityType of ["item", "container"]) test(`${entityType}: mixed replacement derives only the final selected photo array and validates unchanged stage proofs`, async () => {
  const f = await fixture({ entityType }), before = copy(f.body);
  assert.equal(ADMIN_TEMPLATE_PHOTO_REPLACE_ENABLED, false); assert.equal(TEMPLATE_PHOTO_REPLACE_CAPABILITY, "adminTemplatePhotoReplaceV1");
  const selection = adminTemplatePhotoReplaceSelection(f.body, f.operationId);
  assert.deepEqual(selection, { entityType, entityId: f.serverId, photoIds: f.body.photoAppend.photoIds, removedPhotoIds: ["фото-3"] });
  assert.equal(Object.isFrozen(selection.photoIds), true);
  const derived = adminTemplatePhotoReplacePayload(f.intent, f.result.added);
  assert.deepEqual(derived, f.result.confirmedPayload); assert.deepEqual(f.body, before);
  assert.equal(derived[f.type][f.serverId].photos[1].photoId, "photo-2");
  assert.equal(Object.hasOwn(derived[f.type][f.serverId].photos[1], "id"), false, "Raw legacy alias must not be normalized");
  assert.equal(assertAdminTemplatePhotoReplacePayload(f.sourcePayload, f.body.payload, f.body.photoAppend), true);
  assert.equal(await validateAdminTemplatePhotoStages(f.intent, f.stageReceipts), true);
  assert.equal(validateAdminTemplatePhotoAppendResultStructure(f.result, f.intent), true);
  assert.equal(await validateAdminTemplatePhotoAppendResult(f.result, f.expected), true);
  derived[f.type][f.serverId].photos[1].metadata.credit = "Caller changed returned value";
  assert.equal(f.body.payload[f.type][f.serverId].photos[1].metadata.credit, "Original");
});

test("new primary/interleaving, old reordering, and removal of every old photo are explicit V2 choices", async () => {
  for (const photoIds of [["photo-new-1", "photo-1", "photo-2", "фото-3", "photo-new-2"],
    ["photo-1", "photo-new-1", "photo-2", "photo-new-2", "фото-3"],
    ["фото-3", "photo-2", "photo-1", "photo-new-1", "photo-new-2"], ["photo-new-2", "photo-new-1"]]) {
    const f = await fixture({ photoIds }); assert.equal(await validateAdminTemplatePhotoAppendResult(f.result, f.expected), true);
  }
});

test("V2 does not absorb pure appends, empty original owners, asset-only reordering or fileless edits", async () => {
  const mutations = [f => { f.body.photoAppend.photoIds = ["photo-1", "photo-2", "фото-3", "photo-new-1", "photo-new-2"]; },
    f => { f.body.photoAppend.photoIds = ["photo-1", "photo-2", "фото-3", "photo-new-2", "photo-new-1"]; },
    f => { f.body.payload[f.type][f.serverId].photos = []; f.body.photoAppend.photoIds = ["photo-new-1", "photo-new-2"]; },
    f => { f.body.photoAppend.assets = []; f.body.photoAppend.photoIds = ["photo-2"]; }];
  for (const mutate of mutations) { const f = await fixture(); mutate(f); assert.throws(() => adminTemplatePhotoAppend(f.body, f.operationId), invalid); }
  const f = await fixture(); f.body.photoAppend = { version: 1, assets: f.body.photoAppend.assets };
  assert.doesNotThrow(() => adminTemplateIntent({ ...f.binding, operationId: f.operationId, kind: "template.save", body: f.body }));
  assert.throws(() => adminTemplatePhotoReplaceSelection(f.body, f.operationId), invalid);
});

test("every new asset appears once and references can only belong to the original selected owner", async () => {
  const mutations = [f => { f.body.photoAppend.photoIds.pop(); f.body.photoAppend.photoIds.pop(); },
    f => { f.body.photoAppend.photoIds.push("photo-new-1"); }, f => { f.body.photoAppend.photoIds.push("unowned"); },
    f => { f.body.photoAppend.assets[0].photoId = "photo-1"; },
    f => { f.body.payload.containers.bag.photos = [{ id: "other-owner-photo" }]; f.body.photoAppend.photoIds.push("other-owner-photo"); },
    f => { f.body.payload.containers.bag.photos = [copy(f.body.payload.items.pump.photos[0])]; },
    f => { f.body.payload.items.pump.photos[0].photoId = "conflicting"; },
    f => { f.body.photoAppend.assets[1].entityType = "container"; f.body.photoAppend.assets[1].entityId = "bag"; },
    f => { f.body.photoAppend.photoIds[0] = "constructor"; }, f => { f.body.photoAppend.photoIds[0] = "x".repeat(192); },
    f => { f.body.photoAppend.photoIds = []; }, f => { f.body.photoAppend.photoIds.push(7); },
    f => { f.body.base = { operationId: crypto.randomUUID() }; }, f => { f.body.source = {}; }, f => { f.body.photoEdit = {}; }];
  for (const mutate of mutations) { const f = await fixture(); mutate(f); assert.throws(() => adminTemplatePhotoAppend(f.body, f.operationId), invalid); }
});

test("the stage limit remains fifty new files while preserved old Unicode IDs have no invented fifty-photo limit", async () => {
  const f = await fixture(), old = f.body.payload.items.pump.photos;
  old.push(...Array.from({ length: 61 }, (_, index) => ({ photoId: `旧-${index}`, metadata: { index } })));
  f.body.photoAppend.photoIds = ["photo-new-1", ...old.map(photo => photo.id ?? photo.photoId), "photo-new-2"];
  assert.equal(adminTemplatePhotoAppend(f.body, f.operationId).photoIds.length, 66);
  while (f.body.photoAppend.assets.length < 51) {
    const photoId = `extra-${f.body.photoAppend.assets.length}`;
    f.body.photoAppend.assets.push({ ...f.body.photoAppend.assets[0], assetId: crypto.randomUUID(), photoId }); f.body.photoAppend.photoIds.push(photoId);
  }
  assert.throws(() => adminTemplatePhotoAppend(f.body, f.operationId), invalid);
});

test("raw before payload permits selected form fields only and cannot pre-delete photos or lose opaque/packed data", async () => {
  for (const mutate of [p => { delete p.opaque; }, p => { p.layouts.source.arrangement.packedItems.pump = true; },
    p => { p.items.pump.photos.shift(); }, p => { p.items.pump.photos[0].metadata.credit = "Other"; },
    p => { p.containers.bag.name = "Other owner"; }, p => { p.locations[0].opaque = false; }]) {
    const f = await fixture(); mutate(f.body.payload);
    assert.throws(() => assertAdminTemplatePhotoReplacePayload(f.sourcePayload, f.body.payload, f.body.photoAppend), invalid);
  }
});

test("V2 receipts bind final/removed order and the entire exact raw payload even when a tampered digest is recomputed", async () => {
  const mutations = [r => { r.version = 1; }, r => { r.extra = true; }, r => { r.photoIds.reverse(); },
    r => { r.removedPhotoIds = []; }, r => { r.confirmedPayload.items.pump.photos.reverse(); },
    r => { r.confirmedPayload.items.pump.photos[1].metadata.credit = "Changed raw reference"; },
    r => { delete r.confirmedPayload.opaque; }, r => { r.confirmedPayload.containers.bag.name = "Other owner"; },
    r => { r.confirmedPayload.layouts.source.arrangement.packedItems.pump = true; },
    r => { r.confirmedPayload.items.pump.serverDefault = "V2 may not invent raw fields"; },
    r => { r.added.reverse(); }, r => { r.added[0].photo.fileName = "Different.jpg"; }];
  for (const mutate of mutations) { const f = await fixture(); mutate(f.result); f.result.confirmedPayloadDigest = hash(f.result.confirmedPayload);
    assert.equal(await validateAdminTemplatePhotoAppendResult(f.result, f.expected), false); }
  const removed = await fixture({ photoIds: ["photo-new-1", "photo-new-2"] }); removed.result.removedPhotoIds.reverse();
  assert.equal(await validateAdminTemplatePhotoAppendResult(removed.result, removed.expected), false);
});

test("V2 cannot fabricate added refs or stage provenance despite internally consistent projected payloads", async () => {
  for (const mutate of [f => { f.result.added[0].photo.size++; }, f => { f.result.added[0].photo.url = "javascript:bad"; },
    f => { f.stageReceipts[0].receipt.ownerId = "different-owner"; }, f => { f.stageReceipts[0].receipt.manifest.baseStateRevision++; },
    f => { f.stageReceipts[0].receipt.manifest.templateOperationId = crypto.randomUUID(); }, f => { f.stageReceipts[0].receipt.manifest.entityId = "other"; },
    f => { f.stageReceipts[0].receipt.stored.file.fileName = "Changed stage filename"; }, f => { f.stageReceipts.pop(); }]) {
    const f = await fixture(); mutate(f);
    try { f.result.confirmedPayload = adminTemplatePhotoReplacePayload(f.intent, f.result.added); } catch { /* Invalid refs fail even before stage verification. */ }
    f.result.confirmedPayloadDigest = hash(f.result.confirmedPayload);
    assert.equal(await validateAdminTemplatePhotoAppendResult(f.result, f.expected), false);
  }
});

test("stage manifest stays V1 and V2 result/intent/stage proofs detach before asynchronous verification", async () => {
  const f = await fixture(), before = copy(f.body), selection = adminTemplatePhotoAppend(f.body, f.operationId);
  const stage = f.stageReceipts[0].receipt.manifest;
  assert.equal(stage.version, 1); assert.equal(await adminTemplatePhotoStageDigest(stage), f.body.photoAppend.assets[0].assetDigest);
  const pending = validateAdminTemplatePhotoAppendResult(f.result, f.expected);
  f.result.photoIds.reverse(); f.intent.body.payload.opaque.nested.push("Later"); f.stageReceipts[0].receipt.ownerId = "Later";
  assert.equal(await pending, true); assert.deepEqual(selection, before.photoAppend);
});
