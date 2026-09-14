import test from "node:test";
import assert from "node:assert/strict";
import { loadRemoteStateFlow } from "../../src/sync/load-remote-state-flow.js";
import { canUseCachedStartupState, STARTUP_CACHE_INTEGRITY_VERSION } from "../../src/sync/list-freshness.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { preparePersonalPlacementMutation } from "../../src/sync/personal-placement-mutation.js";

function fixture({ cache = false, known = false, dirty = false, pending = false } = {}) {
  const values = new Map(), events = [], statuses = [];
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const binding = { actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
  const remote = { activeLayoutId: "l", items: {}, packedItems: {},
    containers: { external: { id: "external", name: "Server bag", parentId: null, childIds: [], itemIds: [], order: [] } },
    layouts: { l: { id: "l", rootContainerIds: [], arrangement: { rootContainerIds: [], containers: {}, items: {},
      itemQuantities: {}, packedItems: {}, itemQuantityMigrationVersion: 3 } } }, opaque: { keep: "remote baseline" } };
  const make = () => createPersonalSaveOutbox({ storage, ...binding });
  let outbox = make(), currentActor = binding.actorId;
  if (known || pending) {
    const prior = outbox.capture({ snapshot: remote, body: { payload: remote, baseStateRevision: 1581 } });
    if (known) outbox.markApplied({ operationId: prior.action.operationId, stateRevision: 1582 });
  } else {
    outbox.adoptRemoteBaseline({ snapshot: remote, payload: remote, stateRevision: 1582 });
  }
  // Match cold app loadState({reload:true}): an initial memory-only observation
  // disappears; a real retained confirmed head still supplies its baseline.
  outbox = make();
  const initialBytes = [...values];
  const runtime = { currentUser: { id: binding.actorId }, appUnlocked: false, initialRemoteLoadPending: true,
    remoteRefreshInFlight: false, state: structuredClone(remote), syncMeta: { dirty, listId: binding.listId,
      stateRevision: 1582, serverUpdatedAt: "2026-09-14T10:00:00Z", localUpdatedAt: dirty ? "2026-09-14T11:00:00Z" : "2026-09-14T10:00:00Z",
      cacheIntegrityVersion: STARTUP_CACHE_INTEGRITY_VERSION } };
  if (dirty) runtime.state.containers.external.name = "Unsaved local name";
  const unexpected = () => assert.fail("unexpected loading branch");
  const dependencies = {
    isSharedListLinkRoute: () => false, isPublicLayoutContext: () => false,
    setLayoutLoadStatus: (tone, text) => statuses.push({ tone, text }),
    setPersonalLayoutsLoadedStatus: () => statuses.push({ tone: "success" }),
    updateSyncUi: () => {}, clearStaleDirtyFlagIfNoLocalChanges: () => false,
    currentPackingListId: () => cache ? binding.listId : "",
    fetchRemoteListFreshnessRecord: async listId => {
      events.push("freshness"); return { listId, stateRevision: 1582, serverUpdatedAt: runtime.syncMeta.serverUpdatedAt, layoutCount: 1, containerCount: 1 };
    },
    canUseCachedStartupState,
    canReuseConfirmedRemoteBaseline: ({ listId, freshness }) => {
      events.push("reuse");
      const base = outbox.confirmedBase();
      return currentActor === binding.actorId && listId === binding.listId && base?.stateRevision === freshness.stateRevision;
    },
    tryApplyRemoteEntityChanges: () => assert.fail("unproven local cache must not become a baseline through entity changes"),
    hasLocalSavedState: () => true, isForeignLocalSyncState: () => false,
    fetchRemoteStateRecord: async () => {
      events.push("read");
      return { record: { id: binding.listId, payload: remote, stateRevision: 1582, updatedAt: runtime.syncMeta.serverUpdatedAt } };
    },
    normalizeRemoteState: payload => structuredClone(payload), statePrivateLayoutCount: value => Object.keys(value?.layouts || {}).length,
    setLayoutLoadProgress: () => {}, stateIntegrityMetaFromResponse: record => ({ stateRevision: record.stateRevision }),
    blockRemoteIntegrityFailureIfNeeded: () => { events.push("integrity"); return false; },
    adoptConfirmedRemoteBaseline: ({ state, payload, integrityMeta, listId }) => {
      events.push("adopt");
      assert.equal(currentActor, binding.actorId, "actor changed before baseline adoption");
      assert.equal(listId, binding.listId);
      assert.deepEqual(state, remote, "adoption receives the remote snapshot, never the dirty editor");
      assert.equal(payload, remote, "raw server payload remains available to the app's business mapper");
      outbox.adoptRemoteBaseline({ snapshot: state, payload, stateRevision: integrityMeta.stateRevision });
    },
    remoteUpdatedAt: record => record.updatedAt, timeValue: value => Date.parse(value) || 0,
    canLocalStateOverrideRemote: () => true, isSuspiciousEmptyPackingState: () => false,
    isMeaningfulPackingState: () => true, cloneStateForSync: value => structuredClone(value),
    serializeState: () => structuredClone(runtime.state), layoutItemQuantityMigrationRecovered: () => false,
    rememberRemoteIntegrityMeta: () => {}, rememberCurrentSyncAccount: () => {}, saveSyncMeta: () => {},
    saveBaseState: () => events.push("legacy-mirror"), repairPrivateMojibakeLayoutNames: () => {},
    renderPreservingPackingScroll: () => {}, renderInitialLocalFallbackIfNeeded: () => { runtime.initialRemoteLoadPending = false; },
    saveRemoteState: async () => {
      events.push("capture");
      outbox.capture({ snapshot: runtime.state, body: { payload: runtime.state, baseStateRevision: 1582 } });
    },
    applyRemoteState: unexpected, loadBaseState: unexpected,
    isTemporaryServerStorageError: () => false, isTimeoutError: () => false, isNetworkError: () => false
  };
  const load = () => loadRemoteStateFlow({ runtime, dependencies });
  const place = () => {
    const prepared = preparePersonalPlacementMutation(runtime.state, { action: "link-root", ids: ["external"], layoutId: "l", targetIndex: 0, includeContents: true });
    return outbox.capture({ snapshot: prepared.snapshot,
      body: { payload: prepared.snapshot, baseStateRevision: 1582, userPlacement: prepared.intent } });
  };
  return { values, initialBytes, runtime, remote, outbox, make, events, statuses, dependencies, load, place,
    changeActor: () => { currentActor = "actor-b"; } };
}

test("an equal full read supplies the first link-root action's immutable base and survives cold decode", async () => {
  const f = fixture();
  assert.equal(f.outbox.confirmedBase(), null);
  await f.load();
  assert.deepEqual(f.events, ["read", "integrity", "adopt", "legacy-mirror"]);
  assert.equal(f.values.size, 0, "observing the initial base does not manufacture an operation or checkpoint");
  const action = f.place();
  assert.equal(action.action.kind, "list.update");
  assert.equal(action.action.body.userPlacement.action, "link-root");
  assert.deepEqual(action.mergeBase, { stateRevision: 1582, payload: f.remote });
  assert.deepEqual(action.snapshot.layouts.l.rootContainerIds, ["external"]);
  assert.deepEqual(f.make().recover().mergeBase, action.mergeBase);
  assert.deepEqual(f.remote.layouts.l.rootContainerIds, []);
});

test("cold freshness without a durable confirmed base falls through to a full read, not cached entity changes", async () => {
  const f = fixture({ cache: true });
  await f.load();
  assert.deepEqual(f.events, ["freshness", "reuse", "read", "integrity", "adopt", "legacy-mirror"]);
  assert.deepEqual(f.place().mergeBase, { stateRevision: 1582, payload: f.remote });
});

test("an existing confirmed outbox base retains the verified cache fast path without an extra GET", async () => {
  const f = fixture({ cache: true, known: true });
  assert.equal(f.outbox.confirmedBase().stateRevision, 1582);
  await f.load();
  assert.deepEqual(f.events, ["freshness", "reuse", "legacy-mirror"]);
  assert.deepEqual([...f.values], f.initialBytes);
  assert.deepEqual(f.place().mergeBase, { stateRevision: 1582, payload: f.remote });
});

test("newer local edits capture only after observing the distinct remote baseline", async () => {
  const f = fixture({ dirty: true }), local = structuredClone(f.runtime.state);
  await f.load();
  assert.deepEqual(f.events, ["read", "integrity", "adopt", "capture"]);
  const action = f.make().recover();
  assert.equal(action.snapshot.containers.external.name, "Unsaved local name");
  assert.equal(action.mergeBase.payload.containers.external.name, "Server bag");
  assert.deepEqual(action.mergeBase, { stateRevision: 1582, payload: f.remote });
  assert.deepEqual(f.runtime.state, local);
});

test("failed integrity verification cannot install a base or capture a dirty draft", async () => {
  const f = fixture({ dirty: true });
  f.dependencies.blockRemoteIntegrityFailureIfNeeded = () => { f.events.push("integrity-blocked"); return true; };
  assert.equal(await f.load(), false);
  assert.deepEqual(f.events, ["read", "integrity-blocked"]);
  assert.equal(f.outbox.confirmedBase(), null);
  assert.deepEqual([...f.values], f.initialBytes);
});

test("adoption cannot replace a preexisting pending immutable action", async () => {
  const f = fixture({ dirty: true, pending: true });
  assert.equal(await f.load(), false);
  assert.deepEqual(f.events, ["read", "integrity", "adopt"]);
  assert.deepEqual([...f.values], f.initialBytes);
  assert.equal(f.outbox.hasPending(), true);
  assert.equal(f.statuses.at(-1).tone, "error");
  assert.match(f.statuses.at(-1).text, /Нельзя заменить неподтверждённые действия/);
});

test("a changed actor at the observation boundary stops before baseline adoption and capture", async () => {
  const f = fixture({ dirty: true });
  const fetch = f.dependencies.fetchRemoteStateRecord;
  f.dependencies.fetchRemoteStateRecord = async () => { const value = await fetch(); f.changeActor(); return value; };
  assert.equal(await f.load(), false);
  assert.equal(f.outbox.confirmedBase(), null);
  assert.deepEqual([...f.values], f.initialBytes);
  assert.equal(f.events.includes("capture"), false);
  assert.match(f.statuses.at(-1).text, /actor changed before baseline adoption/);
});

for (const boundary of ["canReuseConfirmedRemoteBaseline", "adoptConfirmedRemoteBaseline"]) {
  for (const rejected of [false, true]) {
    test(`an async ${boundary} (${rejected ? "rejected" : "fulfilled"}) never authorizes capture or cache reuse`, async () => {
      const f = fixture({ cache: true, dirty: true }), unhandled = [];
      const listener = error => unhandled.push(error);
      process.on("unhandledRejection", listener);
      try {
        f.dependencies[boundary] = () => rejected ? Promise.reject(Error("late failure")) : Promise.resolve(true);
        assert.equal(await f.load(), false);
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(unhandled, []);
        assert.equal(f.outbox.confirmedBase(), null);
        assert.deepEqual([...f.values], f.initialBytes);
        assert.equal(f.events.includes("capture"), false);
        assert.equal(f.statuses.at(-1).tone, "error");
        assert.match(f.statuses.at(-1).text, /Personal baseline callback must be synchronous/);
        if (boundary === "canReuseConfirmedRemoteBaseline") assert.equal(f.events.includes("read"), false, "cache proof failures cannot be swallowed as endpoint fallback");
      } finally { process.removeListener("unhandledRejection", listener); }
    });
  }
}
