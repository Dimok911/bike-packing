import test from "node:test";
import assert from "node:assert/strict";
import { itemStockQuantity, itemStockLocations, setItemStockQuantity, setItemStockLocations, moveItemStock, renameItemStockLocation, addPurchasedStock } from "../../src/state/item-stock.js";
import { matchesItemFieldsFilter } from "../../src/state/catalog-search.js";
import { normalizeItemFields } from "../../src/state/normalize.js";
import { layoutPreparation } from "../../src/state/layout-preparation.js";
import { getLayoutItemQuantity } from "../../src/state/layout-item-quantity.js";
import { compactItemForEntitySync } from "../../src/sync/serialize.js";
import { dictionaryOptionsForUi, removeCustomDictionaryValue, renameCustomDictionaryValue } from "../../src/state/dictionaries.js";
import { createBlankBikePackingState } from "../../src/state/empty-state.js";
import { renderDictionaryEntryHtml } from "../../src/ui/settings-render.js";
import { isItemUnavailableForPacking } from "../../src/state/layout-locks.js";
import { createSharedEntitySnapshotPayload } from "../../src/public/shared-entity-link.js";

function fixture() {
  return {
    activeLayoutId: "trip",
    locations: ["Дома", "Надо купить"], customLocations: ["Надо купить"],
    items: {
      oats: { id: "oats", name: "Каша", quantity: 1, stockQuantity: 3, containerId: "bag" },
      lamp: { id: "lamp", name: "Фонарь", quantity: 1, categories: ["Нужна починка", "Требует заряда"], containerId: "bag" },
      kit: { id: "kit", name: "Ремнабор", quantity: 1, categories: ["Ремонт"], containerId: "bag" },
      outside: { id: "outside", categories: ["Требует заряда"] }
    },
    containers: { bag: { id: "bag", itemIds: ["oats", "lamp", "kit"], childIds: [], order: [] } },
    layouts: {
      trip: { id: "trip", rootContainerIds: ["bag"], arrangement: { rootContainerIds: ["bag"], containers: { bag: { itemIds: ["oats", "lamp", "kit"] } }, items: { oats: "bag", lamp: "bag", kit: "bag" }, itemQuantities: { oats: 7, lamp: 1, kit: 1 } } },
      short: { id: "short", arrangement: { items: { oats: "bag" }, itemQuantities: { oats: 2 } } }
    }
  };
}

test("migration defaults stock to one, translates purchase location to zero and preserves entered stock", () => {
  const state = fixture();
  state.items.lamp.location = "Надо купить";
  state.items.kit.location = "Надо купить";
  state.items.kit.stockQuantity = 5;
  state.items.oats.stockQuantity = 0;
  normalizeItemFields(state);
  assert.equal(state.items.lamp.stockQuantity, 0);
  assert.equal(state.items.lamp.location, "Не знаю где");
  assert.equal(state.items.kit.stockQuantity, 5);
  assert.equal(state.items.oats.stockQuantity, 0);
  assert.equal(state.items.outside.stockQuantity, 1);
  assert.deepEqual(state.locations, ["Дома"]);
  assert.deepEqual(state.customLocations, []);
  setItemStockQuantity(state.items.lamp, 4);
  normalizeItemFields(state);
  assert.equal(state.items.lamp.stockQuantity, 4, "subsequent normalization must not reset purchases");
  assert.deepEqual(dictionaryOptionsForUi("location", ["Дома", "Надо купить"], { selected: ["Надо купить"] }), ["Дома"]);
});

test("each layout compares its own plan to common stock, with unique item counts and existing task categories", () => {
  const state = fixture();
  const tasks = layoutPreparation(state, "trip");
  assert.deepEqual(tasks.buy.map(({ item, missing }) => [item.id, missing]), [["oats", 4]]);
  assert.deepEqual(tasks.repair.map(({ item }) => item.id), ["lamp"]);
  assert.deepEqual(tasks.charge.map(({ item }) => item.id), ["lamp"]);
  assert.equal(layoutPreparation(state, "short").buy.length, 0);
  assert.equal(itemStockQuantity(state.items.lamp), 1);
  assert.equal(getLayoutItemQuantity(state, "trip", "oats"), 7);
});

test("partial purchases update only stock, survive entity sync and leave layout quantities intact", () => {
  const state = fixture();
  const before = JSON.stringify(state.layouts);
  assert.equal(addPurchasedStock(state.items.oats, 2), true);
  assert.equal(layoutPreparation(state, "trip").buy[0].missing, 2);
  assert.equal(compactItemForEntitySync(state.items.oats).stockQuantity, 5);
  assert.equal(addPurchasedStock(state.items.oats, 2), true);
  assert.equal(layoutPreparation(state, "trip").buy.length, 0);
  for (const value of [-1, 0, 1.5, "bad", Infinity]) assert.equal(addPurchasedStock(state.items.oats, value), false);
  assert.equal(JSON.stringify(state.layouts), before);
});

test("shared item snapshots do not expose inventory", () => {
  const state = fixture();
  setItemStockLocations(state.items.oats, [{ location: "Дом", quantity: 2 }, { location: "Дача", quantity: 1 }]);
  const snapshot = createSharedEntitySnapshotPayload(state, { entityType: "item", entityId: "oats", layoutId: "trip", scope: "entity" });
  assert.ok(snapshot);
  assert.equal(snapshot.items.oats.stockQuantity, undefined);
  assert.equal(state.items.oats.stockQuantity, 3);
});

test("stock by place migrates without losing zero, sums purchases and moves without changing the plan", () => {
  const state = fixture();
  const item = state.items.oats;
  item.location = "Дом";
  normalizeItemFields(state);
  assert.deepEqual(itemStockLocations(item), [{ location: "Дом", quantity: 3 }]);
  assert.equal(moveItemStock(item, "Дом", "Дача", 2), true);
  assert.deepEqual(itemStockLocations(item), [{ location: "Дом", quantity: 1 }, { location: "Дача", quantity: 2 }]);
  assert.equal(itemStockQuantity(item), 3);
  assert.equal(setItemStockQuantity(item, 9), false, "ambiguous aggregate edits cannot choose a place");
  assert.equal(addPurchasedStock(item, 1), false, "multi-place purchases need a destination");
  assert.equal(addPurchasedStock(item, 2, "Дача"), true);
  assert.equal(itemStockQuantity(item), 5);
  assert.equal(layoutPreparation(state, "trip").buy[0].missing, 2);
  assert.equal(matchesItemFieldsFilter(item, { location: "Дом" }), true);
  assert.equal(matchesItemFieldsFilter(item, { location: "Дача" }), true);
  assert.equal(matchesItemFieldsFilter(item, { location: "Гараж" }), false);
  assert.deepEqual(compactItemForEntitySync(item).stockLocations, item.stockLocations);
  const before = JSON.stringify(item);
  for (const count of [0, -1, 1.5, 20, Infinity]) assert.equal(moveItemStock(item, "Дом", "Дача", count), false);
  assert.equal(JSON.stringify(item), before);
  assert.equal(renameItemStockLocation(item, "Дом", "Дача"), true);
  assert.deepEqual(itemStockLocations(item), [{ location: "Дача", quantity: 5 }]);
  assert.equal(setItemStockQuantity(item, 0), true);
  normalizeItemFields(state);
  assert.deepEqual(itemStockLocations(item), [{ location: "Дача", quantity: 0 }]);
  assert.equal(getLayoutItemQuantity(state, "trip", "oats"), 7);
});

test("stock locations reject invalid totals and public snapshots omit every private stock field", () => {
  const state = fixture();
  const item = state.items.oats;
  assert.equal(setItemStockLocations(item, [{ location: "Дом", quantity: Number.MAX_SAFE_INTEGER }, { location: "Дача", quantity: 1 }]), false);
  assert.equal(setItemStockLocations(item, [{ location: "Дом", quantity: -1 }]), false);
  assert.equal(setItemStockLocations(item, []), false);
  setItemStockLocations(item, [{ location: "Дом", quantity: 2 }, { location: "Дача", quantity: 2 }]);
  const snapshot = createSharedEntitySnapshotPayload(state, { entityType: "item", entityId: "oats", layoutId: "trip", scope: "entity" });
  assert.ok(!JSON.stringify(snapshot).includes("stockLocations"));
  assert.ok(!JSON.stringify(snapshot).includes("stockQuantity"));
});

test("repair and charge are always available without creating personal dictionary entries", () => {
  const state = createBlankBikePackingState();
  const expected = ["Нужна починка", "Требует заряда"];
  assert.deepEqual(dictionaryOptionsForUi("category", state.categories), expected);
  assert.deepEqual(state.categories, [], "offering built-ins must not modify personal data");
  assert.deepEqual(dictionaryOptionsForUi("category", []), expected, "an empty remote dictionary cannot remove built-ins");
  assert.deepEqual(dictionaryOptionsForUi("category", ["нужна починка", "Требует заряда", "Еда"]), ["нужна починка", "Требует заряда", "Еда"]);
  for (const value of expected) {
    const owner = { categories: [value], customCategories: [value] };
    removeCustomDictionaryValue(owner, "category", value);
    renameCustomDictionaryValue(owner, "category", value, "Other");
    assert.deepEqual(owner.categories, [value]);
    const html = renderDictionaryEntryHtml("category", value);
    assert.match(html, /dictionary-chip-builtin/);
    assert.doesNotMatch(html, /data-remove-category|data-edit-category/);
  }
});

test("minor repair category allows packing while broken state remains unavailable", () => {
  const state = fixture();
  state.items.lamp.availabilityStatus = "available";
  assert.equal(isItemUnavailableForPacking(state.items.lamp), false);
  assert.equal(layoutPreparation(state, "trip").repair.length, 1);
  state.items.lamp.categories = [];
  state.items.lamp.availabilityStatus = "broken";
  assert.equal(isItemUnavailableForPacking(state.items.lamp), true);
  assert.equal(layoutPreparation(state, "trip").repair.length, 1);
});
