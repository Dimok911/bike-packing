import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createPersonalAsyncOutbox } from "../../src/sync/personal-async-outbox.js";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { STORAGE_KEY, BASE_STATE_KEY, SYNC_META_KEY } from "../../src/config/constants.js";

const clone = value => structuredClone(value);
const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const f = { revision: 0, entries: [], commits: [], context: { ...binding, scope: "personal", generation: "editor-1" } };
  f.repository = {
    async read(actual) { assert.deepEqual(actual, binding); return clone({ revision: f.revision, entries: f.entries }); },
    async commit(actual, input) {
      assert.deepEqual(actual, binding); f.commits.push(clone(input));
      await f.beforeCommit?.(input);
      if (input.expectedRevision !== f.revision) throw Object.assign(Error("CAS conflict"), { code: "revision-conflict" });
      assert.deepEqual(input.deletes, []);
      for (const put of input.puts) {
        const index = f.entries.findIndex(entry => entry.namespace === put.namespace && entry.key === put.key);
        if (index < 0) f.entries.push(clone(put));
        else { assert.equal(put.namespace, "snapshot"); f.entries[index] = clone(put); }
      }
      f.revision++;
      return { revision: f.revision };
    }
  };
  f.input = () => {
    const payload = { items: {}, containers: { bag: { id: "bag", name: "Local bag", photos: [] } }, layouts: { layout: { id: "layout", containerIds: ["bag"] } } };
    return { body: { payload: clone(payload), baseStateRevision: 5, force: false, forceOverwrite: false, fullReplace: false },
      snapshot: { ...payload, localUi: "packing" } };
  };
  f.open = () => createPersonalAsyncOutbox({ repository: f.repository, binding, getContext: () => f.context, nativeOptions: { ordinaryRecoveryEnabled: true } });
  f.proof = request => ({ historicalOnly: true, operation: { id: request.operationId, ...binding, kind: "list.update", state: "rejected",
    payloadDigest: createHash("sha256").update(canonicalListOperationJson({ environment: binding.environment, actorId: binding.actorId,
      kind: "list.update", listId: binding.listId, body: JSON.parse(request.body) })).digest("hex") },
    resultStatus: 409, rejectionCode: "operation_cancelled",
    cancellation: { version: 1, operationId: request.operationId, noBusinessEffects: true, operationCannotApply: true } });
  f.recoveryOptions = () => ({ queue: { cancelExact: async request => f.proof(request) },
    readRemote: async () => ({ id: binding.listId, ownerId: binding.actorId, stateRevision: 8, payload: f.input().body.payload }) });
  f.confirmationOptions = () => ({ queue: { run: async request => {
    f.requests ||= []; f.requests.push(request.operationId);
    return { stateRevision: 9, record: { id: binding.listId, payload: JSON.parse(request.body).payload } };
  }, inspect: async request => f.proof(request) }, prepareConfirmation: (result, record) => [
    { key: `${STORAGE_KEY}::${binding.scopeKey}`, raw: JSON.stringify(record.snapshot) },
    { key: `${BASE_STATE_KEY}::${binding.scopeKey}`, raw: JSON.stringify(record.action.body.payload) },
    { key: `${SYNC_META_KEY}::${binding.scopeKey}`, raw: JSON.stringify({ dirty: false, stateRevision: result.stateRevision }) }
  ] });
  return f;
}

test("capture remains invisible until commit resolves; native record survives reopening with snapshot namespaces unchanged", async () => {
  const f = fixture(); f.entries.push({ namespace: "snapshot", key: "scoped-local-state", raw: "unchanged" });
  const adapter = await f.open(), started = deferred(), release = deferred(), input = f.input(), original = clone(input);
  f.beforeCommit = async () => { started.resolve(); await release.promise; };
  let returned = false; const saving = adapter.capture(input).then(value => { returned = true; return value; });
  await started.promise;
  assert.equal(returned, false); assert.equal(adapter.status().revision, 0); assert.equal(adapter.readView().head, null);
  release.resolve(); const saved = await saving;
  assert.equal(adapter.status().revision, 1); assert.equal(adapter.status().pending, true);
  assert.deepEqual(adapter.readView().head, saved); assert.deepEqual(input, original);
  assert.equal(f.entries[0].raw, "unchanged");
  const reopened = await f.open(); assert.deepEqual(reopened.readView().head, saved);
  assert.throws(() => { adapter.readView().snapshot.localUi = "mutated"; }, TypeError);
  assert.equal(adapter.readView().snapshot.localUi, "packing");
  assert.equal(adapter.drain, undefined); assert.equal(adapter.compact, undefined); assert.equal(adapter.markApplied, undefined);
});

test("failed transaction retains caller input and repository; adapter invalidates instead of exposing draft", async () => {
  const f = fixture(), adapter = await f.open(), input = f.input(), original = clone(input);
  f.beforeCommit = () => { throw Object.assign(Error("quota"), { code: "quota" }); };
  await assert.rejects(adapter.capture(input), { code: "quota" });
  assert.deepEqual(input, original); assert.equal(f.entries.length, 0);
  assert.throws(() => adapter.readView(), /invalidated/); assert.throws(() => adapter.status(), /invalidated/);
});

test("one adapter rejects overlapping mutations without losing the durable first save", async () => {
  const f = fixture(), adapter = await f.open(), started = deferred(), release = deferred();
  f.beforeCommit = async () => { started.resolve(); await release.promise; };
  const saving = adapter.capture(f.input()); await started.promise;
  await assert.rejects(adapter.capture(f.input()), /busy/);
  release.resolve(); const saved = await saving;
  assert.equal(f.entries.length, 1); assert.equal(adapter.readView().head.action.operationId, saved.action.operationId);
});

test("open rejects changed editor context and cross-binding journal rows", async () => {
  const f = fixture(), read = f.repository.read;
  f.repository.read = async actual => { const result = await read(actual); f.context.generation = "other"; return result; };
  await assert.rejects(f.open(), /context/);
  const other = fixture(); other.entries.push({ namespace: "journal", key: "bike-packing-personal-save-v1:other-account:key", raw: "{}" });
  await assert.rejects(other.open(), /repository-view/);
});

test("idle account, list and scope switches block cached reads and every mutation", async () => {
  const switches = [
    context => { context.actorId = "other"; context.scopeKey = "id:other"; },
    context => { context.listId = "other-list"; },
    context => { context.scope = "guest"; }
  ];
  const readers = ["readView", "status", "list", "ordinaryRecoveryState", "ordinaryRecoveryReview", "ordinaryRecoveryCopy"];
  for (const change of switches) for (const method of [...readers, "capture", "prepareOrdinaryRecoveryArchive", "recoverOrdinaryWithServer"]) {
    const f = fixture(), adapter = await f.open(); await adapter.capture(f.input());
    const before = clone(f.entries), originalContext = f.context;
    // The getter returns this exact same object before and after the mutation.
    change(f.context); assert.equal(f.context, originalContext);
    if (readers.includes(method)) assert.throws(() => adapter[method](), /context/);
    else await assert.rejects(adapter[method](method === "capture" ? f.input() : f.recoveryOptions()), /context/);
    assert.deepEqual(f.entries, before);
    // Switching back cannot revive a lifetime that already became invalid.
    Object.assign(f.context, binding, { scope: "personal", generation: "editor-1" });
    assert.throws(() => adapter.status(), /invalidated/);
  }
});

test("legitimate idle editor generation change permits next capture while operation guards remain strict", async () => {
  const f = fixture(), adapter = await f.open();
  const first = await adapter.capture(f.input());
  f.context.generation = "editor-after-ui-apply";
  assert.equal(adapter.status().revision, 1); assert.equal(adapter.readView().head.action.operationId, first.action.operationId);
  const input = f.input(); input.body.payload.containers.bag.name = "Edited again"; input.snapshot.containers.bag.name = "Edited again";
  const second = await adapter.capture(input);
  assert.equal(second.action.generation, 2); assert.equal(adapter.status().revision, 2);
});

test("snapshot namespace cannot masquerade as an immutable native journal record", async () => {
  const f = fixture(), adapter = await f.open(); await adapter.capture(f.input());
  const mislabeled = fixture(); mislabeled.entries = [{ ...f.entries[0], namespace: "snapshot" }];
  await assert.rejects(mislabeled.open(), /repository-view/);
  for (const key of ["bike-packing-personal-save-v1:other:key", "bike-packing-personal-ordinary-recovery-v1:other:key"]) {
    const other = fixture(); other.entries = [{ namespace: "snapshot", key, raw: "{}" }];
    await assert.rejects(other.open(), /repository-view/);
  }
});

test("competing adapters preserve winner and latch losing CAS", async () => {
  const f = fixture(), first = await f.open(), stale = await f.open();
  const saved = await first.capture(f.input());
  await assert.rejects(stale.capture(f.input()), { code: "revision-conflict" });
  assert.equal(f.entries.length, 1); assert.deepEqual((await f.open()).readView().head, saved);
  assert.throws(() => stale.readView(), /invalidated/);
});

test("native validation failure rolls back only memory and permits a later valid capture", async () => {
  const f = fixture(), adapter = await f.open();
  await assert.rejects(adapter.capture({ snapshot: {}, body: {} }));
  assert.equal(f.commits.length, 0); assert.equal(adapter.status().revision, 0);
  await adapter.capture(f.input()); assert.equal(adapter.status().revision, 1);
});

test("context switch during transaction retains committed bytes but exposes no wrong-account result", async () => {
  const f = fixture(), adapter = await f.open();
  f.beforeCommit = () => { f.context.generation = "editor-2"; };
  await assert.rejects(adapter.capture(f.input()), /context/);
  assert.equal(f.entries.length, 1); assert.throws(() => adapter.readView(), /invalidated/);
  assert.equal((await f.open()).status().pending, true);
});

test("archive is durable before cancellation and successor plus completion commit before result", async () => {
  const f = fixture(), adapter = await f.open(); await adapter.capture(f.input());
  const archive = await adapter.prepareOrdinaryRecoveryArchive();
  assert.equal(adapter.status().recoveryPending, true);
  const calls = [], options = f.recoveryOptions();
  options.queue.cancelExact = async request => {
    assert.ok(f.entries.some(entry => entry.key.endsWith(`archive:${archive.recoveryId}`)));
    calls.push("cancel"); return f.proof(request);
  };
  const originalRead = options.readRemote;
  options.readRemote = async () => { calls.push("read"); return originalRead(); };
  const recovered = await adapter.recoverOrdinaryWithServer(options);
  assert.deepEqual(calls, ["cancel", "read"]);
  assert.equal(recovered.action.operationId, archive.successorOperationId);
  assert.ok(f.entries.some(entry => entry.key.endsWith(`complete:${archive.recoveryId}`)));
  assert.equal(adapter.status().recoveryPending, false);
  assert.deepEqual((await f.open()).readView().head, recovered);
});

test("external revision before network prevents cancellation and read, keeping archive intact", async () => {
  const f = fixture(), adapter = await f.open(); await adapter.capture(f.input()); await adapter.prepareOrdinaryRecoveryArchive();
  f.revision++;
  const options = f.recoveryOptions(); let calls = 0;
  options.queue.cancelExact = async () => { calls++; }; options.readRemote = async () => { calls++; };
  await assert.rejects(adapter.recoverOrdinaryWithServer(options), /revision-conflict/);
  assert.equal(calls, 0); assert.equal(f.entries.length, 2); assert.throws(() => adapter.readView(), /invalidated/);
});

test("context switch during cancellation stops following network and preserves already durable archive", async () => {
  const f = fixture(), adapter = await f.open(); await adapter.capture(f.input()); await adapter.prepareOrdinaryRecoveryArchive();
  const options = f.recoveryOptions(); let read = false;
  options.queue.cancelExact = async request => { f.context.scopeKey = "id:other"; return f.proof(request); };
  options.readRemote = async () => { read = true; };
  await assert.rejects(adapter.recoverOrdinaryWithServer(options), /context/);
  assert.equal(read, false); assert.equal(f.entries.length, 2);
});

test("failed final recovery transaction cannot expose draft successor or repeat a different operation", async () => {
  const f = fixture(), adapter = await f.open(); await adapter.capture(f.input());
  const archive = await adapter.prepareOrdinaryRecoveryArchive(), originals = clone(f.entries);
  f.beforeCommit = () => { throw Error("transaction-aborted"); };
  await assert.rejects(adapter.recoverOrdinaryWithServer(f.recoveryOptions()), /transaction-aborted/);
  assert.deepEqual(f.entries, originals); assert.throws(() => adapter.readView(), /invalidated/);
  f.beforeCommit = null;
  const reopened = await f.open(), recovered = await reopened.recoverOrdinaryWithServer(f.recoveryOptions());
  assert.equal(recovered.action.operationId, archive.successorOperationId);
});

test("confirmation and mirrors become visible together only after durable commit and survive reopening", async () => {
  const f = fixture(), adapter = await f.open(), action = await adapter.capture(f.input());
  const entered = deferred(), release = deferred();
  f.beforeCommit = async () => { entered.resolve(); await release.promise; };
  let settled = false;
  const pending = adapter.settleOrdinary(f.confirmationOptions()).then(value => { settled = true; return value; });
  await entered.promise;
  assert.equal(settled, false); assert.equal(adapter.status().pending, true);
  assert.equal(adapter.readView().snapshots.length, 0);
  release.resolve(); const result = await pending;
  assert.equal(result.record.action.operationId, action.action.operationId);
  assert.equal(adapter.status().pending, false);
  assert.equal(adapter.readView().snapshots.length, 3);
  const reopened = await f.open(); assert.equal(reopened.status().pending, false);
  assert.deepEqual(reopened.readView(), adapter.readView());
  assert.ok(f.commits.at(-1).puts.some(row => row.namespace === "journal" && row.key.includes(":applied:")));
  assert.equal(f.commits.at(-1).puts.filter(row => row.namespace === "snapshot").length, 3);
});

test("failed confirmation transaction preserves old mirrors and rechecks the same operation after restart", async () => {
  const f = fixture(), adapter = await f.open(), action = await adapter.capture(f.input());
  await adapter.saveSnapshots([{ key: `${STORAGE_KEY}::${binding.scopeKey}`, raw: "old-owned-mirror" }]);
  const before = clone(f.entries);
  f.beforeCommit = () => { throw Error("IDB transaction aborted"); };
  await assert.rejects(adapter.settleOrdinary(f.confirmationOptions()), /aborted/);
  assert.deepEqual(f.entries, before);
  f.beforeCommit = null;
  const reopened = await f.open(); assert.equal(reopened.status().pending, true);
  await reopened.settleOrdinary(f.confirmationOptions());
  assert.equal(reopened.status().pending, false);
  assert.deepEqual([...new Set(f.requests)], [action.action.operationId]);
  assert.equal(reopened.readView().snapshots.filter(row => row.key === `${STORAGE_KEY}::${binding.scopeKey}`).length, 1);
});

test("ordinary recovery successor confirms without reviving cancelled originals on cold start", async () => {
  const f = fixture(), adapter = await f.open();
  const original = await adapter.capture(f.input());
  await adapter.prepareOrdinaryRecoveryArchive();
  const successor = await adapter.recoverOrdinaryWithServer(f.recoveryOptions());
  const cold = await f.open(); await cold.settleOrdinary(f.confirmationOptions());
  assert.equal(cold.status().pending, false);
  assert.equal(cold.readView().head.action.operationId, successor.action.operationId);
  assert.equal(f.requests.includes(original.action.operationId), false);
  assert.equal(cold.readView().recoveryState.pending, false);
});

test("confirmation rejects missing mirrors and foreign snapshot writes without publishing applied status", async () => {
  const f = fixture(), adapter = await f.open(); await adapter.capture(f.input());
  const before = clone(f.entries);
  await assert.rejects(adapter.settleOrdinary({ ...f.confirmationOptions(), prepareConfirmation: () => [] }),
    { code: "personal-async-outbox-confirmation-snapshots" });
  assert.equal(adapter.status().pending, true); assert.deepEqual(f.entries, before);
  await assert.rejects(adapter.saveSnapshots([{ key: `${STORAGE_KEY}::id:another`, raw: "foreign" }]),
    { code: "personal-async-outbox-snapshot-write" });
  assert.deepEqual(f.entries, before);
});
