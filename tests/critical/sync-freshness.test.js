import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canUseCachedStartupState,
  hasListFreshnessSignal,
  listFreshnessChanged,
  normalizeListFreshness
} from "../../src/sync/list-freshness.js";
import {
  loadStoredSyncMeta,
  saveStoredSyncMeta
} from "../../src/storage/sync-meta.js";
import {
  applyEntityChangesToState,
  canRequestEntityChanges
} from "../../src/sync/entity-changes.js";
import {
  rememberEntitySyncResultMeta,
  syncEntityBatchWithRevisionRetry,
  syncEntityBatchesSequentially
} from "../../src/sync/entity-sync.js";
import {
  createdLayoutSyncErrorText,
  syncCreatedLayoutEntityTypes
} from "../../src/sync/created-layout-entity-sync.js";
import {
  createLegacyPersonalSyncWriteBlockedError,
  isLegacyPersonalSyncWriteBlockedError,
  shouldBlockLegacyPersonalSyncWriteFallback
} from "../../src/sync/legacy-personal-sync.js";
import { rememberConflictRemoteMeta } from "../../src/sync/save-body.js";
import {
  createQueuedRemoteSave,
  mergeRemoteSaveOptions
} from "../../src/sync/save-queue.js";
import { expectedEntitySyncConfirmationFailures } from "../../src/sync/entity-sync-confirmation.js";
import { preflightRemoteSaveConflictFlow } from "../../src/sync/save-preflight.js";
import { ensurePersonalListId } from "../../src/sync/personal-list-bootstrap.js";
import { shouldRecoverUnsyncedLocalChanges } from "../../src/sync/local-dirty.js";
import { loadRemoteStateFlow } from "../../src/sync/load-remote-state-flow.js";
import { saveRemoteStateFlow } from "../../src/sync/save-remote-state-flow.js";
import { runSyncNowFlow } from "../../src/sync/run-sync-now-flow.js";
import { mergeStateFromBase } from "../../src/sync/state-merge.js";
import { snapshotsEqual } from "../../src/utils/json.js";

test("CRITICAL sync-save: manual sync checks remote freshness when local state is clean", async () => {
  const statuses = [];
  const freshnessCalls = [];
  const preferredLayout = { id: "layout-current" };
  const runtime = {
    currentUser: { id: "user-1" },
    state: { items: {}, containers: {}, layouts: {} },
    syncMeta: { dirty: false },
    syncTimer: null,
    uiLanguage: "en"
  };

  await runSyncNowFlow({
    runtime,
    dependencies: {
      canOpenAdminPublishedEdit: () => false,
      checkRemoteStateFreshness: async (options) => { freshnessCalls.push(options); },
      clearStaleDirtyFlagIfNoLocalChanges: () => false,
      isAdminEditablePublishedLayout: () => false,
      isForcedOffline: () => false,
      isReadOnlyBikePackingContext: () => false,
      isReadOnlyStateScope: () => false,
      preferredCurrentLayoutRef: () => preferredLayout,
      saveRemoteState: async () => { throw new Error("clean manual sync must not save local state"); },
      showToast: () => {},
      updateSyncUi: (message) => { statuses.push(message); },
      uploadPendingPhotos: async () => false
    }
  }, { force: true });

  assert.deepEqual(freshnessCalls, [{ notify: true, preferredLayout }]);
  assert.deepEqual(statuses, ["Checking the server...", undefined]);
});

test("CRITICAL sync-save: empty-layout warning follows the English interface", async () => {
  let status = "";
  const runtime = {
    currentUser: { id: "user-1" },
    state: { items: {}, containers: {}, layouts: {} },
    syncMeta: { dirty: true },
    uiLanguage: "en"
  };

  await saveRemoteStateFlow({
    runtime,
    dependencies: {
      clearStaleDirtyFlagIfNoLocalChanges: () => false,
      currentPublicTemplateStatusMessage: () => "",
      isDemoPublicTemplateMissing: () => false,
      isReadOnlyBikePackingContext: () => false,
      isSuspiciousEmptyPackingState: () => true,
      repairCollapsedActiveLayoutBeforeSave: () => {},
      saveSyncMeta: () => {},
      updateSyncUi: (message) => { status = message; },
      uploadPendingPhotos: async () => {}
    }
  });

  assert.equal(status, "The empty local layout was not sent to the server · load the recovered version");
  assert.equal(runtime.syncMeta.dirty, false);
});

test("CRITICAL template-copy: copy-all advances revision after every entity sync step", async () => {
  const syncMeta = { stateRevision: 4 };
  const calls = [];
  const result = await syncCreatedLayoutEntityTypes({
    assertConfirmed: () => {},
    baseState: { items: {}, containers: {}, layouts: {} },
    expectedContainerIds: ["bag-1"],
    expectedItemIds: ["item-1"],
    layoutId: "layout-copy",
    listId: "list-1",
    rememberResult: (entityResult) => {
      syncMeta.stateRevision = entityResult.integrityMeta.stateRevision;
    },
    syncEntityType: async (type) => {
      calls.push([type, syncMeta.stateRevision]);
      const nextRevision = syncMeta.stateRevision + 1;
      return {
        integrityMeta: { stateRevision: nextRevision },
        serverUpdatedAt: `revision-${nextRevision}`
      };
    }
  });

  assert.deepEqual(calls, [
    ["item", 4],
    ["container", 5],
    ["layout", 6],
    ["dictionary", 7]
  ]);
  assert.equal(result.integrityMeta.stateRevision, 8);
  assert.equal(result.serverUpdatedAt, "revision-8");
  assert.equal(
    createdLayoutSyncErrorText({ data: { code: "stale_state_revision" } }, "ru"),
    "Серверная версия изменилась во время сохранения копии"
  );
});

test("CRITICAL template-copy: large copy-all advances revision after every item batch", async () => {
  const syncMeta = { stateRevision: 10 };
  const sentRevisions = [];
  const results = await syncEntityBatchesSequentially([["item-1"], ["item-2"], ["item-3"]], {
    sendBatch: async () => {
      sentRevisions.push(syncMeta.stateRevision);
      return { stateRevision: syncMeta.stateRevision + 1 };
    },
    onBatchResult: (response) => { syncMeta.stateRevision = response.stateRevision; }
  });

  assert.deepEqual(sentRevisions, [10, 11, 12]);
  assert.equal(results.at(-1).stateRevision, 13);
});

test("CRITICAL sync-save: an old partial batch refreshes its list revision and resumes", async () => {
  let revision = 12;
  const sentRevisions = [];
  const result = await syncEntityBatchWithRevisionRetry(["item-101", "item-102", "item-103"], {
    sendBatch: async () => {
      sentRevisions.push(revision);
      if (sentRevisions.length === 1) {
        const error = new Error("stale revision");
        error.status = 409;
        error.data = { code: "stale_state_revision", stateRevision: 18 };
        throw error;
      }
      return { stateRevision: revision + 1, upserted: ["item-101", "item-102", "item-103"] };
    },
    refreshRevision: (error) => {
      revision = error.data.stateRevision;
      return true;
    }
  });

  assert.deepEqual(sentRevisions, [12, 18]);
  assert.equal(result.stateRevision, 19);
  assert.deepEqual(result.upserted, ["item-101", "item-102", "item-103"]);
});

test("CRITICAL template-copy: stale starting revision is refreshed and retried once", async () => {
  let revision = 20;
  let attempts = 0;
  const result = await syncCreatedLayoutEntityTypes({
    assertConfirmed: () => {},
    layoutId: "layout-copy",
    refreshRevisionFromConflict: async (error) => {
      revision = error.data.stateRevision;
      return true;
    },
    rememberResult: (entityResult) => { revision = entityResult.integrityMeta.stateRevision; },
    syncEntityType: async (type) => {
      attempts += 1;
      if (type === "item" && attempts === 1) {
        const error = new Error("stale");
        error.status = 409;
        error.data = { code: "stale_state_revision", stateRevision: 24 };
        throw error;
      }
      return {
        integrityMeta: { stateRevision: revision + 1 },
        serverUpdatedAt: `revision-${revision + 1}`
      };
    }
  });

  assert.equal(attempts, 5);
  assert.equal(result.integrityMeta.stateRevision, 28);
});

test("CRITICAL sync-save: account without a personal list creates one before entity sync", async () => {
  let currentListId = "";
  let createCalls = 0;
  const listId = await ensurePersonalListId({
    chooseDefaultList: (lists) => lists[0] || null,
    clearCurrentListId: () => { currentListId = ""; },
    createList: async () => {
      createCalls += 1;
      return { list: { id: "list-created" } };
    },
    fetchLists: async () => ({ lists: [] }),
    getCurrentListId: () => currentListId,
    normalizeLists: (data) => data.lists,
    recordId: (record) => record?.list?.id || record?.id || "",
    rememberRecord: (record) => {
      currentListId = record?.list?.id || record?.id || "";
      return record;
    }
  });

  assert.equal(listId, "list-created");
  assert.equal(currentListId, "list-created");
  assert.equal(createCalls, 1);
});

test("CRITICAL sync-save: blank server list revision is remembered before guest import", async () => {
  let offeredRevision = null;
  const runtime = {
    appUnlocked: false,
    currentUser: { id: "user-new" },
    initialRemoteLoadPending: true,
    pendingGuestLocalLayoutCandidate: { sourceState: {} },
    remoteRefreshInFlight: false,
    state: { items: {}, containers: {}, layouts: {} },
    syncMeta: { dirty: false },
    uiLanguage: "en"
  };

  await loadRemoteStateFlow({
    runtime,
    dependencies: {
      blockRemoteIntegrityFailureIfNeeded: () => false,
      canLocalStateOverrideRemote: () => false,
      clearStaleDirtyFlagIfNoLocalChanges: () => false,
      consumeGuestLocalLayoutCandidate: () => ({ sourceState: {} }),
      createBlankBikePackingState: () => ({ items: {}, containers: {}, layouts: {} }),
      currentPackingListId: () => "list-new",
      fetchRemoteStateRecord: async () => ({
        record: {
          id: "list-new",
          payload: null,
          stateRevision: 1,
          updatedAt: "2026-07-16T18:00:00.000Z"
        },
        source: "catalog"
      }),
      hasLocalSavedState: () => false,
      isMeaningfulPackingState: () => false,
      isPublicLayoutContext: () => false,
      isSharedListLinkRoute: () => false,
      normalizeRemoteState: () => ({ items: {}, containers: {}, layouts: {} }),
      offerSaveGuestLocalLayouts: async () => { offeredRevision = runtime.syncMeta.stateRevision; },
      remoteUpdatedAt: (record) => record?.updatedAt || "",
      rememberCurrentSyncAccount: () => {},
      rememberRemoteIntegrityMeta: (_record, meta) => { runtime.syncMeta.stateRevision = meta.stateRevision; },
      renderPreservingPackingScroll: () => {},
      replaceState: (nextState) => { runtime.state = nextState; },
      saveSyncMeta: () => {},
      setLayoutLoadProgress: () => {},
      setLayoutLoadStatus: () => {},
      stateIntegrityMetaFromResponse: () => ({ stateRevision: 1 }),
      statePrivateLayoutCount: () => 0,
      shouldImportGuestLayoutBeforeRemote: () => true,
      timeValue: (value) => Date.parse(value) || 0,
      updateSyncUi: () => {}
    }
  });

  assert.equal(offeredRevision, 1);
});

test("CRITICAL sync-save: freshness metadata can be normalized without payload", () => {
  const freshness = normalizeListFreshness({
    ok: true,
    listId: "list-1",
    serverUpdatedAt: "2026-05-27T20:00:00.000Z",
    stateRevision: 7
  });

  assert.deepEqual(freshness, {
    id: "list-1",
    listId: "list-1",
    updatedAt: "2026-05-27T20:00:00.000Z",
    serverUpdatedAt: "2026-05-27T20:00:00.000Z",
    stateRevision: 7,
    payloadHash: "",
    entityHash: "",
    itemCount: null,
    containerCount: null,
    layoutCount: null
  });
});

test("CRITICAL sync-save: unchanged freshness does not require full state polling", () => {
  assert.equal(
    listFreshnessChanged(
      { serverUpdatedAt: "2026-05-27T20:00:00.000Z", stateRevision: 7 },
      { serverUpdatedAt: "2026-05-27T20:00:00.000Z", stateRevision: 7 }
    ),
    false
  );
});

test("CRITICAL sync-save: changed freshness requests a full state refresh", () => {
  assert.equal(
    listFreshnessChanged(
      { serverUpdatedAt: "2026-05-27T20:00:00.000Z", stateRevision: 7 },
      { serverUpdatedAt: "2026-05-27T20:01:00.000Z", stateRevision: 8 }
    ),
    true
  );
});

test("CRITICAL sync-save: changed freshness can request entity changes without full state", () => {
  assert.deepEqual(
    canRequestEntityChanges({
      listId: "list-1",
      syncMeta: { listId: "list-1", stateRevision: 7 },
      freshness: { listId: "list-1", stateRevision: 8 }
    }),
    {
      ok: true,
      sinceRevision: 7,
      targetRevision: 8
    }
  );

  assert.equal(
    canRequestEntityChanges({
      listId: "list-1",
      syncMeta: { listId: "list-1", stateRevision: null },
      freshness: { listId: "list-1", stateRevision: 8 }
    }).ok,
    false
  );
});

test("CRITICAL sync-save: sequential entity sync results advance base revision for next entity type", () => {
  const syncMeta = {
    dirty: true,
    serverUpdatedAt: "2026-05-30T10:00:00.000Z",
    stateRevision: 7
  };
  const remembered = [];

  assert.equal(
    rememberEntitySyncResultMeta({
      attempted: true,
      serverUpdatedAt: "2026-05-30T10:01:00.000Z",
      integrityMeta: { stateRevision: 8, entityHash: "entity-8" }
    }, {
      rememberRemoteIntegrityMeta: (meta) => {
        remembered.push(meta);
        syncMeta.stateRevision = meta.stateRevision ?? syncMeta.stateRevision;
        syncMeta.entityHash = meta.entityHash || syncMeta.entityHash || null;
      },
      syncMeta
    }),
    true
  );

  assert.equal(syncMeta.serverUpdatedAt, "2026-05-30T10:01:00.000Z");
  assert.equal(syncMeta.stateRevision, 8);
  assert.deepEqual(remembered, [{ stateRevision: 8, entityHash: "entity-8" }]);
});

test("CRITICAL sync-save: forced conflict retry remembers standalone server revision", () => {
  const syncMeta = {
    dirty: true,
    serverUpdatedAt: "2026-06-05T10:00:00.000Z",
    stateRevision: 7
  };
  const remembered = [];
  let saved = false;

  rememberConflictRemoteMeta(
    { id: "list-1", updatedAt: "2026-06-05T10:01:00.000Z" },
    { stateRevision: 9, entityHash: "entity-9" },
    "2026-06-05T10:01:00.000Z",
    {
      rememberRemoteIntegrityMeta: (...sources) => {
        remembered.push(sources);
        const meta = sources.find((source) => source?.stateRevision != null) || {};
        syncMeta.stateRevision = meta.stateRevision ?? syncMeta.stateRevision;
        syncMeta.entityHash = meta.entityHash || syncMeta.entityHash || null;
      },
      saveSyncMeta: () => {
        saved = true;
      },
      syncMeta
    }
  );

  assert.equal(syncMeta.serverUpdatedAt, "2026-06-05T10:01:00.000Z");
  assert.equal(syncMeta.stateRevision, 9);
  assert.equal(syncMeta.entityHash, "entity-9");
  assert.equal(saved, true);
  assert.equal(remembered[0].length, 2);
});

test("CRITICAL sync-save: force overwrite skips entity sync and uses full payload save", async () => {
  let entitySyncCalled = false;
  let preflightCalled = false;
  let fullSaveForce = null;
  const runtime = {
    currentUser: { id: "user-1" },
    state: { items: {}, containers: {}, layouts: {} },
    syncMeta: { dirty: true, stateRevision: 9 },
    uiLanguage: "ru"
  };

  await saveRemoteStateFlow({
    runtime,
    dependencies: {
      blockDestructiveLocalSave: () => false,
      canLocalStateOverrideRemote: () => true,
      clearStaleDirtyFlagIfNoLocalChanges: () => false,
      currentPublicTemplateStatusMessage: () => "",
      handleRemoteSaveConflict: async () => {},
      hasLegacyPayloadChanges: () => false,
      legacyComparableTopLevelDiffKeys: () => [],
      preflightRemoteSaveConflict: async () => {
        preflightCalled = true;
        throw new Error("preflight must not run for force overwrite");
      },
      isDemoPublicTemplateMissing: () => false,
      isNetworkError: () => false,
      isReadOnlyBikePackingContext: () => false,
      isReadOnlyBikePackingError: () => false,
      isSuspiciousEmptyPackingState: () => false,
      isTemporaryServerStorageError: () => false,
      isTimeoutError: () => false,
      loadBaseState: () => ({ items: {}, containers: {}, layouts: {} }),
      nowIso: () => "2026-06-05T10:02:00.000Z",
      remoteUpdatedAt: () => "2026-06-05T10:03:00.000Z",
      rememberConflictRemoteMeta: () => {},
      rememberCurrentSyncAccount: () => {},
      rememberRemoteIntegrityMeta: () => {},
      repairCollapsedActiveLayoutBeforeSave: () => {},
      saveBaseState: () => {},
      saveRemoteState: async () => {},
      saveRemoteStateRecord: async ({ forceOverwrite }) => {
        fullSaveForce = forceOverwrite;
        return { list: { updatedAt: "2026-06-05T10:03:00.000Z", stateRevision: 10 } };
      },
      saveSyncMeta: () => {},
      serializeState: () => ({ items: {}, containers: {}, layouts: {} }),
      showToast: () => {},
      stateIntegrityMetaFromResponse: () => ({ stateRevision: 10 }),
      syncChangedBikePackingEntities: async () => {
        entitySyncCalled = true;
        throw new Error("entity sync must not run for force overwrite");
      },
      updateSyncUi: () => {},
      uploadPendingPhotos: async () => {}
    }
  }, { forceOverwrite: true });

  assert.equal(entitySyncCalled, false);
  assert.equal(preflightCalled, false);
  assert.equal(fullSaveForce, true);
  assert.equal(runtime.syncMeta.dirty, false);
});

test("CRITICAL sync-save: unconfirmed entity sync falls back to full payload save", async () => {
  let fullSaveCalled = false;
  const runtime = {
    currentUser: { id: "user-1" },
    state: {
      items: { "item-1": { id: "item-1", name: "Fresh phone item" } },
      containers: {},
      layouts: {}
    },
    syncMeta: { dirty: true, stateRevision: 9 },
    uiLanguage: "ru"
  };

  await saveRemoteStateFlow({
    runtime,
    dependencies: {
      blockDestructiveLocalSave: () => false,
      canLocalStateOverrideRemote: () => true,
      clearStaleDirtyFlagIfNoLocalChanges: () => false,
      currentPublicTemplateStatusMessage: () => "",
      handleRemoteSaveConflict: async () => {},
      hasLegacyPayloadChanges: () => false,
      legacyComparableTopLevelDiffKeys: () => [],
      preflightRemoteSaveConflict: async () => false,
      isDemoPublicTemplateMissing: () => false,
      isNetworkError: () => false,
      isReadOnlyBikePackingContext: () => false,
      isReadOnlyBikePackingError: () => false,
      isSuspiciousEmptyPackingState: () => false,
      isTemporaryServerStorageError: () => false,
      isTimeoutError: () => false,
      loadBaseState: () => ({ items: {}, containers: {}, layouts: {} }),
      nowIso: () => "2026-06-05T10:02:00.000Z",
      remoteUpdatedAt: () => "2026-06-05T10:04:00.000Z",
      rememberConflictRemoteMeta: () => {},
      rememberCurrentSyncAccount: () => {},
      rememberRemoteIntegrityMeta: () => {},
      repairCollapsedActiveLayoutBeforeSave: () => {},
      saveBaseState: () => {},
      saveRemoteState: async () => {},
      saveRemoteStateRecord: async () => {
        fullSaveCalled = true;
        return { list: { updatedAt: "2026-06-05T10:04:00.000Z", stateRevision: 11 } };
      },
      saveSyncMeta: () => {},
      serializeState: () => runtime.state,
      showToast: () => {},
      stateIntegrityMetaFromResponse: () => ({ stateRevision: 11 }),
      syncChangedBikePackingEntities: async () => ({
        attempted: true,
        skipped: false,
        unavailable: false,
        serverUpdatedAt: "2026-06-05T10:03:00.000Z",
        integrityMeta: { stateRevision: 10 },
        item: {
          type: "item",
          attempted: true,
          changedIds: ["item-1"],
          deletedIds: [],
          upserted: [],
          deleted: []
        },
        container: { type: "container", attempted: false, changedIds: [], deletedIds: [], upserted: [], deleted: [] },
        layout: { type: "layout", attempted: false, changedIds: [], deletedIds: [], upserted: [], deleted: [] },
        dictionary: { type: "dictionary", attempted: false, changedIds: [], deletedIds: [], upserted: [], deleted: [] },
        upserted: [],
        deleted: []
      }),
      updateSyncUi: () => {},
      uploadPendingPhotos: async () => {}
    }
  });

  assert.equal(fullSaveCalled, true);
  assert.equal(runtime.syncMeta.dirty, false);
  assert.equal(runtime.syncMeta.serverUpdatedAt, "2026-06-05T10:04:00.000Z");
});

test("CRITICAL sync-save: copied bag confirmation cannot succeed when container or layout was not upserted", () => {
  const failures = expectedEntitySyncConfirmationFailures({
    item: { attempted: false, skipped: false, upserted: [] },
    container: { attempted: true, skipped: false, upserted: [] },
    layout: { attempted: true, skipped: false, upserted: ["layout-private"] }
  }, {
    items: [],
    containers: ["container-copy"],
    layouts: ["layout-private"]
  });

  assert.deepEqual(failures, ["containers sync did not confirm: container-copy"]);
});

test("CRITICAL sync-save: queued copy confirmations retain every expected entity id", () => {
  const merged = mergeRemoteSaveOptions({
    expectedEntityIds: {
      items: ["item-a"],
      containers: ["container-a"],
      layouts: ["layout-a"]
    }
  }, {
    expectedEntityIds: {
      items: ["item-b"],
      containers: ["container-a", "container-b"],
      layouts: ["layout-a"]
    }
  });

  assert.deepEqual(merged.expectedEntityIds, {
    items: ["item-a", "item-b"],
    containers: ["container-a", "container-b"],
    layouts: ["layout-a"]
  });
});

test("CRITICAL sync-save: changed server freshness stops before entity sync", async () => {
  let preflightCalled = false;
  let entitySyncCalled = false;
  let fullSaveCalled = false;
  const runtime = {
    currentUser: { id: "user-1" },
    state: { items: {}, containers: {}, layouts: {} },
    syncMeta: { dirty: true, stateRevision: 9 },
    uiLanguage: "ru"
  };

  await saveRemoteStateFlow({
    runtime,
    dependencies: {
      blockDestructiveLocalSave: () => false,
      canLocalStateOverrideRemote: () => true,
      clearStaleDirtyFlagIfNoLocalChanges: () => false,
      currentPublicTemplateStatusMessage: () => "",
      handleRemoteSaveConflict: async () => {},
      hasLegacyPayloadChanges: () => false,
      legacyComparableTopLevelDiffKeys: () => [],
      preflightRemoteSaveConflict: async () => {
        preflightCalled = true;
        return true;
      },
      isDemoPublicTemplateMissing: () => false,
      isNetworkError: () => false,
      isReadOnlyBikePackingContext: () => false,
      isReadOnlyBikePackingError: () => false,
      isSuspiciousEmptyPackingState: () => false,
      isTemporaryServerStorageError: () => false,
      isTimeoutError: () => false,
      loadBaseState: () => {
        throw new Error("base state must not be loaded after handled preflight");
      },
      nowIso: () => "2026-06-05T10:02:00.000Z",
      remoteUpdatedAt: () => "2026-06-05T10:03:00.000Z",
      rememberConflictRemoteMeta: () => {},
      rememberCurrentSyncAccount: () => {},
      rememberRemoteIntegrityMeta: () => {},
      repairCollapsedActiveLayoutBeforeSave: () => {},
      saveBaseState: () => {},
      saveRemoteState: async () => {},
      saveRemoteStateRecord: async () => {
        fullSaveCalled = true;
        throw new Error("full save must not run after handled preflight");
      },
      saveSyncMeta: () => {},
      serializeState: () => ({ items: {}, containers: {}, layouts: {} }),
      showToast: () => {},
      stateIntegrityMetaFromResponse: () => ({ stateRevision: 10 }),
      syncChangedBikePackingEntities: async () => {
        entitySyncCalled = true;
        throw new Error("entity sync must not run after handled preflight");
      },
      updateSyncUi: () => {},
      uploadPendingPhotos: async () => {}
    }
  });

  assert.equal(preflightCalled, true);
  assert.equal(entitySyncCalled, false);
  assert.equal(fullSaveCalled, false);
});

test("CRITICAL sync-save: preflight routes stale revision through conflict flow", async () => {
  let freshnessCalled = false;
  let stateCalled = false;
  let conflictError = null;

  const handled = await preflightRemoteSaveConflictFlow({
    currentUser: { id: "user-1" },
    fetchRemoteListFreshnessRecord: async (listId) => {
      freshnessCalled = listId === "list-1";
      return {
        listId: "list-1",
        serverUpdatedAt: "2026-06-05T10:01:00.000Z",
        stateRevision: 10
      };
    },
    fetchRemoteListStateSnapshot: async (listId) => {
      stateCalled = listId === "list-1";
      return {
        id: "list-1",
        updatedAt: "2026-06-05T10:01:00.000Z",
        stateRevision: 10,
        payload: { items: { "item-1": { id: "item-1" } }, containers: {}, layouts: {} }
      };
    },
    handleRemoteSaveConflict: async (error) => {
      conflictError = error;
    },
    listId: "list-1",
    remoteUpdatedAt: (record) => record?.updatedAt || "",
    syncMeta: {
      serverUpdatedAt: "2026-06-05T10:00:00.000Z",
      stateRevision: 9
    }
  });

  assert.equal(handled, true);
  assert.equal(freshnessCalled, true);
  assert.equal(stateCalled, true);
  assert.equal(conflictError?.status, 409);
  assert.equal(conflictError?.data?.code, "preflight_conflict");
  assert.equal(conflictError?.data?.stateRevision, 10);
  assert.deepEqual(conflictError?.data?.serverPayload?.items, { "item-1": { id: "item-1" } });
});

test("CRITICAL sync-save: direct remote saves run sequentially", async () => {
  const events = [];
  let releaseFirst = null;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const save = createQueuedRemoteSave(async ({ name }) => {
    events.push(`start:${name}`);
    if (name === "first") await firstGate;
    events.push(`end:${name}`);
  });

  const first = save({ name: "first" });
  const second = save({ name: "second" });
  await Promise.resolve();

  assert.deepEqual(events, ["start:first"]);
  releaseFirst();
  await Promise.all([first, second]);

  assert.deepEqual(events, ["start:first", "end:first", "start:second", "end:second"]);
});

test("CRITICAL sync-save: reentrant conflict saves bypass the outer queue", async () => {
  const events = [];
  let save = null;
  save = createQueuedRemoteSave(async ({ name }) => {
    events.push(`start:${name}`);
    if (name === "outer") await save({ name: "inner", _reentrant: true });
    events.push(`end:${name}`);
  });

  await save({ name: "outer" });

  assert.deepEqual(events, ["start:outer", "start:inner", "end:inner", "end:outer"]);
});

const root = resolve(import.meta.dirname, "../..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("CRITICAL sync-save: legacy personal sync writer is blocked", () => {
  const listApiError = new Error("list API unavailable");
  listApiError.status = 503;
  listApiError.path = "/bike-packing/lists/list-1";

  const blocked = createLegacyPersonalSyncWriteBlockedError(listApiError);

  assert.equal(shouldBlockLegacyPersonalSyncWriteFallback(listApiError), true);
  assert.equal(isLegacyPersonalSyncWriteBlockedError(blocked), true);
  assert.equal(blocked.path, "/bike-packing-data.json");
  assert.equal(blocked.cause, listApiError);
});

test("CRITICAL sync-save: runtime does not call legacy bike-packing-data endpoint automatically", () => {
  const app = read("app.js");

  assert.doesNotMatch(app, /apiFetch\(\s*[`'"]\/bike-packing-data\.json/);
});

test("CRITICAL sync-save: entity changes apply changed and deleted records locally", () => {
  const sourceState = {
    activeLayoutId: "layout-1",
    items: {
      "item-1": { id: "item-1", name: "Pump" },
      "item-2": { id: "item-2", name: "Old" }
    },
    containers: {
      "bag-1": { id: "bag-1", name: "Bag" }
    },
    layouts: {
      "layout-1": { id: "layout-1", name: "Main", rootContainerIds: ["bag-1"] }
    },
    categories: ["Tools"],
    locations: ["Home"],
    customCategories: ["Tools"],
    customLocations: ["Home"],
    hiddenCategories: [],
    hiddenLocations: [],
    packedItems: {},
    collapsedContainers: {}
  };

  const result = applyEntityChangesToState(sourceState, {
    listId: "list-1",
    stateRevision: 8,
    serverUpdatedAt: "2026-05-30T10:00:00.000Z",
    changes: {
      items: {
        changed: [{ id: "item-1", payload: { id: "item-1", name: "Pump v2" } }],
        deleted: [{ id: "item-2" }]
      },
      dictionaries: {
        changed: [{
          id: "dictionary-state",
          payload: {
            id: "dictionary-state",
            categories: ["Tools", "Repair"],
            locations: ["Home"],
            customCategories: ["Tools", "Repair"],
            customLocations: ["Home"]
          }
        }],
        deleted: []
      }
    }
  });

  assert.equal(result.applied, true);
  assert.equal(result.state.items["item-1"].name, "Pump v2");
  assert.equal(result.state.items["item-2"], undefined);
  assert.deepEqual(result.state.customCategories, ["Tools", "Repair"]);
  assert.equal(result.meta.stateRevision, 8);
});

test("CRITICAL sync-save: entity changes fall back when revision changed without rows", () => {
  const result = applyEntityChangesToState({
    activeLayoutId: "layout-1",
    items: { "item-1": { id: "item-1", name: "Pump" } },
    containers: { "bag-1": { id: "bag-1", name: "Bag" } },
    layouts: { "layout-1": { id: "layout-1", rootContainerIds: ["bag-1"] } },
    categories: [],
    locations: [],
    customCategories: [],
    customLocations: [],
    hiddenCategories: [],
    hiddenLocations: []
  }, {
    listId: "list-1",
    sinceRevision: 7,
    stateRevision: 8,
    changes: {}
  });

  assert.equal(result.applied, false);
  assert.equal(result.fallbackRequired, true);
});

test("CRITICAL sync-save: background polling requires lightweight freshness signal", () => {
  assert.equal(hasListFreshnessSignal({}), false);
  assert.equal(hasListFreshnessSignal({ ok: true }), false);
  assert.equal(hasListFreshnessSignal({ stateRevision: 0 }), true);
  assert.equal(hasListFreshnessSignal({ payloadHash: "abc" }), true);
  assert.equal(hasListFreshnessSignal({ freshness: { serverUpdatedAt: "2026-05-27T20:00:00.000Z" } }), true);
});

test("CRITICAL sync-save: private local/base diff can recover a stale clean dirty flag", () => {
  assert.equal(
    shouldRecoverUnsyncedLocalChanges({
      currentUser: { id: "user-1" },
      canUsePrivateState: true,
      syncMeta: { dirty: false },
      hasLocalSyncChanges: () => true
    }),
    true
  );
});

test("CRITICAL sync-save: local dirty recovery skips public, remote, and unchanged states", () => {
  const base = {
    currentUser: { id: "user-1" },
    canUsePrivateState: true,
    syncMeta: { dirty: false },
    hasLocalSyncChanges: () => true
  };

  assert.equal(shouldRecoverUnsyncedLocalChanges({ ...base, currentUser: null }), false);
  assert.equal(shouldRecoverUnsyncedLocalChanges({ ...base, applyingRemoteState: true }), false);
  assert.equal(shouldRecoverUnsyncedLocalChanges({ ...base, readOnlyStateScope: true }), false);
  assert.equal(shouldRecoverUnsyncedLocalChanges({ ...base, adminPublicEditScope: true }), false);
  assert.equal(shouldRecoverUnsyncedLocalChanges({ ...base, syncMeta: { dirty: true } }), false);
  assert.equal(shouldRecoverUnsyncedLocalChanges({ ...base, hasLocalSyncChanges: () => false }), false);
});

test("CRITICAL offline-start: startup can reuse cached state when freshness is unchanged", () => {
  assert.equal(
    canUseCachedStartupState({
      currentListId: "list-1",
      hasLocalState: true,
      syncMeta: {
        dirty: false,
        cacheIntegrityVersion: 1,
        listId: "list-1",
        serverUpdatedAt: "2026-05-27T20:00:00.000Z",
        stateRevision: 7,
        payloadHash: "payload-a"
      },
      remoteFreshness: {
        listId: "list-1",
        serverUpdatedAt: "2026-05-27T20:00:00.000Z",
        stateRevision: 7,
        payloadHash: "payload-a"
      }
    }),
    true
  );
});

test("CRITICAL offline-start: legacy cache requires one full server verification", () => {
  assert.equal(canUseCachedStartupState({
    currentListId: "list-1",
    hasLocalState: true,
    syncMeta: {
      dirty: false,
      listId: "list-1",
      serverUpdatedAt: "2026-05-27T20:00:00.000Z",
      stateRevision: 7
    },
    remoteFreshness: {
      listId: "list-1",
      serverUpdatedAt: "2026-05-27T20:00:00.000Z",
      stateRevision: 7
    }
  }), false);
});

test("CRITICAL offline-start: incomplete local cache cannot mask server items behind unchanged freshness", () => {
  assert.equal(canUseCachedStartupState({
    currentListId: "list-1",
    hasLocalState: true,
    localState: {
      items: {},
      containers: { "bag-1": { id: "bag-1" } },
      layouts: { "layout-1": { id: "layout-1" } }
    },
    syncMeta: {
      dirty: false,
      cacheIntegrityVersion: 1,
      listId: "list-1",
      serverUpdatedAt: "2026-05-27T20:00:00.000Z",
      stateRevision: 7
    },
    remoteFreshness: {
      listId: "list-1",
      serverUpdatedAt: "2026-05-27T20:00:00.000Z",
      stateRevision: 7,
      itemCount: 120,
      containerCount: 18,
      layoutCount: 9
    }
  }), false);
});

test("CRITICAL offline-start: startup tries entity changes before full state when freshness changed", async () => {
  let changesCalled = false;
  let fullStateCalled = false;
  const runtime = {
    appUnlocked: false,
    currentUser: { id: "user-1" },
    initialRemoteLoadPending: true,
    pendingGuestLocalLayoutCandidate: null,
    remoteRefreshInFlight: false,
    state: {
      activeLayoutId: "layout-1",
      items: { "item-1": { id: "item-1" } },
      containers: { "bag-1": { id: "bag-1" } },
      layouts: { "layout-1": { id: "layout-1" } }
    },
    syncMeta: {
      dirty: false,
      listId: "list-1",
      serverUpdatedAt: "2026-05-27T20:00:00.000Z",
      stateRevision: 7
    }
  };

  await loadRemoteStateFlow({
    runtime,
    dependencies: {
      canUseCachedStartupState,
      clearStaleDirtyFlagIfNoLocalChanges: () => false,
      currentPackingListId: () => "list-1",
      fetchRemoteListFreshnessRecord: async () => ({
        listId: "list-1",
        serverUpdatedAt: "2026-05-27T20:01:00.000Z",
        stateRevision: 8
      }),
      fetchRemoteStateRecord: async () => {
        fullStateCalled = true;
        return {};
      },
      hasLocalSavedState: () => true,
      isForeignLocalSyncState: () => false,
      isPublicLayoutContext: () => false,
      isSharedListLinkRoute: () => false,
      setLayoutLoadStatus: () => {},
      tryApplyRemoteEntityChanges: async () => {
        changesCalled = true;
        return { applied: true };
      },
      updateSyncUi: () => {}
    }
  });

  assert.equal(changesCalled, true);
  assert.equal(fullStateCalled, false);
});

test("CRITICAL offline-start: sync meta keeps the active list id for startup freshness", () => {
  const previousLocalStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value))
  };
  try {
    saveStoredSyncMeta("sync-meta", {
      dirty: false,
      listId: "list-1",
      currentListId: "list-1",
      serverUpdatedAt: "2026-05-27T20:00:00.000Z",
      stateRevision: 7
    });
    assert.deepEqual(
      {
        listId: loadStoredSyncMeta("sync-meta").listId,
        currentListId: loadStoredSyncMeta("sync-meta").currentListId
      },
      {
        listId: "list-1",
        currentListId: "list-1"
      }
    );
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
});

test("CRITICAL offline-start: startup must fetch full state without local state or with dirty changes", () => {
  const remoteFreshness = {
    listId: "list-1",
    serverUpdatedAt: "2026-05-27T20:00:00.000Z",
    stateRevision: 7
  };

  assert.equal(
    canUseCachedStartupState({
      currentListId: "list-1",
      hasLocalState: false,
      syncMeta: { serverUpdatedAt: remoteFreshness.serverUpdatedAt, stateRevision: 7 },
      remoteFreshness
    }),
    false
  );

  assert.equal(
    canUseCachedStartupState({
      currentListId: "list-1",
      hasLocalState: true,
      syncMeta: { dirty: true, serverUpdatedAt: remoteFreshness.serverUpdatedAt, stateRevision: 7 },
      remoteFreshness
    }),
    false
  );
});

test("CRITICAL offline-start: startup must fetch full state when list/account changed", () => {
  const syncMeta = {
    dirty: false,
    listId: "list-1",
    serverUpdatedAt: "2026-05-27T20:00:00.000Z",
    stateRevision: 7
  };
  const remoteFreshness = {
    listId: "list-2",
    serverUpdatedAt: "2026-05-27T20:00:00.000Z",
    stateRevision: 7
  };

  assert.equal(
    canUseCachedStartupState({
      currentListId: "list-2",
      hasLocalState: true,
      syncMeta,
      remoteFreshness
    }),
    false
  );

  assert.equal(
    canUseCachedStartupState({
      accountMatches: false,
      currentListId: "list-1",
      hasLocalState: true,
      syncMeta,
      remoteFreshness: { ...remoteFreshness, listId: "list-1" }
    }),
    false
  );
});

test("CRITICAL sync-save: assembled payload key order and service meta do not create merge conflicts", () => {
  const baseState = {
    items: {
      "item-1": { id: "item-1", name: "Pump", weight: 100, categories: ["Tools"] }
    },
    containers: {
      "bag-1": { id: "bag-1", name: "Repair kit", weight: 50, location: "Home" }
    },
    layouts: {},
    packedItems: {},
    locations: [],
    categories: []
  };
  const localState = {
    ...baseState,
    items: {
      "item-1": {
        categories: ["Tools"],
        weight: 100,
        name: "Pump",
        id: "item-1",
        updatedAt: "2026-05-29T15:26:54.746Z",
        updatedByDeviceName: "Windows"
      }
    },
    containers: {
      "bag-1": {
        location: "Home",
        weight: 50,
        name: "Repair kit",
        id: "bag-1",
        updatedAt: "2026-05-29T15:26:54.746Z",
        updatedByDeviceName: "Windows"
      }
    }
  };
  const remoteState = {
    ...baseState,
    items: {
      "item-1": {
        weight: 100,
        id: "item-1",
        categories: ["Tools"],
        name: "Pump",
        updatedAt: "2026-05-29T15:26:56.782Z",
        sourceDeviceName: "Windows"
      }
    },
    containers: {
      "bag-1": {
        id: "bag-1",
        weight: 50,
        location: "Home",
        name: "Repair kit",
        updatedAt: "2026-05-29T15:26:56.782Z",
        sourceDeviceName: "Windows"
      }
    }
  };

  const result = mergeStateFromBase(baseState, localState, remoteState, {
    cloneValue: (value) => JSON.parse(JSON.stringify(value)),
    valuesEqual: snapshotsEqual
  });

  assert.deepEqual(result.conflicts, []);
});
