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
  assertManufacturerBagCatalogSkuModels,
  manufacturerBagCatalogSkuModelGroups,
  splitManufacturerBagCatalogSkuModels
} from "../../src/data/manufacturer-bag-catalog-variants.js";
import {
  filterManufacturerBagCatalog,
  manufacturerBagContainerDraft,
  manufacturerBagCatalogVariantChoices,
  manufacturerBagCatalogVariantEntry,
  manufacturerBagSourceMeta,
  mergeManufacturerBagCatalogOverrides
} from "../../src/state/manufacturer-bag-catalog.js";
import {
  filterManufacturerBagComparisonRows,
  manufacturerBagComparisonFilterKey,
  manufacturerBagComparisonFilterOptions,
  manufacturerBagComparisonNumericBounds,
  manufacturerBagComparisonRange,
  manufacturerBagComparisonRows,
  sortManufacturerBagComparisonRows
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

test("CRITICAL manufacturer catalog: complete ORTLIEB and Arkel comparison rows have bundled images", () => {
  assert.deepEqual(MANUFACTURER_BAG_CATALOG_FAMILIES.map(({ id }) => id), ["bikepacking", "panniers", "carry"]);
  assert.equal(MANUFACTURER_BAG_CATALOG.length, 123);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "ORTLIEB").length, 62);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Arkel").length, 61);
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
    ["Seat-Pack 11 L"]
  );
  const saddleMatches = filterManufacturerBagCatalog(MANUFACTURER_BAG_CATALOG, { query: "подседельная" });
  assert.ok(saddleMatches.some(({ id }) => id === "ortlieb-seat-pack-11l"));
  assert.ok(saddleMatches.some(({ id }) => id === "arkel-seatpacker-seat-bag-hanger-kit-9l"));
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
  const entry = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-seat-pack-11l");
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
  const entry = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-seat-pack-11l");
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
  const entry = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "arkel-seatpacker-seat-bag-hanger-kit-9l");
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
  const entry = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-seat-pack-11l");
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
  assert.deepEqual(saddleRows.find(({ id }) => id === "ortlieb-seat-pack-11l").weightOptions, [346]);
  assert.deepEqual(saddleRows.find(({ id }) => id === "ortlieb-seat-pack-16-5l").weightOptions, [490]);
  assert.deepEqual(saddleRows.find(({ id }) => id === "arkel-saddle-bag").weightOptions, [55]);
  assert.equal(manufacturerBagComparisonRange([11, 16.5], "L"), "11–16.5 L");
  assert.deepEqual(manufacturerBagComparisonRows(MANUFACTURER_BAG_CATALOG, ""), []);
});

test("CRITICAL manufacturer catalog: comparison filters intersect numeric ranges and combine manufacturers", () => {
  const saddleRows = manufacturerBagComparisonRows(MANUFACTURER_BAG_CATALOG, "saddle");
  const seatPack = saddleRows.find(({ id }) => id === "ortlieb-seat-pack-16-5l");
  assert.deepEqual(manufacturerBagComparisonNumericBounds(seatPack, "volume"), { min: 16.5, max: 16.5 });
  assert.equal(manufacturerBagComparisonFilterKey(seatPack, "manufacturer"), "ORTLIEB");
  assert.deepEqual(
    manufacturerBagComparisonFilterOptions(saddleRows, "manufacturer").map(({ key }) => key).sort(),
    ["Arkel", "ORTLIEB"]
  );

  const pointInsideRange = filterManufacturerBagComparisonRows(saddleRows, {
    volume: { min: 16.5, max: 16.5 }
  });
  assert.ok(pointInsideRange.some(({ id }) => id === "ortlieb-seat-pack-16-5l"));

  const filtered = filterManufacturerBagComparisonRows(saddleRows, {
    manufacturer: { selectedKeys: ["ORTLIEB"] },
    volume: { min: 16.5, max: 16.5 }
  });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every(({ brand }) => brand === "ORTLIEB"));
  assert.ok(filtered.some(({ id }) => id === "ortlieb-seat-pack-16-5l"));
  assert.deepEqual(filterManufacturerBagComparisonRows(saddleRows, {
    manufacturer: { selectedKeys: [] }
  }), []);
});

test("CRITICAL manufacturer catalog: comparison sorts range columns by the visible boundary", () => {
  const rows = [
    { id: "wide", brand: "A", name: "Wide", volumeOptions: [20, 30] },
    { id: "middle", brand: "B", name: "Middle", volumeOptions: [21, 22] },
    { id: "small", brand: "C", name: "Small", volumeOptions: [10] },
    { id: "unknown", brand: "D", name: "Unknown", volumeOptions: [] }
  ];
  assert.deepEqual(
    sortManufacturerBagComparisonRows(rows, { column: "volume", direction: "asc" }).map(({ id }) => id),
    ["small", "wide", "middle", "unknown"]
  );
  assert.deepEqual(
    sortManufacturerBagComparisonRows(rows, { column: "volume", direction: "desc" }).map(({ id }) => id),
    ["wide", "middle", "small", "unknown"]
  );
});

test("CRITICAL manufacturer catalog: ORTLIEB Vario models are convertible panniers", () => {
  const varioRows = MANUFACTURER_BAG_CATALOG.filter(({ id }) => /^ortlieb-vario-(?:20l|26l|lite)$/.test(id));
  assert.equal(varioRows.length, 3);
  assert.ok(varioRows.every(({ category }) => category === "hybrid-pannier"));
  assert.ok(varioRows.every(({ description }) => /трансформер/i.test(description.ru)));
});

test("CRITICAL manufacturer catalog: ORTLIEB pair specifications keep per-bag values and explicit set totals", () => {
  const expected = new Map([
    ["ortlieb-back-roller-20l-pair", [20, 40]],
    ["ortlieb-back-roller-35l-mesh-pocket-pair", [35, 70]],
    ["ortlieb-bike-packer", [20, 40]],
    ["ortlieb-bike-packer-plus", [21, 42]],
    ["ortlieb-gravel-pack", [14.5, 29]],
    ["ortlieb-sport-packer", [15, 30]],
    ["ortlieb-sport-roller-pair", [14.5, 29]]
  ]);
  const rows = MANUFACTURER_BAG_CATALOG.filter(({ id }) => expected.has(id));
  assert.equal(rows.length, expected.size);
  rows.forEach((entry) => {
    const [perBag, total] = expected.get(entry.id);
    assert.equal(entry.soldAsSet, true);
    assert.equal(entry.specificationBasis, "per-bag");
    assert.equal(entry.setQuantity, 2);
    assert.deepEqual(entry.volumePerBagOptions, [perBag]);
    assert.deepEqual(entry.totalVolumeOptions, [total]);
    assert.match(entry.description.ru, new RegExp(`${total} L за пару`));
  });
});

test("CRITICAL manufacturer catalog: pair comparison filters by one bag and import keeps set totals", () => {
  const backRoller = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-back-roller-20l-pair");
  const comparison = manufacturerBagComparisonRows(MANUFACTURER_BAG_CATALOG, "rear-pannier")
    .find(({ id }) => id === backRoller.id);
  assert.deepEqual(comparison.volumeOptions, [20]);
  assert.deepEqual(comparison.volumePerBagOptions, [20]);
  assert.deepEqual(comparison.volumeTotalOptions, [40]);
  assert.deepEqual(manufacturerBagComparisonNumericBounds(comparison, "volume"), { min: 20, max: 20 });
  assert.ok(filterManufacturerBagComparisonRows([comparison], { volume: { min: 20, max: 20 } }).length);
  assert.deepEqual(filterManufacturerBagComparisonRows([comparison], { volume: { min: 40, max: 40 } }), []);

  const draft = manufacturerBagContainerDraft(backRoller);
  assert.equal(draft.name, "ORTLIEB Back-Roller Pair 40 L (2 × 20 L)");
  assert.equal(draft.volume, 40);
  assert.equal(draft.weight, 1900);
  assert.equal(draft.manufacturerCatalogSource.volumePerBag, 20);
  assert.equal(draft.manufacturerCatalogSource.totalVolume, 40);
  assert.equal(draft.manufacturerCatalogSource.specificationBasis, "per-bag");

  const backRollerXl = manufacturerBagComparisonRows(MANUFACTURER_BAG_CATALOG, "rear-pannier")
    .find(({ id }) => id === "ortlieb-back-roller-35l-mesh-pocket-pair");
  assert.deepEqual(backRollerXl.weightPerBagOptions, [1006, 1199]);
  assert.deepEqual(backRollerXl.weightOptions, [2012, 2398]);
});

test("CRITICAL manufacturer catalog: Arkel pair totals are normalized for one-bag comparison", () => {
  const rows = manufacturerBagComparisonRows(MANUFACTURER_BAG_CATALOG, "rear-pannier");
  const dryLites28 = rows.find(({ id }) => id === "arkel-dry-lites-saddle-bags-28l");
  const dryLites36 = rows.find(({ id }) => id === "arkel-dry-lites-saddle-bags-36l");
  const gt54 = rows.find(({ id }) => id === "arkel-gt-54-classic-touring-panniers");
  const t42 = rows.find(({ id }) => id === "arkel-t-42-classic-touring-panniers");
  const t28 = manufacturerBagComparisonRows(MANUFACTURER_BAG_CATALOG, "universal-pannier")
    .find(({ id }) => id === "arkel-t-28-classic-touring-panniers");

  assert.deepEqual(dryLites28.volumeOptions, [14]);
  assert.deepEqual(dryLites28.volumeTotalOptions, [28]);
  assert.deepEqual(dryLites36.volumeOptions, [18]);
  assert.deepEqual(dryLites36.volumeTotalOptions, [36]);
  assert.deepEqual(t42.volumeOptions, [21]);
  assert.deepEqual(t42.volumeTotalOptions, [42]);
  assert.deepEqual(gt54.volumeOptions, []);
  assert.deepEqual(gt54.volumeTotalOptions, [54]);
  assert.equal(gt54.volumeSetBasis, "composite-set");
  assert.equal(manufacturerBagComparisonFilterKey(gt54, "set"), "composite");
  assert.deepEqual(t28.volumeOptions, []);
  assert.deepEqual(t28.volumeTotalOptions, [28]);
  assert.equal(manufacturerBagComparisonNumericBounds(gt54, "volume"), null);
  assert.deepEqual(filterManufacturerBagComparisonRows([gt54], { volume: { min: 27, max: 27 } }), []);
  assert.equal(
    sortManufacturerBagComparisonRows(rows, { column: "volume", direction: "desc" })[0].id,
    gt54.id
  );
  assert.ok(
    sortManufacturerBagComparisonRows(rows, { column: "volume", direction: "asc" })
      .findIndex(({ id }) => id === gt54.id) > 0
  );
  assert.ok(filterManufacturerBagComparisonRows([dryLites28, dryLites36], { volume: { min: 18, max: 18 } })
    .some(({ id }) => id === dryLites36.id));
  assert.deepEqual(filterManufacturerBagComparisonRows([dryLites36], { volume: { min: 36, max: 36 } }), []);

  const draft = manufacturerBagContainerDraft(MANUFACTURER_BAG_CATALOG.find(({ id }) => id === dryLites36.id));
  assert.equal(draft.volume, 36);
  assert.equal(draft.manufacturerCatalogSource.volumePerBag, 18);
  assert.equal(draft.manufacturerCatalogSource.totalVolume, 36);
  assert.equal(draft.manufacturerCatalogSource.specificationBasis, "set-total");
});

test("CRITICAL manufacturer catalog: SKU is explained in cards and comparison details", () => {
  const translations = read("src/data/i18n.js");
  const catalogDialog = read("src/ui/manufacturer-bag-catalog-dialog.js");
  const comparisonDialog = read("src/ui/manufacturer-bag-comparison-dialog.js");
  assert.match(translations, /SKU \(Stock Keeping Unit\).*артикул конкретного варианта товара/);
  assert.match(translations, /SKU \(Stock Keeping Unit\) identifies a specific product variant/);
  assert.match(catalogDialog, /title=.*bagCatalog\.field\.skuHelp/);
  assert.match(comparisonDialog, /<abbr class="manufacturer-catalog-sku-term" title=.*bagCatalog\.field\.skuHelp/);
});

test("CRITICAL manufacturer catalog: editing a per-bag value recalculates the pair total", () => {
  const backRoller = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-back-roller-20l-pair");
  const [edited] = mergeManufacturerBagCatalogOverrides([backRoller], [{
    id: backRoller.id,
    volume: 22,
    weight: 975,
    loadKg: 10
  }]);
  assert.deepEqual(edited.volumePerBagOptions, [22]);
  assert.deepEqual(edited.totalVolumeOptions, [44]);
  assert.deepEqual(edited.weightPerBagOptions, [975]);
  assert.deepEqual(edited.totalWeightOptions, [1950]);
  assert.equal(edited.totalLoadKg, 20);
});

test("CRITICAL manufacturer catalog: SKU size models are rows while colors stay variants", () => {
  const small = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-micro-bag-0-5l");
  const large = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-micro-bag-0-8l");
  assert.deepEqual(small.volumeOptions, [0.5]);
  assert.deepEqual(large.volumeOptions, [0.8]);
  assert.deepEqual(small.variants.map(({ sku }) => sku), ["F9664", "F9666", "F9665"]);
  assert.deepEqual(large.variants.map(({ sku }) => sku), ["F9674", "F9675"]);
  assert.equal(manufacturerBagCatalogVariantChoices(small).length, 1);
  assert.equal(manufacturerBagContainerDraft(small).name, "ORTLIEB Micro-Bag 0.5 L");

  MANUFACTURER_BAG_CATALOG.forEach((entry) => {
    assert.equal(manufacturerBagCatalogSkuModelGroups(entry).length, 0, `${entry.id} still combines SKU models`);
  });

  const arkelSaddle = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "arkel-saddle-bag");
  const corrected = manufacturerBagCatalogVariantEntry(arkelSaddle, "SB-RX30-BK");
  assert.equal(corrected.weight, 55, "bad upstream Shopify grams must not replace official technical weight");

  const orcaPair = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "arkel-orca-panniers-12-5l-pair");
  const orcaUnit = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "arkel-orca-panniers-12-5l-single");
  assert.deepEqual(orcaPair.volumePerBagOptions, [12.5]);
  assert.deepEqual(orcaPair.totalVolumeOptions, [25]);
  assert.deepEqual(orcaPair.totalWeightOptions, [1400, 1550]);
  assert.deepEqual(orcaUnit.volumeOptions, [12.5]);
  assert.equal(orcaUnit.soldAsSet, false);
});

test("CRITICAL manufacturer catalog: true adjustable ranges are not split without distinct SKU values", () => {
  const adjustable = {
    id: "adjustable-seat-bag",
    name: "Adjustable Seat Bag",
    volume: 11,
    volumeOptions: [11, 16.5],
    variants: [
      { sku: "BLACK", title: "black", volume: 0, mounting: "Straps", available: true },
      { sku: "RED", title: "red", volume: 0, mounting: "Straps", available: true }
    ]
  };
  const [normalized] = splitManufacturerBagCatalogSkuModels([adjustable]);
  assert.equal(normalized.id, adjustable.id);
  assert.deepEqual(normalized.volumeOptions, [11, 16.5]);
  assert.deepEqual(normalized.variants.map(({ sku }) => sku), ["BLACK", "RED"]);
  assert.doesNotThrow(() => assertManufacturerBagCatalogSkuModels([adjustable]));
});

test("CRITICAL manufacturer catalog: mounting systems stay in one row and preserve SKU provenance", () => {
  const backRoller = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-back-roller-20l");
  assert.deepEqual(backRoller.mountingOptions, ["Quick-Lock2.1", "Quick-Lock3.1"]);
  assert.equal(backRoller.mounting, "Quick-Lock2.1 / Quick-Lock3.1");
  assert.equal(backRoller.variants.find(({ sku }) => sku === "F5535").mounting, "Quick-Lock3.1");
  assert.equal(manufacturerBagCatalogVariantChoices(backRoller).length, 2);
});

test("CRITICAL manufacturer catalog: UI exposes async photo copy and bilingual copy", () => {
  const index = read("index.html");
  const controller = read("src/ui/manufacturer-bag-catalog-dialog.js");
  const comparison = read("src/ui/manufacturer-bag-comparison-dialog.js");
  const appTail = read("src/app/app-tail-controllers.js");
  const i18n = read("src/data/i18n.js");
  const styles = read("styles.css");
  assert.match(index, /id="openBagCatalogBtn"/);
  assert.match(index, /id="bagCatalogDialog"/);
  assert.match(index, /id="bagCatalogEditDialog"/);
  assert.match(index, /id="bagCatalogCompareDialog"/);
  assert.match(index, /id="bagCatalogCompareManufacturerBtn"/);
  assert.match(index, /id="bagCatalogCompareFilterPanel"/);
  assert.match(index, /class="manufacturer-comparison-filter-body"/);
  assert.match(index, /id="bagCatalogProductDetailDialog"/);
  assert.match(controller, /await onSelect\(entry\)/);
  assert.match(controller, /data-bag-catalog-compare-category/);
  assert.match(comparison, /manufacturerBagComparisonRows/);
  assert.match(comparison, /manufacturerBagComparisonViewRows/);
  assert.match(comparison, /comparisonVolumeText\(entry\.volumeOptions, entry\.volumeTotalOptions/);
  assert.match(comparison, /data-bag-comparison-detail/);
  assert.match(comparison, /visualViewport/);
  assert.match(styles, /grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.manufacturer-comparison-filter-body[\s\S]*overflow-y:\s*auto/);
  assert.match(styles, /\.manufacturer-comparison-filter-panel > footer[\s\S]*border-top/);
  assert.match(appTail, /prepareManufacturerBagCatalogImport/);
  assert.match(appTail, /uploadRootContainerDialogDraftPhotos\(result\.accepted\)/);
  assert.equal((i18n.match(/"bagCatalog\.photoReady"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.open"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.compare\.open"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.compare\.filterManufacturers"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.compare\.rangeHint"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.compare\.volumePerBag"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.compare\.perBagWithSetTotal"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.compare\.setTotalNotComparable"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.compare\.compositeSet"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.compare\.openDetailsFor"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.setTotalWithPerBag"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.compare\.officialPerBag"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.variantPicker"/g) || []).length, 2);
});
