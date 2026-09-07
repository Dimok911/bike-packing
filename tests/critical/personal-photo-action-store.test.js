import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPersonalPhotoActionStore, PERSONAL_PHOTO_ACTIONS_ENABLED } from "../../src/sync/personal-photo-action-store.js";
import { createPersonalPhotoRecoveryArchive } from "../../src/sync/personal-photo-recovery-archive.js";
import { readZipEntries, zipText } from "../../src/utils/simple-zip.js";

const context = { actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a", environment: "bike-packing-experiment", generation: "edit-1", scope: "personal" };
const store = options => createPersonalPhotoActionStore({ ...context, enabled: true, getContext: () => context,
  indexedDB: { open: () => assert.fail("invalid input must not touch durable storage") }, ...options });
const input = () => {
  const stage = { operationId: randomUUID(), photoId: "photo-a", entityType: "item", entityId: "item-a" };
  return { stage, action: { operationId: randomUUID(), listId: "list-a", kind: "photos.mutate", body: {
    version: 1, action: "attach", assetId: stage.operationId, photoId: stage.photoId, entityType: stage.entityType, entityId: stage.entityId,
    baseStateRevision: 1, baseEntityRevision: 1, expectedPhotoIds: [], index: 0 } },
    snapshot: { items: { "item-a": { id: "item-a", photos: [{ id: "photo-a", status: "pending" }] } } },
    file: new Blob(["exact bytes"], { type: "image/png" }) };
};
test("personal photo action capture is separately release-gated and never accepts a guest or foreign environment", async () => {
  assert.equal(PERSONAL_PHOTO_ACTIONS_ENABLED, false);
  for (const options of [{ actorId: "" }, { actorId: "a".repeat(37) }, { scopeKey: "guest" }, { environmentId: "production" }, { listId: "constructor" }]) {
    assert.throws(() => store(options), { code: "scope" });
  }
  await assert.rejects(store({ enabled: false }).capture(input()), { code: "disabled" });
  await assert.rejects(store({ getContext: () => ({ ...context, actorId: "actor-b" }) }).capture(input()), { code: "context-changed" });
});
test("invalid photo identities, manifests and files retain original recovery data without opening IndexedDB", async () => {
  for (const change of [{ baseEntityRevision: 0 }, { expectedPhotoIds: ["x", "x"] }, { index: 1 }, { photoId: "different" }, { assetId: randomUUID() },
    { force: true }, { payload: {} }]) {
    const candidate = input(); Object.assign(candidate.action.body, change);
    await assert.rejects(store().capture(candidate), error => error.code === "invalid-intent" && error.unconfirmedPhotoDraft.file === candidate.file);
  }
  const oversized = input(); oversized.snapshot.note = "x".repeat(2 * 1024 * 1024);
  await assert.rejects(store().capture(oversized), { code: "snapshot-too-large" });
  for (const file of [null, new Blob([]), new Blob(["not image"], { type: "text/plain" })]) {
    await assert.rejects(store().capture({ ...input(), file }), { code: "invalid-file" });
  }
});

function archiveFixture() {
  const binding = { environment: context.environment, actorId: context.actorId, listId: context.listId, scopeKey: context.scopeKey };
  const operationId = randomUUID(), bindingKey = JSON.stringify(binding);
  const row = { operationId, record: { version: 1, key: JSON.stringify([bindingKey, operationId]), bindingKey,
    intentJson: "{damaged original", intentHash: "bad original hash", file: new TextEncoder().encode("retained bytes").buffer, thumb: null }, claim: null };
  const copy = { environment: binding.environment, scopeKey: binding.scopeKey, automaticImportAllowed: false, journalEntries: [{ value: "original journal" }] };
  const current = { ...context }, store = { binding, recoveryRecords: async () => [row], ids: async () => [operationId] };
  const options = { store, getContext: () => current, getRecoveryCopy: () => copy };
  return { row, copy, current, store, options };
}

test("photo recovery archive preserves corrupt raw intent and exact available bytes without claiming validity or server proof", async () => {
  const f = archiveFixture(), archive = await createPersonalPhotoRecoveryArchive(f.options), entries = await readZipEntries(archive.blob);
  const prefix = `photos/${f.row.operationId}`;
  assert.equal(archive.fileName, "bike-packing-photo-recovery.zip");
  assert.equal(zipText(entries.get(`${prefix}/original.bin`)), "retained bytes");
  assert.equal(JSON.parse(zipText(entries.get(`${prefix}/record.json`))).intentJson, "{damaged original");
  assert.deepEqual(JSON.parse(zipText(entries.get("personal-queue.json"))), f.copy);
  assert.equal(archive.manifest.automaticImportAllowed, false); assert.equal(archive.manifest.serverConfirmationIncluded, false);
  assert.equal(archive.manifest.files[0].intentVerified, false); assert.equal(archive.manifest.files[0].thumbnailAbsent, true);
});

test("photo recovery archive refuses another actor environment list or account change during the read", async () => {
  for (const change of [{ actorId: "other" }, { listId: "other" }, { environment: "production" }, { scope: "readonly" }]) {
    const f = archiveFixture(); Object.assign(f.current, change);
    await assert.rejects(createPersonalPhotoRecoveryArchive(f.options), { code: "photo-recovery-export" });
  }
  const f = archiveFixture(); f.store.recoveryRecords = async () => { f.current.generation = "new-editor"; return [f.row]; };
  await assert.rejects(createPersonalPhotoRecoveryArchive(f.options), { code: "photo-recovery-export" });
});

test("photo recovery archive stops on changing file sets queue data or corrupted cross-scope keys", async () => {
  for (const mutate of [f => { f.store.ids = async () => []; }, f => { f.row.record.bindingKey = "another owner"; },
    f => { f.store.ids = async () => { f.copy.journalEntries.push({ value: "new branch" }); return [f.row.operationId]; }; }]) {
    const f = archiveFixture(); mutate(f);
    await assert.rejects(createPersonalPhotoRecoveryArchive(f.options), { code: "photo-recovery-export" });
  }
});

test("photo recovery archive reports unavailable bytes explicitly and never manufactures a replacement", async () => {
  const f = archiveFixture(); f.row.record.file = "broken"; f.row.record.thumb = undefined;
  const archive = await createPersonalPhotoRecoveryArchive(f.options), entries = await readZipEntries(archive.blob);
  assert.equal(archive.manifest.files[0].fullBytesIncluded, false);
  assert.equal(archive.manifest.files[0].thumbnailBytesIncluded, false);
  assert.equal(archive.manifest.files[0].thumbnailAbsent, false);
  assert.equal(entries.has(`photos/${f.row.operationId}/original.bin`), false);
});
