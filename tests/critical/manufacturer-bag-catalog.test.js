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
  manufacturerBagCatalogVariantChoices,
  manufacturerBagCatalogVariantEntry,
  manufacturerBagSourceMeta,
  mergeManufacturerBagCatalogOverrides
} from "../../src/state/manufacturer-bag-catalog.js";
import {
  manufacturerBagComparisonRange,
  manufacturerBagComparisonRows
} from "../../src/state/manufacturer-bag-comparison.js";
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

test("CRITICAL manufacturer catalog: complete ORTLIEB and Arkel model sets have bundled images", () => {
  assert.deepEqual(MANUFACTURER_BAG_CATALOG_FAMILIES.map(({ id }) => id), ["bikepacking", "panniers", "carry"]);
  assert.equal(MANUFACTURER_BAG_CATALOG.length, 87);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "ORTLIEB").length, 47);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Arkel").length, 40);
  assert.equal(new Set(MANUFACTURER_BAG_CATALOG.map(({ id }) => id)).size, MANUFACTURER_BAG_CATALOG.length);
  assert.ok(!MANUFACTURER_BAG_CATALOG.some(({ id }) => /quick-rack|organizer|bag-only/.test(id)));
  MANUFACTURER_BAG_CATALOG_CATEGORIES.forEach(({ id }) => {
    assert.ok(MANUFACTURER_BAG_CATALOG.some(({ category }) => category === id));
  });
  MANUFACTURER_BAG_CATALOG.forEach((entry) => {
    assert.match(entry.imageAssetPath, /^assets\/manufacturer-catalog\/(?:ortlieb|arkel)\/[a-z0-9-]+\.(?:jpg|png|webp)$/);
    assert.match(entry.sourceImageUrl, /^https:\/\/cdn\.shopify\.com\//);
    assert.match(entry.sourceUrl, /^https:\/\/(?:us\.ortlieb\.com|arkel\.ca)\//);
    assert.ok(statSync(resolve(root, entry.imageAssetPath)).size > 5_000);
    assert.ok(entry.variantCount > 0);
    assert.ok(Array.isArray(entry.variants));
    assert.equal(entry.sourceCheckedAt, "2026-08-29");
  });
});

test("CRITICAL manufacturer catalog: search covers SKU, Russian aliases and specifications", () => {
  assert.deepEqual(
    filterManufacturerBagCatalog(MANUFACTURER_BAG_CATALOG, { query: "F9912" }).map(({ name }) => name),
    ["Seat-Pack"]
  );
  const saddleMatches = filterManufacturerBagCatalog(MANUFACTURER_BAG_CATALOG, { query: "подседельная" });
  assert.ok(saddleMatches.some(({ id }) => id === "ortlieb-seat-pack"));
  assert.ok(saddleMatches.some(({ id }) => id === "arkel-seatpacker-seat-bag-hanger-kit"));
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
  const entry = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-seat-pack");
  const file = await fetchManufacturerBagCatalogImageFile(entry, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        blob: async () => new Blob(["catalog-photo"], { type: "image/jpeg" })
      };
    },
    FileCtor: TestFile
  });
  assert.equal(calls[0].url, entry.imageUrl);
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(file.name, "f9912.jpg");
  assert.equal(file.type, "image/jpeg");
});

test("CRITICAL manufacturer catalog: selection prepares fields and a copied photo", async () => {
  const entry = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-seat-pack");
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
  const entry = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "arkel-seatpacker-seat-bag-hanger-kit");
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
  assert.equal(state.containers["catalog-bag"].manufacturerCatalogSource.sku, "SP9-RX30-BK");
  assert.equal(state.containers["catalog-bag"].manufacturerCatalogSource.provider, "arkel.ca");
  assert.equal(state.containers["catalog-bag"].manufacturerCatalogSource.catalogId, entry.id);
});

test("CRITICAL manufacturer catalog: local admin override replaces only the edited model", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const entry = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-seat-pack");
  writeManufacturerBagCatalogOverride({ id: entry.id, name: "First edit" }, storage);
  const rows = writeManufacturerBagCatalogOverride({ id: entry.id, name: "Second edit" }, storage);
  assert.equal(rows.length, 1);
  assert.equal(readManufacturerBagCatalogOverrides(storage)[0].name, "Second edit");
  assert.ok(values.has(MANUFACTURER_BAG_CATALOG_OVERRIDES_KEY));
  const merged = mergeManufacturerBagCatalogOverrides(MANUFACTURER_BAG_CATALOG, rows);
  const edited = merged.find(({ id }) => id === entry.id);
  assert.equal(edited.name, "Second edit");
  assert.equal(edited.sku, "F9912");
});

test("CRITICAL manufacturer catalog: comparison never mixes bag types", () => {
  const saddleRows = manufacturerBagComparisonRows(MANUFACTURER_BAG_CATALOG, "saddle");
  assert.ok(saddleRows.length >= 7);
  assert.ok(saddleRows.every(({ category }) => category === "saddle"));
  assert.ok(saddleRows.some(({ brand }) => brand === "ORTLIEB"));
  assert.ok(saddleRows.some(({ brand }) => brand === "Arkel"));
  assert.deepEqual(saddleRows.find(({ id }) => id === "ortlieb-seat-pack").weightOptions, [346, 490]);
  assert.deepEqual(saddleRows.find(({ id }) => id === "arkel-saddle-bag").weightOptions, [55]);
  assert.equal(manufacturerBagComparisonRange([11, 16.5], "L"), "11–16.5 L");
  assert.deepEqual(manufacturerBagComparisonRows(MANUFACTURER_BAG_CATALOG, ""), []);
});

test("CRITICAL manufacturer catalog: meaningful size and mounting variants are selectable", () => {
  const seatPack = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-seat-pack");
  const choices = manufacturerBagCatalogVariantChoices(seatPack);
  assert.deepEqual(choices.map(({ volume }) => volume), [11, 16.5]);
  const large = manufacturerBagCatalogVariantEntry(seatPack, "F9902");
  assert.equal(large.sku, "F9902");
  assert.equal(large.volume, 16.5);
  assert.equal(large.weight, 490);
  assert.deepEqual(large.dimensions, {});

  const arkelSaddle = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "arkel-saddle-bag");
  const corrected = manufacturerBagCatalogVariantEntry(arkelSaddle, "SB-RX30-BK");
  assert.equal(corrected.weight, 55, "bad upstream Shopify grams must not replace official technical weight");

  const orca = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "arkel-orca-panniers");
  const pair = manufacturerBagCatalogVariantEntry(orca, "ORCA2-25-R");
  assert.equal(pair.soldAsSet, true);
});

test("CRITICAL manufacturer catalog: UI exposes async photo copy and bilingual copy", () => {
  const index = read("index.html");
  const controller = read("src/ui/manufacturer-bag-catalog-dialog.js");
  const comparison = read("src/ui/manufacturer-bag-comparison-dialog.js");
  const appTail = read("src/app/app-tail-controllers.js");
  const i18n = read("src/data/i18n.js");
  assert.match(index, /id="openBagCatalogBtn"/);
  assert.match(index, /id="bagCatalogDialog"/);
  assert.match(index, /id="bagCatalogEditDialog"/);
  assert.match(index, /id="bagCatalogCompareDialog"/);
  assert.match(controller, /await onSelect\(entry\)/);
  assert.match(controller, /data-bag-catalog-compare-category/);
  assert.match(comparison, /manufacturerBagComparisonRows/);
  assert.match(appTail, /prepareManufacturerBagCatalogImport/);
  assert.match(appTail, /uploadRootContainerDialogDraftPhotos\(result\.accepted\)/);
  assert.equal((i18n.match(/"bagCatalog\.photoReady"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.open"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.compare\.open"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.variantPicker"/g) || []).length, 2);
});
