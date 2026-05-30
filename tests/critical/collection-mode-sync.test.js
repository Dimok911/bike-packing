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
import { pruneAdminPublishedDraftsForSync } from "../../src/sync/save-body.js";
import {
  ensureLayoutDictionaries,
  ensurePrivateDictionaries,
  normalizePrivateDictionariesForSync,
  pruneUnusedLayoutCustomDictionaries,
  removeCustomDictionaryValue,
  renameCustomDictionaryValue,
  sortDictionaryValues
} from "../../src/state/dictionaries.js";
import {
  getLayoutContainerIdSet,
  getLayoutItemIdSet
} from "../../src/state/layout-ops.js";
import { renderDictionaryHtml } from "../../src/ui/settings-render.js";

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
    locations: ["Home"],
    customCategories: ["Gear"],
    customLocations: ["Home"]
  });
  const local = baseState({
    categories: ["Gear", "Food"],
    locations: ["Home", "Bike"],
    customCategories: ["Gear", "Food"],
    customLocations: ["Home", "Bike"]
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
  assert.deepEqual(entries[0].payload.customCategories, ["Gear", "Food"]);
  assert.deepEqual(entries[0].payload.customLocations, ["Home", "Bike"]);
  assert.equal(hasLegacyPayloadChanges(base, local, { dictionary: { safeForLegacyCompare: true } }, deps), false);
});

test("private dictionary sync drops template-only values after public draft pruning", () => {
  const stateWithTemplate = baseState({
    categories: ["Gear", "Template only"],
    locations: ["Home", "Template camp"],
    containers: {
      "private-bag": { id: "private-bag", categories: ["Gear"], location: "Home", childIds: [], itemIds: [], order: [] },
      "template-bag": { id: "template-bag", categories: ["Template only"], location: "Template camp", childIds: [], itemIds: ["template-item"], order: [{ type: "item", id: "template-item" }] }
    },
    items: {
      "template-item": { id: "template-item", categories: ["Template only"], location: "Template camp", containerId: "template-bag" }
    },
    layouts: {
      "private-layout": { id: "private-layout", rootContainerIds: ["private-bag"] },
      "template-layout": { id: "template-layout", adminDemo: true, rootContainerIds: ["template-bag"] }
    }
  });
  const payload = cloneStateForSyncPayload(stateWithTemplate, {
    forSync: true,
    normalizeDictionariesForSync: (targetState) => normalizePrivateDictionariesForSync(targetState, {
      categories: ["Gear"],
      locations: ["Home"],
      getLayoutContainerIdSet: (targetStateValue, layout) => new Set(layout.rootContainerIds || []),
      getLayoutItemIdSet: (targetStateValue, layout) => {
        const ids = new Set();
        (layout.rootContainerIds || []).forEach((containerId) => {
          (targetStateValue.containers?.[containerId]?.itemIds || []).forEach((itemId) => ids.add(itemId));
        });
        return ids;
      }
    }),
    pruneAdminPublishedDraftsForSync: (targetState) => pruneAdminPublishedDraftsForSync(targetState, {
      getPublicLayoutRecordIds: () => ({
        containerIds: new Set(["template-bag"]),
        itemIds: new Set(["template-item"])
      }),
      guestDemoCopyFlag: "__guestDemoCopy"
    })
  });

  assert.deepEqual(payload.categories, ["Gear"]);
  assert.deepEqual(payload.locations, ["Home"]);
  assert.equal(payload.containers["template-bag"], undefined);
  assert.equal(payload.items["template-item"], undefined);
  assert.equal(payload.layouts["template-layout"], undefined);
});

test("private dictionaries ignore template items stored only in layout arrangement placements", () => {
  const state = baseState({
    categories: ["Gear", "Template only"],
    locations: ["Home", "Template camp"],
    containers: {
      "private-bag": { id: "private-bag", categories: ["Gear"], location: "Home", childIds: [], itemIds: [], order: [] },
      "template-bag": { id: "template-bag", categories: [], location: "", childIds: [], itemIds: [], order: [] }
    },
    items: {
      "template-item": { id: "template-item", categories: ["Template only"], location: "Template camp" }
    },
    layouts: {
      "private-layout": { id: "private-layout", rootContainerIds: ["private-bag"] },
      "template-layout": {
        id: "template-layout",
        adminDemo: true,
        arrangement: {
          rootContainerIds: ["template-bag"],
          containers: {
            "template-bag": {
              itemIds: ["template-item"],
              childIds: [],
              order: [{ type: "item", id: "template-item" }]
            }
          },
          items: {}
        }
      }
    }
  });

  ensurePrivateDictionaries(state, {
    getLayoutContainerIdSet,
    getLayoutItemIdSet
  });

  assert.deepEqual(state.categories, ["Gear"]);
  assert.deepEqual(state.locations, ["Home"]);
});

test("private dictionaries ignore public sync records that dictionary editing also skips", () => {
  const state = baseState({
    categories: ["Gear", "Sleep", "Manual"],
    locations: ["Home", "Camp", "Manual shelf"],
    customCategories: ["Sleep", "Manual"],
    customLocations: ["Camp", "Manual shelf"],
    containers: {
      "private-bag": { id: "private-bag", categories: ["Gear"], location: "Home", childIds: [], itemIds: [], order: [] }
    },
    items: {
      "public-item": { id: "public-item", categories: ["Sleep"], location: "Camp", sourceType: "public-template" }
    }
  });

  removeCustomDictionaryValue(state, "category", "Sleep");
  removeCustomDictionaryValue(state, "location", "Camp");
  ensurePrivateDictionaries(state, {
    isPublicSyncItem: (itemId, item) => item?.sourceType === "public-template"
  });

  assert.deepEqual(state.categories, ["Manual", "Gear"]);
  assert.deepEqual(state.locations, ["Manual shelf", "Home"]);
});

test("default dictionary values are not mixed into private dictionaries", () => {
  const state = baseState({
    categories: [],
    locations: []
  });
  const defaults = {
    categories: ["Sleep", "Food"],
    locations: ["Home", "Bike"]
  };

  ensurePrivateDictionaries(state, defaults);

  assert.deepEqual(state.categories, []);
  assert.deepEqual(state.locations, []);
});

test("layout dictionaries can preserve unused custom values", () => {
  const state = baseState({
    containers: {
      "bag-a": { id: "bag-a", categories: ["Gear"], location: "Home", childIds: [], itemIds: ["item-a"], order: [] }
    },
    items: {
      "item-a": { id: "item-a", categories: ["Food"], location: "Bike", containerId: "bag-a" }
    }
  });
  const layout = {
    id: "layout-a",
    rootContainerIds: ["bag-a"],
    customCategories: ["Future category"],
    customLocations: ["Future shelf"]
  };

  ensureLayoutDictionaries(layout, {
    sourceState: state,
    getLayoutContainerIdSet,
    getLayoutItemIdSet
  });

  assert.deepEqual(layout.categories, ["Future category", "Gear", "Food"]);
  assert.deepEqual(layout.locations, ["Future shelf", "Home", "Bike"]);
});

test("unedited guest demo copies can prune stale unused layout dictionary values", () => {
  const state = baseState({
    containers: {
      "bag-a": { id: "bag-a", categories: ["Gear"], location: "Home", childIds: [], itemIds: ["item-a"], order: [] }
    },
    items: {
      "item-a": { id: "item-a", categories: ["Food"], location: "Bike", containerId: "bag-a" }
    }
  });
  const layout = {
    id: "layout-a",
    rootContainerIds: ["bag-a"],
    customCategories: ["Future category", "Gear"],
    customLocations: ["Future shelf", "Home"]
  };

  const changed = pruneUnusedLayoutCustomDictionaries(layout, {
    sourceState: state,
    getLayoutContainerIdSet,
    getLayoutItemIdSet
  });

  assert.equal(changed, true);
  assert.deepEqual(layout.customCategories, ["Gear"]);
  assert.deepEqual(layout.customLocations, ["Home"]);
  assert.deepEqual(layout.categories, ["Gear", "Food"]);
  assert.deepEqual(layout.locations, ["Home", "Bike"]);
});

test("renaming a dictionary value adds only the replacement value", () => {
  const state = baseState({
    categories: ["Sleep"],
    locations: ["Home"],
    customCategories: ["Sleep"],
    customLocations: ["Home"]
  });

  removeCustomDictionaryValue(state, "category", "Sleep");
  renameCustomDictionaryValue(state, "location", "Home", "Home test");
  ensurePrivateDictionaries(state, {
    categories: ["Sleep", "Food"],
    locations: ["Home", "Bike"]
  });

  assert.deepEqual(state.categories, []);
  assert.deepEqual(state.locations, ["Home test"]);

  const entries = buildChangedEntitySyncEntries("dictionary", baseState(), state, entitySyncDeps());
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].payload.categories, []);
  assert.deepEqual(entries[0].payload.locations, ["Home test"]);
});

test("empty custom dictionary values survive even when templates use the same value", () => {
  const state = baseState({
    categories: ["Gear", "Camping", "Manual"],
    locations: ["Home", "Template camp", "Manual shelf"],
    customCategories: ["Camping", "Manual"],
    customLocations: ["Template camp", "Manual shelf"],
    containers: {
      "private-bag": { id: "private-bag", categories: ["Gear"], location: "Home", childIds: [], itemIds: [], order: [] },
      "template-bag": { id: "template-bag", categories: ["Camping"], location: "Template camp", childIds: [], itemIds: [], order: [] }
    },
    layouts: {
      "private-layout": { id: "private-layout", rootContainerIds: ["private-bag"] },
      "template-layout": { id: "template-layout", adminDemo: true, rootContainerIds: ["template-bag"] }
    }
  });
  const helpers = {
    getLayoutContainerIdSet: (targetStateValue, layout) => new Set(layout.rootContainerIds || []),
    getLayoutItemIdSet: () => new Set()
  };

  ensurePrivateDictionaries(state, helpers);

  assert.deepEqual(state.customCategories, ["Camping", "Manual"]);
  assert.deepEqual(state.customLocations, ["Template camp", "Manual shelf"]);
  assert.deepEqual(state.categories, ["Camping", "Manual", "Gear"]);
  assert.deepEqual(state.locations, ["Template camp", "Manual shelf", "Home"]);
});

test("dictionary values can be sorted without changing the stored order", () => {
  const values = ["Camping", "Bike", "Other"];

  assert.deepEqual(sortDictionaryValues(values, "asc", "en"), ["Bike", "Camping", "Other"]);
  assert.deepEqual(sortDictionaryValues(values, "desc", "en"), ["Other", "Camping", "Bike"]);
  assert.deepEqual(values, ["Camping", "Bike", "Other"]);
});

test("dictionary renderer exposes the sort control", () => {
  const html = renderDictionaryHtml("Categories", "category", ["Camping"], {
    sortMode: "asc",
    t: (key) => key
  });

  assert.match(html, /data-dictionary-sort="category"/);
  assert.match(html, /item-sort-button active/);
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
