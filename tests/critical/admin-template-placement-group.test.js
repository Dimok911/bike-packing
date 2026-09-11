import test from "node:test";
import assert from "node:assert/strict";
import { prepareAdminTemplatePlacementGroup } from "../../src/sync/admin-template-placement-group.js";
import { createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";

const options = { operationId: "ea8e3e1c-027e-4625-9b41-bcbb54302161", changedAt: "2026-09-11T04:00:00Z" };
function fixture(sameParent) {
  const own = row => ({ ...row, publicCatalogLayoutId: "layout" });
  const state = { activeLayoutId: "layout", packedItems: {}, collapsedContainers: {}, layouts: {},
    containers: { bag: own({ id: "bag", parentId: "", childIds: ["pocket"], itemIds: sameParent ? ["anchor", "source", "target"] : ["anchor", "target"],
      order: sameParent ? [{ type: "item", id: "anchor" }, { type: "item", id: "source" }, { type: "container", id: "pocket" }, { type: "item", id: "target" }]
        : [{ type: "item", id: "anchor" }, { type: "container", id: "pocket" }, { type: "item", id: "target" }] }),
      pocket: own({ id: "pocket", parentId: "bag", childIds: [], itemIds: sameParent ? [] : ["source"], order: sameParent ? [] : [{ type: "item", id: "source" }] }) },
    items: { anchor: own({ id: "anchor", containerId: "bag", quantity: 6 }), source: own({ id: "source", containerId: sameParent ? "bag" : "pocket", quantity: 3 }), target: own({ id: "target", containerId: "bag", quantity: 4 }) } };
  state.layouts.layout = { id: "layout", adminCausalSource: { exists: true }, rootContainerIds: ["bag"], arrangement: createLayoutArrangementFromCurrentState(state, ["bag"]) };
  for (const row of Object.values(state.items)) row.quantity = 1;
  return state;
}
for (const sameParent of [false, true]) test(`admin group fixes one ID and keeps mixed order/quantities from ${sameParent ? "same" : "different"} parents`, () => {
  const state = fixture(sameParent), original = structuredClone(state), request = { sourceId: "source", targetItemId: "target", sourceLayoutId: "layout", targetLayoutId: "layout" };
  const result = prepareAdminTemplatePlacementGroup(state, request, options), id = `container-template-group-${options.operationId}`;
  assert.deepEqual(state, original); assert.equal(result.rootId, id);
  assert.deepEqual(result.entries, [{ type: "containers", targetId: id }]);
  const layout = result.snapshot.layouts.layout, group = layout.arrangement.containers[id];
  assert.deepEqual(group, { parentId: "bag", childIds: [], itemIds: ["target", "source"], order: [{ type: "item", id: "target" }, { type: "item", id: "source" }] });
  assert.deepEqual(layout.arrangement.containers.bag.order, [{ type: "item", id: "anchor" }, { type: "container", id: "pocket" }, { type: "container", id }]);
  assert.deepEqual(layout.arrangement.containers.pocket.itemIds, []); assert.deepEqual(layout.arrangement.itemQuantities, { anchor: 6, source: 3, target: 4 });
  assert.deepEqual(Object.keys(result.snapshot.items).sort(), Object.keys(original.items).sort());
  assert.equal(result.snapshot.containers[id].publicCatalogLayoutId, "layout");
  assert.deepEqual(createLayoutArrangementFromCurrentState(result.snapshot, layout.rootContainerIds, { itemQuantities: layout.arrangement.itemQuantities }), layout.arrangement);
  assert.deepEqual(prepareAdminTemplatePlacementGroup(original, request, options), result);
});
test("admin grouping rejects unknown/foreign sources, photos, ID collisions and ambiguous placement", () => {
  for (const change of [
    (s,r) => { r.targetItemId = "source"; },
    (s,r) => { s.items.source.publicCatalogLayoutId = "foreign"; },
    (s,r) => { s.items.source.photos = [{ id: "photo" }]; },
    (s,r) => { delete s.layouts.layout.arrangement.itemQuantities.source; },
    (s,r) => { s.layouts.layout.arrangement.containers.pocket.itemIds.push("source"); },
    (s,r) => { s.containers[`container-template-group-${options.operationId}`] = {}; }
  ]) {
    const state = fixture(false), request = { sourceId: "source", targetItemId: "target", sourceLayoutId: "layout", targetLayoutId: "layout" }; change(state, request);
    const original = structuredClone(state); assert.throws(() => prepareAdminTemplatePlacementGroup(state, request, options)); assert.deepEqual(state, original);
  }
});
