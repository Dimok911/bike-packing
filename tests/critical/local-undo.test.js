import test from "node:test";
import assert from "node:assert/strict";
import { applyLocalUndoEntry, createLocalUndoEntry, localUndoReferencesPhoto, readLocalUndoEntries, writeLocalUndoEntries } from "../../src/state/local-undo.js";

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
