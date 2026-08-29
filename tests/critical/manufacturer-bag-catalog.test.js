import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  MANUFACTURER_BAG_CATALOG,
  MANUFACTURER_BAG_CATALOG_CATEGORIES,
  MANUFACTURER_BAG_CATALOG_FAMILIES
} from "../../src/data/manufacturer-bag-catalog.js";
import {
  filterManufacturerBagCatalog,
  manufacturerBagContainerDraft,
  manufacturerBagSourceMeta,
  mergeManufacturerBagCatalogOverrides
} from "../../src/state/manufacturer-bag-catalog.js";
import {
  fetchManufacturerBagCatalogImageFile,
  prepareManufacturerBagCatalogImport
} from "../../src/public/manufacturer-bag-catalog-import.js";
import {
  MANUFACTURER_BAG_CATALOG_OVERRIDES_KEY,
  readManufacturerBagCatalogOverrides,
  writeManufacturerBagCatalogOverride
} from "../../src/storage/manufacturer-bag-catalog-overrides.js";
import { saveRootContainerDialogAction } from "../../src/ui/item-dialog-save.js";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("CRITICAL manufacturer catalog: stable ORTLIEB entries have bundled images", () => {
  assert.deepEqual(MANUFACTURER_BAG_CATALOG_FAMILIES.map(({ id }) => id), ["bikepacking", "panniers"]);
  assert.equal(MANUFACTURER_BAG_CATALOG.length, 7);
  assert.equal(new Set(MANUFACTURER_BAG_CATALOG.map(({ id }) => id)).size, MANUFACTURER_BAG_CATALOG.length);
  assert.equal(new Set(MANUFACTURER_BAG_CATALOG.map(({ sku }) => sku)).size, MANUFACTURER_BAG_CATALOG.length);
  assert.ok(MANUFACTURER_BAG_CATALOG.some(({ family }) => family === "panniers"));
  MANUFACTURER_BAG_CATALOG_CATEGORIES.forEach(({ id }) => {
    assert.ok(MANUFACTURER_BAG_CATALOG.some(({ category }) => category === id));
  });
  MANUFACTURER_BAG_CATALOG.forEach((entry) => {
    assert.match(entry.imageAssetPath, /^assets\/manufacturer-catalog\/ortlieb\/[a-z0-9-]+\.jpg$/);
    assert.match(entry.sourceImageUrl, /^https:\/\/cdn\.shopify\.com\//);
    assert.match(entry.sourceUrl, /^https:\/\/de\.ortlieb\.com\//);
    assert.ok(statSync(resolve(root, entry.imageAssetPath)).size > 10_000);
    assert.ok(entry.weight > 0);
    assert.ok(entry.volume > 0);
  });
});

test("CRITICAL manufacturer catalog: search covers SKU, Russian aliases and specifications", () => {
  assert.deepEqual(
    filterManufacturerBagCatalog(MANUFACTURER_BAG_CATALOG, { query: "F9912" }).map(({ name }) => name),
    ["Seat-Pack"]
  );
  assert.deepEqual(
    filterManufacturerBagCatalog(MANUFACTURER_BAG_CATALOG, { query: "подседельная" }).map(({ name }) => name),
    ["Seat-Pack"]
  );
  assert.ok(filterManufacturerBagCatalog(MANUFACTURER_BAG_CATALOG, { query: "Quick Lock3.1" })
    .some(({ name }) => name === "Gravel-Pack Single"));
  assert.ok(filterManufacturerBagCatalog(MANUFACTURER_BAG_CATALOG, { query: "IP53" })
    .some(({ name }) => name === "Fuel-Pack"));
});

test("CRITICAL manufacturer catalog: bundled image becomes a normal uploadable photo file", async () => {
  const calls = [];
  class TestFile {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.type = options.type;
      this.lastModified = options.lastModified;
    }
  }
  const file = await fetchManufacturerBagCatalogImageFile(MANUFACTURER_BAG_CATALOG[0], {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        blob: async () => new Blob(["catalog-photo"], { type: "image/jpeg" })
      };
    },
    FileCtor: TestFile
  });
  assert.equal(calls[0].url, MANUFACTURER_BAG_CATALOG[0].imageUrl);
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(file.name, "f9912.jpg");
  assert.equal(file.type, "image/jpeg");
});

test("CRITICAL manufacturer catalog: selection prepares fields and a copied photo", async () => {
  const entry = MANUFACTURER_BAG_CATALOG[0];
  const photo = { id: "photo-catalog-copy", localId: "photo-catalog-copy", status: "pending" };
  const prepared = await prepareManufacturerBagCatalogImport(entry, {
    fetchImageFile: async () => ({ name: "f9912.jpg", type: "image/jpeg" }),
    createPhotoFromFile: async (file) => {
      assert.equal(file.name, "f9912.jpg");
      return photo;
    }
  });
  assert.equal(prepared.draft.name, "ORTLIEB Seat-Pack 11 L");
  assert.equal(prepared.photo, photo);
});

test("CRITICAL manufacturer catalog: saved user bag owns the copied photo and source provenance", () => {
  const entry = MANUFACTURER_BAG_CATALOG[0];
  const draft = manufacturerBagContainerDraft(entry);
  const copiedPhoto = {
    id: "photo-catalog-copy",
    localId: "photo-catalog-copy",
    status: "pending",
    url: "",
    thumbUrl: ""
  };
  const state = { containers: {} };
  const refs = {
    saveRootContainerBtn: { disabled: false },
    rootContainerName: { value: draft.name },
    rootContainerWeight: { value: String(draft.weight) },
    rootContainerVolume: { value: String(draft.volume) },
    rootContainerColor: { value: draft.color },
    rootContainerLocation: { value: "home" },
    rootContainerNote: { value: "" },
    rootContainerNestable: { checked: false },
    rootContainerDialog: { open: true }
  };
  const result = saveRootContainerDialogAction({
    createRootContainerId: () => "catalog-bag",
    refs,
    rootContainerDialogPhotoDraft: { photos: [copiedPhoto], deletedPhotos: [] },
    rootContainerSourceMeta: () => manufacturerBagSourceMeta(entry),
    state
  });
  assert.equal(result.created, true);
  assert.deepEqual(state.containers["catalog-bag"].photos, [copiedPhoto]);
  assert.equal(state.containers["catalog-bag"].manufacturerCatalogSource.sku, "F9912");
  assert.equal(state.containers["catalog-bag"].manufacturerCatalogSource.catalogId, entry.id);
});

test("CRITICAL manufacturer catalog: local admin override replaces only the edited model", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  writeManufacturerBagCatalogOverride({ id: MANUFACTURER_BAG_CATALOG[0].id, name: "First edit" }, storage);
  const rows = writeManufacturerBagCatalogOverride({ id: MANUFACTURER_BAG_CATALOG[0].id, name: "Second edit" }, storage);
  assert.equal(rows.length, 1);
  assert.equal(readManufacturerBagCatalogOverrides(storage)[0].name, "Second edit");
  assert.ok(values.has(MANUFACTURER_BAG_CATALOG_OVERRIDES_KEY));
  const merged = mergeManufacturerBagCatalogOverrides(MANUFACTURER_BAG_CATALOG, rows);
  assert.equal(merged[0].name, "Second edit");
  assert.equal(merged[0].sku, "F9912");
});

test("CRITICAL manufacturer catalog: UI exposes async photo copy and bilingual copy", () => {
  const index = read("index.html");
  const controller = read("src/ui/manufacturer-bag-catalog-dialog.js");
  const appTail = read("src/app/app-tail-controllers.js");
  const i18n = read("src/data/i18n.js");
  assert.match(index, /id="openBagCatalogBtn"/);
  assert.match(index, /id="bagCatalogDialog"/);
  assert.match(index, /id="bagCatalogEditDialog"/);
  assert.match(controller, /await onSelect\(entry\)/);
  assert.match(appTail, /prepareManufacturerBagCatalogImport/);
  assert.match(appTail, /uploadRootContainerDialogDraftPhotos\(result\.accepted\)/);
  assert.equal((i18n.match(/"bagCatalog\.photoReady"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.open"/g) || []).length, 2);
});
