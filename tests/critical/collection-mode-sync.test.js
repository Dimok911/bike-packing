import test from "node:test";
import assert from "node:assert/strict";
import {
  isCollectionPackedVisible,
  normalizeCollectionModeState,
  toggleCollectionModeEnabled,
  toggleShowOnlyUnpacked
} from "../../src/state/collection-mode.js";
import { cloneStateForSyncPayload } from "../../src/sync/serialize.js";

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

test("sync payload keeps collection mode and unpacked filter", () => {
  const payload = cloneStateForSyncPayload(baseState({
    collectionMode: true,
    showOnlyUnpacked: true
  }), { forSync: true });

  assert.equal(payload.collectionMode, true);
  assert.equal(payload.showOnlyUnpacked, true);
  assert.equal(payload.itemDisplayMode, undefined);
  assert.equal(payload.showFilterContext, undefined);
  assert.equal(payload.collapsedContainers, undefined);
});

test("unpacked filter cannot sync as enabled while collection mode is off", () => {
  const payload = cloneStateForSyncPayload(baseState({
    collectionMode: false,
    showOnlyUnpacked: true
  }), { forSync: true });

  assert.equal(payload.collectionMode, false);
  assert.equal(payload.showOnlyUnpacked, false);
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
