import test from "node:test";
import assert from "node:assert/strict";
import { preparePersonalPhotoAttachmentBatch, PERSONAL_PHOTO_BATCH_PREPARATION_ENABLED } from "../../src/sync/personal-photo-batch-plan.js";

function fixture() {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const payload = { items: { item: { id: "item", name: "Unchanged", photos: [
    { id: "existing", assetId: crypto.randomUUID(), status: "synced", listId: "list" }
  ] } }, containers: {}, layouts: {} };
  return { binding, snapshot: structuredClone(payload), basePayload: payload, entityType: "item", entityId: "item",
    baseStateRevision: 17, baseEntityRevision: 12, index: 0,
    files: [1, 2].map(index => ({ fileName: `image-${index}.png`, file: new Blob([`same bytes`], { type: "image/png" }), thumb: null })) };
}

test("attachment batch freezes all IDs, owner fields, order and equal-but-separate files before storage", async () => {
  const f = fixture(), before = structuredClone(f.basePayload), plan = preparePersonalPhotoAttachmentBatch(f, { enabled: true });
  assert.equal(plan.files.length, 2); assert.equal(plan.body.changes.length, 2);
  assert.equal(new Set([plan.operationId, ...plan.files.map(part => part.stage.operationId)]).size, 3);
  const [first, second] = plan.body.changes;
  assert.notEqual(first.photoId, second.photoId); assert.notEqual(first.assetId, second.assetId);
  assert.deepEqual(first.expectedPhotoIds, ["existing"]); assert.deepEqual(second.expectedPhotoIds, [first.photoId, "existing"]);
  assert.deepEqual(plan.payload.items.item.photos.map(photo => photo.id), [first.photoId, second.photoId, "existing"]);
  assert.deepEqual(plan.snapshot, plan.payload); assert.deepEqual(f.basePayload, before);
  f.snapshot.items.item.name = "Later edit"; f.basePayload.items.item.name = "Later server value"; f.files[0].fileName = "changed.png";
  assert.equal(plan.payload.items.item.name, "Unchanged"); assert.equal(plan.files[0].stage.fileName, "image-1.png");
  assert.equal(await plan.files[0].file.text(), "same bytes");
});

test("attachment preparation is disabled and refuses incomplete, changed, foreign, oversized or ambiguous batches", () => {
  assert.equal(PERSONAL_PHOTO_BATCH_PREPARATION_ENABLED, false);
  assert.throws(() => preparePersonalPhotoAttachmentBatch(fixture()), { code: "photo-batch-plan" });
  for (const change of [
    f => { f.binding.scopeKey = "id:other"; }, f => { f.binding.environment = "production"; },
    f => { f.baseEntityRevision = 0; }, f => { f.index = 2; }, f => { f.files = []; },
    f => { f.files.push({ file: new Blob([]) }); }, f => { f.files[0].thumb = new Blob(["bad"], { type: "text/plain" }); },
    f => { f.snapshot.items.item.name = "Unsaved fields"; }, f => { f.basePayload.items.item.photos[0].status = "pending"; },
    f => { f.basePayload.items.item.publicCatalogLayoutId = "template"; },
    f => { f.files = Array(51).fill(f.files[0]); }, f => { f.files[0].file = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/png" }); }
  ]) {
    const f = fixture(); change(f); const original = structuredClone(f.snapshot);
    assert.throws(() => preparePersonalPhotoAttachmentBatch(f, { enabled: true }), { code: "photo-batch-plan" }); assert.deepEqual(f.snapshot, original);
  }
  const repeated = crypto.randomUUID();
  assert.throws(() => preparePersonalPhotoAttachmentBatch(fixture(), { enabled: true, createUuid: () => repeated }), { code: "photo-batch-plan" });
});

test("an existing API owner with omitted empty photos can receive a batch without rewriting the confirmed base", () => {
  const f = fixture(); delete f.basePayload.items.item.photos; delete f.snapshot.items.item.photos; f.index = null;
  const before = structuredClone(f.basePayload), result = preparePersonalPhotoAttachmentBatch(f, { enabled: true });
  assert.deepEqual(result.body.changes[0].expectedPhotoIds, []); assert.equal(result.payload.items.item.photos.length, 2);
  assert.deepEqual(f.basePayload, before); assert.equal(Object.hasOwn(before.items.item, "photos"), false);
  f.basePayload.items.item.photos = null; f.snapshot.items.item.photos = null;
  assert.throws(() => preparePersonalPhotoAttachmentBatch(f, { enabled: true }), { code: "photo-batch-plan" });
});
