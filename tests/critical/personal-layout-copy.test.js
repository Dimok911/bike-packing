import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { preparePersonalLayoutCopy, personalLayoutCopyIntent, PERSONAL_PHOTO_LAYOUT_COPY_ENABLED } from "../../src/sync/personal-layout-copy.js";
import { createEmptyLayoutArrangement } from "../../src/state/layout-arrangement.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { cloneStateForSyncPayload } from "../../src/sync/serialize.js";
import { createPersonalSaveRecovery } from "../../src/sync/personal-save-recovery.js";

function fixture(photos = false) {
  const photo = { id: "photo", photoId: "photo", assetId: randomUUID(), listId: "list", status: "synced", url: "/saved/photo", thumbUrl: "/saved/thumb",
    fileName: "photo.png", type: "image/png", size: 20, width: 2, height: 2 };
  const placement = (parentId, children = [], items = []) => ({ parentId, childIds: children, itemIds: items,
    order: [...items.map(id => ({ type: "item", id })), ...children.map(id => ({ type: "container", id }))] });
  const state = { activeLayoutId: "source", locations: ["Bike"], categories: ["Repair"], packedItems: { pump: true },
    containers: { bag: { id: "bag", name: "Bag", photos: [], category: "Repair", location: "Bike" },
      pouch: { id: "pouch", name: "Empty pouch", photos: [] } },
    items: { pump: { id: "pump", name: "Pump", quantity: 1, category: "Repair", custom: { frozen: true }, photos: photos ? [photo] : [] } },
    layouts: { source: { id: "source", name: "Source", unknownSourceField: { exact: true }, rootContainerIds: ["bag"],
      customLocations: ["Custom place"], customCategories: [], locations: ["Bike", "Custom place"], categories: ["Repair"],
      arrangement: { ...createEmptyLayoutArrangement(), rootContainerIds: ["bag"], containers: { bag: placement("", ["pouch"], ["pump"]), pouch: placement("bag") },
        items: { pump: "bag" }, itemQuantities: { pump: 3 }, packedItems: { pump: true } } } } };
  const input = { sourceLayoutId: "source", targetLayoutId: `layout-${randomUUID()}`, requestedName: "Frozen layout", listId: "list" };
  const options = { photoEnabled: photos, changedAt: "2026-09-08T12:00:00Z", currentCreateMeta: () => ({ createdAt: "2026-09-08T12:00:00Z" }) };
  return { state, input, options };
}

for (const photos of [false, true]) test(`a whole ${photos ? "photo " : ""}layout copy freezes placement and reuses its complete catalog owners`, () => {
  const f = fixture(photos), before = structuredClone(f.state), target = f.input.targetLayoutId;
  const prepared = preparePersonalLayoutCopy(f.state, f.input, f.options), layout = prepared.snapshot.layouts[target];
  assert.deepEqual(f.state, before); assert.deepEqual(prepared.source, before.layouts.source);
  assert.deepEqual(layout.arrangement, before.layouts.source.arrangement);
  assert.deepEqual(prepared.snapshot.items, before.items); assert.deepEqual(prepared.snapshot.containers, before.containers);
  assert.deepEqual(prepared.snapshot.layouts.source, before.layouts.source); assert.equal(prepared.snapshot.activeLayoutId, target);
  assert.deepEqual(layout.locations, ["Custom place", "Bike"]); assert.equal(layout._historyCopySourceLayoutId, "source");
  assert.equal(layout._historyCopySourceLayoutName, "Source");
  f.state.layouts.source.arrangement.itemQuantities.pump = 99; f.state.items.pump.custom.frozen = false;
  assert.equal(layout.arrangement.itemQuantities.pump, 3); assert.equal(prepared.snapshot.items.pump.custom.frozen, true);
  const storage = new Map(), outbox = createPersonalSaveOutbox({ actorId: "actor", scopeKey: "id:actor", listId: "list",
    storage: { get length() { return storage.size; }, key: i => [...storage.keys()][i], getItem: k => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) } });
  const project = snapshot => cloneStateForSyncPayload(snapshot, { forSync: true });
  outbox.adoptRemoteBaseline({ snapshot: before, payload: project(before), stateRevision: 7 });
  const action = outbox.capture({ snapshot: prepared.snapshot, body: { payload: project(prepared.snapshot), baseStateRevision: 7, userLayoutCopy: prepared.intent } });
  assert.deepEqual(outbox.recover().action, action.action); assert.equal(action.action.kind, "list.update");
  assert.equal(outbox.recoverSnapshot().layouts[target].id, target);
});

test("empty layout creation shares one frozen preparation and may retain the active layout", () => {
  const f = fixture(true), before = structuredClone(f.state);
  const prepared = preparePersonalLayoutCopy(f.state, { ...f.input, sourceLayoutId: "", activate: false }, f.options);
  assert.equal(prepared.snapshot.activeLayoutId, "source"); assert.deepEqual(prepared.snapshot.packedItems, before.packedItems);
  assert.deepEqual(prepared.snapshot.layouts[prepared.layoutId].arrangement, createEmptyLayoutArrangement());
  assert.deepEqual(prepared.snapshot.items, before.items); assert.deepEqual(f.state, before); assert.equal(prepared.source, null);
});

test("layout copies refuse incomplete/cyclic/public sources, target collisions and unconfirmed photos without repairs", () => {
  assert.equal(PERSONAL_PHOTO_LAYOUT_COPY_ENABLED, false);
  for (const mutate of [f => { f.input.targetLayoutId = "bag"; }, f => { f.input.sourceLayoutId = "missing"; },
    f => { f.state.layouts.source.adminDemo = true; }, f => { f.state.containers.pouch.publicCatalogLayoutId = "public"; },
    f => { f.state.layouts.source.arrangement.containers.bag.childIds = []; },
    f => { f.state.layouts.source.arrangement.containers.pouch.childIds = ["bag"]; },
    f => { f.state.layouts.source.arrangement.items.pump = "pouch"; },
    f => { f.state.layouts.source.arrangement.itemQuantities.pump = 0; },
    f => { f.state.layouts.source.arrangement.packedItems.pump = "yes"; },
    f => { f.state.layouts.source.rootContainerIds = ["bag", "bag"]; },
    f => { f.state.items.pump.photos[0].status = "pending"; }, f => { f.state.items.pump.photos[0].listId = "other"; },
    f => { f.options.photoEnabled = false; }]) {
    const f = fixture(true); mutate(f); const before = structuredClone(f.state);
    assert.throws(() => preparePersonalLayoutCopy(f.state, f.input, f.options), { code: "layout-copy-source" });
    assert.deepEqual(f.state, before);
  }
  assert.throws(() => personalLayoutCopyIntent({ type: "layout-copy", version: 1, sourceLayoutId: "source", targetLayoutId: "new", extra: true }));
});

test("the real layout adapter journals once before display/preferences and retains the complete candidate on quota or a stale editor", () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8").match(/function preparePersonalLayoutCopyAction\([^]*?\n\}/)[0];
  for (const mode of ["success", "quota", "stale"]) {
    const f = fixture(true), state = f.state, before = structuredClone(state), values = new Map(), events = [], errors = [];
    let generation = 1;
    const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null,
      setItem: (k, v) => { if (mode === "quota") throw Error("quota"); values.set(k, v); }, removeItem: k => values.delete(k) };
    const recovery = createPersonalSaveRecovery(), outbox = recovery.outbox(() => createPersonalSaveOutbox({ storage, actorId: "actor", scopeKey: "id:actor", listId: "list" }), "id:actor");
    const deps = { state, preparePersonalLayoutCopy, PERSONAL_PHOTO_LAYOUT_COPY_ENABLED: true, personalInitialSaveOutbox: null,
      personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor", modeState: {}, isReadOnlyBikePackingContext: () => false,
      isAdminPublicEditScope: () => false, personalSaveRecovery: recovery,
      personalSaveContext: () => ({ listId: "list", generation }), crypto: { randomUUID }, personalPhotoFormUiEnabled: () => true,
      nowIso: () => f.options.changedAt, currentCreateMeta: f.options.currentCreateMeta, uniqueLayoutName: name => name,
      locations: state.locations, categories: state.categories, showToast: text => events.push(text),
      persistStateSnapshot(snapshot, { personalMutation, operationId }) {
        assert.deepEqual(state, before); events.push("capturing");
        try { outbox.capture({ snapshot, operationId, body: { baseStateRevision: 7,
          payload: cloneStateForSyncPayload(snapshot, { forSync: true }), userLayoutCopy: personalMutation } }); }
        catch (error) { errors.push(error); throw error; }
      }, setActivePrivateScope() {}, applyLayoutArrangement() {}, saveState: options => {
        assert.equal(options.recordAction, false); assert.equal(outbox.recoverSnapshot().activeLayoutId, state.activeLayoutId); events.push("view");
      }, rememberActiveLayoutChoice: id => { assert.equal(outbox.recoverSnapshot().activeLayoutId, id); events.push("preference"); }, render() {} };
    const prepare = new Function(...Object.keys(deps), `return (${source})`)(...Object.values(deps)), commit = prepare(f.input);
    assert.equal(values.size, 0); assert.deepEqual(state, before);
    if (mode === "stale") generation++;
    const result = commit();
    if (mode === "success") {
      assert.match(result, /^layout-[0-9a-f-]{36}$/); assert.equal(values.size, 1);
      assert.deepEqual(events, ["capturing", "view", "preference"]); assert.equal(commit(), false); assert.equal(values.size, 1);
    } else {
      assert.equal(result, false); assert.equal(values.size, 0); assert.deepEqual(state, before);
      if (mode === "quota") { assert.equal(errors[0].code, "quota"); assert.equal(Object.keys(recovery.recoveryCopy(storage).unconfirmedMemoryDraft.layouts).length, 2); }
    }
  }
});

test("a stale local layout copy retains its chosen ID but loses its copy marker after explicit reconciliation", async () => {
  const f = fixture(), values = new Map(), binding = { actorId: "actor", scopeKey: "id:actor", listId: "list", environment: "bike-packing-experiment" };
  const context = { ...binding, scope: "personal", generation: "local-comparison" };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const make = () => createPersonalSaveOutbox({ ...binding, storage }), project = state => cloneStateForSyncPayload(state, { forSync: true });
  const writer = make(); writer.capture({ snapshot: f.state, body: { baseStateRevision: 7, payload: project(f.state) } });
  const stale = make(); stale.recover();
  const chosen = preparePersonalLayoutCopy(f.state, f.input, f.options), newer = structuredClone(f.state); newer.items.pump.weight = 222;
  writer.capture({ snapshot: newer, body: { baseStateRevision: 7, payload: project(newer) } });
  assert.throws(() => stale.capture({ snapshot: chosen.snapshot, body: { baseStateRevision: 7, payload: project(chosen.snapshot), userLayoutCopy: chosen.intent } }), { code: "stale-tab" });
  const original = [...values];
  const reconciled = await stale.reconcileStaleCapture({ getContext: () => context });
  assert.equal(reconciled.action.body.userLayoutCopy, undefined); assert.equal(reconciled.action.body.payload.items.pump.weight, 222);
  assert.deepEqual(reconciled.action.body.payload.layouts[chosen.layoutId], project(chosen.snapshot).layouts[chosen.layoutId]);
  assert.ok(original.every(([key, value]) => values.get(key) === value));
});
