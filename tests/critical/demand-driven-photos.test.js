import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createPhotoDownloadCoordinator,
  PHOTO_DOWNLOAD_PRIORITY
} from "../../src/sync/photo-download-coordinator.js";
import {
  createDemandDrivenPhotoPreviewLoader,
  renderPhotoSlide
} from "../../src/ui/photo-gallery.js";

const projectFile = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const deferred = () => {
  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
};

function fakeImage(id = "photo-1") {
  const classes = new Set();
  const status = { hidden: false, textContent: "" };
  const host = {
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    },
    querySelector: () => status
  };
  return {
    dataset: {
      photoLocalId: id,
      photoSourceSignature: "full|thumb|v1",
      photoRemoteThumbSrc: "https://api.example.test/photo/thumb?v=1",
      photoRemoteFullSrc: "https://api.example.test/photo/file?v=1"
    },
    isConnected: true,
    src: "",
    closest: () => host,
    setAttribute() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 100, bottom: 100 }),
    classes,
    status
  };
}

async function waitFor(predicate, attempts = 20) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  }
  assert.fail("Timed out waiting for photo task");
}

test("CRITICAL demand-driven photos: cards expose no network source before intersection", () => {
  const html = renderPhotoSlide({
    id: "photo-hidden",
    url: "https://api.example.test/photo-hidden/file",
    thumbUrl: "https://api.example.test/photo-hidden/thumb",
    updatedAt: "v1"
  });

  assert.doesNotMatch(html, /\n\s+src="https?:/);
  assert.match(html, /data-photo-remote-thumb-src="https:\/\/api\.example\.test\/photo-hidden\/thumb\?v=v1"/);
  assert.match(html, /data-photo-preview-status/);
});

test("CRITICAL demand-driven photos: only intersecting previews load and duplicate cards share the request", async () => {
  let observerCallback = null;
  let observedOptions = null;
  let cacheReads = 0;
  let downloads = 0;
  const records = new Map();
  const images = [fakeImage(), fakeImage()];
  const registry = {
    get: () => "",
    sources: (id) => records.has(id) ? { preview: `blob:${id}` } : { preview: "" },
    setRecord: (task, record) => records.set(task.key, record)
  };
  const loader = createDemandDrivenPhotoPreviewLoader({
    photoObjectUrls: registry,
    getCachedPhotoForPreview: async () => {
      cacheReads += 1;
      return null;
    },
    putCachedPhotoForPreview: async () => {},
    downloadCoordinator: {
      download: async (url) => {
        downloads += 1;
        assert.match(url, /\/thumb\?v=1$/);
        return new Blob(["preview"], { type: "image/jpeg" });
      }
    },
    intersectionObserverFactory: (callback, options) => {
      observerCallback = callback;
      observedOptions = options;
      return { observe() {}, unobserve() {}, disconnect() {} };
    }
  });

  await loader.observe({ querySelectorAll: () => images });
  assert.equal(downloads, 0);
  assert.deepEqual(observedOptions, { rootMargin: "0px", threshold: 0.01 });

  observerCallback(images.map((target) => ({ target, isIntersecting: false })));
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  assert.equal(downloads, 0);

  observerCallback(images.map((target) => ({ target, isIntersecting: true })));
  await waitFor(() => images.every((image) => image.src === "blob:photo-1"));
  assert.equal(cacheReads, 1);
  assert.equal(downloads, 1);
  assert.equal(images[0].classes.has("photo-preview-ready"), true);
  assert.equal(images[0].status.hidden, true);
});

test("CRITICAL demand-driven photos: coordinator deduplicates identical URLs", async () => {
  const gate = deferred();
  let calls = 0;
  const coordinator = createPhotoDownloadCoordinator({
    download: async () => {
      calls += 1;
      await gate.promise;
      return new Blob(["photo"]);
    }
  });
  const first = coordinator.download("/photo.jpg");
  const second = coordinator.download("/photo.jpg");
  gate.resolve();
  const [left, right] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(left, right);
});

test("CRITICAL demand-driven photos: opened photos overtake a one-file background queue", async () => {
  const started = [];
  const gates = new Map();
  const coordinator = createPhotoDownloadCoordinator({
    maxConcurrent: 1,
    maxBackground: 1,
    download: (url) => {
      started.push(url);
      const gate = deferred();
      gates.set(url, gate);
      return gate.promise.then(() => new Blob([url]));
    }
  });
  const blocker = coordinator.download("blocker", { priority: PHOTO_DOWNLOAD_PRIORITY.VISIBLE_PREVIEW });
  await Promise.resolve();
  const offline = coordinator.download("offline", { priority: PHOTO_DOWNLOAD_PRIORITY.OFFLINE, background: true });
  const opened = coordinator.download("opened", { priority: PHOTO_DOWNLOAD_PRIORITY.OPEN_PHOTO });
  gates.get("blocker").resolve();
  await waitFor(() => started.length === 2);
  assert.deepEqual(started, ["blocker", "opened"]);
  gates.get("opened").resolve();
  await waitFor(() => started.length === 3);
  gates.get("offline").resolve();
  await Promise.all([blocker, offline, opened]);
});

test("CRITICAL demand-driven photos: app does not auto-cache and lightbox does not prefetch neighbors", () => {
  const app = projectFile("app.js");
  const gallery = projectFile("src/ui/photo-gallery.js");
  assert.doesNotMatch(app, /offlinePhotoCacheController\.schedule\(/);
  assert.doesNotMatch(app, /offlinePhotoRenderCoordinator\.prepare\(/);
  assert.match(gallery, /prefetchAdjacent:\s*false/);
  assert.match(gallery, /entryIndex === initialIndex \? \(directFullSrc \|\| previewSrc\) : ""/);
});
