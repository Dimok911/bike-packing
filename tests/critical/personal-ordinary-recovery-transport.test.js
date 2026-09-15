import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";
import { createListOperationQueue, canonicalListOperationJson as canonical } from "../../src/sync/list-operation-queue.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY } from "../../src/config/constants.js";

const operationId = "f50a8c45-dca7-4392-a61e-bab74c56bed8", environment = "bike-packing-experiment", listId = "list-a";
const copy = structuredClone;

test("quota in cancellation journal evicts only public cache and sends the exact original operation once", async () => {
  const f = fixture();
  f.capture(); const archive = f.archive(), originals = archive.entries;
  f.values.set(PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY, "renewable public cache");
  const setItem = f.storage.setItem, attempts = [];
  f.storage.setItem = (key, raw) => {
    if (key.startsWith("bike-packing-experiment-uncertain-write-v1:") && !f.values.has(key)) {
      attempts.push([key, raw]);
      if (f.values.has(PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY)) throw new DOMException("Quota", "QuotaExceededError");
    }
    setItem(key, raw);
  };
  const proof = await f.make({ ordinaryRecoveryEnabled: true, recoveryStorage: f.storage }).queue.cancelExact(f.input);
  assert.equal(proof.rejectionCode, "operation_cancelled");
  assert.equal(attempts.length, 2); assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(f.posts().length, 1); assert.ok(f.posts()[0].path.endsWith("/cancel"));
  assert.equal(f.posts()[0].envelope.operationId, operationId);
  assert.deepEqual(f.posts()[0].envelope.body, f.body);
  for (const entry of originals) assert.equal(f.values.get(entry.key), entry.value);
  assert.equal(f.values.has(PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY), false);
});
const digest = value => createHash("sha256").update(canonical(value)).digest("hex");

function fixture() {
  const values = new Map(), tails = new Map(), receipts = new Map(), calls = [];
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null, setItem: (key, raw) => values.set(key, raw), removeItem: key => values.delete(key) };
  const locks = { request(name, work) {
    const promise = (tails.get(name) || Promise.resolve()).catch(() => {}).then(work); tails.set(name, promise); return promise;
  } };
  const context = { actorId: "actor-a", scopeKey: "id:actor-a", scope: "personal", environment, listId, generation: "editor-1" };
  const body = { baseStateRevision: 1, payload: { items: {}, containers: { bag: { id: "bag", name: "Bag", photos: [] } },
    layouts: { layout: { id: "layout", rootContainerIds: ["bag"], arrangement: { rootContainerIds: ["bag"],
      containers: { bag: { parentId: null, itemIds: [], childIds: [], order: [] } }, items: {}, packedItems: {} } } } },
    force: false, forceOverwrite: false, fullReplace: false, causal: { dependsOn: [], reads: [] } };
  const input = { path: `/bike-packing/lists/${listId}`, method: "PUT", operationId, body: JSON.stringify(body) };
  const expected = { id: operationId, environment, actorId: context.actorId, kind: "list.update", listId,
    payloadDigest: digest({ environment, actorId: context.actorId, kind: "list.update", listId, body }) };
  const prepared = () => ({ ok: true, operation: { ...expected, state: "waiting" }, result: null,
    waiting: { code: "owner_update_prepared", operationIds: [], retrySameOperation: true } });
  const cancelled = () => ({ ok: true, operation: { ...expected, state: "rejected" }, result: { status: 409,
    payload: { ok: false, code: "operation_cancelled", cancellation: { version: 1, operationId,
      noBusinessEffects: true, operationCannotApply: true } } } });
  const state = { revision: 1, allowExecute: false, loseCancelAck: false, hideReceipt: false, hook: null,
    capabilities: ["personalListCausalOperationsV1", "personalListOperationCancellationV1", "personalListOperationPreparationV1"] };
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname, envelope = options.body ? JSON.parse(options.body) : null;
    const call = { path, method: options.method, envelope }; calls.push(call);
    let data, status = 200;
    if (path.endsWith("/auth/me")) data = { user: { id: context.actorId } };
    else if (path.endsWith("/capabilities")) data = { capabilities: [...state.capabilities] };
    else if (path.endsWith("/freshness")) data = { stateRevision: state.revision };
    else if (path.endsWith("/cancel")) {
      assert.equal(envelope.operationId, operationId); assert.deepEqual(envelope.body, body);
      data = cancelled(); receipts.set(operationId, copy(data));
      await state.hook?.(call);
      if (state.loseCancelAck) throw Error("Lost cancellation ACK");
    } else if (path.endsWith("/prepare")) {
      assert.deepEqual(envelope.body, body); data = prepared(); receipts.set(operationId, copy(data));
    } else if (options.method === "POST") {
      if (!state.allowExecute) { status = 403; data = { ok: false, code: "personal_owner_only" }; }
      else { assert.equal(envelope.body.baseStateRevision, state.revision);
        const binding = { environment, actorId: envelope.expectedActorId, kind: envelope.kind, listId: envelope.listId, body: envelope.body };
        state.revision++; data = { ok: true, operation: { ...expected, id: envelope.operationId,
          payloadDigest: digest(binding), state: "committed" },
        result: { status: 200, payload: { ok: true, list: { id: listId, stateRevision: state.revision } } } };
        receipts.set(envelope.operationId, copy(data)); }
    } else data = copy(!state.hideReceipt && receipts.get(operationId) || { ok: true, operation: { id: operationId, state: "unknown" } });
    await state.hook?.(call, data);
    return Response.json(data, { status });
  };
  const make = (options = {}) => {
    const transport = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN }, storage, locks, selection: "direct" });
    return { transport, queue: createListOperationQueue({ transport, getContext: () => ({ ...context }), enabled: true,
      cancellationEnabled: true, operationPreparationEnabled: true, locks, fetchImpl, ...options }) };
  };
  const f = { storage, values, context, body, input, expected, prepared, cancelled, state, calls, receipts, make, locks, fetchImpl,
    posts: () => calls.filter(call => call.method === "POST") };
  f.outbox = createPersonalSaveOutbox({ storage, ...context, ordinaryRecoveryEnabled: true });
  f.capture = () => {
    const inputBody = copy(body); delete inputBody.causal;
    const record = f.outbox.capture({ operationId, body: inputBody, snapshot: { ...copy(body.payload), activeLayoutId: "layout" } });
    assert.deepEqual(record.action.body, body); return record;
  };
  f.archive = () => f.outbox.prepareOrdinaryRecoveryArchive({ getContext: () => ({ ...context }) });
  f.deny = async () => { await assert.rejects(make({ operationPreparationEnabled: false }).queue.run(input),
    { isPersonalSaveBlocked: true, code: "owner-access" }); };
  return f;
}

test("exact cancellation accepts an independently bound owner preparation and never executes or prepares the old action", async () => {
  const f = fixture(); await f.deny(); const original = copy(f.posts()[0].envelope);
  f.receipts.set(operationId, f.prepared());
  const proof = await f.make().queue.cancelExact(f.input);
  assert.equal(proof.rejectionCode, "operation_cancelled");
  assert.equal(proof.operation.id, operationId); assert.equal(proof.historicalOnly, true);
  assert.deepEqual(proof.cancellation, { version: 1, operationId, noBusinessEffects: true, operationCannotApply: true });
  assert.equal(f.state.revision, 1); assert.equal(f.posts().length, 2);
  assert.ok(f.posts()[1].path.endsWith("/cancel")); assert.deepEqual(f.posts()[1].envelope, original);
  assert.equal(f.make().transport.writes[0].confirmed, true);
  assert.deepEqual(await f.make().queue.cancelExact(f.input), proof); assert.equal(f.posts().length, 2);
});

for (const [name, change] of [
  ["UUID", data => { data.operation.id = crypto.randomUUID(); }],
  ["actor", data => { data.operation.actorId = "other"; }],
  ["environment", data => { data.operation.environment = "production"; }],
  ["list", data => { data.operation.listId = "other"; }],
  ["kind", data => { data.operation.kind = "list.delete"; }],
  ["digest", data => { data.operation.payloadDigest = "0".repeat(64); }],
  ["result", data => { data.result = {}; }],
  ["retry", data => { data.waiting.retrySameOperation = false; }],
  ["dependency", data => { data.waiting.operationIds = [crypto.randomUUID()]; }],
  ["extra field", data => { data.waiting.extra = true; }]
]) test(`prepared cancellation rejects malformed ${name} without clearing the original journal`, async () => {
  const f = fixture(); await f.deny(); const before = [...f.values], data = f.prepared(); change(data);
  f.receipts.set(operationId, data); await assert.rejects(f.make().queue.cancelExact(f.input));
  assert.equal(f.posts().length, 1); assert.deepEqual([...f.values], before);
});

for (const mode of ["gate", "capability", "context", "same UUID changed body"]) test(`prepared cancellation remains blocked after ${mode} changes`, async () => {
  const f = fixture(); await f.deny(); const before = [...f.values]; f.receipts.set(operationId, f.prepared());
  if (mode === "capability") f.state.capabilities.pop();
  if (mode === "context") f.state.hook = call => { if (call.path.endsWith("/capabilities")) f.context.generation = "other"; };
  const input = copy(f.input);
  if (mode === "same UUID changed body") { const body = JSON.parse(input.body); body.payload.containers.bag.name = "Changed"; input.body = JSON.stringify(body); }
  await assert.rejects(f.make({ operationPreparationEnabled: mode !== "gate" }).queue.cancelExact(input));
  assert.equal(f.posts().length, 1); assert.deepEqual([...f.values], before);
});

for (const [name, storage] of [
  ["missing", null], ["incomplete", { getItem() { return null; } }],
  ["unreadable", { get length() { throw Error("Storage denied"); }, key() {}, getItem() { return null; } }]
]) test(`enabled recovery refuses ${name} storage before preparing or executing an action`, async () => {
  const f = fixture(); f.state.allowExecute = true;
  await assert.rejects(f.make({ ordinaryRecoveryEnabled: true, recoveryStorage: storage }).queue.run(f.input));
  assert.equal(f.posts().length, 0); assert.equal(f.values.size, 0);
});

for (const enabled of [true, false]) test(`real archived choice blocks cold replay even with recovery gate ${enabled}`, async () => {
  const f = fixture(), original = f.capture(); await f.deny(); const archive = await f.archive();
  f.state.allowExecute = true; f.receipts.set(operationId, f.prepared());
  const before = [...f.values];
  await assert.rejects(f.make({ ordinaryRecoveryEnabled: enabled, recoveryStorage: f.storage }).queue.run(f.input), { code: "ordinary-recovery" });
  assert.equal(f.posts().length, 1); assert.equal(f.state.revision, 1); assert.deepEqual([...f.values], before);
  assert.deepEqual(f.outbox.list(), [original]); assert.ok(archive);
  const proof = await f.make({ ordinaryRecoveryEnabled: enabled, recoveryStorage: f.storage }).queue.cancelExact(f.input);
  assert.equal(proof.rejectionCode, "operation_cancelled"); assert.equal(f.posts().length, 2);
  assert.ok(f.posts()[1].path.endsWith("/cancel"));
});

for (const boundary of ["preparation capability read", "prepare response", "beginWrite"]) test(`a durable choice appearing during ${boundary} prevents the next business dispatch`, async () => {
  const f = fixture(); f.capture(); f.state.allowExecute = true;
  const options = { ordinaryRecoveryEnabled: true, recoveryStorage: f.storage };
  let archived = false;
  if (boundary !== "beginWrite") {
    f.state.allowExecute = false; await f.deny(); f.state.allowExecute = true;
    f.state.hook = async call => {
      if (!archived && call.path.endsWith(boundary === "prepare response" ? "/prepare" : "/capabilities")) {
        archived = true; await f.archive();
      }
    };
  }
  const current = f.make(options);
  if (boundary === "beginWrite") {
    const transport = { ...current.transport, get writes() { return current.transport.writes; }, async beginWrite(...args) {
      const id = await current.transport.beginWrite(...args); archived = true; await f.archive(); return id;
    } };
    current.queue = createListOperationQueue({ transport, getContext: () => ({ ...f.context }), enabled: true,
      operationPreparationEnabled: true, locks: f.locks, fetchImpl: f.fetchImpl, ...options });
  }
  await assert.rejects(current.queue.run(f.input), { code: "ordinary-recovery" });
  assert.equal(archived, true);
  assert.equal(f.posts().filter(call => !call.path.endsWith("/prepare")).length, boundary === "beginWrite" ? 0 : 1);
  assert.equal(f.posts().filter(call => call.path.endsWith("/prepare")).length, boundary === "prepare response" ? 1 : 0);
  assert.equal(f.state.revision, 1);
  const before = f.posts().length;
  await assert.rejects(f.make(options).queue.run(f.input), { code: "ordinary-recovery" });
  assert.equal(f.posts().length, before);
});

test("lost cancellation ACK and cold unknown cannot revive an archived prepared action", async () => {
  const f = fixture(), original = f.capture(); await f.deny(); await f.archive();
  f.receipts.set(operationId, f.prepared()); f.state.loseCancelAck = true;
  f.state.hook = call => { if (call.path.endsWith("/cancel")) f.state.hideReceipt = true; };
  const options = { ordinaryRecoveryEnabled: true, recoveryStorage: f.storage };
  await assert.rejects(f.make(options).queue.cancelExact(f.input));
  assert.equal(f.posts().length, 2); assert.ok(f.posts()[1].path.endsWith("/cancel"));
  f.state.allowExecute = true;
  await assert.rejects(f.make(options).queue.run(f.input), { code: "ordinary-recovery" });
  assert.equal(f.posts().length, 2); assert.equal(f.state.revision, 1); assert.deepEqual(f.outbox.list(), [original]);
  f.state.hideReceipt = false;
  const proof = await f.make(options).queue.cancelExact(f.input);
  assert.equal(proof.rejectionCode, "operation_cancelled"); assert.equal(proof.cancellation.operationCannotApply, true);
  assert.deepEqual(await f.make(options).queue.inspect(f.input), proof);
  assert.equal(f.posts().length, 2, "cold terminal read never sends a second cancel or original action");
});

test("a fully published keep-server decision allows the next edit but retains the old UUID barrier after rollback", async () => {
  const f = fixture(); f.capture(); await f.deny(); const archive = await f.archive();
  const options = { ordinaryRecoveryEnabled: true, recoveryStorage: f.storage };
  f.receipts.set(operationId, f.prepared()); f.state.revision = 2;
  const serverPayload = copy(f.body.payload); serverPayload.containers.bag.name = "Changed on another device";
  const decision = await f.outbox.recoverOrdinaryWithServer({ queue: f.make(options).queue, getContext: () => ({ ...f.context }),
    readRemote: async () => ({ id: listId, ownerId: f.context.actorId, stateRevision: 2, payload: serverPayload }),
    makeSnapshot: payload => ({ ...payload, activeLayoutId: "layout" }) });
  assert.equal(decision.action.operationId, archive.successorOperationId);
  assert.deepEqual(decision.action.body.payload, serverPayload);
  assert.equal(f.outbox.ordinaryRecoveryState().pending, false);
  const archiveEntry = [...f.values].find(([, raw]) => { try { return JSON.parse(raw).recoveryId === archive.recoveryId
    && JSON.parse(raw).format === "bike-packing-personal-ordinary-recovery-v1"; } catch { return false; } });
  assert.ok(archiveEntry);
  f.outbox.markApplied({ operationId: decision.action.operationId, stateRevision: 2 });
  const nextPayload = copy(serverPayload); nextPayload.containers.bag.name = "Next deliberate edit";
  const next = f.outbox.capture({ snapshot: { ...copy(nextPayload), activeLayoutId: "layout" },
    body: { baseStateRevision: 2, payload: nextPayload } });
  assert.notEqual(next.action.operationId, operationId); f.state.allowExecute = true;
  const before = f.posts().length;
  await assert.rejects(f.make({ ...options, ordinaryRecoveryEnabled: false }).queue.run(f.input), { code: "ordinary-recovery" });
  assert.equal(f.posts().length, before);
  await f.make({ ...options, ordinaryRecoveryEnabled: false }).queue.run({ path: f.input.path, method: "PUT",
    body: JSON.stringify(next.action.body), operationId: next.action.operationId });
  assert.equal(f.posts().length, before + 1); assert.equal(f.posts().at(-1).envelope.operationId, next.action.operationId);
  assert.deepEqual(f.posts().at(-1).envelope.body, next.action.body);
  assert.equal(f.state.revision, 3); assert.equal(f.storage.getItem(archiveEntry[0]), archiveEntry[1]);
  await assert.rejects(f.make(options).queue.run(f.input), { code: "ordinary-recovery" });
  assert.equal(f.posts().length, before + 1);
});
