import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { adminPhotoCreateFixture as fixture, copy, hash } from "../fixtures/admin-template-photo-create-fixture.js";
import { ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED, TEMPLATE_PHOTO_CREATE_CAPABILITY, adminTemplatePhotoCreate, adminTemplatePhotoCreateIntent,
  adminTemplatePhotoCreatePayload, assertAdminTemplatePhotoCreateSource, adminTemplatePhotoCreateStageManifest, adminTemplatePhotoCreateStageDigest,
  assertAdminTemplatePhotoCreateOwnerAbsent,
  validateAdminTemplatePhotoCreateStageReceipt, validateAdminTemplatePhotoCreateStages, validateAdminTemplatePhotoCreateResultStructure,
  validateAdminTemplatePhotoCreateResult } from "../../src/sync/admin-template-photo-create-protocol.js";
import { adminTemplateIntent } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoStageManifest, validateAdminTemplatePhotoStageReceipt, adminTemplatePhotoAppend } from "../../src/sync/admin-template-photo-append-protocol.js";

test("create remains OFF, separate preparation freezes one existing confirmed template and no input changes", async () => {
  const f = await fixture(); assert.equal(ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED, false); assert.equal(TEMPLATE_PHOTO_CREATE_CAPABILITY, "adminTemplatePhotoCreateV1");
  assert.deepEqual(f.body.payload, f.source); assert.equal(Object.isFrozen(f.intent.body.photoCreate.fields), true);
  assert.equal(assertAdminTemplatePhotoCreateSource(f.source, f.body, f.operationId), true);
  assert.throws(() => adminTemplateIntent(f.request)); // Not accidentally wired into the deployed gateway.
  f.body.photoCreate.fields.name = "later UI change";
  assert.equal(f.intent.body.photoCreate.fields.name, "New owner");
});

test("new item inserts only its selected placement and preserves raw references, packed, detached and opaque data", async () => {
  const f = await fixture(), p = f.result.confirmedPayload, a = p.layouts.source.arrangement;
  assert.equal(p.items[f.entityId].containerId, "сумка"); assert.equal(a.itemQuantities[f.entityId], 2);
  assert.deepEqual(a.containers["сумка"].order, [{ type: "item", id: "old-item" }, { type: "item", id: f.entityId }]);
  assert.deepEqual(p.containers["сумка"].order, a.containers["сумка"].order);
  for (const key of ["old-item", "detached"]) assert.deepEqual(p.items[key], f.source.items[key]);
  assert.deepEqual(p.opaque, f.source.opaque); assert.deepEqual(p.locations, f.source.locations);
  assert.deepEqual(a.packedItems, { "old-item": true }); assert.deepEqual(p.packedItems, {});
  assert.deepEqual(a.unknown, ["raw"]); assert.equal(a.containers["сумка"].opaque, "kept");
  assert.deepEqual(p.items[f.entityId].photos, f.added.map(value => value.photo));
  assert.equal(await validateAdminTemplatePhotoCreateResult(f.result, f.expected), true);
  p.items["old-item"].photos[0].unknown.untouched = false; assert.equal(f.source.items["old-item"].photos[0].unknown.untouched, true);
});

test("new bag follows actual root insertion; unplaced forms change no layout and preserve unavailable item status", async () => {
  const f = await fixture({ entityType: "container", shared: false }), p = f.result.confirmedPayload;
  assert.deepEqual(p.layouts.source.rootContainerIds, ["сумка", f.entityId]);
  assert.deepEqual(p.layouts.source.arrangement.containers[f.entityId], { parentId: "", childIds: [], itemIds: [], order: [] });
  assert.equal(p.containers[f.entityId].parentId, ""); assert.equal(p.containers[f.entityId].createdAt, f.body.photoCreate.fields.createdAt);
  assert.deepEqual(p.containers["сумка"], f.source.containers["сумка"]);
  assert.equal(await validateAdminTemplatePhotoCreateResult(f.result, f.expected), true);
  for (const entityType of ["item", "container"]) {
    const u = await fixture({ entityType, placed: false }); u.body.photoCreate.fields.dimensions = null;
    if (entityType === "item") u.body.photoCreate.formContext.availabilityStatus = "lost";
    const intent = adminTemplatePhotoCreateIntent(u.request), out = adminTemplatePhotoCreatePayload(intent, u.added);
    assert.deepEqual(out.layouts, u.source.layouts); const owner = out[entityType === "item" ? "items" : "containers"][u.entityId];
    assert.equal(Object.hasOwn(owner, "dimensions"), false); if (entityType === "item") assert.equal(owner.availabilityStatus, "lost");
  }
});

test("first owner in an empty confirmed template supports an unplaced item or a first root bag without fabricated prior rows", async () => {
  for (const entityType of ["item", "container"]) {
    const f = await fixture({ entityType, placed: entityType === "container" }), source = f.body.payload;
    source.items = {}; source.containers = {}; source.layouts.source.rootContainerIds = [];
    source.layouts.source.arrangement = { rootContainerIds: [], items: {}, containers: {}, itemQuantities: {}, packedItems: {}, opaque: { untouched: true } };
    const intent = adminTemplatePhotoCreateIntent(f.request), p = adminTemplatePhotoCreatePayload(intent, f.added);
    assert.equal(Object.keys(p[entityType === "item" ? "items" : "containers"]).length, 1);
    assert.deepEqual(p.layouts.source.arrangement.opaque, { untouched: true });
    assert.deepEqual(p.layouts.source.rootContainerIds, entityType === "container" ? [f.entityId] : []);
  }
});

test("owner absence checks all collections and exact arrangement inventory, including malformed aliases/trees", async () => {
  const mutations = [f => { f.body.payload.items[f.entityId] = { id: f.entityId }; },
    f => { f.body.payload.containers[f.entityId] = { id: f.entityId }; }, f => { f.body.photoCreate.entityId = "source"; },
    f => { f.body.payload.items["old-item"].id = "other"; }, f => { f.body.payload.containers["old-item"] = { id: "old-item" }; },
    f => { f.body.payload.layouts.source.arrangement.items[f.entityId] = "сумка"; },
    f => { f.body.payload.layouts.source.arrangement.containers["сумка"].order = []; },
    f => { f.body.payload.layouts.source.arrangement.containers["сумка"].childIds = ["сумка"]; },
    f => { f.body.payload.layouts.source.arrangement.packedItems.phantom = true; },
    f => { f.body.payload.items["old-item"].photos[0].id = "conflicting"; },
    f => { f.body.payload.opaque.photos = [{ id: "hidden" }]; }];
  for (const mutate of mutations) { const f = await fixture(); mutate(f); assert.throws(() => adminTemplatePhotoCreate(f.body, f.operationId));
    assert.throws(() => assertAdminTemplatePhotoCreateOwnerAbsent(f.body.payload, f.body.photoCreate.entityId)); }
});

test("creation fields accept actual form controls and reject provenance, IDs, photos, bad dimensions and cross-type fields", async () => {
  const mutations = [x => { x.ownerId = "admin-a"; }, x => { x.photos = []; }, x => { x.id = "other"; }, x => { x.publicCatalogLayoutId = "source"; },
    x => { x.quantity = 2; }, x => { x.volume = 3; }, x => { x.weight = -1; }, x => { x.name = " "; }, x => { x.categories.push("tools"); },
    x => { x.category = "different"; }, x => { x.dimensions = { width: 2, length: 3 }; }, x => { x.dimensions.depth = NaN; },
    x => { x.createdAt = "yesterday"; }, x => { delete x.updatedAt; }];
  for (const mutate of mutations) { const f = await fixture(); mutate(f.body.photoCreate.fields); assert.throws(() => adminTemplatePhotoCreate(f.body, f.operationId)); }
  const bag = await fixture({ entityType: "container" }); delete bag.body.photoCreate.fields.createdAt;
  assert.throws(() => adminTemplatePhotoCreate(bag.body, bag.operationId));
});

test("only the current new-form placement is expressible; foreign layout, missing bag, unavailable placement and old-tree moves reject", async () => {
  const mutations = [c => { c.placement.layoutId = "other"; }, c => { c.placement.containerId = "detached"; },
    c => { c.placement.quantity = 0; }, c => { c.placement.quantity = 1.5; }, c => { c.availabilityStatus = "retired"; },
    c => { c.placement.parentId = "сумка"; }, c => { c.placement.index = 0; }];
  for (const mutate of mutations) { const f = await fixture(); mutate(f.body.photoCreate.formContext); assert.throws(() => adminTemplatePhotoCreate(f.body, f.operationId)); }
  const f = await fixture(); f.body.payload.layouts.source.locked = true; assert.throws(() => adminTemplatePhotoCreate(f.body, f.operationId));
  for (const key of ["parentId", "index", "sourceLayout"]) { const b = await fixture({ entityType: "container" }); b.body.photoCreate.formContext.placement[key] = key === "index" ? 0 : "сумка"; assert.throws(() => adminTemplatePhotoCreate(b.body, b.operationId)); }
});

test("mutual exclusion, confirmed base and exact administrative binding do not widen old protocol", async () => {
  for (const key of ["photoAppend", "photoEdit", "source", "published"]) { const f = await fixture(); f.body[key] = {}; assert.throws(() => adminTemplatePhotoCreate(f.body, f.operationId)); }
  for (const mutate of [f => { f.body.base = { operationId: randomUUID() }; }, f => { f.body.base = null; }, f => { f.body.base.stateRevision = 0; },
    f => { f.request.kind = "template.create"; }, f => { f.request.kind = "template.publication"; }, f => { f.request.listId = "personal-list"; },
    f => { f.request.itemKey = "demo-state"; }, f => { f.request.environment = "production"; }]) {
    const f = await fixture(); mutate(f); assert.throws(() => adminTemplatePhotoCreateIntent(f.request));
  }
  const f = await fixture(), b = copy(f.body); delete b.photoCreate; b.photoAppend = { version: 1, assets: f.body.photoCreate.assets };
  assert.throws(() => adminTemplatePhotoAppend(b, f.operationId));
});

test("one to fifty assets have unique fixed IDs, one absent owner and no collision with raw photoId aliases", async () => {
  for (const count of [1, 50]) { const f = await fixture({ count }); assert.equal(adminTemplatePhotoCreate(f.body, f.operationId).assets.length, count); }
  const large = await fixture(); while (large.body.photoCreate.assets.length < 51) large.body.photoCreate.assets.push({ ...large.body.photoCreate.assets[0], assetId: randomUUID(), photoId: `extra-${large.body.photoCreate.assets.length}` });
  assert.throws(() => adminTemplatePhotoCreate(large.body, large.operationId));
  for (const mutate of [a => { a.pop(); a.pop(); }, a => { a[1] = copy(a[0]); }, a => { a[0].assetDigest = "wrong"; },
    a => { a[0].entityType = "container"; }, a => { a[0].entityId = "other"; }, a => { a[0].photoId = "старое-фото"; }, a => { a[0].extra = true; }]) {
    const f = await fixture(); mutate(f.body.photoCreate.assets); assert.throws(() => adminTemplatePhotoCreate(f.body, f.operationId));
  }
  const f = await fixture(); f.body.payload.items["old-item"].photos[0].photoId = f.body.photoCreate.assets[0].photoId;
  assert.throws(() => adminTemplatePhotoCreate(f.body, f.operationId));
});

test("stage v2 original metadata digest is distinct; existing v1 parser and receipt reject new owner mode", async () => {
  const f = await fixture(), data = f.stages[0], manifest = data.receipt.manifest, expected = { manifest, assetDigest: data.receipt.assetDigest };
  assert.equal(await adminTemplatePhotoCreateStageDigest(manifest), hash(manifest));
  assert.equal(await validateAdminTemplatePhotoCreateStageReceipt(data, expected), true);
  assert.throws(() => adminTemplatePhotoStageManifest(manifest));
  assert.equal(await validateAdminTemplatePhotoStageReceipt(data, expected), false);
  assert.throws(() => adminTemplatePhotoCreateStageManifest({ ...manifest, version: 1 }));
  for (const mutate of [d => { d.receipt.baseEntityRevision = 1; }, d => { d.receipt.version = 1; }, d => { d.receipt.manifest.ownerMode = "create"; },
    d => { d.receipt.manifest.file.size = 0; }, d => { d.receipt.stored.file.type = "image/png"; }, d => { d.receipt.assetDigest = hash("other"); }]) {
    const d = copy(data); mutate(d); assert.equal(await validateAdminTemplatePhotoCreateStageReceipt(d, expected), false);
  }
  const unavailable = copy(data); unavailable.assetState = "unavailable";
  assert.equal(await validateAdminTemplatePhotoCreateStageReceipt(unavailable, expected), true); // Known receipt, not permission to dispatch.
});

test("stage binding, actor versus owner, ordered assets and stored metadata are verified by full result", async () => {
  const f = await fixture(); assert.notEqual(f.binding.actorId, f.result.ownerId);
  assert.equal(await validateAdminTemplatePhotoCreateStages(f.intent, f.stages), true);
  for (const mutate of [s => { s[0].receipt.manifest.actorId = "other-admin"; }, s => { s[0].receipt.manifest.templateOperationId = randomUUID(); },
    s => { s[0].receipt.manifest.baseStateRevision++; }, s => { s[0].receipt.manifest.entityId = "other"; },
    s => { s[0].receipt.ownerId = "other-owner"; }, s => { s.reverse(); }, s => { s[0].receipt.stored.file.fileName = "different.jpg"; }]) {
    const stages = copy(f.stages); mutate(stages); assert.equal(await validateAdminTemplatePhotoCreateResult(f.result, { intent: f.intent, stageReceipts: stages }), false);
  }
});

test("full result rejects collateral changes, raw loss, wrong IDs/links and forged digests even when structure looks plausible", async () => {
  const f = await fixture();
  for (const mutate of [r => { r.confirmedPayload.items["old-item"].photos[0].unknown = {}; }, r => { r.confirmedPayload.opaque.keep.pop(); },
    r => { r.confirmedPayload.layouts.source.arrangement.packedItems["old-item"] = false; }, r => { r.confirmedPayload.items[f.entityId].name = "different"; },
    r => { r.entityId = "other"; }, r => { r.ownerId = "admin-a"; }, r => { r.added[0].photo.photoId = "other"; },
    r => { r.added[0].photo.url += "?token=other"; }, r => { r.confirmedPayloadDigest = "0".repeat(64); }, r => { r.extra = true; }]) {
    const result = copy(f.result); mutate(result); assert.equal(await validateAdminTemplatePhotoCreateResult(result, f.expected), false);
  }
  assert.equal(validateAdminTemplatePhotoCreateResultStructure(f.result, f.intent), true);
  assert.equal(validateAdminTemplatePhotoCreateResultStructure(f.result, { ...f.intent, operationId: randomUUID() }), false);
  const changed = copy(f.source); changed.items["old-item"].name = "Newer server";
  assert.throws(() => assertAdminTemplatePhotoCreateSource(changed, f.body, f.operationId));
});

test("old fieldless and unknown-source data stay opaque; selected link changes cannot authorize an unrelated source update", async () => {
  const f = await fixture({ placed: false });
  f.body.payload.items.detached.photos = []; f.body.payload.items.detached.future = { version: 9, values: [null, 0, false] };
  const intent = adminTemplatePhotoCreateIntent(f.request), p = adminTemplatePhotoCreatePayload(intent, f.added);
  assert.deepEqual(p.items.detached, f.body.payload.items.detached);
  assert.deepEqual(p.layouts, f.body.payload.layouts);
  assert.throws(() => assertAdminTemplatePhotoCreateSource(f.source, f.body, f.operationId));
});

test("async proof validation and stage hashing detach inputs before the first yield", async () => {
  const f = await fixture(), stage = copy(f.stages[0].receipt.manifest), before = hash(stage), task = adminTemplatePhotoCreateStageDigest(stage);
  stage.file.hash = "f".repeat(64); assert.equal(await task, before);
  const result = copy(f.result), expected = { intent: copy(f.intent), stageReceipts: copy(f.stages) }, validation = validateAdminTemplatePhotoCreateResult(result, expected);
  result.confirmedPayload.opaque = null; expected.stageReceipts[0].receipt.ownerId = "other";
  assert.equal(await validation, true);
});
