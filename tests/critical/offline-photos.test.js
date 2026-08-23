import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
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
  createPhotoHydrationTask,
  createOfflinePhotoCacheController,
  createOfflinePhotoRenderCoordinator
} from "../../src/sync/offline-photo-cache.js";
import { photoBlobsAreDistinct } from "../../src/sync/photo-cache-quality.js";
import {
  PHOTO_CACHE_ENGINE_CONTRACT_VERSION,
  PHOTO_CACHE_ENGINE_VERSION
} from "../../src/sync/photo-cache-engine.js";
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
  bindPhotoGalleries,
  createPhotoLightboxLoadingNotice,
  photoDialogStatusText,
  photoGalleryVisibleDotIndexes,
  photoLightboxUsesTouchCarousel,
  photoStatusText,
  photoUploadProgressState,
  photoUploadState,
  replacePhotoLightboxImageSource,
  resolvePhotoGalleryActiveIndex,
  resolvePhotoGallerySnapIndex,
  resolvePhotoLightboxSource,
  renderItemPhotoHtml,
  renderPhotoDots,
  renderPhotoSlide
} from "../../src/ui/photo-gallery.js";
import { createPhotoObjectUrlRegistry } from "../../src/ui/photo-object-url-registry.js";
import {
  PHOTO_LIGHTBOX_LOW_RESOLUTION_MAX_PIXELS,
  photoLightboxAutoSize,
  photoLightboxSizingPresentation,
  updatePhotoLightboxAutoSize
} from "../../src/ui/photo-lightbox-sizing.js";
import {
  createSharedFullscreenSourceController,
  fullscreenSwitcherMatchesRequestedMode,
  replaceSharedFullscreenImageSource,
  resolveSharedFullscreenImagePresentation,
  stepSharedPhotoInertia
} from "../../src/ui/shared-photo-gallery.js";
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

test("CRITICAL offline-photos: a newly uploaded verified original adopts its remote signature without download", async () => {
  const state = {
    items: {
      item1: {
        photos: [{
          id: "photo-server-new",
          localId: "photo-local-new",
          url: "https://api.example.test/photo-server-new/file",
          thumbUrl: "https://api.example.test/photo-server-new/thumb",
          updatedAt: "v1"
        }]
      }
    },
    containers: {}
  };
  const original = new Blob(["local-original"]);
  let stored = null;
  let fetchCount = 0;
  const result = await cacheRemotePhotosForOffline(state, {
    getCachedPhoto: async () => ({
      id: "photo-local-new",
      blob: original,
      thumbBlob: new Blob(["local-thumb"]),
      fullBlobVerified: true,
      sourceSignature: ""
    }),
    putCachedPhoto: async (record) => { stored = record; },
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("must not fetch");
    }
  });

  assert.deepEqual(result, { total: 1, cached: 1, downloaded: 0, failed: 0 });
  assert.equal(fetchCount, 0);
  assert.equal(stored.blob, original);
  assert.equal(stored.sourceSignature,
    "https://api.example.test/photo-server-new/file|https://api.example.test/photo-server-new/thumb|v1");
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

test("CRITICAL offline-photos: a failed refresh never promotes an older signature as current", async () => {
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
  assert.equal(stored[0].blob, null);
  assert.equal(stored[0].fullBlobVerified, false);
  assert.equal(stored[0].sourceSignature,
    "https://api.example.test/photo-preserve/file|https://api.example.test/photo-preserve/thumb|new");
  assert.equal(await stored[0].thumbBlob.text(), "new-thumb");
});

test("CRITICAL offline-photos: first download is reused on a second application start without fetch", async () => {
  const state = {
    items: {
      item1: {
        photos: [{
          id: "photo-repeat",
          url: "https://api.example.test/photo-repeat/file",
          thumbUrl: "https://api.example.test/photo-repeat/thumb",
          updatedAt: "v1"
        }]
      }
    },
    containers: {}
  };
  const records = new Map();
  let fetchCount = 0;
  const options = {
    getCachedPhoto: async (id) => records.get(id) || null,
    putCachedPhoto: async (record) => records.set(record.id, record),
    fetchImpl: async (url) => {
      fetchCount += 1;
      return { ok: true, blob: async () => new Blob([url]) };
    }
  };

  const first = await cacheRemotePhotosForOffline(state, options);
  assert.deepEqual(first, { total: 1, cached: 0, downloaded: 1, failed: 0 });
  assert.equal(fetchCount, 2);

  const second = await cacheRemotePhotosForOffline(state, options);
  assert.deepEqual(second, { total: 1, cached: 1, downloaded: 0, failed: 0 });
  assert.equal(fetchCount, 2);
});

test("CRITICAL offline-photos: cached thumbnail is hydrated before a card can expose its remote src", async () => {
  const photo = {
    id: "photo-hydrated",
    url: "https://api.example.test/photo-hydrated/file",
    thumbUrl: "https://api.example.test/photo-hydrated/thumb",
    updatedAt: "v1"
  };
  const state = { items: { item1: { photos: [photo] } }, containers: {} };
  const [task] = collectOfflinePhotoCacheTasks(state);
  const revoked = [];
  const objectUrls = createPhotoObjectUrlRegistry({
    createObjectUrl: () => "blob:cached-thumb",
    revokeObjectUrl: (url) => revoked.push(url)
  });
  objectUrls.activateScope("id:user-1");
  const coordinator = createOfflinePhotoRenderCoordinator({
    getState: () => state,
    getScopeKey: () => "id:user-1",
    getCachedPhoto: async () => ({
      id: photo.id,
      blob: null,
      thumbBlob: new Blob(["thumb"]),
      fullBlobVerified: false,
      sourceSignature: task.signature
    }),
    objectUrls
  });

  const blockedHtml = renderPhotoSlide(photo, { photoObjectUrls: objectUrls });
  assert.doesNotMatch(blockedHtml, /\n\s+src="/);
  await coordinator.prepare();
  const hydratedHtml = renderPhotoSlide(photo, { photoObjectUrls: objectUrls });
  assert.match(hydratedHtml, /src="blob:cached-thumb"/);
  assert.equal(coordinator.isReady(), true);
  assert.deepEqual(revoked, []);
});

test("CRITICAL offline-photos: render hydration prunes deleted remote cache records and releases Blob URLs", async () => {
  let state = {
    items: { item1: { photos: [{ id: "photo-live", url: "https://api.example.test/live/file" }] } },
    containers: {}
  };
  const deleted = [];
  const revoked = [];
  const objectUrls = createPhotoObjectUrlRegistry({
    createObjectUrl: () => "blob:live",
    revokeObjectUrl: (url) => revoked.push(url)
  });
  objectUrls.activateScope("id:user-1");
  const coordinator = createOfflinePhotoRenderCoordinator({
    getState: () => state,
    getScopeKey: () => "id:user-1",
    getCachedPhoto: async () => null,
    listCachedPhotos: async () => [
      { id: "photo-live", cachePurpose: "offline-remote" },
      { id: "photo-deleted", cachePurpose: "offline-remote" },
      { id: "photo-upload", cachePurpose: "local-upload" }
    ],
    deleteCachedPhoto: async (id) => deleted.push(id),
    objectUrls
  });
  await coordinator.prepare();
  assert.deepEqual(deleted, ["photo-deleted"]);

  objectUrls.ensure("photo-live", "https://api.example.test/live/file|https://api.example.test/live/file|", new Blob(["live"]));
  state = { items: {}, containers: {} };
  await coordinator.prepare();
  assert.ok(revoked.includes("blob:live"));
});

test("CRITICAL offline-photos: fullscreen preparation hydrates verified full before render and skips a second IDB read", async () => {
  const signature = "https://api.example.test/full|https://api.example.test/thumb|v1";
  let reads = 0;
  let urlIndex = 0;
  const objectUrls = createPhotoObjectUrlRegistry({
    createObjectUrl: () => `blob:fullscreen-${++urlIndex}`,
    revokeObjectUrl: () => {}
  });
  objectUrls.activateScope("id:user-1");
  const coordinator = createOfflinePhotoRenderCoordinator({
    getScopeKey: () => "id:user-1",
    getCachedPhoto: async () => {
      reads += 1;
      return {
        id: "photo-fullscreen",
        blob: new Blob(["full"]),
        thumbBlob: new Blob(["thumb"]),
        fullBlobVerified: true,
        sourceSignature: signature,
        cachePurpose: "offline-remote",
        width: 640,
        height: 480
      };
    },
    objectUrls
  });

  const first = await coordinator.prepareFullscreenSource({
    localId: "photo-fullscreen",
    sourceSignature: signature
  });
  const second = await coordinator.prepareFullscreenSource({
    localId: "photo-fullscreen",
    sourceSignature: signature
  });

  assert.match(first.preview, /^blob:fullscreen-/);
  assert.match(first.full, /^blob:fullscreen-/);
  assert.equal(first.width, 640);
  assert.equal(first.height, 480);
  assert.equal(second.full, first.full);
  assert.equal(reads, 1);
});

test("CRITICAL offline-photos: fullscreen preparation rejects a stale source signature", async () => {
  const objectUrls = createPhotoObjectUrlRegistry({
    createObjectUrl: () => "blob:must-not-be-created",
    revokeObjectUrl: () => {}
  });
  objectUrls.activateScope("id:user-1");
  const coordinator = createOfflinePhotoRenderCoordinator({
    getScopeKey: () => "id:user-1",
    getCachedPhoto: async () => ({
      id: "photo-stale",
      blob: new Blob(["old-full"]),
      fullBlobVerified: true,
      sourceSignature: "old-signature",
      cachePurpose: "offline-remote"
    }),
    objectUrls
  });

  assert.deepEqual(await coordinator.prepareFullscreenSource({
    localId: "photo-stale",
    sourceSignature: "new-signature"
  }), { preview: "", full: "" });
  assert.deepEqual(createPhotoHydrationTask({
    localId: "photo-stale",
    sourceSignature: "new-signature"
  }), {
    key: "photo-stale",
    sourceSignature: "new-signature",
    namespace: "offline-remote",
    cachePurpose: "offline-remote",
    allowUnversionedVerifiedFull: false
  });
});

test("CRITICAL offline-photos: large equal-sized blobs are compared in bounded chunks", async () => {
  const prefix = new Uint8Array(2 * 1024 * 1024);
  const full = new Blob([prefix, new Uint8Array([1])]);
  const thumb = new Blob([prefix, new Uint8Array([2])]);
  assert.equal(await photoBlobsAreDistinct(full, thumb), true);
});

test("CRITICAL offline-photos: a thumbnail-only remote source is cached without a failed original retry", async () => {
  const stored = [];
  let fetchCount = 0;
  const result = await cacheRemotePhotosForOffline({
    items: {
      item1: {
        photos: [{ id: "photo-thumb-only", thumbUrl: "https://api.example.test/thumb-only" }]
      }
    },
    containers: {}
  }, {
    getCachedPhoto: async () => null,
    putCachedPhoto: async (record) => stored.push(record),
    fetchImpl: async () => {
      fetchCount += 1;
      return { ok: true, blob: async () => new Blob(["thumb-only"]) };
    }
  });

  assert.deepEqual(result, { total: 1, cached: 0, downloaded: 1, failed: 0 });
  assert.equal(fetchCount, 1);
  assert.equal(stored.at(-1).fullBlobVerified, false);
  assert.equal(await stored.at(-1).thumbBlob.text(), "thumb-only");
});

test("CRITICAL offline-photos: changing the data scope revokes and isolates card Blob URLs", () => {
  const revoked = [];
  const objectUrls = createPhotoObjectUrlRegistry({
    createObjectUrl: () => "blob:user-1",
    revokeObjectUrl: (url) => revoked.push(url)
  });
  objectUrls.activateScope("id:user-1");
  objectUrls.ensure("photo-1", "signature-1", new Blob(["photo"]));
  objectUrls.setReady(true);

  objectUrls.activateScope("id:user-2");

  assert.deepEqual(revoked, ["blob:user-1"]);
  assert.equal(objectUrls.get("photo-1", "signature-1"), "");
  assert.equal(objectUrls.isReady(), false);
});

test("CRITICAL offline-photos: Bikepacking registry retains separate preview and verified full URLs", () => {
  const created = [];
  const objectUrls = createPhotoObjectUrlRegistry({
    createObjectUrl: () => `blob:variant-${created.push(true)}`,
    revokeObjectUrl: () => {}
  });
  const task = { key: "photo-variants", sourceSignature: "full|thumb|v1" };
  const record = {
    id: task.key,
    sourceSignature: task.sourceSignature,
    thumbBlob: new Blob(["preview"]),
    blob: new Blob(["full"]),
    fullBlobVerified: true
  };
  objectUrls.activateScope("id:user-1");
  objectUrls.setRecord(task, record);
  assert.deepEqual(objectUrls.sources(task.key, task.sourceSignature), {
    preview: "blob:variant-1",
    full: "blob:variant-2"
  });
  assert.equal(objectUrls.getRecord(task), record);
});

test("CRITICAL offline-photos: rehydrating the same source keeps rendered Safari Blob URLs alive", () => {
  const created = [];
  const revoked = [];
  const objectUrls = createPhotoObjectUrlRegistry({
    createObjectUrl: () => `blob:stable-${created.push(true)}`,
    revokeObjectUrl: (url) => revoked.push(url)
  });
  const task = { key: "photo-stable", sourceSignature: "full|thumb|v1" };
  objectUrls.activateScope("id:user-1");
  objectUrls.setRecord(task, {
    id: task.key,
    sourceSignature: task.sourceSignature,
    thumbBlob: new Blob(["preview"]),
    blob: new Blob(["full"]),
    fullBlobVerified: true
  });
  const initialSources = objectUrls.sources(task.key, task.sourceSignature);

  const refreshedRecord = {
    id: task.key,
    sourceSignature: task.sourceSignature,
    thumbBlob: new Blob(["preview"]),
    blob: new Blob(["full"]),
    fullBlobVerified: true
  };
  objectUrls.setRecord(task, refreshedRecord);

  assert.deepEqual(objectUrls.sources(task.key, task.sourceSignature), initialSources);
  assert.equal(objectUrls.getRecord(task), refreshedRecord);
  assert.deepEqual(revoked, []);
  assert.equal(objectUrls.urlCount(), 2);
});

test("CRITICAL offline-photos: a hydrated card advertises its verified full without displaying it as the thumbnail", () => {
  const photo = {
    id: "photo-direct-full",
    url: "https://api.example.test/photo-direct-full/file",
    thumbUrl: "https://api.example.test/photo-direct-full/thumb",
    updatedAt: "v1"
  };
  const [task] = collectOfflinePhotoCacheTasks({
    items: { item1: { photos: [photo] } },
    containers: {}
  });
  const objectUrls = createPhotoObjectUrlRegistry({
    createObjectUrl: (blob) => blob.size === 7 ? "blob:preview" : "blob:verified-full",
    revokeObjectUrl: () => {}
  });
  objectUrls.activateScope("id:user-1");
  objectUrls.setReady(true);
  objectUrls.setRecord(task, {
    id: task.key,
    sourceSignature: task.sourceSignature,
    thumbBlob: new Blob(["preview"]),
    blob: new Blob(["verified-full"]),
    fullBlobVerified: true
  });
  const html = renderPhotoSlide(photo, { photoObjectUrls: objectUrls });
  assert.match(html, /src="blob:preview"/);
  assert.match(html, /data-photo-full-src="blob:verified-full"/);
  assert.match(html, /data-photo-verified-full-src="blob:verified-full"/);
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
  assert.match(copyBlock, /const offlineCopy = isForcedOffline\(\) \|\| !runtime\.currentUser/);
  assert.doesNotMatch(copyBlock, /navigator\?\.onLine/);
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
  let memoryRecord = null;
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
    createObjectUrl: (blob) => `blob:photo-${blob.size}-${fetchCount}`,
    onCachedRecord: async (record) => {
      memoryRecord = record;
      return "blob:memory-full";
    }
  };

  const first = await resolvePhotoLightboxSource(entry, options);
  const afterFirstFetches = fetchCount;
  const reopenedAfterRerender = await resolvePhotoLightboxSource({ ...entry }, options);

  assert.equal(first.isFull, true);
  assert.equal(cached.fullBlobVerified, true);
  assert.equal(cached.sourceSignature, sourceSignature);
  assert.equal(await cached.blob.text(), "full-size");
  assert.equal(memoryRecord, cached);
  assert.equal(first.src, "blob:memory-full");
  assert.equal(first.objectUrl, "");
  assert.equal(reopenedAfterRerender.isFull, true);
  assert.equal(fetchCount, afterFirstFetches);
});

test("CRITICAL offline-photos: lightbox uses shared streamed progress without inventing thumbnail percent", async () => {
  const progress = [];
  const response = (url) => {
    const full = url.endsWith("/file");
    const chunks = full
      ? [new Uint8Array([1, 2]), new Uint8Array([3, 4, 5, 6])]
      : [new Uint8Array([7, 8, 9])];
    let index = 0;
    return {
      ok: true,
      headers: {
        get(name) {
          if (String(name).toLowerCase() === "content-length") return full ? "6" : null;
          if (String(name).toLowerCase() === "content-type") return "image/jpeg";
          return null;
        }
      },
      body: {
        getReader() {
          return {
            async read() {
              return index < chunks.length
                ? { done: false, value: chunks[index++] }
                : { done: true };
            },
            releaseLock() {}
          };
        }
      }
    };
  };
  const result = await resolvePhotoLightboxSource({
    localId: "photo-stream",
    previewSrc: "https://api.example.test/photo-stream/thumb",
    fullSrc: "https://api.example.test/photo-stream/file",
    remoteFullSrc: "https://api.example.test/photo-stream/file",
    remoteThumbSrc: "https://api.example.test/photo-stream/thumb",
    sourceSignature: "file|thumb|v1"
  }, {
    getCachedPhotoForLightbox: async () => null,
    putCachedPhotoForLightbox: async () => {},
    fetchImpl: async (url) => response(url),
    createObjectUrl: () => "blob:streamed-full",
    onDownloadProgress: (value) => progress.push(value)
  });

  assert.equal(result.isFull, true);
  assert.equal(progress.filter((value) => value.variant === "preview").every((value) => value.percent === null), true);
  assert.deepEqual(progress.filter((value) => value.variant === "full").at(-1), {
    variant: "full",
    loaded: 6,
    total: 6,
    percent: 100,
    done: true
  });
});

test("CRITICAL offline-photos: stale verified cache is ignored when offline", async () => {
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

  assert.equal(result.src, "https://api.example.test/photo-stale/thumb");
  assert.equal(result.objectUrl, "");
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
  assert.deepEqual(photoLightboxSizingPresentation({
    naturalWidth: 800,
    naturalHeight: 600,
    availableWidth: 1900,
    availableHeight: 1000
  }), {
    limitAutoUpscale: true,
    width: 800,
    height: 600,
    className: "photo-lightbox-image-no-upscale",
    cssVariables: {
      "--photo-lightbox-natural-width": "800px",
      "--photo-lightbox-natural-height": "600px"
    }
  });
});

test("CRITICAL offline-photos: known dimensions constrain a small fullscreen photo before dialog paint", () => {
  const html = renderPhotoSlide({
    id: "photo-small",
    url: "https://api.example.test/photo-small/file",
    thumbUrl: "https://api.example.test/photo-small/thumb",
    width: 640,
    height: 480
  });
  assert.match(html, /data-photo-width="640" data-photo-height="480"/);

  const source = readProjectFile("src/ui/photo-gallery.js");
  const sizingIndex = source.indexOf("const sizing = photoLightboxSizingPresentation");
  const appendIndex = source.indexOf("document.body.append(overlay)");
  assert.ok(sizingIndex >= 0);
  assert.ok(appendIndex > sizingIndex);
  assert.match(source, /photo-lightbox-image\$\{sizingClass\}/);
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

function photoGalleryTouchHarness() {
  const trackListeners = new Map();
  const buttonListeners = new Map();
  const image = {};
  const button = {
    addEventListener: (type, listener) => buttonListeners.set(type, listener),
    closest: (selector) => selector === "[data-photo-open]" ? button : null,
    querySelector: (selector) => selector === "img" ? image : null
  };
  const track = {
    clientWidth: 300,
    scrollLeft: 0,
    addEventListener: (type, listener) => trackListeners.set(type, listener),
    scrollTo({ left }) {
      this.scrollLeft = left;
    }
  };
  const gallery = {
    dataset: {},
    closest: () => null,
    querySelector: (selector) => selector === ".photo-gallery-track" ? track : null,
    querySelectorAll(selector) {
      if (selector === ".photo-gallery-dot") return [];
      if (selector === "[data-photo-open]") return [button];
      return [];
    }
  };
  const opened = [];
  bindPhotoGalleries({
    querySelectorAll: (selector) => selector === "[data-photo-gallery]" ? [gallery] : []
  }, {
    openLightbox: (sourceImage, options) => opened.push({ options, sourceImage })
  });
  const touch = (x, y, { end = false } = {}) => {
    let prevented = false;
    let stopped = false;
    const point = { clientX: x, clientY: y };
    return {
      target: button,
      touches: end ? [] : [point],
      changedTouches: end ? [point] : [],
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; },
      get prevented() { return prevented; },
      get stopped() { return stopped; }
    };
  };
  return {
    button,
    buttonListeners,
    gallery,
    image,
    opened,
    touch,
    trackListeners
  };
}

test("CRITICAL offline-photos: vendored cache engine matches its versioned manifest", () => {
  const asset = readProjectFile("src/vendor/vniipo-photo-cache-engine.js");
  const manifest = JSON.parse(readProjectFile("src/vendor/vniipo-photo-cache-engine-manifest.json"));
  const adapter = readProjectFile("src/sync/photo-cache-engine.js");
  assert.equal(PHOTO_CACHE_ENGINE_VERSION, "1.0.2");
  assert.equal(PHOTO_CACHE_ENGINE_CONTRACT_VERSION, 1);
  assert.equal(manifest.version, PHOTO_CACHE_ENGINE_VERSION);
  assert.equal(manifest.contractVersion, PHOTO_CACHE_ENGINE_CONTRACT_VERSION);
  assert.equal(createHash("sha256").update(asset).digest("hex"), manifest.sha256);
  assert.equal(manifest.sha256, "3ce28fcc73130a974a92e81f8d988e1af76e223e21d20e541f3e0e8a9bd072ed");
  assert.match(adapter, /from "\.\.\/vendor\/vniipo-photo-cache-engine\.js"/);
  assert.match(adapter, /downloadPhotoBlob/);
  assert.match(adapter, /registerVerifiedPhotoRecord/);
  assert.doesNotMatch(adapter, /function normalizedConcurrency|async function fetchPhotoBlob/);
});

test("CRITICAL offline-photos: vendored gallery matches its 2.1.7 manifest", () => {
  const asset = readProjectFile("src/vendor/vniipo-photo-gallery-fallback.js");
  const manifest = JSON.parse(readProjectFile("src/vendor/vniipo-photo-gallery-manifest.json"));
  assert.equal(manifest.version, "2.1.7");
  assert.equal(manifest.contractVersion, 2);
  assert.equal(createHash("sha256").update(asset).digest("hex"), manifest.sha256);
  assert.equal(manifest.sha256, "863afb93da1328db26e87f4acd1ddcdec0823a362d0423f4104fab8064a3d071");
  assert.match(asset, /fullscreenSourceLifecycle: 1/);
  assert.match(asset, /safeFullscreenImageReplace: 1/);
  assert.match(asset, /fullscreenControlStyles: 1/);
  assert.match(asset, /fullscreenImagePresentation: 1/);
  assert.match(asset, /fullscreenEdgeSettling: 2/);
  assert.match(asset, /fullscreenEdgeRubberBand: 1/);
  assert.match(asset, /function resolveFullscreenImagePresentation\(/);
  assert.match(asset, /function createFullscreenSourceController\(/);
  assert.match(asset, /function replaceFullscreenImageSource\(/);
  assert.match(asset, /const fullscreenControlStyleId = "vniipo-photo-gallery-v2-fullscreen-controls"/);
  assert.match(asset, /ensureFullscreenControlStyles\(doc\)/);
});

test("CRITICAL offline-photos: cached stable 2.0.1 cannot hide the bundled fullscreen lifecycle", async () => {
  const currentRuntime = globalThis.VniipoPhotoGallery;
  globalThis.VniipoPhotoGallery = {
    version: "2.0.1",
    contractVersion: 2,
    helpers: currentRuntime.helpers
  };
  try {
    const committed = [];
    const controller = createSharedFullscreenSourceController({
      entries: [{ previewSrc: "preview", verifiedFullSrc: "blob:full" }],
      getPreviewSource: (entry) => entry.previewSrc,
      getVerifiedFullSource: (entry) => entry.verifiedFullSrc,
      decodeSource: () => true,
      commitSource: ({ src }) => committed.push(src)
    });
    assert.equal(controller.initialSource(0), "blob:full");
    assert.equal((await controller.activate(0)).success, true);
    assert.deepEqual(committed, ["blob:full"]);
    controller.destroy();
  } finally {
    globalThis.VniipoPhotoGallery = currentRuntime;
  }
});

test("CRITICAL offline-photos: cached stable 2.0.1 cannot hide bundled safe image replacement", async () => {
  const currentRuntime = globalThis.VniipoPhotoGallery;
  globalThis.VniipoPhotoGallery = {
    version: "2.0.1",
    contractVersion: 2,
    helpers: currentRuntime.helpers
  };
  const currentImage = {
    isConnected: true,
    replaceWith(replacement) {
      this.isConnected = false;
      replacement.isConnected = true;
    }
  };
  const replacement = {
    src: "",
    currentSrc: "",
    complete: true,
    naturalWidth: 2000,
    isConnected: false,
    removeAttribute: () => {},
    decode: async () => {}
  };
  try {
    const result = await replaceSharedFullscreenImageSource(currentImage, "blob:full", {
      createReplacement: () => replacement,
      loadAndDecode: async (image, src) => {
        image.src = src;
        image.currentSrc = src;
      },
      afterPaint: async () => {}
    });
    assert.equal(result, replacement);
    assert.equal(replacement.isConnected, true);
  } finally {
    globalThis.VniipoPhotoGallery = currentRuntime;
  }
});

test("CRITICAL offline-photos: Bikepacking adapter assigns only its opaque remote namespace", () => {
  const [task] = collectOfflinePhotoCacheTasks({
    items: { item1: { photos: [{ id: "photo-1", url: "https://example.test/photo/file" }] } },
    containers: {}
  });
  assert.equal(task.namespace, "offline-remote");
  assert.equal(task.cachePurpose, "offline-remote");
  assert.equal("blob" in task, false);
  assert.equal("thumbBlob" in task, false);
});

test("CRITICAL offline-photos: fullscreen waits for adapter hydration before creating the dialog", () => {
  const source = readProjectFile("src/ui/photo-gallery.js");
  const awaitIndex = source.indexOf("await prepareFullscreenSource(initialEntry)");
  const dialogIndex = source.indexOf('document.createElement("dialog")');
  assert.ok(awaitIndex >= 0);
  assert.ok(dialogIndex > awaitIndex);
  assert.match(source, /if \(openRequestId !== lightboxOpenRequestId\) return;/);
  assert.match(source, /closePhotoLightbox\(\{ preserveOpenRequest: true \}\)/);
});

test("CRITICAL offline-photos: first stationary touch opens a packing photo during iOS momentum", () => {
  const runtime = globalThis.VniipoPhotoGallery;
  const source = readProjectFile("src/vendor/vniipo-photo-gallery-fallback.js");
  assert.equal(runtime.helpers.resolveSwipe(120, 180, 120, 180, 28).tap, true);
  assert.match(source, /if \(gesture\.tap && ended\.slideIndex >= 0\)[\s\S]{0,180}event\.preventDefault\(\)/);
  assert.match(source, /suppressClickUntil = Date\.now\(\) \+ 600/);
  assert.match(source, /if \(Date\.now\(\) < suppressClickUntil\)/);
});

test("CRITICAL offline-photos: a vertical swipe starting on a packing photo does not open the lightbox", () => {
  const gesture = globalThis.VniipoPhotoGallery.helpers.resolveSwipe(120, 180, 122, 204, 28);
  assert.equal(gesture.vertical, true);
  assert.equal(gesture.horizontal, false);
  assert.equal(gesture.tap, false);
});

test("CRITICAL offline-photos: gallery settling clamps partial and overscrolled edge positions", () => {
  const source = readProjectFile("src/vendor/vniipo-photo-gallery-fallback.js");
  assert.equal(resolvePhotoGallerySnapIndex({
    scrollLeft: -18,
    trackWidth: 300,
    slideCount: 3
  }), 0);
  assert.equal(resolvePhotoGallerySnapIndex({
    scrollLeft: 466,
    trackWidth: 300,
    slideCount: 3
  }), 2);
  assert.equal(resolvePhotoGallerySnapIndex({
    scrollLeft: 638,
    trackWidth: 300,
    slideCount: 3
  }), 2);
  assert.match(source, /const next = clamp\(index, 0, Math\.max\(0, slides\.length - 1\)\)/);
  assert.match(source, /scrollToIndex\(ended\.activeIndex \+ gesture\.direction\)/);
  assert.match(source, /updateDots\(resolveActiveIndex\(track, slides\)\)/);
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

test("CRITICAL offline-photos: lightbox close and side navigation use the shared control style", () => {
  const source = readProjectFile("src/ui/photo-gallery.js");
  const styles = readProjectFile("styles.css");
  const sharedSource = readProjectFile("src/ui/shared-photo-gallery.js");
  const sharedRuntime = readProjectFile("src/vendor/vniipo-photo-gallery-fallback.js");
  assert.match(source, /photo-lightbox-close vpg-fullscreen-control vpg-fullscreen-close/);
  assert.match(source, /photo-lightbox-prev vpg-fullscreen-control vpg-fullscreen-nav[\s\S]*<span aria-hidden="true">/);
  assert.match(source, /photo-lightbox-next vpg-fullscreen-control vpg-fullscreen-nav/);
  assert.match(source, /prevButton\.disabled = activeIndex <= 0/);
  assert.match(source, /nextButton\.disabled = activeIndex >= entries\.length - 1/);
  assert.match(source, /if \(direction < 0 && activeIndex <= 0\) return;/);
  assert.match(styles, /\.photo-lightbox-nav\s*\{[\s\S]*top:\s*50%;[\s\S]*width:\s*46px;[\s\S]*min-height:\s*62px;/);
  assert.doesNotMatch(styles, /\.photo-lightbox-(?:close|nav)\s*\{[^}]*(?:background|border|color):/);
  assert.match(sharedRuntime, /\.vpg-fullscreen-control,\.vpg-fullscreen-close,\.vpg-fullscreen-nav\{[^}]*border:1px solid rgba\(255,255,255,\.28\)[^}]*border-radius:10px[^}]*background:rgba\(8,15,13,\.62\)/);
  assert.match(sharedRuntime, /\.vpg-fullscreen-control,\.vpg-fullscreen-close,\.vpg-fullscreen-nav\{[^}]*color:#fff/);
  assert.match(sharedRuntime, /\.vpg-fullscreen-control:focus-visible/);
  assert.match(sharedSource, /api\?\.capabilities\?\.fullscreenEdgeRubberBand >= 1[\s\S]*fallbackRuntime\?\.createFullscreenSwitcher/);
  assert.match(source, /const bindNavSwipe = \(button\) => \{[\s\S]*track\.scrollLeft = navStartScrollLeft - dx;[\s\S]*navigatePhoto\(baseIndex \+ \(dx < 0 \? 1 : -1\)\);/);
});

test("CRITICAL offline-photos: phone lightbox gives the full screen to swipe and tap-to-close", () => {
  const source = readProjectFile("src/ui/photo-gallery.js");
  const styles = readProjectFile("styles.css");
  assert.match(styles, /@media \(hover:\s*none\) and \(pointer:\s*coarse\)\s*\{[\s\S]*?\.photo-lightbox-nav\s*\{[\s\S]*?display:\s*none;/);
  assert.match(source, /overlay\.addEventListener\("touchstart",[\s\S]*overlay\.addEventListener\("touchmove",[\s\S]*overlay\.addEventListener\("touchend",/);
  assert.match(source, /overlay\.setAttribute\("data-modal-gesture-surface", "true"\)/);
  assert.match(source, /if \(!touchStartedWithPinch && !moved && scale <= 1[\s\S]*close\(\);/);
  assert.match(styles, /\.photo-lightbox-track\s*\{[\s\S]*inset:\s*0;[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;/);
});

test("CRITICAL offline-photos: shared lightbox switches instantly on desktop and keeps mobile scroll-snap", () => {
  const source = readProjectFile("src/ui/photo-gallery.js");
  const sharedSource = readProjectFile("src/ui/shared-photo-gallery.js");
  const sharedRuntime = readProjectFile("src/vendor/vniipo-photo-gallery-fallback.js");
  const styles = readProjectFile("styles.css");
  assert.match(source, /class="photo-lightbox-track"/);
  assert.match(source, /class="photo-lightbox-slide"/);
  assert.match(source, /class="photo-lightbox-dots"[\s\S]*data-photo-lightbox-dot=/);
  assert.match(source, /createSharedFullscreenSwitcher\(\{[\s\S]*root:\s*overlay,[\s\S]*track,[\s\S]*slides:/);
  assert.match(source, /fullscreenSwitcher\?\.goTo\(safeIndex,\s*behavior,\s*false\)/);
  assert.doesNotMatch(source, /track\.scrollTo\(\{\s*left:\s*targetLeft/);
  assert.match(sharedSource, /const CONTRACT_VERSION = 2/);
  assert.match(sharedSource, /createSharedFullscreenSwitcher/);
  assert.match(sharedRuntime, /createFullscreenSwitcher/);
  assert.match(sharedRuntime, /vpg-direct-desktop/);
  assert.match(source, /lightboxDots\.forEach\(\(dot, dotIndex\) => \{[\s\S]*aria-current/);
  assert.match(styles, /\.photo-lightbox-track\s*\{[\s\S]*overflow-x:\s*auto;[\s\S]*scroll-snap-type:\s*x mandatory;/);
  assert.match(styles, /\.photo-lightbox-slide\s*\{[\s\S]*flex:\s*0 0 100%;[\s\S]*scroll-snap-align:\s*center;/);
  assert.match(styles, /\.photo-lightbox-dots\s*\{[\s\S]*position:\s*fixed;/);
});

test("CRITICAL offline-photos: shared helpers and edge settling are available through the cached stable fallback", () => {
  const sharedSource = readProjectFile("src/ui/shared-photo-gallery.js");
  const fallbackSource = readProjectFile("src/vendor/vniipo-photo-gallery-fallback.js");
  const next = stepSharedPhotoInertia({
    x: 10,
    y: -4,
    velocityX: 1,
    velocityY: -0.5,
    elapsedMs: 16
  });

  assert.equal(next.x, 26);
  assert.equal(next.y, -12);
  assert.ok(next.velocityX > 0 && next.velocityX < 1);
  assert.ok(next.velocityY < 0 && next.velocityY > -0.5);
  assert.match(sharedSource, /capabilities\?\.fullscreenImagePresentation >= 1/);
  assert.match(sharedSource, /capabilities\?\.fullscreenEdgeRubberBand >= 1/);
  assert.match(sharedSource, /resolveFullscreenImagePresentation/);
  assert.match(sharedSource, /const fallbackRuntime = runtime\(\)/);
  assert.match(sharedSource, /runtime\(\)\?\.helpers\?\.stepInertia \|\| fallbackRuntime\?\.helpers\?\.stepInertia/);
  assert.match(fallbackSource, /const VERSION = "2\.1\.7"/);
  assert.match(fallbackSource, /function stepInertia\(/);

  const currentRuntime = globalThis.VniipoPhotoGallery;
  globalThis.VniipoPhotoGallery = {
    version: "2.1.4",
    contractVersion: 2,
    capabilities: { fullscreenControlStyles: 1 },
    helpers: { stepInertia: currentRuntime.helpers.stepInertia }
  };
  try {
    assert.deepEqual(resolveSharedFullscreenImagePresentation({
      naturalWidth: 640,
      naturalHeight: 480,
      availableWidth: 1280,
      availableHeight: 960
    }), {
      known: true,
      preventUpscale: true,
      width: 640,
      height: 480
    });
  } finally {
    globalThis.VniipoPhotoGallery = currentRuntime;
  }
});

test("CRITICAL offline-photos: zoomed lightbox pans with bounded cancellable inertia only", () => {
  const source = readProjectFile("src/ui/photo-gallery.js");
  assert.match(source, /PHOTO_LIGHTBOX_INERTIA_DURATION_MS = 650/);
  assert.match(source, /stepSharedPhotoInertia\(\{[\s\S]*requestAnimationFrame\(step\)/);
  assert.match(source, /scale <= 1 \|\| reducedMotion/);
  assert.match(source, /if \(panX !== steppedX\) panVelocityX = 0;[\s\S]*if \(panY !== steppedY\) panVelocityY = 0;/);
  assert.match(source, /targetImage\.addEventListener\("pointerdown",[\s\S]*cancelPanInertia\(\)/);
  assert.match(source, /overlay\.addEventListener\("wheel",[\s\S]*cancelPanInertia\(\)/);
  assert.match(source, /overlay\.addEventListener\("touchstart",[\s\S]*cancelPanInertia\(\)/);
  assert.match(source, /lightboxResizeHandler = \(\) => \{[\s\S]*apply\(\)/);
  assert.match(source, /const close = \(\) => \{[\s\S]*cancelPanInertia\(false\)/);
});

test("CRITICAL offline-photos: shared thumbnails contain and interrupted edge swipes settle", () => {
  const fallbackSource = readProjectFile("src/vendor/vniipo-photo-gallery-fallback.js");
  const styles = readProjectFile("styles.css");
  assert.match(fallbackSource, /\.vpg-slide>img,\.vpg-slide img\{[^}]*object-fit:contain;[^}]*background:var\(--vpg-image-background,#fff\)/);
  assert.match(fallbackSource, /if \(gesture\.moved\) \{[\s\S]{0,160}scrollToIndex\(resolveActiveIndex\(track, slides\)\)/);
  assert.match(fallbackSource, /listen\(track, "touchcancel",[\s\S]{0,180}scrollToIndex\(resolveActiveIndex\(track, slides\)\)/);
  assert.match(styles, /\.item-photo img,[\s\S]{0,180}object-fit:\s*contain;/);
  assert.doesNotMatch(styles, /\.vpg-slide[^}]*object-fit:\s*cover/);
});

test("CRITICAL offline-photos: inline and fullscreen edges share rubber-band without delayed normal-swipe snapping", () => {
  const fallbackSource = readProjectFile("src/vendor/vniipo-photo-gallery-fallback.js");
  const sharedSource = readProjectFile("src/ui/shared-photo-gallery.js");
  assert.equal((fallbackSource.match(/createEdgeRubberBandController\(\{/g) || []).length, 2);
  assert.match(fallbackSource, /function bindGallery\(gallery, options\)[\s\S]*edgeRubberBand = createEdgeRubberBandController\(\{[\s\S]*getSlides: \(\) => slides/);
  assert.match(fallbackSource, /track\?\.addEventListener\?\.\("touchmove", onTouchMove, \{ passive: false \}\)/);
  assert.match(fallbackSource, /vpg-edge-rubber-band-returning/);
  assert.doesNotMatch(fallbackSource, /\[180, 420\]/);
  assert.match(sharedSource, /capabilities\?\.fullscreenEdgeRubberBand >= 1/);
});

test("CRITICAL offline-photos: lightbox backdrop closes without stealing side navigation clicks", () => {
  const source = readProjectFile("src/ui/photo-gallery.js");
  assert.match(source, /event\.target === overlay \|\| event\.target\?\.classList\?\.contains\("photo-lightbox-slide"\)/);
  assert.match(source, /function bindPhotoLightboxNavButton\(button, onClick\)[\s\S]*event\.stopPropagation\(\);/);
  assert.match(source, /targetImage\.addEventListener\("click", \(event\) => \{[\s\S]*event\.preventDefault\(\);\s*close\(\);/);
});

test("CRITICAL offline-photos: packing gallery dots stay above iOS scrolling layers", () => {
  const styles = readProjectFile("styles.css");
  const html = renderItemPhotoHtml({
    photos: [
      { id: "photo-a", url: "https://example.test/a.jpg" },
      { id: "photo-b", url: "https://example.test/b.jpg" },
      { id: "photo-c", url: "https://example.test/c.jpg" }
    ]
  }, { force: true });
  const singlePhotoHtml = renderItemPhotoHtml({
    photos: [{ id: "photo-a", url: "https://example.test/a.jpg" }]
  }, { force: true });
  assert.equal((html.match(/class="photo-gallery-dot /g) || []).length, 3);
  assert.match(html, /item-photo-has-dots/);
  assert.doesNotMatch(singlePhotoHtml, /item-photo-has-dots/);
  assert.match(styles, /\.item-photo\s*\{[\s\S]*isolation:\s*isolate;/);
  assert.match(styles, /\.photo-gallery-track\s*\{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*1;/);
  assert.match(styles, /\.item-photo\.item-photo-has-dots \.photo-gallery-track\s*\{[\s\S]*height:\s*calc\(100% - 22px\);/);
  assert.match(styles, /\.photo-gallery-dots\s*\{[\s\S]*bottom:\s*0;[\s\S]*z-index:\s*10;[\s\S]*min-height:\s*22px;[\s\S]*translate3d\(-50%,\s*0,\s*0\);[\s\S]*backface-visibility:\s*hidden;/);
  assert.match(styles, /\.photo-gallery-dot\s*\{[\s\S]*width:\s*12px;[\s\S]*height:\s*22px;[\s\S]*margin:\s*0;[\s\S]*appearance:\s*none;/);
  assert.match(styles, /\.photo-gallery-dot-mark\s*\{[\s\S]*width:\s*8px;[\s\S]*height:\s*8px;[\s\S]*border:\s*1px solid[\s\S]*pointer-events:\s*none;/);
  assert.match(styles, /\.photo-gallery-dot\.active \.photo-gallery-dot-mark\s*\{[\s\S]*background:\s*var\(--accent\);/);
  assert.doesNotMatch(styles, /\.photo-gallery-dot::before/);
});

test("CRITICAL offline-photos: long galleries keep a centered compact dot window with arrows and counter", () => {
  assert.deepEqual(photoGalleryVisibleDotIndexes(12, 0), [0, 1, 2, 3, 4]);
  assert.deepEqual(photoGalleryVisibleDotIndexes(12, 6), [4, 5, 6, 7, 8]);
  assert.deepEqual(photoGalleryVisibleDotIndexes(12, 11), [7, 8, 9, 10, 11]);
  const html = renderPhotoDots(12, 6);
  assert.match(html, /photo-gallery-dots-compact/);
  assert.match(html, /data-photo-step="-1"/);
  assert.match(html, /data-photo-step="1"/);
  assert.match(html, /data-photo-counter[^>]*>7 \/ 12</);
  assert.equal((html.match(/data-photo-index=/g) || []).length, 12);
  assert.equal((html.match(/data-vpg-dot[^>]* hidden/g) || []).length, 7);
});

test("CRITICAL offline-photos: fullscreen photos force carousel mode on phones only", () => {
  assert.equal(photoLightboxUsesTouchCarousel({ coarsePointer: true, viewportWidth: 390 }), true);
  assert.equal(photoLightboxUsesTouchCarousel({ maxTouchPoints: 5, viewportWidth: 390 }), true);
  assert.equal(photoLightboxUsesTouchCarousel({ touchEventCapable: true, viewportWidth: 390 }), true);
  assert.equal(photoLightboxUsesTouchCarousel({ phoneDevice: true, viewportWidth: 932 }), true);
  assert.equal(photoLightboxUsesTouchCarousel({ maxTouchPoints: 5, viewportWidth: 1280 }), false);
  assert.equal(photoLightboxUsesTouchCarousel({ maxTouchPoints: 0, viewportWidth: 390 }), false);
  assert.equal(fullscreenSwitcherMatchesRequestedMode({ directDesktop: false }, false), true);
  assert.equal(fullscreenSwitcherMatchesRequestedMode({ directDesktop: true }, false), false);
  const source = readProjectFile("src/ui/photo-gallery.js");
  assert.match(source, /track\.addEventListener\("scroll",[\s\S]*if \(touchCarousel\) return;/);
  assert.match(source, /if \(!touchCarousel && !touchStartedWithPinch && moved && scale <= 1/);
});

test("CRITICAL offline-photos: fullscreen pinch keeps its scale while the viewport and full source settle", () => {
  const source = readProjectFile("src/ui/photo-gallery.js");
  const styles = readProjectFile("styles.css");
  assert.match(source, /photo-lightbox-touch-carousel/);
  assert.match(source, /if \(lifecycleResult\.success\) \{[\s\S]*updatePhotoLightboxAutoSize\(image, overlay\);[\s\S]*apply\(\);/);
  assert.match(source, /lightboxResizeHandler = \(\) => \{[\s\S]*updatePhotoLightboxAutoSize\(image, overlay\);[\s\S]*apply\(\);/);
  assert.doesNotMatch(source, /lightboxResizeHandler = \(\) => \{[\s\S]*?resetTransform\(\);/);
  assert.match(styles, /photo-lightbox-touch-carousel[\s\S]*photo-lightbox-track:not\(\.photo-lightbox-track-zoomed\)[\s\S]*scroll-snap-type:\s*x mandatory !important/);
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
  assert.match(source, /const activation = sourceController\?\.activate\(nextIndex\)[\s\S]*const displaySrc = sourceController\?\.initialSource\(nextIndex\) \|\| previewSrc;[\s\S]*image\.src = displaySrc;/);
  assert.match(source, /const decodeLifecycleSource = async[\s\S]*await loadAndDecodeSharedFullscreenImage\(replacement, src, \{ signal \}\);/);
  assert.match(source, /sharedFullscreenImageUsesSource\(replacement, src\)/);
  assert.match(source, /const commitLifecycleSource = async[\s\S]*await replacePhotoLightboxImageSource\(currentImage, src,[\s\S]*replacement === currentImage[\s\S]*createReplacement: \(\) => replacement/);
  assert.match(source, /return replaceSharedFullscreenImageSource\(currentImage, src, options\);/);
  assert.match(readProjectFile("src/ui/shared-photo-gallery.js"), /fallbackRuntime\?\.replaceFullscreenImageSource/);
  assert.match(source, /decodeSource: decodeLifecycleSource,[\s\S]*commitSource: commitLifecycleSource/);
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
  assert.match(source, /const readyFullSrc = entry\?\.verifiedFullSrc \|\| entry\?\.resolvedFullSrc \|\| "";/);
  assert.match(source, /image\.dataset\.photoLightboxQuality = readyFullSrc \? "full" : "preview";/);
  assert.match(source, /entry\.resolvedFullSrc = src;/);
  assert.match(source, /decodedPhotoLightboxSources\.add\(src\);/);
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
