import test from "node:test";
import assert from "node:assert/strict";
import { prepareAdminTemplatePlacementMove } from "../../src/sync/admin-template-placement-move.js";
import { createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";

const options = { operationId: "bac1a656-3a03-4c40-bb56-ec3f2216f9b4" };
function fixture() {
  const owned = row => ({ ...row, publicCatalogLayoutId: "layout" });
  const state = { activeLayoutId: "layout", layouts: {}, collapsedContainers: {}, packedItems: {},
    containers: {
      bag: owned({ id: "bag", parentId: "", nestable: true, childIds: ["pocket"], itemIds: ["anchor"], order: [{ type: "item", id: "anchor" }, { type: "container", id: "pocket" }] }),
      pocket: owned({ id: "pocket", parentId: "bag", nestable: true, childIds: [], itemIds: ["pump"], order: [{ type: "item", id: "pump" }] }),
      target: owned({ id: "target", parentId: "", nestable: true, childIds: [], itemIds: ["stays"], order: [{ type: "item", id: "stays" }] })
    }, items: {
      pump: owned({ id: "pump", containerId: "pocket", quantity: 3 }), anchor: owned({ id: "anchor", containerId: "bag", quantity: 2 }), stays: owned({ id: "stays", containerId: "target", quantity: 4 })
    } };
  state.layouts.layout = { id: "layout", rootContainerIds: ["bag", "target"], adminCausalSource: { exists: true }, arrangement: createLayoutArrangementFromCurrentState(state, ["bag", "target"]) };
  for (const row of Object.values(state.items)) row.quantity = 1;
  return state;
}
for (const [action, sourceId, targetContainerId, targetIndex] of [
  ["move-item", "pump", "target", 0], ["move-item", "anchor", "bag", 1],
  ["move-container", "pocket", "target", 0], ["move-container", "bag", "target", 1],
  ["move-root", "target", "", 0], ["lift-container", "pocket", "", 1]
]) test(`admin placement ${action} ${sourceId} preserves identities, quantities and editor capture`, () => {
  const state = fixture(), original = structuredClone(state);
  const result = prepareAdminTemplatePlacementMove(state, { action, sourceId, targetContainerId, targetIndex, sourceLayoutId: "layout", targetLayoutId: "layout" }, options);
  assert.deepEqual(state, original); assert.deepEqual(result.entries, []);
  const layout = result.snapshot.layouts.layout, arrangement = layout.arrangement;
  assert.deepEqual(arrangement.itemQuantities, { anchor: 2, pump: 3, stays: 4 });
  assert.deepEqual(Object.keys(arrangement.containers).sort(), ["bag", "pocket", "target"]);
  if (action === "move-item") {
    assert.equal(arrangement.items[sourceId], targetContainerId);
    assert.deepEqual(arrangement.containers[targetContainerId].order[targetIndex], { type: "item", id: sourceId });
    if (sourceId === "pump") assert.deepEqual(arrangement.containers.pocket.itemIds, []);
  } else if (action === "move-container") {
    assert.equal(arrangement.containers[sourceId].parentId, targetContainerId);
    assert.deepEqual(arrangement.containers[targetContainerId].order[targetIndex], { type: "container", id: sourceId });
    assert.equal(arrangement.items.pump, "pocket");
  } else assert.equal(arrangement.rootContainerIds[targetIndex], sourceId);
  if (action === "lift-container") assert.deepEqual(arrangement.containers.bag.order, [{ type: "item", id: "anchor" }]);
  const captured = createLayoutArrangementFromCurrentState(result.snapshot, layout.rootContainerIds, { itemQuantities: arrangement.itemQuantities });
  assert.deepEqual(captured, arrangement);
});
test("admin moves reject cycles, foreign parents, missing placements and quantity repairs without mutation", () => {
  for (const change of [
    (s,r) => { r.targetContainerId = "pocket"; },
    (s,r) => { s.containers.target.publicCatalogLayoutId = "foreign"; },
    (s,r) => { delete s.layouts.layout.arrangement.itemQuantities.pump; },
    (s,r) => { s.layouts.layout.arrangement.containers.bag.childIds.push("pocket"); },
    (s,r) => { r.action = "lift-container"; r.sourceId = "pocket"; s.containers.pocket.nestable = false; },
    (s,r) => { r.targetIndex = -1; },
    (s,r) => { s.items.pump.photos = [{ id: "photo" }]; },
    (s,r) => { r.sourceLayoutId = "foreign"; }
  ]) {
    const state = fixture(), request = { action: "move-container", sourceId: "bag", targetContainerId: "target", targetIndex: 0, sourceLayoutId: "layout", targetLayoutId: "layout" };
    change(state, request); const original = structuredClone(state);
    assert.throws(() => prepareAdminTemplatePlacementMove(state, request, options)); assert.deepEqual(state, original);
  }
});
