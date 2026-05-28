import test from "node:test";
import assert from "node:assert/strict";
import {
  isCollectionPackedVisible,
  normalizeCollectionModeState,
  toggleCollectionModeEnabled,
  toggleShowOnlyUnpacked
} from "../../src/state/collection-mode.js";
import { cloneStateForSyncPayload } from "../../src/sync/serialize.js";
import {
  buildChangedEntitySyncEntries,
  hasLegacyPayloadChanges,
  legacyComparableTopLevelDiffKeys
} from "../../src/sync/entity-sync.js";
import { legacyPayloadFallbackReasonText } from "../../src/sync/save-remote-state-flow.js";

function baseState(overrides = {}) {
  return {
    locations: [],
    categories: [],
    containers: {},
    items: {},
    layouts: {},
    activeLayoutId: "",
    collapsedContainers: { bag: true },
    itemDisplayMode: "photos",
    showItemMeta: true,
    showFilterContext: true,
    packedItems: {},
    ...overrides
  };
}

function entitySyncDeps() {
  return {
    cloneStateForSync: (state, options) => cloneStateForSyncPayload(state, options),
    createEmptyUserState: () => baseState()
  };
}

function allEntityTypesSafeForLegacyCompare() {
  return {
    item: { safeForLegacyCompare: true },
    container: { safeForLegacyCompare: true },
    layout: { safeForLegacyCompare: true },
    dictionary: { safeForLegacyCompare: true }
  };
}

function commonActionBaseState() {
  return baseState({
    activeLayoutId: "layout-a",
    categories: ["Gear", "Food"],
    locations: ["Home", "Bike"],
    containers: {
      "bag-a": { id: "bag-a", name: "Frame bag", categories: ["Gear"] },
      "bag-b": { id: "bag-b", name: "Seat bag", categories: ["Gear"] }
    },
    items: {
      "item-a": { id: "item-a", name: "Tent", categories: ["Gear"], location: "Home" }
    },
    layouts: {
      "layout-a": {
        id: "layout-a",
        name: "Main",
        rootContainerIds: ["bag-a", "bag-b"],
        arrangement: {
          rootContainerIds: ["bag-a", "bag-b"],
          containers: {
            "bag-a": { parentId: "", itemIds: ["item-a"], childIds: [], order: [{ type: "item", id: "item-a" }] },
            "bag-b": { parentId: "", itemIds: [], childIds: [], order: [] }
          },
          items: { "item-a": "bag-a" },
          packedItems: {}
        }
      }
    },
    packedItems: {}
  });
}

function cloneForTest(value) {
  return JSON.parse(JSON.stringify(value));
}

function changedEntityTypes(base, local, deps) {
  return ["item", "container", "layout", "dictionary"].filter((type) => (
    buildChangedEntitySyncEntries(type, base, local, deps).length > 0
  ));
}

test("sync payload treats collection mode and unpacked filter as local UI state", () => {
  const payload = cloneStateForSyncPayload(baseState({
    collectionMode: true,
    showOnlyUnpacked: true
  }), { forSync: true });

  assert.equal(payload.collectionMode, undefined);
  assert.equal(payload.showOnlyUnpacked, undefined);
  assert.equal(payload.itemDisplayMode, undefined);
  assert.equal(payload.showFilterContext, undefined);
  assert.equal(payload.collapsedContainers, undefined);
});

test("unpacked filter does not sync even when normalized locally", () => {
  const payload = cloneStateForSyncPayload(baseState({
    collectionMode: false,
    showOnlyUnpacked: true
  }), { forSync: true });

  assert.equal(payload.collectionMode, undefined);
  assert.equal(payload.showOnlyUnpacked, undefined);
});

test("collection mode normalization repairs missing booleans", () => {
  const state = normalizeCollectionModeState(baseState({
    collectionMode: "yes",
    showOnlyUnpacked: true
  }));

  assert.equal(state.collectionMode, false);
  assert.equal(state.showOnlyUnpacked, false);
});

test("turning collection mode off keeps packed item state", () => {
  const state = baseState({
    collectionMode: true,
    showOnlyUnpacked: true,
    packedItems: {
      itemTent: true,
      itemStove: true
    }
  });

  toggleCollectionModeEnabled(state);

  assert.equal(state.collectionMode, false);
  assert.equal(state.showOnlyUnpacked, false);
  assert.deepEqual(state.packedItems, {
    itemTent: true,
    itemStove: true
  });
});

test("unpacked-only filter can enable collection mode without clearing packed items", () => {
  const state = baseState({
    collectionMode: false,
    showOnlyUnpacked: false,
    packedItems: {
      itemTent: true
    }
  });

  toggleShowOnlyUnpacked(state);

  assert.equal(state.collectionMode, true);
  assert.equal(state.showOnlyUnpacked, true);
  assert.deepEqual(state.packedItems, {
    itemTent: true
  });
});

test("packed visual state is hidden when collection mode is off", () => {
  assert.equal(isCollectionPackedVisible({ collectionMode: false }, true), false);
  assert.equal(isCollectionPackedVisible({ collectionMode: true }, true), true);
  assert.equal(isCollectionPackedVisible({ collectionMode: true }, false), false);
});

test("dictionary changes can be covered by entity sync without full payload fallback", () => {
  const base = baseState({
    categories: ["Gear"],
    locations: ["Home"]
  });
  const local = baseState({
    categories: ["Gear", "Food"],
    locations: ["Home", "Bike"]
  });
  const deps = {
    cloneStateForSync: (state, options) => cloneStateForSyncPayload(state, options),
    createEmptyUserState: () => baseState()
  };

  const entries = buildChangedEntitySyncEntries("dictionary", base, local, deps);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "dictionary-state");
  assert.deepEqual(entries[0].payload.categories, ["Gear", "Food"]);
  assert.deepEqual(entries[0].payload.locations, ["Home", "Bike"]);
  assert.equal(hasLegacyPayloadChanges(base, local, { dictionary: { safeForLegacyCompare: true } }, deps), false);
});

test("dictionary changes still require full payload when dictionary entity sync is unavailable", () => {
  const base = baseState({
    categories: ["Gear"],
    locations: ["Home"]
  });
  const local = baseState({
    categories: ["Gear", "Food"],
    locations: ["Home"]
  });
  const deps = {
    cloneStateForSync: (state, options) => cloneStateForSyncPayload(state, options),
    createEmptyUserState: () => baseState()
  };

  assert.equal(hasLegacyPayloadChanges(base, local, { dictionary: { safeForLegacyCompare: false } }, deps), true);
});

test("top-level packed state is mirrored into layout sync payload and kept out of legacy payload", () => {
  const base = baseState({
    activeLayoutId: "layout-a",
    items: {
      "item-a": { id: "item-a", name: "Tent" }
    },
    layouts: {
      "layout-a": {
        id: "layout-a",
        arrangement: {
          rootContainerIds: [],
          containers: {},
          items: { "item-a": "bag-a" },
          packedItems: {}
        }
      }
    },
    packedItems: {}
  });
  const local = baseState({
    activeLayoutId: "layout-a",
    items: {
      "item-a": { id: "item-a", name: "Tent" }
    },
    layouts: {
      "layout-a": {
        id: "layout-a",
        arrangement: {
          rootContainerIds: [],
          containers: {},
          items: { "item-a": "bag-a" },
          packedItems: {}
        }
      }
    },
    packedItems: { "item-a": true }
  });
  const deps = {
    cloneStateForSync: (state, options) => cloneStateForSyncPayload(state, options),
    createEmptyUserState: () => baseState()
  };

  const payload = cloneStateForSyncPayload(local, { forSync: true });
  const layoutEntries = buildChangedEntitySyncEntries("layout", base, local, deps);

  assert.equal(payload.packedItems, undefined);
  assert.equal(payload.layouts["layout-a"].arrangement.packedItems["item-a"], true);
  assert.equal(layoutEntries.length, 1);
  assert.equal(layoutEntries[0].id, "layout-a");
  assert.equal(layoutEntries[0].payload.arrangement.packedItems["item-a"], true);
  assert.equal(hasLegacyPayloadChanges(base, local, { layout: { safeForLegacyCompare: true } }, deps), false);
});

test("covered entity sync changes leave no unexpected legacy top-level diff", () => {
  const base = baseState({
    activeLayoutId: "layout-a",
    categories: ["Gear"],
    locations: ["Home"],
    containers: {
      "bag-a": { id: "bag-a", name: "Bag", itemIds: ["item-a"], childIds: [], order: [{ type: "item", id: "item-a" }] }
    },
    items: {
      "item-a": { id: "item-a", name: "Tent", categories: ["Gear"], location: "Home" }
    },
    layouts: {
      "layout-a": {
        id: "layout-a",
        name: "Main",
        rootContainerIds: ["bag-a"],
        arrangement: {
          rootContainerIds: ["bag-a"],
          containers: {
            "bag-a": { parentId: "", itemIds: ["item-a"], childIds: [], order: [{ type: "item", id: "item-a" }] }
          },
          items: { "item-a": "bag-a" },
          packedItems: {}
        }
      }
    },
    packedItems: {}
  });
  const local = baseState({
    activeLayoutId: "layout-a",
    categories: ["Gear", "Food"],
    locations: ["Home", "Bike"],
    containers: {
      "bag-a": { id: "bag-a", name: "Frame bag", itemIds: ["item-a"], childIds: [], order: [{ type: "item", id: "item-a" }] }
    },
    items: {
      "item-a": { id: "item-a", name: "Tent Pro", categories: ["Gear"], location: "Bike" }
    },
    layouts: {
      "layout-a": {
        id: "layout-a",
        name: "Main",
        rootContainerIds: ["bag-a"],
        arrangement: {
          rootContainerIds: ["bag-a"],
          containers: {
            "bag-a": { parentId: "", itemIds: ["item-a"], childIds: [], order: [{ type: "item", id: "item-a" }] }
          },
          items: { "item-a": "bag-a" },
          packedItems: {}
        }
      }
    },
    packedItems: { "item-a": true }
  });
  const deps = {
    cloneStateForSync: (state, options) => cloneStateForSyncPayload(state, options),
    createEmptyUserState: () => baseState()
  };
  const entitySync = {
    item: { safeForLegacyCompare: true },
    container: { safeForLegacyCompare: true },
    layout: { safeForLegacyCompare: true },
    dictionary: { safeForLegacyCompare: true }
  };

  assert.equal(buildChangedEntitySyncEntries("item", base, local, deps).length, 1);
  assert.equal(buildChangedEntitySyncEntries("container", base, local, deps).length, 1);
  assert.equal(buildChangedEntitySyncEntries("layout", base, local, deps).length, 1);
  assert.equal(buildChangedEntitySyncEntries("dictionary", base, local, deps).length, 1);
  assert.deepEqual(legacyComparableTopLevelDiffKeys(base, local, entitySync, deps), []);
  assert.equal(hasLegacyPayloadChanges(base, local, entitySync, deps), false);
});

test("common user actions stay covered by entity sync without full payload fallback", () => {
  const deps = entitySyncDeps();
  const cases = [
    {
      name: "item category",
      expectedTypes: ["item"],
      mutate(local) {
        local.items["item-a"].categories = ["Food"];
      }
    },
    {
      name: "container category",
      expectedTypes: ["container"],
      mutate(local) {
        local.containers["bag-a"].categories = ["Food"];
      }
    },
    {
      name: "item location",
      expectedTypes: ["item"],
      mutate(local) {
        local.items["item-a"].location = "Bike";
      }
    },
    {
      name: "packed toggle",
      expectedTypes: ["layout"],
      mutate(local) {
        local.packedItems["item-a"] = true;
      }
    },
    {
      name: "move item between bags",
      expectedTypes: ["layout"],
      mutate(local) {
        const arrangement = local.layouts["layout-a"].arrangement;
        arrangement.items["item-a"] = "bag-b";
        arrangement.containers["bag-a"].itemIds = [];
        arrangement.containers["bag-a"].order = [];
        arrangement.containers["bag-b"].itemIds = ["item-a"];
        arrangement.containers["bag-b"].order = [{ type: "item", id: "item-a" }];
      }
    },
    {
      name: "root bag order",
      expectedTypes: ["layout"],
      mutate(local) {
        local.layouts["layout-a"].rootContainerIds = ["bag-b", "bag-a"];
        local.layouts["layout-a"].arrangement.rootContainerIds = ["bag-b", "bag-a"];
      }
    }
  ];

  cases.forEach(({ name, expectedTypes, mutate }) => {
    const base = commonActionBaseState();
    const local = cloneForTest(base);

    mutate(local);

    assert.deepEqual(changedEntityTypes(base, local, deps), expectedTypes, name);
    assert.deepEqual(
      legacyComparableTopLevelDiffKeys(base, local, allEntityTypesSafeForLegacyCompare(), deps),
      [],
      name
    );
    assert.equal(hasLegacyPayloadChanges(base, local, allEntityTypesSafeForLegacyCompare(), deps), false, name);
  });
});

test("legacy top-level diff diagnostics show uncovered server fields", () => {
  const base = baseState({
    customServerFlag: false
  });
  const local = baseState({
    customServerFlag: true
  });
  const deps = {
    cloneStateForSync: (state, options) => cloneStateForSyncPayload(state, options),
    createEmptyUserState: () => baseState()
  };

  assert.deepEqual(legacyComparableTopLevelDiffKeys(base, local, {}, deps), ["customServerFlag"]);
  assert.equal(hasLegacyPayloadChanges(base, local, {}, deps), true);
});

test("full payload fallback reason summarizes legacy top-level fields", () => {
  assert.equal(
    legacyPayloadFallbackReasonText(["customRuntimeField", "syncProbe"]),
    "legacy diff: customRuntimeField, syncProbe"
  );
  assert.equal(
    legacyPayloadFallbackReasonText(["a", "b", "c", "d", "e", "f"]),
    "legacy diff: a, b, c, d +2"
  );
});
