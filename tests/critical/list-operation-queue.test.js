import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";
import { createListOperationQueue, canonicalListOperationJson, validateListReceipt, LIST_OPERATION_QUEUE_ENABLED } from "../../src/sync/list-operation-queue.js";
import { apiFetchRequest } from "../../src/sync/api-client.js";
import { syncEntityBatchWithRevisionRetry } from "../../src/sync/entity-sync.js";

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
    else if (url.endsWith("/capabilities")) data = { capabilities: ["personalListDatabaseOperationsV1"] };
    else if (url.endsWith("/freshness")) { status = state.deleted ? 404 : 200; data = { stateRevision: state.revision }; }
    else if (options.method === "POST") {
      const envelope = JSON.parse(options.body);
      const expected = { environment: "bike-packing-experiment", actorId: context.actorId, kind: envelope.kind, listId: envelope.listId, body: envelope.body };
      const payloadDigest = createHash("sha256").update(canonicalListOperationJson(expected)).digest("hex");
      data = { ok: true, operation: { ...expected, id: envelope.operationId, payloadDigest, state: state.rejection ? "rejected" : "committed" },
        result: state.rejection || { status: 200, payload: { ok: true, list: { id: envelope.listId, stateRevision: 1 } } } };
      receipts.set(envelope.operationId, data);
      state.mutate?.();
      if (state.loseResponse) throw Error("lost response");
    } else data = state.unknown ? { ok: true, operation: { state: "unknown" } } : receipts.get(url.split("/").at(-1));
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
