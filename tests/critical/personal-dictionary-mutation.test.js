import { createPersonalSaveRecovery } from "../../src/sync/personal-save-recovery.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preparePersonalDictionaryMutation } from "../../src/sync/personal-dictionary-mutation.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";

const initial = () => ({ locations: ["Bike", "Camp"], customLocations: ["Bike", "Camp"], categories: ["Repair", "Food"],
  customCategories: ["Repair", "Food"], items: { a: { id: "a", location: "Bike", categories: ["Repair", "Food"], category: "Repair", photos: [{ id: "same-file" }] },
    b: { id: "b", location: "Camp", category: "Food" }, public: { id: "public", location: "Bike", adminDemo: true } },
  containers: { bag: { id: "bag", location: "Bike", categories: ["Repair"], category: "Repair" } }, layouts: { l: { id: "l", rootContainerIds: ["bag"] } } });
const selection = { itemIds: ["a", "b"], containerIds: ["bag"] };

test("private dictionary rename freezes every reference without touching public records, placements or photos", () => {
  const state = initial(), before = structuredClone(state);
  const { snapshot, intent } = preparePersonalDictionaryMutation(state, { ...selection, type: "location", action: "rename",
    value: "Bike", nextValue: "Bicycle", values: state.locations }, { changedAt: "fixed", markEdited: (record, at) => { record.updatedAt = at; } });
  assert.deepEqual(state, before); assert.deepEqual(snapshot.locations, ["Bicycle", "Camp"]);
  assert.equal(snapshot.items.a.location, "Bicycle"); assert.equal(snapshot.containers.bag.location, "Bicycle");
  assert.deepEqual(snapshot.items.public, before.items.public); assert.deepEqual(snapshot.items.b, before.items.b);
  assert.deepEqual(snapshot.layouts, before.layouts); assert.deepEqual(snapshot.items.a.photos, before.items.a.photos);
  assert.deepEqual(intent.items, ["a"]); assert.deepEqual(intent.containers, ["bag"]); assert.equal(intent.replacement, "Bicycle");
  state.items.a.location = "later"; assert.equal(snapshot.items.a.location, "Bicycle");
});

test("category deletion uses the exact displayed fallback, deduplicates references and supports deleting the last value", () => {
  const state = initial();
  const result = preparePersonalDictionaryMutation(state, { ...selection, type: "category", action: "delete", value: "Repair", fallback: "Food", values: state.categories });
  assert.deepEqual(result.snapshot.categories, ["Food"]); assert.deepEqual(result.snapshot.items.a.categories, ["Food"]);
  assert.equal(result.snapshot.containers.bag.category, "Food"); assert.deepEqual(result.intent.items, ["a"]);
  const last = preparePersonalDictionaryMutation(result.snapshot, { ...selection, type: "category", action: "delete", value: "Food", values: ["Food"] });
  assert.deepEqual(last.snapshot.categories, []); assert.equal(last.snapshot.items.a.category, ""); assert.equal(last.snapshot.containers.bag.category, "");
  assert.deepEqual(last.snapshot.items.a.categories, []);
});

test("invalid dictionary selections fail before changing any live record and add changes only the dictionary", () => {
  const state = initial(), before = structuredClone(state), args = { ...selection, type: "location", action: "delete", value: "Bike", fallback: "Camp", values: state.locations };
  for (const patch of [{ type: "unknown" }, { value: "missing" }, { fallback: "" }, { itemIds: ["a", "a"] }, { itemIds: ["public"] },
    { containerIds: ["missing"] }, { action: "rename", nextValue: "Camp" }]) {
    assert.throws(() => preparePersonalDictionaryMutation(state, { ...args, ...patch })); assert.deepEqual(state, before);
  }
  const { snapshot } = preparePersonalDictionaryMutation(state, { ...args, action: "add", value: "Hotel" });
  assert.deepEqual(snapshot.locations, ["Bike", "Camp", "Hotel"]); assert.deepEqual(snapshot.items, before.items);
  assert.deepEqual(snapshot.containers, before.containers);
});

test("actual dictionary adapter binds confirmation to the editor and persists all references before any success", () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8").match(/function preparePersonalDictionaryAction\([^]*?\n\}/)[0];
  const make = () => {
    const issued = [];
    const state = initial(), values = new Map(), events = [];
    const storage = { get length() { return values.size; }, key: index => [...values.keys()][index],
      getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const makeOutbox = () => createPersonalSaveOutbox({ storage, actorId: "actor-a", scopeKey: "id:actor-a", listId: "list-a" });
    const recovery = createPersonalSaveRecovery(), outbox = recovery.outbox(makeOutbox, "id:actor-a"); let generation = 1, capacity = true;
    const deps = { crypto: { randomUUID() { const id = crypto.randomUUID(); issued.push(id); return id; } }, state, preparePersonalDictionaryMutation, personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor-a",
      isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, modeState: {}, personalSaveRecovery: recovery,
      activeDictionaryOwner: () => state, personalSaveContext: () => ({ generation }), dictionaryEditScope: () => ({ items: [state.items.a, state.items.b], containers: [state.containers.bag] }),
      dictionaryOptionsForOwner: type => state[type === "location" ? "locations" : "categories"], nowIso: () => "fixed", markEdited() {},
      localText: (en, ru) => ru, showToast: message => events.push(message), requireUsageCapacity: () => capacity,
      persistStateSnapshot: (snapshot, { personalMutation, operationId }) => { outbox.capture({ snapshot, operationId, body: { payload: snapshot, baseStateRevision: 1, userDictionary: personalMutation } }); events.push("durable"); },
      saveState: options => { assert.equal(options.recordAction, false); assert.deepEqual(outbox.recoverSnapshot().items, state.items); } };
    const prepare = new Function(...Object.keys(deps), `return (${source})`)(...Object.values(deps));
    return { state, storage, values, events, prepare, issued, outbox, makeOutbox, recovery, change: () => { generation++; }, noCapacity: () => { capacity = false; } };
  };
  const request = { type: "location", action: "rename", value: "Bike", nextValue: "Bicycle" }, f = make();
  const confirm = f.prepare(request); request.nextValue = "changed later"; assert.equal(f.values.size, 0); assert.equal(f.state.items.a.location, "Bike");
  const idsBeforeConfirmation = [...f.issued]; assert.ok(idsBeforeConfirmation.length);
  assert.equal(confirm(), true);
  assert.equal(f.outbox.recover().action.operationId, idsBeforeConfirmation[0]); assert.deepEqual(f.issued, idsBeforeConfirmation); assert.deepEqual(f.events, ["durable"]); assert.equal(f.makeOutbox().recoverSnapshot().items.a.location, "Bicycle");
  assert.equal(f.makeOutbox().recoverSnapshot().containers.bag.location, "Bicycle"); assert.equal(confirm(), false);
  const stale = make(), old = stale.prepare({ ...request, nextValue: "Bicycle" }); stale.change(); assert.equal(old(), false); assert.equal(stale.state.items.a.location, "Bike");
  const quota = make(), failed = quota.prepare({ type: "location", action: "delete", value: "Bike", fallback: "Camp" });
  quota.storage.setItem = () => { throw Error("quota"); }; assert.equal(failed(), false);
  assert.equal(quota.values.size, 0); assert.equal(quota.state.items.a.location, "Bike"); assert.equal(quota.state.containers.bag.location, "Bike");
  const draft = quota.recovery.recoveryCopy(quota.storage).unconfirmedMemoryDraft;
  assert.equal(draft.items.a.location, "Camp"); assert.equal(draft.containers.bag.location, "Camp");
  const limited = make(), add = limited.prepare({ type: "location", action: "add", value: "Hotel" }); limited.noCapacity();
  assert.equal(add(), false); assert.equal(limited.values.size, 0); assert.deepEqual(limited.state.locations, ["Bike", "Camp"]);
});
