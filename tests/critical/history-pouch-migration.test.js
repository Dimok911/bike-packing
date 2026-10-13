import test from "node:test";
import assert from "node:assert/strict";
import { isolateLinkedLayoutEntities } from "../../src/state/layout-entity-isolation.js";
import { recoverMissingTemporaryContainers, temporaryContainerId } from "../../src/state/layout-temporary-containers.js";
import { historySnapshot } from "../../src/sync/history-snapshot.js";
import { buildHistoryStateDiff } from "../../src/ui/history-diff.js";
import { buildChangedEntitySyncEntries } from "../../src/sync/entity-sync.js";
import { cloneStateForSyncPayload } from "../../src/sync/serialize.js";
import { loadRemoteStateFlow } from "../../src/sync/load-remote-state-flow.js";
import { rememberLayoutEntityRepairBaseState } from "../../src/state/layout-entity-isolation.js";

function fixture() {
  const arrangement = {
    rootContainerIds: ["bag"],
    containers: {
      bag: { parentId: "", childIds: ["pouch"], itemIds: [], order: [{ type: "container", id: "pouch" }] },
      pouch: { parentId: "bag", childIds: [], itemIds: ["pump"], order: [{ type: "item", id: "pump" }] }
    }, items: { pump: "pouch" }, itemQuantities: { pump: 1 }
  };
  return { containers: { bag: { id: "bag", name: "Bag", nestable: true }, pouch: { id: "pouch", name: "Light", nestable: false } },
    items: { pump: { id: "pump", name: "Pump" } },
    layouts: Object.fromEntries(["a", "b"].map(id => [id, { id, name: id, rootContainerIds: ["bag"], arrangement: structuredClone(arrangement) }])) };
}

test("history: migration and an incomplete pouch snapshot never invent removals or moves", () => {
  const before = fixture(), after = structuredClone(before);
  isolateLinkedLayoutEntities(after);
  const clone = after.layouts.a.arrangement.items.pump;
  delete after.containers[clone];
  const original = structuredClone(after);
  const diff = buildHistoryStateDiff(before, after);
  for (const group of Object.values(diff)) for (const rows of Object.values(group)) assert.deepEqual(rows, []);
  assert.deepEqual(after, original, "history must not mutate stored evidence");
  assert.deepEqual(historySnapshot(after), after);
});

test("history: rename survives identity migration while real moves and removals remain visible", () => {
  const before = fixture(), after = structuredClone(before);
  isolateLinkedLayoutEntities(after);
  const clone = after.layouts.a.arrangement.items.pump;
  after.containers[clone].name = "Full";
  let diff = buildHistoryStateDiff(before, after);
  assert.equal(diff.containers.changed.length, 1);
  assert.equal(diff.containers.added.length, 0);
  assert.equal(diff.layouts.changed.length, 0);
  after.layouts.a.arrangement.items.pump = "bag";
  after.layouts.a.arrangement.containers[clone].itemIds = [];
  after.layouts.a.arrangement.containers[clone].order = [];
  after.layouts.a.arrangement.containers.bag.itemIds = ["pump"];
  after.layouts.a.arrangement.containers.bag.order.push({ type: "item", id: "pump" });
  diff = buildHistoryStateDiff(before, after);
  assert.equal(diff.layouts.changed.length, 1);
  delete after.items.pump;
  assert.equal(buildHistoryStateDiff(before, after).items.removed.length, 1);
});

test("history: catalog-first entity sync reports rename before the layout phase arrives", () => {
  const before = fixture(), intermediate = structuredClone(before);
  const id = temporaryContainerId("a", "pouch");
  intermediate.containers[id] = { ...before.containers.pouch, id, name: "Full" };
  const diff = buildHistoryStateDiff(before, intermediate);
  assert.equal(diff.containers.added.length, 0);
  assert.equal(diff.containers.changed.length, 1);
  assert.match(diff.containers.changed[0].details.join(" "), /Light.*Full/);
  const after = structuredClone(before); isolateLinkedLayoutEntities(after);
  after.containers[id].name = "Full";
  const layoutPhase = buildHistoryStateDiff(intermediate, after);
  assert.deepEqual(layoutPhase.containers.changed, [], "do not overwrite the already stored independent name");
  assert.deepEqual(layoutPhase.layouts.changed, []);
  const resumed = structuredClone(intermediate);
  isolateLinkedLayoutEntities(resumed);
  assert.equal(resumed.layouts.a.arrangement.items.pump, id);
  assert.equal(resumed.containers[id].name, "Full");
  assert.equal(resumed.containers[`${id}-2`], undefined);
});

test("recovered migration catalog entries stay absent from the remote baseline and are sent", () => {
  const remote = fixture(); isolateLinkedLayoutEntities(remote);
  const clone = remote.layouts.a.arrangement.items.pump;
  delete remote.containers[clone];
  const local = structuredClone(remote);
  assert.equal(recoverMissingTemporaryContainers(local), 1);
  assert.equal(recoverMissingTemporaryContainers(local), 0);
  const entries = buildChangedEntitySyncEntries("container", historySnapshot(remote), local, {
    cloneStateForSync: (s, options) => cloneStateForSyncPayload(s, options), createEmptyUserState: fixture
  });
  assert.deepEqual(entries.map(e => e.id), [clone]);
  assert.equal(entries[0].deleted, false);
  const unknown = structuredClone(remote);
  unknown.layouts.a.arrangement.containers["pouch-unknown"] = { parentId: "bag" };
  recoverMissingTemporaryContainers(unknown);
  assert.equal(unknown.containers["pouch-unknown"], undefined);
});

test("startup cannot acknowledge unsent pouch migration through either fast path", async () => {
  const raw = fixture(), normalized = structuredClone(raw);
  const report = isolateLinkedLayoutEntities(normalized);
  rememberLayoutEntityRepairBaseState(normalized, raw, report);
  const calls = [];
  const runtime = { currentUser: {}, state: structuredClone(normalized), syncMeta: { dirty: false }, initialRemoteLoadPending: true };
  const noop = () => {};
  const deps = {
    clearStaleDirtyFlagIfNoLocalChanges: noop, isSharedListLinkRoute: () => false, isPublicLayoutContext: () => false,
    setLayoutLoadStatus: noop, currentPackingListId: () => "list", hasLocalSavedState: () => true,
    fetchRemoteListFreshnessRecord: async () => ({}), hasLocalSyncChanges: () => true,
    canUseCachedStartupState: () => { assert.fail("pending migration must bypass cached startup"); },
    fetchRemoteStateRecord: async () => { calls.push("fetch"); return { record: { payload: raw } }; },
    normalizeRemoteState: () => normalized, statePrivateLayoutCount: () => 2, setLayoutLoadProgress: noop,
    stateIntegrityMetaFromResponse: () => ({}), blockRemoteIntegrityFailureIfNeeded: () => false,
    remoteUpdatedAt: () => "", timeValue: () => 0, canLocalStateOverrideRemote: () => false,
    serializeState: () => structuredClone(normalized), cloneStateForSync: s => structuredClone(s),
    applyRemoteState: (s, _time, _meta, original) => { assert.equal(s, normalized); assert.equal(original, raw); calls.push("apply"); return true; },
    saveBaseState: () => assert.fail("do not acknowledge migrated catalog as already remote"),
    isTemporaryServerStorageError: () => false, isNetworkError: () => false, isTimeoutError: () => false,
    updateSyncUi: noop, showToast: (...args) => assert.fail(JSON.stringify(args)), saveSyncMeta: noop
  };
  await loadRemoteStateFlow({ runtime, dependencies: deps });
  assert.deepEqual(calls, ["fetch", "apply"]);
});
