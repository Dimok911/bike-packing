import test from "node:test";
import assert from "node:assert/strict";
import { catalogDuplicateIds } from "../../src/state/catalog-duplicates.js";
import { itemsForItemsView, rootContainersForSettings } from "../../src/state/catalog-lists.js";
import { makeItemCopyName } from "../../src/state/names.js";

test("duplicate search includes originals, legacy copies and standalone named copies", () => {
  const records = [{ id: "a", name: " Pump " }, { id: "b", name: "PUMP copy 2" }, { id: "c", name: "Pump копия" },
    { id: "d", name: "Tent" }, { id: "e", name: " Mat  copy " }, { id: "f", name: "" }];
  assert.deepEqual([...catalogDuplicateIds(records)].sort(), ["a", "b", "c", "e"]);
  assert.equal(makeItemCopyName("Pump", { b: { name: "Pump copy" } }), "Pump copy 2");
  assert.equal(itemsForItemsView(records, { duplicatesOnly: true }).length, 4);
  assert.equal(itemsForItemsView(records).length, 6);
});

test("duplicate bag filtering excludes records outside the current catalog before grouping", () => {
  const state = { containers: { a: { id: "a", name: "Bag" }, b: { id: "b", name: "Bag" }, c: { id: "c", name: "Solo" }, d: { id: "d", name: "Solo" } } };
  assert.deepEqual(rootContainersForSettings(state, { duplicatesOnly: true,
    isPrivateCatalogContainerRecord: (id) => id !== "d" }).map((record) => record.id).sort(), ["a", "b"]);
});
