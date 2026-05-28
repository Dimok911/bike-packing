import test from "node:test";
import assert from "node:assert/strict";
import {
  canUseCachedStartupState,
  listFreshnessChanged,
  normalizeListFreshness
} from "../../src/sync/list-freshness.js";

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
    entityHash: ""
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

test("CRITICAL offline-start: startup can reuse cached state when freshness is unchanged", () => {
  assert.equal(
    canUseCachedStartupState({
      currentListId: "list-1",
      hasLocalState: true,
      syncMeta: {
        dirty: false,
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
