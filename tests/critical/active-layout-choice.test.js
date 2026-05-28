import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveStoredPrivateLayoutChoice
} from "../../src/storage/active-choice.js";
import {
  cloneStateForSyncPayload
} from "../../src/sync/serialize.js";
import {
  installRuntimeActiveLayoutId
} from "../../src/state/active-layout-runtime.js";

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
