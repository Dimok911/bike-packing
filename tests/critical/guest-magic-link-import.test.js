import test from "node:test";
import assert from "node:assert/strict";
import { checkAuthAndLoadFlow } from "../../src/sync/auth-load-flow.js";
import { loadRemoteStateFlow } from "../../src/sync/load-remote-state-flow.js";
import {
  guestLocalLayoutCandidateFromState,
  importGuestLocalLayoutsToState,
  persistGuestImportBeforeCleanup,
  validateGuestImportSyncState
} from "../../src/public/guest-login-import.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

function blankState() {
  return {
    locations: [],
    categories: [],
    customLocations: [],
    customCategories: [],
    containers: {},
    items: {},
    layouts: {},
    activeLayoutId: ""
  };
}

function editedGuestState() {
  const createdAt = "2026-07-16T10:00:00.000Z";
  return {
    locations: ["Home", "Workshop"],
    categories: ["Clothes", "Rain gear"],
    customLocations: ["Workshop"],
    customCategories: ["Rain gear"],
    containers: {
      "bag-guest": {
        id: "bag-guest",
        name: "Renamed handlebar bag",
        childIds: [],
        itemIds: ["item-guest"],
        order: [{ type: "item", id: "item-guest" }],
        createdAt,
        updatedAt: "2026-07-16T10:02:00.000Z"
      }
    },
    items: {
      "item-guest": {
        id: "item-guest",
        name: "Renamed rain shell",
        containerId: "bag-guest",
        location: "Workshop",
        categories: ["Rain gear"],
        createdAt,
        updatedAt: "2026-07-16T10:01:00.000Z"
      }
    },
    layouts: {
      "layout-guest-demo-reloaded": {
        id: "layout-guest-demo-reloaded",
        name: "Weekend",
        guestDemoCopy: true,
        demoSourceLanguage: "en",
        guestDemoCopyCreatedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
        rootContainerIds: ["bag-guest"],
        arrangement: {
          rootContainerIds: ["bag-guest"],
          containers: {
            "bag-guest": {
              parentId: "",
              childIds: [],
              itemIds: ["item-guest"],
              order: [{ type: "item", id: "item-guest" }]
            }
          },
          items: { "item-guest": "bag-guest" },
          packedItems: { "item-guest": true }
        },
        locations: ["Home", "Workshop"],
        categories: ["Clothes", "Rain gear"],
        customLocations: ["Workshop"],
        customCategories: ["Rain gear"]
      }
    },
    activeLayoutId: "layout-guest-demo-reloaded",
    itemDisplayMode: "photos",
    showItemMeta: false,
    showFilterContext: true
  };
}

function existingServerProfile() {
  return {
    locations: ["Home"],
    categories: ["Clothes"],
    customLocations: [],
    customCategories: [],
    containers: {
      "bag-server": {
        id: "bag-server",
        name: "Existing saddle bag",
        childIds: [],
        itemIds: ["item-server"],
        order: [{ type: "item", id: "item-server" }]
      }
    },
    items: {
      "item-server": {
        id: "item-server",
        name: "Existing tool kit",
        containerId: "bag-server"
      }
    },
    layouts: {
      "layout-server": {
        id: "layout-server",
        name: "Weekend",
        rootContainerIds: ["bag-server"],
        arrangement: {
          rootContainerIds: ["bag-server"],
          containers: {
            "bag-server": {
              parentId: "",
              childIds: [],
              itemIds: ["item-server"],
              order: [{ type: "item", id: "item-server" }]
            }
          },
          items: { "item-server": "bag-server" },
          packedItems: {}
        }
      }
    },
    activeLayoutId: "layout-server"
  };
}

function normalizeValues(values = [], fallback = []) {
  return [...new Set([
    ...(Array.isArray(values) ? values : []),
    ...(Array.isArray(fallback) ? fallback : [])
  ])];
}

function uniqueLayoutNameForState(state, requestedName) {
  const names = new Set(Object.values(state.layouts || {}).map((layout) => layout.name));
  if (!names.has(requestedName)) return requestedName;
  let suffix = 2;
  while (names.has(`${requestedName} ${suffix}`)) suffix += 1;
  return `${requestedName} ${suffix}`;
}

async function runMagicLinkReloadImport(user) {
  const guestStorageKey = "guest:state";
  const storage = new Map([[guestStorageKey, clone(editedGuestState())]]);
  let currentScope = "guest";
  let authConfirmed = false;
  let pendingGuestLocalLayoutCandidate = null;
  let serverState = existingServerProfile();
  let importedLayoutIds = [];
  let guestPresentDuringServerSave = false;
  let guestOfferCount = 0;
  const syncMessages = [];
  const scopeEvents = [];
  const runtime = {
    appUnlocked: false,
    currentUser: null,
    initialRemoteLoadPending: true,
    pendingGuestLocalLayoutCandidate,
    remoteRefreshInFlight: false,
    // A full reload has discarded the volatile candidate. The auth-check preview
    // is intentionally non-authoritative, so recovery must read guest storage.
    state: blankState(),
    syncMeta: { dirty: false },
    uiLanguage: "en"
  };

  const offerStoredGuestLayout = async () => {
    guestOfferCount += 1;
    assert.equal(pendingGuestLocalLayoutCandidate, null);
    assert.equal(currentScope, `id:${user.id}`);
    const storedGuestState = storage.get(guestStorageKey);
    if (!storedGuestState) return false;
    const candidate = guestLocalLayoutCandidateFromState(storedGuestState, {
      cloneStateForSync: clone,
      cloneValue: clone,
      createEmptyUserState: blankState,
      fallbackName: "Guest layout",
      fallbackNameForLayout: () => "Guest layout",
      snapshotsEqual: (left, right) => JSON.stringify(left) === JSON.stringify(right)
    });
    assert.ok(candidate, "the edited candidate must be reconstructed from guest storage after reload");

    const copiedContainers = new Map();
    importedLayoutIds = importGuestLocalLayoutsToState(runtime.state, candidate, {
      addBackupDictionaryValues: () => {},
      applyGuestLocalDisplayPreferences: (target, preferences) => Object.assign(target, preferences),
      applyLayoutArrangement: () => {},
      cloneValue: clone,
      copyPublishedContainerToState: (source, sourceContainerId) => {
        const sourceContainer = source.containers[sourceContainerId];
        const containerId = `imported-${sourceContainerId}`;
        const itemIds = (sourceContainer.itemIds || []).map((sourceItemId) => {
          const itemId = `imported-${sourceItemId}`;
          runtime.state.items[itemId] = {
            ...clone(source.items[sourceItemId]),
            id: itemId,
            containerId
          };
          return itemId;
        });
        runtime.state.containers[containerId] = {
          ...clone(sourceContainer),
          id: containerId,
          itemIds,
          order: itemIds.map((itemId) => ({ type: "item", id: itemId }))
        };
        copiedContainers.set(containerId, itemIds);
        return containerId;
      },
      createLayoutArrangementFromCurrentState: (_target, rootContainerIds) => ({
        rootContainerIds,
        containers: Object.fromEntries(rootContainerIds.map((containerId) => [containerId, {
          parentId: "",
          childIds: [],
          itemIds: copiedContainers.get(containerId) || [],
          order: (copiedContainers.get(containerId) || []).map((itemId) => ({ type: "item", id: itemId }))
        }])),
        items: Object.fromEntries([...copiedContainers].flatMap(([containerId, itemIds]) =>
          itemIds.map((itemId) => [itemId, containerId])
        )),
        packedItems: {}
      }),
      currentCreateMeta: (changedAt) => ({ createdAt: changedAt, updatedAt: changedAt }),
      guestCandidateLayouts: (value) => value.layouts,
      guestDemoCopyFlag: "guestDemoCopy",
      guestLayoutFallbackName: "Guest layout",
      guestLocalDisplayPreferences: () => ({}),
      layoutDictionaryValues: (layout, type) => type === "location" ? layout.locations : layout.categories,
      normalizeContainerFields: () => {},
      normalizeDictionaryValues: normalizeValues,
      normalizeItemCategories: () => {},
      normalizeItemFields: () => {},
      normalizeLayoutFields: () => {},
      migrateContainerOrder: () => {},
      nowIso: () => "2026-07-16T12:00:00.000Z",
      readableGuestDemoLayoutName: (name, fallback) => name || fallback,
      rememberActiveLayoutChoice: () => {},
      repairContainerMembershipFromItemLinks: () => {},
      saveRecoverySnapshot: () => {},
      saveState: () => {},
      setActivePrivateScope: () => {},
      uniqueLayoutName: (name) => uniqueLayoutNameForState(runtime.state, name)
    });

    assert.equal(validateGuestImportSyncState(runtime.state, importedLayoutIds).ok, true);
    return persistGuestImportBeforeCleanup(importedLayoutIds, {
      persistImport: async (layoutIds) => {
        guestPresentDuringServerSave = storage.has(guestStorageKey);
        serverState = clone(runtime.state);
        return validateGuestImportSyncState(serverState, layoutIds).ok;
      },
      clearGuestStorage: () => storage.delete(guestStorageKey)
    });
  };

  const loadRemoteState = async () => loadRemoteStateFlow({
    runtime,
    dependencies: {
      applyRemoteState: (nextState) => {
        runtime.state = clone(nextState);
        return true;
      },
      blockRemoteIntegrityFailureIfNeeded: () => false,
      canLocalStateOverrideRemote: () => false,
      clearStaleDirtyFlagIfNoLocalChanges: () => false,
      cloneStateForSync: clone,
      consumeGuestLocalLayoutCandidate: () => {
        const candidate = pendingGuestLocalLayoutCandidate;
        pendingGuestLocalLayoutCandidate = null;
        return candidate;
      },
      createBlankBikePackingState: blankState,
      createEmptyUserState: blankState,
      fetchRemoteStateRecord: async () => ({
        record: {
          id: "list-existing",
          payload: clone(serverState),
          updatedAt: "2026-07-16T11:00:00.000Z",
          stateRevision: 7
        },
        source: "catalog"
      }),
      hasLocalSavedState: () => false,
      isMeaningfulPackingState: (value) => Boolean(Object.keys(value?.layouts || {}).length),
      isNetworkError: () => false,
      isPublicLayoutContext: () => false,
      isSharedListLinkRoute: () => false,
      isSuspiciousEmptyPackingState: (value) => !Object.keys(value?.items || {}).length && !Object.keys(value?.containers || {}).length,
      isTemporaryServerStorageError: () => false,
      isTimeoutError: () => false,
      normalizeRemoteState: (value) => value ? clone(value) : null,
      offerPendingGuestLocalLayoutsAfterRemoteLoad: offerStoredGuestLayout,
      remoteUpdatedAt: (record) => record?.updatedAt || "",
      rememberCurrentSyncAccount: () => {},
      rememberRemoteIntegrityMeta: () => {},
      renderInitialLocalFallbackIfNeeded: () => {},
      renderPreservingPackingScroll: () => {},
      repairPrivateMojibakeLayoutNames: () => {},
      saveBaseState: () => {},
      saveSyncMeta: () => {},
      serializeState: () => clone(runtime.state),
      setLayoutLoadProgress: () => {},
      setLayoutLoadStatus: () => {},
      setPersonalLayoutsLoadedStatus: () => {},
      shouldImportGuestLayoutBeforeRemote: () => false,
      showToast: () => {},
      stateIntegrityMetaFromResponse: () => ({ stateRevision: 7 }),
      statePrivateLayoutCount: (value) => Object.keys(value?.layouts || {}).length,
      timeValue: (value) => Date.parse(value) || 0,
      updateSyncUi: (message) => { if (message) syncMessages.push(message); }
    }
  });

  await checkAuthAndLoadFlow({
    runtime,
    dependencies: {
      activateLocalStorageScope: () => {},
      activateLocalStorageScopeForCurrentUser: () => {
        assert.equal(authConfirmed, true, "private scope cannot activate before /auth/me confirms the account");
        currentScope = `id:${runtime.currentUser.id}`;
        scopeEvents.push(currentScope);
        runtime.state = blankState();
      },
      activateOfflineRememberedSession: () => false,
      apiFetch: async (path) => {
        assert.equal(path, "/auth/me");
        authConfirmed = true;
        return { user };
      },
      applyPreferredPrivateLayoutChoice: () => {},
      checkAdminApiCompatibility: async () => {},
      clearOfflineRememberedSession: () => {},
      currentPrivateLayoutRef: () => null,
      currentPublicTemplateStatusMessage: () => "",
      enterSignedOutPublicMode: async () => {},
      hasLocalSavedState: () => false,
      isAdminUser: () => Boolean(runtime.currentUser?.admin),
      isExplicitlySignedOut: () => false,
      isForcedOffline: () => false,
      isNetworkError: () => false,
      isSharedListLinkRoute: () => false,
      loadGuestPublishedDemoOnStartup: async () => {},
      loadRemoteState,
      rememberAuthenticatedUser: () => {},
      renderCachedPrivateStateDuringRemoteLoad: async () => false,
      renderInitialLocalFallbackIfNeeded: () => {},
      restoreSavedLayoutChoice: async () => {},
      setExplicitlySignedOut: () => {},
      setLayoutLoadStatus: () => {},
      setPersonalLayoutsLoadedStatus: () => {},
      shouldKeepCurrentReadonlyDemoAfterAuthCheck: () => false,
      storedPrivateLayoutChoiceRef: () => null,
      unlockOfflineState: () => {},
      updateSyncUi: () => {},
      GUEST_STORAGE_SCOPE: "guest"
    }
  });

  assert.equal(importedLayoutIds.length, 1, `one edited guest layout must reach the server profile; messages: ${syncMessages.join(" | ")}`);
  const importedLayout = serverState.layouts[importedLayoutIds[0]];
  const importedRootId = importedLayout.rootContainerIds[0];
  const importedItemId = serverState.containers[importedRootId].itemIds[0];
  assert.deepEqual(scopeEvents, [`id:${user.id}`]);
  assert.equal(guestOfferCount, 1);
  assert.equal(guestPresentDuringServerSave, true, "guest storage must survive until the server save is confirmed");
  assert.equal(storage.has(guestStorageKey), false, "confirmed server persistence may clear guest storage");
  assert.deepEqual(Object.values(serverState.layouts).map((layout) => layout.name).sort(), ["Weekend", "Weekend 2"]);
  assert.equal(importedLayout.name, "Weekend 2");
  assert.equal(serverState.containers[importedRootId].name, "Renamed handlebar bag");
  assert.equal(serverState.items[importedItemId].name, "Renamed rain shell");
  assert.equal(importedLayout.arrangement.items[importedItemId], importedRootId);
  assert.ok(serverState.locations.includes("Workshop"));
  assert.ok(serverState.categories.includes("Rain gear"));
  assert.ok(serverState.customLocations.includes("Workshop"));
  assert.ok(serverState.customCategories.includes("Rain gear"));
}

test("CRITICAL guest magic-link import: reload restores edited guest layout beside a same-name server layout", async () => {
  await runMagicLinkReloadImport({ id: "user-regular", email: "regular@example.com" });
});

test("CRITICAL guest magic-link import: the same reload lifecycle imports for admin accounts", async () => {
  await runMagicLinkReloadImport({ id: "user-admin", email: "admin@example.com", admin: true });
});

test("CRITICAL guest magic-link import: failed server confirmation keeps guest storage", async () => {
  let guestStoragePresent = true;
  const saved = await persistGuestImportBeforeCleanup(["layout-imported"], {
    persistImport: async () => false,
    clearGuestStorage: () => { guestStoragePresent = false; }
  });

  assert.equal(saved, false);
  assert.equal(guestStoragePresent, true);
});
