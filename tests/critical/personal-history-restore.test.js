import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { preparePersonalHistoryRestore } from "../../src/sync/personal-history-restore.js";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { validPersonalRestoreCancellation } from "../../src/sync/personal-restore-cancellation.js";
import { personalDeletionReference, preservesUndeletedEntities } from "../../src/sync/personal-deletion-intent.js";

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

async function rejectedRestoreFixture() {
  const f = fixture(), values = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = () => createPersonalSaveOutbox({ storage, ...f.context }), outbox = make();
  f.options.outbox = outbox; const restored = (await preparePersonalHistoryRestore(f.options))();
  const remote = { id: "list", ownerId: "actor", stateRevision: 6, payload: { items: { serverOnly: { id: "serverOnly", weight: 3 } }, containers: {}, layouts: {} } };
  const proof = record => ({ historicalOnly: true, resultStatus: 409, rejectionCode: "stale_state_revision", stateRevision: remote.stateRevision,
    operation: { ...outbox.binding, id: record.action.operationId, kind: record.action.kind, state: "rejected", payloadDigest: "1".repeat(64) } });
  const proofs = new Map([[restored.action.operationId, proof(restored)]]), calls = [];
  const queue = { inspect: async input => { calls.push(input); return structuredClone(proofs.get(input.operationId)); },
    run: async input => { calls.push(input); return { list: { stateRevision: remote.stateRevision + 1 } }; } };
  const options = { queue, getContext: () => f.context, readRemote: async () => remote, makeSnapshot: payload => payload };
  return { ...f, storage, values, make, outbox, restored, remote, proof, proofs, calls, options };
}

test("rejected restore requires an explicit keep-current decision and retains exact old bytes until its successor confirms", async () => {
  const f = await rejectedRestoreFixture(), original = [...f.values];
  await assert.rejects(f.outbox.reconcile(f.options), { code: "restore-reconciliation" });
  await assert.rejects(f.outbox.reconcile({ ...f.options, resolveRejectedRestore: async () => "cancel" }), { code: "reconciliation-cancelled" });
  assert.deepEqual([...f.values], original);
  const saved = await f.outbox.reconcile({ ...f.options, resolveRejectedRestore: async details => {
    assert.equal(details.historyId, 12); assert.equal(details.stateRevision, 6); assert.equal(details.discardedOperationCount, 1); return "keep-server";
  } });
  assert.equal(saved.action.kind, "list.update"); assert.equal(saved.action.body.historyRestore, undefined); assert.equal(saved.action.body.force, false);
  assert.equal(saved.action.body.baseStateRevision, 6); assert.deepEqual(saved.action.body.causal, { dependsOn: [], reads: [] });
  assert.deepEqual(saved.snapshot, f.remote.payload); assert.deepEqual(saved.action.body.payload, f.remote.payload);
  assert.notEqual(saved.action.operationId, f.restored.action.operationId); assert.equal(validPersonalRestoreCancellation(saved), true);
  assert.deepEqual([...f.values].slice(0, original.length), original); assert.deepEqual(f.make().recover(), saved);
  const reference = personalDeletionReference(f.state, [f.restored, saved]);
  assert.equal(preservesUndeletedEntities(saved.snapshot, reference), true);
  assert.equal(preservesUndeletedEntities({ ...saved.snapshot, items: {} }, reference), false, "later unrelated losses remain guarded");
  const tampered = structuredClone(saved); tampered.action.body.payload.items = {};
  assert.equal(validPersonalRestoreCancellation(tampered), false); assert.throws(() => personalDeletionReference(f.state, [tampered]));
  f.calls.length = 0;
  await f.make().drain({ queue: f.options.queue, getContext: f.options.getContext });
  assert.equal(f.calls[0].operationId, f.restored.action.operationId);
  assert.ok(f.calls.slice(1).every(input => input.operationId === saved.action.operationId));
  assert.ok(f.calls.slice(1).every(input => JSON.stringify(JSON.parse(input.body)) === JSON.stringify(saved.action.body)));
});

test("a restore decision waits for the exact no-effect outcome of an unsent dependent and retains both IDs", async () => {
  const f = await rejectedRestoreFixture();
  const payload = structuredClone(f.restored.snapshot); payload.items.later = { id: "later" };
  const child = f.outbox.capture({ snapshot: payload, body: { payload, baseStateRevision: 5 } });
  const inspect = f.options.queue.inspect; let terminalized = 0;
  f.options.queue.inspect = async input => {
    if (input.operationId === child.action.operationId && !f.proofs.has(input.operationId)) throw Object.assign(Error("unknown child"), { isOperationReceiptError: true });
    return inspect(input);
  };
  f.options.queue.settleRejectedDependency = async input => {
    assert.equal(input.operationId, child.action.operationId); assert.equal(input.predecessor.operationId, f.restored.action.operationId);
    assert.equal(JSON.parse(input.body).causal.baseOperationId, f.restored.action.operationId); terminalized++;
    const proof = { ...f.proof(child), rejectionCode: "dependency_rejected" }; f.proofs.set(child.action.operationId, proof); return proof;
  };
  const saved = await f.outbox.reconcile({ ...f.options, resolveRejectedRestore: async details => {
    assert.equal(terminalized, 1); assert.equal(details.discardedOperationCount, 2); return "keep-server";
  } });
  assert.equal(saved.action.previousLocalOperationId, child.action.operationId); assert.equal(saved.snapshot.items.later, undefined);
  assert.deepEqual(saved.reconciliation.settled.map(proof => proof.operation.id), [f.restored.action.operationId, child.action.operationId]);
  assert.deepEqual(f.make().recover(), saved); assert.equal(f.values.size, 3);
});

test("unknown outcomes, files, a changed editor, quota and refused choices cannot discard a rejected restore", async () => {
  for (const mode of ["unknown", "files", "actor", "generation", "quota", "choice", "owner", "structure"]) {
    const f = await rejectedRestoreFixture(), before = [...f.values]; let choices = 0;
    if (mode === "unknown") f.options.queue.inspect = async () => { throw Error("unknown receipt"); };
    if (mode === "files") f.remote.payload.items.serverOnly.photos = [{ id: "file" }];
    if (mode === "owner") f.remote.ownerId = "other";
    if (mode === "structure") f.options.makeSnapshot = () => { throw Error("structural repair"); };
    if (mode === "quota") f.storage.setItem = () => { throw Error("quota"); };
    await assert.rejects(f.outbox.reconcile({ ...f.options, resolveRejectedRestore: async () => {
      choices++;
      if (mode === "actor") f.context.actorId = "other";
      if (mode === "generation") f.context.generation = "changed";
      return mode === "choice" ? "reapply-restore" : "keep-server";
    } }));
    assert.deepEqual([...f.values], before, mode);
    if (["unknown", "files", "owner"].includes(mode)) assert.equal(choices, 0, mode);
  }
});

test("a keep-current decision is asked again after another server change and cannot reuse its earlier base", async () => {
  const f = await rejectedRestoreFixture(), choices = [];
  const options = { ...f.options, resolveRejectedRestore: async details => { choices.push(details.stateRevision); return "keep-server"; } };
  const first = await f.outbox.reconcile(options);
  f.remote.stateRevision = 7; f.remote.payload.items.serverOnly.weight = 8;
  f.proofs.set(first.action.operationId, f.proof(first));
  const next = await f.outbox.reconcile(options);
  assert.deepEqual(choices, [6, 7]); assert.equal(next.action.body.baseStateRevision, 7); assert.equal(next.snapshot.items.serverOnly.weight, 8);
  assert.notEqual(next.action.operationId, first.action.operationId); assert.deepEqual(f.make().recover(), next);
  assert.equal(next.reconciliation.decision.restoreOperationId, f.restored.action.operationId);
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
