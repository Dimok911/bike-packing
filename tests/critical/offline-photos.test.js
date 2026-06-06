import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { draftPhotosToCleanup, normalizeItemPhotos } from "../../src/state/item-photos.js";
import {
  applyPendingPhotoUploadRetry,
  applySyncedPhotoUploadResult,
  clonePhotoUploadBlob,
  copyRecordPhotosForLocalDuplicate,
  materializeSelectedPhotoFile,
  photoRecordIdMatchesRemoteSource,
  photoRemoteSrc,
  removeRecordPhotoReference,
  resolveUploadedPhotoByContentHash,
  shouldRetryLocalPhotoUploadAfterFailure
} from "../../src/sync/photos.js";
import { apiUploadFormDataRequest, isTimeoutError } from "../../src/sync/api-client.js";
import { compactPhotoForSync, prunePhotoPayloadForSync } from "../../src/sync/serialize.js";
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

test("CRITICAL offline-photos: upload timeout can recover already stored iPhone library photos", async () => {
  const blob = new Blob(["iphone-library-jpeg"], { type: "image/jpeg" });
  let requestPath = "";
  let requestBody = null;
  const resolved = await resolveUploadedPhotoByContentHash({
    apiFetch: async (path, options) => {
      requestPath = path;
      requestBody = JSON.parse(options.body);
      return {
        photosByHash: {
          [requestBody.hashes[0]]: {
            id: "photo-server",
            url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server/file",
            thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server/thumb",
            updatedAt: "2026-06-06T00:00:00.000Z"
          }
        }
      };
    },
    blob,
    cryptoImpl: webcrypto,
    listId: "list-1",
    retryDelayMs: 0
  });

  assert.equal(requestPath, "/bike-packing/lists/list-1/photos/resolve");
  assert.equal(requestBody.hashes.length, 1);
  assert.equal(resolved.id, "photo-server");

  const photo = {
    id: "photo-local",
    localId: "photo-local",
    status: "error",
    error: "сервер не ответил вовремя",
    _copyToCurrentList: true
  };

  applySyncedPhotoUploadResult(photo, resolved, {
    fallbackPhotoId: "photo-local",
    listId: "list-1",
    localId: "photo-local",
    nowIsoValue: "2026-06-06T00:00:01.000Z",
    uploadPath: "/bike-packing/lists/list-1/photos"
  });

  assert.equal(photo.id, "photo-server");
  assert.equal(photo.localId, "photo-local");
  assert.equal(photo.status, "synced");
  assert.equal(photo.error, "");
  assert.equal(photo._copyToCurrentList, undefined);
  assert.equal(photo.url, "https://api.example.test/bike-packing/lists/list-1/photos/photo-server/file");
});

test("CRITICAL offline-photos: stalled iPhone photo upload rejects instead of staying uploading", async () => {
  setNavigatorOnline(true);
  const originalXhr = globalThis.XMLHttpRequest;
  class StalledUploadXhr {
    constructor() {
      this.upload = {};
      this.headers = {};
      StalledUploadXhr.instance = this;
    }

    open(method, url) {
      this.method = method;
      this.url = url;
    }

    setRequestHeader(name, value) {
      this.headers[name] = value;
    }

    send(body) {
      this.body = body;
    }

    abort() {
      this.aborted = true;
      if (typeof this.onabort === "function") this.onabort();
    }
  }
  globalThis.XMLHttpRequest = StalledUploadXhr;

  try {
    await assert.rejects(
      apiUploadFormDataRequest("/bike-packing/lists/list-1/photos", {
        body: { fake: true },
        stalledUploadTimeoutMs: 5,
        timeoutMs: 60000
      }),
      (error) => {
        assert.equal(error.isNetworkError, true);
        assert.equal(isTimeoutError(error), true);
        assert.equal(error.isUploadStalled, true);
        return true;
      }
    );
    assert.equal(StalledUploadXhr.instance.aborted, true);
  } finally {
    if (originalXhr) globalThis.XMLHttpRequest = originalXhr;
    else delete globalThis.XMLHttpRequest;
  }
});

test("CRITICAL offline-photos: repeated same upload progress does not keep stalled iPhone upload alive", async () => {
  setNavigatorOnline(true);
  const originalXhr = globalThis.XMLHttpRequest;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = [];
  class RepeatingProgressXhr {
    constructor() {
      this.upload = {};
      RepeatingProgressXhr.instance = this;
    }

    open(method, url) {
      this.method = method;
      this.url = url;
    }

    setRequestHeader() {}

    send(body) {
      this.body = body;
    }

    abort() {
      this.aborted = true;
      if (typeof this.onabort === "function") this.onabort();
    }
  }
  globalThis.XMLHttpRequest = RepeatingProgressXhr;
  globalThis.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    if (timer) timer.cleared = true;
  };

  try {
    const uploadPromise = apiUploadFormDataRequest("/bike-packing/lists/list-1/photos", {
      body: { fake: true },
      onUploadProgress: () => {},
      stalledUploadTimeoutMs: 10,
      timeoutMs: 60000
    });
    assert.equal(timers.length, 1);
    RepeatingProgressXhr.instance.upload.onprogress?.({ lengthComputable: true, loaded: 70, total: 100 });
    assert.equal(timers.length, 2);
    RepeatingProgressXhr.instance.upload.onprogress?.({ lengthComputable: true, loaded: 70, total: 100 });
    assert.equal(timers.length, 2);
    timers[1].callback();
    await assert.rejects(uploadPromise, (error) => {
      assert.equal(error.isUploadStalled, true);
      return true;
    });
    assert.equal(RepeatingProgressXhr.instance.aborted, true);
  } finally {
    if (originalXhr) globalThis.XMLHttpRequest = originalXhr;
    else delete globalThis.XMLHttpRequest;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("CRITICAL offline-photos: temporary iPhone media upload failure keeps local photo queued", () => {
  const photo = {
    id: "photo-local",
    localId: "photo-local",
    status: "uploading",
    error: "загрузка фото отменена",
    updatedAt: "2026-06-06T00:00:00.000Z"
  };

  applyPendingPhotoUploadRetry(photo, {
    nowIsoValue: "2026-06-06T00:00:01.000Z"
  });

  assert.equal(photo.status, "pending");
  assert.equal(photo.error, "");
  assert.equal(photo.localId, "photo-local");
  assert.equal(photo.updatedAt, "2026-06-06T00:00:01.000Z");
});

test("CRITICAL offline-photos: local-only pending photos do not leak into remote sync payload", () => {
  assert.equal(compactPhotoForSync({
    id: "photo-local",
    localId: "photo-local",
    status: "uploading",
    url: "",
    thumbUrl: "",
    updatedAt: "2026-06-06T00:00:00.000Z"
  }), null);

  const cloned = {
    items: {
      "item-1": {
        id: "item-1",
        photos: [
          {
            id: "photo-local",
            localId: "photo-local",
            status: "pending",
            url: "",
            thumbUrl: ""
          },
          {
            id: "photo-remote",
            status: "synced",
            url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-remote/file",
            thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-remote/thumb"
          }
        ]
      }
    },
    containers: {}
  };

  prunePhotoPayloadForSync(cloned);

  assert.deepEqual(cloned.items["item-1"].photos.map((photo) => photo.id), ["photo-remote"]);
});

test("CRITICAL offline-photos: temporary iPhone media upload failure gets one private retry", () => {
  assert.equal(shouldRetryLocalPhotoUploadAfterFailure({
    blob: new Blob(["iphone-local-photo"], { type: "image/jpeg" }),
    error: { isUploadStalled: true },
    retryAvailable: true,
    uploadPath: "/bike-packing/lists/list-1/photos"
  }), true);
  assert.equal(shouldRetryLocalPhotoUploadAfterFailure({
    blob: new Blob(["iphone-local-photo"], { type: "image/jpeg" }),
    error: { isUploadStalled: true },
    retryAvailable: false,
    uploadPath: "/bike-packing/lists/list-1/photos"
  }), false);
  assert.equal(shouldRetryLocalPhotoUploadAfterFailure({
    blob: new Blob(["iphone-local-photo"], { type: "image/jpeg" }),
    error: { isUploadStalled: true },
    retryAvailable: true,
    uploadPath: "/bike-packing/admin/shared-layouts/shared-1/photos"
  }), false);
});

test("CRITICAL offline-photos: retry upload can use a fresh blob slice after an iPhone stream stall", () => {
  const blob = new Blob(["iphone-buffer"], { type: "image/jpeg" });
  const clone = clonePhotoUploadBlob(blob);

  assert.notEqual(clone, blob);
  assert.equal(clone.size, blob.size);
  assert.equal(clone.type, blob.type);
});

test("CRITICAL offline-photos: selected iCloud photos are materialized before resize and upload", async () => {
  let reads = 0;
  const file = {
    name: "icloud-photo.jpg",
    type: "image/jpeg",
    arrayBuffer: async () => {
      reads += 1;
      return new Uint8Array([1, 2, 3, 4]).buffer;
    }
  };

  const blob = await materializeSelectedPhotoFile(file, { timeoutMs: 0 });

  assert.notEqual(blob, file);
  assert.equal(blob.size, 4);
  assert.equal(blob.type, "image/jpeg");
  assert.equal(reads, 1);
});

test("CRITICAL offline-photos: stalled iCloud file reads fail before creating an upload draft", async () => {
  const file = {
    name: "stalled-icloud-photo.jpg",
    type: "image/jpeg",
    arrayBuffer: () => new Promise(() => {})
  };

  await assert.rejects(
    materializeSelectedPhotoFile(file, { timeoutMs: 1 }),
    /iCloud/
  );
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
