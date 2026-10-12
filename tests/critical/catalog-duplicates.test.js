import test from "node:test";
import assert from "node:assert/strict";
import { catalogDuplicateGroups, catalogDuplicateIds } from "../../src/state/catalog-duplicates.js";
import { itemUsageCountsForCatalog, itemsForItemsView, rootContainerUsageCountsForCatalog, rootContainersForSettings } from "../../src/state/catalog-lists.js";
import { renderCatalogDuplicateGroups } from "../../src/ui/catalog-duplicates.js";
import { makeItemCopyName } from "../../src/state/names.js";

test("duplicate search requires a matching companion even for a copy suffix", () => {
  const records = [{ id: "a", name: " Pump " }, { id: "b", name: "PUMP copy 2" }, { id: "c", name: "Pump копия" },
    { id: "d", name: "Tent" }, { id: "e", name: " Mat  copy " }, { id: "f", name: "" }];
  assert.deepEqual([...catalogDuplicateIds(records)].sort(), ["a", "b", "c"]);
  assert.equal(makeItemCopyName("Pump", { b: { name: "Pump copy" } }), "Pump copy 2");
  assert.equal(itemsForItemsView(records, { duplicatesOnly: true }).length, 3);
  assert.equal(itemsForItemsView(records).length, 6);
});

test("same-name tents and socks with different characteristics or photos are not duplicates", () => {
  const original = { id: "original", name: "Палатка", weight: 1200, color: "green", dimensions: { width: 120 },
    categories: ["camp"], note: "one person", photos: [{ id: "p", url: "/photos/tent.jpg" }] };
  const variants = [
    { weight: 1800 }, { color: "blue" }, { dimensions: { width: 150 } }, { categories: ["other"] },
    { note: "two people" }, { photos: [{ id: "p2", url: "/photos/other-tent.jpg" }] }, { photos: [] }
  ].map((fields, i) => ({ ...original, ...fields, id: `different-${i}`, name: "Палатка copy" }));
  assert.equal(catalogDuplicateIds([original, ...variants]).size, 0);
  assert.deepEqual([...catalogDuplicateIds([original, { ...original, id: "copy", name: "Палатка copy",
    photos: [{ id: "new-id", url: "/photos/tent.jpg" }] }])].sort(), ["copy", "original"]);
  assert.equal(catalogDuplicateIds([{ id: "a", name: "Носки", photos: [{ localId: "a-photo" }] },
    { id: "b", name: "Носки", photos: [{ localId: "b-photo" }] }]).size, 0);
});

test("broken originals and copies are excluded from duplicate groups and have a separate filter", () => {
  const records = [{ id: "a", name: "Pump" }, { id: "b", name: "Pump copy", availabilityStatus: "broken" },
    { id: "c", name: "Pump", availabilityStatus: "broken" }];
  assert.equal(catalogDuplicateIds(records).size, 0);
  assert.deepEqual(itemsForItemsView(records, { itemUsageFilter: "broken" }).map(r => r.id).sort(), ["b", "c"]);
  assert.equal(itemUsageCountsForCatalog(records).broken, 2);
  assert.equal(itemUsageCountsForCatalog(records).duplicates, 0);
});

test("duplicate pairs stay together through search and counts include every displayed companion", () => {
  const records = [{ id: "a1", name: "Pump" }, { id: "b1", name: "Tent" },
    { id: "a2", name: "Pump copy" }, { id: "b2", name: "Tent copy" }, { id: "b3", name: "Tent copy 2" }];
  assert.deepEqual(catalogDuplicateGroups(records).map(group => group.map(r => r.id)), [["a1", "a2"], ["b1", "b2", "b3"]]);
  const matches = r => r.name === "Tent copy";
  assert.equal(itemsForItemsView(records, { itemUsageFilter: "duplicates", matchesItemsViewFilters: matches }).length, 3);
  assert.equal(itemUsageCountsForCatalog(records, { matchesItemsViewFilters: matches }).duplicates, 3);
  const state = { containers: Object.fromEntries(records.map(r => [r.id, r])) };
  assert.equal(rootContainerUsageCountsForCatalog(state, { matchesRootContainerFieldsFilter: matches }).duplicates, 3);
  assert.equal(rootContainersForSettings(state, { rootContainerUsageFilter: "duplicates", matchesRootContainerFieldsFilter: matches }).length, 3);
  const html = renderCatalogDuplicateGroups(records, r => `<article>${r.id}</article>`);
  assert.equal((html.match(/data-duplicate-group=/g) || []).length, 2);
  assert.ok(html.indexOf("a2</article>") < html.indexOf("b1</article>"));
});

test("duplicate bag filtering excludes records outside the current catalog before grouping", () => {
  const state = { containers: { a: { id: "a", name: "Bag" }, b: { id: "b", name: "Bag" }, c: { id: "c", name: "Solo" }, d: { id: "d", name: "Solo" } } };
  assert.deepEqual(rootContainersForSettings(state, { duplicatesOnly: true,
    isPrivateCatalogContainerRecord: (id) => id !== "d" }).map((record) => record.id).sort(), ["a", "b"]);
});
