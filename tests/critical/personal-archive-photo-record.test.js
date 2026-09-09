import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encodePersonalArchivePhotoRecord, decodePersonalArchivePhotoRecord } from "../../src/sync/personal-archive-photo-record.js";
import { personalArchivePhotoPlan } from "../../src/sync/personal-archive-photo-plan.js";
import { personalArchiveHash } from "../../src/sync/personal-archive-import-protocol.js";
import { personalArchivePhotoReceipt, validatePersonalArchivePhotoResult } from "../../src/sync/personal-archive-photo-protocol.js";

async function fixture() {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const base = { items: {}, containers: {}, layouts: {}, locations: [], categories: [] };
  const source = { ...structuredClone(base), items: { archived: { id: "archived", name: "Archived", photos: [{ id: "old" }] } } };
  const file = new Blob(["frozen bytes"], { type: "image/png" }), bytes = await file.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const part = { entityType: "item", entityId: "archived", sourcePhotoId: "old", photoId: randomUUID(), assetId: randomUUID(),
    file: { hash, size: file.size, type: file.type, fileName: "selected.png" }, thumb: null };
  const options = { mode: "full", sourcePayload: source, currentPayload: base, listId: "list", sourceActiveLayoutId: "", layoutTargets: [], editMeta: {} };
  const plan = personalArchivePhotoPlan(options, [part]), archiveImport = { version: 2, mode: "full", sourcePayload: source,
    sourceHash: await personalArchiveHash(source), sourceActiveLayoutId: "", layoutTargets: [], editMeta: {}, targetStateRevision: 3,
    payloadHash: await personalArchiveHash(plan.payload), files: [part] };
  const action = { ...binding, kind: "list.import", operationId: randomUUID(), body: { baseStateRevision: 3, payload: plan.payload, archiveImport, causal: { dependsOn: [], reads: [] } } };
  return { binding, action, snapshot: structuredClone(plan.payload), files: [{ file, thumb: null,
    stage: { operationId: part.assetId, photoId: part.photoId, entityType: part.entityType, entityId: part.entityId, fileName: part.file.fileName } }] };
}

test("photo archive codec binds the true import action, complete source and exact immutable file bytes", async () => {
  const input = await fixture(), expectedAction = structuredClone(input.action), operationId = input.action.operationId;
  const writing = encodePersonalArchivePhotoRecord(input);
  input.action.body.archiveImport.sourcePayload.items.archived.name = "Changed after capture";
  input.files[0].file = new Blob(["different"], { type: "image/png" });
  const record = await writing, decoded = await decodePersonalArchivePhotoRecord(record, input.binding, operationId);
  assert.deepEqual(decoded.action, expectedAction); assert.equal(decoded.action.kind, "list.import");
  assert.equal(await decoded.files[0].file.text(), "frozen bytes");
  const corrupt = structuredClone(record); new Uint8Array(corrupt.files[0].file)[0] ^= 255;
  await assert.rejects(decodePersonalArchivePhotoRecord(corrupt, input.binding, operationId));
  const replaced = await fixture(); replaced.files[0].file = new Blob(["same length!"], { type: "image/png" });
  await assert.rejects(encodePersonalArchivePhotoRecord(replaced));
});

test("photo archive receipt requires every exact file result and preserves all other fields and reference order", async () => {
  const input = await fixture(), expected = input.action, file = expected.body.archiveImport.files[0];
  const photo = { id: file.photoId, photoId: file.photoId, assetId: file.assetId, listId: "list", status: "synced",
    url: "https://example.test/original", thumbUrl: "https://example.test/thumb", fileName: file.file.fileName, type: file.file.type, size: file.file.size, width: 1, height: 1 };
  const payload = structuredClone(expected.body.payload); payload.items.archived.photos = [photo];
  const result = { ok: true, stateRevision: 4, list: { id: "list", stateRevision: 4, payload },
    archiveImport: personalArchivePhotoReceipt(expected.body.archiveImport), archivePhotos: [{ entityType: file.entityType, entityId: file.entityId,
      photoId: file.photoId, assetId: file.assetId, fileHash: file.file.hash, thumbHash: file.file.hash, photo }] };
  assert.equal(validatePersonalArchivePhotoResult(result, expected), true);
  for (const change of [value => value.archivePhotos.pop(), value => value.archivePhotos[0].fileHash = "b".repeat(64),
    value => value.list.payload.items.archived.name = "Unrelated change", value => value.archivePhotos[0].photo.assetId = randomUUID(),
    value => value.list.payload.items.archived.photos.push(structuredClone(photo)), value => value.list.stateRevision++]) {
    const changed = structuredClone(result); change(changed); assert.equal(validatePersonalArchivePhotoResult(changed, expected), false);
  }
});
