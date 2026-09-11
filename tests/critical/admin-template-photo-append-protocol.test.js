import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { adminTemplateIntent, canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED, TEMPLATE_PHOTO_APPEND_CAPABILITY,
  adminTemplatePhotoStageManifest, adminTemplatePhotoStageDigest, adminTemplatePhotoAppend,
  validateAdminTemplatePhotoStageReceipt, validateAdminTemplatePhotoAppendResult } from "../../src/sync/admin-template-photo-append-protocol.js";

const sha = value => createHash("sha256").update(value).digest("hex");
const copy = value => JSON.parse(JSON.stringify(value));
function manifest() {
  return { version: 1, environment: "bike-packing-experiment", actorId: "admin-a", operationId: randomUUID(),
    templateOperationId: randomUUID(), itemKey: "shared-layout:bag", listId: "public-shared-layout-bag", baseStateRevision: 7,
    entityType: "item", entityId: "server-item", photoId: "photo-" + randomUUID(),
    file: { hash: sha("original file bytes"), size: 19, type: "image/jpeg", fileName: "Фото.jpg" },
    thumb: { hash: sha("thumb bytes"), size: 11, type: "image/webp" } };
}
async function save() {
  const stage = manifest(), old = { photoId: "old-photo", listId: stage.listId, url: "/old", legacy: { keep: true } };
  const body = { version: 1, base: { stateRevision: stage.baseStateRevision }, metadata: { title: "Template", description: "", language: "ru" },
    payload: { items: { [stage.entityId]: { id: stage.entityId, name: "Changed name", photos: [old] } }, containers: {} },
    photoAppend: { version: 1, assets: [{ assetId: stage.operationId, assetDigest: await adminTemplatePhotoStageDigest(stage),
      entityType: stage.entityType, entityId: stage.entityId, photoId: stage.photoId }] } };
  return { stage, old, body };
}

test("administrative photo append stays disabled while its exact immutable save grammar is readable", async () => {
  assert.equal(ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED, false);
  assert.equal(TEMPLATE_PHOTO_APPEND_CAPABILITY, "adminTemplatePhotoAppendV1");
  const { stage, body } = await save();
  const intent = adminTemplateIntent({ ...stage, operationId: stage.templateOperationId, kind: "template.save", body });
  assert.deepEqual(intent.body, body);
  for (const kind of ["template.create", "template.copy", "template.metadata", "template.publication"]) {
    assert.throws(() => adminTemplateIntent({ ...stage, operationId: stage.templateOperationId, kind, body }), { code: "invalid_template_operation" });
  }
});

test("stage digest binds original immutable bytes metadata and exact save identity before any upload", async () => {
  const input = manifest(), before = copy(input), frozen = adminTemplatePhotoStageManifest(input);
  const pending = adminTemplatePhotoStageDigest(input);
  input.file.hash = sha("different bytes"); input.templateOperationId = randomUUID();
  assert.deepEqual(frozen, before);
  assert.equal(await pending, sha(canonicalTemplateJson(before)));
  assert.throws(() => { frozen.file.fileName = "other.jpg"; }, TypeError);
  const reordered = Object.fromEntries(Object.entries(before).reverse());
  assert.equal(await adminTemplatePhotoStageDigest(reordered), sha(canonicalTemplateJson(before)));
  for (const change of [value => { value.templateOperationId = randomUUID(); }, value => { value.baseStateRevision++; },
    value => { value.entityId = "another-item"; }, value => { value.file.fileName = "Другое.jpg"; },
    value => { value.file.hash = sha("different"); }, value => { value.thumb = null; }]) {
    const changed = copy(before); change(changed);
    assert.notEqual(await adminTemplatePhotoStageDigest(changed), await pending);
  }
});

test("stage rejects namespace substitution, unknown fields, unsafe identities and invalid binary metadata", () => {
  for (const change of [value => { value.environment = "production"; }, value => { value.actorId = ""; },
    value => { value.listId = "private-list"; }, value => { value.itemKey = "demo-state"; },
    value => { value.operationId = value.templateOperationId; }, value => { value.baseStateRevision = 0; },
    value => { value.entityId = "constructor"; }, value => { value.entityType = "layout"; },
    value => { value.photoId = "../escape"; }, value => { value.ownerId = "claimed-owner"; },
    value => { value.file.storedHash = sha("server bytes"); }, value => { value.file.hash = "A".repeat(64); },
    value => { value.file.size = 0; }, value => { value.file.size = 10 * 1024 * 1024 + 1; },
    value => { value.file.type = "text/html"; }, value => { value.file.fileName = "name\n.jpg"; },
    value => { delete value.thumb; }, value => { value.thumb = { ...value.thumb, fileName: "unexpected" }; }]) {
    const input = manifest(); change(input); assert.throws(() => adminTemplatePhotoStageManifest(input), { code: "admin-template-photo-append" });
  }
  for (const [listId, itemKey] of [["public-demo-state", "demo-state"], ["public-demo-state-en", "demo-state:en"],
    ["public-shared-layout-bag", "shared-layout:bag"]]) {
    assert.doesNotThrow(() => adminTemplatePhotoStageManifest({ ...manifest(), listId, itemKey }));
  }
});

test("append preserves ordered stage identities and old raw photo references including legacy metadata", async () => {
  const { stage, body, old } = await save(), second = { ...body.photoAppend.assets[0], assetId: randomUUID(), photoId: "second-photo" };
  body.photoAppend.assets.push(second);
  const before = copy(body), result = adminTemplatePhotoAppend(body, stage.templateOperationId);
  assert.deepEqual(result, before.photoAppend);
  assert.deepEqual(body.payload.items[stage.entityId].photos, [old]);
  body.photoAppend.assets.reverse(); body.photoAppend.assets[0].assetDigest = sha("changed");
  assert.deepEqual(result, before.photoAppend);
  assert.throws(() => result.assets.push(second), TypeError);
});

test("append refuses pending sources, undeclared/new owners, mixed owners and reusing existing photo identities", async () => {
  const f = await save();
  for (const change of [body => { body.base = { operationId: randomUUID() }; }, body => { body.source = {}; },
    body => { body.photoAppend.assets = []; }, body => { body.photoAppend.extra = true; },
    body => { body.photoAppend.assets[0].assetId = f.stage.templateOperationId; },
    body => { body.photoAppend.assets.push(copy(body.photoAppend.assets[0])); },
    body => { body.photoAppend.assets[0].photoId = "old-photo"; },
    body => { body.photoAppend.assets[0].assetDigest = "bad"; },
    body => { delete body.payload.items[f.stage.entityId]; },
    body => { body.payload.items[f.stage.entityId].id = "another-owner"; },
    body => { body.payload.items[f.stage.entityId].photos = {}; },
    body => { body.payload.containers.bag = { id: "bag" }; body.photoAppend.assets.push({ ...body.photoAppend.assets[0],
      assetId: randomUUID(), photoId: "different-photo", entityType: "container", entityId: "bag" }); }]) {
    const body = copy(f.body); change(body);
    assert.throws(() => adminTemplatePhotoAppend(body, f.stage.templateOperationId), { code: "admin-template-photo-append" });
  }
});

async function receiptFixture() {
  const f = await save(), stored = { file: { hash: sha("EXIF stripped"), size: 13, type: "image/jpeg", fileName: "Фото.jpg", width: 12, height: 8 },
    thumb: { hash: sha("stored thumb"), size: 12, type: "image/webp" } };
  const stageReceipt = { ok: true, assetState: "ready", receipt: { version: 1, manifest: f.stage,
    assetDigest: f.body.photoAppend.assets[0].assetDigest, ownerId: "template-owner", baseEntityRevision: 3, stored } };
  const asset = f.body.photoAppend.assets[0], photo = { id: asset.photoId, photoId: asset.photoId, assetId: asset.assetId, listId: f.stage.listId, status: "synced",
    url: `https://example.test/api/bike-packing/lists/${f.stage.listId}/photos/${asset.photoId}/file`,
    thumbUrl: `https://example.test/api/bike-packing/lists/${f.stage.listId}/photos/${asset.photoId}/thumb`,
    ...Object.fromEntries(["fileName", "type", "size", "width", "height"].map(key => [key, stored.file[key]])) };
  const confirmedPayload = copy(f.body.payload);
  confirmedPayload.items[f.stage.entityId].photos.push(photo);
  confirmedPayload.items[f.stage.entityId].serverDefault = "normalization is authoritative";
  const { photoId: _photoId, ...addedAsset } = asset;
  const result = { version: 1, ownerId: "template-owner", added: [{ ...addedAsset, photo }], confirmedPayload,
    confirmedPayloadDigest: sha(canonicalTemplateJson(confirmedPayload)) };
  const intent = { id: f.stage.templateOperationId, environment: f.stage.environment, actorId: f.stage.actorId,
    listId: f.stage.listId, itemKey: f.stage.itemKey, kind: "template.save", body: f.body };
  return { ...f, stageReceipt, result, expected: { intent, stageReceipts: [stageReceipt] } };
}

test("stage receipt distinguishes uploading administrator from owner and retains unavailable confirmation", async () => {
  const f = await receiptFixture(), expected = { manifest: f.stage, assetDigest: f.body.photoAppend.assets[0].assetDigest };
  assert.notEqual(f.stage.actorId, f.stageReceipt.receipt.ownerId);
  assert.equal(await validateAdminTemplatePhotoStageReceipt(f.stageReceipt, expected), true);
  assert.equal(await validateAdminTemplatePhotoStageReceipt({ ...f.stageReceipt, assetState: "unavailable" }, expected), true);
  for (const change of [data => { data.assetState = "unknown"; }, data => { data.receipt.manifest.templateOperationId = randomUUID(); },
    data => { data.receipt.manifest.actorId = "another-admin"; }, data => { data.receipt.assetDigest = sha("other"); },
    data => { data.receipt.ownerId = ""; }, data => { data.receipt.baseEntityRevision = 0; },
    data => { data.receipt.stored.file.type = "image/webp"; }, data => { data.receipt.stored.file.width = 0; },
    data => { data.receipt.stored.file.path = "operations/secret"; }, data => { delete data.receipt.stored.thumb; }]) {
    const value = copy(f.stageReceipt); change(value);
    assert.equal(await validateAdminTemplatePhotoStageReceipt(value, expected), false);
  }
  assert.equal(await validateAdminTemplatePhotoStageReceipt(f.stageReceipt, { ...expected, assetDigest: sha("not manifest") }), false);
});

test("a missing input thumbnail must confirm exactly the stored original as its effective thumbnail", async () => {
  const f = await receiptFixture(); f.stage.thumb = null;
  const value = copy(f.stageReceipt); value.receipt.manifest = f.stage; value.receipt.assetDigest = await adminTemplatePhotoStageDigest(f.stage);
  const expected = { manifest: f.stage, assetDigest: value.receipt.assetDigest };
  assert.equal(await validateAdminTemplatePhotoStageReceipt(value, expected), false);
  const file = value.receipt.stored.file;
  value.receipt.stored.thumb = { hash: file.hash, size: file.size, type: file.type };
  assert.equal(await validateAdminTemplatePhotoStageReceipt(value, expected), true);
});

test("append result confirms exact stage metadata, old raw photo prefix and the receipt's authoritative payload", async () => {
  const f = await receiptFixture();
  assert.equal(await validateAdminTemplatePhotoAppendResult(f.result, f.expected), true);
  const pending = validateAdminTemplatePhotoAppendResult(f.result, f.expected);
  f.result.ownerId = "racing-change"; f.expected.intent.actorId = "racing-actor";
  assert.equal(await pending, true);
});

test("append confirmation rejects foreign owners, stale stages, altered photos and new/remapped entities even with recomputed payload hash", async () => {
  for (const change of [f => { f.result.ownerId = "admin-a"; }, f => { f.result.added[0].assetDigest = sha("wrong"); },
    f => { f.result.added[0].photo.url = "javascript:alert(1)"; }, f => { f.result.added[0].photo.thumbUrl = f.result.added[0].photo.url; },
    f => { f.result.added[0].photo.size++; }, f => { f.result.added[0].photo.localId = "unexpected"; },
    f => { f.result.confirmedPayload.items[f.stage.entityId].photos[0].legacy.keep = false; },
    f => { f.result.confirmedPayload.items[f.stage.entityId].photos.reverse(); },
    f => { f.result.confirmedPayload.items[f.stage.entityId].id = "other-owner"; },
    f => { f.result.confirmedPayload.containers.extra = { id: "extra" }; },
    f => { f.expected.stageReceipts[0].receipt.manifest.baseStateRevision++; },
    f => { f.expected.stageReceipts = []; }]) {
    const f = await receiptFixture(); change(f);
    f.result.confirmedPayloadDigest = sha(canonicalTemplateJson(f.result.confirmedPayload));
    assert.equal(await validateAdminTemplatePhotoAppendResult(f.result, f.expected), false);
  }
  const f = await receiptFixture(); f.result.confirmedPayloadDigest = sha("other payload");
  assert.equal(await validateAdminTemplatePhotoAppendResult(f.result, f.expected), false);
});
