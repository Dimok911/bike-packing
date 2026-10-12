import test from "node:test";
import assert from "node:assert/strict";
import { isolateLinkedLayoutEntities, layoutEntityRepairChanged } from "../../src/state/layout-entity-isolation.js";
import { createLayoutCopyRecordFromSource } from "../../src/state/layout-manage.js";
import { normalizeLayoutArrangement } from "../../src/state/layout-normalize.js";
import { planLayoutTreeMissingItems } from "../../src/public/copy-duplicates.js";
import { linkExistingContainerTreeToLayoutState, linkMissingContainerTreeToLayoutState } from "../../src/public/copy-public-layout-target.js";
import { duplicateContainerSnapshotRecords } from "../../src/state/container-ops.js";
import { snapshotContainerTreeFromLayoutArrangement } from "../../src/state/layout-normalize.js";

function fixture() {
  const placement = (parentId = "", itemIds = [], childIds = []) => ({ parentId, itemIds, childIds,
    order: [...itemIds.map((id) => ({ type: "item", id })), ...childIds.map((id) => ({ type: "container", id }))] });
  const state = {
    containers: { bag: { id: "bag", name: "Bag" }, pouch: { id: "pouch", name: "Pouch", nestable: false, photos: [{ id: "photo" }] },
      inner: { id: "inner", name: "Inner", nestable: false }, reusable: { id: "reusable", name: "Reusable", nestable: true } },
    items: { item: { id: "item", name: "Pump", weight: 50 }, other: { id: "other", name: "Tent" } },
    collapsedContainers: { pouch: true },
    layouts: { source: { id: "source", rootContainerIds: ["bag"], arrangement: {
      rootContainerIds: ["bag"], containers: { bag: placement("", [], ["pouch", "reusable"]), pouch: placement("bag", ["item"], ["inner"]), inner: placement("pouch", ["other"]), reusable: placement("bag") },
      items: { item: "pouch", other: "inner" }, itemQuantities: { item: 3, other: 2 }, packedItems: { item: true }
    } } }, activeLayoutId: "source"
  };
  return state;
}

test("layout copies own temporary pouches while retaining reusable catalog identities", () => {
  const state = fixture();
  const source = structuredClone(state.layouts.source);
  const copy = createLayoutCopyRecordFromSource({ id: "target", requestedName: "Copy", sourceLayout: state.layouts.source, state, ensurePrivateDictionaries: () => ({}) });
  state.layouts.target = copy;
  const pouch = copy.arrangement.containers.bag.childIds[0];
  const inner = copy.arrangement.containers[pouch].childIds[0];
  assert.notEqual(pouch, "pouch");
  assert.notEqual(inner, "inner");
  assert.equal(copy.arrangement.containers[inner].parentId, pouch);
  assert.equal(copy.arrangement.items.item, pouch);
  assert.equal(copy.arrangement.items.other, inner);
  assert.equal(copy.arrangement.itemQuantities.item, 3);
  assert.equal(copy.arrangement.packedItems.item, true);
  assert.equal(state.collapsedContainers[pouch], true);
  assert.ok(copy.arrangement.containers.reusable);
  state.containers[pouch].name = "Changed";
  state.containers[pouch].photos[0].id = "different";
  assert.equal(state.containers.pouch.name, "Pouch");
  assert.equal(state.containers.pouch.photos[0].id, "photo");
  assert.deepEqual(state.layouts.source, source);
  assert.equal(isolateLinkedLayoutEntities(state).clonedContainers, 0);
});

test("legacy pouch migration is deterministic, persisted and idempotent", () => {
  const state = fixture();
  state.layouts.target = { ...structuredClone(state.layouts.source), id: "target" };
  const reversed = structuredClone(state);
  reversed.layouts = Object.fromEntries(Object.entries(reversed.layouts).reverse());
  const report = isolateLinkedLayoutEntities(state);
  isolateLinkedLayoutEntities(reversed);
  assert.equal(report.clonedContainers, 2);
  assert.equal(layoutEntityRepairChanged(report), true);
  assert.deepEqual(state.layouts, reversed.layouts);
  assert.deepEqual(state.containers, reversed.containers);
  const reloaded = JSON.parse(JSON.stringify(state));
  assert.equal(isolateLinkedLayoutEntities(reloaded).clonedContainers, 0);
  assert.deepEqual(reloaded, state);
});

test("a new pouch can copy only absent items into the chosen target bag", () => {
  const state = fixture();
  state.layouts.target = { id: "target", rootContainerIds: ["bag"], arrangement: { rootContainerIds: ["bag"],
    containers: { bag: { parentId: "", childIds: [], itemIds: ["item"], order: [{ type: "item", id: "item" }] } },
    items: { item: "bag" }, itemQuantities: { item: 7 }, packedItems: { item: true } } };
  const sourceBefore = structuredClone(state.layouts.source);
  const snapshot = snapshotContainerTreeFromLayoutArrangement("pouch", { sourceLayoutId: "source", targetState: state });
  const plan = planLayoutTreeMissingItems({ sourceSnapshot: snapshot, targetLayout: state.layouts.target, targetParentId: "bag",
    getLayoutContainerIdSet: (layout) => new Set(Object.keys(layout.arrangement.containers)),
    getLayoutItemIdSet: (layout) => new Set(Object.keys(layout.arrangement.items)) });
  assert.equal(plan.canCopyMissingItems, true);
  assert.deepEqual(plan.missingItems.map((entry) => entry.sourceItemId), ["other"]);
  const result = linkMissingContainerTreeToLayoutState(state, snapshot, "target", { ...plan, normalizeLayoutArrangement, targetIndex: 0 });
  assert.deepEqual(result, { containerCount: 2, itemCount: 1 });
  const target = state.layouts.target.arrangement;
  assert.equal(target.items.item, "bag");
  assert.equal(target.itemQuantities.item, 7);
  assert.equal(target.itemQuantities.other, 2);
  assert.equal(target.packedItems.item, true);
  assert.notEqual(target.items.other, "inner");
  assert.equal(Object.keys(state.items).length, 2);
  assert.deepEqual(state.layouts.source, sourceBefore);
  assert.equal(target.containers.bag.order[0].type, "container");
});

test("linking a whole bag creates independent nested pouches without copying items", () => {
  const state = fixture();
  state.layouts.target = { id: "target", rootContainerIds: [], arrangement: { rootContainerIds: [], containers: {}, items: {} } };
  const snapshot = snapshotContainerTreeFromLayoutArrangement("bag", { sourceLayoutId: "source", targetState: state });
  assert.equal(linkExistingContainerTreeToLayoutState(state, snapshot, "target", "", { normalizeLayoutArrangement }), "bag");
  assert.notEqual(state.layouts.target.arrangement.items.item, "pouch");
  assert.equal(Object.keys(state.items).length, 2);
});

test("explicit private duplicates label every newly created item with copy", async () => {
  const state = fixture();
  const snapshot = snapshotContainerTreeFromLayoutArrangement("bag", { sourceLayoutId: "source", targetState: state });
  const result = await duplicateContainerSnapshotRecords(snapshot, { targetState: state });
  assert.deepEqual(Object.keys(result.copiedItemContainers).map((id) => state.items[id].name).sort(), ["Pump copy", "Tent copy"]);
});
