import test from "node:test";
import assert from "node:assert/strict";
import {
  addRootContainerToLayoutInState,
  moveRootColumnInState,
  rootColumnInsertIndexFromVisibleNeighbors
} from "../../src/state/layout-ops.js";
import {
  deleteRootContainerFromState,
  placeDuplicatedContainerSnapshotInLayoutState
} from "../../src/state/container-ops.js";

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

test("CRITICAL container copy picker: duplicated nested bag is inserted at the selected slot", () => {
  const state = {
    containers: {
      "parent": {
        id: "parent",
        childIds: ["child-a", "child-b"],
        itemIds: [],
        order: [
          { type: "container", id: "child-a" },
          { type: "container", id: "child-b" }
        ]
      },
      "child-a": { id: "child-a", parentId: "parent", childIds: [], itemIds: [], order: [] },
      "child-b": { id: "child-b", parentId: "parent", childIds: [], itemIds: [], order: [] },
      "copy-root": { id: "copy-root", parentId: "parent", childIds: [], itemIds: [], order: [] }
    },
    items: {},
    collapsedContainers: {},
    layouts: {
      "layout-a": {
        id: "layout-a",
        rootContainerIds: ["parent"],
        arrangement: {
          rootContainerIds: ["parent"],
          containers: {
            "parent": {
              parentId: "",
              childIds: ["child-a", "child-b"],
              itemIds: [],
              order: [
                { type: "container", id: "child-a" },
                { type: "container", id: "child-b" }
              ]
            },
            "child-a": { parentId: "parent", childIds: [], itemIds: [], order: [] },
            "child-b": { parentId: "parent", childIds: [], itemIds: [], order: [] }
          },
          items: {},
          packedItems: {}
        }
      }
    }
  };
  const touched = [];

  assert.equal(placeDuplicatedContainerSnapshotInLayoutState(state, "layout-a", "copy-root", {
    copiedPlacements: {
      "copy-root": { parentId: "parent", childIds: [], itemIds: [], order: [] }
    },
    targetParentId: "parent",
    targetIndex: 1,
    touchContainer: (containerId) => touched.push(`container:${containerId}`),
    touchLayout: (layoutId) => touched.push(`layout:${layoutId}`)
  }), true);

  assert.deepEqual(state.containers.parent.order, [
    { type: "container", id: "child-a" },
    { type: "container", id: "copy-root" },
    { type: "container", id: "child-b" }
  ]);
  assert.deepEqual(state.layouts["layout-a"].arrangement.containers.parent.order, [
    { type: "container", id: "child-a" },
    { type: "container", id: "copy-root" },
    { type: "container", id: "child-b" }
  ]);
  assert.deepEqual(touched, ["container:parent", "layout:layout-a"]);
});

test("CRITICAL container copy picker: duplicated top-level bag is inserted at the selected root slot", () => {
  const state = {
    containers: {
      "bag-a": { id: "bag-a", parentId: null, childIds: [], itemIds: [], order: [] },
      "bag-b": { id: "bag-b", parentId: null, childIds: [], itemIds: [], order: [] },
      "copy-root": { id: "copy-root", parentId: null, childIds: [], itemIds: [], order: [] }
    },
    items: {},
    collapsedContainers: {},
    layouts: {
      "layout-a": {
        id: "layout-a",
        rootContainerIds: ["bag-a", "bag-b"],
        arrangement: {
          rootContainerIds: ["bag-a", "bag-b"],
          containers: {
            "bag-a": { parentId: "", childIds: [], itemIds: [], order: [] },
            "bag-b": { parentId: "", childIds: [], itemIds: [], order: [] }
          },
          items: {},
          packedItems: {}
        }
      }
    }
  };

  assert.equal(placeDuplicatedContainerSnapshotInLayoutState(state, "layout-a", "copy-root", {
    copiedPlacements: {
      "copy-root": { parentId: "", childIds: [], itemIds: [], order: [] }
    },
    targetIndex: 1
  }), true);

  assert.deepEqual(state.layouts["layout-a"].rootContainerIds, ["bag-a", "copy-root", "bag-b"]);
  assert.deepEqual(state.layouts["layout-a"].arrangement.rootContainerIds, ["bag-a", "copy-root", "bag-b"]);
});

test("CRITICAL container copy: deleting a copied bag does not remove the source bag from another layout", () => {
  const state = {
    containers: {
      "source-root": { id: "source-root", parentId: null, childIds: [], itemIds: ["source-item"], order: [{ type: "item", id: "source-item" }] },
      "copy-root": { id: "copy-root", parentId: null, childIds: [], itemIds: ["copy-item"], order: [{ type: "item", id: "copy-item" }] }
    },
    items: {
      "source-item": { id: "source-item", containerId: "source-root" },
      "copy-item": { id: "copy-item", containerId: "copy-root" }
    },
    collapsedContainers: {},
    packedItems: {},
    layouts: {
      "source-layout": {
        id: "source-layout",
        rootContainerIds: ["source-root"],
        arrangement: {
          rootContainerIds: ["source-root"],
          containers: {
            "source-root": { parentId: "", childIds: [], itemIds: ["source-item"], order: [{ type: "item", id: "source-item" }] }
          },
          items: { "source-item": "source-root" },
          packedItems: {}
        }
      },
      "copy-layout": {
        id: "copy-layout",
        rootContainerIds: ["copy-root"],
        arrangement: {
          rootContainerIds: ["copy-root"],
          containers: {
            "copy-root": { parentId: "", childIds: [], itemIds: ["copy-item"], order: [{ type: "item", id: "copy-item" }] }
          },
          items: { "copy-item": "copy-root" },
          packedItems: {}
        }
      }
    }
  };

  assert.equal(deleteRootContainerFromState(state, "copy-root"), true);

  assert.deepEqual(state.layouts["source-layout"].rootContainerIds, ["source-root"]);
  assert.ok(state.containers["source-root"]);
  assert.ok(state.items["source-item"]);
  assert.equal(state.items["source-item"].containerId, "source-root");
  assert.deepEqual(state.layouts["copy-layout"].rootContainerIds, []);
  assert.equal(state.containers["copy-root"], undefined);
  assert.equal(state.items["copy-item"].containerId, "");
});
