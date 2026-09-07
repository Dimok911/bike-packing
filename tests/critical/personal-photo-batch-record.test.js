import test from "node:test";
import assert from "node:assert/strict";
import { preparePersonalPhotoAttachmentBatch } from "../../src/sync/personal-photo-batch-plan.js";
import { encodePersonalPhotoBatchRecord, decodePersonalPhotoBatchRecord } from "../../src/sync/personal-photo-batch-record.js";
import { createPersonalPhotoActionStore, PERSONAL_PHOTO_BATCH_STORAGE_ENABLED } from "../../src/sync/personal-photo-action-store.js";

function fixture() {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const payload = { items: { item: { id: "item", name: "Frozen", photos: [] } }, containers: {}, layouts: {} };
  const plan = preparePersonalPhotoAttachmentBatch({ binding, snapshot: payload, basePayload: payload, baseStateRevision: 1,
    entityType: "item", entityId: "item", baseEntityRevision: 1,
    files: [1, 2].map(index => ({ fileName: `file${index}.png`, file: new Blob([`original ${index}`], { type: "image/png" }), thumb: new Blob([`thumb ${index}`], { type: "image/png" }) })) }, { enabled: true });
  return { binding, snapshot: plan.snapshot, files: plan.files,
    action: { ...binding, operationId: plan.operationId, kind: "photos.mutate", generation: 1, body: { ...plan.body, causal: { dependsOn: [], reads: [] } } } };
}

test("one encoded record contains every original and thumbnail with a frozen complete intent and exact hash bindings", async () => {
  const f = fixture(), before = structuredClone({ binding: f.binding, action: f.action, snapshot: f.snapshot }), pending = encodePersonalPhotoBatchRecord(f);
  f.action.body.changes.reverse(); f.snapshot.items.item.name = "Later"; f.files[0].file = new Blob(["replacement"], { type: "image/png" });
  f.action.operationId = crypto.randomUUID(); f.binding.actorId = "other";
  const record = await pending, decoding = decodePersonalPhotoBatchRecord(record, before.binding, before.action.operationId);
  new Uint8Array(record.files[0].file).fill(0); record.intentHash = "changed-after-read";
  const saved = await decoding;
  assert.equal(record.version, 2); assert.equal(record.files.length, 2);
  assert.deepEqual(saved.action, before.action); assert.deepEqual(saved.snapshot, before.snapshot);
  assert.equal(await saved.files[0].file.text(), "original 1"); assert.equal(await saved.files[1].thumb.text(), "thumb 2");
  assert.match(saved.files[0].fileMetadata.hash, /^[0-9a-f]{64}$/);
});

test("batch decoding rejects a missing/swapped/corrupt part or wrong binding without returning a partial package", async () => {
  const f = fixture(), original = await encodePersonalPhotoBatchRecord(f);
  for (const change of [
    value => { value.files.pop(); }, value => { value.files.reverse(); },
    value => { new Uint8Array(value.files[0].file)[0] ^= 1; }, value => { value.files[1].thumb = null; },
    value => { value.intentHash = "0".repeat(64); }, value => { value.version = 1; }, value => { value.bindingKey = "other"; }
  ]) {
    const copy = structuredClone(original); change(copy);
    await assert.rejects(decodePersonalPhotoBatchRecord(copy, f.binding, f.action.operationId), { code: "photo-batch-record" });
  }
  await assert.rejects(decodePersonalPhotoBatchRecord(original, { ...f.binding, actorId: "other" }, f.action.operationId), { code: "photo-batch-record" });
  for (const change of [
    value => { value.files.pop(); }, value => { value.files[0].stage.entityId = "other"; },
    value => { value.action.actorId = "other"; }, value => { value.action.environment = "production"; },
    value => { value.action.scopeKey = "guest"; }, value => { value.snapshot.items.item.photos[0].listId = "foreign"; },
    value => { value.files[1].file = new Blob([]); }, value => { value.snapshot.items.item.photos.reverse(); }
  ]) {
    const input = fixture(); change(input); await assert.rejects(encodePersonalPhotoBatchRecord(input));
  }
});

test("batch capture has a separate default-off gate and preserves all files when scope or any part is invalid", async () => {
  assert.equal(PERSONAL_PHOTO_BATCH_STORAGE_ENABLED, false);
  for (const mode of ["batch-disabled", "writer-disabled", "context", "part", "binding"]) {
    const f = fixture(), context = { ...f.binding, scope: "personal", generation: "editor" };
    const store = createPersonalPhotoActionStore({ ...f.binding, environmentId: f.binding.environment,
      enabled: mode !== "writer-disabled", batchEnabled: mode !== "batch-disabled", getContext: () => context,
      indexedDB: { open: () => assert.fail("incomplete batch must not open storage") } });
    if (mode === "context") context.actorId = "other";
    if (mode === "part") f.files[1].stage.entityId = "other";
    if (mode === "binding") f.action.actorId = "other";
    await assert.rejects(store.captureBatch(f), error => error.isPersonalPhotoStorageBlocked
      && error.unconfirmedPhotoDraft.files.length === 2 && error.unconfirmedPhotoDraft.files[0].file === f.files[0].file);
  }
});
