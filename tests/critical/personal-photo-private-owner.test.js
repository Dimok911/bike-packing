import test from "node:test";
import assert from "node:assert/strict";
import { isPersonalPhotoPrivateOwner } from "../../src/sync/personal-photo-private-owner.js";
import { personalGuestImportOwner } from "../../src/sync/personal-guest-import-owner.js";
import { preparePersonalPhotoAttachmentBatch } from "../../src/sync/personal-photo-batch-plan.js";
import { preparePersonalPhotoFormAttachments } from "../../src/sync/personal-photo-form-plan.js";
import { personalPhotoCopySourceValid } from "../../src/sync/personal-photo-copy-source.js";
import { personalPhotoFormOwner } from "../../src/sync/personal-photo-form-protocol.js";
import { personalPhotoHistoryPlan } from "../../src/sync/personal-photo-history-plan.js";

for (const entityType of ["item", "container"]) test(`a frozen guest ${entityType} becomes a private photo owner while keeping its provenance`, () => {
  const owner = personalGuestImportOwner({ source: { id: "guest-source", name: "Guest record", note: "Keep origin", photos: [{ id: "old" }] },
    descriptor: { entityType, sourceId: "guest-source", targetId: "private-owner", sourceLayoutId: "guest-layout", reuse: false }, photos: [] });
  const original = structuredClone(owner);
  assert.equal(owner._publicCopySourceId, "guest-source");
  assert.equal(isPersonalPhotoPrivateOwner(owner), true); assert.deepEqual(owner, original);
});

test("private provenance cannot disguise active public/admin/shared origins or external entity IDs", () => {
  const owner = { id: "private-owner", name: "Private copy", _publicCopySourceKind: "item", _publicCopySourceId: "template-source" };
  assert.equal(isPersonalPhotoPrivateOwner(owner), true);
  for (const patch of [{ scope: "public" }, { entity_scope: "shared" }, { visibility: "public" }, { sourceType: "public-template" },
    { adminDemo: true }, { adminDemo: "true" }, { adminSharedSourceId: "shared" }, { sharedSourceId: "source" },
    { publicCatalogLayoutId: "catalog" }, { isPublicCatalog: true }, { id: "demo-item-1" }]) {
    assert.equal(isPersonalPhotoPrivateOwner({ ...owner, ...patch }), false, JSON.stringify(patch));
  }
  for (const value of [null, undefined, {}, { id: "" }, { id: "constructor" }, [], "private", Object.create(owner)]) assert.equal(isPersonalPhotoPrivateOwner(value), false);
});

function privateFixture(entityType) {
  const photoId = crypto.randomUUID(), photo = { id: photoId, photoId, assetId: crypto.randomUUID(), listId: "list", status: "synced",
    url: `/photo/${photoId}`, thumbUrl: `/thumb/${photoId}`, fileName: "guest.png", type: "image/png", size: 8, width: 1, height: 1 };
  const owner = personalGuestImportOwner({ source: { id: "guest", name: "Guest", customField: { exact: true } },
    descriptor: { entityType, sourceId: "guest", targetId: "owner", sourceLayoutId: "guest-layout", reuse: false }, photos: [photo] });
  const collection = entityType === "item" ? "items" : "containers";
  const basePayload = { items: {}, containers: {}, layouts: {} }; basePayload[collection].owner = owner;
  const input = { binding: { environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list" },
    basePayload, snapshot: structuredClone(basePayload), baseStateRevision: 3, baseEntityRevision: 2, entityType, entityId: "owner",
    files: [{ file: new Blob(["new original"], { type: "image/png" }), fileName: "new.png" }] };
  return { input, owner, photo, collection };
}

for (const entityType of ["item", "container"]) test(`completed private guest ${entityType} supports attachment, form, frozen copy and history without losing its origin`, () => {
  const f = privateFixture(entityType), before = structuredClone(f.input.basePayload);
  for (const plan of [preparePersonalPhotoAttachmentBatch(f.input, { enabled: true }),
    preparePersonalPhotoFormAttachments({ ...f.input, fields: { name: "Edited private copy", weight: 17 } }, { enabled: true })]) {
    const owner = plan.payload[f.collection].owner;
    assert.equal(owner._publicCopySourceId, f.owner._publicCopySourceId);
    assert.deepEqual(owner.customField, f.owner.customField); assert.deepEqual(owner.photos[0], f.photo);
    assert.equal(owner.photos[1].status, "pending");
  }
  const body = { version: 1, action: "form", entityType, entityId: "new-copy", baseEntityRevision: 0, fields: { name: "Another private copy" },
    copySource: { listId: "list", entityType, entityId: "owner", entityRevision: 2, payload: f.owner },
    changes: [{ version: 1, action: "copy", entityType, entityId: "new-copy", baseEntityRevision: 0, expectedPhotoIds: [],
      photoId: "copy-photo", assetId: crypto.randomUUID(), index: 0, source: { listId: "list", photoId: f.photo.id, assetId: f.photo.assetId, photoRevision: 2 } }] };
  assert.equal(personalPhotoCopySourceValid(body), true);
  const copied = personalPhotoFormOwner(before, body);
  assert.equal(copied._publicCopySourceId, f.owner._publicCopySourceId); assert.deepEqual(copied.customField, f.owner.customField);
  const history = personalPhotoHistoryPlan({ listId: "list", baseStateRevision: 3, currentPayload: before, payload: before,
    heads: [{ photoId: f.photo.id, assetId: f.photo.assetId, entityType, entityId: "owner", revision: 2, deleted: false, reference: f.photo }] });
  assert.deepEqual(history.retained, [f.photo.id]); assert.deepEqual(f.input.basePayload, before);
  for (const patch of [{ adminDemo: true }, { scope: "public" }, { sharedSourceId: "shared-source" }]) {
    const bad = privateFixture(entityType); Object.assign(bad.input.basePayload[f.collection].owner, patch); bad.input.snapshot = structuredClone(bad.input.basePayload);
    assert.throws(() => preparePersonalPhotoAttachmentBatch(bad.input, { enabled: true }));
    assert.throws(() => preparePersonalPhotoFormAttachments({ ...bad.input, fields: { name: "Wrong" } }, { enabled: true }));
    assert.equal(personalPhotoCopySourceValid({ ...body, copySource: { ...body.copySource, payload: { ...f.owner, ...patch } } }), false);
    assert.throws(() => personalPhotoHistoryPlan({ listId: "list", baseStateRevision: 3, currentPayload: before, payload: bad.input.basePayload, heads: [] }));
  }
});
