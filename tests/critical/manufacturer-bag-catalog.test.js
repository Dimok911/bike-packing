import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  MANUFACTURER_BAG_CATALOG_OVERRIDES_KEY,
  readManufacturerBagCatalogOverrides,
  writeManufacturerBagCatalogOverride
} from "../../src/storage/manufacturer-bag-catalog-overrides.js";
import { saveRootContainerDialogAction } from "../../src/ui/item-dialog-save.js";

const root = resolve(import.meta.dirname, "../..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("CRITICAL bag catalog: stable ORTLIEB entries cover both families and bikepacking categories", () => {
  assert.deepEqual(MANUFACTURER_BAG_CATALOG_FAMILIES.map(({ id }) => id), ["bikepacking", "panniers"]);
  assert.ok(MANUFACTURER_BAG_CATALOG.length >= 7);
  assert.equal(new Set(MANUFACTURER_BAG_CATALOG.map(({ id }) => id)).size, MANUFACTURER_BAG_CATALOG.length);
  assert.equal(new Set(MANUFACTURER_BAG_CATALOG.map(({ sku }) => sku)).size, MANUFACTURER_BAG_CATALOG.length);
  assert.ok(MANUFACTURER_BAG_CATALOG.some(({ family }) => family === "panniers"));
  MANUFACTURER_BAG_CATALOG_CATEGORIES.forEach(({ id }) => {
    assert.ok(
      MANUFACTURER_BAG_CATALOG.some(({ category }) => category === id),
      `catalog needs a prototype entry for ${id}`
    );
  });
  MANUFACTURER_BAG_CATALOG.forEach((entry) => {
    assert.match(entry.imageUrl, /^https:\/\/cdn\.shopify\.com\//);
    assert.match(entry.sourceUrl, /^https:\/\/de\.ortlieb\.com\//);
    assert.ok(entry.weight > 0);
    assert.ok(entry.volume > 0);
  });
});

test("CRITICAL bag catalog: global search covers name, SKU, Russian aliases and specifications", () => {
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
  assert.equal(
    filterManufacturerBagCatalog(MANUFACTURER_BAG_CATALOG, { family: "panniers" }).length,
    2
  );
});

test("CRITICAL bag catalog: admin overrides merge without dropping immutable catalog structure", () => {
  const merged = mergeManufacturerBagCatalogOverrides(MANUFACTURER_BAG_CATALOG, [{
    id: "ortlieb-seat-pack-11-f9912",
    name: "Seat-Pack edited",
    dimensions: { width: 41 },
    description: { ru: "Новое описание", en: "Updated description" }
  }]);
  const edited = merged.find(({ id }) => id === "ortlieb-seat-pack-11-f9912");
  assert.equal(edited.name, "Seat-Pack edited");
  assert.deepEqual(edited.dimensions, { width: 41, height: 26, depth: 15 });
  assert.equal(edited.description.ru, "Новое описание");
  assert.equal(edited.family, "bikepacking");
  assert.equal(edited.sku, "F9912");
});

test("CRITICAL bag catalog: local admin override storage replaces only the edited model", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  writeManufacturerBagCatalogOverride({
    id: "ortlieb-seat-pack-11-f9912",
    name: "First edit"
  }, storage);
  const rows = writeManufacturerBagCatalogOverride({
    id: "ortlieb-seat-pack-11-f9912",
    name: "Second edit"
  }, storage);
  assert.equal(rows.length, 1);
  assert.equal(readManufacturerBagCatalogOverrides(storage)[0].name, "Second edit");
  assert.ok(values.has(MANUFACTURER_BAG_CATALOG_OVERRIDES_KEY));
});

test("CRITICAL bag catalog: selecting a model creates a normal bag with traceable source metadata", () => {
  const entry = MANUFACTURER_BAG_CATALOG[0];
  const draft = manufacturerBagContainerDraft(entry);
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
    rootContainerSourceMeta: () => manufacturerBagSourceMeta(entry),
    state
  });

  assert.equal(result.created, true);
  assert.equal(state.containers["catalog-bag"].name, "ORTLIEB Seat-Pack 11 L");
  assert.equal(state.containers["catalog-bag"].manufacturerCatalogSource.sku, "F9912");
  assert.equal(state.containers["catalog-bag"].manufacturerCatalogSource.provider, "ortlieb.com");
  assert.deepEqual(state.containers["catalog-bag"].photos, []);
});

test("CRITICAL bag catalog: UI exposes catalog import and admin editor with bilingual copy", () => {
  const index = read("index.html");
  const controller = read("src/ui/manufacturer-bag-catalog-dialog.js");
  const i18n = read("src/data/i18n.js");
  assert.match(index, /id="openBagCatalogBtn"/);
  assert.match(index, /id="bagCatalogDialog"/);
  assert.match(index, /id="bagCatalogEditDialog"/);
  assert.match(controller, /canEdit\(\)/);
  assert.match(controller, /data-bag-catalog-edit/);
  assert.equal((i18n.match(/"bagCatalog\.open"/g) || []).length, 2);
  assert.equal((i18n.match(/"bagCatalog\.adminLocalNotice"/g) || []).length, 2);
});
