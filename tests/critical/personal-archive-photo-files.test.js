import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { preparePersonalArchivePhotoFiles } from "../../src/sync/personal-archive-photo-files.js";

function fixture() {
  const file = new Blob(["archived original"], { type: "image/png" }), thumb = new Blob(["archived thumb"], { type: "image/png" });
  const meta = { id: "old-photo", sha256: createHash("sha256").update("archived original").digest("hex"), type: file.type,
    size: file.size, fileName: "archived.png", width: 2, height: 3 };
  return { owners: [{ entityType: "item", sourceId: "old-owner", targetId: "new-owner", photos: [{ id: meta.id, url: "old-url" }] }],
    photoFiles: new Map([[meta.id, { meta, blob: file, thumbBlob: thumb }]]) };
}

test("archive freezes all destination photo IDs, metadata and bytes before hashing and reuses that exact preparation", async () => {
  const f = fixture(), ids = [], plan = preparePersonalArchivePhotoFiles(f, { createUuid: () => { const id = randomUUID(); ids.push(id); return id; } });
  assert.equal(ids.length, 2); const initial = structuredClone(plan.inventory);
  f.owners[0].targetId = "later-target"; f.photoFiles.get("old-photo").meta.fileName = "later.png"; f.photoFiles.clear();
  plan.inventory[0].entityId = "tampered";
  const first = await plan.verify(); assert.equal(first[0].entityId, "new-owner"); assert.equal(first[0].metadata.fileName, "archived.png");
  assert.equal(await first[0].file.text(), "archived original"); assert.equal(await first[0].thumb.text(), "archived thumb");
  assert.equal(first[0].assetId, initial[0].assetId); assert.equal(first[0].photoId, initial[0].photoId);
  first[0].metadata.fileName = "changed returned result";
  assert.equal((await plan.verify())[0].metadata.fileName, "archived.png"); assert.equal(ids.length, 2);
});

test("shared archived bytes get independent assets per destination owner in the selected order", async () => {
  const f = fixture(); f.owners.push({ ...structuredClone(f.owners[0]), targetId: "second-owner" });
  const parts = await preparePersonalArchivePhotoFiles(f).verify();
  assert.deepEqual(parts.map(part => part.entityId), ["new-owner", "second-owner"]);
  assert.notEqual(parts[0].assetId, parts[1].assetId); assert.notEqual(parts[0].photoId, parts[1].photoId);
  assert.equal(parts[0].metadata.sha256, parts[1].metadata.sha256);
});

test("missing, ambiguous, incompatible or corrupted required archive bytes block the entire chosen inventory", async () => {
  for (const change of [f => f.photoFiles.clear(), f => f.owners[0].photos.push({ id: "old-photo" }),
    f => f.photoFiles.get("old-photo").meta.size++, f => f.photoFiles.get("old-photo").meta.id = "other",
    f => f.owners.push(structuredClone(f.owners[0]))]) {
    const f = fixture(); change(f); assert.throws(() => preparePersonalArchivePhotoFiles(f), { code: "archive-photo-files" });
  }
  const f = fixture(); f.photoFiles.get("old-photo").meta.sha256 = "0".repeat(64);
  const plan = preparePersonalArchivePhotoFiles(f); await assert.rejects(plan.verify(), { code: "archive-photo-files" });
  await assert.rejects(plan.verify(), { code: "archive-photo-files" });
  const fixed = randomUUID(); assert.throws(() => preparePersonalArchivePhotoFiles(fixture(), { createUuid: () => fixed }));
});

test("oversized selected archive inventories stop before hashing or allocating action IDs", () => {
  for (const largeBytes of [false, true]) {
    const f = fixture(), entry = f.photoFiles.get("old-photo");
    if (largeBytes) {
      entry.blob = new Blob([new Uint8Array(10 * 1024 * 1024)], { type: "image/png" });
      entry.thumbBlob = entry.blob; entry.meta.size = entry.blob.size;
    }
    f.owners = Array.from({ length: largeBytes ? 3 : 51 }, (_, index) => ({ ...f.owners[0], targetId: `owner-${index}` }));
    assert.throws(() => preparePersonalArchivePhotoFiles(f, { createUuid: () => assert.fail("Preflight must precede ID allocation") }), { code: "archive-photo-files" });
  }
});
