import test from "node:test";
import assert from "node:assert/strict";
import { normalizeItemPhotos } from "../../src/state/item-photos.js";
import { copyRecordPhotosForLocalDuplicate, photoRemoteSrc } from "../../src/sync/photos.js";
import { MemoryStorage } from "./helpers.js";

function setNavigatorOnline(value) {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: value },
    configurable: true
  });
}

test("CRITICAL offline-photos: offline photos keep remote URLs as a fallback", () => {
  setNavigatorOnline(false);
  globalThis.localStorage = new MemoryStorage();

  const src = photoRemoteSrc({
    id: "photo-1",
    localId: "photo-1",
    thumbUrl: "https://api.example.test/thumb.jpg",
    url: "https://api.example.test/file.jpg",
    updatedAt: "2026-05-21T00:00:00.000Z"
  });

  assert.equal(src, "https://api.example.test/thumb.jpg?v=2026-05-21T00%3A00%3A00.000Z");
});

test("CRITICAL offline-photos: local-capable photos still expose remote fallback online", () => {
  setNavigatorOnline(true);
  globalThis.localStorage = new MemoryStorage();

  const src = photoRemoteSrc({
    id: "photo-1",
    thumbUrl: "https://api.example.test/thumb.jpg",
    updatedAt: "2026-05-21T00:00:00.000Z"
  });

  assert.equal(src, "https://api.example.test/thumb.jpg?v=2026-05-21T00%3A00%3A00.000Z");
});

test("CRITICAL offline-photos: online photos may use versioned remote URLs", () => {
  setNavigatorOnline(true);
  globalThis.localStorage = new MemoryStorage();

  const src = photoRemoteSrc({
    id: "photo-1",
    thumbUrl: "https://api.example.test/thumb.jpg",
    updatedAt: "2026-05-21T00:00:00.000Z"
  });

  assert.equal(src, "https://api.example.test/thumb.jpg?v=2026-05-21T00%3A00%3A00.000Z");
});

test("CRITICAL offline-photos: copied remote photos get a new id and remain queued for copy", async () => {
  const original = {
    id: "photo-original",
    url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/file",
    thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/thumb",
    listId: "list-1",
    status: "synced",
    updatedAt: "2026-05-21T00:00:00.000Z"
  };

  const [copy] = await copyRecordPhotosForLocalDuplicate({ photos: [original] }, {
    changedAt: "2026-05-24T00:00:00.000Z"
  });

  assert.match(copy.id, /^photo-/);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.localId, "");
  assert.equal(copy.status, "pending");
  assert.equal(copy._copyToCurrentList, true);
  assert.equal(copy.url, original.url);
  assert.equal(copy.thumbUrl, original.thumbUrl);
});

test("CRITICAL offline-photos: remote copy marker survives photo normalization", () => {
  const record = {
    photos: [{
      id: "photo-copy",
      status: "pending",
      url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/file",
      _copyToCurrentList: true
    }]
  };

  normalizeItemPhotos(record);

  assert.equal(record.photos[0]._copyToCurrentList, true);
  assert.equal(record.photos[0].status, "pending");
});
