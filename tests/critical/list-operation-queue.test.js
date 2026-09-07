import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";
import { createListOperationQueue, canonicalListOperationJson, validateListReceipt, LIST_OPERATION_QUEUE_ENABLED } from "../../src/sync/list-operation-queue.js";
import { apiFetchRequest } from "../../src/sync/api-client.js";
import { syncEntityBatchWithRevisionRetry } from "../../src/sync/entity-sync.js";
import { assertListOperationPayload, MAX_LIST_OPERATION_PAYLOAD_BYTES } from "../../src/sync/list-operation-payload.js";

const path = "/bike-packing/lists/list-a";
function fixture() {
  const values = new Map(), receipts = new Map(), calls = [];
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const tails = new Map();
  const locks = { request(name, callback) {
    const run = (tails.get(name) || Promise.resolve()).catch(() => {}).then(callback);
    tails.set(name, run); return run;
  } };
  const context = { actorId: "actor-a", generation: "generation-1", scope: "personal" };
  const state = { loseResponse: false, unknown: false, revision: 1, deleted: false, mutate: null, rejection: null };
  const fetchImpl = async (url, options) => {
    assert.equal(options.redirect, "error"); assert.equal(options.credentials, "include");
    calls.push({ url, options });
    let data, status = 200;
    if (url.endsWith("/auth/me")) data = { user: { id: context.actorId } };
    else if (url.endsWith("/capabilities")) data = { capabilities: ["personalListCausalOperationsV1"] };
    else if (url.endsWith("/freshness")) { status = state.deleted ? 404 : 200; data = { stateRevision: state.revision }; }
    else if (options.method === "POST") {
      const envelope = JSON.parse(options.body);
      assert.equal(envelope.expectedActorId, context.actorId);
      assert.equal(envelope.environment, "bike-packing-experiment");
      const expected = { environment: "bike-packing-experiment", actorId: context.actorId, kind: envelope.kind, listId: envelope.listId, body: envelope.body };
      const payloadDigest = createHash("sha256").update(canonicalListOperationJson(expected)).digest("hex");
      data = { ok: true, operation: { ...expected, id: envelope.operationId, payloadDigest, state: state.rejection ? "rejected" : "committed" },
        result: state.rejection || { status: 200, payload: { ok: true, list: { id: envelope.listId, stateRevision: 1 } } } };
      if (state.waiting) {
        data.operation.state = "waiting"; data.result = null;
        data.waiting = { code: "dependency_not_committed", retrySameOperation: true,
          operationIds: envelope.body.causal.dependsOn.map(dep => dep.operationId) };
      }
      receipts.set(envelope.operationId, data);
      state.mutate?.();
      if (state.loseResponse) throw Error("lost response");
    } else data = state.unknown ? { ok: true, operation: { state: "unknown" } }
      : receipts.get(url.split("/").at(-1)) || { ok: true, operation: { state: "unknown" } };
    return new Response(JSON.stringify(data), { status });
  };
  const make = () => {
    const transport = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN }, storage, locks, selection: "direct" });
    return { transport, queue: createListOperationQueue({ transport, getContext: () => ({ ...context }), enabled: true, locks, fetchImpl }) };
  };
  return { ...make(), make, state, context, storage, receipts, calls, values, locks, fetchImpl,
    input: { path, method: "PUT", body: JSON.stringify({ payload: { items: {} } }) },
    posts: () => calls.filter(call => call.options.method === "POST") };
}

test("list queue is release-gated; legacy API remains untouched when off", () => {
  assert.equal(LIST_OPERATION_QUEUE_ENABLED, false);
  const queue = createListOperationQueue({ transport: { experiment: true } });
  assert.equal(queue.supports(path, "PUT"), false);
});

test("operation preflight counts the complete UTF-8 binding at the exact API limit", () => {
  const binding = { actorId: "actor-a", kind: "list.update", listId: "list-a", body: { value: "" } };
  const available = MAX_LIST_OPERATION_PAYLOAD_BYTES - assertListOperationPayload(binding);
  binding.body.value = "я".repeat(Math.floor(available / 2)) + "x".repeat(available % 2);
  assert.equal(assertListOperationPayload(binding), MAX_LIST_OPERATION_PAYLOAD_BYTES);
  binding.body.value += "x";
  assert.throws(() => assertListOperationPayload(binding), { code: "payload-size", isOperationPreflightError: true });
  for (const value of [undefined, NaN, new Date(), { value: Infinity }]) {
    assert.throws(() => assertListOperationPayload({ ...binding, body: { value } }), { code: "payload-shape" });
  }
  let nested = null;
  for (let i = 0; i < 101; i++) nested = { nested };
  assert.throws(() => assertListOperationPayload({ ...binding, body: { nested } }), { code: "payload-shape" });
});

test("oversized new requests never become ambiguous writes or reach the mutation endpoint", async () => {
  const f = fixture(), before = [...f.values];
  await assert.rejects(f.queue.run({ ...f.input, body: JSON.stringify({ payload: { notes: "🚲".repeat(800000) } }) }),
    error => error.code === "payload-size" && error.isOperationPreflightError && !error.isAmbiguousMutation);
  assert.equal(f.posts().length, 0); assert.equal(f.transport.writes.length, 0);
  assert.deepEqual([...f.values], before);
});

async function rejectedDependencyFixture() {
  const f = fixture();
  const predecessor = { ...f.input, operationId: crypto.randomUUID() };
  f.state.rejection = { status: 409, payload: { ok: false, code: "stale_state_revision", stateRevision: 1 } };
  await assert.rejects(f.queue.run(predecessor), { isConfirmedOperationRejection: true });
  f.state.rejection = { status: 409, payload: { ok: false, code: "dependency_rejected", stateRevision: 1 } };
  const input = { ...f.input, operationId: crypto.randomUUID(), predecessor, body: JSON.stringify({ payload: { items: {} },
    causal: { baseOperationId: predecessor.operationId, dependsOn: [{ operationId: predecessor.operationId, listId: "list-a" }], reads: [] } }) };
  return { ...f, predecessor, input };
}

test("rejected-dependency settlement freezes the exact child, obtains a no-effect receipt and is GET-only on replay", async () => {
  const f = await rejectedDependencyFixture(), before = f.posts().length;
  const result = await f.queue.settleRejectedDependency(f.input);
  assert.equal(result.historicalOnly, true); assert.equal(result.rejectionCode, "dependency_rejected");
  assert.equal(f.posts().length - before, 1);
  assert.deepEqual(JSON.parse(f.posts().at(-1).options.body).body, JSON.parse(f.input.body));
  await f.make().queue.settleRejectedDependency(f.input);
  assert.equal(f.posts().length - before, 1);
});

test("rejected-dependency settlement can finish an unknown exact child after lost ACK without replacing its ID", async () => {
  const f = await rejectedDependencyFixture();
  f.state.loseResponse = true; f.state.unknown = true;
  await assert.rejects(f.queue.run(f.input));
  f.state.unknown = false; f.receipts.delete(f.input.operationId);
  const before = f.posts().length;
  const proof = await f.make().queue.settleRejectedDependency(f.input);
  assert.equal(proof.operation.id, f.input.operationId); assert.equal(f.posts().length - before, 1);
  assert.equal(f.posts().at(-1).options.body, f.posts().at(-2).options.body);
  assert.equal(proof.operation.state, "rejected");
});

test("unknown/committed/wrong parent and unrelated or changed child manifests never permit terminalization POST", async () => {
  for (const failure of ["unknown", "committed", "hash", "actor", "list", "no-edge", "different-edge", "changed-body", "confirmed-unknown"]) {
    const f = await rejectedDependencyFixture();
    const receipt = f.receipts.get(f.predecessor.operationId);
    if (failure === "unknown") f.receipts.delete(f.predecessor.operationId);
    if (failure === "committed") receipt.operation.state = "committed";
    if (failure === "hash") receipt.operation.payloadDigest = "0".repeat(64);
    if (failure === "actor") receipt.operation.actorId = "other";
    if (failure === "list") receipt.operation.listId = "other";
    if (failure === "no-edge") f.input.body = JSON.stringify({ payload: {} });
    if (failure === "different-edge") { const body = JSON.parse(f.input.body); body.causal.dependsOn[0].listId = "other"; f.input.body = JSON.stringify(body); }
    if (failure === "changed-body" || failure === "confirmed-unknown") {
      await f.queue.settleRejectedDependency(f.input);
      if (failure === "changed-body") { const body = JSON.parse(f.input.body); body.payload.changed = true; f.input.body = JSON.stringify(body); }
      else f.receipts.delete(f.input.operationId);
    }
    const before = f.posts().length;
    await assert.rejects(f.make().queue.settleRejectedDependency(f.input), undefined, failure);
    assert.equal(f.posts().length, before, failure);
  }
});

test("queue freezes a mutable context reference and blocks changed scope/list before dispatch", async () => {
  for (const key of ["actorId", "generation", "scope", "scopeKey", "listId", "environment"]) {
    const f = fixture(); f.context.scopeKey = "id:actor-a"; f.context.listId = "list-a"; f.context.environment = "bike-packing-experiment";
    const queue = createListOperationQueue({ transport: f.transport, enabled: true, getContext: () => f.context,
      fetchImpl: f.fetchImpl, locks: { request: async (name, callback) => { f.context[key] = "changed"; return callback(); } } });
    await assert.rejects(queue.run(f.input)); assert.equal(f.posts().length, 0, key);
  }
});

test("context changes during a waiting receipt GET or failed-parent GET block every follow-up POST", async () => {
  for (const mode of ["waiting", "rejected-parent"]) {
    const f = mode === "waiting" ? fixture() : await rejectedDependencyFixture();
    f.context.listId = "list-a";
    let target;
    if (mode === "waiting") {
      f.state.waiting = true;
      f.input.operationId = crypto.randomUUID();
      f.input.body = JSON.stringify({ payload: {}, causal: { dependsOn: [{ operationId: crypto.randomUUID(), listId: "list-a" }], reads: [] } });
      await assert.rejects(f.queue.run(f.input), { isOperationWaiting: true });
      target = f.input.operationId;
    } else target = f.predecessor.operationId;
    const queue = createListOperationQueue({ transport: f.transport, enabled: true, locks: f.locks, getContext: () => f.context,
      fetchImpl: async (url, options) => {
        const response = await f.fetchImpl(url, options);
        if (url.endsWith(target)) f.context.listId = "changed";
        return response;
      } });
    const before = f.posts().length;
    await assert.rejects(mode === "waiting" ? queue.run(f.input) : queue.settleRejectedDependency(f.input));
    assert.equal(f.posts().length, before, mode);
  }
});

test("durable intent before send; lost ACK recovered by GET; reload of acknowledged action never POSTs again", async () => {
  const f = fixture(); f.state.loseResponse = true;
  const originalFetch = f.fetchImpl;
  const queue = createListOperationQueue({ transport: f.transport, enabled: true, locks: f.locks, getContext: () => ({ ...f.context }), fetchImpl: async (url, options) => {
    if (options.method === "POST") {
      const id = JSON.parse(options.body).operationId;
      const stored = f.transport.writes.find(entry => entry.id === id);
      assert.deepEqual(stored.recovery.body, JSON.parse(f.input.body));
    }
    return originalFetch(url, options);
  } });
  assert.equal((await queue.run(f.input)).list.id, "list-a");
  const firstId = f.transport.writes[0].id;
  assert.equal(f.transport.writes[0].confirmed, true);
  assert.equal(f.transport.writes[0].recovery.body, undefined, "do not retain large confirmed request bodies");
  assert.equal(f.transport.writes[0].receipt.result, undefined, "full state is read from the server when replaying");
  await f.make().queue.run(f.input);
  assert.equal(f.posts().length, 1); assert.equal(f.transport.writes[0].id, firstId);
});

test("unknown result blocks replay and new generations; pending intent survives reload", async () => {
  const f = fixture(); f.state.loseResponse = true; f.state.unknown = true;
  await assert.rejects(f.queue.run(f.input), { isAmbiguousMutation: true });
  f.context.generation = "generation-2";
  await assert.rejects(f.make().queue.run(f.input), { isAmbiguousMutation: true });
  assert.equal(f.posts().length, 1); assert.ok(f.transport.uncertainWrite);
});

test("explicit action ID survives editor generation changes and rejects changed inputs without POST", async () => {
  const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
  await f.queue.run(input);
  f.context.generation = "later editor generation";
  await f.make().queue.run(input);
  assert.equal(f.posts().length, 1);
  await assert.rejects(f.make().queue.run({ ...input, body: JSON.stringify({ payload: { different: true } }) }), { isAmbiguousMutation: true });
  assert.equal(f.posts().length, 1);
});

test("receipt-only scheduler settlement does not return a stale business payload or bypass normal freshness", async () => {
  const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
  await f.queue.run(input); f.state.revision = 2;
  const proof = await f.make().queue.run({ ...input, receiptOnly: true });
  assert.equal(proof.operation.state, "committed"); assert.equal(proof.list, undefined);
  await assert.rejects(f.make().queue.run(input), { isAmbiguousMutation: true });
  assert.equal(f.posts().length, 1);
});

test("historical inspection is GET-only even after server advancement or deletion and returns no payload", async () => {
  for (const change of [{ revision: 20 }, { deleted: true }]) {
    const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
    await f.queue.run(input); Object.assign(f.state, change);
    f.calls.length = 0;
    const proof = await f.make().queue.inspect(input);
    assert.equal(proof.operation.id, input.operationId);
    assert.equal(proof.operation.state, "committed");
    assert.equal(proof.stateRevision, 1);
    assert.equal(proof.historicalOnly, true);
    assert.equal(proof.result, undefined);
    assert.equal(proof.operation.body, undefined);
    assert.equal(f.calls.every(call => call.options.method === "GET"), true);
    assert.equal(f.calls.some(call => call.url.endsWith("/freshness")), false);
    await assert.rejects(f.make().queue.run(input), { isAmbiguousMutation: true });
    assert.equal(f.posts().length, 0);
  }
});

test("historical rejection can be settled without applying its obsolete conflict snapshot", async () => {
  const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
  f.state.rejection = { status: 409, payload: { ok: false, code: "stale_state_revision", stateRevision: 1,
    serverPayload: { privateHistoricalState: true } } };
  await assert.rejects(f.queue.run(input), { isConfirmedOperationRejection: true });
  f.state.revision = 20; f.calls.length = 0;
  const proof = await f.make().queue.inspect(input);
  assert.equal(proof.operation.state, "rejected");
  assert.equal(proof.resultStatus, 409);
  assert.equal(proof.rejectionCode, "stale_state_revision");
  assert.equal(JSON.stringify(proof).includes("privateHistoricalState"), false);
  await assert.rejects(f.make().queue.run(input), { isAmbiguousMutation: true });
  assert.equal(f.posts().length, 0);
});

test("historical inspection validates a durable action even without a transport mirror, never registering or sending it", async () => {
  const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
  await f.queue.run(input);
  f.values.clear(); f.calls.length = 0;
  const reloaded = f.make();
  assert.equal((await reloaded.queue.inspect(input)).operation.id, input.operationId);
  assert.equal(f.posts().length, 0);
  assert.equal(reloaded.transport.writes.length, 0);
  await assert.rejects(reloaded.queue.inspect({ ...input, body: JSON.stringify({ payload: { changed: true } }) }), { isAmbiguousMutation: true });
  assert.equal(f.posts().length, 0);
});

test("unknown, waiting and mismatched historical receipts never resume or release an uncertain intent", async () => {
  for (const defect of ["unknown", "waiting", "actorId", "environment", "kind", "listId", "id", "payloadDigest", "status"]) {
    const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID(),
      body: JSON.stringify({ payload: { items: {} }, causal: { dependsOn: [{ operationId: crypto.randomUUID(), listId: "list-a" }] } }) };
    f.state.loseResponse = true; f.state.unknown = true;
    await assert.rejects(f.queue.run(input), { isAmbiguousMutation: true });
    f.state.unknown = defect === "unknown";
    const receipt = f.receipts.get(input.operationId);
    if (defect === "waiting") {
      receipt.operation.state = "waiting"; receipt.result = null;
      receipt.waiting = { code: "dependency_not_committed", retrySameOperation: true,
        operationIds: JSON.parse(input.body).causal.dependsOn.map(dep => dep.operationId) };
    } else if (defect === "status") receipt.result.status = 409;
    else if (defect !== "unknown") receipt.operation[defect] = "wrong";
    const before = JSON.stringify(f.transport.writes);
    await assert.rejects(f.make().queue.inspect(input), { isAmbiguousMutation: true });
    assert.equal(JSON.stringify(f.transport.writes), before, defect);
    assert.equal(f.posts().length, 1, defect);
  }
});

test("historical inspection freezes context and refuses changed account, editor, scope or selected list", async () => {
  for (const change of [{ actorId: "other" }, { generation: "next" }, { scope: "readonly" }, { listId: "list-b" }, { scopeKey: "other-scope" }]) {
    const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
    f.state.loseResponse = true; f.state.unknown = true;
    await assert.rejects(f.queue.run(input)); f.state.unknown = false;
    const queue = createListOperationQueue({ transport: f.transport, enabled: true, locks: f.locks,
      getContext: () => f.context, fetchImpl: async (url, options) => {
        const response = await f.fetchImpl(url, options);
        if (url.includes("/list-operations/")) Object.assign(f.context, change);
        return response;
      } });
    const before = JSON.stringify(f.transport.writes);
    await assert.rejects(queue.inspect(input), { isAmbiguousMutation: true });
    assert.equal(JSON.stringify(f.transport.writes), before);
    assert.equal(f.posts().length, 1);
  }
});

test("historical inspection cannot report success after a failed local receipt write", async () => {
  const f = fixture(), input = { ...f.input, operationId: crypto.randomUUID() };
  f.state.loseResponse = true; f.state.unknown = true;
  await assert.rejects(f.queue.run(input)); f.state.unknown = false;
  f.storage.setItem = () => { throw Error("quota"); };
  await assert.rejects(f.queue.inspect(input), { isAmbiguousMutation: true });
  assert.equal(f.posts().length, 1);
  assert.ok(f.transport.uncertainWrite);
});

test("historical inspection requires the gate, a personal actor, lock support and an exact UUID", async () => {
  const f = fixture();
  for (const override of [{ enabled: false }, { locks: null }, { getContext: () => ({ ...f.context, scope: "readonly" }) }]) {
    const queue = createListOperationQueue({ transport: f.transport, enabled: true, locks: f.locks,
      getContext: () => f.context, fetchImpl: f.fetchImpl, ...override });
    await assert.rejects(queue.inspect({ ...f.input, operationId: crypto.randomUUID() }));
  }
  await assert.rejects(f.queue.inspect(f.input));
  await assert.rejects(f.queue.inspect({ ...f.input, operationId: "invalid" }));
  assert.equal(f.calls.length, 0);
});

test("a later intentional equal edit uses a new ID, but concurrent same-generation tab submissions share one ID", async () => {
  const f = fixture();
  await Promise.all([f.queue.run(f.input), f.make().queue.run(f.input)]);
  assert.equal(f.posts().length, 1);
  f.context.generation = "generation-2";
  await f.queue.run(f.input);
  assert.equal(f.posts().length, 2);
  assert.notEqual(JSON.parse(f.posts()[0].options.body).operationId, JSON.parse(f.posts()[1].options.body).operationId);
});

test("account, generation or scope changes during dispatch cannot apply the old response", async () => {
  for (const change of [{ actorId: "other" }, { generation: "new local edit" }, { scope: "readonly" }]) {
    const f = fixture(); f.state.mutate = () => Object.assign(f.context, change);
    await assert.rejects(f.queue.run(f.input), { isAmbiguousMutation: true });
    assert.equal(f.posts().length, 1);
  }
});

test("historical receipt cannot resurrect a deleted list or overwrite advanced server revision", async () => {
  for (const change of [{ deleted: true }, { revision: 2 }]) {
    const f = fixture(); await f.queue.run(f.input); Object.assign(f.state, change);
    await assert.rejects(f.make().queue.run(f.input), { isAmbiguousMutation: true });
    assert.equal(f.posts().length, 1);
  }
});

test("terminal rejection is retained and rethrown as business rejection, not outer-envelope success", async () => {
  const f = fixture(); f.state.rejection = { status: 409, payload: { ok: false, code: "test-conflict" } };
  await assert.rejects(f.queue.run(f.input), { status: 409, isConfirmedOperationRejection: true });
  await assert.rejects(f.make().queue.run(f.input), { status: 409, isConfirmedOperationRejection: true });
  assert.equal(f.posts().length, 1); assert.equal(f.transport.writes[0].receipt.operation.state, "rejected");
});

test("wrong exact operation proof or failed durable storage never clears the intent", async () => {
  const f = fixture(); f.state.loseResponse = true; f.state.unknown = true;
  await assert.rejects(f.queue.run(f.input));
  const id = f.transport.writes[0].id;
  f.state.unknown = false; f.receipts.get(id).operation.payloadDigest = "0".repeat(64);
  await assert.rejects(f.make().queue.run(f.input)); assert.ok(f.transport.uncertainWrite);
  assert.equal(f.posts().length, 1);
  const blocked = fixture(); blocked.storage.setItem = () => { throw Error("quota"); };
  await assert.rejects(blocked.queue.run(blocked.input)); assert.equal(blocked.posts().length, 0);
});

test("partial entity outcomes must cover exact child IDs without silently accepting missing or duplicate children", () => {
  const expected = { operationId: "operation", actorId: "actor", kind: "items.sync", listId: "list", payloadDigest: "digest", body: { items: [{ id: "a" }, { id: "b" }] } };
  const receipt = { ok: true, operation: { ...expected, id: "operation", environment: "bike-packing-experiment", state: "committed" },
    result: { status: 200, payload: { ok: true, upserted: ["a"], deleted: [], conflicts: [{ itemId: "b" }] } } };
  assert.equal(validateListReceipt(receipt, expected), true);
  receipt.result.payload.conflicts = [];
  assert.equal(validateListReceipt(receipt, expected), false);
  receipt.result.payload.upserted = ["a", "a"];
  assert.equal(validateListReceipt(receipt, expected), false);
});

test("actual API wrapper delegates protected writes; forced offline and ambiguous revision failures never send", async () => {
  const f = fixture();
  const dependencies = { transport: f.transport, listQueue: f.queue };
  assert.equal((await apiFetchRequest(path, { method: "PUT", body: f.input.body }, dependencies)).list.id, "list-a");
  await assert.rejects(apiFetchRequest(path, { method: "PUT", body: f.input.body }, { ...dependencies, isForcedOffline: () => true }));
  assert.equal(f.posts().length, 1);
  let attempts = 0;
  await assert.rejects(syncEntityBatchWithRevisionRetry([], { refreshRevision: () => true, sendBatch: () => {
    attempts++; throw Object.assign(Error("unknown"), { status: 409, data: { code: "stale_state_revision" }, isAmbiguousMutation: true });
  } }));
  assert.equal(attempts, 1);
});

test("only a verified waiting intent resumes the same POST after reload; no new UUID or changed body", async () => {
  const f = fixture(); f.state.waiting = true;
  f.input.body = JSON.stringify({ causal: { dependsOn: [{ operationId: crypto.randomUUID(), listId: "list-a" }] } });
  await assert.rejects(f.queue.run(f.input), { isOperationWaiting: true });
  const first = f.posts()[0].options.body;
  assert.equal(f.transport.writes[0].confirmed, undefined);
  f.state.waiting = false;
  await f.make().queue.run(f.input);
  assert.equal(f.posts().length, 2); assert.equal(f.posts()[1].options.body, first);
  await f.make().queue.run(f.input);
  assert.equal(f.posts().length, 2);
});

test("waiting with wrong scope is not permission to POST again; confirmed stale rejection cannot auto-rebase", async () => {
  const f = fixture(); f.state.waiting = true;
  f.input.body = JSON.stringify({ causal: { dependsOn: [{ operationId: crypto.randomUUID(), listId: "list-a" }] } });
  await assert.rejects(f.queue.run(f.input), { isOperationWaiting: true });
  f.receipts.get(f.transport.writes[0].id).operation.environment = "production";
  await assert.rejects(f.make().queue.run(f.input)); assert.equal(f.posts().length, 1);
  let attempts = 0;
  await assert.rejects(syncEntityBatchWithRevisionRetry([], { refreshRevision: () => assert.fail("must not rebase"), sendBatch: () => {
    attempts++; throw Object.assign(Error("stale"), { status: 409, data: { code: "stale_state_revision" }, isOperationReceiptError: true });
  } }));
  assert.equal(attempts, 1);
});

test("unrelated target can complete while another target's POST is in flight", async () => {
  const f = fixture(); let started, release;
  const entered = new Promise(resolve => { started = resolve; });
  const pause = new Promise(resolve => { release = resolve; });
  const queue = createListOperationQueue({ transport: f.transport, enabled: true, locks: f.locks, getContext: () => ({ ...f.context }),
    fetchImpl: async (url, options) => {
      if (options.method === "POST" && JSON.parse(options.body).listId === "list-a") { started(); await pause; }
      return f.fetchImpl(url, options);
    } });
  const first = queue.run(f.input); await entered;
  let timer;
  try {
    const second = await Promise.race([queue.run({ ...f.input, path: "/bike-packing/lists/list-b" }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error("unrelated action blocked")), 1000); })]);
    assert.equal(second.list.id, "list-b");
  } finally { clearTimeout(timer); release(); }
  await first;
});
