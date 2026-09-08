import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preparePersonalCopyBatch, personalCopyIntent } from "../../src/sync/personal-copy-intent.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { copyItemInState } from "../../src/state/item-ops.js";
import { duplicateRootContainerInState } from "../../src/state/container-ops.js";
import { makeItemCopyName, makeContainerCopyName } from "../../src/state/names.js";

const initial = () => ({ items: { a: { id: "a", name: "Pump", containerId: "bag", photos: [], categories: ["Repair"] },
  b: { id: "b", name: "Pump", containerId: "", photos: [] } },
  containers: { bag: { id: "bag", name: "Frame", parentId: null, childIds: [], itemIds: ["a"], order: [{ type: "item", id: "a" }], color: "blue" } },
  layouts: { layout: { id: "layout", rootContainerIds: ["bag"], arrangement: { rootContainerIds: ["bag"],
    containers: { bag: { itemIds: ["a"], childIds: [], order: [{ type: "item", id: "a" }], parentId: "" } }, items: { a: "bag" }, packedItems: { a: true } } } },
  packedItems: { a: true } });
const intent = (entries, keepPlacement = false) => ({ type: "copy", version: 1, entries, keepPlacement, layoutId: keepPlacement ? "layout" : "" });
const options = { changedAt: "test-date", currentEditMeta: () => ({ updatedAt: "test-date" }),
  markEdited: record => { record.updatedAt = "test-date"; } };

test("a whole same-list copy freezes sources and target IDs without modifying originals or sharing nested values", () => {
  const state = initial(), before = structuredClone(state);
  const input = intent(["a", "b"].map(sourceId => ({ type: "item", sourceId, targetId: `copy-${sourceId}` })));
  const prepared = preparePersonalCopyBatch(state, input, options);
  assert.deepEqual(state, before); assert.deepEqual(prepared.intent, input);
  assert.equal(prepared.snapshot.items["copy-a"].name, "Pump копия");
  assert.notEqual(prepared.snapshot.items["copy-a"].name, prepared.snapshot.items["copy-b"].name);
  assert.equal(prepared.snapshot.items["copy-a"].containerId, "");
  state.items.a.name = "Source changed"; input.entries[0].targetId = "different-id";
  assert.equal(prepared.snapshot.items["copy-a"].name, "Pump копия");
  assert.equal(prepared.intent.entries[0].targetId, "copy-a");
  prepared.snapshot.items.a.categories.push("changed");
  assert.deepEqual(prepared.snapshot.items["copy-a"].categories, ["Repair"]);
});

test("DB-only candidate matches existing item placement and empty-bag duplicate semantics", async () => {
  for (const keepPlacement of [false, true]) {
    const state = initial(), legacy = structuredClone(state);
    const input = intent([{ type: "item", sourceId: "a", targetId: "copy-a" }], keepPlacement);
    const prepared = preparePersonalCopyBatch(state, input, options);
    await copyItemInState(legacy, "a", { ...options, id: "copy-a", keepPlacement, activeLayoutId: "layout",
      copyName: name => makeItemCopyName(name, legacy.items), touchLayout: id => options.markEdited(legacy.layouts[id]) });
    assert.deepEqual(prepared.snapshot, legacy);
  }
  const state = initial(), legacy = structuredClone(state);
  const prepared = preparePersonalCopyBatch(state, intent([{ type: "container", sourceId: "bag", targetId: "copy-bag" }]), options);
  await duplicateRootContainerInState(legacy, "bag", { ...options, id: "copy-bag", copyName: name => makeContainerCopyName(name, legacy.containers) });
  assert.deepEqual(prepared.snapshot, legacy);
});

test("missing, photo-owning, colliding and duplicate copy targets abort the entire candidate", () => {
  const state = initial(), before = structuredClone(state), entry = { type: "item", sourceId: "a", targetId: "copy-a" };
  for (const rows of [[], [entry, entry], [{ ...entry, sourceId: "missing" }], [{ ...entry, targetId: "bag" }],
    [{ ...entry, sourceId: "__proto__" }], [{ ...entry, targetId: " a " }], [{ ...entry, type: "layout" }]]) {
    assert.throws(() => preparePersonalCopyBatch(state, intent(rows), options)); assert.deepEqual(state, before);
  }
  state.items.b.photos = [{ id: "cached" }]; const photoState = structuredClone(state);
  assert.throws(() => preparePersonalCopyBatch(state, intent([entry, { type: "item", sourceId: "b", targetId: "copy-b" }]), options), /фото/);
  assert.deepEqual(state, photoState);
  assert.throws(() => personalCopyIntent({ ...intent([entry]), keepPlacement: true }), /копирования/);
});

test("actual copy adapter freezes all IDs before confirmation, registers once, and rejects changed editor/account or quota", () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8").match(/function preparePersonalCatalogCopy\([^]*?\n\}/)[0];
  const make = () => {
    const state = initial(), saved = [], values = new Map(), messages = [], counts = [];
    const storage = { get length() { return values.size; }, key: index => [...values.keys()][index],
      getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const binding = { actorId: "actor-a", scopeKey: "id:actor-a", listId: "list-a" };
    const outbox = createPersonalSaveOutbox({ storage, ...binding });
    let generation = 1, actorId = "actor-a", capacity = true;
    const deps = { state, preparePersonalCopyBatch, PERSONAL_PHOTO_COPY_FORM_ENABLED: false, personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor-a",
      isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, modeState: {},
      personalSaveRecovery: { assertRunning() {} }, personalSaveContext: () => ({ generation, actorId }),
      showToast: message => messages.push(message), localText: (en, ru) => ru,
      requireUsageCapacity: (type, add) => { counts.push([type, add]); return capacity; },
      nowIso: () => options.changedAt, currentEditMeta: options.currentEditMeta, markEdited: options.markEdited,
      normalizeContainerColor: value => value, normalizeItemPhotos: record => record.photos || [], applyLayoutArrangement() {},
      saveState: ({ personalMutation }) => saved.push(outbox.capture({ snapshot: state,
        body: { baseStateRevision: 1, payload: state, userCopy: personalCopyIntent(personalMutation) } })) };
    const prepare = new Function(...Object.keys(deps), `return (${source})`)(...Object.values(deps));
    return { state, saved, values, storage, messages, counts, prepare,
      changeEditor: () => { generation++; }, changeActor: () => { actorId = "actor-b"; }, exhaust: () => { capacity = false; } };
  };
  const f = make(), confirm = f.prepare("item", ["a", "b"]);
  assert.equal(f.values.size, 0); assert.equal(Object.keys(f.state.items).length, 2);
  assert.equal(confirm(), true); assert.equal(confirm(), false); assert.equal(f.saved.length, 1);
  assert.equal(f.values.size, 1); assert.equal(Object.keys(f.saved[0].snapshot.items).length, 4);
  assert.equal(new Set(f.saved[0].action.body.userCopy.entries.map(entry => entry.targetId)).size, 2);
  assert.deepEqual(f.counts, [["items", 2], ["items", 2]]);
  for (const change of ["changeEditor", "changeActor", "exhaust"]) {
    const g = make(), attempt = g.prepare("item", ["a", "b"]); g[change]();
    assert.equal(attempt(), false); assert.equal(g.values.size, 0); assert.equal(Object.keys(g.state.items).length, 2);
  }
  const quota = make(), attempt = quota.prepare("item", ["a", "b"]);
  quota.storage.setItem = () => { throw Error("quota"); };
  assert.throws(attempt, { code: "quota" }); assert.equal(quota.values.size, 0);
  assert.equal(Object.keys(quota.state.items).length, 4, "the complete desired draft survives for the recovery latch");
  assert.equal(attempt(), false, "a failed publication cannot generate another target set");
  const photo = make(); photo.state.items.b.photos = [{ id: "photo" }];
  assert.equal(photo.prepare("item", ["a", "b"]), false); assert.equal(photo.values.size, 0);
  assert.equal(Object.keys(photo.state.items).length, 2); assert.match(photo.messages[0], /фото/);
});
