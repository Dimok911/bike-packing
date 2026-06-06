import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import {
  markPhotoUploadStarted,
  uploadPhotoToPath
} from "../../src/sync/photo-upload-flow.js";
import { compactPhotoForSync, prunePhotoPayloadForSync } from "../../src/sync/serialize.js";
import {
  photoDialogStatusText,
  photoStatusText,
  photoUploadState,
  renderItemPhotoHtml
} from "../../src/ui/photo-gallery.js";
import {
  bindDialogBackdropClickGuard,
  bindFilePickerDialogDismissGuard
} from "../../src/ui/modal-close-policy.js";
import { MemoryStorage } from "./helpers.js";

const root = resolve(import.meta.dirname, "../..");

function readProjectFile(path) {
  return readFileSync(resolve(root, path), "utf8");
}

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
      (async () => {
        const uploadPromise = apiUploadFormDataRequest("/bike-packing/lists/list-1/photos", {
        body: { fake: true },
        stalledUploadTimeoutMs: 5,
        timeoutMs: 60000
        });
        StalledUploadXhr.instance.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
        return uploadPromise;
      })(),
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

test("CRITICAL offline-photos: upload load event does not complete photo progress before server response", async () => {
  setNavigatorOnline(true);
  const originalXhr = globalThis.XMLHttpRequest;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = [];
  const progressEvents = [];
  class UploadLoadXhr {
    constructor() {
      this.upload = {};
      UploadLoadXhr.instance = this;
    }

    open(method, url) {
      this.method = method;
      this.url = url;
    }

    setRequestHeader() {}

    send(body) {
      this.body = body;
    }
  }
  globalThis.XMLHttpRequest = UploadLoadXhr;
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
      onUploadProgress: (progress) => progressEvents.push(progress),
      stalledUploadTimeoutMs: 10,
      timeoutMs: 60000
    });
    assert.equal(timers.length, 1);
    UploadLoadXhr.instance.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    assert.deepEqual(progressEvents, [99]);
    assert.equal(timers.length, 2);
    UploadLoadXhr.instance.upload.onload?.();
    assert.deepEqual(progressEvents, [99]);
    assert.equal(timers[1].cleared, true);

    UploadLoadXhr.instance.status = 200;
    UploadLoadXhr.instance.responseText = JSON.stringify({ ok: true, photo: { id: "photo-server" } });
    UploadLoadXhr.instance.onload();
    assert.deepEqual(await uploadPromise, { ok: true, photo: { id: "photo-server" } });
  } finally {
    if (originalXhr) globalThis.XMLHttpRequest = originalXhr;
    else delete globalThis.XMLHttpRequest;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("CRITICAL offline-photos: dialog photo uploads do not fall back to queued pending state", () => {
  const app = readProjectFile("app.js");
  const controllers = readProjectFile("src/app/app-tail-controllers.js");
  const uploadFlow = readProjectFile("src/sync/photo-upload-flow.js");
  const packageJson = readProjectFile("package.json");
  const checkSource = readProjectFile("scripts/check-source.mjs");
  const itemDialogUploadBlock = controllers.slice(
    controllers.indexOf("async function uploadItemDialogDraftPhotos"),
    controllers.indexOf("async function uploadRootContainerDialogDraftPhotos")
  );
  const rootContainerDialogUploadBlock = controllers.slice(
    controllers.indexOf("async function uploadRootContainerDialogDraftPhotos"),
    controllers.indexOf("async function uploadDialogDraftPhotos")
  );
  assert.match(uploadFlow, /export async function uploadPhotoToPath/);
  assert.match(packageJson, /node scripts\/check-source\.mjs/);
  assert.match(checkSource, /listJsFiles\("src"\)/);
  assert.equal((controllers.match(/retryTemporaryUploadFailure:\s*false/g) || []).length, 2);
  assert.doesNotMatch(controllers, /dialogPhotoUploadInProgress|markDialogPhotosUploading|markUnresolvedDialogUploadsFailed|updateDialogPhotoUploadProgress/);
  assert.doesNotMatch(controllers, /scheduleDialogPhotoUploadPreviewRender|dialogPhotoUploadPreviewFrame|onPhotoProgress:\s*onProgress/);
  assert.match(controllers, /photoUploadProgressRenderFrame,\s*updatePhotoGalleryUploadProgress,/);
  assert.match(controllers, /await updateItemDialogPhotoPreview\(runtime\.itemDialogPhotoDraft\.photos\)/);
  assert.match(controllers, /await updateRootContainerDialogPhotoPreview\(runtime\.rootContainerDialogPhotoDraft\.photos\)/);
  assert.doesNotMatch(controllers, /markDialogDraftPhotosUploadStarted|resetDialogDraftPhotosUploadStart|canStartDialogDraftPhotoUpload/);
  assert.doesNotMatch(controllers, /const uploadStartedInPreview/);
  assert.match(controllers, /await waitForDialogPhotoUploadSlot/);
  assert.match(controllers, /while \(runtime\.photoUploadInFlight\)/);
  assert.match(controllers, /shouldUploadPhoto:\s*\(photo\) => dialogDraftPhotoStillOwnedBy/);
  assert.match(controllers, /if \(!shouldUploadPhoto\(photo\) \|\| photoRemoteSrc\(photo\)\) continue;/);
  assert.match(controllers, /updatePhotoGalleryUploadProgress\(refs\.itemPhotoPreview,\s*list\)/);
  assert.match(controllers, /updatePhotoGalleryUploadProgress\(refs\.rootContainerPhotoPreview,\s*list\)/);
  assert.doesNotMatch(itemDialogUploadBlock, /updateItemDialogPhotoPreview/);
  assert.doesNotMatch(rootContainerDialogUploadBlock, /updateRootContainerDialogPhotoPreview/);
  assert.equal((controllers.match(/markPhotoUploadStarted\(photo\);/g) || []).length, 2);
  assert.match(controllers, /setItemDialogPhotoStatus\(photoDialogStatusText\(list\)\)/);
  assert.match(controllers, /setRootContainerDialogPhotoStatus\(photoDialogStatusText\(list\)\)/);
  assert.doesNotMatch(app, /async function getPhotoUploadSource|async function copyRemotePhotoToList|async function fetchRemotePhotoBlobForUpload/);
  assert.doesNotMatch(app.slice(app.indexOf("async function uploadEntityPhotoToPath")), /retryAvailable:\s*true/);
  assert.doesNotMatch(app.slice(app.indexOf("async function uploadEntityPhotoToPath")), /const retryPhoto = resolvePhoto\(\)/);
  assert.doesNotMatch(app.slice(app.indexOf("async function uploadEntityPhotoToPath")), /apiFetch\(path,\s*\{[\s\S]*PHOTO_UPLOAD_TIMEOUT_MS/);
  assert.doesNotMatch(controllers, /button\.textContent\s*=\s*"Фото загружается"/);
});

test("CRITICAL offline-photos: photo upload flow syncs only after server response and clears progress", async () => {
  const photo = {
    id: "photo-local",
    localId: "photo-local",
    status: "pending",
    url: "",
    thumbUrl: ""
  };
  const entity = { id: "item-1", photos: [photo] };
  const progressEvents = [];
  const touched = [];
  const uploaded = await uploadPhotoToPath({
    path: "/bike-packing/lists/list-1/photos",
    listId: "list-1",
    entity,
    photo,
    entityType: "item",
    apiFetch: async () => {
      throw new Error("copy should not run for local-only photos");
    },
    apiUploadFormData: async (path, options) => {
      assert.equal(path, "/bike-packing/lists/list-1/photos");
      assert.equal(photo.status, "uploading");
      options.onUploadProgress(99);
      assert.equal(photo.uploadProgress, 99);
      return {
        photo: {
          id: "photo-server",
          url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server/file",
          thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server/thumb",
          updatedAt: "2026-06-06T00:00:02.000Z"
        }
      };
    },
    getCachedPhoto: async () => ({
      blob: new Blob(["full"], { type: "image/jpeg" }),
      thumbBlob: new Blob(["thumb"], { type: "image/jpeg" }),
      fileName: "photo.jpg"
    }),
    markEntityChanged: (targetEntity, entityType, updatedAt) => touched.push({ id: targetEntity.id, entityType, updatedAt }),
    onPhotoProgress: (targetPhoto, progress) => progressEvents.push({ id: targetPhoto.id, progress }),
    persistStateSnapshot: () => {}
  });

  assert.equal(uploaded, true);
  assert.equal(photo.id, "photo-server");
  assert.equal(photo.localId, "photo-local");
  assert.equal(photo.status, "synced");
  assert.equal(photo.error, "");
  assert.equal(photo.uploadProgress, undefined);
  assert.deepEqual(progressEvents.map((event) => event.progress), [0, 0, 99, 100]);
  assert.deepEqual(touched, [{ id: "item-1", entityType: "item", updatedAt: "2026-06-06T00:00:02.000Z" }]);
});

test("CRITICAL offline-photos: dialog progress callbacks still schedule saved card renders", async () => {
  const photo = {
    id: "photo-local",
    localId: "photo-local",
    status: "pending",
    url: "",
    thumbUrl: ""
  };
  const entity = { id: "item-1", photos: [photo] };
  const progressEvents = [];
  let scheduledRenders = 0;

  await uploadPhotoToPath({
    path: "/bike-packing/lists/list-1/photos",
    listId: "list-1",
    entity,
    photo,
    entityType: "item",
    apiFetch: async () => {
      throw new Error("copy should not run for local-only photos");
    },
    apiUploadFormData: async (path, options) => {
      options.onUploadProgress(37);
      return {
        photo: {
          id: "photo-server",
          url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server/file",
          thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server/thumb",
          updatedAt: "2026-06-06T00:00:02.000Z"
        }
      };
    },
    getCachedPhoto: async () => ({
      blob: new Blob(["full"], { type: "image/jpeg" }),
      thumbBlob: new Blob(["thumb"], { type: "image/jpeg" }),
      fileName: "photo.jpg"
    }),
    onPhotoProgress: (targetPhoto, progress) => progressEvents.push({ id: targetPhoto.id, progress }),
    persistStateSnapshot: () => {},
    scheduleProgressRender: () => {
      scheduledRenders += 1;
    }
  });

  assert.deepEqual(progressEvents.map((event) => event.progress), [0, 0, 37, 100]);
  assert.equal(scheduledRenders, 4);
  assert.equal(photo.status, "synced");
  assert.equal(photo.uploadProgress, undefined);
});

test("CRITICAL offline-photos: upload response without server URL does not mark photo synced", async () => {
  const photo = {
    id: "photo-local",
    localId: "photo-local",
    status: "pending",
    url: "",
    thumbUrl: ""
  };
  const entity = { id: "item-1", photos: [photo] };

  await uploadPhotoToPath({
    path: "/bike-packing/lists/list-1/photos",
    listId: "list-1",
    entity,
    photo,
    entityType: "item",
    apiFetch: async () => null,
    apiUploadFormData: async () => ({ photo: { id: "photo-server" } }),
    getCachedPhoto: async () => ({
      blob: new Blob(["full"], { type: "image/jpeg" }),
      fileName: "photo.jpg"
    }),
    persistStateSnapshot: () => {}
  });

  assert.equal(photo.status, "error");
  assert.equal(photo.id, "photo-local");
  assert.equal(photo.url, "");
  assert.equal(photo.thumbUrl, "");
  assert.equal(photo.uploadProgress, undefined);
});

test("CRITICAL offline-photos: server response syncs both dialog draft and saved entity photo", async () => {
  const draftPhoto = {
    id: "photo-local",
    localId: "photo-local",
    status: "pending",
    url: "",
    thumbUrl: ""
  };
  const savedPhoto = {
    id: "photo-local",
    localId: "photo-local",
    status: "pending",
    url: "",
    thumbUrl: ""
  };
  const entity = { id: "item-1", photos: [savedPhoto] };
  const uploaded = await uploadPhotoToPath({
    path: "/bike-packing/lists/list-1/photos",
    listId: "list-1",
    entity,
    photo: draftPhoto,
    entityType: "item",
    apiFetch: async () => {
      throw new Error("copy should not run for local-only photos");
    },
    apiUploadFormData: async (path, options) => {
      assert.equal(draftPhoto.status, "uploading");
      assert.equal(savedPhoto.status, "uploading");
      options.onUploadProgress(64);
      assert.equal(draftPhoto.uploadProgress, 64);
      assert.equal(savedPhoto.uploadProgress, 64);
      return {
        photo: {
          id: "photo-server",
          url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server/file",
          thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server/thumb",
          updatedAt: "2026-06-06T00:00:03.000Z"
        }
      };
    },
    getCachedPhoto: async () => ({
      blob: new Blob(["full"], { type: "image/jpeg" }),
      thumbBlob: new Blob(["thumb"], { type: "image/jpeg" }),
      fileName: "photo.jpg"
    }),
    markEntityChanged: () => {},
    onPhotoProgress: () => {},
    persistStateSnapshot: () => {}
  });

  assert.equal(uploaded, true);
  for (const photo of [draftPhoto, savedPhoto]) {
    assert.equal(photo.id, "photo-server");
    assert.equal(photo.localId, "photo-local");
    assert.equal(photo.status, "synced");
    assert.equal(photo.error, "");
    assert.equal(photo.uploadProgress, undefined);
    assert.match(photo.url, /photo-server\/file/);
    assert.match(photo.thumbUrl, /photo-server\/thumb/);
  }
  assert.equal(photoUploadState(entity.photos).active, false);
  assert.doesNotMatch(renderItemPhotoHtml(entity, { force: true }), /data-photo-upload-status|item-photo-pending|photo-upload-progress/);
});

test("CRITICAL offline-photos: photo upload flow does not start a second upload cycle after a temporary failure", async () => {
  const photo = {
    id: "photo-local",
    localId: "photo-local",
    status: "pending",
    url: "",
    thumbUrl: ""
  };
  const entity = { id: "item-1", photos: [photo] };
  const error = new Error("upload stalled");
  error.isNetworkError = true;
  error.isTimeoutError = true;
  error.isUploadStalled = true;
  let uploadCalls = 0;
  const uploaded = await uploadPhotoToPath({
    path: "/bike-packing/lists/list-1/photos",
    listId: "list-1",
    entity,
    photo,
    entityType: "item",
    apiFetch: async () => {
      throw new Error("recovery lookup is unavailable");
    },
    apiUploadFormData: async () => {
      uploadCalls += 1;
      throw error;
    },
    getCachedPhoto: async () => ({
      blob: new Blob(["full"], { type: "image/jpeg" }),
      fileName: "photo.jpg"
    }),
    persistStateSnapshot: () => {}
  });

  assert.equal(uploaded, true);
  assert.equal(uploadCalls, 1);
  assert.equal(photo.status, "pending");
  assert.equal(photo.error, "");
  assert.equal(photo.uploadProgress, undefined);
});

test("CRITICAL offline-photos: pending photos with server URLs are not shown as waiting", () => {
  assert.equal(photoStatusText([
    {
      id: "photo-server",
      status: "pending",
      url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server/file",
      thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server/thumb"
    }
  ]), "Фото загружено");
});

test("CRITICAL offline-photos: local dialog drafts do not show upload progress before real upload", () => {
  const photos = [{
    id: "photo-local",
    localId: "photo-local",
    status: "pending",
    url: "",
    thumbUrl: ""
  }];
  const uploadState = photoUploadState(photos);

  assert.deepEqual(uploadState, { active: false, progress: 0 });
  assert.equal(photoDialogStatusText(photos), "");
});

test("CRITICAL offline-photos: dialog upload start exposes zero percent progress immediately", () => {
  const photo = {
    id: "photo-local",
    localId: "photo-local",
    status: "pending",
    url: "",
    thumbUrl: ""
  };

  markPhotoUploadStarted(photo, { nowIsoValue: "2026-06-06T00:00:00.000Z" });

  assert.equal(photo.status, "uploading");
  assert.equal(photo.error, "");
  assert.equal(photo.uploadProgress, 0);
  assert.equal(photo.updatedAt, "2026-06-06T00:00:00.000Z");
  assert.equal(photoUploadState([photo]).active, true);
  assert.equal(photoDialogStatusText([photo]), "");
});

test("CRITICAL offline-photos: one dialog progress circle follows the active upload with real progress", () => {
  const uploadState = photoUploadState([
    {
      id: "photo-stale",
      localId: "photo-stale",
      status: "uploading",
      uploadProgress: 0,
      url: "",
      thumbUrl: ""
    },
    {
      id: "photo-active",
      localId: "photo-active",
      status: "uploading",
      uploadProgress: 58,
      url: "",
      thumbUrl: ""
    }
  ]);

  assert.deepEqual(uploadState, { active: true, indeterminate: false, progress: 58 });
});

test("CRITICAL offline-photos: saved item cards render active upload progress only while uploading", () => {
  const html = renderItemPhotoHtml({
    id: "item-1",
    photos: [{
      id: "photo-local",
      localId: "photo-local",
      status: "uploading",
      uploadProgress: 42,
      url: "",
      thumbUrl: ""
    }]
  }, { force: true });

  assert.match(html, /photo-upload-progress/);
  assert.match(html, /--photo-upload-angle: 151deg/);
  assert.match(html, /Фото загружается/);
  assert.doesNotMatch(renderItemPhotoHtml({
    id: "item-1",
    photos: [{
      id: "photo-server",
      localId: "photo-local",
      status: "synced",
      uploadProgress: 100,
      url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server/file",
      thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server/thumb"
    }]
  }, { force: true }), /photo-upload-progress|Фото загружается|Ждём загрузки/);
});

test("CRITICAL offline-photos: dialog photo gallery keeps vertical scroll without button press feedback", () => {
  const styles = readProjectFile("styles.css");
  assert.match(styles, /\.photo-gallery-track\s*\{[\s\S]*touch-action:\s*pan-x pan-y;/);
  assert.match(styles, /button\.photo-gallery-slide:not\(:disabled\):active,\s*button\.photo-gallery-slide\.touch-feedback-active\s*\{[\s\S]*translate:\s*0;[\s\S]*filter:\s*none;/);
});

test("CRITICAL offline-photos: changed photo draft blocks backdrop click without blocking normal dialog clicks", () => {
  const dialog = new EventTarget();
  let changed = true;
  let downstreamClicks = 0;
  const unbind = bindDialogBackdropClickGuard(dialog, () => changed);
  dialog.addEventListener("click", () => {
    downstreamClicks += 1;
  });

  assert.equal(dialog.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })), false);
  assert.equal(downstreamClicks, 0);

  changed = false;
  assert.equal(dialog.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })), true);
  assert.equal(downstreamClicks, 1);

  unbind();
  changed = true;
  assert.equal(dialog.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })), true);
  assert.equal(downstreamClicks, 2);
});

test("CRITICAL offline-photos: iOS file picker dismiss cannot close the edit dialog backdrop", () => {
  const dialog = new EventTarget();
  const input = new EventTarget();
  let currentTime = 1000;
  const timers = [];
  const unbind = bindFilePickerDialogDismissGuard(dialog, [input], {
    maxActiveMs: 30000,
    now: () => currentTime,
    setTimeoutFn: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn: (timer) => {
      if (timer) timer.cleared = true;
    }
  });
  let downstreamClicks = 0;
  dialog.addEventListener("click", () => {
    downstreamClicks += 1;
  });

  input.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
  assert.equal(dialog.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })), false);
  assert.equal(downstreamClicks, 0);

  assert.equal(dialog.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })), true);
  assert.equal(downstreamClicks, 1);

  input.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
  assert.equal(dialog.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true })), false);
  assert.equal(dialog.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true })), true);

  input.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
  input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  assert.equal(dialog.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })), true);
  assert.equal(downstreamClicks, 2);

  input.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
  currentTime += 30001;
  assert.equal(dialog.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })), true);
  assert.equal(downstreamClicks, 3);

  unbind();
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
    status: "pending",
    url: "",
    thumbUrl: "",
    updatedAt: "2026-06-06T00:00:00.000Z"
  }), null);
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
  assert.equal(blob.name, "icloud-photo.jpg");
  assert.equal(reads, 1);
});

test("CRITICAL offline-photos: empty iCloud placeholders fail before draft creation", async () => {
  const file = {
    name: "empty-icloud-photo.jpg",
    type: "image/jpeg",
    arrayBuffer: async () => new ArrayBuffer(0)
  };

  await assert.rejects(
    materializeSelectedPhotoFile(file, { timeoutMs: 0 }),
    /iCloud/
  );
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
