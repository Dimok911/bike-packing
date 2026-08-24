import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSharedEntityUrlFromHref,
  createSharedEntitySnapshotPayload,
  readSharedEntityPublishOptions,
  sharedEntityAncestorContainerIds,
  sharedEntityTargetFromUrl,
  shouldShowSharedEntityPlacement
} from "../../src/public/shared-entity-link.js";
import { packingBoardPresentationZooms } from "../../src/ui/packing-board-zoom.js";
import { focusSharedEntityTarget, sharedEntityFocusSelector } from "../../src/ui/shared-entity-focus.js";
import { sharedCardSourceTarget } from "../../src/ui/shared-virtual-events.js";

function sourceState() {
  return {
    items: {
      target: {
        id: "target",
        name: "Target",
        containerId: "child",
        location: "Bike",
        category: "Tools",
        color: "orange",
        dimensions: { width: 12.5, height: 7, depth: 3 }
      },
      private: { id: "private", name: "Private", containerId: "other", note: "secret" }
    },
    containers: {
      root: { id: "root", name: "Root", childIds: ["child"], itemIds: [], order: [{ type: "container", id: "child" }] },
      child: { id: "child", name: "Child", parentId: "root", childIds: [], itemIds: ["target"], order: [{ type: "item", id: "target" }] },
      other: { id: "other", name: "Other", childIds: [], itemIds: ["private"], order: [{ type: "item", id: "private" }] }
    },
    layouts: {
      current: {
        id: "current",
        name: "Current",
        rootContainerIds: ["root"],
        arrangement: {
          rootContainerIds: ["root"],
          containers: {
            root: { parentId: "", childIds: ["child"], itemIds: [], order: [{ type: "container", id: "child" }] },
            child: { parentId: "root", childIds: [], itemIds: ["target"], order: [{ type: "item", id: "target" }] }
          },
          items: { target: "child" },
          packedItems: {}
        }
      },
      secret: { id: "secret", name: "Secret layout", rootContainerIds: ["other"] }
    },
    activeLayoutId: "current"
  };
}

test("entity link URL preserves target and optional layout context", () => {
  const href = buildSharedEntityUrlFromHref("https://example.test/app?old=1#x", {
    listParam: "sharedList",
    layoutParam: "sharedLayout",
    listId: "shared-entity-link-1",
    layoutId: "current",
    entityType: "item",
    entityId: "target"
  });
  const url = new URL(href);
  assert.equal(url.searchParams.get("sharedList"), "shared-entity-link-1");
  assert.equal(url.searchParams.get("sharedLayout"), "current");
  assert.deepEqual(sharedEntityTargetFromUrl(href), { type: "item", id: "target" });
});

test("entity-only item projection excludes unrelated private records", () => {
  const payload = createSharedEntitySnapshotPayload(sourceState(), {
    entityType: "item",
    entityId: "target",
    scope: "entity"
  });
  assert.deepEqual(Object.keys(payload.items), ["target"]);
  assert.equal(payload.items.private, undefined);
  assert.equal(payload.layouts.secret, undefined);
  assert.equal(payload.items.target.color, "orange");
  assert.deepEqual(payload.items.target.dimensions, { width: 12.5, height: 7, depth: 3 });
  assert.equal(shouldShowSharedEntityPlacement(payload, "item"), false);
});

test("layout-context projection includes one layout and target ancestors", () => {
  const payload = createSharedEntitySnapshotPayload(sourceState(), {
    entityType: "item",
    entityId: "target",
    layoutId: "current",
    scope: "layout"
  });
  assert.deepEqual(Object.keys(payload.layouts), ["current"]);
  assert.equal(payload.items.private, undefined);
  assert.deepEqual(sharedEntityAncestorContainerIds(payload, { type: "item", id: "target" }), ["child", "root"]);
  assert.equal(shouldShowSharedEntityPlacement(payload, "item"), true);
});

test("publish dialog options keep mode and scope independent", () => {
  const root = {
    querySelector(selector) {
      if (selector.includes("shareEntityMode")) return { value: "snapshot" };
      if (selector.includes("shareEntityScope")) return { value: "layout" };
      if (selector === "[data-share-author]") return { checked: true };
      return null;
    }
  };
  assert.deepEqual(readSharedEntityPublishOptions(root), {
    mode: "snapshot",
    scope: "layout",
    includeAuthor: true
  });
});

test("focus selector targets virtual item and container cards", () => {
  assert.equal(sharedEntityFocusSelector({ type: "item", id: "target" }), '[data-item-id="shared-virtual-item-target"]');
  assert.match(sharedEntityFocusSelector({ type: "container", id: "root" }), /shared-virtual-container-root/);
});

test("layout-context links show an overview before presenting the target larger", () => {
  assert.deepEqual(packingBoardPresentationZooms({
    boardWidth: 900,
    columnCount: 3,
    columnGap: 12,
    columnWidth: 360,
    maxZoom: 1.6
  }), { overview: 0.815, detail: 1.35 });

  const calls = [];
  const board = {};
  const classes = new Set();
  const element = {
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name))
    },
    closest: () => board,
    focus: () => calls.push("focus"),
    getAttribute: () => null,
    hasAttribute: () => false,
    removeAttribute: () => {},
    scrollIntoView: () => calls.push("fallback-scroll"),
    setAttribute: () => {}
  };
  focusSharedEntityTarget({ querySelector: () => element }, { type: "item", id: "target", scope: "layout" }, {
    controllerForBoard: (candidate) => ({
      presentElement(target) {
        calls.push(candidate === board && target === element ? "present" : "wrong-target");
        return true;
      }
    }),
    requestFrame: () => calls.push("retry"),
    setTimer: () => 1
  });
  assert.deepEqual(calls, ["present", "focus"]);
  assert.equal(classes.has("shared-link-focus"), true);
});

test("readonly shared cards resolve their original item and container for property dialogs", () => {
  assert.deepEqual(sharedCardSourceTarget({
    dataset: { itemId: "shared-virtual-item-target" }
  }), { type: "item", id: "target" });
  assert.deepEqual(sharedCardSourceTarget({
    dataset: { rootCard: "shared-virtual-container-root" }
  }), { type: "container", id: "root" });
});
