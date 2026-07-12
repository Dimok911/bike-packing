import test from "node:test";
import assert from "node:assert/strict";
import {
  adminBackupPayloads,
  backupDownloadName,
  buildBackupPhotoEntries,
  buildCurrentBackupManifest,
  createBackupZip
} from "../../src/backup/archive.js";
import {
  backupAdminTemplateRows,
  backupRestoreComposition,
  restoreBackupAdminTemplates
} from "../../src/backup/admin-restore.js";

function payload(name, photoId = "") {
  return {
    activeLayoutId: `layout-${name}`,
    layouts: { [`layout-${name}`]: { id: `layout-${name}`, name, rootContainerIds: [] } },
    items: photoId ? { "item-a": { id: "item-a", name: "Item", photos: [{ id: photoId }] } } : {},
    containers: {}
  };
}

test("CRITICAL backup archive: filename uses browser-local date and progress reports photo and ZIP totals", async () => {
  const localDate = new Date(2026, 6, 12, 15, 4, 5);
  assert.equal(backupDownloadName(localDate), "bike-packing-2026-07-12-15-04-05.bikepacking-backup.zip");

  const photoProgress = [];
  const photoResult = await buildBackupPhotoEntries(payload("Private", "photo-a"), {
    normalizePhotos: (entity) => Array.isArray(entity?.photos) ? entity.photos : [],
    fetchPhotoBlob: async () => new Blob(["photo"]),
    onProgress: (entry) => photoProgress.push([entry.current, entry.total])
  });
  const zipProgress = [];
  await createBackupZip({ ok: true }, photoResult.entries, {
    onProgress: (entry) => zipProgress.push([entry.current, entry.total])
  });

  assert.deepEqual(photoProgress, [[0, 1], [1, 1]]);
  assert.deepEqual(zipProgress.at(-1), [3, 3]);
});

test("CRITICAL backup analysis: logical total excludes technical drafts and includes public templates", () => {
  const backupState = {
    layouts: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`layout-${index}`, { id: `layout-${index}` }]))
  };
  const personalRows = Array.from({ length: 3 }, (_, index) => ({ layout: { id: `personal-${index}` } }));
  const adminRows = [
    { type: "demo" }, { type: "demo" }, { type: "shared" }, { type: "shared" }
  ];

  assert.deepEqual(backupRestoreComposition(backupState, personalRows, adminRows), {
    rawLayoutCount: 6,
    personalLayoutCount: 3,
    publicTemplateCount: 4,
    demoTemplateCount: 2,
    sharedTemplateCount: 2,
    technicalDraftCount: 3,
    logicalRestoreCount: 7
  });
});

test("CRITICAL backup admin: manifest keeps every demo and shared template by language", () => {
  const demoPayloads = new Map([
    ["demo-ru-a", payload("Demo RU A")],
    ["demo-ru-b", payload("Demo RU B")],
    ["demo-en-a", payload("Demo EN A")]
  ]);
  const sharedRu = { id: "shared-ru", name: "Shared RU", language: "ru", statePayload: payload("Shared RU") };
  const sharedEn = { id: "shared-en", name: "Shared EN", language: "en", statePayload: payload("Shared EN") };
  const currentDemoTemplates = () => [
    { listId: "demo-ru-a", name: "Demo RU A", language: "ru" },
    { listId: "demo-ru-b", name: "Demo RU B", language: "ru" },
    { listId: "demo-en-a", name: "Demo EN A", language: "en" }
  ];
  const demoStatePayloadForLanguage = (language, listId) => demoPayloads.get(listId) || demoPayloads.get(language === "en" ? "demo-en-a" : "demo-ru-a");
  const currentSharedLayouts = (language) => language === "en" ? [sharedEn] : [sharedRu];
  const manifest = buildCurrentBackupManifest({
    canIncludeAdmin: true,
    currentDemoTemplates,
    currentSharedLayouts,
    demoStatePayloadForLanguage,
    languages: ["ru", "en"],
    snapshot: payload("Private")
  });
  const snapshots = adminBackupPayloads({ currentDemoTemplates, currentSharedLayouts, demoStatePayloadForLanguage, languages: ["ru", "en"] });
  const rows = backupAdminTemplateRows(manifest);

  assert.equal(manifest.data.admin.demoTemplates.length, 3);
  assert.deepEqual(rows.map((row) => row.key), [
    "demo:demo-en-a", "demo:demo-ru-a", "demo:demo-ru-b", "shared:shared-en", "shared:shared-ru"
  ]);
  assert.equal(snapshots.length, 5);
});

test("CRITICAL backup admin: selected restore primes, uploads photos, and publishes final payload", async () => {
  const rows = [{
    key: "demo:demo-ru-a", type: "demo", id: "demo-ru-a", listId: "demo-ru-a",
    language: "ru", name: "Demo RU", description: "", payload: payload("Demo RU", "photo-a")
  }];
  const requests = [];
  const cached = [];
  const progress = [];
  const restored = await restoreBackupAdminTemplates({
    apiFetch: async (path, options) => {
      requests.push({ path, body: JSON.parse(options.body) });
      return { ok: true };
    },
    apiUploadFormData: async () => ({}),
    demoAdminPathForPublicListId: (suffix, listId) => `/demo/${listId}${suffix}`,
    demoAdminStatePathForPublicListId: (listId) => `/demo/${listId}/state`,
    getCachedPhoto: async () => ({ blob: new Blob(["photo"]), fileName: "photo.jpg" }),
    normalizePhotos: (entity) => Array.isArray(entity?.photos) ? entity.photos : [],
    onProgress: (entry) => progress.push(entry),
    photoFiles: new Map([["photo-a", { blob: new Blob(["photo"]), meta: { fileName: "photo.jpg" } }]]),
    publicListIdForPublishedTarget: (target) => target.demoListId,
    putCachedPhoto: async (entry) => cached.push(entry.id),
    rows,
    selectedKeys: new Set(["demo:demo-ru-a"]),
    uploadPhotoToPath: async ({ photo, onPhotoProgress }) => {
      onPhotoProgress?.(photo, 50);
      Object.assign(photo, { status: "synced", url: "/file", thumbUrl: "/thumb" });
      return true;
    },
    withoutPhotoReferences: (state) => ({ ...state, items: {} })
  });

  assert.equal(restored.length, 1);
  assert.equal(restored[0].uploaded, 1);
  assert.deepEqual(cached, ["photo-a"]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].path, "/demo/demo-ru-a/state");
  assert.deepEqual(requests[0].body.payload.items, {});
  assert.equal(requests[1].body.payload.items["item-a"].photos[0].status, "synced");
  assert.equal(progress.some((entry) => entry.stage === "photos" && entry.itemPercent === 50), true);
  assert.equal(progress.at(-1).templatesCompleted, 1);
});
