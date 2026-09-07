import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { preparePersonalHistoryRestore } from "../../src/sync/personal-history-restore.js";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";

function fixture() {
  const context = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor", scope: "personal", generation: "before", activeLayoutId: "one" };
  const state = { items: { old: { id: "old" } }, layouts: { one: {} } };
  const payload = { items: {}, containers: {}, layouts: { one: { name: "Restored" } }, activeLayoutId: "one", packedItems: {}, locations: [], categories: [] };
  const manifest = { version: 1, historyId: 12, historyPayloadHash: "a".repeat(64), layoutIds: [], targetStateRevision: 5,
    payloadHash: createHash("sha256").update(canonicalListOperationJson(payload)).digest("hex") };
  const result = { ok: true, ...context, restore: { baseStateRevision: 5, payload, historyRestore: manifest } };
  const captured = [], adopted = [];
  const options = { historyId: 12, outbox: { binding: context, hasPending: () => false, capture: input => { captured.push(structuredClone(input)); return input; } },
    getContext: () => context, getState: () => state, getRevision: () => 5, readPreview: async () => result,
    makeSnapshot: value => ({ ...value, localPreference: true }), onCaptured: value => adopted.push(value) };
  return { context, state, payload, result, options, captured, adopted };
}

test("history preview freezes exact payload and one operation before confirmation without touching current state", async () => {
  const f = fixture(), before = structuredClone(f.state), commit = await preparePersonalHistoryRestore(f.options);
  f.payload.layouts.one.name = "Changed later";
  assert.deepEqual(f.state, before); assert.equal(f.captured.length, 0);
  const record = commit(); assert.equal(f.captured.length, 1); assert.equal(f.adopted.length, 1);
  assert.equal(record.body.payload.layouts.one.name, "Restored"); assert.equal(record.restore, true);
  assert.equal(record.snapshot.localPreference, true); assert.equal(commit(), null); assert.equal(f.captured.length, 1);
});

test("history preview or confirmation cannot cross account, environment, layout, local generation or target revision", async () => {
  for (const field of ["actorId", "environment", "activeLayoutId", "generation", "listId", "scopeKey"]) {
    for (const duringRead of [true, false]) {
      const f = fixture();
      if (duringRead) f.options.readPreview = async () => { f.context[field] = "different"; return f.result; };
      if (duringRead) await assert.rejects(preparePersonalHistoryRestore(f.options), /изменились/);
      else { const commit = await preparePersonalHistoryRestore(f.options); f.context[field] = "different"; assert.throws(commit, /изменились/); }
      assert.equal(f.captured.length, 0); assert.equal(f.adopted.length, 0);
    }
  }
});

test("history rejects pending actions, wrong provenance, changed bytes, files and quota without a second operation", async () => {
  for (const change of [
    f => { f.options.outbox.hasPending = () => true; },
    f => { f.result.restore.historyRestore.historyId++; },
    f => { f.result.restore.historyRestore.targetStateRevision++; },
    f => { f.result.restore.historyRestore.layoutIds = ["one"]; },
    f => { f.result.restore.payload.items.unexpected = {}; },
    f => { f.state.items.old.photos = [{ id: "photo" }]; },
    f => { f.result.actorId = "other"; },
  ]) { const f = fixture(); change(f); await assert.rejects(preparePersonalHistoryRestore(f.options)); assert.equal(f.captured.length, 0); }
  const f = fixture(); let attempts = 0;
  f.options.outbox.capture = () => { attempts++; throw Error("quota"); };
  const commit = await preparePersonalHistoryRestore(f.options);
  assert.throws(commit, /quota/); assert.equal(commit(), null); assert.equal(attempts, 1); assert.equal(f.adopted.length, 0);
});

test("real outbox retains restore UUID and bytes across lost ACK, reload and a dependent edit", async () => {
  const f = fixture(), values = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = () => createPersonalSaveOutbox({ storage, ...f.context });
  f.options.outbox = make();
  const commit = await preparePersonalHistoryRestore(f.options), saved = commit();
  assert.equal(saved.action.kind, "list.restore"); assert.deepEqual(make().recover(), saved);
  const bytes = [...values], requests = [];
  await assert.rejects(make().drain({ getContext: () => f.context, queue: { run: async input => { requests.push(input); throw Error("lost ACK"); } } }), /lost ACK/);
  assert.deepEqual([...values], bytes); assert.equal(requests[0].path, "/bike-packing/lists/list/restore"); assert.equal(requests[0].method, "POST");
  const reloaded = make();
  const next = structuredClone(saved.snapshot); next.items.new = { id: "new", name: "Later" };
  const edited = reloaded.capture({ snapshot: next, body: { payload: next, baseStateRevision: 5 } });
  assert.equal(edited.action.kind, "list.update"); assert.equal(edited.action.body.causal.baseOperationId, saved.action.operationId);
  assert.equal(edited.action.body.historyRestore, undefined);
  requests.length = 0;
  await make().drain({ getContext: () => f.context, onConfirmed: () => {}, queue: { run: async input => { requests.push(input); return {}; } } });
  assert.equal(requests[0].operationId, saved.action.operationId);
  assert.deepEqual(JSON.parse(requests[0].body), saved.action.body);
  assert.equal(requests[1].method, "PUT"); assert.equal(requests[1].operationId, edited.action.operationId);
});

test("real outbox does not attach a restore to pending changes or change its prepared target revision", () => {
  const f = fixture(), values = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const outbox = createPersonalSaveOutbox({ storage, ...f.context });
  const parent = outbox.capture({ snapshot: f.state, body: { payload: f.state, baseStateRevision: 5 } });
  assert.throws(() => outbox.capture({ restore: true, snapshot: f.payload, body: f.result.restore }), { code: "restore-base" });
  outbox.markApplied({ operationId: parent.action.operationId, stateRevision: 6 });
  assert.throws(() => outbox.capture({ restore: true, snapshot: f.payload, body: f.result.restore }), { code: "restore-base" });
  assert.equal(outbox.recover().action.operationId, parent.action.operationId);
});

test("actual app deduplication compares the adopted current baseline, not an old restore snapshot", async () => {
  const f = fixture(), values = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const outbox = createPersonalSaveOutbox({ storage, ...f.context }); f.options.outbox = outbox;
  const saved = (await preparePersonalHistoryRestore(f.options))();
  outbox.markApplied({ operationId: saved.action.operationId, stateRevision: 6 });
  const current = structuredClone(saved.snapshot); current.items.serverOnly = { id: "serverOnly" };
  outbox.adoptRemoteBaseline({ snapshot: current, payload: current, stateRevision: 7 });
  const deps = { personalSavePilotEnabled: () => true, localStorageScopeKey: f.context.scopeKey, GUEST_STORAGE_SCOPE: "guest",
    isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, modeState: {},
    personalSaveOutboxForScope: () => outbox, buildListSaveBodyForSync: ({ serializeState }) => ({ payload: serializeState(), baseStateRevision: 7 }),
    currentHistoryActionContext: () => null, nowIso: () => "", syncDevice: {}, syncMeta: {},
    cloneStateForSync: value => structuredClone(value), currentUser: { id: "actor" }, currentPackingListId: "list",
    userStorageScopeKey: () => f.context.scopeKey, sameJson: (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b) };
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8").match(/function capturePersonalSaveIntent\([^]*?\n\}/)[0];
  const capture = new Function(...Object.keys(deps), `return (${source});`)(...Object.values(deps));
  assert.equal(capture(current).action.operationId, saved.action.operationId, "unchanged current baseline is UI-only");
  const newAction = capture(saved.snapshot);
  assert.notEqual(newAction.action.operationId, saved.action.operationId, "intentional change back to old values is a new action");
  assert.equal(newAction.action.kind, "list.update"); assert.equal(newAction.action.body.baseStateRevision, 7);
});
