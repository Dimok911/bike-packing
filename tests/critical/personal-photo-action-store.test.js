import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPersonalPhotoActionStore, PERSONAL_PHOTO_ACTIONS_ENABLED } from "../../src/sync/personal-photo-action-store.js";

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
