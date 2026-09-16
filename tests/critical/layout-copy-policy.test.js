import test from "node:test";
import assert from "node:assert/strict";
import { renderFilterControls } from "../../src/ui/filter-controls.js";
import { publicLayoutChoiceValue } from "../../src/state/layout-manage.js";

function copyPickerRenderFixture() {
  const control = () => ({ value: "", classList: { toggle() {} }, setAttribute() {},
    closest: () => null, parentElement: { classList: { toggle() {} } } });
  const refs = Object.fromEntries(["layoutSelect", "newLayoutBtn", "layoutCopyFrom", "searchInput", "locationFilter",
    "itemLocation", "clearSearchBtn", "clearLocationFilterBtn", "clearCategoryFilterBtn", "collectionModeBtn",
    "unpackedOnlyBtn", "unpackAllBtn"].map(key => [key, control()]));
  refs.layoutDialog = { open: true };
  refs.layoutCopyFrom.value = "demo:template-300";
  refs.layoutCopyFrom.options = [["demo:template-300", "Шаблон 300"]];
  const state = { layouts: { personal: { id: "personal", name: "Укладка 2026" },
    source: { id: "source", name: "Шаблон 300", adminDemo: true } } };
  const render = (overrides = {}) => renderFilterControls({ refs, state, canUsePrivateState: () => true,
    getActiveEditableLayoutId: () => "source", publicLayoutChoiceForLayout: () => "demo:template-300",
    fillSelect(select, entries, selected) {
      select.options = entries;
      select.value = entries.some(row => row[0] === selected) ? selected : entries[0]?.[0] || "";
    }, ...overrides });
  return { refs, state, render };
}

test("CRITICAL inactive causal drafts remain selectable without duplicating the published editor", () => {
  const f = copyPickerRenderFixture();
  f.state.layouts.draft = { id: "draft", name: "Копия", adminSharedSourceId: "copy", adminTemplateCopy: true,
    templatePublished: false, adminCausalSource: {} };
  f.state.layouts.published = { id: "published", name: "Шаблон", adminSharedSourceId: "published", adminCausalSource: {} };
  const options = { canViewAdminPublishedCatalog: () => true, canEditPublishedTemplatesNow: () => true,
    getActiveEditableLayoutId: () => "personal", publicLayoutChoiceForLayout: publicLayoutChoiceValue,
    adminPublicLayoutOptions: () => [["shared:published", "Шаблон", "shared"]],
    activeAdminDraftOptionLabel: layout => layout?.adminCausalSource ? (layout.templatePublished === false ? "Черновик: Копия" : "Шаблон") : "" };
  f.render(options);
  assert.equal(f.refs.layoutSelect.value, "personal");
  assert.deepEqual(f.refs.layoutSelect.options.filter(row => row[0] === "template-draft:draft"),
    [["template-draft:draft", "Черновик: Копия", "shared", false]]);
  assert.equal(f.refs.layoutSelect.options.filter(row => row[0] === "shared:published").length, 1);
  f.render({ ...options, canViewAdminPublishedCatalog: () => false });
  assert.ok(!f.refs.layoutSelect.options.some(row => row[0].startsWith("template-draft:")));
  f.render({ ...options, canEditPublishedTemplatesNow: () => false, canEditLocalUnpublishedAdminTemplate: layout => layout.id === "draft" });
  assert.equal(f.refs.layoutSelect.options.find(row => row[0] === "template-draft:draft")[3], false);
});

test("CRITICAL template copy form keeps its chosen public source through source activation and background render", () => {
  const f = copyPickerRenderFixture(), options = f.refs.layoutCopyFrom.options;
  f.render(); f.render();
  assert.equal(f.refs.layoutCopyFrom.value, "demo:template-300");
  assert.equal(f.refs.layoutCopyFrom.options, options);
  assert.equal(f.refs.layoutSelect.value, "personal");
});

test("CRITICAL closed copy form still refreshes personal source defaults", () => {
  const f = copyPickerRenderFixture(); f.refs.layoutDialog.open = false; f.render();
  assert.equal(f.refs.layoutCopyFrom.value, "personal");
});
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
      "bag-first": {
        id: "bag-first",
        name: "First bag",
        parentId: null,
        childIds: [],
        itemIds: [],
        order: []
      },
      "bag-last": {
        id: "bag-last",
        name: "Last bag",
        parentId: null,
        childIds: [],
        itemIds: [],
        order: []
      },
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
        rootContainerIds: ["bag-first", "bag-last"],
        arrangement: {
          rootContainerIds: ["bag-first", "bag-last"],
          containers: {
            "bag-first": { parentId: "", childIds: [], itemIds: [], order: [] },
            "bag-last": { parentId: "", childIds: [], itemIds: [], order: [] }
          },
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
  assert.deepEqual(state.layouts["target-layout"].rootContainerIds, ["bag-a", "bag-first", "bag-last"]);
  assert.deepEqual(state.layouts["target-layout"].arrangement.rootContainerIds, ["bag-a", "bag-first", "bag-last"]);
  assert.equal(state.layouts["target-layout"].arrangement.items["item-a"], "bag-a");
  assert.equal(state.containers["bag-a"].photos[0].id, "photo-a");
  assert.equal(state.items["item-a"].photos[0].id, "photo-item-a");
});

test("CRITICAL private copy: a linked nested bag keeps the selected slot", () => {
  const state = {
    containers: {
      parent: {
        id: "parent",
        parentId: null,
        childIds: ["child-a", "child-b"],
        itemIds: ["parent-item"],
        order: [
          { type: "container", id: "child-a" },
          { type: "item", id: "parent-item" },
          { type: "container", id: "child-b" }
        ]
      },
      "child-a": { id: "child-a", parentId: "parent", childIds: [], itemIds: [], order: [] },
      "child-b": { id: "child-b", parentId: "parent", childIds: [], itemIds: [], order: [] },
      "bag-copy": { id: "bag-copy", parentId: null, childIds: [], itemIds: [], order: [], nestable: true }
    },
    items: {
      "parent-item": { id: "parent-item", containerId: "parent" }
    },
    collapsedContainers: {},
    layouts: {
      target: {
        id: "target",
        rootContainerIds: ["parent"],
        arrangement: {
          rootContainerIds: ["parent"],
          containers: {
            parent: {
              parentId: "",
              childIds: ["child-a", "child-b"],
              itemIds: ["parent-item"],
              order: [
                { type: "container", id: "child-a" },
                { type: "item", id: "parent-item" },
                { type: "container", id: "child-b" }
              ]
            },
            "child-a": { parentId: "parent", childIds: [], itemIds: [], order: [] },
            "child-b": { parentId: "parent", childIds: [], itemIds: [], order: [] }
          },
          items: { "parent-item": "parent" },
          packedItems: {}
        }
      }
    }
  };
  const sourceSnapshot = {
    rootId: "bag-copy",
    containers: {
      "bag-copy": state.containers["bag-copy"]
    },
    items: {}
  };

  const linkedId = linkExistingContainerTreeToLayoutState(state, sourceSnapshot, "target", "parent", {
    normalizeLayoutArrangement: () => {},
    targetContainerIds: ["parent", "child-a", "child-b"],
    targetIndex: 1
  });

  assert.equal(linkedId, "bag-copy");
  assert.deepEqual(state.containers.parent.order, [
    { type: "container", id: "child-a" },
    { type: "container", id: "bag-copy" },
    { type: "item", id: "parent-item" },
    { type: "container", id: "child-b" }
  ]);
  assert.deepEqual(state.layouts.target.arrangement.containers.parent.order, state.containers.parent.order);
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
