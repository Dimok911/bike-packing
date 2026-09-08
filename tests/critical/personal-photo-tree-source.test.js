import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertPersonalPhotoTreeSource, PERSONAL_PHOTO_TREE_LINK_ENABLED } from "../../src/sync/personal-photo-tree-source.js";

function fixture() {
  const photo = { id: "photo", photoId: "photo", assetId: randomUUID(), listId: "list", status: "synced",
    url: "/photo", thumbUrl: "/thumb", fileName: "chosen.png", type: "image/png", size: 10, width: 2, height: 2 };
  const snapshot = { containers: { bag: { id: "bag", photos: [] }, pouch: { id: "pouch" } },
    items: { pump: { id: "pump", photos: [photo], quantity: 1 } } };
  const sourceSnapshot = { rootId: "bag", containers: structuredClone(snapshot.containers), items: structuredClone(snapshot.items) };
  sourceSnapshot.items.pump.quantity = 2; // Quantity belongs to the selected layout.
  return { snapshot, sourceSnapshot, listId: "list" };
}

test("tree linking validates exact photo selections without copying bytes or changing chosen layout quantities", () => {
  const f = fixture(), before = structuredClone(f);
  assert.deepEqual(assertPersonalPhotoTreeSource(f), { photoCount: 1, filesUnchanged: true }); assert.deepEqual(f, before);
  assert.equal(PERSONAL_PHOTO_TREE_LINK_ENABLED, false);
});

test("pending, stale, external, malformed and duplicate publications stop placement before any tree write", () => {
  for (const change of [f => { f.listId = "foreign"; }, f => { f.sourceSnapshot.items.pump.photos = []; },
    f => { f.sourceSnapshot.items.pump.photos[0].assetId = randomUUID(); }, f => { f.sourceSnapshot.items.pump.photos[0].url = "/newer"; },
    f => { f.sourceSnapshot.containers.pouch.photos = null; }, f => { delete f.snapshot.items.pump; },
    f => { f.snapshot.items.pump.photos[0].status = "pending"; }, f => { f.snapshot.items.pump.photos[0].localDataUrl = "data:unconfirmed"; },
    f => { f.snapshot.containers.pouch.photos = structuredClone(f.snapshot.items.pump.photos); },
    f => { f.sourceSnapshot.items.extra = { id: "extra", photos: [] }; }]) {
    const f = fixture(); change(f); const before = structuredClone(f);
    assert.throws(() => assertPersonalPhotoTreeSource(f), { code: "photo-tree-source" }); assert.deepEqual(f, before);
  }
});
