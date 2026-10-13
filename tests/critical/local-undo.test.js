import { loadRemoteStateFlow } from "../../src/sync/load-remote-state-flow.js";
import { saveRemoteStateFlow } from "../../src/sync/save-remote-state-flow.js";
import test from "node:test";
import assert from "node:assert/strict";
import { applyLocalUndoEntry, applyLocalUndoThrough, captureLocalUndoAcknowledgement, pendingLocalUndoEntries, createLocalUndoEntry, localUndoReferencesPhoto, readLocalUndoEntries, writeLocalUndoEntries } from "../../src/state/local-undo.js";

const fixture = () => ({ items: { a: { id: "a", name: "Pump", weight: 50, containerId: "bag" } }, containers: { bag: { id: "bag", name: "Bag" } },
  layouts: { main: { id: "main", name: "Main", arrangement: { items: { a: "bag" }, containers: { bag: { itemIds: ["a"] } } } } }, locations: [], categories: [] });

test("offline undo survives storage reload and keeps unrelated later edits", () => {
  const before = fixture();
  const after = structuredClone(before);
  after.items.a.name = "Renamed";
  after.items.a.updatedAt = "now";
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  writeLocalUndoEntries(storage, "account-a", [createLocalUndoEntry(before, after)]);
  const [entry] = readLocalUndoEntries(storage, "account-a");
  assert.deepEqual(readLocalUndoEntries(storage, "account-b"), []);
  after.items.a.weight = 80;
  after.items.a.updatedAt = "remote";
  const restored = applyLocalUndoEntry(after, entry);
  assert.equal(restored.items.a.name, "Pump");
  assert.equal(restored.items.a.weight, 80);
  after.items.a.name = "Remote rename";
  assert.equal(applyLocalUndoEntry(after, entry), null);
});

test("navigation and runtime placement changes do not produce undo steps", () => {
  const before = fixture();
  const after = structuredClone(before);
  after.activeLayoutId = "different";
  after.collapsedContainers = { bag: true };
  after.items.a.containerId = "other-bag";
  after.items.a.updatedAt = "now";
  assert.equal(createLocalUndoEntry(before, after), null);
});

test("offline undo restores additions, deletions, quantities and packed state as one action", () => {
  const before = fixture();
  const after = structuredClone(before);
  delete after.items.a;
  after.items.b = { id: "b", name: "Tent" };
  after.layouts.main.arrangement = { items: { b: "bag" }, containers: { bag: { itemIds: ["b"] } }, itemQuantities: { b: 3 }, packedItems: { b: true } };
  assert.deepEqual(applyLocalUndoEntry(after, createLocalUndoEntry(before, after)), before);
});

test("local history is bounded and handles unavailable storage", () => {
  let raw = "";
  const storage = { setItem: (key, value) => { raw = value; }, getItem: () => raw };
  const entries = Array.from({ length: 25 }, (_, i) => ({ createdAt: String(i), changes: [] }));
  assert.equal(writeLocalUndoEntries(storage, "history", entries), 20);
  assert.equal(readLocalUndoEntries(storage, "history")[0].createdAt, "5");
  assert.equal(writeLocalUndoEntries({ setItem() { throw new Error("quota"); } }, "history", entries), 0);
});

test("undo does not delete a new item now referenced by another layout", () => {
  const before = fixture();
  const after = structuredClone(before);
  after.items.new = { id: "new", name: "New item" };
  const entry = createLocalUndoEntry(before, after);
  after.layouts.remote = { id: "remote", arrangement: { items: { new: "bag" } } };
  assert.equal(applyLocalUndoEntry(after, entry), null);
});

test("deleted photo references stay protected while the deletion can be undone", () => {
  const before = fixture();
  before.items.a.photos = [{ id: "remote-photo", localId: "local-photo" }];
  const after = structuredClone(before);
  after.items.a.photos = [];
  const entry = createLocalUndoEntry(before, after);
  assert.equal(localUndoReferencesPhoto([entry], "local-photo"), true);
  assert.equal(localUndoReferencesPhoto([entry], "remote-photo"), true);
  assert.equal(localUndoReferencesPhoto([entry], "other-photo"), false);
  assert.equal(localUndoReferencesPhoto([], "local-photo"), false);
});

test("a layout locked after an action blocks local undo while undoing the lock itself remains possible", () => {
  const before = fixture();
  const after = structuredClone(before);
  after.layouts.main.name = "Renamed";
  const entry = createLocalUndoEntry(before, after);
  const locked = structuredClone(after);
  locked.layouts.main.locked = true;
  assert.equal(applyLocalUndoEntry(locked, entry), null);
  assert.deepEqual(applyLocalUndoEntry(locked, createLocalUndoEntry(after, locked)), after);
});


test("sync acknowledgement removes only captured actions and keeps another account and in-flight edits", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const before = fixture(), after = structuredClone(before); after.items.a.name = "Full";
  const entry = createLocalUndoEntry(before, after);
  writeLocalUndoEntries(storage, "a", [entry]); writeLocalUndoEntries(storage, "b", [entry]);
  const acknowledge = captureLocalUndoAcknowledgement(storage, "a");
  const later = structuredClone(after); later.items.a.weight = 70;
  const newEntry = createLocalUndoEntry(after, later);
  writeLocalUndoEntries(storage, "a", [entry, newEntry]);
  acknowledge();
  assert.deepEqual(readLocalUndoEntries(storage, "a"), [newEntry]);
  assert.deepEqual(readLocalUndoEntries(storage, "b"), [entry]);
});

test("legacy journal reconciliation retains only steps after the confirmed baseline", () => {
  const first = fixture(), second = structuredClone(first); second.items.a.name = "Full";
  const third = structuredClone(second); third.items.a.weight = 70;
  const entries = [createLocalUndoEntry(first, second), createLocalUndoEntry(second, third)];
  assert.deepEqual(pendingLocalUndoEntries(entries, third, second), entries.slice(1));
  assert.deepEqual(pendingLocalUndoEntries(entries, third, third), []);
  assert.deepEqual(pendingLocalUndoEntries(entries, third, null), entries);
  const foreign = fixture(); foreign.items.a.name = "Other device";
  assert.deepEqual(pendingLocalUndoEntries(entries, third, foreign), entries);
});

test("local history restores a selected step and later steps atomically, rejecting conflicts", () => {
  const before = fixture(), after = structuredClone(before); after.items.a.name = "Full";
  const latest = structuredClone(after); latest.items.a.weight = 70;
  const entries = [createLocalUndoEntry(before, after), createLocalUndoEntry(after, latest)];
  assert.deepEqual(applyLocalUndoThrough(latest, entries, 1), after);
  assert.deepEqual(applyLocalUndoThrough(latest, entries, 0), before);
  latest.items.a.name = "Remote";
  assert.equal(applyLocalUndoThrough(latest, entries, 0), null);
  assert.equal(latest.items.a.weight, 70);
});


for (const mode of ["entities", "payload", "failed", "blocked"]) test(`local journal acknowledgement follows confirmed ${mode} save`, async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const before = fixture(), after = structuredClone(before); after.items.a.name = "Full";
  const entry = createLocalUndoEntry(before, after);
  writeLocalUndoEntries(storage, "account", [entry]);
  const runtime = { currentUser: { id: "a" }, state: after, syncMeta: { dirty: true }, uiLanguage: "en" };
  const noop = () => {};
  await saveRemoteStateFlow({ runtime, dependencies: {
    captureLocalUndoAcknowledgement: () => captureLocalUndoAcknowledgement(storage, "account"),
    clearStaleDirtyFlagIfNoLocalChanges: () => false, isReadOnlyBikePackingContext: () => false,
    repairCollapsedActiveLayoutBeforeSave: noop, uploadPendingPhotos: async () => {},
    isSuspiciousEmptyPackingState: () => mode === "blocked", blockDestructiveLocalSave: () => false,
    loadBaseState: () => before, syncChangedBikePackingEntities: async () => ({ attempted: mode === "entities" }),
    hasLegacyPayloadChanges: () => mode !== "entities",
    saveRemoteStateRecord: async () => { if (mode === "failed") throw Error("offline"); return { record: {} }; },
    remoteUpdatedAt: () => "2026-10-14T00:00:00Z", rememberRemoteIntegrityMeta: noop,
    rememberCurrentSyncAccount: noop, saveBaseState: noop, serializeState: () => after,
    saveSyncMeta: noop, updateSyncUi: noop, showToast: noop,
    isReadOnlyBikePackingError: () => false, isNetworkError: () => true,
    isTimeoutError: () => false, isTemporaryServerStorageError: () => false
  } });
  assert.equal(readLocalUndoEntries(storage, "account").length, ["entities", "payload"].includes(mode) ? 0 : 1);
});


test("confirmed history comparison excludes local-only drafts but preserves unsent edits and photos", () => {
  const before = fixture(), confirmed = structuredClone(before); confirmed.items.a.name = "Full";
  const entry = createLocalUndoEntry(before, confirmed);
  const current = structuredClone(confirmed);
  current.layouts.preview = { id: "preview", localOnly: true, name: "Preview" };
  const normalize = value => {
    const copy = structuredClone(value);
    for (const [id, layout] of Object.entries(copy.layouts || {})) if (layout.localOnly) delete copy.layouts[id];
    return copy;
  };
  assert.deepEqual(pendingLocalUndoEntries([entry], current, confirmed, { normalize }), []);
  const edited = structuredClone(current); edited.items.a.weight = 80;
  const newer = createLocalUndoEntry(current, edited);
  assert.deepEqual(pendingLocalUndoEntries([entry, newer], edited, confirmed, { normalize }), [newer]);
  const withPhoto = structuredClone(current); withPhoto.items.a.photos = [{ localId: "unsent" }];
  const photoEntry = createLocalUndoEntry(current, withPhoto);
  assert.deepEqual(pendingLocalUndoEntries([entry, photoEntry], withPhoto, confirmed, { normalize }), [photoEntry]);
});


test("pending uploads cannot be acknowledged by sync serialization that omits their photos", () => {
  const before = fixture(), after = structuredClone(before);
  after.items.a.photos = [{ localId: "pending-local-photo" }];
  const entries = [createLocalUndoEntry(before, after)];
  const normalize = () => fixture();
  assert.deepEqual(pendingLocalUndoEntries(entries, after, before, { normalize, pendingPhotos: true }), entries);
});


test("cached startup verifies the local journal without applying a server state or saving it", async () => {
  const state = fixture(), noop = () => {};
  const runtime = { currentUser: { id: "a" }, state, syncMeta: {}, initialRemoteLoadPending: true };
  let checks = 0;
  await loadRemoteStateFlow({ runtime, dependencies: {
    isSharedListLinkRoute: () => false, isPublicLayoutContext: () => false,
    setLayoutLoadStatus: noop, clearStaleDirtyFlagIfNoLocalChanges: noop,
    currentPackingListId: () => "personal", fetchRemoteListFreshnessRecord: async () => ({}),
    hasLocalSavedState: () => true, hasLocalSyncChanges: () => false, canUseCachedStartupState: () => true,
    verifyLocalHistoryFromServer: async id => { assert.equal(id, "personal"); checks++; },
    rememberRemoteIntegrityMeta: noop, rememberCurrentSyncAccount: noop,
    serializeState: () => state, saveBaseState: noop, saveSyncMeta: noop,
    repairPrivateMojibakeLayoutNames: noop, renderPreservingPackingScroll: noop,
    setPersonalLayoutsLoadedStatus: noop, updateSyncUi: noop,
    fetchRemoteStateRecord: () => assert.fail("journal verification must not trigger state replacement")
  } });
  assert.equal(checks, 1);
  assert.equal(runtime.state, state);
});
