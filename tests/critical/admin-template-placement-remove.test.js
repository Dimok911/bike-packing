import test from "node:test";
import assert from "node:assert/strict";
import { prepareAdminTemplatePlacementRemoval } from "../../src/sync/admin-template-placement-remove.js";
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
for (const [action, sourceId, reusable] of [["remove-item", "source", false], ["remove-container", "bag", false], ["remove-container", "pocket", false], ["remove-container", "pocket", true]]) {
  test(`admin removal ${action} ${sourceId} reusable=${reusable} preserves catalog records and only deletes temporary containers`, () => {
    const state = fixture(reusable), original = structuredClone(state), request = { sourceLayoutId: "layout", targetLayoutId: "layout", action, sourceId };
    const result = prepareAdminTemplatePlacementRemoval(state, request, options), layout = result.snapshot.layouts.layout;
    assert.deepEqual(state, original); assert.deepEqual(result.entries, []); assert.deepEqual(Object.keys(result.snapshot.items).sort(), Object.keys(state.items).sort());
    const gone = action === "remove-item" ? ["source"] : sourceId === "bag" ? ["anchor", "source", "inside"] : ["source", "inside"];
    assert.deepEqual([...result.removedItemIds].sort(), gone.sort());
    for (const id of gone) { assert.deepEqual(result.snapshot.items[id], { ...original.items[id], containerId: "" }); assert.equal(layout.arrangement.items[id], undefined); assert.equal(layout.arrangement.itemQuantities[id], undefined); }
    if (sourceId !== "bag") assert.equal(layout.arrangement.itemQuantities.anchor, 4);
    assert.equal(Boolean(result.snapshot.containers.pocket), action === "remove-item" || reusable);
    assert.ok(result.snapshot.containers.bag); assert.ok(result.snapshot.containers.nested);
    if (action !== "remove-item") {
      assert.deepEqual(result.snapshot.containers.nested, { ...original.containers.nested, parentId: null, childIds: [], itemIds: [], order: [] });
      assert.deepEqual(result.removals, reusable ? [] : [{ type: "containers", id: "pocket" }]);
    }
    assert.deepEqual(createLayoutArrangementFromCurrentState(result.snapshot, layout.rootContainerIds, { itemQuantities: layout.arrangement.itemQuantities }), layout.arrangement);
  });
}
test("admin removal rejects foreign owners, files, stale duplicate references and repairable data", () => {
  for (const change of [
    s => { s.items.source.publicCatalogLayoutId = "foreign"; }, s => { s.containers.pocket.photos = [{ id: "photo" }]; },
    s => { delete s.layouts.layout.arrangement.itemQuantities.source; },
    s => { s.layouts.other = { arrangement: { items: { source: "pocket" }, containers: {} } }; },
    s => { s.containers.detached = { id: "detached", childIds: ["pocket"] }; }
  ]) {
    const state = fixture(); change(state); const original = structuredClone(state);
    assert.throws(() => prepareAdminTemplatePlacementRemoval(state, { action: "remove-container", sourceId: "pocket", sourceLayoutId: "layout", targetLayoutId: "layout" }, options)); assert.deepEqual(state, original);
  }
});
