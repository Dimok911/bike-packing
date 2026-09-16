import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { canonicalAccessJson } from "../../src/sync/personal-access-protocol.js";
import { adminTemplateIntent } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoCopyIntent, adminTemplatePhotoCopyStageManifest } from "../../src/sync/admin-template-photo-copy-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED, TEMPLATE_PHOTO_TREE_COPY_CAPABILITY, ADMIN_TEMPLATE_PHOTO_TREE_COPY_LIMITS,
  adminTemplatePhotoTreeCopyIntent, adminTemplatePhotoTreeCopyStageManifest, adminTemplatePhotoTreeCopyStageDigest,
  adminTemplatePhotoTreeCopyStageManifests, adminTemplatePhotoTreeCopyCommitment, adminTemplatePhotoTreeCopyDigest,
  assertAdminTemplatePhotoTreeCopyIntentDigests, adminTemplatePhotoTreeCopyPayload, assertAdminTemplatePhotoTreeCopyProjection } from "../../src/sync/admin-template-photo-tree-copy-protocol.js";
import { treeCopyFixture, prepareTreeFixture, copy, hash } from "../fixtures/admin-template-photo-tree-copy-fixture.js";

test("tree v2 is OFF and cannot enter the existing general/v1 parsers or stage grammar", async () => {
  const f = await treeCopyFixture();
  assert.equal(ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED, false); assert.equal(TEMPLATE_PHOTO_TREE_COPY_CAPABILITY, "adminTemplatePhotoTreeCopyV1");
  assert.equal(ADMIN_TEMPLATE_PHOTO_TREE_COPY_LIMITS.owners, 100);
  assert.throws(() => adminTemplateIntent(f.request)); assert.throws(() => adminTemplatePhotoCopyIntent(f.request));
  assert.throws(() => adminTemplatePhotoCopyStageManifest(f.manifests[0]));
  assert.equal(f.intent.id, f.request.operationId); assert.ok(Object.isFrozen(f.intent.body.photoCopy.source.payload));
});

test("one complete placed root projects nested and photo-free owners, exact insertion, quantity and raw opaque data", async () => {
  const f = await treeCopyFixture(), c = f.body.photoCopy, source = copy(c.source.payload), target = copy(f.body.payload), p = f.projected;
  const root = c.owners.find(owner => owner.sourceEntityId === c.source.rootId), a = p.layouts["target-layout"].arrangement;
  assert.equal(c.owners.length, 5); assert.ok(c.owners.some(owner => !owner.photos.length));
  assert.deepEqual(a.rootContainerIds, ["target-bag", root.entityId]); assert.deepEqual(p.layouts["target-layout"].rootContainerIds, a.rootContainerIds);
  assert.equal(p.containers[root.entityId].name, c.fields.name);
  for (const owner of c.owners) {
    const type = owner.entityType === "item" ? "items" : "containers", raw = source[type][owner.sourceEntityId], row = p[type][owner.entityId];
    assert.deepEqual(row.opaque, raw.opaque); assert.equal(row.weight, raw.weight); assert.equal(row.updatedAt, c.fields.updatedAt);
    if (owner !== root) assert.equal(row.name, raw.name);
    if (owner.entityType === "item") {
      assert.equal(row.quantity, 7); assert.equal(a.itemQuantities[owner.entityId], source.layouts["source-layout"].arrangement.itemQuantities[owner.sourceEntityId]);
      assert.equal(Object.hasOwn(a.packedItems, owner.entityId), false);
    } else assert.deepEqual(a.containers[owner.entityId].opaque, source.layouts["source-layout"].arrangement.containers[owner.sourceEntityId].opaque);
  }
  const undone = copy(p);
  for (const owner of c.owners) {
    delete undone[owner.entityType === "item" ? "items" : "containers"][owner.entityId];
    for (const key of ["containers", "items", "itemQuantities", "packedItems"]) delete undone.layouts["target-layout"].arrangement[key][owner.entityId];
  }
  undone.layouts["target-layout"].rootContainerIds.splice(1, 1); undone.layouts["target-layout"].arrangement.rootContainerIds.splice(1, 1);
  assert.deepEqual(undone, target); assert.deepEqual(c.source.payload, source);
  assert.equal(assertAdminTemplatePhotoTreeCopyProjection(f.intent, f.added, p), true);
});

test("raw quantity, source aliases and dates are preserved or regenerated only in their documented fields", async () => {
  const f = await treeCopyFixture(), addedPhotos = f.added.flatMap(owner => owner.added.map(value => value.photo));
  assert.ok(addedPhotos.some(photo => photo.createdAt === null));
  for (const photo of addedPhotos) { assert.equal(Object.hasOwn(photo, "src"), false); assert.equal(Object.hasOwn(photo, "thumb_url"), false); assert.match(photo.url, /\/new-photo-.*\/file$/); }
  const mutation = copy(f.request), c = mutation.body.photoCopy;
  const noPhotos = c.owners.find(owner => !owner.photos.length); delete c.source.payload[noPhotos.entityType === "item" ? "items" : "containers"][noPhotos.sourceEntityId].photos;
  c.source.payloadDigest = hash(c.source.payload); const absent = await prepareTreeFixture(mutation);
  assert.equal(Object.hasOwn(absent.projected[noPhotos.entityType === "item" ? "items" : "containers"][noPhotos.entityId], "photos"), false);
});

test("selected closure is exact: missing/photo-free/extra owners, reordered mappings and wrong owner identity reject", async () => {
  const mutations = [c => c.owners.pop(), c => c.owners.reverse(), c => c.owners.push(copy(c.owners[0])),
    c => { c.owners[0].sourceEntityId = "neighbor"; }, c => { c.owners[0].entityType = "item"; },
    c => { c.owners[1].entityId = c.owners[0].entityId; }];
  for (const mutate of mutations) { const f = await treeCopyFixture(); mutate(f.body.photoCopy); assert.throws(() => adminTemplatePhotoTreeCopyIntent(f.request)); }
});

test("only root arrangement closure is valid; cycles, orphaned placement, bad backrefs/order/quantity and aliases reject", async () => {
  const mutations = [c => { c.source.rootId = "source-bag-1"; }, c => { c.source.rootId = "missing"; },
    c => { c.source.payload.layouts["source-layout"].arrangement.containers["source-bag-1"].parentId = "neighbor"; },
    c => { c.source.payload.layouts["source-layout"].arrangement.containers["source-bag-0"].order[0].unknown = true; },
    c => { c.source.payload.layouts["source-layout"].arrangement.containers["source-bag-0"].childIds.push("source-bag-0"); },
    c => { c.source.payload.layouts["source-layout"].arrangement.itemQuantities["source-item-3"] = 0; },
    c => { c.source.payload.layouts["source-layout"].arrangement.items["source-item-3"] = "source-bag-2"; },
    c => { c.source.payload.layouts["source-layout"].rootContainerIds.reverse(); },
    c => { c.source.payload.layouts["source-layout"].arrangement.packedItems.phantom = true; },
    c => { c.source.payload.containers["source-bag-0"].parentContainerId = "legacy"; },
    c => { c.source.payload.items["source-item-3"].availabilityStatus = "lost"; }];
  for (const mutate of mutations) { const f = await treeCopyFixture(); mutate(f.body.photoCopy); assert.throws(() => adminTemplatePhotoTreeCopyIntent(f.request)); }
});

test("new owner IDs must be absent in both full inventories including opposite type, layouts and detached rows", async () => {
  for (const side of ["source", "target"]) for (const type of ["items", "containers", "layouts"]) {
    const f = await treeCopyFixture(), payload = side === "source" ? f.body.photoCopy.source.payload : f.body.payload, key = f.body.photoCopy.owners.at(-1).entityId;
    payload[type][key] = { id: key }; assert.throws(() => adminTemplatePhotoTreeCopyIntent(f.request));
  }
});

test("bounds are total owners, container depth and total photos, with both valid edges and one-past rejection", async () => {
  for (const options of [{ owners: 100, depth: 32, photos: 50 }, { owners: 1, depth: 1, photos: 1 }]) {
    const f = await treeCopyFixture(options); assert.equal(f.body.photoCopy.owners.length, options.owners); assert.equal(f.manifests.length, options.photos);
  }
  for (const options of [{ owners: 101 }, { owners: 33, depth: 33 }, { photos: 51 }, { photos: 0 }]) await assert.rejects(treeCopyFixture(options));
});

test("photo order and all-photo coverage are exact; asset/photo collisions are global across owners and snapshots", async () => {
  const mutations = [c => c.owners[0].photos.pop(), c => { c.owners[1].photos[0].photoId = c.owners[0].photos[0].photoId; },
    c => { c.owners[1].photos[0].assetId = c.owners[0].photos[0].assetId; }, c => { c.owners[0].photos[0].photoId = "neighbor-photo"; },
    c => { c.owners[0].photos[0].photoId = "target-photo"; }, c => { c.owners[0].photos[0].sourcePhotoId = "old-photo-1"; },
    c => { c.owners[0].photos[0].photoId = "новое-фото"; }];
  for (const mutate of mutations) { const f = await treeCopyFixture(); mutate(f.body.photoCopy); assert.throws(() => adminTemplatePhotoTreeCopyIntent(f.request)); }
  const f = await treeCopyFixture({ photos: 7 }); f.body.photoCopy.owners[0].photos.reverse(); assert.throws(() => adminTemplatePhotoTreeCopyIntent(f.request));
  const g = await treeCopyFixture(); g.body.photoCopy.owners[0].photos[0].assetId = g.request.operationId; assert.throws(() => adminTemplatePhotoTreeCopyIntent(g.request));
});

test("unknown selected photo metadata fails closed while outside raw metadata is not normalized", async () => {
  for (const patch of [{ caption: "unsupported" }, { filePath: "old/source.jpg" }, { status: "pending" }, { photoId: "other" }]) {
    const f = await treeCopyFixture(); Object.assign(f.body.photoCopy.source.payload.containers["source-bag-0"].photos[0], patch);
    assert.throws(() => adminTemplatePhotoTreeCopyIntent(f.request));
  }
  const f = await treeCopyFixture(); assert.equal(f.body.photoCopy.source.payload.containers.neighbor.photos[0].futureMetadata.keep, true);
  assert.equal(f.projected.items["target-item"].photos[0].futureMetadata, 8);
});

test("confirmed distinct admin bindings, fixed insertion and explicit fields cannot widen to other copy operations", async () => {
  const mutations = [f => { f.body.base = { operationId: randomUUID() }; }, f => { f.body.photoCopy.source.base = { operationId: randomUUID() }; },
    f => { f.body.photoCopy.source.itemKey = f.request.itemKey; f.body.photoCopy.source.listId = f.request.listId; },
    f => { f.body.photoCopy.source.listId = "personal"; }, f => { f.request.environment = "production"; }, f => { f.request.actorId = "x\u0000"; },
    f => { f.request.kind = "template.copy"; }, f => { f.body.photoCopy.placement.index = 2; }, f => { f.body.photoCopy.placement.index = -1; },
    f => { f.body.photoCopy.placement.index = 0.5; }, f => { f.body.photoCopy.placement.parentId = "target-bag"; },
    f => { f.body.payload.layouts["target-layout"].locked = true; }, f => { f.body.photoCopy.fields.quantity = 1; },
    f => { f.body.photoCopy.fields.name = " unsaved "; }, f => { f.body.photoCopy.fields.createdAt = "not date"; }];
  for (const key of ["source", "photoCreate", "photoAppend", "photoEdit", "published"]) mutations.push(f => { f.body[key] = {}; });
  for (const mutate of mutations) { const f = await treeCopyFixture(); mutate(f); assert.throws(() => adminTemplatePhotoTreeCopyIntent(f.request)); }
  const first = await treeCopyFixture(); first.body.photoCopy.placement.index = 0; const f = await prepareTreeFixture(first.request);
  assert.equal(f.projected.layouts["target-layout"].rootContainerIds[1], "target-bag");
});

test("commitment binds complete source/target, every owner including photo-free IDs and insertion without circular asset digests", async () => {
  const f = await treeCopyFixture(), commitment = await adminTemplatePhotoTreeCopyCommitment(f.intent), d = await adminTemplatePhotoTreeCopyDigest(f.intent);
  assert.equal(hash(commitment), d); assert.equal(commitment.source.payloadDigest, hash(f.body.photoCopy.source.payload));
  assert.equal(commitment.target.payloadDigest, hash(f.body.payload)); assert.equal(canonicalAccessJson(commitment).includes('"assetDigest"'), false);
  for (const manifest of f.manifests) assert.equal(manifest.treeDigest, d);
  assert.equal(await assertAdminTemplatePhotoTreeCopyIntentDigests(f.intent), true);
  const placeholders = copy(f.request); for (const owner of placeholders.body.photoCopy.owners) for (const p of owner.photos) p.assetDigest = "0".repeat(64);
  assert.deepEqual(await adminTemplatePhotoTreeCopyStageManifests(placeholders), f.manifests);
  await assert.rejects(assertAdminTemplatePhotoTreeCopyIntentDigests(placeholders), { code: "admin-template-photo-tree-copy-stage-binding" });
  for (const mutate of [r => { r.body.payload.opaque.changed = true; }, r => { r.body.photoCopy.placement.index = 0; },
    r => { r.body.photoCopy.fields.name = "Another name"; }, r => { r.body.photoCopy.owners.find(o => !o.photos.length).entityId = "other-new-owner"; },
    r => { r.operationId = randomUUID(); }, r => { r.actorId = "other-admin"; },
    r => { r.body.base.stateRevision++; }, r => { r.body.photoCopy.source.base.stateRevision++; },
    r => { r.itemKey = "demo-state:ru"; r.listId = "public-demo-state-ru"; }]) {
    const r = copy(f.request); mutate(r); assert.notEqual(await adminTemplatePhotoTreeCopyDigest(r), d); await assert.rejects(assertAdminTemplatePhotoTreeCopyIntentDigests(r));
  }
  const r = copy(f.request); r.body.photoCopy.source.payload.opaque.changed = true;
  await assert.rejects(adminTemplatePhotoTreeCopyStageManifests(r), { code: "admin-template-photo-tree-copy-source-digest" });
});

test("manifest exact mode and immutable source/reference/target bindings reject malformed widening", async () => {
  const f = await treeCopyFixture(), m = f.manifests[0];
  assert.equal(m.source.referenceDigest, hash(f.body.photoCopy.source.payload.containers["source-bag-0"].photos[0]));
  assert.equal(await adminTemplatePhotoTreeCopyStageDigest(m), f.body.photoCopy.owners[0].photos[0].assetDigest);
  for (const mutate of [m => { m.version = 1; }, m => { m.kind = "admin-template-photo-copy"; }, m => { m.operationId = m.templateOperationId; },
    m => { m.treeDigest = "invalid"; }, m => { m.source.referenceDigest = "invalid"; }, m => { m.target.photoId = "русский"; },
    m => { m.source.layoutId = ""; }, m => { m.source.ownerId = "claimed-owner"; }, m => { m.file = { hash: "0".repeat(64) }; },
    m => { m.target.listId = m.source.listId; m.target.itemKey = m.source.itemKey; }]) {
    const changed = copy(m); mutate(changed); assert.throws(() => adminTemplatePhotoTreeCopyStageManifest(changed));
  }
  // A grammatically valid forged digest is only a commitment, never authority.
  const forged = copy(m); forged.treeDigest = "f".repeat(64); assert.ok(adminTemplatePhotoTreeCopyStageManifest(forged));
  assert.notEqual(await adminTemplatePhotoTreeCopyStageDigest(forged), f.body.photoCopy.owners[0].photos[0].assetDigest);
});

test("full projection rejects collateral changes, partial owner/photo results and wrong regenerated identity even with a recomputed digest", async () => {
  const f = await treeCopyFixture();
  for (const mutate of [p => { p.locations = []; }, p => { p.items["target-item"].quantity = 1; }, p => { p.layouts["target-layout"].arrangement.packedItems = {}; },
    p => { delete p.containers[f.body.photoCopy.owners[0].entityId].opaque; }, p => { p.opaque.targetOnly.reverse(); }]) {
    const p = copy(f.projected); mutate(p); hash(p); assert.throws(() => assertAdminTemplatePhotoTreeCopyProjection(f.intent, f.added, p));
  }
  for (const mutate of [a => a.pop(), a => a.reverse(), a => { a[0].added.pop(); }, a => { a[0].added[0].photo.id = "wrong"; },
    a => { a[0].added[0].photo.assetId = randomUUID(); }, a => { a[0].added[0].photo.listId = f.body.photoCopy.source.listId; },
    a => { a[0].added[0].photo.url = "https://old.example/file/0"; }, a => { a[0].added[0].photo.caption = "extra"; },
    a => { delete a[0].added[0].photo.createdAt; }, a => { a[0].sourceEntityId = "other"; }]) {
    const a = copy(f.added); mutate(a); assert.throws(() => adminTemplatePhotoTreeCopyPayload(f.intent, a));
  }
});

test("async operations detach caller state before yielding and oversized wire fails closed", async () => {
  const f = await treeCopyFixture(), request = copy(f.request), expected = await adminTemplatePhotoTreeCopyStageManifests(f.intent);
  const task = adminTemplatePhotoTreeCopyStageManifests(request); request.body.payload.opaque.later = true; request.actorId = "later";
  assert.deepEqual(await task, expected);
  const m = copy(expected[0]), h = hash(m), hashTask = adminTemplatePhotoTreeCopyStageDigest(m); m.source.photoId = "later"; assert.equal(await hashTask, h);
  const oversized = copy(f.request); oversized.body.payload.opaque.large = "x".repeat(3 * 1024 * 1024);
  assert.throws(() => adminTemplatePhotoTreeCopyIntent(oversized));
  const before = copy(f.request); adminTemplatePhotoTreeCopyPayload(f.intent, f.added); assert.deepEqual(f.request, before);
});
