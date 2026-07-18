import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isNestedContainerInLayoutState,
  isTemporaryContainerInLayoutState,
  replaceContainerInLayoutState,
  replaceItemInLayoutState
} from "../../src/state/layout-replace.js";

const appTailSource = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const containerReplacementFlow = appTailSource.slice(
  appTailSource.indexOf("function replaceExistingContainerInLayout"),
  appTailSource.indexOf("function addExistingItemToContainer")
);
const itemReplacementFlow = appTailSource.slice(
  appTailSource.indexOf("function replaceExistingItemInLayout"),
  appTailSource.indexOf("function markRecentlyAddedItem")
);

test("CRITICAL layout replacement: item flow closes the real edit dialog reference", () => {
  assert.doesNotMatch(appTailSource, /refs\.itemDialog/);
  assert.match(appTailSource, /if \(refs\.dialog\.open\) refs\.dialog\.close\("cancel"\)/);
});

test("CRITICAL layout replacement: replacement preserves the current packing viewport", () => {
  for (const flow of [containerReplacementFlow, itemReplacementFlow]) {
    assert.match(flow, /renderPreservingPackingScroll\(\)/);
    assert.doesNotMatch(flow, /focusRecentlyAdded/);
    assert.doesNotMatch(flow, /markRecentlyAdded/);
  }
});

test("CRITICAL layout replacement: temporary pouch status is visible only for non-reusable nested containers", () => {
  const state = createState();
  const layout = state.layouts["layout-a"];
  layout.arrangement.containers["bag-old"].parentId = "bag-parent";
  state.containers["bag-old"].nestable = false;
  assert.equal(isNestedContainerInLayoutState(state, layout, "bag-old"), true);
  assert.equal(isTemporaryContainerInLayoutState(state, layout, "bag-old"), true);
  state.containers["bag-old"].nestable = true;
  assert.equal(isTemporaryContainerInLayoutState(state, layout, "bag-old"), false);
  layout.arrangement.containers["bag-old"].parentId = "";
  assert.equal(isNestedContainerInLayoutState(state, layout, "bag-old"), false);
  assert.match(indexSource, /id="rootContainerTemporaryStatus"/);
  assert.match(appTailSource, /replacement\.temporaryContainerLabel/);
  assert.match(appTailSource, /replacement\.temporaryContainerHint/);
});

function createState() {
  return {
    activeLayoutId: "layout-a",
    packedItems: { "item-old": true },
    items: {
      "item-old": { id: "item-old", name: "Old", containerId: "bag-old" },
      "item-new": { id: "item-new", name: "New", containerId: "" },
      "item-inside": { id: "item-inside", name: "Inside", containerId: "bag-child" }
    },
    containers: {
      "bag-old": {
        id: "bag-old", name: "Old bag", parentId: null,
        itemIds: ["item-old"], childIds: ["bag-child"],
        order: [{ type: "item", id: "item-old" }, { type: "container", id: "bag-child" }]
      },
      "bag-new": { id: "bag-new", name: "New bag", parentId: null, itemIds: [], childIds: [], order: [] },
      "bag-child": {
        id: "bag-child", name: "Child", parentId: "bag-old",
        itemIds: ["item-inside"], childIds: [], order: [{ type: "item", id: "item-inside" }]
      }
    },
    layouts: {
      "layout-a": {
        id: "layout-a",
        rootContainerIds: ["bag-old"],
        arrangement: {
          rootContainerIds: ["bag-old"],
          containers: {
            "bag-old": {
              parentId: "", itemIds: ["item-old"], childIds: ["bag-child"],
              order: [{ type: "item", id: "item-old" }, { type: "container", id: "bag-child" }]
            },
            "bag-child": {
              parentId: "bag-old", itemIds: ["item-inside"], childIds: [],
              order: [{ type: "item", id: "item-inside" }]
            }
          },
          items: { "item-old": "bag-old", "item-inside": "bag-child" },
          packedItems: { "item-old": true }
        }
      }
    }
  };
}

test("CRITICAL layout replacement: an item keeps the exact mixed-content slot", () => {
  const state = createState();
  const touched = [];
  assert.equal(replaceItemInLayoutState(state, "layout-a", "item-old", "item-new", {
    changedAt: "2026-07-18T12:00:00.000Z",
    touchLayout: (...args) => touched.push(args)
  }), true);

  const arrangement = state.layouts["layout-a"].arrangement;
  assert.deepEqual(arrangement.containers["bag-old"].order, [
    { type: "item", id: "item-new" },
    { type: "container", id: "bag-child" }
  ]);
  assert.equal(arrangement.items["item-old"], undefined);
  assert.equal(arrangement.items["item-new"], "bag-old");
  assert.equal(arrangement.packedItems["item-old"], undefined);
  assert.deepEqual(touched, [["layout-a", "2026-07-18T12:00:00.000Z"]]);
});

test("CRITICAL layout replacement: a new bag keeps the old bag position and full contents", () => {
  const state = createState();
  assert.equal(replaceContainerInLayoutState(state, "layout-a", "bag-old", "bag-new"), true);

  const layout = state.layouts["layout-a"];
  assert.deepEqual(layout.rootContainerIds, ["bag-new"]);
  assert.equal(layout.arrangement.containers["bag-old"], undefined);
  assert.deepEqual(layout.arrangement.containers["bag-new"], {
    parentId: "",
    itemIds: ["item-old"],
    childIds: ["bag-child"],
    order: [{ type: "item", id: "item-old" }, { type: "container", id: "bag-child" }]
  });
  assert.equal(layout.arrangement.items["item-old"], "bag-new");
  assert.equal(layout.arrangement.containers["bag-child"].parentId, "bag-new");
  assert.equal(layout.arrangement.packedItems["item-old"], true);
});

test("CRITICAL layout replacement: a reusable nested bag keeps its parent slot", () => {
  const state = createState();
  const layout = state.layouts["layout-a"];
  state.containers["bag-parent"] = {
    id: "bag-parent", name: "Parent", parentId: null,
    itemIds: [], childIds: ["bag-old"], order: [{ type: "container", id: "bag-old" }]
  };
  state.containers["bag-old"].parentId = "bag-parent";
  state.containers["bag-old"].nestable = true;
  layout.rootContainerIds = ["bag-parent"];
  layout.arrangement.rootContainerIds = ["bag-parent"];
  layout.arrangement.containers["bag-parent"] = {
    parentId: "", itemIds: [], childIds: ["bag-old"], order: [{ type: "container", id: "bag-old" }]
  };
  layout.arrangement.containers["bag-old"].parentId = "bag-parent";

  assert.equal(replaceContainerInLayoutState(state, "layout-a", "bag-old", "bag-new"), true);
  assert.deepEqual(layout.arrangement.containers["bag-parent"].childIds, ["bag-new"]);
  assert.deepEqual(layout.arrangement.containers["bag-parent"].order, [{ type: "container", id: "bag-new" }]);
  assert.equal(layout.arrangement.containers["bag-new"].parentId, "bag-parent");
  assert.deepEqual(layout.rootContainerIds, ["bag-parent"]);
});

test("CRITICAL layout replacement: a temporary nested pouch is removed after becoming a reusable bag", () => {
  const state = createState();
  const layout = state.layouts["layout-a"];
  const removed = [];
  state.collapsedContainers = { "bag-old": false };
  state.containers["bag-parent"] = {
    id: "bag-parent", name: "Parent", parentId: null,
    itemIds: [], childIds: ["bag-old"], order: [{ type: "container", id: "bag-old" }]
  };
  state.containers["bag-old"].parentId = "bag-parent";
  state.containers["bag-old"].nestable = false;
  state.containers["bag-new"].nestable = true;
  layout.rootContainerIds = ["bag-parent"];
  layout.arrangement.rootContainerIds = ["bag-parent"];
  layout.arrangement.containers["bag-parent"] = {
    parentId: "", itemIds: [], childIds: ["bag-old"], order: [{ type: "container", id: "bag-old" }]
  };
  layout.arrangement.containers["bag-old"].parentId = "bag-parent";

  assert.equal(replaceContainerInLayoutState(state, "layout-a", "bag-old", "bag-new", {
    beforeRemoveSource: (_container, id) => removed.push(id),
    removeSourceRecord: true
  }), true);
  assert.equal(state.containers["bag-old"], undefined);
  assert.equal(state.collapsedContainers["bag-old"], undefined);
  assert.deepEqual(removed, ["bag-old"]);
  assert.deepEqual(layout.arrangement.containers["bag-parent"].childIds, ["bag-new"]);
  assert.deepEqual(layout.arrangement.containers["bag-new"].itemIds, ["item-old"]);
  assert.deepEqual(layout.arrangement.containers["bag-new"].childIds, ["bag-child"]);
});

test("CRITICAL layout replacement: replacement records already used by the layout are rejected", () => {
  const state = createState();
  state.layouts["layout-a"].arrangement.items["item-new"] = "bag-child";
  state.layouts["layout-a"].arrangement.containers["bag-child"].itemIds.push("item-new");
  state.layouts["layout-a"].arrangement.containers["bag-child"].order.push({ type: "item", id: "item-new" });
  assert.equal(replaceItemInLayoutState(state, "layout-a", "item-old", "item-new"), false);
  assert.equal(replaceContainerInLayoutState(state, "layout-a", "bag-old", "bag-child"), false);
});
