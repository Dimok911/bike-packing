import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { recoverPendingPersonalSaveBeforeLoad as recover } from "../../src/sync/personal-pending-startup.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { preparePersonalPlacementMutation } from "../../src/sync/personal-placement-mutation.js";
import { personalBusinessPayload } from "../../src/sync/personal-business-payload.js";

const binding = { environment: "bike-packing-experiment", actorId: "startup-user", scopeKey: "id:startup-user", listId: "startup-list" };
const context = () => ({ ...binding, scope: "personal", generation: "original-editor" });
const clone = structuredClone;
const unexpected = () => assert.fail("unexpected startup path");

function fixture() {
  const values = new Map(), events = [], current = context();
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = () => createPersonalSaveOutbox({ storage, ...binding });
  const capture = make();
  let snapshot = { activeLayoutId: "layout", locations: [], categories: [], items: {}, packedItems: {},
    containers: Object.fromEntries(["first", "second", "third"].map(id => [id, { id, name: id, parentId: null, childIds: [], itemIds: [], order: [],
      photos: id === "first" ? [{ id: "old-photo", listId: binding.listId, status: "synced", height: 1, width: 1, updatedAt: null,
        url: `https://api.vniipo-help.ru/experiment/letters-vniipo/api/bike-packing/lists/${binding.listId}/photos/old-photo/file`,
        thumbUrl: `https://api.vniipo-help.ru/experiment/letters-vniipo/api/bike-packing/lists/${binding.listId}/photos/old-photo/thumb` }] : [] }])),
    layouts: { layout: { id: "layout", name: "Local layout", rootContainerIds: [],
      arrangement: { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {}, itemQuantityMigrationVersion: 3 } } } };
  const records = ["first", "second", "third"].map((id, index) => {
    const prepared = preparePersonalPlacementMutation(snapshot, { action: "link-root", layoutId: "layout", ids: [id], targetIndex: index, includeContents: true });
    snapshot = prepared.snapshot;
    return capture.capture({ snapshot, body: { payload: personalBusinessPayload(snapshot), baseStateRevision: 1582, userPlacement: prepared.intent } });
  });
  const outbox = make(), before = [...values];
  const options = { enabled: true, getContext: () => current, hasPending: () => outbox.hasPending(),
    onPending: error => events.push({ type: "pending", error }), resume: unexpected };
  return { current, outbox, make, records, values, before, events, options };
}

test("cold startup drains all three retained baseless placement actions with exact original UUIDs and bodies", async () => {
  const f = fixture(), calls = [];
  assert.equal(f.records.length, 3);
  assert.ok(f.records.every(record => record.mergeBase === undefined && record.action.body.baseStateRevision === 1582));
  assert.equal(f.records[1].action.body.causal.baseOperationId, f.records[0].action.operationId);
  assert.equal(f.records[2].action.body.causal.baseOperationId, f.records[1].action.operationId);
  const latest = f.records.at(-1);
  const canLoad = await recover({ ...f.options, resume: () => f.outbox.drain({ getContext: () => f.current,
    queue: { async run(request) { calls.push(clone(request)); return { stateRevision: 1585 }; } },
    onConfirmed(result, record) {
      assert.equal(record.action.operationId, latest.action.operationId);
      f.outbox.markApplied({ operationId: record.action.operationId, stateRevision: result.stateRevision });
    }
  }) });
  assert.equal(canLoad, true); assert.equal(f.outbox.hasPending(), false); assert.deepEqual(f.events, []);
  assert.deepEqual(calls.map(call => call.operationId), [...f.records.map(record => record.action.operationId), latest.action.operationId]);
  for (const call of calls) assert.deepEqual(JSON.parse(call.body), f.records.find(record => record.action.operationId === call.operationId).action.body);
  assert.deepEqual(f.outbox.list(), f.records);
  for (const [key, raw] of f.before) assert.equal(f.values.get(key), raw, "no rewriting retained action bytes");
});

test("known committed receipts can settle after reload without posting the original actions again", async () => {
  const f = fixture(), reads = [], receipts = new Map(f.records.map((record, index) => [record.action.operationId, { stateRevision: 1583 + index }]));
  const queue = { async run(request) {
    reads.push(request.operationId); const receipt = receipts.get(request.operationId);
    assert.ok(receipt, "only original retained receipt IDs are allowed"); return receipt;
  } };
  assert.equal(await recover({ ...f.options, resume: () => f.outbox.drain({ queue, getContext: () => f.current,
    onConfirmed: (receipt, record) => f.outbox.markApplied({ operationId: record.action.operationId, stateRevision: receipt.stateRevision }) }) }), true);
  assert.equal(f.make().confirmedBase().stateRevision, 1585);
  assert.deepEqual(reads, [...f.records.map(record => record.action.operationId), f.records.at(-1).action.operationId]);
  assert.deepEqual(f.outbox.list(), f.records);
});

for (const status of ["unknown", "rejected", "unavailable"]) test(`a handled ${status} save remains local and cannot authorize the full loader`, async () => {
  const f = fixture(); let resumed = 0;
  const allowed = await recover({ ...f.options, resume: async () => { resumed++; return { status, ok: true }; } });
  assert.equal(allowed, false); assert.equal(resumed, 1); assert.equal(f.events.length, 1);
  assert.equal(f.events[0].type, "pending"); assert.deepEqual([...f.values], f.before);
});

test("thrown save/refusal errors never fall through to replacement even if the queue state changed", async () => {
  for (const clear of [false, true]) {
    const f = fixture(), error = Error("Exact receipt unavailable");
    assert.equal(await recover({ ...f.options, resume: async () => {
      if (clear) f.outbox.markApplied({ operationId: f.records.at(-1).action.operationId, stateRevision: 1585 });
      throw error;
    } }), false);
    assert.equal(f.events[0].error, error);
  }
});

test("OFF, guest and already settled startup never initiate a pending save", async () => {
  assert.equal(await recover({ enabled: false, getContext: unexpected, hasPending: unexpected, resume: unexpected }), true);
  assert.equal(await recover({ enabled: true, getContext: () => ({ ...context(), scope: "readonly" }), hasPending: unexpected, resume: unexpected }), false);
  assert.equal(await recover({ enabled: true, getContext: context, hasPending: () => false, resume: unexpected }), true);
  assert.equal(await recover({ enabled: true, getContext: () => ({ ...context(), listId: "" }), hasPending: () => false, resume: unexpected }), true);
});

for (const [field, next] of [["actorId", "other"], ["scopeKey", "id:other"], ["scope", "readonly"], ["listId", "other-list"], ["environment", "production"]])
  test(`changed ${field} during save prevents both old loading and warnings in the new scope`, async () => {
    const f = fixture();
    assert.equal(await recover({ ...f.options, resume: async () => { await Promise.resolve(); f.current[field] = next; } }), false);
    assert.deepEqual(f.events, []); assert.deepEqual([...f.values], f.before);
  });

test("the saver may confirm a reconciled editor generation, but an additional pending local action still blocks loading", async () => {
  const f = fixture();
  assert.equal(await recover({ ...f.options, resume: async () => {
    f.outbox.markApplied({ operationId: f.records.at(-1).action.operationId, stateRevision: 1585 });
    f.current.generation = "confirmed-editor";
  } }), true);
  const g = fixture();
  assert.equal(await recover({ ...g.options, resume: async () => {
    g.outbox.markApplied({ operationId: g.records.at(-1).action.operationId, stateRevision: 1585 });
    const snapshot = clone(g.records.at(-1).snapshot); snapshot.containers.first.name = "newer edit";
    g.outbox.capture({ snapshot, body: { payload: personalBusinessPayload(snapshot), baseStateRevision: 1585 } });
    g.current.generation = "newer-editor";
  } }), false);
  assert.equal(g.events.length, 1); assert.equal(g.outbox.hasPending(), true);
});

test("asynchronous or nonboolean pending readers cannot skip the recovery barrier", async () => {
  for (const hasPending of [async () => false, () => undefined, () => "false"])
    await assert.rejects(recover({ enabled: true, getContext: context, hasPending, resume: unexpected }));
});

test("validated pending view is announced before the remote save settles without confirming or altering it", async () => {
  const f = fixture(); let release, announced = 0, resumed = false;
  const gate = new Promise(resolve => { release = resolve; });
  const loading = recover({ ...f.options,
    onCheckingPending: () => { announced++; assert.equal(resumed, false); },
    resume: async () => { resumed = true; await gate; } });
  assert.equal(announced, 1); assert.equal(resumed, true);
  assert.equal(f.outbox.hasPending(), true); assert.deepEqual([...f.values], f.before);
  assert.deepEqual(f.events, []);
  release(); assert.equal(await loading, false); assert.equal(f.events[0].type, "pending");
});

test("showing the pending view cannot resume work after the owner changes", async () => {
  const f = fixture();
  assert.equal(await recover({ ...f.options,
    onCheckingPending: () => { f.current.actorId = "another-user"; }, resume: unexpected }), false);
  assert.deepEqual(f.events, []); assert.deepEqual([...f.values], f.before);
});

test("pending visibility never runs for disabled, readonly or already settled loading", async () => {
  for (const options of [{ enabled: false }, { getContext: () => ({ ...context(), scope: "readonly" }) }, { hasPending: () => false }]) {
    const f = fixture();
    await recover({ ...f.options, ...options, onCheckingPending: unexpected, resume: unexpected });
    assert.deepEqual([...f.values], f.before);
  }
});

test("an asynchronous visibility callback stops before any remote resume", async () => {
  const f = fixture();
  await assert.rejects(recover({ ...f.options, onCheckingPending: async () => {}, resume: unexpected }));
  assert.deepEqual([...f.values], f.before);
});

function appFixture({ pending = true, photoFailure = null } = {}) {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8").match(/async function loadRemoteState\([^]*?\n\}/)?.[0];
  assert.ok(source);
  const events = [], scope = {};
  // Use the actual app entry function; provide unused ordinary-load dependencies
  // without replacing the pending branch or its shared promise ownership.
  for (const [, name] of source.matchAll(/^\s{6}([A-Za-z]\w*),?$/gm)) scope[name] = () => {};
  Object.assign(scope, { currentUser: { id: binding.actorId }, localStorageScopeKey: binding.scopeKey, currentPackingListId: binding.listId,
    remoteStateLoadPromise: null, modeState: {}, appUnlocked: false, initialRemoteLoadPending: true,
    recoverPendingPersonalSaveBeforeLoad: recover,
    refreshPersonalJournal: async scopeKey => { assert.equal(scopeKey, binding.scopeKey); },
    checkPersonalPhotoRecoveryBeforeLoad: async () => { events.push("photo-check"); if (photoFailure) throw photoFailure; },
    personalSavePilotEnabled: () => true, isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false,
    isSharedListLinkRoute: () => false, personalSaveContext: () => ({ ...context(), actorId: scope.currentUser.id,
      scopeKey: scope.localStorageScopeKey, listId: scope.currentPackingListId }),
    hasPendingPersonalSave: () => pending,
    saveRemoteState: async options => { events.push(["resume", options.notify]); pending = false; },
    loadRemoteStateFlow: async () => { assert.equal(pending, false); events.push("normal-load"); return "loaded"; },
    renderInitialLocalFallbackIfNeeded: () => { events.push("local-fallback"); scope.initialRemoteLoadPending = false; },
    document: {}, renderBeforeFinishingAppStartup: ({ render }) => { render(); events.push("startup-ready"); },
    setLayoutLoadStatus: (tone, text) => events.push([tone, text]), updateSyncUi: text => events.push(["sync-ui", text]),
    localText: (en, ru) => ru });
  const vm = createContext(scope); runInContext(source, vm);
  return { scope, events, load: options => vm.loadRemoteState(options) };
}

test("actual app entry settles the pending queue before normal load and shares one resume across concurrent startup calls", async () => {
  const f = appFixture(); let release;
  const gate = new Promise(resolve => { release = resolve; }), original = f.scope.saveRemoteState;
  f.scope.saveRemoteState = async options => { await gate; return original(options); };
  const first = f.load(), second = f.load(); await Promise.resolve(); release();
  assert.deepEqual(await Promise.all([first, second]), ["loaded", "loaded"]);
  assert.equal(f.events.filter(event => event === "photo-check").length, 2);
  assert.equal(f.events.filter(event => event === "normal-load").length, 1);
  assert.equal(f.events.filter(event => Array.isArray(event) && event[0] === "resume").length, 1);
  assert.equal(f.scope.remoteStateLoadPromise, null);
});

test("actual app entry displays a pending warning after a handled refusal and never reports the replacement-loader error", async () => {
  const f = appFixture(); f.scope.saveRemoteState = async () => { f.events.push("handled-refusal"); };
  assert.equal(await f.load(), false);
  assert.equal(f.events.includes("normal-load"), false);
  const warning = f.events.find(event => Array.isArray(event) && event[0] === "warning");
  assert.match(warning[1], /Сохранённые изменения ждут подтверждения/);
  assert.doesNotMatch(JSON.stringify(f.events), /Сервер недоступен|Замена локальной версии/);
  assert.equal(f.scope.remoteStateLoadPromise, null);
});

test("actual app entry preserves the photo-recovery stop without a plain-save or server-load fallback", async () => {
  const failure = Error("Retained photo actions need explicit recovery"), f = appFixture({ photoFailure: failure });
  await assert.rejects(f.load(), error => error === failure);
  assert.deepEqual(f.events, ["photo-check"]);
});

test("actual app entry does not apply old pending recovery to a newly selected account/list", async () => {
  const f = appFixture();
  f.scope.saveRemoteState = async () => { await Promise.resolve(); f.scope.currentUser.id = "other"; f.scope.localStorageScopeKey = "id:other"; f.events.push("owner-changed"); };
  assert.equal(await f.load(), false);
  assert.equal(f.events.includes("startup-ready"), true, "old local data was shown only while its authenticated owner was current");
  assert.equal(f.events.at(-1), "owner-changed", "no old warning or local-state rendering occurs after the owner switch");
});

test("actual load waits for journal hydration and does not read an old account after it resolves", async () => {
  const f = appFixture(); let release;
  f.scope.refreshPersonalJournal = () => new Promise(resolve => { release = resolve; });
  const pending = f.load(); assert.deepEqual(f.events, []);
  f.scope.localStorageScopeKey = "id:other"; release();
  assert.equal(await pending, false); assert.deepEqual(f.events, []);
});

test("actual load stops before photo and server reads if journal verification fails", async () => {
  const f = appFixture(), error = Error("body verification failed");
  f.scope.refreshPersonalJournal = async () => { throw error; };
  await assert.rejects(f.load(), cause => cause === error); assert.deepEqual(f.events, []);
});
