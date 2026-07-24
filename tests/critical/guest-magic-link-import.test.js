import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  guestLocalLayoutCandidateFromState,
  persistGuestImportBeforeCleanup
} from "../../src/public/guest-login-import.js";
import {
  consumeStoredGuestLoginHandoff,
  createGuestLoginHandoff,
  createGuestWorkspaceSessionTracker,
  markGuestWorkspaceLayouts,
  recordGuestWorkspaceSessionChanges,
  resolveStoredGuestLoginHandoffCandidate,
  storeGuestLoginHandoff,
  validateGuestLoginHandoff
} from "../../src/public/guest-login-handoff.js";
import {
  createGuestLoginHandoffCoordinator,
  runGuestLoginHandoffImport
} from "../../src/public/guest-login-import-flow.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const NOW_MS = Date.parse("2026-07-24T01:15:00.000Z");
const GUEST_LAYOUT_ID = "layout-guest-edited";
const GUEST_SESSION_ID = "guest-session-current";

function emptyState() {
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
  return {
    ...emptyState(),
    containers: {
      "bag-guest": {
        id: "bag-guest",
        name: "Handlebar bag",
        childIds: [],
        itemIds: ["item-guest"],
        order: [{ type: "item", id: "item-guest" }]
      }
    },
    items: {
      "item-guest": {
        id: "item-guest",
        name: "Rain shell",
        containerId: "bag-guest"
      }
    },
    layouts: {
      [GUEST_LAYOUT_ID]: {
        id: GUEST_LAYOUT_ID,
        name: "Weekend",
        guestDemoCopy: true,
        guestDemoCopyCreatedAt: "2026-07-23T20:00:00.000Z",
        updatedAt: "2026-07-23T20:05:00.000Z",
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
          packedItems: {}
        }
      }
    },
    activeLayoutId: GUEST_LAYOUT_ID
  };
}

function candidateFromState(sourceState = editedGuestState()) {
  return guestLocalLayoutCandidateFromState(sourceState, {
    cloneStateForSync: clone,
    cloneValue: clone,
    createEmptyUserState: emptyState,
    fallbackName: "Guest layout",
    snapshotsEqual: (left, right) => JSON.stringify(left) === JSON.stringify(right)
  });
}

function preparedHandoff(email = "person@example.com") {
  const candidate = candidateFromState();
  const manifest = markGuestWorkspaceLayouts(null, [GUEST_LAYOUT_ID], {
    sessionId: GUEST_SESSION_ID,
    now: () => "2026-07-24T01:14:00.000Z"
  });
  const handoff = createGuestLoginHandoff({
    candidate,
    eligibleLayoutIds: manifest.layoutIds,
    email,
    guestSessionId: GUEST_SESSION_ID,
    nowMs: NOW_MS
  });
  return { candidate, handoff, manifest };
}

function storageAdapter(entries = []) {
  const values = new Map(entries);
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
    values
  };
}

test("CRITICAL guest magic-link import: legacy guest storage alone cannot mutate an account", async () => {
  let guestSnapshotReads = 0;
  const storage = storageAdapter([["guest-state", JSON.stringify(editedGuestState())]]);
  const originalGetItem = storage.getItem;
  storage.getItem = (key) => {
    if (key === "guest-state") guestSnapshotReads += 1;
    return originalGetItem(key);
  };
  const storedCandidate = resolveStoredGuestLoginHandoffCandidate({
    candidateFromState,
    guestStateKey: "guest-state",
    handoffKey: "guest-handoff",
    storage,
    user: { email: "person@example.com" },
    nowMs: NOW_MS
  });
  let generatedIds = 0;
  let dirtyWrites = 0;
  let serverSaves = 0;
  let guestClears = 0;
  const coordinator = createGuestLoginHandoffCoordinator({
    getCandidate: () => storedCandidate,
    runImport: async () => {
      generatedIds += 1;
      dirtyWrites += 1;
      serverSaves += 1;
      guestClears += 1;
      return { handled: true, status: "imported", importedLayoutIds: ["new-id"] };
    }
  });

  const result = await coordinator.offer();

  assert.deepEqual(result, {
    handled: false,
    status: "missing-candidate",
    importedLayoutIds: []
  });
  assert.equal(generatedIds, 0);
  assert.equal(dirtyWrites, 0);
  assert.equal(serverSaves, 0);
  assert.equal(guestClears, 0);
  assert.equal(guestSnapshotReads, 0, "raw guest state is not even read when no receipt exists");
  assert.equal(storage.values.has("guest-state"), true);
});

for (const user of [
  { id: "regular-user", email: "person@example.com" },
  { id: "admin-user", email: "person@example.com", admin: true }
]) {
  test(`CRITICAL guest magic-link import: prepared handoff is valid for ${user.admin ? "admin" : "regular"} accounts`, () => {
    const { candidate, handoff } = preparedHandoff();
    const validation = validateGuestLoginHandoff(handoff, {
      candidate,
      user,
      nowMs: NOW_MS + 1000
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.candidate.layouts.map((layout) => layout.layoutId), [GUEST_LAYOUT_ID]);
  });
}

test("CRITICAL guest magic-link import: account mismatch, expiry, or changed source rejects the handoff", () => {
  const { candidate, handoff } = preparedHandoff();

  assert.equal(validateGuestLoginHandoff(handoff, {
    candidate,
    user: { email: "other@example.com" },
    nowMs: NOW_MS
  }).reason, "account-mismatch");

  assert.equal(validateGuestLoginHandoff(handoff, {
    candidate,
    user: { email: "person@example.com" },
    nowMs: Date.parse(handoff.expiresAt) + 1
  }).reason, "expired");

  const changedCandidate = clone(candidate);
  changedCandidate.sourceState.items["item-guest"].name = "Changed after link request";
  assert.equal(validateGuestLoginHandoff(handoff, {
    candidate: changedCandidate,
    user: { email: "person@example.com" },
    nowMs: NOW_MS
  }).reason, "source-changed");
});

test("CRITICAL guest magic-link import: invalid receipt is removed without touching guest data", () => {
  const { handoff } = preparedHandoff();
  const storage = storageAdapter([
    ["guest-state", JSON.stringify(editedGuestState())],
    ["guest-manifest", JSON.stringify({ version: 1, layoutIds: [GUEST_LAYOUT_ID] })],
    ["guest-handoff", JSON.stringify({ ...handoff, requestedEmail: "other@example.com" })]
  ]);

  assert.equal(resolveStoredGuestLoginHandoffCandidate({
    candidateFromState,
    guestStateKey: "guest-state",
    handoffKey: "guest-handoff",
    nowMs: NOW_MS,
    storage,
    user: { email: "person@example.com" }
  }), null);
  assert.equal(storage.values.has("guest-handoff"), false);
  assert.equal(storage.values.has("guest-state"), true);
  assert.equal(storage.values.has("guest-manifest"), true);
});

test("CRITICAL guest magic-link import: only layouts recorded as fresh guest work enter the receipt", () => {
  const sourceState = editedGuestState();
  sourceState.layouts["layout-old"] = {
    ...clone(sourceState.layouts[GUEST_LAYOUT_ID]),
    id: "layout-old",
    name: "Old deleted work"
  };
  const candidate = candidateFromState(sourceState);
  const handoff = createGuestLoginHandoff({
    candidate,
    eligibleLayoutIds: [GUEST_LAYOUT_ID],
    email: "person@example.com",
    guestSessionId: GUEST_SESSION_ID,
    nowMs: NOW_MS
  });

  assert.deepEqual(candidate.layouts.map((layout) => layout.layoutId).sort(), [GUEST_LAYOUT_ID, "layout-old"]);
  assert.deepEqual(handoff.layoutIds, [GUEST_LAYOUT_ID]);
  assert.equal(validateGuestLoginHandoff(handoff, {
    candidate,
    user: { email: "person@example.com" },
    nowMs: NOW_MS
  }).ok, true);
});

test("CRITICAL guest magic-link import: storage-backed receipt survives the magic-link reload", () => {
  const initialState = editedGuestState();
  const changedState = clone(initialState);
  changedState.items["item-guest"].name = "Rain shell changed this session";
  const tracker = createGuestWorkspaceSessionTracker(initialState, {
    sessionId: GUEST_SESSION_ID
  });
  const storage = storageAdapter([["guest-state", JSON.stringify(changedState)]]);
  assert.equal(recordGuestWorkspaceSessionChanges({
    enabled: true,
    layoutIds: tracker.changedLayoutIds(changedState),
    manifestKey: "guest-manifest",
    sessionId: tracker.sessionId,
    storage,
    now: () => "2026-07-24T01:14:00.000Z"
  }), true);
  assert.equal(storeGuestLoginHandoff({
    candidate: candidateFromState(changedState),
    email: "person@example.com",
    enabled: true,
    guestSessionId: tracker.sessionId,
    handoffKey: "guest-handoff",
    manifestKey: "guest-manifest",
    nowMs: NOW_MS,
    storage
  }), true);

  const afterReload = resolveStoredGuestLoginHandoffCandidate({
    candidateFromState,
    guestStateKey: "guest-state",
    handoffKey: "guest-handoff",
    nowMs: NOW_MS + 1000,
    storage,
    user: { id: "regular-user", email: "person@example.com" }
  });

  assert.deepEqual(afterReload.layouts.map((layout) => layout.layoutId), [GUEST_LAYOUT_ID]);
  assert.equal(consumeStoredGuestLoginHandoff(storage, "guest-handoff"), true);
  assert.equal(storage.values.has("guest-state"), true);
});

test("CRITICAL guest magic-link import: unchanged stale snapshot cannot receive a current-session receipt", () => {
  const staleState = editedGuestState();
  const tracker = createGuestWorkspaceSessionTracker(staleState, {
    sessionId: GUEST_SESSION_ID
  });
  const storage = storageAdapter([["guest-state", JSON.stringify(staleState)]]);

  assert.equal(recordGuestWorkspaceSessionChanges({
    enabled: true,
    layoutIds: tracker.changedLayoutIds(staleState),
    manifestKey: "guest-manifest",
    sessionId: tracker.sessionId,
    storage
  }), true);
  assert.deepEqual(JSON.parse(storage.values.get("guest-manifest")).layoutIds, []);
  assert.equal(storeGuestLoginHandoff({
    candidate: candidateFromState(staleState),
    email: "person@example.com",
    enabled: true,
    guestSessionId: tracker.sessionId,
    handoffKey: "guest-handoff",
    manifestKey: "guest-manifest",
    nowMs: NOW_MS,
    storage
  }), false);
  assert.equal(storage.values.has("guest-handoff"), false);
  assert.equal(storage.values.has("guest-state"), true);
});

test("CRITICAL guest magic-link import: service timestamps do not turn a stale layout into current work", () => {
  const staleState = editedGuestState();
  const tracker = createGuestWorkspaceSessionTracker(staleState, {
    sessionId: GUEST_SESSION_ID
  });
  const metadataOnlyState = clone(staleState);
  metadataOnlyState.layouts[GUEST_LAYOUT_ID].updatedAt = "2026-07-24T01:14:30.000Z";
  metadataOnlyState.items["item-guest"].updatedAt = "2026-07-24T01:14:30.000Z";
  metadataOnlyState.containers["bag-guest"].editedByDeviceId = "device-current";

  assert.equal(tracker.layoutChanged(metadataOnlyState, GUEST_LAYOUT_ID), false);
});

test("CRITICAL guest magic-link import: display preferences alone do not authorize a stale layout", () => {
  const staleState = editedGuestState();
  const tracker = createGuestWorkspaceSessionTracker(staleState, {
    sessionId: GUEST_SESSION_ID
  });
  const preferencesOnlyState = clone(staleState);
  preferencesOnlyState.itemDisplayMode = "photos";
  preferencesOnlyState.showItemMeta = false;
  preferencesOnlyState.showFilterContext = true;

  assert.equal(tracker.layoutChanged(preferencesOnlyState, GUEST_LAYOUT_ID), false);
});

test("CRITICAL guest magic-link import: manifest from an older guest session cannot arm a new receipt", () => {
  const staleState = editedGuestState();
  const storage = storageAdapter([
    ["guest-state", JSON.stringify(staleState)],
    ["guest-manifest", JSON.stringify({
      version: 2,
      sessionId: "guest-session-old",
      layoutIds: [GUEST_LAYOUT_ID],
      updatedAt: "2026-07-20T12:00:00.000Z"
    })]
  ]);

  assert.equal(storeGuestLoginHandoff({
    candidate: candidateFromState(staleState),
    email: "person@example.com",
    enabled: true,
    guestSessionId: GUEST_SESSION_ID,
    handoffKey: "guest-handoff",
    manifestKey: "guest-manifest",
    nowMs: NOW_MS,
    storage
  }), false);
  assert.equal(storage.values.has("guest-handoff"), false);
});

test("CRITICAL guest magic-link import: reverting the current-session change removes layout eligibility", () => {
  const initialState = editedGuestState();
  const tracker = createGuestWorkspaceSessionTracker(initialState, {
    sessionId: GUEST_SESSION_ID
  });
  const changedState = clone(initialState);
  changedState.items["item-guest"].name = "Temporary edit";
  const storage = storageAdapter();

  recordGuestWorkspaceSessionChanges({
    enabled: true,
    layoutIds: tracker.changedLayoutIds(changedState),
    manifestKey: "guest-manifest",
    sessionId: tracker.sessionId,
    storage
  });
  assert.deepEqual(JSON.parse(storage.values.get("guest-manifest")).layoutIds, [GUEST_LAYOUT_ID]);

  recordGuestWorkspaceSessionChanges({
    enabled: true,
    layoutIds: tracker.changedLayoutIds(initialState),
    manifestKey: "guest-manifest",
    sessionId: tracker.sessionId,
    storage
  });
  assert.deepEqual(JSON.parse(storage.values.get("guest-manifest")).layoutIds, []);
});

test("CRITICAL guest magic-link import: a changed non-active target layout is recorded", () => {
  const initialState = editedGuestState();
  initialState.layouts["layout-target"] = {
    id: "layout-target",
    name: "Target",
    rootContainerIds: [],
    arrangement: { rootContainerIds: [], containers: {}, items: {}, packedItems: {} }
  };
  const tracker = createGuestWorkspaceSessionTracker(initialState, {
    sessionId: GUEST_SESSION_ID
  });
  const changedState = clone(initialState);
  changedState.layouts["layout-target"].name = "Target changed";

  assert.equal(changedState.activeLayoutId, GUEST_LAYOUT_ID);
  assert.deepEqual(tracker.changedLayoutIds(changedState), ["layout-target"]);
});

test("CRITICAL guest magic-link import: failed remote confirmation preserves guest storage and prevents duplicate import", async () => {
  const { candidate } = preparedHandoff();
  let receiptPresent = true;
  let guestStoragePresent = true;
  let importCount = 0;
  let pendingCount = 0;

  const coordinator = createGuestLoginHandoffCoordinator({
    getCandidate: () => receiptPresent ? candidate : null,
    runImport: (confirmedCandidate) => runGuestLoginHandoffImport(confirmedCandidate, {
      importLayouts: () => {
        importCount += 1;
        return ["layout-imported"];
      },
      consumeHandoff: () => {
        receiptPresent = false;
      },
      persistImportBeforeCleanup: persistGuestImportBeforeCleanup,
      persistImport: async () => false,
      clearGuestStorage: () => {
        guestStoragePresent = false;
      },
      onImportPending: () => {
        pendingCount += 1;
      }
    })
  });

  const first = await coordinator.offer();
  const second = await coordinator.offer();

  assert.equal(first.status, "pending-save");
  assert.equal(second.status, "already-handled");
  assert.equal(importCount, 1);
  assert.equal(pendingCount, 1);
  assert.equal(receiptPresent, false);
  assert.equal(guestStoragePresent, true);
});

test("CRITICAL guest magic-link import: confirmed remote save is the only path that clears guest storage", async () => {
  const { candidate } = preparedHandoff();
  const events = [];
  const result = await runGuestLoginHandoffImport(candidate, {
    importLayouts: () => {
      events.push("import");
      return ["layout-imported"];
    },
    consumeHandoff: () => events.push("consume-receipt"),
    persistImportBeforeCleanup: persistGuestImportBeforeCleanup,
    persistImport: async () => {
      events.push("confirm-server");
      return true;
    },
    clearGuestStorage: () => events.push("clear-guest")
  });

  assert.equal(result.status, "imported");
  assert.deepEqual(events, ["import", "consume-receipt", "confirm-server", "clear-guest"]);
});

test("CRITICAL guest magic-link import: app arms handoff only after a successful explicit magic-link request", () => {
  const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const loadFlowSource = readFileSync(new URL("../../src/sync/load-remote-state-flow.js", import.meta.url), "utf8");
  const saveFlowSource = readFileSync(new URL("../../src/sync/save-remote-state-flow.js", import.meta.url), "utf8");
  const requestIndex = appSource.indexOf('await apiFetch("/auth/request-magic-link"');
  const prepareIndex = appSource.indexOf("prepareGuestLoginHandoff(email);");

  assert.ok(requestIndex >= 0);
  assert.ok(prepareIndex > requestIndex);
  assert.match(appSource, /createGuestWorkspaceSessionTracker\(state\)/);
  assert.match(appSource, /layoutIds:\s*enabled\s*\?\s*guestWorkspaceSessionTracker\.changedLayoutIds\(state\)\s*:\s*\[\]/);
  assert.match(appSource, /guestSessionId:\s*guestWorkspaceSessionTracker\.sessionId/);
  assert.match(appSource, /function storedGuestLoginHandoffCandidate\(\)[\s\S]*?resolveStoredGuestLoginHandoffCandidate\(\{/);
  const handoffSource = readFileSync(new URL("../../src/public/guest-login-handoff.js", import.meta.url), "utf8");
  assert.match(handoffSource, /const handoff = readJson\(storage, handoffKey\);\s+if \(!handoff\) return null;\s+const sourceState = readJson\(storage, guestStateKey\);/);
  for (const source of [appSource, loadFlowSource, saveFlowSource]) {
    assert.doesNotMatch(source, /storedGuestLocalLayoutCandidate|offerSaveGuestLocalLayouts|consumeGuestLocalLayoutCandidate/);
  }
  assert.match(loadFlowSource, /offerPendingGuestLoginHandoffAfterRemoteLoad/);
  assert.match(saveFlowSource, /offerPendingGuestLoginHandoffAfterRemoteLoad/);
});
