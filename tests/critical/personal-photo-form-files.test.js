import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalPhotoFormFiles } from "../../src/ui/personal-photo-form-files.js";

function fixture() {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const context = { ...binding, scope: "personal", form: "form-one" }, files = createPersonalPhotoFormFiles({ binding, getContext: () => context });
  const prepared = [1, 2].map(i => ({ id: `local-${i}`, blob: new Blob(["same explicitly selected bytes"], { type: "image/png" }),
    thumbBlob: null, fileName: `image-${i}.png`, fullBlobVerified: true }));
  prepared.forEach(record => files.capture(record));
  const old = { id: "old", photoId: "old", assetId: crypto.randomUUID(), listId: "list", status: "synced",
    url: "/file", thumbUrl: "/thumb", fileName: "old.png", type: "image/png", size: 1, width: 1, height: 1 };
  const draft = { photos: [old, ...prepared.map(record => ({ id: record.id, localId: record.id, status: "pending" }))], deletedPhotos: [] };
  return { binding, context, files, prepared, draft, basePhotos: [structuredClone(old)] };
}

test("selected form photos keep their prepared immutable blobs, original order and distinct equal-file choices", async () => {
  const f = fixture(), result = f.files.selection(f);
  f.prepared[0].blob = new Blob(["late cache replacement"], { type: "image/png" }); f.prepared[0].fileName = "late.png";
  f.draft.photos.reverse();
  assert.deepEqual(result.map(part => part.fileName), ["image-1.png", "image-2.png"]);
  assert.deepEqual(await Promise.all(result.map(part => part.file.text())), ["same explicitly selected bytes", "same explicitly selected bytes"]);
  assert.notEqual(result[0].file, result[1].file);
});

test("selection refuses missing files, reordered or removed old photos, foreign copies and forged new reference IDs", () => {
  for (const change of [f => { f.draft.deletedPhotos.push(f.basePhotos[0]); }, f => { f.draft.photos.reverse(); },
    f => { f.draft.photos[0].assetId = crypto.randomUUID(); }, f => { f.draft.photos[0].listId = "other"; },
    f => { f.draft.photos[1].localId = "missing"; }, f => { f.draft.photos[1].status = "error"; },
    f => { f.draft.photos[1].url = "/already-uploaded"; }, f => { f.draft.photos[1].assetId = crypto.randomUUID(); },
    f => { f.draft.photos[1]._copyToCurrentList = true; }, f => { f.draft.photos[2] = f.draft.photos[1]; }]) {
    const f = fixture(); change(f); assert.throws(() => f.files.selection(f));
  }
});

test("captured file identity cannot be replaced and another account, list or reopened form cannot use old handles", () => {
  const f = fixture(); f.files.capture(f.prepared[0]);
  assert.throws(() => f.files.capture({ ...f.prepared[0], blob: new Blob(["replacement"], { type: "image/png" }) }));
  assert.throws(() => f.files.capture({ ...f.prepared[0], fullBlobVerified: false }));
  for (const field of ["actorId", "scopeKey", "listId", "scope", "form", "environment"]) {
    const f = fixture(); f.context[field] = "changed";
    assert.throws(() => f.files.capture(f.prepared[0])); assert.throws(() => f.files.selection(f));
  }
});

test("a new owner may select all local files without inventing old published photos", () => {
  const f = fixture(); f.draft.photos.shift();
  assert.equal(f.files.selection({ draft: f.draft, basePhotos: [] }).length, 2);
  f.draft.photos = [];
  assert.throws(() => f.files.selection({ draft: f.draft, basePhotos: [] }));
});
