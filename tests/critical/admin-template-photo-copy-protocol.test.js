import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { adminPhotoCopyFixture as fixture, copy, hash } from "../fixtures/admin-template-photo-copy-fixture.js";
import { ADMIN_TEMPLATE_PHOTO_COPY_ENABLED, TEMPLATE_PHOTO_COPY_CAPABILITY, adminTemplatePhotoCopy, adminTemplatePhotoCopyIntent,
  adminTemplatePhotoCopyReference, adminTemplatePhotoCopyPayload, adminTemplatePhotoCopyStageManifest, adminTemplatePhotoCopyStageDigest,
  adminTemplatePhotoCopyStageManifests, adminTemplatePhotoCopyMaterialization, validateAdminTemplatePhotoCopyStageReceipt,
  validateAdminTemplatePhotoCopyStages, validateAdminTemplatePhotoCopyResult, validateAdminTemplatePhotoCopyResultStructure,
  assertAdminTemplatePhotoCopyPrepared, assertAdminTemplatePhotoCopyIntentDigests } from "../../src/sync/admin-template-photo-copy-protocol.js";
import { adminTemplateIntent } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoStageManifest } from "../../src/sync/admin-template-photo-append-protocol.js";
import { adminTemplatePhotoCreateStageManifest, adminTemplatePhotoCreateIntent } from "../../src/sync/admin-template-photo-create-protocol.js";

test("separate copy contract remains OFF; existing create, upload and general parsers stay closed", async () => {
  const f = await fixture(); assert.equal(ADMIN_TEMPLATE_PHOTO_COPY_ENABLED, false); assert.equal(TEMPLATE_PHOTO_COPY_CAPABILITY, "adminTemplatePhotoCopyV1");
  assert.throws(() => adminTemplateIntent(f.request)); assert.throws(() => adminTemplatePhotoCreateIntent(f.request));
  assert.throws(() => adminTemplatePhotoStageManifest(f.manifests[0])); assert.throws(() => adminTemplatePhotoCreateStageManifest(f.manifests[0]));
  assert.equal(Object.isFrozen(f.intent.body.photoCopy.source.payload), true);
});

test("item catalog copy preserves source, target, unknown owner data, quantity and availability without placement", async () => {
  const f = await fixture(), before = copy(f.body), p = f.result.confirmedPayload, owner = p.items[f.entityId];
  assert.deepEqual(owner.opaque, f.sourceOwner.opaque); assert.equal(owner.color, "Raw_Color"); assert.equal(owner.availabilityStatus, "lost");
  assert.equal(owner.containerId, ""); assert.equal(owner.name, f.body.photoCopy.fields.name); assert.equal(owner.createdAt, f.body.photoCopy.fields.createdAt);
  assert.deepEqual(p.layouts, f.body.payload.layouts); assert.deepEqual(p.packedItems, f.body.payload.packedItems);
  for (const [key, value] of Object.entries(f.body.payload.items)) assert.deepEqual(p.items[key], value);
  assert.deepEqual(p.containers, f.body.payload.containers); assert.deepEqual(p.locations, f.body.payload.locations);
  assert.deepEqual(f.body, before); assert.equal(await validateAdminTemplatePhotoCopyResult(f.result, f.expected), true);
  assert.equal(await assertAdminTemplatePhotoCopyPrepared(f.intent, f.observation), true);
});

test("root bag shell empties only copied tree links; original contents/photos and raw tree remain exact", async () => {
  const f = await fixture({ entityType: "container" }), before = copy(f.body.photoCopy.source.payload), p = f.result.confirmedPayload, owner = p.containers[f.entityId];
  assert.ok(f.sourceOwner.itemIds.length); assert.ok(f.sourceOwner.childIds.length);
  assert.deepEqual([owner.parentId, owner.childIds, owner.itemIds, owner.order], [null, [], [], []]);
  assert.deepEqual(p.items, f.body.payload.items); assert.deepEqual(p.layouts, f.body.payload.layouts);
  assert.deepEqual(f.body.photoCopy.source.payload, before); assert.deepEqual(owner.opaque, f.sourceOwner.opaque);
  assert.equal(owner.photos.length, 2); assert.equal(await validateAdminTemplatePhotoCopyResult(f.result, f.expected), true);
  f.body.photoCopy.source.payload.containers["сумка"].parentId = "other";
  assert.throws(() => adminTemplatePhotoCopyIntent(f.request));
});

test("legacy aliases regenerate canonical new routes while photo timestamps are preserved exactly", async () => {
  const f = await fixture(), photos = f.result.confirmedPayload.items[f.entityId].photos;
  assert.equal(photos[1].createdAt, null); assert.equal(photos[0].createdAt, "2025-01-02T00:00:00Z");
  assert.equal(Object.hasOwn(photos[1], "src"), false); assert.equal(Object.hasOwn(photos[1], "thumb_url"), false);
  assert.match(photos[1].url, /copied-photo-1\/file$/); assert.equal(Object.hasOwn(photos[1], "localId"), false);
  assert.ok(f.sourceOwner.photos[1].src); assert.equal(await validateAdminTemplatePhotoCopyResult(f.result, f.expected), true);
  for (const key of ["unknown", "caption", "filePath", "publicCopySourceId", "_copyToCurrentList"]) {
    assert.throws(() => adminTemplatePhotoCopyReference({ ...f.sourceOwner.photos[0], [key]: "unsupported" }, f.body.photoCopy.source.listId),
      { code: "admin-template-photo-copy-unsupported-photo-metadata" });
  }
  for (const patch of [{ localId: "pending-file" }, { error: "upload failed" }, { status: "pending" }, { photoId: "conflict" }, { listId: "personal-other" }])
    assert.throws(() => adminTemplatePhotoCopyReference({ ...f.sourceOwner.photos[0], ...patch }, f.body.photoCopy.source.listId));
});

test("only copy name and actual creation/edit metadata can override raw owner fields", async () => {
  for (const patch of [{ weight: 1 }, { id: "different" }, { photos: [] }, { childIds: [] }, { createdAt: "yesterday" }, { name: " " }]) {
    const f = await fixture(); Object.assign(f.body.photoCopy.fields, patch); assert.throws(() => adminTemplatePhotoCopyIntent(f.request));
  }
  const f = await fixture(); f.body.photoCopy.source.payload.items["old-item"].parentContainerId = "сумка";
  assert.throws(() => adminTemplatePhotoCopyIntent(f.request), { code: "admin-template-photo-copy-unsupported-owner-placement" });
});

test("all photos map once in source order with permanent new asset/photo IDs and no collisions", async () => {
  for (const count of [1, 50]) { const f = await fixture({ count }); assert.equal(adminTemplatePhotoCopy(f.body, f.operationId).assets.length, count); }
  const mutations = [f => f.body.photoCopy.assets.reverse(), f => f.body.photoCopy.assets.pop(), f => f.body.photoCopy.assets.push(copy(f.body.photoCopy.assets[0])),
    f => { f.body.photoCopy.assets[0].assetId = f.operationId; }, f => { f.body.photoCopy.assets[1].assetId = f.body.photoCopy.assets[0].assetId; },
    f => { f.body.photoCopy.assets[0].assetId = f.sourceOwner.photos[0].assetId; },
    f => { f.body.photoCopy.assets[1].photoId = f.body.photoCopy.assets[0].photoId; }, f => { f.body.photoCopy.assets[0].photoId = "source-photo-1"; },
    f => { f.body.payload.items.detached.photos = [{ id: "copied-photo-0" }]; }, f => { f.body.photoCopy.assets[0].photoId = "новое-фото"; }];
  for (const mutate of mutations) { const f = await fixture(); mutate(f); assert.throws(() => adminTemplatePhotoCopyIntent(f.request)); }
});

test("new owner must be absent across both complete inventories and all collection types", async () => {
  for (const which of ["source", "target"]) for (const type of ["items", "containers", "layouts"]) {
    const f = await fixture(), p = which === "source" ? f.body.photoCopy.source.payload : f.body.payload;
    p[type][f.entityId] = { id: f.entityId }; assert.throws(() => adminTemplatePhotoCopyIntent(f.request));
  }
  const f = await fixture(); f.body.payload.layouts.source.arrangement.packedItems.phantom = true;
  assert.throws(() => adminTemplatePhotoCopyIntent(f.request));
});

test("confirmed admin bindings only; personal, public action, pending, same-list and placement widening reject", async () => {
  const mutations = [f => { f.body.base = { operationId: randomUUID() }; }, f => { f.body.photoCopy.source.base = { operationId: randomUUID() }; },
    f => { f.body.photoCopy.source.listId = f.binding.listId; f.body.photoCopy.source.itemKey = f.binding.itemKey; },
    f => { f.body.photoCopy.source.listId = "personal-list"; }, f => { f.body.photoCopy.source.itemKey = "demo-state"; },
    f => { f.request.kind = "template.copy"; }, f => { f.request.environment = "production"; }, f => { f.body.photoCopy.placement = null; }];
  for (const key of ["photoCreate", "photoAppend", "photoEdit", "source", "published"]) mutations.push(f => { f.body[key] = {}; });
  for (const mutate of mutations) { const f = await fixture(); mutate(f); assert.throws(() => adminTemplatePhotoCopyIntent(f.request)); }
});

test("manifests bind source raw digest, individual exact reference and full target digest without input-byte hashes", async () => {
  const f = await fixture(), m = f.manifests[0];
  assert.equal(m.source.payloadDigest, hash(f.body.photoCopy.source.payload)); assert.equal(m.source.referenceDigest, hash(f.sourceOwner.photos[0]));
  assert.equal(m.target.payloadDigest, hash(f.body.payload)); assert.equal(Object.hasOwn(m, "file"), false);
  assert.equal(await adminTemplatePhotoCopyStageDigest(m), f.body.photoCopy.assets[0].assetDigest);
  assert.equal(await assertAdminTemplatePhotoCopyIntentDigests(f.intent), true);
  const changed = copy(f.request); changed.body.photoCopy.source.payload.opaque.keep.push("changed");
  await assert.rejects(adminTemplatePhotoCopyStageManifests(adminTemplatePhotoCopyIntent(changed)), { code: "admin-template-photo-copy-source-digest" });
  const changedTarget = copy(f.request); changedTarget.body.payload.opaque.keep.push("new target");
  assert.equal(await validateAdminTemplatePhotoCopyStages(adminTemplatePhotoCopyIntent(changedTarget), f.stages), false);
});

test("wrong source/target/actor/UUID/base/reference manifests cannot authorize another copy", async () => {
  const mutations = [m => { m.actorId = "other-admin"; }, m => { m.operationId = randomUUID(); }, m => { m.templateOperationId = randomUUID(); },
    m => { m.source.baseStateRevision++; }, m => { m.source.entityId = "other"; }, m => { m.source.photoId = "other-photo"; },
    m => { m.source.referenceDigest = "f".repeat(64); }, m => { m.target.baseStateRevision++; }, m => { m.target.entityId = "other"; },
    m => { m.target.photoId = "other-new"; }, m => { m.target.payloadDigest = "f".repeat(64); }, m => { m.target.listId = "public-demo-state"; m.target.itemKey = "demo-state"; }];
  for (const mutate of mutations) { const f = await fixture(), stages = copy(f.stages); mutate(stages[0].receipt.manifest);
    stages[0].receipt.assetDigest = await adminTemplatePhotoCopyStageDigest(stages[0].receipt.manifest);
    assert.equal(await validateAdminTemplatePhotoCopyStages(f.intent, stages), false); }
});

test("source bytes and independently materialized copied bytes must match exactly", async () => {
  const f = await fixture(), expected = { manifest: f.manifests[0], assetDigest: f.body.photoCopy.assets[0].assetDigest };
  assert.equal(await validateAdminTemplatePhotoCopyStageReceipt(f.stages[0], expected), true);
  for (const mutate of [r => { r.stored.file.hash = "f".repeat(64); }, r => { r.stored.thumb.hash = "f".repeat(64); },
    r => { r.stored.file.size++; }, r => { r.stored.file.type = "image/png"; }, r => { r.baseEntityRevision = 1; },
    r => { r.materialization.target.filePathDigest = r.materialization.source.thumbPathDigest; },
    r => { r.materialization.source.filePathDigest = r.materialization.source.thumbPathDigest; }]) {
    const s = copy(f.stages[0]); mutate(s.receipt); assert.equal(await validateAdminTemplatePhotoCopyStageReceipt(s, expected), false);
  }
  const unavailable = copy(f.stages[0]); unavailable.assetState = "unavailable";
  assert.equal(await validateAdminTemplatePhotoCopyStageReceipt(unavailable, expected), true); // Historical proof, no dispatch authority.
});

test("materialization refuses old paths, traversal, case aliases and cross-photo sharing", async () => {
  const source = { filePath: "legacy/source.jpg", thumbPath: "legacy/source.webp" };
  for (const target of [{ filePath: "legacy/source.jpg", thumbPath: "operations/new.webp" },
    { filePath: "LEGACY/SOURCE.WEBP", thumbPath: "operations/new.webp" }, { filePath: "../old.jpg", thumbPath: "new.webp" },
    { filePath: "/old.jpg", thumbPath: "new.webp" }, { filePath: "dir//x.jpg", thumbPath: "new.webp" }])
    await assert.rejects(adminTemplatePhotoCopyMaterialization(source, target));
  const f = await fixture(); let stages = copy(f.stages);
  stages[0].receipt.materialization.target.filePathDigest = stages[1].receipt.materialization.source.filePathDigest;
  assert.equal(await validateAdminTemplatePhotoCopyStages(f.intent, stages), false);
  stages = copy(f.stages); stages[1].receipt.materialization.target = copy(stages[0].receipt.materialization.target);
  assert.equal(await validateAdminTemplatePhotoCopyStages(f.intent, stages), false);
});

test("actor and source/target owners are distinct; stage ordering and common owners are still strict", async () => {
  const f = await fixture(); assert.equal(new Set([f.intent.actorId, f.result.sourceOwnerId, f.result.ownerId]).size, 3);
  for (const mutate of [s => s.reverse(), s => { s[0].receipt.ownerId = "other-owner"; }, s => { s[0].receipt.sourceOwnerId = "other-source-owner"; }]) {
    const stages = copy(f.stages); mutate(stages); assert.equal(await validateAdminTemplatePhotoCopyResult(f.result, { intent: f.intent, stageReceipts: stages }), false);
  }
});

test("full receipt rejects collateral raw edits, reordered photos, old aliases and timestamp loss even with recomputed hash", async () => {
  const f = await fixture();
  for (const mutate of [r => { r.confirmedPayload.items.detached.unknown = "lost"; }, r => { r.confirmedPayload.locations = []; },
    r => { r.confirmedPayload.layouts.source.arrangement.packedItems = {}; }, r => { r.confirmedPayload.items[f.entityId].opaque = {}; },
    r => { r.added.reverse(); }, r => { r.added[0].photo.url = f.sourceOwner.photos[0].url; }, r => { delete r.added[0].photo.createdAt; },
    r => { r.added[0].photo.src = "https://old.example/photo"; }, r => { r.ownerId = f.intent.actorId; }]) {
    const r = copy(f.result); mutate(r); r.confirmedPayloadDigest = hash(r.confirmedPayload);
    assert.equal(await validateAdminTemplatePhotoCopyResult(r, f.expected), false);
  }
  assert.equal(validateAdminTemplatePhotoCopyResultStructure(f.result, f.intent), true);
});

test("trusted observation contract rejects revoked rights, public/deleted/stale/changed source or target", async () => {
  const f = await fixture();
  for (const mutate of [o => { o.canManage = false; }, o => { o.actorId = "other"; },
    ...["source", "target"].flatMap(key => [o => { o[key].visibility = "public"; }, o => { o[key].deleted = true; },
      o => { o[key].stateRevision++; }, o => { o[key].payload.opaque.keep.push("changed"); }, o => { o[key].itemKey = "demo-state"; }])]) {
    const o = copy(f.observation); mutate(o); await assert.rejects(assertAdminTemplatePhotoCopyPrepared(f.intent, o));
  }
  const changed = copy(f.request); changed.body.photoCopy.assets[0].assetDigest = "f".repeat(64);
  await assert.rejects(assertAdminTemplatePhotoCopyPrepared(adminTemplatePhotoCopyIntent(changed), f.observation), { code: "admin-template-photo-copy-stage-binding" });
});

test("async digests, observed snapshots and receipt verification detach every mutable input before yielding", async () => {
  const f = await fixture(), manifest = copy(f.manifests[0]), expected = hash(manifest), task = adminTemplatePhotoCopyStageDigest(manifest);
  manifest.source.photoId = "later"; assert.equal(await task, expected);
  const result = copy(f.result), options = copy(f.expected), validation = validateAdminTemplatePhotoCopyResult(result, options);
  result.confirmedPayload.opaque = null; options.stageReceipts[0].receipt.ownerId = "later"; assert.equal(await validation, true);
  const observation = copy(f.observation), proof = assertAdminTemplatePhotoCopyPrepared(f.intent, observation);
  observation.canManage = false; observation.target.payload.opaque = null; assert.equal(await proof, true);
  const source = copy(f.sourceOwner); adminTemplatePhotoCopyPayload(f.intent, f.added); assert.deepEqual(f.sourceOwner, source);
});
