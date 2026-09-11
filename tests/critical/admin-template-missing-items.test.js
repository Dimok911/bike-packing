import test from "node:test";
import assert from "node:assert/strict";
import { prepareAdminTemplateMissingItems } from "../../src/sync/admin-template-missing-items.js";
import { createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";

const options = { operationId: "4677bf9a-4af6-4bd0-8cfb-6bf452a88350" };
const request = { rootId: "source-bag", includeContents: true, sourceLayoutId: "source", targetLayoutId: "target", targetParentId: "", targetIndex: 0 };
function fixture() {
  const state = { activeLayoutId: "source", layouts: {}, containers: {}, items: {}, packedItems: {}, collapsedContainers: {} };
  const bag = (id, owner, name, parentId, itemIds, childIds) => state.containers[id] = { id, name, weight: 100, publicCatalogLayoutId: owner, parentId, itemIds, childIds,
    order: [...itemIds.map(id => ({ type: "item", id })), ...childIds.map(id => ({ type: "container", id }))] };
  const item = (id, owner, name, containerId, quantity) => state.items[id] = { id, name, weight: 20, categories: [], publicCatalogLayoutId: owner, containerId, quantity };
  bag("source-bag", "source", "Bag", "", ["source-a"], ["source-pocket", "source-other"]);
  bag("source-pocket", "source", "Pocket", "source-bag", ["source-b"], []);
  bag("source-other", "source", "Unmatched pocket", "source-bag", ["source-c"], []);
  bag("target-bag", "target", "Bag", "", ["target-a"], ["target-pocket"]);
  bag("target-pocket", "target", "Pocket", "target-bag", ["target-stays"], []);
  item("source-a", "source", "Already present", "source-bag", 2); item("source-b", "source", "Missing B", "source-pocket", 3); item("source-c", "source", "Missing C", "source-other", 5);
  item("target-a", "target", "Already present", "target-bag", 2); item("target-stays", "target", "Neighbor", "target-pocket", 4);
  for (const id of ["source", "target"]) state.layouts[id] = { id, adminCausalSource: { exists: true }, rootContainerIds: [`${id}-bag`], arrangement: createLayoutArrangementFromCurrentState(state, [`${id}-bag`]) };
  for (const row of Object.values(state.items)) row.quantity = 1;
  return state;
}
test("admin missing items keeps existing quantities/order and adds only the frozen missing records", async () => {
  const state = fixture(), original = structuredClone(state), result = await prepareAdminTemplateMissingItems(state, request, options);
  assert.deepEqual(state, original); assert.equal(result.missingItemCount, 2);
  assert.deepEqual(result.entries.map(row => row.sourceId), ["source-b", "source-c"]);
  assert.deepEqual(Object.keys(result.snapshot.containers), Object.keys(state.containers));
  const arrangement = result.snapshot.layouts.target.arrangement, before = state.layouts.target.arrangement;
  assert.equal(arrangement.itemQuantities["target-a"], 2); assert.equal(arrangement.itemQuantities["target-stays"], 4);
  for (const [index, entry] of result.entries.entries()) {
    const parentId = index === 0 ? "target-pocket" : "target-bag";
    assert.equal(entry.targetId, `item-template-missing-${options.operationId}-${index}`);
    assert.equal(arrangement.items[entry.targetId], parentId); assert.equal(arrangement.itemQuantities[entry.targetId], index === 0 ? 3 : 5);
    assert.equal(result.snapshot.items[entry.targetId].quantity, 1);
    assert.equal(result.snapshot.items[entry.targetId].name, state.items[entry.sourceId].name);
    assert.deepEqual(arrangement.containers[parentId].order.slice(0, -1), before.containers[parentId].order);
  }
  assert.deepEqual(createLayoutArrangementFromCurrentState(result.snapshot, ["target-bag"], { itemQuantities: arrangement.itemQuantities }), arrangement);
  assert.equal(await prepareAdminTemplateMissingItems(result.snapshot, request, { operationId: "a7a3a7d2-4d06-43b2-a4b5-00f72170eb20" }), null);
});
test("admin missing items declines empty shells and a fully present same-editor source", async () => {
  const state = fixture();
  assert.equal(await prepareAdminTemplateMissingItems(state, { ...request, includeContents: false }, options), null);
  assert.equal(await prepareAdminTemplateMissingItems(state, { ...request, targetLayoutId: "source" }, options), null);
});
test("admin missing items rejects ambiguous bags, foreign owners, photos, repairs and ID collisions", async () => {
  for (const change of [
    s => { const id = "duplicate-bag"; s.containers[id] = { ...structuredClone(s.containers["target-bag"]), id, itemIds: [], childIds: [], order: [] }; s.layouts.target.rootContainerIds.push(id); s.layouts.target.arrangement.rootContainerIds.push(id); s.layouts.target.arrangement.containers[id] = { parentId: "", itemIds: [], childIds: [], order: [] }; },
    s => { s.items["target-a"].publicCatalogLayoutId = "foreign"; },
    s => { s.items["source-b"].photos = [{ id: "photo" }]; },
    s => { s.containers["target-pocket"].photos = [{ id: "photo" }]; },
    s => { delete s.layouts.target.arrangement.itemQuantities["target-a"]; },
    s => { delete s.layouts.source.arrangement.itemQuantities["source-b"]; },
    s => { s.items[`item-template-missing-${options.operationId}-0`] = { id: `item-template-missing-${options.operationId}-0` }; }
  ]) {
    const state = fixture(); change(state); const original = structuredClone(state);
    await assert.rejects(prepareAdminTemplateMissingItems(state, request, options)); assert.deepEqual(state, original);
  }
});
