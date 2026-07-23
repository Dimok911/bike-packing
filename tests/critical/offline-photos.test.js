import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  addPhotosToDraft,
  createPhotoDraftFromRecord,
  draftPhotosToCleanup,
  markPhotoUploadBatch,
  normalizeItemPhotos,
  photoDraftChanged,
  removePhotoFromDraft
} from "../../src/state/item-photos.js";
import {
  applyPendingPhotoUploadRetry,
  applySyncedPhotoUploadResult,
  clonePhotoUploadBlob,
  copyRecordPhotosForLocalDuplicate,
  inspectRecordRemotePhotoSources,
  materializeSelectedPhotoFile,
  paintImageOnJpegCanvas,
  photoRecordIdMatchesRemoteSource,
  photoRemoteSrc,
  removeRecordPhotoReference,
  resolveUploadedPhotoByContentHash,
  shouldRetryLocalPhotoUploadAfterFailure
} from "../../src/sync/photos.js";
import { apiUploadFormDataRequest, isTimeoutError } from "../../src/sync/api-client.js";
import {
  cacheRemotePhotosForOffline,
  collectOfflinePhotoCacheTasks,
  createOfflinePhotoCacheController
} from "../../src/sync/offline-photo-cache.js";
import {
  markPhotoUploadStarted,
  uploadPhotoToPath,
  verifyRemotePhotoAssets
} from "../../src/sync/photo-upload-flow.js";
import { acquirePhotoUploadSlot } from "../../src/sync/photo-upload-lock.js";
import {
  getUnsyncedPhotoEntries,
  getUploadablePhotoEntries
} from "../../src/sync/photo-upload-scope.js";
import { compactPhotoForSync, prunePhotoPayloadForSync } from "../../src/sync/serialize.js";
import {
  createPhotoLightboxLoadingNotice,
  photoDialogStatusText,
  photoStatusText,
  photoUploadProgressState,
  photoUploadState,
  replacePhotoLightboxImageSource,
  resolvePhotoGalleryActiveIndex,
  resolvePhotoLightboxSource,
  renderItemPhotoHtml
} from "../../src/ui/photo-gallery.js";
import {
  PHOTO_LIGHTBOX_LOW_RESOLUTION_MAX_PIXELS,
  photoLightboxAutoSize,
  updatePhotoLightboxAutoSize
} from "../../src/ui/photo-lightbox-sizing.js";
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

test("CRITICAL offline-photos: remote personal photos are persisted without changing synced state", async () => {
  const state = {
    items: {
      item1: {
        id: "item1",
        photos: [{
          id: "photo-server-1",
          status: "synced",
          url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server-1/file",
          thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server-1/thumb",
          updatedAt: "2026-07-21T10:00:00.000Z"
        }]
      }
    },
    containers: {}
  };
  const before = JSON.stringify(state);
  const fetched = [];
  const stored = [];
  const result = await cacheRemotePhotosForOffline(state, {
    fetchImpl: async (url) => {
      fetched.push(url);
      return {
        ok: true,
        blob: async () => new Blob([url.includes("/thumb") ? "thumb" : "full"], { type: "image/jpeg" })
      };
    },
    getCachedPhoto: async () => null,
    putCachedPhoto: async (record) => stored.push(record)
  });

  assert.equal(JSON.stringify(state), before);
  assert.equal(result.downloaded, 1);
  assert.equal(result.failed, 0);
  assert.equal(fetched.length, 2);
  assert.equal(stored.length, 2);
  assert.equal(stored[0].id, "photo-server-1");
  assert.equal(stored[0].blob, null);
  assert.equal(await stored[0].thumbBlob.text(), "thumb");
  assert.equal(stored[0].fullBlobVerified, false);
  assert.equal(await stored[1].blob.text(), "full");
  assert.equal(await stored[1].thumbBlob.text(), "thumb");
  assert.equal(stored[1].fullBlobVerified, true);
  assert.equal(stored[1].fullBlobDistinct, true);
});

test("CRITICAL offline-photos: existing local photo blobs prevent duplicate server downloads", async () => {
  const state = {
    items: {},
    containers: {
      bag1: {
        id: "bag1",
        photos: [{
          id: "photo-server-2",
          url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server-2/file",
          thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-server-2/thumb"
        }]
      }
    }
  };
  const [task] = collectOfflinePhotoCacheTasks(state);
  let fetchCount = 0;
  const result = await cacheRemotePhotosForOffline(state, {
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("must not fetch");
    },
    getCachedPhoto: async () => ({
      id: "photo-server-2",
      blob: new Blob(["local"]),
      fullBlobVerified: true,
      sourceSignature: task.signature
    }),
    putCachedPhoto: async () => {
      throw new Error("must not overwrite local upload cache");
    }
  });

  assert.equal(fetchCount, 0);
  assert.equal(result.cached, 1);
  assert.equal(result.downloaded, 0);
});

test("CRITICAL offline-photos: cache controller exposes readiness work once per photo state", async () => {
  const state = {
    items: {
      item1: {
        photos: [{ id: "photo-3", url: "https://api.example.test/photo-3.jpg" }]
      }
    },
    containers: {}
  };
  assert.equal(collectOfflinePhotoCacheTasks(state).length, 1);
  let finishCache;
  let calls = 0;
  const changes = [];
  const controller = createOfflinePhotoCacheController({
    getState: () => state,
    getProgressMessage: () => "Saving photos for offline use…",
    getFailureMessage: () => "Could not save all photos for offline use",
    onChange: (active) => changes.push(active),
    cachePhotos: async (_targetState, options) => {
      calls += 1;
      options.onPending();
      await new Promise((resolve) => { finishCache = resolve; });
      return { total: 1, cached: 0, downloaded: 1, failed: 0 };
    }
  });

  const first = controller.schedule();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.currentMessage(), "Saving photos for offline use…");
  finishCache();
  await first;
  assert.equal(controller.currentMessage(), "");
  await controller.schedule();
  assert.equal(calls, 1);
  assert.deepEqual(changes, [true, false]);
});

test("CRITICAL offline-photos: incomplete offline cache remains visible after background work", async () => {
  const controller = createOfflinePhotoCacheController({
    getState: () => ({
      items: { item1: { photos: [{ id: "photo-4", url: "https://api.example.test/photo-4.jpg" }] } },
      containers: {}
    }),
    getProgressMessage: () => "Saving photos for offline use…",
    getFailureMessage: () => "Could not save all photos for offline use",
    cachePhotos: async (_targetState, options) => {
      options.onPending();
      return { total: 1, cached: 0, downloaded: 0, failed: 1 };
    }
  });

  await controller.schedule();
  assert.equal(controller.currentMessage(), "Could not save all photos for offline use");
});

test("CRITICAL offline-photos: thumbnail is persisted before a slow full-size download finishes", async () => {
  let finishFull;
  const stored = [];
  const state = {
    items: {
      item1: {
        photos: [{
          id: "photo-slow",
          url: "https://api.example.test/photo-slow/file",
          thumbUrl: "https://api.example.test/photo-slow/thumb"
        }]
      }
    },
    containers: {}
  };
  const caching = cacheRemotePhotosForOffline(state, {
    fetchImpl: async (url) => ({
      ok: true,
      blob: async () => url.endsWith("/thumb")
        ? new Blob(["thumb"])
        : new Promise((resolve) => { finishFull = () => resolve(new Blob(["full-size"])); })
    }),
    getCachedPhoto: async () => null,
    putCachedPhoto: async (record) => stored.push(record)
  });

  while (!finishFull || stored.length === 0) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(stored.length, 1);
  assert.equal(stored[0].fullBlobVerified, false);
  assert.equal(await stored[0].thumbBlob.text(), "thumb");

  finishFull();
  const result = await caching;
  assert.equal(result.downloaded, 1);
  assert.equal(stored.length, 2);
  assert.equal(stored[1].fullBlobVerified, true);
  assert.equal(await stored[1].blob.text(), "full-size");
});

test("CRITICAL offline-photos: a failed refresh preserves an older verified full-size blob", async () => {
  const oldFull = new Blob(["old-full"]);
  const stored = [];
  const state = {
    items: {
      item1: {
        photos: [{
          id: "photo-preserve",
          url: "https://api.example.test/photo-preserve/file",
          thumbUrl: "https://api.example.test/photo-preserve/thumb",
          updatedAt: "new"
        }]
      }
    },
    containers: {}
  };
  const result = await cacheRemotePhotosForOffline(state, {
    fetchImpl: async (url) => url.endsWith("/thumb")
      ? { ok: true, blob: async () => new Blob(["new-thumb"]) }
      : { ok: false, blob: async () => null },
    getCachedPhoto: async () => ({
      id: "photo-preserve",
      blob: oldFull,
      thumbBlob: new Blob(["old-thumb"]),
      fullBlobVerified: true,
      sourceSignature: "old|old|old"
    }),
    putCachedPhoto: async (record) => stored.push(record)
  });

  assert.equal(result.failed, 1);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].blob, oldFull);
  assert.equal(stored[0].fullBlobVerified, true);
  assert.equal(stored[0].sourceSignature, "old|old|old");
  assert.equal(await stored[0].thumbBlob.text(), "new-thumb");
});

test("CRITICAL offline-photos: an unverified legacy cache is repaired instead of accepted as full-size", async () => {
  const state = {
    items: {
      item1: {
        photos: [{
          id: "photo-legacy",
          url: "https://api.example.test/photo-legacy/file",
          thumbUrl: "https://api.example.test/photo-legacy/thumb"
        }]
      }
    },
    containers: {}
  };
  const stored = [];
  const result = await cacheRemotePhotosForOffline(state, {
    fetchImpl: async (url) => ({
      ok: true,
      blob: async () => new Blob([url.endsWith("/thumb") ? "new-thumb" : "full"])
    }),
    getCachedPhoto: async () => ({ id: "photo-legacy", blob: new Blob(["old-thumb"]) }),
    putCachedPhoto: async (record) => stored.push(record)
  });

  assert.equal(result.cached, 0);
  assert.equal(result.downloaded, 1);
  assert.equal(stored.at(-1).fullBlobVerified, true);
  assert.equal(await stored.at(-1).blob.text(), "full");
});

test("CRITICAL offline-photos: cache controller retries a failed unchanged photo state", async () => {
  const timers = [];
  let calls = 0;
  const controller = createOfflinePhotoCacheController({
    getState: () => ({
      items: { item1: { photos: [{ id: "photo-retry", url: "https://api.example.test/photo-retry/file" }] } },
      containers: {}
    }),
    retryDelaysMs: [25],
    setTimer: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimer: () => {},
    cachePhotos: async () => {
      calls += 1;
      return calls === 1
        ? { total: 1, cached: 0, downloaded: 0, failed: 1 }
        : { total: 1, cached: 0, downloaded: 1, failed: 0 };
    }
  });

  await controller.schedule();
  assert.equal(calls, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 25);
  timers[0].callback();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 2);
});

test("CRITICAL offline-photos: JPEG conversion replaces transparent pixels with a white background", () => {
  const calls = [];
  const context = {
    fillStyle: "",
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    drawImage: (...args) => calls.push(["drawImage", ...args])
  };
  const bitmap = { width: 800, height: 800 };

  paintImageOnJpegCanvas(context, bitmap, 640, 640);

  assert.equal(context.fillStyle, "#fff");
  assert.deepEqual(calls, [
    ["fillRect", 0, 0, 640, 640],
    ["drawImage", bitmap, 0, 0, 640, 640]
  ]);
});

test("CRITICAL offline-photos: adding and removing a new photo restores a clean dialog draft", () => {
  const source = {
    photos: [{ id: "photo-existing", status: "synced", updatedAt: "2026-07-12T10:00:00.000Z" }]
  };
  const draft = createPhotoDraftFromRecord(source);
  const added = { id: "photo-new", localId: "photo-new", status: "pending", updatedAt: "2026-07-12T11:00:00.000Z" };

  addPhotosToDraft(draft, added);
  const result = removePhotoFromDraft(draft, 1, source);

  assert.equal(result.discardedPhoto, added);
  assert.deepEqual(result.draft.deletedPhotos, []);
  assert.equal(photoDraftChanged(result.draft, source), false);
});

test("CRITICAL offline-photos: dialog snapshots compare the resulting photo list without draft bookkeeping", () => {
  const controllers = readProjectFile("src/app/app-tail-controllers.js");
  const itemSnapshot = controllers.match(/function getItemDialogPhotoSnapshot\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  const containerSnapshot = controllers.match(/function getRootContainerDialogPhotoSnapshot\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  [itemSnapshot, containerSnapshot].forEach((snapshot) => {
    assert.match(snapshot, /itemPhotoSignature\(\{ photos:/);
    assert.doesNotMatch(snapshot, /deletedPhotos|`draft:/);
  });
});

test("CRITICAL offline-photos: removing a saved photo remains a pending dialog change", () => {
  const source = {
    photos: [{ id: "photo-existing", status: "synced", updatedAt: "2026-07-12T10:00:00.000Z" }]
  };
  const draft = createPhotoDraftFromRecord(source);

  const result = removePhotoFromDraft(draft, 0, source);

  assert.equal(result.discardedPhoto, null);
  assert.equal(result.draft.deletedPhotos[0].id, "photo-existing");
  assert.equal(photoDraftChanged(result.draft, source), true);
});

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

test("CRITICAL offline-photos: explicit duplicate queues an independent physical remote photo", async () => {
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

test("CRITICAL offline-photos: explicit duplicate keeps an independent cached fallback for a legacy remote photo", async () => {
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
  let cachedCopy = null;
  const blob = new Blob(["legacy-full"], { type: "image/jpeg" });
  const thumbBlob = new Blob(["legacy-thumb"], { type: "image/jpeg" });

  const [copy] = await copyRecordPhotosForLocalDuplicate({ photos: [original] }, {
    changedAt: "2026-05-24T00:00:00.000Z",
    cachedFallbackSourceIds: [original.localId],
    copyRemotePhotosToCurrentList: true,
    getCachedPhotoForCopy: async () => {
      cacheReads += 1;
      return { id: original.localId, blob, thumbBlob };
    },
    putCachedPhotoForCopy: async (record) => {
      cacheWrites += 1;
      cachedCopy = record;
    }
  });

  assert.equal(cacheReads, 1);
  assert.equal(cacheWrites, 1);
  assert.equal(copy.localId, copy.id);
  assert.equal(cachedCopy.id, copy.id);
  assert.notEqual(cachedCopy.blob, blob);
  assert.notEqual(cachedCopy.thumbBlob, thumbBlob);
  assert.equal(copy.status, "pending");
  assert.equal(copy._copyToCurrentList, true);
  assert.equal(copy.url, original.url);
  assert.equal(copy.thumbUrl, original.thumbUrl);
});

test("CRITICAL offline-photos: online inspection reports a missing server photo and its local recovery option", async () => {
  const calls = [];
  const result = await inspectRecordRemotePhotoSources({
    photos: [{
      id: "photo-legacy",
      localId: "photo-legacy",
      status: "synced",
      url: "https://api.example.test/lists/list-1/photos/photo-legacy/file",
      thumbUrl: "https://api.example.test/lists/list-1/photos/photo-legacy/thumb"
    }]
  }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { status: 404, ok: false };
    },
    getCachedPhotoForInspection: async (id) => ({ id, blob: new Blob(["legacy"]) })
  });

  assert.equal(result.missing.length, 1);
  assert.equal(result.missing[0].sourceLocalId, "photo-legacy");
  assert.equal(result.missing[0].cached, true);
  assert.deepEqual(result.missing[0].statuses, [404, 404]);
  assert.ok(calls.every((call) => call.options.method === "HEAD"));
});

test("CRITICAL offline-photos: missing legacy source row falls back to the independent cached copy", async () => {
  const photo = {
    id: "photo-copy",
    localId: "photo-copy",
    status: "pending",
    url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-legacy/file",
    thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-legacy/thumb",
    _copyToCurrentList: true
  };
  const entity = { id: "item-copy", photos: [photo] };
  const copyError = new Error("Source photo not found");
  copyError.status = 404;
  copyError.data = { code: "not_found", message: "Source photo not found" };
  let uploadCalls = 0;

  await uploadPhotoToPath({
    path: "/bike-packing/lists/list-1/photos",
    listId: "list-1",
    entity,
    photo,
    apiFetch: async () => {
      throw copyError;
    },
    apiUploadFormData: async () => {
      uploadCalls += 1;
      return {
        photo: {
          id: "photo-copy",
          url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-copy/file",
          thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-copy/thumb",
          updatedAt: "2026-07-12T11:00:00.000Z"
        }
      };
    },
    getCachedPhoto: async (id) => id === "photo-copy" ? {
      id,
      blob: new Blob(["legacy-full"], { type: "image/jpeg" }),
      thumbBlob: new Blob(["legacy-thumb"], { type: "image/jpeg" })
    } : null,
    persistStateSnapshot: () => {}
  });

  assert.equal(uploadCalls, 1);
  assert.equal(photo.id, "photo-copy");
  assert.equal(photo.localId, "photo-copy");
  assert.equal(photo.status, "synced");
  assert.equal(photo._copyToCurrentList, undefined);
  assert.match(photo.url, /photo-copy\/file$/);
  assert.match(photo.thumbUrl, /photo-copy\/thumb$/);
});

test("CRITICAL offline-photos: unapproved missing server photo is exposed instead of silently using cache", async () => {
  const photo = {
    id: "photo-copy",
    localId: "",
    status: "pending",
    url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-legacy/file",
    thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-legacy/thumb",
    _copyToCurrentList: true
  };
  const entity = { id: "item-copy", photos: [photo] };
  const copyError = new Error("Source photo not found");
  copyError.status = 404;
  copyError.data = { message: "Source photo not found" };
  let uploadCalls = 0;

  await uploadPhotoToPath({
    path: "/bike-packing/lists/list-1/photos",
    listId: "list-1",
    entity,
    photo,
    apiFetch: async () => { throw copyError; },
    apiUploadFormData: async () => { uploadCalls += 1; },
    getCachedPhoto: async () => ({ blob: new Blob(["must-not-be-used"]) }),
    persistStateSnapshot: () => {}
  });

  assert.equal(uploadCalls, 0);
  assert.equal(photo.status, "missing-local-file");
  assert.equal(photo.error, "Фото отсутствует на сервере.");
  assert.equal(photo.url, "");
  assert.equal(photo.thumbUrl, "");
  assert.equal(photo._copyToCurrentList, undefined);
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

test("CRITICAL offline-photos: local duplicate stores independent blob instances", async () => {
  const calls = [];
  const blob = { size: 10, type: "image/jpeg", slice: (...args) => ({ cloned: "full", args }) };
  const thumbBlob = { size: 4, type: "image/webp", slice: (...args) => ({ cloned: "thumb", args }) };
  let stored = null;
  const [copy] = await copyRecordPhotosForLocalDuplicate({
    photos: [{ id: "local-photo", localId: "local-photo", status: "pending" }]
  }, {
    changedAt: "2026-07-12T12:00:00.000Z",
    getCachedPhotoForCopy: async () => ({ id: "local-photo", blob, thumbBlob }),
    putCachedPhotoForCopy: async (record) => {
      stored = record;
      calls.push(record.id);
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(stored.blob.cloned, "full");
  assert.equal(stored.thumbBlob.cloned, "thumb");
  assert.equal(copy.localId, copy.id);
  assert.equal(copy.status, "pending");
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

test("CRITICAL offline-photos: queued physical copy is not synced before its file exists", () => {
  assert.equal(compactPhotoForSync({
    id: "photo-copy",
    status: "pending",
    url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-source/file",
    thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-source/thumb",
    _copyToCurrentList: true
  }), null);
});

test("CRITICAL offline-photos: copied server photo is accepted only when both assets exist", async () => {
  const calls = [];
  assert.equal(await verifyRemotePhotoAssets({
    url: "https://api.example.test/photo/file",
    thumbUrl: "https://api.example.test/photo/thumb"
  }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: !url.endsWith("/thumb") };
    }
  }), false);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.options.method === "HEAD"));
});

test("CRITICAL offline-photos: public catalog item photos are in the published upload scope", () => {
  const layoutId = "layout-admin-shared";
  const state = {
    layouts: {
      [layoutId]: {
        id: layoutId,
        adminSharedSourceId: "shared-demo",
        rootContainerIds: ["container-root"],
        arrangement: {
          rootContainerIds: ["container-root"],
          containers: {
            "container-root": {
              parentId: "",
              itemIds: [],
              childIds: [],
              order: []
            }
          },
          items: {},
          packedItems: {}
        }
      }
    },
    containers: {
      "container-root": {
        id: "container-root",
        itemIds: [],
        childIds: [],
        order: []
      }
    },
    items: {
      "item-detached": {
        id: "item-detached",
        name: "Giro Tracker Shoes",
        containerId: "",
        publicCatalogLayoutId: layoutId,
        photos: [{
          id: "photo-detached",
          localId: "photo-detached",
          status: "pending",
          url: "",
          thumbUrl: ""
        }]
      }
    }
  };

  const uploadable = getUploadablePhotoEntries(state, {
    layoutId,
    listId: "public-shared-layout-shared-demo",
    allowRemoteOnlyReferences: false
  });
  const unsynced = getUnsyncedPhotoEntries(state, {
    layoutId,
    listId: "public-shared-layout-shared-demo"
  });

  assert.equal(uploadable.length, 1);
  assert.equal(uploadable[0].entity.id, "item-detached");
  assert.equal(unsynced.length, 1);
  assert.equal(unsynced[0].entity.id, "item-detached");
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

test("CRITICAL offline-photos: stale copied references are queued for physical repair", () => {
  const photo = {
    id: "photo-copy",
    url: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/file",
    thumbUrl: "https://api.example.test/bike-packing/lists/list-1/photos/photo-original/thumb",
    status: "synced"
  };
  const state = {
    items: { "item-copy": { id: "item-copy", photos: [photo] } },
    containers: {},
    layouts: {}
  };

  const entries = getUploadablePhotoEntries(state, { listId: "list-1" });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].photo.id, "photo-copy");
  assert.equal(entries[0].photo._copyToCurrentList, true);
  assert.equal(entries[0].photo.status, "pending");
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

test("CRITICAL offline-photos: item copy audits online server loss but keeps offline cached copying available", () => {
  const controllers = readProjectFile("src/app/app-tail-controllers.js");
  const copyBlock = controllers.slice(
    controllers.indexOf("async function copyItem(itemId"),
    controllers.indexOf("async function copyRootContainer")
  );
  assert.match(copyBlock, /const offlineCopy = isForcedOffline\(\) \|\| !runtime\.currentUser \|\| globalThis\.navigator\?\.onLine === false/);
  assert.match(copyBlock, /normalizeItemPhotos\(item\).*localId \|\| photo\.id/s);
  assert.match(copyBlock, /await inspectRecordRemotePhotoSources\(item\)/);
  assert.match(copyBlock, /title: localText\("Photo is missing from the server", "Фото отсутствует на сервере"\)/);
  assert.match(copyBlock, /okText: localText\("Copy anyway", "Всё равно копировать"\)/);
  assert.match(copyBlock, /cachedFallbackSourceIds,/);
});

test("CRITICAL offline-photos: dialog photo uploads render a queued batch before starting the network", () => {
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
  assert.equal((controllers.match(/uploadPhotoWithOneRetry\(photo/g) || []).length, 2);
  assert.equal((controllers.match(/retryTemporaryUploadFailure,\s*\n\s*scheduleProgressRender:/g) || []).length, 2);
  assert.doesNotMatch(controllers, /dialogPhotoUploadInProgress|markDialogPhotosUploading|markUnresolvedDialogUploadsFailed|updateDialogPhotoUploadProgress/);
  assert.doesNotMatch(controllers, /scheduleDialogPhotoUploadPreviewRender|dialogPhotoUploadPreviewFrame|onPhotoProgress:\s*onProgress/);
  assert.match(controllers, /photoUploadProgressRenderFrame,\s*updatePhotoGalleryUploadProgress,/);
  assert.match(controllers, /await updateItemDialogPhotoPreview\(runtime\.itemDialogPhotoDraft\.photos\)/);
  assert.match(controllers, /await updateRootContainerDialogPhotoPreview\(runtime\.rootContainerDialogPhotoDraft\.photos\)/);
  assert.doesNotMatch(controllers, /markDialogDraftPhotosUploadStarted|resetDialogDraftPhotosUploadStart|canStartDialogDraftPhotoUpload/);
  assert.doesNotMatch(controllers, /const uploadStartedInPreview/);
  assert.match(controllers, /await waitForDialogPhotoUploadSlot/);
  assert.match(controllers, /return acquirePhotoUploadSlot\(\{/);
  assert.match(app, /const slotAvailable = await acquirePhotoUploadSlot\(\{/);
  assert.match(app, /const entries = getUploadablePhotoEntries\(\{ layoutId, listId \}\);/);
  assert.match(controllers, /shouldUploadPhoto:\s*\(photo\) => !draft\?\.uploadDiscarded && dialogDraftPhotoStillOwnedBy/);
  assert.equal((controllers.match(/uploadPhotoBatchQueue\(eligiblePhotos/g) || []).length, 2);
  assert.equal((controllers.match(/shouldUploadPhoto:\s*\(photo\) => shouldUploadPhoto\(photo\) && !photoRemoteSrc\(photo\)/g) || []).length, 2);
  assert.match(controllers, /updatePhotoGalleryUploadProgress\(refs\.itemPhotoPreview,\s*list\)/);
  assert.match(controllers, /updatePhotoGalleryUploadProgress\(refs\.rootContainerPhotoPreview,\s*list\)/);
  assert.doesNotMatch(itemDialogUploadBlock, /updateItemDialogPhotoPreview/);
  assert.doesNotMatch(rootContainerDialogUploadBlock, /updateRootContainerDialogPhotoPreview/);
  assert.equal((controllers.match(/markPhotoUploadStarted\(candidate\);/g) || []).length, 2);
  assert.match(controllers, /setItemDialogPhotoStatus\(photoDialogStatusText\(list\)\)/);
  assert.match(controllers, /setRootContainerDialogPhotoStatus\(photoDialogStatusText\(list\)\)/);
  assert.doesNotMatch(app, /async function getPhotoUploadSource|async function copyRemotePhotoToList|async function fetchRemotePhotoBlobForUpload/);
  assert.doesNotMatch(app.slice(app.indexOf("async function uploadEntityPhotoToPath")), /retryAvailable:\s*true/);
  assert.doesNotMatch(app.slice(app.indexOf("async function uploadEntityPhotoToPath")), /const retryPhoto = resolvePhoto\(\)/);
  assert.doesNotMatch(app.slice(app.indexOf("async function uploadEntityPhotoToPath")), /apiFetch\(path,\s*\{[\s\S]*PHOTO_UPLOAD_TIMEOUT_MS/);
  assert.doesNotMatch(controllers, /button\.textContent\s*=\s*"Фото загружается"/);
});

test("CRITICAL offline-photos: a pending upload waits for the active upload and acquires the shared slot", async () => {
  let busy = true;
  let clock = 0;
  let waits = 0;
  const acquired = await acquirePhotoUploadSlot({
    isBusy: () => busy,
    setBusy: (value) => { busy = value; },
    shouldContinue: () => true,
    maxWaitMs: 1000,
    delayMs: 25,
    now: () => clock,
    setTimeoutImpl: (resolve, delay) => {
      waits += 1;
      clock += delay;
      busy = false;
      resolve();
    }
  });

  assert.equal(acquired, true);
  assert.equal(waits, 1);
  assert.equal(busy, true);
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

test("CRITICAL offline-photos: upload status and lightbox controls follow English UI language", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { documentElement: { lang: "en" } };
  try {
    assert.equal(photoStatusText([{ id: "photo-1", status: "uploading" }]), "Uploading photo");
    const source = readProjectFile("src/ui/photo-gallery.js");
    assert.match(source, /localText\("Close", "Закрыть"\)/);
    assert.match(source, /localText\("Previous photo", "Предыдущее фото"\)/);
    assert.match(source, /localText\("Next photo", "Следующее фото"\)/);
    assert.doesNotMatch(source, /aria-label="(Закрыть|Предыдущее фото|Следующее фото)"/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("CRITICAL offline-photos: a selected dialog batch shows zero progress before the network starts", () => {
  const photos = [{
    id: "photo-local",
    localId: "photo-local",
    status: "pending",
    url: "",
    thumbUrl: ""
  }];
  markPhotoUploadBatch(photos, { batchId: "batch-queued" });
  const uploadState = photoUploadState(photos);

  assert.deepEqual(uploadState, {
    active: true,
    indeterminate: false,
    progress: 0,
    batchIndex: 1,
    batchTotal: 1,
    uploaded: 0
  });
  assert.equal(photoDialogStatusText(photos), "");
  assert.deepEqual(photoUploadProgressState(photos[0]), { active: true, progress: 0 });
});

test("CRITICAL offline-photos: dialog upload start exposes zero percent progress immediately", () => {
  const photo = {
    id: "photo-local",
    localId: "photo-local",
    status: "pending",
    url: "",
    thumbUrl: ""
  };

  markPhotoUploadBatch([photo], { batchId: "batch-started" });
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

test("CRITICAL offline-photos: lightbox repairs an unverified thumbnail and reuses the verified result", async () => {
  const sourceSignature = "https://api.example.test/photo-lightbox/file|https://api.example.test/photo-lightbox/thumb|v2";
  const entry = {
    localId: "photo-lightbox",
    previewSrc: "https://api.example.test/photo-lightbox/thumb",
    fullSrc: "https://api.example.test/photo-lightbox/file",
    remoteFullSrc: "https://api.example.test/photo-lightbox/file",
    remoteThumbSrc: "https://api.example.test/photo-lightbox/thumb",
    sourceSignature
  };
  let cached = {
    id: "photo-lightbox",
    blob: new Blob(["thumb"]),
    thumbBlob: new Blob(["thumb"])
  };
  let fetchCount = 0;
  const options = {
    getCachedPhotoForLightbox: async () => cached,
    putCachedPhotoForLightbox: async (record) => { cached = record; },
    fetchImpl: async (url) => {
      fetchCount += 1;
      return {
        ok: true,
        blob: async () => new Blob([url.endsWith("/thumb") ? "thumb" : "full-size"])
      };
    },
    createObjectUrl: (blob) => `blob:photo-${blob.size}-${fetchCount}`
  };

  const first = await resolvePhotoLightboxSource(entry, options);
  const afterFirstFetches = fetchCount;
  const reopenedAfterRerender = await resolvePhotoLightboxSource({ ...entry }, options);

  assert.equal(first.isFull, true);
  assert.equal(cached.fullBlobVerified, true);
  assert.equal(cached.sourceSignature, sourceSignature);
  assert.equal(await cached.blob.text(), "full-size");
  assert.equal(reopenedAfterRerender.isFull, true);
  assert.equal(fetchCount, afterFirstFetches);
});

test("CRITICAL offline-photos: stale verified cache falls back to its saved preview when offline", async () => {
  const cachedThumb = new Blob(["saved-preview"]);
  const result = await resolvePhotoLightboxSource({
    localId: "photo-stale",
    previewSrc: "https://api.example.test/photo-stale/thumb",
    fullSrc: "https://api.example.test/photo-stale/file",
    remoteFullSrc: "https://api.example.test/photo-stale/file",
    remoteThumbSrc: "https://api.example.test/photo-stale/thumb",
    sourceSignature: "current|current|current"
  }, {
    getCachedPhotoForLightbox: async () => ({
      id: "photo-stale",
      blob: new Blob(["old-full"]),
      thumbBlob: cachedThumb,
      fullBlobVerified: true,
      sourceSignature: "old|old|old"
    }),
    putCachedPhotoForLightbox: async () => {
      throw new Error("must not overwrite on failure");
    },
    fetchImpl: async () => ({ ok: false }),
    createObjectUrl: (blob) => `blob:fallback-${blob.size}`
  });

  assert.equal(result.src, `blob:fallback-${cachedThumb.size}`);
  assert.equal(result.isFull, false);
  assert.equal(result.reason, "cached-preview");
});

test("CRITICAL offline-photos: authoritative full endpoint remains full when bytes match the thumbnail", async () => {
  const sameImage = new Blob(["same-image"], { type: "image/jpeg" });
  let stored = null;
  const result = await resolvePhotoLightboxSource({
    localId: "photo-same",
    previewSrc: "https://api.example.test/photo-same/thumb",
    fullSrc: "https://api.example.test/photo-same/file",
    remoteFullSrc: "https://api.example.test/photo-same/file",
    remoteThumbSrc: "https://api.example.test/photo-same/thumb",
    sourceSignature: "same|same|same"
  }, {
    getCachedPhotoForLightbox: async () => null,
    putCachedPhotoForLightbox: async (record) => { stored = record; },
    fetchImpl: async () => ({ ok: true, blob: async () => sameImage }),
    createObjectUrl: () => "blob:authoritative-full"
  });

  assert.equal(result.isFull, true);
  assert.equal(stored.fullBlobVerified, true);
  assert.equal(stored.fullBlobDistinct, false);
});

test("CRITICAL offline-photos: catalogs rebind photo galleries after every items and bags render", () => {
  const source = readProjectFile("src/app/app-tail-controllers.js");
  const bindings = source.match(/bindPhotoGalleries\(refs\.(?:itemsView|bagsView), photoGalleryBindingOptions\(\)\);/g) || [];
  assert.equal(bindings.length, 4);
});

test("CRITICAL offline-photos: low-resolution lightbox photos stay at their natural size", () => {
  assert.equal(PHOTO_LIGHTBOX_LOW_RESOLUTION_MAX_PIXELS, 1_000_000);
  assert.deepEqual(photoLightboxAutoSize({
    naturalWidth: 800,
    naturalHeight: 600,
    availableWidth: 1900,
    availableHeight: 1000
  }), {
    limitAutoUpscale: true,
    width: 800,
    height: 600
  });
});

test("CRITICAL offline-photos: high-resolution or already-downscaled photos keep screen fitting", () => {
  assert.deepEqual(photoLightboxAutoSize({
    naturalWidth: 1600,
    naturalHeight: 1200,
    availableWidth: 1900,
    availableHeight: 1000
  }), {
    limitAutoUpscale: false,
    width: 0,
    height: 0
  });
  assert.deepEqual(photoLightboxAutoSize({
    naturalWidth: 800,
    naturalHeight: 1200,
    availableWidth: 390,
    availableHeight: 800
  }), {
    limitAutoUpscale: false,
    width: 0,
    height: 0
  });
});

test("CRITICAL offline-photos: lightbox auto-size class follows each decoded photo", () => {
  const classes = new Set();
  const properties = new Map();
  const image = {
    naturalWidth: 640,
    naturalHeight: 480,
    classList: {
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
    },
    style: {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name)
    }
  };
  const viewport = { clientWidth: 1200, clientHeight: 900 };

  updatePhotoLightboxAutoSize(image, viewport);
  assert.equal(classes.has("photo-lightbox-image-no-upscale"), true);
  assert.equal(properties.get("--photo-lightbox-natural-width"), "640px");
  assert.equal(properties.get("--photo-lightbox-natural-height"), "480px");

  image.naturalWidth = 2000;
  image.naturalHeight = 1500;
  updatePhotoLightboxAutoSize(image, viewport);
  assert.equal(classes.has("photo-lightbox-image-no-upscale"), false);
  assert.equal(properties.size, 0);
});

test("CRITICAL offline-photos: dialog photo gallery keeps vertical scroll without button press feedback", () => {
  const styles = readProjectFile("styles.css");
  assert.match(styles, /\.photo-gallery-track\s*\{[\s\S]*overscroll-behavior-x:\s*contain;[\s\S]*overscroll-behavior-y:\s*auto;/);
  assert.match(styles, /\.photo-gallery-track\s*\{[\s\S]*touch-action:\s*pan-x pan-y;/);
  assert.match(styles, /button\.photo-gallery-slide:not\(:disabled\):active,\s*button\.photo-gallery-slide\.touch-feedback-active\s*\{[\s\S]*translate:\s*0;[\s\S]*filter:\s*none;/);
});

test("CRITICAL offline-photos: dot navigation keeps its target active throughout smooth scrolling", () => {
  assert.deepEqual(resolvePhotoGalleryActiveIndex({
    pendingIndex: 3,
    scrollLeft: 0,
    trackWidth: 300
  }), {
    activeIndex: 3,
    pendingIndex: 3
  });
  assert.deepEqual(resolvePhotoGalleryActiveIndex({
    pendingIndex: 3,
    scrollLeft: 602,
    trackWidth: 300
  }), {
    activeIndex: 3,
    pendingIndex: 3
  });
  assert.deepEqual(resolvePhotoGalleryActiveIndex({
    pendingIndex: 3,
    scrollLeft: 900,
    trackWidth: 300
  }), {
    activeIndex: 3,
    pendingIndex: null
  });
  assert.deepEqual(resolvePhotoGalleryActiveIndex({
    scrollLeft: 602,
    trackWidth: 300
  }), {
    activeIndex: 2,
    pendingIndex: null
  });
});

test("CRITICAL offline-photos: lightbox side navigation uses full-height hit zones", () => {
  const source = readProjectFile("src/ui/photo-gallery.js");
  const styles = readProjectFile("styles.css");
  assert.match(source, /photo-lightbox-prev[\s\S]*<span aria-hidden="true">/);
  assert.match(source, /setAttribute\("aria-disabled", activeIndex <= 0 \? "true" : "false"\)/);
  assert.match(source, /if \(direction < 0 && activeIndex <= 0\) return;/);
  assert.match(styles, /\.photo-lightbox-nav\s*\{[\s\S]*top:\s*0;[\s\S]*bottom:\s*0;[\s\S]*width:\s*clamp\(72px,\s*22vw,\s*148px\);/);
  assert.match(styles, /\.photo-lightbox-nav span\s*\{[\s\S]*width:\s*46px;[\s\S]*min-height:\s*62px;/);
  assert.doesNotMatch(styles, /\.photo-lightbox-nav:disabled/);
});

test("CRITICAL offline-photos: lightbox keeps the preview visible until the full-size photo is decoded", () => {
  const source = readProjectFile("src/ui/photo-gallery.js");
  const styles = readProjectFile("styles.css");
  assert.match(source, /const previewSrc = image\.currentSrc \|\| image\.src \|\| "";/);
  assert.match(source, /const fullSrc = image\.dataset\.photoFullSrc \|\| previewSrc;/);
  assert.match(source, /Loading full-size photo…/);
  assert.match(source, /Загружается полная версия фото…/);
  assert.match(source, /PHOTO_LIGHTBOX_LOADING_NOTICE_DELAY_MS = 450/);
  assert.match(source, /loadingNotice\.pending\(\)/);
  assert.doesNotMatch(source, /updateLoadStatus\("loading"\)/);
  assert.match(source, /const displaySrc = readyFullSrc \|\| previewSrc;[\s\S]*image\.src = displaySrc;[\s\S]*await replacePhotoLightboxImageSource\(currentImage, next\.src/);
  assert.match(source, /await loadAndDecode\(replacement, src\);[\s\S]*currentImage\.replaceWith\(replacement\);/);
  assert.match(source, /await decodePhotoLightboxImage\(replacement\);/);
  assert.match(source, /photoLightboxImageUsesSource\(replacement, src\)/);
  assert.match(source, /Preview · full-size photo is unavailable/);
  assert.match(source, /Предпросмотр · полная версия фото недоступна/);
  assert.match(source, /Preview · only the preview is stored/);
  assert.match(source, /Предпросмотр · сохранён только предпросмотр/);
  assert.match(source, /Showing the saved preview/);
  assert.match(source, /Показан сохранённый предпросмотр/);
  assert.match(styles, /\.photo-lightbox-load-status\s*\{/);
  assert.match(styles, /\.photo-lightbox-loading-spinner\s*\{[\s\S]*animation:\s*spin/);
});

test("CRITICAL offline-photos: lightbox keeps stable geometry and never downgrades an already decoded photo", () => {
  const source = readProjectFile("src/ui/photo-gallery.js");
  const styles = readProjectFile("styles.css");
  assert.match(source, /const decodedPhotoLightboxSources = new Set\(\);/);
  assert.match(source, /resolvedFullSrc: decodedPhotoLightboxSources\.has\(fullSrc\) \? fullSrc : ""/);
  assert.match(source, /const readyFullSrc = entry\?\.resolvedFullSrc \|\| "";/);
  assert.match(source, /image\.dataset\.photoLightboxQuality = readyFullSrc \? "full" : "preview";[\s\S]*if \(readyFullSrc\) return true;/);
  assert.match(source, /entry\.resolvedFullSrc = next\.src;/);
  assert.match(source, /decodedPhotoLightboxSources\.add\(next\.src\);/);
  assert.doesNotMatch(source, /image\.src = previewSrc;/);
  assert.match(styles, /\.photo-lightbox-image\s*\{[\s\S]*width:\s*calc\(100vw - 18px\);[\s\S]*height:\s*calc\(100dvh - 18px\);[\s\S]*object-fit:\s*contain;/);
  assert.match(styles, /\.photo-lightbox-image\.photo-lightbox-image-no-upscale\s*\{[\s\S]*--photo-lightbox-natural-width[\s\S]*--photo-lightbox-natural-height/);
});

test("CRITICAL offline-photos: fast full-size resolution cancels the loading notice before it flashes", () => {
  const changes = [];
  const timers = [];
  const notice = createPhotoLightboxLoadingNotice({
    delayMs: 450,
    setTimer: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      timer.cleared = true;
    },
    onChange: (state) => changes.push(state)
  });

  notice.pending();
  assert.deepEqual(changes, ["idle"]);
  assert.equal(timers[0].delay, 450);

  notice.settle("idle");
  assert.equal(timers[0].cleared, true);
  if (!timers[0].cleared) timers[0].callback();
  assert.deepEqual(changes, ["idle", "idle"]);

  notice.pending();
  timers[1].callback();
  assert.deepEqual(changes, ["idle", "idle", "idle", "loading"]);
  notice.cancel();
  assert.equal(changes.at(-1), "idle");
});

test("CRITICAL offline-photos: decoded full-size source replaces the visible preview before success", async () => {
  const steps = [];
  const currentImage = {
    isConnected: true,
    replaceWith(replacement) {
      steps.push("replace");
      this.isConnected = false;
      replacement.isConnected = true;
    }
  };
  const replacement = {
    src: "",
    currentSrc: "",
    complete: true,
    naturalWidth: 2400,
    isConnected: false,
    decoding: "",
    removeAttribute: () => {},
    decode: async () => {
      steps.push("visible-decode");
    }
  };

  const result = await replacePhotoLightboxImageSource(currentImage, "blob:full-photo", {
    createReplacement: () => replacement,
    loadAndDecode: async (image, src) => {
      image.src = src;
      image.currentSrc = src;
      steps.push("candidate-decode");
    },
    afterPaint: async () => {
      steps.push("paint");
    },
    onReplaced: () => {
      steps.push("committed");
    }
  });

  assert.equal(result, replacement);
  assert.deepEqual(steps, [
    "candidate-decode",
    "replace",
    "committed",
    "paint",
    "visible-decode"
  ]);
  assert.equal(currentImage.isConnected, false);
  assert.equal(replacement.isConnected, true);
  assert.equal(replacement.currentSrc, "blob:full-photo");
});

test("CRITICAL offline-photos: a full-size decode failure leaves the visible preview in place", async () => {
  let replaced = false;
  const currentImage = {
    isConnected: true,
    replaceWith() {
      replaced = true;
    }
  };

  await assert.rejects(
    replacePhotoLightboxImageSource(currentImage, "blob:broken-full", {
      createReplacement: () => ({
        src: "",
        currentSrc: "",
        removeAttribute: () => {}
      }),
      loadAndDecode: async () => {
        throw new Error("decode failed");
      }
    }),
    /decode failed/
  );

  assert.equal(replaced, false);
  assert.equal(currentImage.isConnected, true);
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

test("CRITICAL offline-photos: root app backdrop guards use root dialog state without an undefined runtime", () => {
  const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const guardStart = appSource.indexOf("bindDialogBackdropClickGuard(refs.dialog");
  const guardEnd = appSource.indexOf("refs.newLayoutBtn.addEventListener", guardStart);
  const guards = appSource.slice(guardStart, guardEnd);

  assert.notEqual(guardStart, -1);
  assert.notEqual(guardEnd, -1);
  assert.doesNotMatch(guards, /\bruntime\./);
  assert.match(guards, /photoDraftChanged\(itemDialogPhotoDraft, editingItemId/);
  assert.match(guards, /photoDraftChanged\(rootContainerDialogPhotoDraft, editingRootContainerId/);
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
