import { createPersonalSaveRecovery } from "../../src/sync/personal-save-recovery.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preparePersonalContainerTreeCopy, personalContainerTreeIntent } from "../../src/sync/personal-container-tree-copy.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { createSubcontainerInLayoutState } from "../../src/state/container-ops.js";
import { normalizeContainerFields } from "../../src/state/normalize.js";
import { cloneStateForSyncPayload } from "../../src/sync/serialize.js";
import { randomUUID } from "node:crypto";
import { preservesConfirmedPersonalPhotoChain } from "../../src/sync/personal-confirmed-photos.js";

function fixture() {
  const source = { rootId: "root", containers: {
    root: { id: "root", name: "Bag", parentId: null, childIds: ["pouch"], itemIds: [], order: [{ type: "container", id: "pouch" }], photos: [] },
    pouch: { id: "pouch", name: "Pouch", parentId: "root", childIds: [], itemIds: ["pump"], order: [{ type: "item", id: "pump" }], photos: [] }
  }, items: { pump: { id: "pump", name: "Pump", containerId: "pouch", quantity: 2, photos: [] } } };
  const empty = () => ({ rootContainerIds: [], containers: {}, items: {}, packedItems: {}, itemQuantities: {} });
  const state = { containers: structuredClone(source.containers), items: structuredClone(source.items), packedItems: {}, collapsedContainers: {},
    layouts: { from: { id: "from", rootContainerIds: [], arrangement: empty() }, to: { id: "to", rootContainerIds: [], arrangement: empty() } } };
  const request = { sourceSnapshot: source, sourceLayoutId: "from", targetLayoutId: "to", targetParentId: "", targetIndex: null };
  const options = { changedAt: "fixed", createId: (kind, id) => `${kind}-copy-${id}` };
  return { source, state, request, options };
}

for (const mode of ["link", "missing"]) test(`confirmed photo tree ${mode} preserves identities, layout quantities and frozen outbox recovery`, async () => {
  const f = fixture();
  for (const owner of [f.state.items.pump, f.state.containers.pouch]) {
    const id = randomUUID(); owner.photos = [{ id, photoId: id, assetId: randomUUID(), listId: "list", status: "synced",
      url: `/photo/${id}`, thumbUrl: `/thumb/${id}`, fileName: "chosen.png", type: "image/png", size: 10, width: 2, height: 2 }];
  }
  f.source.items.pump.photos = structuredClone(f.state.items.pump.photos);
  f.source.containers.pouch.photos = structuredClone(f.state.containers.pouch.photos);
  f.state.items.pump.quantity = 9;
  if (mode === "missing") {
    f.state.layouts.to.rootContainerIds = ["root"];
    f.state.layouts.to.arrangement.rootContainerIds = ["root"];
    f.state.layouts.to.arrangement.containers.root = { parentId: "", childIds: [], itemIds: [], order: [] };
  }
  const before = structuredClone(f.state), original = structuredClone(f.source);
  const options = { ...f.options, photoTreeLinkEnabled: true, listId: "list", createId: () => assert.fail("Existing tree placement allocates no owner IDs") };
  await assert.rejects(preparePersonalContainerTreeCopy(f.state, f.request, { ...options, photoTreeLinkEnabled: false }));
  for (const mutate of [value => { value.items.pump.photos = []; }, value => { value.items.pump.photos[0].status = "pending"; },
    value => { value.containers.pouch.photos[0].assetId = randomUUID(); }, value => { value.containers.pouch.childIds = ["root"]; }]) {
    const corrupt = structuredClone(original); mutate(corrupt);
    await assert.rejects(preparePersonalContainerTreeCopy(f.state, { ...f.request, sourceSnapshot: corrupt }, options));
  }
  const promise = preparePersonalContainerTreeCopy(f.state, f.request, options);
  f.source.items.pump.photos = []; f.source.items.pump.quantity = 999; f.state.items.pump.name = "Later edit";
  const prepared = await promise, selected = prepared[mode];
  assert.equal(prepared.copy, null); assert.ok(selected); assert.equal(selected.intent.mode, mode);
  for (const collection of ["items", "containers"]) for (const id of Object.keys(before[collection])) {
    assert.deepEqual(selected.snapshot[collection][id].photos, before[collection][id].photos);
  }
  assert.equal(selected.snapshot.items.pump.name, before.items.pump.name);
  assert.equal(selected.snapshot.items.pump.quantity, 9);
  assert.equal(selected.snapshot.layouts.to.arrangement.itemQuantities.pump, 2);
  assert.deepEqual(selected.snapshot.layouts.from, before.layouts.from);
  const values = new Map(), storage = { get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const context = { actorId: "actor", listId: "list", scopeKey: "id:actor", environment: "bike-packing-experiment", scope: "personal", generation: "photo-tree" };
  const make = () => createPersonalSaveOutbox({ ...context, storage });
  make().adoptRemoteBaseline({ snapshot: before, payload: before, stateRevision: 1 });
  const saved = make().capture({ snapshot: selected.snapshot, body: { baseStateRevision: 1, payload: selected.snapshot, userContainerTree: selected.intent } });
  const bytes = [...values], calls = [];
  await assert.rejects(make().drain({ getContext: () => context, queue: { run: async action => { calls.push(action); throw Error("Lost tree ACK"); } } }));
  assert.deepEqual([...values], bytes); assert.deepEqual(make().recover(), saved);
  assert.equal(calls.length, 1); assert.equal(calls[0].operationId, saved.action.operationId);
  assert.deepEqual(JSON.parse(calls[0].body), saved.action.body);
  make().markApplied({ operationId: saved.action.operationId, stateRevision: 2 }); make().compact();
  const next = structuredClone(selected.snapshot); next.items.pump.name = "After link";
  const settled = make().capture({ snapshot: next, body: { baseStateRevision: 2, payload: next } });
  make().markApplied({ operationId: settled.action.operationId, stateRevision: 3 }); make().compact();
  const last = structuredClone(next); last.items.pump.note = "Newest fields";
  const pending = make().capture({ snapshot: last, body: { baseStateRevision: 3, payload: last } });
  const chain = { records: make().list(), operationId: pending.action.operationId, listId: "list" };
  assert.equal(preservesConfirmedPersonalPhotoChain(chain), false, "the retained checkpoint can refer to a retired ancestor");
  const boundary = make().confirmedBoundary();
  assert.equal(boundary.operationId, settled.action.operationId); assert.equal(boundary.stateRevision, 3);
  assert.equal(preservesConfirmedPersonalPhotoChain({ ...chain, confirmedBoundary: boundary }), true);
  boundary.payload.items.pump.photos = [];
  assert.equal(preservesConfirmedPersonalPhotoChain({ ...chain, confirmedBoundary: boundary }), false);
  assert.deepEqual(make().confirmedBoundary().payload.items.pump.photos, before.items.pump.photos);
});

test("new child records already have complete reload-stable fields without normalizing existing records", () => {
  const f = fixture(); f.state.locations = ["Bike"];
  f.state.layouts.to.rootContainerIds = ["root"];
  f.state.layouts.to.arrangement.rootContainerIds = ["root"];
  f.state.layouts.to.arrangement.containers.root = { parentId: "", childIds: [], itemIds: [], order: [] };
  const original = structuredClone(f.state.containers.pouch);
  assert.ok(createSubcontainerInLayoutState(f.state, "root", "to", { id: "new-child", name: "New child" }));
  assert.equal(f.state.containers["new-child"].location, "Bike");
  assert.deepEqual(f.state.containers.pouch, original);
  const wire = cloneStateForSyncPayload({ locations: f.state.locations, containers: { "new-child": f.state.containers["new-child"] } }, { forSync: true });
  const reloaded = structuredClone(wire); normalizeContainerFields(reloaded);
  assert.deepEqual(reloaded, wire);
});

test("tree copy assigns every ID and freezes both source and destination before the first async yield", async () => {
  const f = fixture(), original = structuredClone(f.state), pending = preparePersonalContainerTreeCopy(f.state, f.request, f.options);
  f.source.items.pump.name = "Changed after capture"; f.state.containers.root.name = "Live edit";
  const { copy, link } = await pending;
  assert.equal(copy.snapshot.items["item-copy-pump"].name, "Pump");
  assert.equal(copy.snapshot.containers.root.name, original.containers.root.name);
  assert.equal(copy.rootId, "container-copy-root"); assert.equal(link.rootId, "root");
  const layout = copy.snapshot.layouts.to;
  assert.deepEqual(layout.arrangement.rootContainerIds, [copy.rootId]);
  assert.deepEqual(layout.arrangement.containers[copy.rootId].childIds, ["container-copy-pouch"]);
  assert.equal(layout.arrangement.items["item-copy-pump"], "container-copy-pouch");
  assert.equal(layout.arrangement.itemQuantities["item-copy-pump"], 2);
  assert.deepEqual(layout.arrangement.packedItems, {});
  assert.deepEqual(copy.snapshot.layouts.from, original.layouts.from);
  assert.deepEqual(f.state.layouts, original.layouts);
  assert.deepEqual(personalContainerTreeIntent(copy.intent), copy.intent);
  assert.equal(Object.keys(link.snapshot.items).length, 1); assert.equal(Object.keys(link.snapshot.containers).length, 2);
  assert.equal(link.snapshot.layouts.to.arrangement.items.pump, "pouch");
});

test("a duplicate never rewrites source placements; linking an already placed tree is not offered", async () => {
  const f = fixture(); f.state.layouts.to.rootContainerIds = ["root"];
  f.state.layouts.to.arrangement = { rootContainerIds: ["root"], containers: {
    root: { parentId: "", childIds: ["pouch"], itemIds: [], order: [{ type: "container", id: "pouch" }] },
    pouch: { parentId: "root", childIds: [], itemIds: ["pump"], order: [{ type: "item", id: "pump" }] }
  }, items: { pump: "pouch" }, itemQuantities: { pump: 2 }, packedItems: { pump: true } };
  const before = structuredClone(f.state), prepared = await preparePersonalContainerTreeCopy(f.state, f.request, f.options);
  assert.equal(prepared.link, null); assert.deepEqual(f.state, before);
  assert.equal(prepared.copy.snapshot.layouts.to.arrangement.packedItems.pump, true);
  assert.equal(prepared.copy.snapshot.layouts.to.arrangement.packedItems["item-copy-pump"], undefined);
  assert.equal(prepared.copy.snapshot.layouts.to.arrangement.items.pump, "pouch");
});

test("missing-only freezes the exact additions, keeps existing placement/quantity/packed flags and uses no new entity IDs", async () => {
  const f = fixture(); f.state.items.keep = { id: "keep", name: "Keep", quantity: 7 };
  f.state.items.pump.quantity = 9; // source layout snapshot deliberately has 2
  f.state.layouts.to.rootContainerIds = ["root"];
  f.state.layouts.to.arrangement = { rootContainerIds: ["root"], containers: {
    root: { parentId: "", childIds: [], itemIds: ["keep"], order: [{ type: "item", id: "keep" }] }
  }, items: { keep: "root" }, itemQuantities: { keep: 7 }, packedItems: { keep: true }, itemQuantityMigrationVersion: 3 };
  const before = structuredClone(f.state), pending = preparePersonalContainerTreeCopy(f.state, f.request, f.options);
  f.source.items.pump.quantity = 999; f.state.items.keep.name = "Changed while choosing";
  const { missing, link } = await pending;
  assert.equal(link, null); assert.equal(missing.intent.mode, "missing");
  assert.deepEqual(missing.intent.additions, { containers: [{ id: "pouch", parentId: "root" }], items: [{ id: "pump", parentId: "pouch" }] });
  assert.deepEqual(missing.snapshot.items, before.items); assert.deepEqual(missing.snapshot.containers, before.containers);
  assert.deepEqual(missing.snapshot.layouts.from, before.layouts.from);
  const arrangement = missing.snapshot.layouts.to.arrangement;
  assert.deepEqual(arrangement.items, { keep: "root", pump: "pouch" }); assert.deepEqual(arrangement.itemQuantities, { keep: 7, pump: 2 });
  assert.deepEqual(arrangement.packedItems, { keep: true });
  assert.deepEqual(arrangement.containers.root.order, [{ type: "item", id: "keep" }, { type: "container", id: "pouch" }]);
  assert.deepEqual(personalContainerTreeIntent(missing.intent), missing.intent);
  const complete = await preparePersonalContainerTreeCopy(missing.snapshot, { ...f.request, sourceSnapshot: { rootId: "root", containers: before.containers, items: { pump: before.items.pump } } }, f.options);
  assert.equal(complete.missing, null, "already present records never become a new missing-only action");
  for (const change of [value => { value.additions.items[0].id = "unknown"; }, value => { value.additions.containers[0].parentId = "unknown"; },
    value => { value.additions.items.push(value.additions.items[0]); }, value => { value.additions = { containers: [], items: [] }; },
    value => { value.mode = "link"; }]) {
    const corrupt = structuredClone(missing.intent); change(corrupt); assert.throws(() => personalContainerTreeIntent(corrupt));
  }
});

test("invalid trees, photos, missing/locked/public targets and colliding IDs reject without partial state changes", async () => {
  for (const change of [
    f => { f.source.containers.pouch.childIds = ["root"]; },
    f => { f.source.containers.root.childIds.push("pouch"); },
    f => { f.source.containers.root.order.push({ type: "item", id: "missing" }); },
    f => { f.source.items.pump.photos = [{ id: "file" }]; },
    f => { f.source.items.pump.availabilityStatus = "lost"; },
    f => { f.source.items.pump.containerId = "other"; },
    f => { f.source.items.orphan = { id: "orphan" }; },
    f => { delete f.state.items.pump; },
    f => { f.state.layouts.to.locked = true; },
    f => { f.state.layouts.to.adminDemo = true; },
    f => { f.request.targetParentId = "missing"; },
    f => { f.request.targetIndex = -1; },
    f => { f.options.createId = () => "root"; },
    f => { f.options.createId = () => "same"; }
  ]) {
    const f = fixture(); change(f); const before = structuredClone(f.state);
    await assert.rejects(preparePersonalContainerTreeCopy(f.state, f.request, f.options)); assert.deepEqual(f.state, before);
  }
});

test("prepared tree copy and placement survive outbox reload/lost ACK as a single unchanged action", async () => {
  const f = fixture(), { copy } = await preparePersonalContainerTreeCopy(f.state, f.request, f.options), values = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const context = { actorId: "actor", listId: "list", scopeKey: "id:actor", environment: "bike-packing-experiment", scope: "personal", generation: "captured" };
  const make = () => createPersonalSaveOutbox({ storage, ...context }), saved = make().capture({ snapshot: copy.snapshot,
    body: { baseStateRevision: 1, payload: copy.snapshot, userContainerTree: copy.intent } });
  const bytes = [...values], calls = [];
  await assert.rejects(make().drain({ getContext: () => context, queue: { run: async input => { calls.push(input); throw Error("lost ACK"); } } }));
  assert.deepEqual([...values], bytes); assert.deepEqual(make().recover(), saved);
  assert.equal(calls[0].operationId, saved.action.operationId); assert.deepEqual(JSON.parse(calls[0].body).userContainerTree, copy.intent);
});

test("real tree adapter guards asynchronous preparation and confirmation, capacity and single durable capture", async () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8").match(/async function preparePersonalContainerTreeAction\([^]*?\n\}/)[0];
  const make = () => {
    const issued = [];
    const f = fixture(), saved = [], values = new Map(), messages = [], counts = [];
    const storage = { get length() { return values.size; }, key: i => [...values.keys()][i],
      getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const recovery = createPersonalSaveRecovery(), outbox = recovery.outbox(() => createPersonalSaveOutbox({ storage, actorId: "actor", listId: "list", scopeKey: "id:actor" }), "id:actor");
    let actorId = "actor", generation = 1, capacity = true, blocked = false;
    const deps = { crypto: { randomUUID() { const id = crypto.randomUUID(); issued.push(id); return id; } }, state: f.state, preparePersonalContainerTreeCopy, personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor",
      isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, modeState: {}, uiLanguage: "ru",
      personalSaveRecovery: { assertRunning() { if (blocked) throw Error("recovery blocked"); recovery.assertRunning(); } }, personalSaveContext: () => ({ actorId, generation }),
      showToast: message => messages.push(message), requireUsageCapacity: (type, count) => { counts.push([type, count]); return capacity; },
      nowIso: () => "fixed", currentEditMeta: () => ({}), markEdited() {}, normalizeContainerColor: value => value,
      normalizeItemPhotos: record => record.photos || [], makeContainerCopyNameForLayout: name => `${name} copy`, applyLayoutArrangement() {},
      persistStateSnapshot: (snapshot, { personalMutation, operationId }) => saved.push(outbox.capture({ snapshot, operationId,
        body: { baseStateRevision: 1, payload: snapshot, userContainerTree: personalContainerTreeIntent(personalMutation) } })),
      saveState: options => { assert.equal(options.recordAction, false); assert.deepEqual(outbox.recoverSnapshot().layouts, f.state.layouts); } };
    const prepare = new Function(...Object.keys(deps), `return (${source})`)(...Object.values(deps));
    return { ...f, saved, storage, values, messages, counts, prepare, issued, outbox, recovery,
      changeActor: () => { actorId = "other"; }, changeEditor: () => { generation++; }, exhaust: () => { capacity = false; }, block: () => { blocked = true; } };
  };
  const f = make(), confirm = await f.prepare(f.request);
  assert.equal(f.saved.length, 0); assert.equal(Object.keys(f.state.containers).length, 2);
  const idsBeforeConfirmation = [...f.issued]; assert.ok(idsBeforeConfirmation.length);
  const copiedId = confirm("copy");
  assert.equal(f.outbox.recover().action.operationId, idsBeforeConfirmation[0]); assert.deepEqual(f.issued, idsBeforeConfirmation); assert.equal(typeof copiedId, "string"); assert.equal(confirm("copy"), false);
  assert.equal(f.saved.length, 1); assert.equal(f.values.size, 1); assert.equal(Object.keys(f.saved[0].snapshot.containers).length, 4);
  assert.deepEqual(f.counts, [["containers", 2], ["items", 1]]);
  for (const change of ["changeActor", "changeEditor"]) {
    const during = make(), pending = during.prepare(during.request); during[change]();
    assert.equal(await pending, false); assert.equal(during.values.size, 0);
  }
  for (const change of ["changeActor", "changeEditor", "exhaust"]) {
    const later = make(), attempt = await later.prepare(later.request); later[change]();
    assert.equal(attempt("copy"), false); assert.equal(later.values.size, 0); assert.equal(Object.keys(later.state.containers).length, 2);
  }
  const unsupported = make(), choose = await unsupported.prepare(unsupported.request);
  assert.equal(choose("copy-missing-local"), false); assert.equal(unsupported.values.size, 0);
  assert.equal(choose("link"), "root"); assert.equal(Object.keys(unsupported.state.containers).length, 2);
  const blocked = make(), blockedAttempt = await blocked.prepare(blocked.request); blocked.block();
  assert.throws(() => blockedAttempt("copy"), /recovery blocked/); assert.equal(blocked.values.size, 0);
  const quota = make(), attempt = await quota.prepare(quota.request);
  quota.storage.setItem = () => { throw Error("quota"); };
  assert.equal(attempt("copy"), false); assert.equal(quota.values.size, 0);
  assert.equal(Object.keys(quota.state.containers).length, 2);
  const draft = quota.recovery.recoveryCopy(quota.storage).unconfirmedMemoryDraft;
  assert.equal(Object.keys(draft.containers).length, 4); assert.equal(Object.keys(draft.items).length, 2);
  assert.equal(Object.keys(quota.state.items).length, 1); assert.equal(attempt("copy"), false);
});
