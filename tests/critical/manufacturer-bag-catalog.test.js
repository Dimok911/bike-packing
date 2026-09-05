import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  MANUFACTURER_BAG_CATALOG,
  MANUFACTURER_BAG_CATALOG_BRANDS,
  MANUFACTURER_BAG_CATALOG_CATEGORIES,
  MANUFACTURER_BAG_CATALOG_FAMILIES
} from "../../src/data/manufacturer-bag-catalog.js";
import {
  MANUFACTURER_BAG_CATALOG_INDEX,
  loadedManufacturerBagCatalog,
  loadManufacturerBagCatalog
} from "../../src/data/manufacturer-bag-catalog-runtime.js";
import {
  assertManufacturerBagCatalogSkuModels,
  manufacturerBagCatalogSkuModelGroups,
  splitManufacturerBagCatalogSkuModels
} from "../../src/data/manufacturer-bag-catalog-variants.js";
import {
  filterManufacturerBagCatalog,
  manufacturerBagCatalogImageUrls,
  manufacturerBagCatalogNote,
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
  fetchManufacturerBagCatalogImageFiles,
  prepareManufacturerBagCatalogImport
} from "../../src/public/manufacturer-bag-catalog-import.js";
import {
  MANUFACTURER_BAG_CATALOG_OVERRIDES_KEY,
  readManufacturerBagCatalogOverrides,
  writeManufacturerBagCatalogOverride
} from "../../src/storage/manufacturer-bag-catalog-overrides.js";
import { saveRootContainerDialogAction } from "../../src/ui/item-dialog-save.js";
import { renderManufacturerBrandMark } from "../../src/ui/manufacturer-brand-mark.js";
import { plainManufacturerCatalogDescription } from "../../src/ui/manufacturer-catalog-description.js";
import {
  browserStorageEstimate,
  cacheManufacturerCatalogPreviews,
  clearManufacturerCatalogOffline,
  manufacturerCatalogOfflineUsage,
  manufacturerCatalogPreviewUrls
} from "../../src/sync/manufacturer-catalog-offline.js";

test("CRITICAL manufacturer catalog: active and planned brand marks stay explicit", () => {
  const active = MANUFACTURER_BAG_CATALOG_BRANDS.filter(({ status }) => status === "active");
  const planned = MANUFACTURER_BAG_CATALOG_BRANDS.filter(({ status }) => status === "planned");
  assert.deepEqual(active.map(({ catalogBrand }) => catalogBrand), ["ORTLIEB", "Apidura", "Restrap", "Tailfin", "Arkel", "Revelate Designs", "Miss Grape", "CYCLITE", "Blackburn", "Topeak", "Rockgeist"]);
  assert.ok(active.every(({ logoUrl }) => /manufacturer-brands\/(?:ortlieb|apidura|restrap|tailfin|arkel|revelate-designs|miss-grape|cyclite|blackburn|topeak|rockgeist)\.(?:png|svg)/.test(logoUrl)));
  assert.deepEqual(planned.map(({ name }) => name), []);
  assert.ok(planned.every(({ catalogBrand, logoUrl }) => !catalogBrand && !logoUrl));
  const revelateMark = renderManufacturerBrandMark({ brand: "Revelate Designs", brands: MANUFACTURER_BAG_CATALOG_BRANDS });
  assert.match(revelateMark, /manufacturer-brand-mark-revelate-designs/);
  assert.match(readFileSync(resolve(import.meta.dirname, "../..", "styles.css"), "utf8"),
    /\.manufacturer-brand-mark-revelate-designs\s*\{[^}]*background:\s*#27312d;/s);
});

test("CRITICAL manufacturer catalog: technical provenance is shown in plain language", () => {
  assert.equal(
    plainManufacturerCatalogDescription("Подседельная сумка 10 L. Характеристики нормализованы по официальной карточке товара."),
    "Подседельная сумка 10 L. Характеристики взяты с официальной страницы производителя."
  );
  assert.equal(
    plainManufacturerCatalogDescription("A 10 L saddle bag. Technical data is normalized from the official product page."),
    "A 10 L saddle bag. Specifications are from the manufacturer's official product page."
  );
});

test("CRITICAL manufacturer catalog: brand filtering keeps only that manufacturer's available structure", () => {
  const apidura = filterManufacturerBagCatalog(MANUFACTURER_BAG_CATALOG, { brand: "Apidura" });
  assert.ok(apidura.length > 0);
  assert.ok(apidura.every(({ brand }) => brand === "Apidura"));
  assert.ok(filterManufacturerBagCatalog(MANUFACTURER_BAG_CATALOG, { brand: "Apidura", family: "bikepacking" }).length > 0);
  assert.equal(filterManufacturerBagCatalog(MANUFACTURER_BAG_CATALOG, { brand: "Apidura", family: "carry" }).length, 0);
});

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("CRITICAL manufacturer catalog: runtime opens from a small index and loads one brand at a time", async () => {
  assert.equal(MANUFACTURER_BAG_CATALOG_INDEX.length, 622);
  assert.deepEqual(loadedManufacturerBagCatalog(), []);

  const apidura = await loadManufacturerBagCatalog({ brand: "Apidura" });
  assert.equal(apidura.length, 71);
  assert.ok(apidura.every(({ brand }) => brand === "Apidura"));

  const withOrtlieb = await loadManufacturerBagCatalog({ brand: "ORTLIEB" });
  assert.equal(withOrtlieb.length, 133);
  assert.deepEqual([...new Set(withOrtlieb.map(({ brand }) => brand))], ["ORTLIEB", "Apidura"]);

  const runtimeFiles = [
    "index.generated.js",
    "ortlieb.generated.js",
    "apidura.generated.js",
    "restrap.generated.js",
    "tailfin.generated.js",
    "arkel.generated.js",
    "revelate-designs.generated.js",
    "miss-grape.generated.js",
    "cyclite.generated.js",
    "blackburn.generated.js",
    "topeak.generated.js",
    "rockgeist.generated.js"
  ];
  runtimeFiles.forEach((fileName) => {
    const path = `src/data/manufacturer-catalog-runtime/${fileName}`;
    const source = read(path);
    assert.doesNotMatch(source, /sourceImageUrls|imageAssetPaths|manufacturer-bag-catalog\.generated/);
    assert.ok(statSync(resolve(root, path)).size < 450_000, `${fileName} is unexpectedly large`);
  });
  assert.ok(statSync(resolve(root, "src/data/manufacturer-catalog-runtime/index.generated.js")).size < 70_000);
});

test("CRITICAL manufacturer catalog: approved manufacturer baselines have bundled images", () => {
  assert.deepEqual(MANUFACTURER_BAG_CATALOG_FAMILIES.map(({ id }) => id), ["bikepacking", "panniers", "carry"]);
  assert.deepEqual(
    MANUFACTURER_BAG_CATALOG_CATEGORIES.filter(({ family }) => family === "panniers").map(({ id }) => id),
    ["pannier", "hybrid-pannier", "rack-top"]
  );
  assert.deepEqual(
    MANUFACTURER_BAG_CATALOG_CATEGORIES.filter(({ family }) => family === "carry").map(({ id }) => id),
    ["backpack", "shoulder-waist"]
  );
  assert.equal(MANUFACTURER_BAG_CATALOG.length, 622);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "ORTLIEB").length, 62);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Arkel").length, 61);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Tailfin").length, 42);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Apidura").length, 71);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Restrap").length, 46);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Revelate Designs").length, 63);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Miss Grape").length, 25);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "CYCLITE").length, 17);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Blackburn").length, 17);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Topeak").length, 104);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Rockgeist").length, 114);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ category }) => category === "pannier").length, 60);
  assert.equal(MANUFACTURER_BAG_CATALOG.filter(({ category }) => category === "shoulder-waist").length, 13);
  assert.ok(!MANUFACTURER_BAG_CATALOG.some(({ category }) => [
    "rear-pannier",
    "front-pannier",
    "universal-pannier",
    "messenger",
    "tote-sling"
  ].includes(category)));
  assert.equal(new Set(MANUFACTURER_BAG_CATALOG.map(({ id }) => id)).size, MANUFACTURER_BAG_CATALOG.length);
  assert.ok(!MANUFACTURER_BAG_CATALOG.some(({ id }) => /quick-rack|organizer|bag-only/.test(id)));
  MANUFACTURER_BAG_CATALOG_CATEGORIES.forEach(({ id }) => {
    assert.ok(MANUFACTURER_BAG_CATALOG.some(({ category }) => category === id));
  });
  MANUFACTURER_BAG_CATALOG.forEach((entry) => {
    assert.match(entry.imageAssetPath, /^assets\/manufacturer-catalog\/(?:ortlieb|arkel|tailfin|apidura|restrap|revelate-designs|miss-grape|cyclite|blackburn|topeak|rockgeist)\/[a-z0-9-]+\.(?:jpg|png|webp)$/);
    assert.match(entry.sourceImageUrl, /^https:\/\/(?:cdn\.shopify\.com|media\.tailfin\.cc|medias\.apidura\.com|revelatedesigns\.com|missgrape\.net|ed58xxhnoja\.exactdn\.com|cyclite\.cc|vault\.widen\.net|www\.topeak\.com|rockgeist\.com)\//);
    assert.match(entry.sourceUrl, /^https:\/\/(?:us\.ortlieb\.com|arkel\.ca|www\.tailfin\.cc|www\.apidura\.com|restrap\.com|revelatedesigns\.com|missgrape\.net|cyclite\.cc|www\.bellhelmets\.com|www\.topeak\.com|rockgeist\.com)\//);
    assert.ok(statSync(resolve(root, entry.imageAssetPath)).size > 5_000);
    assert.ok(Array.isArray(entry.imageAssetPaths));
    assert.ok(Array.isArray(entry.sourceImageUrls));
    assert.ok(Array.isArray(entry.imageUrls));
    assert.equal(entry.imageAssetPaths.length, entry.sourceImageUrls.length);
    assert.equal(entry.imageAssetPaths.length, entry.imageUrls.length);
    entry.imageAssetPaths.forEach((imageAssetPath) => {
      assert.match(imageAssetPath, /^assets\/manufacturer-catalog\/(?:ortlieb|arkel|tailfin|apidura|restrap|revelate-designs|miss-grape|cyclite|blackburn|topeak|rockgeist)\/[a-z0-9-]+\.(?:jpg|png|webp)$/);
      assert.ok(statSync(resolve(root, imageAssetPath)).size > 1_000);
    });
    assert.ok(entry.variantCount > 0);
    assert.ok(Array.isArray(entry.variants));
    assert.equal(entry.sourceCheckedAt, {
      ORTLIEB: "2026-08-29",
      Arkel: "2026-08-29",
      Tailfin: "2026-08-30",
      Apidura: "2026-08-30",
      Restrap: "2026-09-01",
      "Revelate Designs": "2026-09-02",
      "Miss Grape": "2026-09-04",
      CYCLITE: "2026-09-04",
      Blackburn: "2026-09-04",
      Topeak: "2026-09-04",
      Rockgeist: "2026-09-04",
    }[entry.brand]);
  });
});

test("CRITICAL manufacturer catalog: Miss Grape keeps verified models and adjustable volumes", () => {
  const rows = MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Miss Grape");
  assert.equal(rows.length, 25);
  assert.ok(rows.every(({ family }) => family === "bikepacking"));
  assert.ok(!rows.some(({ id }) => /second-hand|protection-kit|ilcoso$/.test(id)));
  const tendril = rows.find(({ id }) => id === "miss-grape-tendril-10-7");
  assert.deepEqual(tendril.volumeOptions, [10, 17]);
  assert.equal(tendril.volumeMin, 10);
  assert.equal(tendril.volumeMax, 17);
  assert.deepEqual(tendril.weightOptions, [396]);
  assert.equal(rows.find(({ id }) => id === "miss-grape-cluster-7-wp").volume, 7);
});

test("CRITICAL manufacturer catalog: CYCLITE keeps official models, custom sizing, and fork set totals", () => {
  const rows = MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "CYCLITE");
  assert.equal(rows.length, 17);
  assert.ok(rows.every(({ family }) => family === "bikepacking"));
  const forkSingle = rows.find(({ id }) => id === "cyclite-fork-bag-01-single");
  const forkPair = rows.find(({ id }) => id === "cyclite-fork-bag-01-pair");
  assert.deepEqual({ volume: forkSingle.volume, weight: forkSingle.weight, soldAsSet: forkSingle.soldAsSet }, { volume: 3.1, weight: 224, soldAsSet: false });
  assert.deepEqual(
    { volumePerBag: forkPair.volumePerBag, weightPerBag: forkPair.weightPerBag, totalVolume: forkPair.totalVolume, totalWeight: forkPair.totalWeight, setQuantity: forkPair.setQuantity },
    { volumePerBag: 3.1, weightPerBag: 224, totalVolume: 6.2, totalWeight: 448, setQuantity: 2 }
  );
  const customFrame = rows.find(({ id }) => id === "cyclite-full-frame-bag-02");
  assert.deepEqual({ volume: customFrame.volume, weight: customFrame.weight, volumeOptions: customFrame.volumeOptions, weightOptions: customFrame.weightOptions }, { volume: 0, weight: 0, volumeOptions: [], weightOptions: [] });
  const topTube = rows.find(({ id }) => id === "cyclite-top-tube-bag-03");
  assert.deepEqual({ volume: topTube.volume, weightOptions: topTube.weightOptions }, { volume: 1.1, weightOptions: [124, 138] });
  assert.ok(topTube.imageAssetPaths.length > 1);
});

test("CRITICAL manufacturer catalog: Blackburn keeps the current official bag range and local galleries", () => {
  const rows = MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Blackburn");
  assert.equal(rows.length, 17);
  assert.ok(!rows.some(({ id }) => /rack|basket|pivot-pro|magnum/.test(id)));
  assert.equal(rows.filter(({ family }) => family === "bikepacking").length, 13);
  assert.equal(rows.filter(({ family }) => family === "panniers").length, 4);
  assert.equal(rows.reduce((count, entry) => count + entry.imageAssetPaths.length, 0), 85);
  assert.deepEqual(rows.find(({ id }) => id === "blackburn-outpost-frame-bag-medium").volumeOptions, [4.3, 5.8]);
  assert.deepEqual(rows.find(({ id }) => id === "blackburn-outpost-seat-pack-dry-bag").weightOptions, [475]);
  assert.equal(rows.find(({ id }) => id === "blackburn-outpost-elite-cargo-bag").category, "fork");
  assert.equal(rows.find(({ id }) => id === "blackburn-local-saddle-bag").category, "pannier");
});

test("CRITICAL manufacturer catalog: Topeak keeps current bags, splits volumes, and excludes accessories", () => {
  const rows = MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Topeak");
  assert.equal(rows.length, 104);
  assert.equal(new Set(rows.map(({ sourceUrl }) => sourceUrl)).size, 75);
  assert.equal(rows.reduce((count, entry) => count + entry.imageAssetPaths.length, 0), 374);
  assert.ok(!rows.some(({ id }) => /trunklock|rain-cover|phone-dry|pakgo|omni-strap|elementa-strap|freepack/.test(id)));
  assert.deepEqual(rows.find(({ id }) => id === "topeak-1423-backloader-x-10l").weightOptions, [550, 575]);
  assert.deepEqual(rows.find(({ id }) => id === "topeak-1423-backloader-x-15l").weightOptions, [555, 605]);
  assert.deepEqual(rows.find(({ id }) => id === "topeak-120-propack-0-43l").weightOptions, [78]);
  assert.equal(rows.find(({ id }) => id === "topeak-1327-pannier-drybag-24l").category, "pannier");
  assert.equal(rows.find(({ id }) => id === "topeak-1842-midloader-drybag-4-5l").category, "frame");
});

test("CRITICAL manufacturer catalog: Rockgeist keeps current bags, model-specific framebags, and local galleries", () => {
  const rows = MANUFACTURER_BAG_CATALOG.filter(({ brand }) => brand === "Rockgeist");
  assert.equal(rows.length, 114);
  assert.equal(new Set(rows.map(({ sourceUrl }) => sourceUrl)).size, 69);
  assert.equal(rows.reduce((count, entry) => count + entry.imageAssetPaths.length, 0), 651);
  assert.equal(new Set(rows.flatMap(({ imageAssetPaths }) => imageAssetPaths)).size, 440);
  assert.ok(!rows.some(({ id }) => /prototype|extra-mr-fusion|armadillo|replacement|strap|bolt-on-framebag/.test(id)));
  assert.equal(rows.filter(({ category }) => category === "saddle").length, 3);
  assert.deepEqual(rows.filter(({ id }) => id.startsWith("rockgeist-meanwhile-wald-basket-bag-")).map(({ volume }) => volume), [15, 25]);
  assert.equal(rows.find(({ id }) => id === "rockgeist-microwave-panniers").category, "pannier");
  assert.equal(rows.find(({ id }) => id === "rockgeist-cache-top-tube-bag-bolt-on").volume, 0.8);
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
  assert.deepEqual(prepared.photos, [photo]);
});

test("CRITICAL manufacturer catalog: every bundled image is prepared for the user bag", async () => {
  const entry = {
    ...MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-seat-pack-11l"),
    imageUrl: "/assets/catalog/seat-pack.jpg",
    imageUrls: [
      "/assets/catalog/seat-pack.jpg",
      "/assets/catalog/seat-pack-side.jpg",
      "/assets/catalog/seat-pack-bike.jpg"
    ]
  };
  const calls = [];
  class TestFile {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.type = options.type;
    }
  }
  const files = await fetchManufacturerBagCatalogImageFiles(entry, {
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, blob: async () => new Blob([url], { type: "image/jpeg" }) };
    },
    FileCtor: TestFile
  });
  assert.deepEqual(calls, manufacturerBagCatalogImageUrls(entry));
  assert.deepEqual(files.map(({ name }) => name), ["f9912.jpg", "f9912-2.jpg", "f9912-3.jpg"]);
  const prepared = await prepareManufacturerBagCatalogImport(entry, {
    fetchImageFiles: async () => files,
    createPhotoFromFile: async (file) => ({ id: file.name })
  });
  assert.deepEqual(prepared.photos.map(({ id }) => id), ["f9912.jpg", "f9912-2.jpg", "f9912-3.jpg"]);
});

test("CRITICAL manufacturer catalog: unmapped manufacturer details and source are copied into the note", () => {
  const entry = MANUFACTURER_BAG_CATALOG.find(({ id }) => id === "ortlieb-back-roller-20l-pair");
  const note = manufacturerBagCatalogNote(entry, { language: "ru" });
  assert.match(note, /Характеристики производителя/);
  assert.match(note, /Артикул \(SKU\):/);
  assert.match(note, /Материал:/);
  assert.match(note, /Крепление:/);
  assert.match(note, /Формат продажи: комплект, 2 шт\./);
  assert.match(note, /Объём одной сумки: 20 л/);
  assert.match(note, /Официальная страница: https:\/\/us\.ortlieb\.com/);
  assert.match(note, /Проверено: 2026-08-29/);
});

test("CRITICAL manufacturer catalog: adapter-specific technical data is copied into the note", () => {
  const note = manufacturerBagCatalogNote({
    brand: "Tailfin",
    name: "Half Frame Bag",
    manufacturerDetails: "Construction: 210D Hypalon\nIncluded: four Cargo Straps",
    sourceUrl: "https://www.tailfin.cc/us/product/frame-bags/half-frame-bag/",
    sourceCheckedAt: "2026-08-30",
  }, { language: "ru" });
  assert.match(note, /Дополнительные данные производителя/);
  assert.match(note, /210D Hypalon/);
  assert.match(note, /four Cargo Straps/);
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
    rootContainerNote: { value: draft.note },
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
  assert.match(state.containers["catalog-bag"].note, /Official page: https:\/\/arkel\.ca/);
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
    ["Apidura", "Arkel", "Blackburn", "CYCLITE", "Miss Grape", "ORTLIEB", "Restrap", "Revelate Designs", "Rockgeist", "Topeak"]
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
  const comparison = manufacturerBagComparisonRows(MANUFACTURER_BAG_CATALOG, "pannier")
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

  const backRollerXl = manufacturerBagComparisonRows(MANUFACTURER_BAG_CATALOG, "pannier")
    .find(({ id }) => id === "ortlieb-back-roller-35l-mesh-pocket-pair");
  assert.deepEqual(backRollerXl.weightPerBagOptions, [1006, 1199]);
  assert.deepEqual(backRollerXl.weightOptions, [2012, 2398]);
});

test("CRITICAL manufacturer catalog: Arkel pair totals are normalized for one-bag comparison", () => {
  const rows = manufacturerBagComparisonRows(MANUFACTURER_BAG_CATALOG, "pannier");
  const dryLites28 = rows.find(({ id }) => id === "arkel-dry-lites-saddle-bags-28l");
  const dryLites36 = rows.find(({ id }) => id === "arkel-dry-lites-saddle-bags-36l");
  const gt54 = rows.find(({ id }) => id === "arkel-gt-54-classic-touring-panniers");
  const t42 = rows.find(({ id }) => id === "arkel-t-42-classic-touring-panniers");
  const t28 = manufacturerBagComparisonRows(MANUFACTURER_BAG_CATALOG, "pannier")
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

test("CRITICAL manufacturer catalog: adapter-authoritative weights stay paired with their size rows", () => {
  const rows = splitManufacturerBagCatalogSkuModels([{
    id: "tailfin-order-contract",
    brand: "Tailfin",
    name: "Tailfin Order Contract",
    volume: 9.1,
    volumeOptions: [9.1, 12.5, 14.7],
    weight: 733,
    weightOptions: [733, 817, 785],
    variantWeightsAuthoritative: true,
    variants: [
      { sku: "9.1L", title: "9.1 L", volume: 9.1, weight: 733, available: true },
      { sku: "12.5L", title: "12.5 L", volume: 12.5, weight: 817, available: true },
      { sku: "14.7L", title: "14.7 L", volume: 14.7, weight: 785, available: true }
    ],
    description: { en: "9.1 / 12.5 / 14.7 L", ru: "9.1 / 12.5 / 14.7 L" }
  }]);
  assert.deepEqual(rows.map(({ volume, weight }) => [volume, weight]), [
    [9.1, 733],
    [12.5, 817],
    [14.7, 785]
  ]);
  assert.ok(rows.every(({ variantWeightsAuthoritative }) => variantWeightsAuthoritative));
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
  assert.match(controller, /bagCatalog\.useHelp/);
  assert.match(controller, /renderManufacturerCatalogPhotoGallery/);
  assert.match(controller, /PRODUCT_BATCH_SIZE = 12/);
  assert.match(controller, /IntersectionObserver/);
  assert.match(controller, /bindManufacturerCatalogPhotoLoading\(refs\.bagCatalogResults\)/);
  assert.match(controller, /bindHorizontalTouchScroll\(refs\?\.bagCatalogBrands\)/);
  assert.match(styles, /\.manufacturer-brand-picker\s*\{[^}]*touch-action:\s*pan-y pinch-zoom;/s);
  assert.match(styles, /\.manufacturer-brand-picker\s*>\s*\*\s*\{[^}]*touch-action:\s*pan-y pinch-zoom;/s);
  assert.match(comparison, /manufacturerBagComparisonRows/);
  assert.match(comparison, /manufacturerBagComparisonViewRows/);
  assert.match(comparison, /comparisonVolumeText\(entry\.volumeOptions, entry\.volumeTotalOptions/);
  assert.match(comparison, /data-bag-comparison-detail/);
  assert.match(comparison, /renderManufacturerCatalogPhotoGallery/);
  assert.match(comparison, /visualViewport/);
  assert.match(styles, /grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.manufacturer-comparison-filter-body[\s\S]*overflow-y:\s*auto/);
  assert.match(styles, /\.manufacturer-comparison-filter-panel > footer[\s\S]*border-top/);
  assert.match(appTail, /prepareManufacturerBagCatalogImport/);
  assert.match(appTail, /import\("\.\.\/data\/manufacturer-bag-catalog-runtime\.js"\)/);
  assert.match(appTail, /MANUFACTURER_BAG_CATALOG_INDEX/);
  assert.match(appTail, /loadManufacturerBagCatalog/);
  assert.doesNotMatch(appTail, /from "\.\.\/data\/manufacturer-bag-catalog\.js"/);
  assert.match(appTail, /refs\.rootContainerNote\.value = draft\.note/);
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
  assert.equal((i18n.match(/"bagCatalog\.loading"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.loadError"/g) || []).length, 2);
});

test("CRITICAL manufacturer catalog: explicit offline cache stores only unique primary previews", async () => {
  const records = new Map();
  const cache = {
    keys: async () => [...records.keys()].map((url) => new Request(url)),
    match: async (request) => records.get(typeof request === "string" ? request : request.url),
    put: async (request, response) => records.set(typeof request === "string" ? request : request.url, response)
  };
  const cachesImpl = {
    open: async () => cache,
    delete: async () => {
      records.clear();
      return true;
    }
  };
  const catalog = [
    { imageUrls: ["https://example.test/a.jpg", "https://example.test/a-2.jpg"] },
    { imageUrl: "https://example.test/b.jpg" },
    { imageUrls: ["https://example.test/a.jpg"] }
  ];
  const fetched = [];
  const progress = [];
  const result = await cacheManufacturerCatalogPreviews(catalog, {
    cachesImpl,
    fetchImpl: async (url, options) => {
      fetched.push([url, options.headers["X-Bike-Packing-Offline-Catalog"]]);
      return new Response("preview", { status: 200, headers: { "content-length": "7" } });
    },
    onProgress: (value) => progress.push(value.completed),
    storageManager: { persist: async () => true }
  });
  assert.deepEqual(manufacturerCatalogPreviewUrls(catalog), ["https://example.test/a.jpg", "https://example.test/b.jpg"]);
  assert.equal(result.files, 2);
  assert.equal(result.downloaded, 2);
  assert.equal(result.bytes, 14);
  assert.equal(progress.at(-1), 2);
  assert.deepEqual(fetched.map(([url]) => url).sort(), manufacturerCatalogPreviewUrls(catalog).sort());
  assert.ok(fetched.every(([, marker]) => marker === "1"));
  assert.deepEqual(await manufacturerCatalogOfflineUsage({ cachesImpl }), { available: true, bytes: 14, files: 2 });
  assert.equal(await clearManufacturerCatalogOffline({ cachesImpl }), true);
  assert.deepEqual(await manufacturerCatalogOfflineUsage({ cachesImpl }), { available: false, bytes: 0, files: 0 });
});

test("CRITICAL manufacturer catalog: browser storage reports usable offline capacity", async () => {
  assert.deepEqual(await browserStorageEstimate({
    storageManager: {
      estimate: async () => ({ quota: 1000, usage: 250 }),
      persisted: async () => true
    }
  }), { available: 750, persisted: true, quota: 1000, usage: 250 });
});
