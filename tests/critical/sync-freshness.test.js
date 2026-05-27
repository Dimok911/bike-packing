import test from "node:test";
import assert from "node:assert/strict";
import {
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
