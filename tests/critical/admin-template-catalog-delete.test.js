import test from "node:test";
import assert from "node:assert/strict";
import { prepareAdminTemplateCatalogDeletion } from "../../src/sync/admin-template-catalog-delete.js";
import { createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";

const options = { operationId: "0897b4ea-f1a8-4c3a-9f19-47c2b27d5c04" };
function fixture(reusable = false) {
  const own = row => ({ ...row, publicCatalogLayoutId: "layout" });
  const state = { activeLayoutId: "layout", layouts: {}, packedItems: {}, collapsedContainers: {},
    containers: {
      bag: own({ id: "bag", name: "Bag", parentId: "", itemIds: ["anchor"], childIds: ["pocket"], order: [{ type: "item", id: "anchor" }, { type: "container", id: "pocket" }] }),
      pocket: own({ id: "pocket", name: "Pocket", nestable: reusable, parentId: "bag", itemIds: ["source"], childIds: ["nested"], order: [{ type: "item", id: "source" }, { type: "container", id: "nested" }] }),
      nested: own({ id: "nested", name: "Reusable descendant", nestable: true, parentId: "pocket", itemIds: ["inside"], childIds: [], order: [{ type: "item", id: "inside" }] }) },
    items: { anchor: own({ id: "anchor", containerId: "bag", quantity: 4 }), source: own({ id: "source", containerId: "pocket", quantity: 3 }), inside: own({ id: "inside", containerId: "nested", quantity: 2 }) } };
  state.layouts.layout = { id: "layout", adminCausalSource: { exists: true }, rootContainerIds: ["bag"], arrangement: createLayoutArrangementFromCurrentState(state, ["bag"]) };
  for (const row of Object.values(state.items)) row.quantity = 1;
  return state;
}
for (const kind of ["placed-item", "standalone-item", "detached-item", "root", "nested", "detached-tree"]) {
  test(`admin catalog delete ${kind} keeps unrelated records, quantities and reusable descendants`, () => {
    const state = fixture(kind === "nested"), itemOnly = kind.includes("item");
    if (kind.startsWith("detached") || kind === "standalone-item") {
      state.layouts.layout.rootContainerIds = []; state.layouts.layout.arrangement = { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, itemQuantityMigrationVersion: 3, packedItems: {} };
      for (const row of Object.values(state.items)) row.quantity = 3;
      if (kind === "standalone-item") { state.items.source.containerId = ""; state.containers.pocket.itemIds = []; state.containers.pocket.order = [{ type: "container", id: "nested" }]; }
    }
    const original = structuredClone(state), sourceId = itemOnly ? "source" : kind === "nested" ? "pocket" : "bag";
    const result = prepareAdminTemplateCatalogDeletion(state, { sourceId, action: itemOnly ? "delete-item" : "delete-container", sourceLayoutId: "layout", targetLayoutId: "layout" }, options);
    assert.deepEqual(state, original); assert.deepEqual(result.entries, []);
    assert.equal(result.snapshot[itemOnly ? "items" : "containers"][sourceId], undefined);
    assert.deepEqual(result.snapshot.items.inside, itemOnly ? original.items.inside : { ...original.items.inside, containerId: "" });
    if (itemOnly) { assert.equal(Object.keys(result.snapshot.items).length, 2); assert.deepEqual(result.removals, [{ type: "items", id: "source" }]); }
    else {
      assert.deepEqual(Object.keys(result.snapshot.items), Object.keys(original.items));
      assert.deepEqual(result.snapshot.containers.nested, { ...original.containers.nested, parentId: null, itemIds: [], childIds: [], order: [] });
      assert.equal(result.snapshot.containers.pocket, undefined);
    }
    if (kind === "placed-item" || kind === "nested") assert.equal(result.snapshot.layouts.layout.arrangement.itemQuantities.anchor, 4);
    if (kind.startsWith("detached") || kind === "standalone-item") assert.deepEqual(result.snapshot.layouts.layout.arrangement, original.layouts.layout.arrangement);
    assert.deepEqual(createLayoutArrangementFromCurrentState(result.snapshot, result.snapshot.layouts.layout.rootContainerIds, { itemQuantities: result.snapshot.layouts.layout.arrangement.itemQuantities }), result.snapshot.layouts.layout.arrangement);
  });
}
test("admin catalog deletion rejects foreign/cyclic/ambiguous membership, files and another placement", () => {
  for (const change of [
    s => { s.items.source.publicCatalogLayoutId = "foreign"; },
    s => { s.containers.nested.photos = [{ id: "file" }]; },
    s => { s.containers.pocket.itemIds.push("source"); },
    s => { s.containers.nested.childIds = ["bag"]; s.containers.bag.parentId = "nested"; },
    s => { s.items.source.containerId = "bag"; },
    s => { s.layouts.other = { arrangement: { items: { source: "pocket" } } }; },
    s => { s.containers.foreign = { id: "foreign", itemIds: ["source"] }; }
  ]) {
    const state = fixture(); change(state); const original = structuredClone(state);
    assert.throws(() => prepareAdminTemplateCatalogDeletion(state, { sourceId: "bag", action: "delete-container", sourceLayoutId: "layout", targetLayoutId: "layout" }, options));
    assert.deepEqual(state, original);
  }
});

for (const itemOnly of [false, true]) test(`admin catalog deletion freezes a complete ${itemOnly ? "item" : "container"} batch`, () => {
  const state = fixture(), original = structuredClone(state), sourceIds = itemOnly ? ["source", "anchor"] : ["bag", "nested"];
  const request = { sourceIds, action: itemOnly ? "delete-item" : "delete-container", sourceLayoutId: "layout", targetLayoutId: "layout" };
  const result = prepareAdminTemplateCatalogDeletion(state, request, options);
  assert.deepEqual(state, original);
  for (const id of sourceIds) assert.equal(result.snapshot[itemOnly ? "items" : "containers"][id], undefined);
  if (itemOnly) { assert.deepEqual(Object.keys(result.snapshot.items), ["inside"]); assert.deepEqual(Object.keys(result.snapshot.containers), Object.keys(original.containers)); }
  else { assert.deepEqual(result.snapshot.containers, {}); assert.deepEqual(Object.keys(result.snapshot.items), Object.keys(original.items)); }
  assert.deepEqual(createLayoutArrangementFromCurrentState(result.snapshot, result.snapshot.layouts.layout.rootContainerIds,
    { itemQuantities: result.snapshot.layouts.layout.arrangement.itemQuantities }), result.snapshot.layouts.layout.arrangement);
  assert.throws(() => prepareAdminTemplateCatalogDeletion(state, { ...request, sourceIds: [...sourceIds, "missing"] }, options));
  assert.throws(() => prepareAdminTemplateCatalogDeletion(state, { ...request, sourceIds: [sourceIds[0], sourceIds[0]] }, options));
  assert.deepEqual(state, original);
});
