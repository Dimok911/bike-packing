import test from "node:test";
import assert from "node:assert/strict";
import { planLayoutTreeMissingItems } from "../../src/public/copy-duplicates.js";
import {
  linkExistingContainerTreeToLayoutState,
  linkMissingContainerTreeToLayoutState
} from "../../src/public/copy-public-layout-target.js";
import {
  copyCrossesPublicNamespaceBoundary,
  itemCopyNamespacePolicy,
  itemRecordIsPublicNamespaceSource,
  photoDuplicateOptionsForLayoutCopy,
  privateContainerTreeCopyRoute,
  shouldCopyPhotosToCurrentListForLayoutCopy
} from "../../src/state/layout-copy-policy.js";

test("CRITICAL namespace copy: linking by id is allowed only inside the private namespace", () => {
  assert.equal(copyCrossesPublicNamespaceBoundary({ sourceIsPublic: false, targetIsPublic: false }), false);
  assert.equal(copyCrossesPublicNamespaceBoundary({ sourceIsPublic: true, targetIsPublic: false }), true);
  assert.equal(copyCrossesPublicNamespaceBoundary({ sourceIsPublic: false, targetIsPublic: true }), true);
  assert.equal(copyCrossesPublicNamespaceBoundary({ sourceIsPublic: true, targetIsPublic: true }), true);
});

test("CRITICAL admin item editor copy: a shared source layout requires an independent personal record", () => {
  assert.deepEqual(itemCopyNamespacePolicy({
    sourceLayoutIsPublic: true,
    sourceRecordHasPublicOrigin: false,
    targetIsPublic: false
  }), {
    sourceIsPublicCopy: true,
    crossesPublicNamespace: true
  });

  assert.deepEqual(itemCopyNamespacePolicy({
    sourceLayoutIsPublic: false,
    sourceRecordHasPublicOrigin: false,
    targetIsPublic: false
  }), {
    sourceIsPublicCopy: false,
    crossesPublicNamespace: false
  });
});

test("CRITICAL private item copy: template provenance does not duplicate an already independent personal item", () => {
  const copiedPersonalItem = {
    id: "item-private-copy",
    name: "Jacket",
    _publicCopySourceKind: "item",
    _publicCopySourceId: "item-shared-jacket",
    _publicCopySourceLayoutId: "shared-layout"
  };

  assert.equal(itemRecordIsPublicNamespaceSource(copiedPersonalItem, {
    hasPrivateSyncBlockedPublicOrigin: () => false
  }), false);
  assert.deepEqual(itemCopyNamespacePolicy({
    sourceLayoutIsPublic: false,
    sourceRecordHasPublicOrigin: itemRecordIsPublicNamespaceSource(copiedPersonalItem, {
      hasPrivateSyncBlockedPublicOrigin: () => false
    }),
    targetIsPublic: false
  }), {
    sourceIsPublicCopy: false,
    crossesPublicNamespace: false
  });
});

test("CRITICAL private item copy: a live public catalog record still requires an independent copy", () => {
  assert.equal(itemRecordIsPublicNamespaceSource({
    id: "item-public",
    publicCatalogLayoutId: "layout-public"
  }), true);
});

test("CRITICAL private copy: top-level bag links existing catalog records when target has no duplicates", () => {
  const state = {
    containers: {
      "bag-a": {
        id: "bag-a",
        name: "Bag A",
        parentId: null,
        childIds: [],
        itemIds: ["item-a"],
        order: [{ type: "item", id: "item-a" }],
        photos: [{
          id: "photo-a",
          url: "https://api.example.test/bike-packing/lists/private-list/photos/photo-a/file",
          thumbUrl: "https://api.example.test/bike-packing/lists/private-list/photos/photo-a/thumb",
          status: "synced"
        }]
      }
    },
    items: {
      "item-a": {
        id: "item-a",
        name: "Item A",
        containerId: "bag-a",
        photos: [{
          id: "photo-item-a",
          url: "https://api.example.test/bike-packing/lists/private-list/photos/photo-item-a/file",
          thumbUrl: "https://api.example.test/bike-packing/lists/private-list/photos/photo-item-a/thumb",
          status: "synced"
        }]
      }
    },
    collapsedContainers: {},
    layouts: {
      "target-layout": {
        id: "target-layout",
        rootContainerIds: [],
        arrangement: {
          rootContainerIds: [],
          containers: {},
          items: {},
          packedItems: {}
        }
      }
    }
  };
  const sourceSnapshot = {
    rootId: "bag-a",
    containers: {
      "bag-a": {
        id: "bag-a",
        parentId: "",
        childIds: [],
        itemIds: ["item-a"],
        order: [{ type: "item", id: "item-a" }]
      }
    },
    items: {
      "item-a": state.items["item-a"]
    }
  };

  const beforeContainerIds = Object.keys(state.containers);
  const beforeItemIds = Object.keys(state.items);
  const linkedId = linkExistingContainerTreeToLayoutState(state, sourceSnapshot, "target-layout", "", {
    normalizeLayoutArrangement: () => {},
    targetContainerIds: [],
    targetIndex: 0
  });

  assert.equal(linkedId, "bag-a");
  assert.deepEqual(Object.keys(state.containers), beforeContainerIds);
  assert.deepEqual(Object.keys(state.items), beforeItemIds);
  assert.deepEqual(state.layouts["target-layout"].rootContainerIds, ["bag-a"]);
  assert.deepEqual(state.layouts["target-layout"].arrangement.rootContainerIds, ["bag-a"]);
  assert.equal(state.layouts["target-layout"].arrangement.items["item-a"], "bag-a");
  assert.equal(state.containers["bag-a"].photos[0].id, "photo-a");
  assert.equal(state.items["item-a"].photos[0].id, "photo-item-a");
});

test("CRITICAL private copy: duplicate policy distinguishes link, missing and explicit duplicate routes", () => {
  assert.equal(privateContainerTreeCopyRoute({
    copyAction: "copy-all",
    duplicateContainerIds: [],
    duplicateItemIds: []
  }), "link-existing");

  assert.equal(privateContainerTreeCopyRoute({
    copyAction: "copy-missing-local",
    duplicateContainerIds: ["bag-a"],
    duplicateItemIds: ["item-a"]
  }), "copy-missing-local");

  assert.equal(privateContainerTreeCopyRoute({
    copyAction: "copy-all",
    duplicateContainerIds: ["bag-a"],
    duplicateItemIds: []
  }), "duplicate-explicit");

  assert.equal(privateContainerTreeCopyRoute({
    copyAction: "",
    duplicateContainerIds: ["bag-a"],
    duplicateItemIds: []
  }), "cancel");
});

test("CRITICAL private copy: namespace boundary detection remains explicit", () => {
  assert.equal(shouldCopyPhotosToCurrentListForLayoutCopy({
    targetIsPublic: false,
    sourceIsPublicCopy: false
  }), false);

  assert.equal(shouldCopyPhotosToCurrentListForLayoutCopy({
    targetIsPublic: true,
    sourceIsPublicCopy: false
  }), true);

  assert.equal(shouldCopyPhotosToCurrentListForLayoutCopy({
    targetIsPublic: false,
    sourceIsPublicCopy: true
  }), true);
});

test("CRITICAL private copy: explicit duplicate always copies remote photos and drops missing files only across namespaces", () => {
  assert.deepEqual(photoDuplicateOptionsForLayoutCopy({
    targetIsPublic: false,
    sourceIsPublicCopy: false
  }), {
    copyRemotePhotosToCurrentList: true,
    dropMissingLocalPhotos: false
  });

  assert.deepEqual(photoDuplicateOptionsForLayoutCopy({
    targetIsPublic: true,
    sourceIsPublicCopy: false
  }), {
    copyRemotePhotosToCurrentList: true,
    dropMissingLocalPhotos: true
  });

  assert.deepEqual(photoDuplicateOptionsForLayoutCopy({
    targetIsPublic: false,
    sourceIsPublicCopy: true
  }), {
    copyRemotePhotosToCurrentList: true,
    dropMissingLocalPhotos: true
  });
});

test("CRITICAL private copy: only missing restores nested packages and items without catalog duplicates", () => {
  const state = {
    containers: {
      "bag-a": {
        id: "bag-a",
        name: "Bag A",
        parentId: null,
        childIds: ["pouch-a"],
        itemIds: ["item-a"],
        order: [
          { type: "item", id: "item-a" },
          { type: "container", id: "pouch-a" }
        ]
      },
      "pouch-a": {
        id: "pouch-a",
        name: "Pouch A",
        parentId: "bag-a",
        childIds: ["inner-a"],
        itemIds: ["item-b"],
        order: [
          { type: "container", id: "inner-a" },
          { type: "item", id: "item-b" }
        ]
      },
      "inner-a": {
        id: "inner-a",
        name: "Inner A",
        parentId: "pouch-a",
        childIds: [],
        itemIds: [],
        order: []
      }
    },
    items: {
      "item-a": { id: "item-a", name: "Item A", containerId: "bag-a" },
      "item-b": { id: "item-b", name: "Item B", containerId: "pouch-a" }
    },
    collapsedContainers: {},
    layouts: {
      "target-layout": {
        id: "target-layout",
        rootContainerIds: ["bag-a"],
        arrangement: {
          rootContainerIds: ["bag-a"],
          containers: {
            "bag-a": {
              parentId: "",
              childIds: [],
              itemIds: ["item-a"],
              order: [{ type: "item", id: "item-a" }]
            }
          },
          items: {
            "item-a": "bag-a"
          },
          packedItems: {}
        }
      }
    }
  };
  const sourceSnapshot = {
    rootId: "bag-a",
    containers: {
      "bag-a": {
        id: "bag-a",
        parentId: null,
        childIds: ["pouch-a"],
        itemIds: ["item-a"],
        order: [
          { type: "item", id: "item-a" },
          { type: "container", id: "pouch-a" }
        ]
      },
      "pouch-a": {
        id: "pouch-a",
        parentId: "bag-a",
        childIds: ["inner-a"],
        itemIds: ["item-b"],
        order: [
          { type: "container", id: "inner-a" },
          { type: "item", id: "item-b" }
        ]
      },
      "inner-a": {
        id: "inner-a",
        parentId: "pouch-a",
        childIds: [],
        itemIds: [],
        order: []
      }
    },
    items: {
      "item-a": state.items["item-a"],
      "item-b": state.items["item-b"]
    }
  };

  const beforeContainerIds = Object.keys(state.containers);
  const beforeItemIds = Object.keys(state.items);
  const plan = planLayoutTreeMissingItems({
    sourceSnapshot,
    targetLayout: state.layouts["target-layout"],
    getLayoutContainerIdSet: () => new Set(["bag-a"]),
    getLayoutItemIdSet: () => new Set(["item-a"])
  });

  assert.equal(plan.canCopyMissingItems, true);
  assert.deepEqual(plan.missingContainers, [
    { sourceContainerId: "pouch-a", targetParentId: "bag-a" },
    { sourceContainerId: "inner-a", targetParentId: "pouch-a" }
  ]);
  assert.deepEqual(plan.missingItems, [{ sourceItemId: "item-b", targetContainerId: "pouch-a" }]);

  const restored = linkMissingContainerTreeToLayoutState(state, sourceSnapshot, "target-layout", {
    missingContainers: plan.missingContainers,
    missingItems: plan.missingItems,
    normalizeLayoutArrangement: () => state.layouts["target-layout"].arrangement,
    touchLayout: () => {}
  });

  assert.deepEqual(Object.keys(state.containers), beforeContainerIds);
  assert.deepEqual(Object.keys(state.items), beforeItemIds);
  assert.deepEqual(restored, { containerCount: 2, itemCount: 1 });
  assert.deepEqual(state.layouts["target-layout"].arrangement.containers["bag-a"].childIds, ["pouch-a"]);
  assert.deepEqual(state.layouts["target-layout"].arrangement.containers["pouch-a"], {
    parentId: "bag-a",
    itemIds: ["item-b"],
    childIds: ["inner-a"],
    order: [
      { type: "container", id: "inner-a" },
      { type: "item", id: "item-b" }
    ]
  });
  assert.deepEqual(state.layouts["target-layout"].arrangement.containers["inner-a"], {
    parentId: "pouch-a",
    itemIds: [],
    childIds: [],
    order: []
  });
  assert.equal(state.layouts["target-layout"].arrangement.items["item-b"], "pouch-a");
});
