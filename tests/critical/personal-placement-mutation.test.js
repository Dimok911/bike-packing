import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preparePersonalPlacementMutation, personalPlacementIntent, reducePersonalPlacementReference } from "../../src/sync/personal-placement-mutation.js";
import { personalDeletionReference, preservesUndeletedEntities } from "../../src/sync/personal-deletion-intent.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { applyLayoutArrangementToState, createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";
import { normalizeLayoutArrangement } from "../../src/state/layout-normalize.js";
import { repairContainerMembershipFromItemLinks } from "../../src/state/repair.js";
import { installRuntimeActiveLayoutId } from "../../src/state/active-layout-runtime.js";

const initial = () => ({ activeLayoutId: "l", packedItems: { a: true, b: true }, showOnlyUnpacked: true, collapsedContainers: {},
  items: { a: { id: "a", containerId: "bag" }, b: { id: "b", containerId: "pocket" } },
  containers: { bag: { id: "bag", parentId: null, childIds: ["pocket"], itemIds: ["a"], order: [] },
    pocket: { id: "pocket", parentId: "bag", childIds: [], itemIds: ["b"], order: [] } },
  layouts: { l: { id: "l", rootContainerIds: ["bag"], arrangement: { rootContainerIds: ["bag"],
    containers: { bag: { parentId: "", childIds: ["pocket"], itemIds: ["a"], order: [{ type: "item", id: "a" }, { type: "container", id: "pocket" }] },
      pocket: { parentId: "bag", childIds: [], itemIds: ["b"], order: [{ type: "item", id: "b" }] } },
    items: { a: "bag", b: "pocket" }, itemQuantities: { a: 3, b: 2 }, packedItems: { a: true, b: true } } } } });

test("packing marks are explicit values and unpack freezes the exact set without moving records", () => {
  const state = initial(), before = structuredClone(state);
  const unpack = preparePersonalPlacementMutation(state, { layoutId: "l", action: "unpack-all", ids: ["a", "b"] });
  assert.deepEqual(state, before); assert.deepEqual(unpack.snapshot.packedItems, {}); assert.equal(unpack.snapshot.showOnlyUnpacked, false);
  assert.deepEqual(unpack.snapshot.layouts.l.arrangement.itemQuantities, { a: 3, b: 2 });
  assert.equal(unpack.intent.action, "set-packed"); assert.equal(unpack.intent.packed, false); assert.deepEqual(unpack.intent.ids, ["a", "b"]);
  const pack = preparePersonalPlacementMutation(unpack.snapshot, { layoutId: "l", action: "set-packed", ids: ["a"], packed: true });
  assert.deepEqual(pack.snapshot.packedItems, { a: true }); assert.equal(pack.intent.packed, true);
});

test("removing a root retains items and the root, deletes only unused pockets and records exact removed links", () => {
  const state = initial(), before = structuredClone(state);
  const { snapshot, intent } = preparePersonalPlacementMutation(state, { layoutId: "l", action: "remove-container", ids: ["bag"] });
  assert.deepEqual(state, before); assert.deepEqual(Object.keys(snapshot.items), ["a", "b"]); assert.deepEqual(Object.keys(snapshot.containers), ["bag"]);
  assert.deepEqual(snapshot.layouts.l.arrangement.rootContainerIds, []); assert.deepEqual(snapshot.layouts.l.arrangement.items, {});
  assert.deepEqual(intent.removedItemIds, ["a", "b"]); assert.deepEqual(intent.removedContainerIds, ["bag", "pocket"]); assert.deepEqual(intent.deletedContainerIds, ["pocket"]);
  const reference = personalDeletionReference(state, [{ action: { body: { payload: snapshot, userPlacement: intent } } }]);
  assert.deepEqual(reference.layouts.l.arrangement.items, {}); assert.equal(reference.items.a.containerId, "");
  assert.equal(preservesUndeletedEntities(snapshot, reference), true);
  assert.equal(preservesUndeletedEntities({ ...snapshot, items: {} }, reference), false);
  assert.equal(preservesUndeletedEntities({ ...snapshot, layouts: {} }, reference), false);
});

test("a pocket still used elsewhere and detachable bags keep their entities; photos abort actual deletion", () => {
  for (const mode of ["used-elsewhere", "detachable", "photo"]) {
    const state = initial();
    if (mode === "used-elsewhere") state.layouts.other = { ...structuredClone(state.layouts.l), id: "other" };
    if (mode === "detachable") state.containers.pocket.nestable = true;
    if (mode === "photo") state.containers.pocket.photos = [{ id: "retain-file" }];
    const before = structuredClone(state), prepare = () => preparePersonalPlacementMutation(state, { layoutId: "l", action: "remove-container", ids: ["bag"] });
    if (mode === "photo") assert.throws(prepare, /фото/);
    else { const result = prepare(); assert.ok(result.snapshot.containers.pocket); assert.deepEqual(result.intent.deletedContainerIds, []); }
    assert.deepEqual(state, before);
  }
});

test("item removal drops only its placement, quantity and mark; changed selection and forged deltas fail closed", () => {
  const state = initial(), request = { layoutId: "l", action: "remove-item", ids: ["a"] };
  const { snapshot, intent } = preparePersonalPlacementMutation(state, request);
  assert.ok(snapshot.items.a); assert.equal(snapshot.layouts.l.arrangement.items.a, undefined);
  assert.equal(snapshot.layouts.l.arrangement.itemQuantities.a, undefined); assert.equal(snapshot.packedItems.a, undefined);
  assert.equal(snapshot.layouts.l.arrangement.items.b, "pocket");
  for (const patch of [{ ids: ["missing"] }, { ids: ["a", "a"] }, { layoutId: "other" }, { action: "unknown" }]) {
    assert.throws(() => preparePersonalPlacementMutation(state, { ...request, ...patch }));
  }
  assert.throws(() => reducePersonalPlacementReference(structuredClone(state), intent, state), /Снимок/);
  assert.throws(() => personalPlacementIntent({ ...intent, deletedContainerIds: ["unrelated"] }));
  assert.throws(() => personalPlacementIntent({ ...intent, action: "set-packed", packed: false }));
});

test("moves and grouping freeze destinations, order, existing owners and quantities without changing other layouts", () => {
  let state = initial();
  state.containers.otherbag = { id: "otherbag", parentId: null, childIds: [], itemIds: [], order: [] };
  state.layouts.l.rootContainerIds.push("otherbag"); state.layouts.l.arrangement.rootContainerIds.push("otherbag");
  state.layouts.l.arrangement.containers.otherbag = { parentId: "", childIds: [], itemIds: [], order: [] };
  state.layouts.other = { ...structuredClone(state.layouts.l), id: "other" };
  const other = structuredClone(state.layouts.other), items = Object.keys(state.items);
  const run = request => {
    const before = structuredClone(state), result = preparePersonalPlacementMutation(state, { layoutId: "l", ...request });
    assert.deepEqual(state, before); assert.deepEqual(result.intent.removedItemIds, []); assert.deepEqual(result.intent.deletedContainerIds, []);
    assert.deepEqual(result.snapshot.layouts.other, other); assert.deepEqual(Object.keys(result.snapshot.items), items);
    state = result.snapshot; return result;
  };
  const item = run({ action: "move-item", ids: ["a"], targetContainerId: "otherbag", targetIndex: 0 });
  assert.equal(item.intent.targetContainerId, "otherbag"); assert.equal(state.layouts.l.arrangement.items.a, "otherbag");
  assert.equal(state.layouts.l.arrangement.itemQuantities.a, 3);
  run({ action: "move-container", ids: ["pocket"], targetContainerId: "otherbag", targetIndex: 0 });
  assert.equal(state.layouts.l.arrangement.containers.pocket.parentId, "otherbag");
  run({ action: "move-root", ids: ["otherbag"], targetIndex: 0 });
  assert.deepEqual(state.layouts.l.rootContainerIds, ["otherbag", "bag"]);
  const grouped = run({ action: "group-items", ids: ["a", "b"], groupId: "group-fixed" });
  assert.equal(grouped.intent.groupId, "group-fixed");
  assert.deepEqual(state.layouts.l.arrangement.items, { a: "group-fixed", b: "group-fixed" });
  assert.deepEqual(state.layouts.l.arrangement.itemQuantities, { a: 3, b: 2 });
  assert.ok(state.containers["group-fixed"]); assert.equal(state.layouts.l.arrangement.containers["group-fixed"].parentId, "pocket");
});

test("invalid move/group target, cycle, collision or index leaves the whole source untouched", () => {
  const state = initial(), before = structuredClone(state);
  for (const request of [
    { action: "move-item", ids: ["a"], targetContainerId: "unknown" },
    { action: "move-container", ids: ["bag"], targetContainerId: "pocket" },
    { action: "move-container", ids: ["pocket"], targetContainerId: "pocket" },
    { action: "move-root", ids: ["pocket"], targetIndex: 0 },
    { action: "move-root", ids: ["bag"], targetIndex: -1 },
    { action: "move-item", ids: ["a"], targetContainerId: "pocket", targetIndex: 0.5 },
    { action: "group-items", ids: ["a", "a"], groupId: "new" },
    { action: "group-items", ids: ["a", "b"], groupId: "bag" }
  ]) { assert.throws(() => preparePersonalPlacementMutation(state, { layoutId: "l", ...request })); assert.deepEqual(state, before); }
});

test("frozen replacements preserve quantities, children and owners; a detachable pocket can become one root", () => {
  const state = initial();
  state.items.replacement = { id: "replacement", containerId: "" };
  state.containers.replacement = { id: "replacement", nestable: true, parentId: null, childIds: [], itemIds: [], order: [] };
  state.layouts.other = { ...structuredClone(state.layouts.l), id: "other" };
  const original = structuredClone(state);
  const item = preparePersonalPlacementMutation(state, { layoutId: "l", action: "replace-item", ids: ["a"], replacementId: "replacement" });
  assert.equal(item.snapshot.layouts.l.arrangement.items.a, undefined); assert.equal(item.snapshot.layouts.l.arrangement.items.replacement, "bag");
  assert.equal(item.snapshot.layouts.l.arrangement.itemQuantities.replacement, 3);
  assert.deepEqual(item.intent.removedItemIds, ["a"]); assert.equal(item.intent.replacementId, "replacement");
  assert.ok(item.snapshot.items.a); assert.deepEqual(item.snapshot.layouts.other, original.layouts.other);
  const bag = preparePersonalPlacementMutation(state, { layoutId: "l", action: "replace-container", ids: ["bag"], replacementId: "replacement" });
  assert.equal(bag.snapshot.layouts.l.arrangement.items.a, "replacement"); assert.equal(bag.snapshot.layouts.l.arrangement.containers.pocket.parentId, "replacement");
  assert.deepEqual(bag.snapshot.layouts.l.rootContainerIds, ["replacement"]); assert.ok(bag.snapshot.containers.bag);
  const sharedPocket = preparePersonalPlacementMutation(state, { layoutId: "l", action: "replace-container", ids: ["pocket"], replacementId: "replacement" });
  assert.ok(sharedPocket.snapshot.containers.pocket, "other layout still owns a placement");
  const unique = structuredClone(state); delete unique.layouts.other;
  const pocket = preparePersonalPlacementMutation(unique, { layoutId: "l", action: "replace-container", ids: ["pocket"], replacementId: "replacement" });
  assert.equal(pocket.snapshot.containers.pocket, undefined); assert.deepEqual(pocket.intent.deletedContainerIds, ["pocket"]);
  assert.equal(pocket.snapshot.layouts.l.arrangement.itemQuantities.b, 2); assert.ok(pocket.snapshot.items.b);
  unique.containers.pocket.nestable = true;
  const lift = preparePersonalPlacementMutation(unique, { layoutId: "l", action: "lift-container", ids: ["pocket"], targetIndex: 0 });
  assert.deepEqual(lift.snapshot.layouts.l.rootContainerIds, ["pocket", "bag"]); assert.equal(lift.snapshot.layouts.l.arrangement.items.b, "pocket");
  assert.deepEqual(lift.snapshot.layouts.l.arrangement.itemQuantities, { a: 3, b: 2 });
  assert.deepEqual(state, original);
});

test("invalid replacements and file-owning temporary pocket abort the whole frozen change", () => {
  const state = initial(); state.items.next = { id: "next" }; state.containers.next = { id: "next", nestable: true };
  for (const request of [
    { action: "replace-item", ids: ["a"], replacementId: "b" },
    { action: "replace-item", ids: ["a"], replacementId: "a" },
    { action: "replace-container", ids: ["bag"], replacementId: "pocket" },
    { action: "replace-container", ids: ["pocket"], replacementId: "missing" },
    { action: "lift-container", ids: ["pocket"], targetIndex: 0 },
  ]) { const before = structuredClone(state); assert.throws(() => preparePersonalPlacementMutation(state, { layoutId: "l", ...request })); assert.deepEqual(state, before); }
  state.containers.pocket.photos = [{ id: "file" }]; const before = structuredClone(state);
  assert.throws(() => preparePersonalPlacementMutation(state, { layoutId: "l", action: "replace-container", ids: ["pocket"], replacementId: "next" }), /фото/);
  assert.deepEqual(state, before);
});

test("actual placement confirmation is single-use, binds the active layout and preserves its complete draft on quota", () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8").match(/function preparePersonalPlacementAction\([^]*?\n\}/)[0];
  const make = () => {
    const state = installRuntimeActiveLayoutId(initial(), "l"), values = new Map(), events = [];
    const storage = { get length() { return values.size; }, key: index => [...values.keys()][index],
      getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const makeOutbox = () => createPersonalSaveOutbox({ storage, actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" });
    const outbox = makeOutbox(); let generation = 1;
    const deps = { state, preparePersonalPlacementMutation, personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor-a",
      isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, modeState: {}, personalSaveRecovery: { assertRunning() {} },
      warnLockedLayoutMutation: () => false, personalSaveContext: () => ({ generation }), nowIso: () => "fixed", markEdited() {},
      normalizeItemPhotos: record => record.photos || [], localText: (en, ru) => ru, showToast: message => events.push(message),
      applyLayoutArrangement: layoutId => applyLayoutArrangementToState(state, layoutId, {
        normalizeLayoutArrangement, repairContainerMembershipFromItemLinks, migrateContainerOrder() {}
      }), saveState: ({ personalMutation }) => {
        const layout = state.layouts[state.activeLayoutId];
        layout.arrangement = createLayoutArrangementFromCurrentState(state, layout.rootContainerIds, { itemQuantities: layout.arrangement.itemQuantities });
        outbox.capture({ snapshot: state, body: { payload: state, baseStateRevision: 1, userPlacement: personalMutation } }); events.push("durable");
      } };
    const prepare = new Function(...Object.keys(deps), `return (${source})`)(...Object.values(deps));
    return { state, values, storage, events, prepare, makeOutbox, change: () => { generation++; } };
  };
  const f = make(), request = { layoutId: "l", action: "remove-container", ids: ["bag"] }, confirm = f.prepare(request);
  request.ids[0] = "changed"; assert.equal(f.values.size, 0); assert.equal(confirm(), true); assert.equal(confirm(), false);
  assert.deepEqual(Object.keys(f.makeOutbox().recoverSnapshot().containers), ["bag"]); assert.equal(f.events[0], "durable");
  const marks = make(); assert.equal(marks.prepare({ layoutId: "l", action: "unpack-all", ids: ["a", "b"] })(), true);
  assert.deepEqual(marks.makeOutbox().recoverSnapshot().layouts.l.arrangement.packedItems, {}); assert.equal(marks.state.showOnlyUnpacked, false);
  assert.equal(marks.prepare({ layoutId: "l", action: "set-packed", ids: ["a"], packed: true })(), true);
  assert.deepEqual(marks.makeOutbox().recoverSnapshot().layouts.l.arrangement.packedItems, { a: true });
  assert.deepEqual(marks.makeOutbox().recoverSnapshot().layouts.l.arrangement.itemQuantities, { a: 3, b: 2 });
  for (const mode of ["editor", "layout"]) {
    const stale = make(), old = stale.prepare({ layoutId: "l", action: "unpack-all", ids: ["a", "b"] });
    if (mode === "editor") stale.change(); else stale.state.activeLayoutId = "other";
    assert.equal(old(), false); assert.equal(stale.values.size, 0); assert.deepEqual(stale.state.packedItems, { a: true, b: true });
  }
  const quota = make(), failed = quota.prepare({ layoutId: "l", action: "remove-container", ids: ["bag"] });
  quota.storage.setItem = () => { throw Error("quota"); }; assert.throws(failed, { code: "quota" });
  assert.equal(quota.values.size, 0); assert.deepEqual(Object.keys(quota.state.items), ["a", "b"]);
  assert.deepEqual(quota.state.layouts.l.arrangement.items, {}); assert.deepEqual(quota.events, []);
});
