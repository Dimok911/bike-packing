import test from "node:test";
import assert from "node:assert/strict";
import { draftPhotosToCleanup, normalizeItemPhotos } from "../../src/state/item-photos.js";
import { copyRecordPhotosForLocalDuplicate, photoRecordIdMatchesRemoteSource, photoRemoteSrc, removeRecordPhotoReference } from "../../src/sync/photos.js";
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

test("CRITICAL offline-photos: private-layout remote photos are reused without physical copy", async () => {
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
  assert.equal(copy.status, "synced");
  assert.equal(copy._copyToCurrentList, undefined);
  assert.equal(copy.url, original.url);
  assert.equal(copy.thumbUrl, original.thumbUrl);
});

test("CRITICAL offline-photos: private-layout remote photos keep server URLs even when cached locally", async () => {
  const original = {
    id: "photo-original",
    localId: "photo-original",
    url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/file",
    thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/thumb",
    listId: "list-1",
    status: "synced",
    updatedAt: "2026-05-21T00:00:00.000Z"
  };
  let cacheReads = 0;
  let cacheWrites = 0;

  const [copy] = await copyRecordPhotosForLocalDuplicate({ photos: [original] }, {
    changedAt: "2026-05-24T00:00:00.000Z",
    getCachedPhotoForCopy: async () => {
      cacheReads += 1;
      return { blob: { size: 1 }, thumbBlob: { size: 1 } };
    },
    putCachedPhotoForCopy: async () => {
      cacheWrites += 1;
    }
  });

  assert.equal(cacheReads, 0);
  assert.equal(cacheWrites, 0);
  assert.equal(copy.localId, "");
  assert.equal(copy.status, "synced");
  assert.equal(copy._copyToCurrentList, undefined);
  assert.equal(copy.url, original.url);
  assert.equal(copy.thumbUrl, original.thumbUrl);
});

test("CRITICAL offline-photos: template-boundary remote photos remain queued for copy", async () => {
  const original = {
    id: "photo-original",
    url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/file",
    thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/thumb",
    listId: "list-1",
    status: "synced",
    updatedAt: "2026-05-21T00:00:00.000Z"
  };

  const [copy] = await copyRecordPhotosForLocalDuplicate({ photos: [original] }, {
    changedAt: "2026-05-24T00:00:00.000Z",
    copyRemotePhotosToCurrentList: true
  });

  assert.match(copy.id, /^photo-/);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.localId, "");
  assert.equal(copy.status, "pending");
  assert.equal(copy._copyToCurrentList, true);
  assert.equal(copy.url, original.url);
  assert.equal(copy.thumbUrl, original.thumbUrl);
});

test("CRITICAL offline-photos: template-boundary skips missing local-only photos", async () => {
  const original = {
    id: "photo-local-only",
    localId: "photo-local-only",
    status: "pending",
    updatedAt: "2026-05-21T00:00:00.000Z"
  };

  const copies = await copyRecordPhotosForLocalDuplicate({ photos: [original] }, {
    changedAt: "2026-05-24T00:00:00.000Z",
    copyRemotePhotosToCurrentList: true,
    dropMissingLocalPhotos: true,
    getCachedPhotoForCopy: async () => null
  });

  assert.deepEqual(copies, []);
});

test("CRITICAL offline-photos: private duplicate keeps missing local-only marker", async () => {
  const original = {
    id: "photo-local-only",
    localId: "photo-local-only",
    status: "pending",
    updatedAt: "2026-05-21T00:00:00.000Z"
  };

  const [copy] = await copyRecordPhotosForLocalDuplicate({ photos: [original] }, {
    changedAt: "2026-05-24T00:00:00.000Z",
    getCachedPhotoForCopy: async () => null
  });

  assert.equal(copy.status, "missing-local-file");
  assert.equal(copy.error, "local-photo-copy-missing");
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

test("CRITICAL offline-photos: stale copied photo ids are not treated as remote file owners", () => {
  assert.equal(photoRecordIdMatchesRemoteSource({
    id: "photo-copy",
    url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/file",
    thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/thumb"
  }, {
    baseUrl: "https://app.example.test/bike-packing/"
  }), false);

  assert.equal(photoRecordIdMatchesRemoteSource({
    id: "photo-original",
    url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/file"
  }, {
    baseUrl: "https://app.example.test/bike-packing/"
  }), true);
});

test("CRITICAL offline-photos: missing public photo references can be dropped from copied records", () => {
  const photo = {
    id: "photo-copy",
    localId: "",
    url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/file",
    thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/thumb",
    status: "pending",
    _copyToCurrentList: true
  };
  const record = {
    id: "item-copy",
    photos: [
      photo,
      { id: "photo-keep", url: "https://api.example.test/bike-packing/lists/list-2/photos/photo-keep/file" }
    ]
  };

  assert.equal(removeRecordPhotoReference(record, photo), true);
  assert.deepEqual(record.photos.map((entry) => entry.id), ["photo-keep"]);
});

test("CRITICAL offline-photos: discarded new-record drafts clean up local photos", () => {
  const draft = {
    photos: [
      { id: "photo-new-1", localId: "photo-new-1", status: "pending" },
      { id: "photo-new-2", localId: "photo-new-2", status: "pending" }
    ],
    deletedPhotos: []
  };

  const cleanup = draftPhotosToCleanup(draft, null);

  assert.deepEqual(cleanup.map((photo) => photo.id), ["photo-new-1", "photo-new-2"]);
});

test("CRITICAL offline-photos: discarded edit drafts keep existing local photos", () => {
  const source = {
    photos: [
      { id: "photo-existing", localId: "photo-existing", status: "pending" }
    ]
  };
  const draft = {
    photos: [
      { id: "photo-existing", localId: "photo-existing", status: "pending" },
      { id: "photo-new", localId: "photo-new", status: "pending" }
    ],
    deletedPhotos: []
  };

  const cleanup = draftPhotosToCleanup(draft, source);

  assert.deepEqual(cleanup.map((photo) => photo.id), ["photo-new"]);
});
