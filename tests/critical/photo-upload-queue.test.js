import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ensurePhotoDraftEntityId,
  markPhotoUploadBatch,
  normalizeItemPhotos,
  photoDraftUploadEntity,
  photoUploadBatchSummary,
  syncPhotoRecordFromUpload
} from "../../src/state/item-photos.js";
import {
  uploadPhotoBatchQueue,
  uploadPhotoWithOneRetry
} from "../../src/sync/photo-upload-queue.js";
import {
  photoDialogStatusText,
  photoUploadProgressState,
  renderItemPhotoHtml,
  renderPhotoUploadProgress
} from "../../src/ui/photo-gallery.js";

test("CRITICAL photo upload: a new record reserves one stable id for upload and save", () => {
  const draft = { photos: [] };
  const first = ensurePhotoDraftEntityId(draft, "item", {
    now: () => 123,
    random: () => 0.5
  });
  const second = ensurePhotoDraftEntityId(draft, "item", {
    now: () => 999,
    random: () => 0.9
  });
  assert.equal(first, "item-123-80000000");
  assert.equal(second, first);
  assert.equal(photoDraftUploadEntity(draft, null, "item").id, first);

  const saveSource = readFileSync(new URL("../../src/ui/item-dialog-save.js", import.meta.url), "utf8");
  const controllerSource = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
  assert.match(saveSource, /const id = createItemId\(\)/);
  assert.match(saveSource, /const id = createRootContainerId\(\)/);
  assert.match(controllerSource, /createItemId: runtime\.itemDialogPhotoDraft/);
  assert.match(controllerSource, /createRootContainerId: runtime\.rootContainerDialogPhotoDraft/);
});

test("CRITICAL photo upload: batch position survives normalization without entering sync payload", () => {
  const photos = [
    { id: "photo-1", status: "synced", url: "/photo-1" },
    { id: "photo-2", status: "uploading", uploadProgress: 37 },
    { id: "photo-3", status: "pending" }
  ];
  markPhotoUploadBatch(photos, { batchId: "batch-1" });
  const normalized = normalizeItemPhotos({ photos });
  const summary = photoUploadBatchSummary(normalized);

  assert.equal(summary.index, 2);
  assert.equal(summary.total, 3);
  assert.equal(summary.uploaded, 1);
  assert.equal(normalized[1].uploadProgress, 37);
  assert.equal(JSON.stringify(normalized).includes("uploadBatchId"), false);
  assert.equal(JSON.stringify(normalized).includes("uploadProgress"), false);
});

test("CRITICAL photo upload: dialog progress is mirrored into the saved card record", () => {
  const source = { id: "photo-1", localId: "local-1", status: "uploading", uploadProgress: 64 };
  markPhotoUploadBatch([source], { batchId: "batch-mirror" });
  const record = {
    id: "item-1",
    photos: [{ id: "photo-1", localId: "local-1", status: "pending" }]
  };

  const target = syncPhotoRecordFromUpload(record, source);
  assert.equal(target.status, "uploading");
  assert.equal(target.uploadProgress, 64);
  assert.equal(target.uploadBatchId, "batch-mirror");
});

test("CRITICAL photo upload: one failed file does not stop the rest of the batch", async () => {
  const photos = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const completed = [];
  const result = await uploadPhotoBatchQueue(photos, {
    concurrency: 2,
    uploadPhoto: async (photo) => {
      if (photo.id === "b") throw new Error("broken");
      completed.push(photo.id);
      return true;
    }
  });

  assert.equal(result.attempted, 3);
  assert.equal(result.uploaded, true);
  assert.equal(result.errors.length, 1);
  assert.deepEqual(completed.sort(), ["a", "c"]);
  assert.equal(photos[1].status, "error");
});

test("CRITICAL photo upload: a temporary iPhone failure is retried once", async () => {
  const photo = { id: "photo-1" };
  const attempts = [];
  const result = await uploadPhotoWithOneRetry(photo, {
    retryDelayMs: 0,
    uploadPhotoAttempt: async (candidate, options) => {
      attempts.push(options);
      if (options.attempt === 1) candidate.uploadRetryPending = true;
      return options.attempt === 2;
    }
  });

  assert.equal(result, true);
  assert.deepEqual(attempts, [
    { attempt: 1, retryTemporaryUploadFailure: true },
    { attempt: 2, retryTemporaryUploadFailure: false }
  ]);
});

test("CRITICAL photo upload: every gallery slide owns its progress indicator", () => {
  const photos = [
    { id: "photo-1", localId: "photo-1", status: "uploading", uploadProgress: 22 },
    { id: "photo-2", localId: "photo-2", status: "uploading", uploadProgress: 67 }
  ];
  markPhotoUploadBatch(photos, { batchId: "batch-slides" });
  const html = renderItemPhotoHtml({ id: "item-1", photos }, { force: true });

  assert.equal((html.match(/photo-upload-progress/g) || []).length, 2);
  assert.match(html, /--photo-upload-angle: 79deg[\s\S]*?<span>22<\/span>/);
  assert.match(html, /--photo-upload-angle: 241deg[\s\S]*?<span>67<\/span>/);
  assert.ok(html.indexOf("photo-upload-progress") < html.indexOf("photo-gallery-dots"));
});

test("CRITICAL photo upload: the batch label names the current photo in both languages", () => {
  const previousDocument = globalThis.document;
  const photos = [
    { id: "photo-1", status: "synced", url: "/photo-1" },
    { id: "photo-2", status: "uploading", uploadProgress: 41 },
    { id: "photo-3", status: "pending" }
  ];
  markPhotoUploadBatch(photos, { batchId: "batch-label" });
  try {
    globalThis.document = { documentElement: { lang: "ru" } };
    assert.equal(photoDialogStatusText(photos), "Загрузка фото 2 из 3");
    globalThis.document = { documentElement: { lang: "en" } };
    assert.equal(photoDialogStatusText(photos), "Uploading photo 2 of 3");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("CRITICAL photo upload: a confirmed slide replaces 100 percent with an uploaded badge", () => {
  const photo = { id: "photo-1", status: "synced", url: "/photo-1" };
  markPhotoUploadBatch([photo], { batchId: "batch-complete" });
  const state = photoUploadProgressState(photo, { showCompletedBatchProgress: true });
  const html = renderPhotoUploadProgress(state);

  assert.deepEqual(state, { active: true, progress: 100, complete: true });
  assert.match(html, /photo-upload-complete/);
  assert.doesNotMatch(html, /photo-upload-progress/);
});

test("CRITICAL photo upload: progress stays in the gallery instead of a fixed header", () => {
  const controllerSource = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
  const gallerySource = readFileSync(new URL("../../src/ui/photo-gallery.js", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

  assert.match(controllerSource, /markPhotoUploadBatch\(result\.accepted\)/);
  assert.match(controllerSource, /photoDraftUploadEntity\(draft, null, "item"\)/);
  assert.match(controllerSource, /photoDraftUploadEntity\(draft, null, "container"\)/);
  assert.match(controllerSource, /uploadPhotoBatchQueue\(eligiblePhotos/);
  assert.match(gallerySource, /slide\.append\(nextProgress\)/);
  assert.match(stylesSource, /\.photo-gallery-slide\s*\{[^}]*position:\s*relative;/s);
  assert.match(stylesSource, /\.photo-gallery-dots\s*\{[^}]*z-index:\s*10;/s);
  assert.doesNotMatch(stylesSource, /\.photo-upload-progress\s*\{[^}]*position:\s*fixed;/s);
});

test("recent completed photos retain badges across trip, item and bag editor save snapshots", async () => {
  const { createPhotoDraftFromRecord } = await import("../../src/state/item-photos.js");
  const { applyLayoutTrips, layoutTripsSnapshot } = await import("../../src/state/layout-trips.js");
  const { renderPhotoGalleryHtml } = await import("../../src/ui/photo-gallery.js");
  for (const kind of ["layout", "item", "container"]) {
    const oldPhoto = { id: "old", status: "synced", url: "/old" };
    const photos = Array.from({ length: 10 }, (_, i) => ({
      id: String(i), localId: String(i), status: i < 5 ? "synced" : "pending",
      ...(i < 5 ? { url: "/photo-" + i } : {})
    }));
    // A completed first picker batch must remain visible while the next uploads.
    markPhotoUploadBatch(photos.slice(0, 5), { batchId: "first" });
    markPhotoUploadBatch(photos.slice(5), { batchId: "second" });
    const record = { id: kind, photos: [oldPhoto], trips: [{ id: "trip", name: "Trip" }] };
    if (kind === "layout") {
      applyLayoutTrips(record, [{ id: "trip", name: "Trip", photos: [oldPhoto, ...photos] }]);
    } else {
      const draft = createPhotoDraftFromRecord(record);
      draft.photos.push(...photos);
      record.photos = [...draft.photos];
    }
    const html = kind === "layout"
      ? await renderPhotoGalleryHtml(layoutTripsSnapshot(record)[0].photos)
      : renderItemPhotoHtml(record);
    assert.equal((html.match(/class="photo-upload-complete"/g) || []).length, 5, kind);
    assert.equal((html.match(/class="photo-upload-progress"/g) || []).length, 5, kind);
    // Completing later uploads must not change badges on already uploaded photos.
    for (const photo of photos.slice(5)) {
      Object.assign(photo, { status: "synced", url: "/photo-" + photo.id });
      syncPhotoRecordFromUpload(record, photo);
    }
    // Reopen and edit: snapshots must keep ephemeral status without leaking it into sync.
    const draft = createPhotoDraftFromRecord(record);
    record.photos = [...draft.photos];
    const complete = kind === "layout"
      ? await renderPhotoGalleryHtml(layoutTripsSnapshot(record)[0].photos)
      : renderItemPhotoHtml(record);
    assert.equal((complete.match(/class="photo-upload-complete"/g) || []).length, 10, kind);
    assert.doesNotMatch(JSON.stringify(record), /uploadBatch|uploadProgress/);
    assert.equal(record.photos[0].uploadBatchId, undefined);
  }
});
