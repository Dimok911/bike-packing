import test from "node:test";
import assert from "node:assert/strict";
import { applyLayoutMedia, layoutMediaSnapshot, normalizeLayoutVideoUrl } from "../../src/state/layout-media.js";
import { compactLayoutForEntitySync } from "../../src/sync/serialize.js";
import { getUploadablePhotoEntries } from "../../src/sync/photo-upload-scope.js";
import { collectStatePhotoRefs } from "../../src/backup/archive.js";
import { normalizeItemPhotos } from "../../src/state/item-photos.js";
import { collectOfflinePhotoCacheTasks } from "../../src/sync/offline-photo-cache.js";
import { isMeaningfulPackingState, isSuspiciousEmptyPackingState } from "../../src/state/diagnostics.js";
import { resolvePreferredLayoutId } from "../../src/state/layout-choice.js";

test("layout media edits are isolated until save, including ordering and removal", () => {
  const layout = { id: "layout-a", notes: "Keep notes", photos: [{ id: "a", caption: "Bike" }, { id: "b", caption: "Bags" }] };
  const draft = layoutMediaSnapshot(layout);
  draft.photos.reverse();
  draft.photos[0].caption = "Packed bags";
  assert.equal(layout.photos[0].id, "a");
  assert.equal(layout.photos[1].caption, "Bags");
  assert.equal(applyLayoutMedia(layout, draft), true);
  assert.equal(layout.photos[0].caption, "Packed bags");
  assert.equal(layout.notes, "Keep notes");
  assert.equal(applyLayoutMedia(layout, draft), false);
  applyLayoutMedia(layout, { photos: [], videoUrl: "" });
  assert.equal(layout.photos, undefined);
});

test("only web video links are accepted", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "https://user:secret@example.org", "not a link"]) {
    assert.equal(normalizeLayoutVideoUrl(value), "");
  }
  assert.equal(normalizeLayoutVideoUrl(" https://youtu.be/example "), "https://youtu.be/example");
});

test("a layout with only media is not discarded as an empty state", () => {
  const state = { items: {}, containers: {}, layouts: { trip: { id: "trip", photos: [{ id: "p" }] } } };
  assert.equal(isMeaningfulPackingState(state), true);
  assert.equal(isSuspiciousEmptyPackingState(state), false);
  assert.equal(resolvePreferredLayoutId(state, "trip"), "trip");
});

test("saving a caption retains a photo upload completed while the editor was open", () => {
  const layout = { photos: [{ id: "p", localId: "p", status: "pending" }] };
  const draft = layoutMediaSnapshot(layout);
  Object.assign(layout.photos[0], { status: "synced", url: "https://example.org/p.jpg" });
  draft.photos[0].caption = "Packed";
  applyLayoutMedia(layout, draft);
  assert.equal(layout.photos[0].status, "synced");
  assert.equal(layout.photos[0].url, "https://example.org/p.jpg");
  assert.equal(layout.photos[0].caption, "Packed");
});

test("captions and order survive synchronization, backup and offline cache discovery", () => {
  const photos = [{ id: "b", caption: "Packed", url: "https://example.org/b.jpg", thumbUrl: "https://example.org/b-small.jpg" }, { id: "a", caption: "Unpacked", url: "https://example.org/a.jpg" }];
  const layout = { id: "layout-a", photos, videoUrl: "https://youtu.be/example" };
  const compact = compactLayoutForEntitySync(layout);
  assert.deepEqual(compact.photos.map((photo) => [photo.id, photo.caption]), [["b", "Packed"], ["a", "Unpacked"]]);
  const state = { layouts: { "layout-a": layout }, items: {}, containers: {} };
  assert.equal(collectStatePhotoRefs(state, normalizeItemPhotos).filter((ref) => ref.entityType === "layout").length, 2);
  assert.equal(collectOfflinePhotoCacheTasks(state).length, 2);
});

test("photo uploads are scoped to the requested layout and skip public layouts in private sync", () => {
  const record = (id, extra = {}) => ({ id, rootContainerIds: [], photos: [{ id: `photo-${id}`, localId: `photo-${id}`, status: "pending" }], ...extra });
  const state = { layouts: { a: record("a"), b: record("b"), c: record("c", { adminDemo: true }) }, items: {}, containers: {} };
  assert.deepEqual(getUploadablePhotoEntries(state, { layoutId: "a" }).map((entry) => [entry.entityType, entry.entity.id]), [["layout", "a"]]);
  assert.deepEqual(getUploadablePhotoEntries(state).map((entry) => entry.entity.id), ["a", "b"]);
});
