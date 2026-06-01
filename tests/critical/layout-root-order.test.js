import test from "node:test";
import assert from "node:assert/strict";
import {
  addRootContainerToLayoutInState,
  moveRootColumnInState,
  rootColumnInsertIndexFromVisibleNeighbors
} from "../../src/state/layout-ops.js";

function createState() {
  return {
    containers: {
      "bag-a": { id: "bag-a", name: "A", itemIds: ["item-a"], childIds: [], order: [{ type: "item", id: "item-a" }] },
      "bag-b": { id: "bag-b", name: "B", itemIds: [], childIds: [], order: [] },
      "bag-c": { id: "bag-c", name: "C", itemIds: [], childIds: [], order: [] }
    },
    items: {
      "item-a": { id: "item-a", name: "Item A", containerId: "bag-a" }
    },
    layouts: {
      "layout-a": {
        id: "layout-a",
        rootContainerIds: ["bag-b", "bag-c"],
        arrangement: {
          rootContainerIds: ["bag-b", "bag-c"],
          containers: {
            "bag-b": { parentId: "", itemIds: [], childIds: [], order: [] },
            "bag-c": { parentId: "", itemIds: [], childIds: [], order: [] }
          },
          items: {},
          packedItems: {}
        }
      }
    }
  };
}

test("CRITICAL root column drag: adding a bag inserts it at the requested root index", () => {
  const state = createState();
  const touched = [];
  const marked = [];

  assert.equal(addRootContainerToLayoutInState(state, "layout-a", "bag-a", 1, {
    markRecordActivePublicCatalog: (container) => marked.push(container.id),
    touchLayout: (layoutId) => touched.push(layoutId)
  }), true);

  const layout = state.layouts["layout-a"];
  assert.deepEqual(layout.rootContainerIds, ["bag-b", "bag-a", "bag-c"]);
  assert.deepEqual(layout.arrangement.rootContainerIds, ["bag-b", "bag-a", "bag-c"]);
  assert.equal(layout.arrangement.containers["bag-a"].parentId, "");
  assert.deepEqual(layout.arrangement.containers["bag-a"].itemIds, ["item-a"]);
  assert.equal(layout.arrangement.items["item-a"], "bag-a");
  assert.deepEqual(marked, ["bag-a"]);
  assert.deepEqual(touched, ["layout-a"]);
});

test("CRITICAL root column drag: moving a root column updates arrangement order too", () => {
  const state = createState();
  const layout = state.layouts["layout-a"];
  layout.rootContainerIds = ["bag-a", "bag-b", "bag-c"];
  layout.arrangement.rootContainerIds = ["bag-a", "bag-b", "bag-c"];
  layout.arrangement.containers["bag-a"] = { parentId: "", itemIds: ["item-a"], childIds: [], order: [{ type: "item", id: "item-a" }] };
  layout.arrangement.items["item-a"] = "bag-a";

  assert.equal(moveRootColumnInState(state, "layout-a", "bag-a", 2), true);

  assert.deepEqual(layout.rootContainerIds, ["bag-b", "bag-c", "bag-a"]);
  assert.deepEqual(layout.arrangement.rootContainerIds, ["bag-b", "bag-c", "bag-a"]);
  assert.equal(layout.arrangement.containers["bag-a"].parentId, "");
});

test("CRITICAL root column drag: visible neighbor target maps to the full root order", () => {
  const rootIds = ["generated-a", "bag-a", "generated-b", "bag-b", "bag-c"];

  assert.equal(rootColumnInsertIndexFromVisibleNeighbors(rootIds, "bag-a", {
    previousRootId: "bag-c"
  }), 4);

  assert.equal(rootColumnInsertIndexFromVisibleNeighbors(rootIds, "bag-c", {
    nextRootId: "bag-a"
  }), 1);

  assert.equal(rootColumnInsertIndexFromVisibleNeighbors(rootIds, "bag-b", {
    nextRootId: "bag-c",
    previousRootId: "bag-a"
  }), 3);
});
