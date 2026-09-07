import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preparePersonalLayoutDeletion } from "../../src/sync/personal-layout-deletion.js";
import { createEmptyLayoutArrangement } from "../../src/state/layout-arrangement.js";
import { personalDeletionReference, preservesUndeletedEntities, retainedPersonalDeletionIntent } from "../../src/sync/personal-deletion-intent.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";

const initial = () => ({ activeLayoutId: "a", items: { item: { id: "item", photos: [{ id: "retained-photo" }] } },
  containers: { bag: { id: "bag" } }, layouts: { a: { id: "a", rootContainerIds: ["bag"],
    arrangement: { rootContainerIds: ["bag"], containers: { bag: { itemIds: ["item"] } }, items: { item: "bag" }, packedItems: { item: true } } } },
  packedItems: { item: true } });
const replacement = () => ({ id: "replacement", name: "New layout", rootContainerIds: [], arrangement: createEmptyLayoutArrangement(), categories: ["Repair"] });

test("deleting the last layout fixes one replacement ID and retains all bag/item/photo owners", () => {
  const state = initial(), before = structuredClone(state), next = replacement();
  const result = preparePersonalLayoutDeletion(state, { layoutId: "a", eligibleLayoutIds: ["a"], nextLayoutId: next.id, replacement: next });
  assert.deepEqual(state, before); assert.deepEqual(result.snapshot.items, before.items); assert.deepEqual(result.snapshot.containers, before.containers);
  assert.deepEqual(Object.keys(result.snapshot.layouts), ["replacement"]); assert.deepEqual(result.snapshot.packedItems, {});
  assert.equal(result.snapshot.activeLayoutId, "replacement"); assert.deepEqual(result.intent, { type: "layout", id: "a" });
  next.categories.push("changed"); assert.deepEqual(result.snapshot.layouts.replacement.categories, ["Repair"]);
});

test("an existing next layout retains its exact placements while invalid selections fail without mutation", () => {
  const state = initial(); state.layouts.b = { ...replacement(), id: "b", arrangement: { ...createEmptyLayoutArrangement(), packedItems: { retained: true } } };
  const before = structuredClone(state), options = { layoutId: "a", eligibleLayoutIds: ["a", "b"], nextLayoutId: "b" };
  const result = preparePersonalLayoutDeletion(state, options);
  assert.deepEqual(result.snapshot.layouts.b, before.layouts.b); assert.deepEqual(result.snapshot.packedItems, { retained: true });
  for (const invalid of [{ ...options, layoutId: "b" }, { ...options, nextLayoutId: "a" },
    { ...options, nextLayoutId: "missing" }, { ...options, eligibleLayoutIds: ["a", "a"] }, { ...options, replacement: replacement() }]) {
    assert.throws(() => preparePersonalLayoutDeletion(state, invalid)); assert.deepEqual(state, before);
  }
  const last = initial();
  for (const next of [null, { ...replacement(), id: "bag" }, { ...replacement(), rootContainerIds: ["bag"] },
    { ...replacement(), arrangement: { ...createEmptyLayoutArrangement(), items: { item: "bag" } } }]) {
    assert.throws(() => preparePersonalLayoutDeletion(last, { layoutId: "a", eligibleLayoutIds: ["a"], nextLayoutId: next?.id || "replacement", replacement: next }));
  }
});

test("layout deletion authorizes only its own placements, never loss of bags/items/other layouts", () => {
  const state = initial(); state.layouts.b = { ...replacement(), id: "b" };
  const prepared = preparePersonalLayoutDeletion(state, { layoutId: "a", eligibleLayoutIds: ["a", "b"], nextLayoutId: "b" });
  const reference = personalDeletionReference(state, [{ action: { body: { payload: prepared.snapshot, userDeletion: prepared.intent } } }]);
  assert.deepEqual(reference.items, state.items); assert.deepEqual(reference.containers, state.containers);
  assert.deepEqual(Object.keys(reference.layouts), ["b"]); assert.equal(preservesUndeletedEntities(prepared.snapshot, reference), true);
  for (const field of ["items", "containers", "layouts"]) assert.equal(preservesUndeletedEntities({ ...prepared.snapshot, [field]: {} }, reference), false);
  assert.equal(retainedPersonalDeletionIntent(prepared.intent, state), null);
  assert.deepEqual(retainedPersonalDeletionIntent(prepared.intent, prepared.snapshot), prepared.intent);
});

test("actual layout adapter records replacement before preference writes and keeps the whole draft on quota", () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8").match(/function preparePersonalLayoutDeletionAction\([^]*?\n\}/)[0];
  const make = () => {
    const state = initial(), events = [], values = new Map();
    const storage = { get length() { return values.size; }, key: index => [...values.keys()][index],
      getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const makeOutbox = () => createPersonalSaveOutbox({ storage, actorId: "actor-a", scopeKey: "id:actor-a", listId: "list-a" });
    const outbox = makeOutbox(); let generation = 1;
    const deps = { state, preparePersonalLayoutDeletion, personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor-a",
      isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, modeState: {}, personalSaveRecovery: { assertRunning() {} },
      canDeleteActiveLayout: () => true, personalSaveContext: () => ({ generation }), userEditableLayouts: () => Object.values(state.layouts),
      ensureLayoutDictionaries: layout => layout, locations: ["Bike"], categories: ["Repair"], uniqueLayoutName: () => "New layout",
      createEmptyLayoutArrangement, currentCreateMeta: () => ({ createdAt: "test-date" }), nowIso: () => "test-date",
      setActivePrivateScope() {}, applyLayoutArrangement() {}, localText: (en, ru) => ru, showToast: message => events.push(message),
      saveState: ({ personalMutation }) => { outbox.capture({ snapshot: state, body: { baseStateRevision: 1, payload: state, userDeletion: personalMutation } }); events.push("durable"); },
      rememberActiveLayoutChoice: id => { assert.equal(makeOutbox().recoverSnapshot().activeLayoutId, id); events.push("preference"); } };
    const prepare = new Function(...Object.keys(deps), `return (${source})`)(...Object.values(deps));
    return { state, storage, values, events, prepare, makeOutbox, change: () => { generation++; } };
  };
  const f = make(), confirm = f.prepare("a"); assert.equal(f.values.size, 0);
  assert.equal(confirm(), true); assert.deepEqual(f.events, ["durable", "preference"]); assert.equal(f.values.size, 1);
  const recovered = f.makeOutbox().recoverSnapshot(); assert.equal(Object.keys(recovered.layouts).length, 1); assert.ok(!recovered.layouts.a);
  assert.equal(confirm(), false);
  const stale = make(), attempt = stale.prepare("a"); stale.change(); assert.equal(attempt(), false); assert.ok(stale.state.layouts.a);
  const quota = make(), failed = quota.prepare("a"); quota.storage.setItem = () => { throw Error("quota"); };
  assert.throws(failed, { code: "quota" }); assert.deepEqual(quota.events, []); assert.equal(quota.values.size, 0);
  assert.ok(!quota.state.layouts.a); assert.equal(Object.keys(quota.state.layouts).length, 1); assert.ok(quota.state.items.item);
});
