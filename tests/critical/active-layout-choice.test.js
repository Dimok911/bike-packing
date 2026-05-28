import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveStoredPrivateLayoutChoice,
  resolveStoredPrivateLayoutChoiceForState
} from "../../src/storage/active-choice.js";
import {
  cloneStateForSyncPayload
} from "../../src/sync/serialize.js";
import {
  installRuntimeActiveLayoutId
} from "../../src/state/active-layout-runtime.js";
import {
  containerCategories,
  itemCategories,
  normalizeItemCategories,
  normalizeContainerFields
} from "../../src/state/normalize.js";
import {
  itemTotalWeight,
  layoutContainersOwnWeight
} from "../../src/state/metrics.js";
import {
  checkAuthAndLoadFlow
} from "../../src/sync/auth-load-flow.js";

const privateIds = new Set(["layout-a", "layout-b", "layout-c"]);
const normalizeChoice = (choice) => String(choice || "").trim();
const isPrivateChoice = (choice) => Boolean(choice && !choice.startsWith("shared:") && !choice.startsWith("demo:"));
const isPrivateUserLayoutId = (choice) => privateIds.has(choice);

test("CRITICAL sync-save: stored private layout choice wins over server active layout", () => {
  assert.equal(
    resolveStoredPrivateLayoutChoice({
      activeLayoutId: "layout-c",
      storedPrivateChoice: "layout-a",
      storedChoice: "layout-b",
      normalizeChoice,
      isPrivateChoice,
      isPrivateUserLayoutId
    }),
    "layout-a"
  );
});

test("CRITICAL sync-save: legacy general layout choice is preserved before server active fallback", () => {
  assert.equal(
    resolveStoredPrivateLayoutChoice({
      activeLayoutId: "layout-c",
      storedPrivateChoice: "",
      storedChoice: "layout-b",
      normalizeChoice,
      isPrivateChoice,
      isPrivateUserLayoutId
    }),
    "layout-b"
  );
});

test("CRITICAL sync-save: public saved choice is ignored for private startup restore", () => {
  assert.equal(
    resolveStoredPrivateLayoutChoice({
      activeLayoutId: "layout-c",
      storedPrivateChoice: "",
      storedChoice: "shared:template-1",
      normalizeChoice,
      isPrivateChoice,
      isPrivateUserLayoutId
    }),
    "layout-c"
  );
});

test("CRITICAL sync-save: stale stored private choice falls back to current private layout", () => {
  assert.equal(
    resolveStoredPrivateLayoutChoice({
      activeLayoutId: "layout-c",
      storedPrivateChoice: "layout-deleted",
      storedChoice: "layout-missing",
      normalizeChoice,
      isPrivateChoice,
      isPrivateUserLayoutId
    }),
    "layout-c"
  );
});

test("CRITICAL sync-save: local snapshot restores stored private layout choice before first render", () => {
  const targetState = {
    activeLayoutId: "layout-c",
    layouts: {
      "layout-a": { id: "layout-a", name: "Stored" },
      "layout-b": { id: "layout-b", name: "General stored" },
      "layout-c": { id: "layout-c", name: "Server fallback" }
    }
  };

  assert.equal(
    resolveStoredPrivateLayoutChoiceForState(targetState, {
      storedPrivateChoice: "layout-a",
      storedChoice: "layout-b",
      normalizeChoice,
      isPrivateChoice,
      guestDemoCopyFlag: "__guest"
    }),
    "layout-a"
  );
});

test("CRITICAL sync-save: local snapshot ignores stored public or guest layout choice", () => {
  const targetState = {
    activeLayoutId: "layout-c",
    layouts: {
      "layout-a": { id: "layout-a", name: "Guest", __guest: true },
      "layout-c": { id: "layout-c", name: "Server fallback" }
    }
  };

  assert.equal(
    resolveStoredPrivateLayoutChoiceForState(targetState, {
      storedPrivateChoice: "layout-a",
      storedChoice: "shared:template-1",
      normalizeChoice,
      isPrivateChoice,
      guestDemoCopyFlag: "__guest"
    }),
    "layout-c"
  );
});

test("CRITICAL sync-save: active layout choice is not written to sync payload", () => {
  const payload = cloneStateForSyncPayload({
    activeLayoutId: "layout-c",
    locations: [],
    categories: [],
    containers: {},
    items: {},
    layouts: {
      "layout-c": {
        id: "layout-c",
        name: "Current",
        rootContainerIds: []
      }
    }
  }, { forSync: true });

  assert.equal(Object.hasOwn(payload, "activeLayoutId"), false);
});

test("CRITICAL sync-save: runtime active layout id is readable but not serialized as state", () => {
  const state = installRuntimeActiveLayoutId({
    activeLayoutId: "layout-a",
    layouts: {
      "layout-a": { id: "layout-a", name: "A" },
      "layout-b": { id: "layout-b", name: "B" }
    }
  }, "layout-a");

  assert.equal(state.activeLayoutId, "layout-a");
  state.activeLayoutId = "layout-b";
  assert.equal(state.activeLayoutId, "layout-b");
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(state)), "activeLayoutId"), false);
});

test("CRITICAL sync-save: auth load keeps visible private layout as remote preferred choice", async () => {
  let activeLayoutId = "layout-last";
  const remoteLoads = [];
  const runtime = {
    appUnlocked: false,
    currentUser: null,
    syncMeta: { dirty: false }
  };
  const dependencies = {
    activateLocalStorageScope: () => {},
    activateLocalStorageScopeForCurrentUser: () => {
      activeLayoutId = "layout-server";
    },
    activateOfflineRememberedSession: () => false,
    apiFetch: async () => ({ user: { id: "user-1", email: "u@example.test" } }),
    applyPreferredPrivateLayoutChoice: (preferred) => {
      activeLayoutId = preferred.id;
      return true;
    },
    checkAdminApiCompatibility: () => ({ catch: () => null }),
    clearOfflineRememberedSession: () => {},
    currentPrivateLayoutRef: () => ({
      id: activeLayoutId,
      name: activeLayoutId === "layout-last" ? "Last layout" : "Server layout",
      allowEmpty: true
    }),
    currentPublicTemplateStatusMessage: () => "",
    enterSignedOutPublicMode: async () => {},
    hasLocalSavedState: () => false,
    isAdminUser: () => false,
    isExplicitlySignedOut: () => false,
    isForcedOffline: () => false,
    isNetworkError: () => false,
    isSharedListLinkRoute: () => false,
    loadGuestPublishedDemoOnStartup: async () => {},
    loadRemoteState: async (options) => {
      remoteLoads.push(options);
    },
    rememberAuthenticatedUser: () => {},
    renderCachedPrivateStateDuringRemoteLoad: async () => {},
    renderInitialLocalFallbackIfNeeded: () => {},
    restoreSavedLayoutChoice: async () => {},
    restoreTemplateCopyDraftsFromRecovery: () => {},
    setExplicitlySignedOut: () => {},
    setLayoutLoadStatus: () => {},
    setPersonalLayoutsLoadedStatus: () => {},
    shouldKeepCurrentReadonlyDemoAfterAuthCheck: () => false,
    storedPrivateLayoutChoiceRef: () => null,
    unlockOfflineState: () => {},
    updateSyncUi: () => {},
    GUEST_STORAGE_SCOPE: "guest"
  };

  await checkAuthAndLoadFlow({ runtime, dependencies });

  assert.equal(activeLayoutId, "layout-last");
  assert.equal(remoteLoads.length, 1);
  assert.equal(remoteLoads[0].preferredLayout.id, "layout-last");
});

test("container category edits can save an explicitly empty category list", () => {
  const targetState = {
    categories: ["Кемпинг", "Прочее"],
    locations: ["Уже на велосипеде"],
    containers: {
      "container-a": {
        id: "container-a",
        name: "Bag",
        categories: [],
        category: "",
        childIds: [],
        itemIds: []
      }
    }
  };

  normalizeContainerFields(targetState);

  assert.deepEqual(containerCategories(targetState.containers["container-a"]), []);
  assert.equal(targetState.containers["container-a"].category, "");
});

test("legacy containers without a category list still receive a default category", () => {
  const targetState = {
    categories: ["Кемпинг", "Прочее"],
    locations: ["Уже на велосипеде"],
    containers: {
      "container-a": {
        id: "container-a",
        name: "Bag",
        childIds: [],
        itemIds: []
      }
    }
  };

  normalizeContainerFields(targetState);

  assert.deepEqual(containerCategories(targetState.containers["container-a"]), ["Кемпинг"]);
});

test("item category edits can save an explicitly empty category list", () => {
  const targetState = {
    categories: ["Кемпинг", "Прочее"],
    items: {
      "item-a": {
        id: "item-a",
        name: "Thing",
        categories: [],
        category: ""
      }
    }
  };

  normalizeItemCategories(targetState);

  assert.deepEqual(itemCategories(targetState.items["item-a"]), []);
  assert.equal(targetState.items["item-a"].category, "");
});

test("legacy items without a category list still receive a default category", () => {
  const targetState = {
    categories: ["Кемпинг", "Прочее"],
    items: {
      "item-a": {
        id: "item-a",
        name: "Thing"
      }
    }
  };

  normalizeItemCategories(targetState);

  assert.deepEqual(itemCategories(targetState.items["item-a"]), ["Кемпинг"]);
});

test("settings summary weight can include every bag in the active layout", () => {
  const targetState = {
    activeLayoutId: "layout-a",
    containers: {
      root: { id: "root", weight: 500, childIds: ["nested"], itemIds: ["item-a"] },
      nested: { id: "nested", weight: 250, childIds: [], itemIds: ["item-b"] },
      catalog: { id: "catalog", weight: 1000, childIds: [], itemIds: [] }
    },
    items: {
      "item-a": { id: "item-a", weight: 100, quantity: 2 },
      "item-b": { id: "item-b", weight: 50, quantity: 1 }
    },
    layouts: {
      "layout-a": { id: "layout-a", rootContainerIds: ["root"] }
    }
  };

  const itemWeight = Object.values(targetState.items).reduce((sum, item) => sum + itemTotalWeight(item), 0);

  assert.equal(layoutContainersOwnWeight(targetState, targetState.layouts["layout-a"]), 750);
  assert.equal(layoutContainersOwnWeight(targetState, targetState.layouts["layout-a"]) + itemWeight, 1000);
});
