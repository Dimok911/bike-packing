import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";
import { createListOperationQueue, canonicalListOperationJson as canonical, validateWaitingOperation } from "../../src/sync/list-operation-queue.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { PERSONAL_LIST_OPERATION_PREPARATION_ENABLED, PERSONAL_LIST_OPERATION_PREPARATION_CAPABILITY,
  isPersonalListOperationPreparation, validatePreparedPersonalListOperation, preparePersonalListOperationRetry } from "../../src/sync/personal-list-operation-preparation.js";
import { isReadOnlyBikePackingRecord, isReadOnlyBikePackingMutationContext } from "../../src/public/scope.js";

const operationId = "438c90a2-b12a-4e61-87ad-00f6d2d358b1", environment = "bike-packing-experiment", listId = "list-a";
const copy = structuredClone, digest = value => createHash("sha256").update(canonical(value)).digest("hex");
function fixture() {
  const values = new Map(), receipts = new Map(), calls = [], tails = new Map();
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const locks = { request: (name, callback) => {
    const promise = (tails.get(name) || Promise.resolve()).catch(() => {}).then(callback); tails.set(name, promise); return promise;
  } };
  const context = { environment, actorId: "actor-a", listId, scopeKey: "id:actor-a", scope: "personal", generation: "editor-1" };
  const payload = { items: {}, containers: { bag: { id: "bag", name: "Bag", photos: [] } }, layouts: { layout: { id: "layout",
    arrangement: { rootContainerIds: ["bag"], containers: { bag: { parentId: null } }, items: {}, packedItems: {} } } } };
  const body = { baseStateRevision: 1, payload, force: false, forceOverwrite: false, fullReplace: false, causal: { dependsOn: [], reads: [] } };
  const input = { path: `/bike-packing/lists/${listId}`, method: "PUT", operationId, body: JSON.stringify(body) };
  const state = { allowOwner: false, revision: 1, capabilities: ["personalListCausalOperationsV1", PERSONAL_LIST_OPERATION_PREPARATION_CAPABILITY],
    authActor: "actor-a", prepare: "normal", hook: null, getProof: null };
  const expectation = envelope => ({ operationId: envelope.operationId, actorId: envelope.expectedActorId, kind: envelope.kind,
    listId: envelope.listId, body: envelope.body, payloadDigest: digest({ environment, actorId: envelope.expectedActorId,
      kind: envelope.kind, listId: envelope.listId, body: envelope.body }) });
  const boundOperation = (expected, status) => ({ id: expected.operationId, environment, actorId: expected.actorId,
    kind: expected.kind, listId: expected.listId, payloadDigest: expected.payloadDigest, state: status });
  const prepared = expected => ({ ok: true, operation: boundOperation(expected, "waiting"), result: null,
    waiting: { code: "owner_update_prepared", operationIds: [], retrySameOperation: true } });
  const unknown = id => ({ ok: true, operation: { id, state: "unknown" } });
  const fetchImpl = async (url, options) => {
    assert.equal(options.redirect, "error"); assert.equal(options.credentials, "include");
    const path = new URL(url).pathname, envelope = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method: options.method, envelope, body: options.body });
    let data, status = 200;
    if (path.endsWith("/auth/me")) data = { user: { id: state.authActor } };
    else if (path.endsWith("/capabilities")) data = { capabilities: [...state.capabilities] };
    else if (path.endsWith("/freshness")) data = { stateRevision: state.revision };
    else if (path.endsWith("/prepare")) {
      const expected = expectation(envelope);
      assert.equal(path.split("/").at(-2), expected.operationId);
      if (!state.allowOwner || state.prepare === "denied") { status = 403; data = { ok: false, code: "personal_owner_only" }; }
      else if (state.prepare === "newer") { status = 409; data = { ok: false, code: "state_revision_conflict" }; }
      else {
        data = prepared(expected);
        if (state.prepare !== "response-only") receipts.set(expected.operationId, copy(data));
        if (state.prepare === "lost-ack") { await state.hook?.(path); throw Error("Lost prepare ACK"); }
      }
    } else if (options.method === "POST") {
      if (!state.allowOwner) { status = 403; data = { ok: false, code: "personal_owner_only" }; }
      else {
        const expected = expectation(envelope); state.revision++;
        data = { ok: true, operation: boundOperation(expected, "committed"), result: { status: 200,
          payload: { ok: true, list: { id: listId, ownerId: context.actorId, source_type: "user", visibility: "shared", stateRevision: state.revision } } } };
        receipts.set(expected.operationId, copy(data));
      }
    } else { const id = path.split("/").at(-1); data = copy(receipts.get(id) || unknown(id)); data = state.getProof?.(data) || data; }
    await state.hook?.(path);
    return new Response(JSON.stringify(data), { status });
  };
  const make = (options = {}) => {
    const transport = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN }, storage, locks, selection: "direct" });
    return { transport, queue: createListOperationQueue({ transport, getContext: () => ({ ...context }), enabled: true,
      operationPreparationEnabled: true, locks, fetchImpl, ...options }) };
  };
  const f = { values, storage, receipts, calls, state, context, input, body, make, prepared, unknown,
    expected: expectation({ operationId, expectedActorId: context.actorId, kind: "list.update", listId, body }),
    posts: () => calls.filter(call => call.method === "POST"), prepares: () => calls.filter(call => call.path.endsWith("/prepare")),
    businessPosts: () => calls.filter(call => call.method === "POST" && !call.path.endsWith("/prepare")),
    mutateJournal: change => { const pair = [...values].find(([, raw]) => { try { return JSON.parse(raw).id === operationId; } catch { return false; } });
      assert.ok(pair); const entry = JSON.parse(pair[1]); change(entry); values.set(pair[0], JSON.stringify(entry)); } };
  f.deny = async () => { await assert.rejects(make({ operationPreparationEnabled: false }).queue.run(input), { isPersonalSaveBlocked: true, code: "owner-access" }); };
  return f;
}

test("owner shared metadata stays personal while public/demo/shared-link views retain their edit guards", () => {
  const own = { id: listId, ownerId: "actor-a", source_type: "user", visibility: "shared" };
  assert.equal(isReadOnlyBikePackingRecord(own), false);
  assert.equal(isReadOnlyBikePackingMutationContext({ listId, records: [own] }), false);
  assert.equal(isReadOnlyBikePackingMutationContext({ listId, records: [own], readOnlyView: true }), true);
  assert.equal(isReadOnlyBikePackingRecord({ ...own, visibility: "public" }), true);
  assert.equal(isReadOnlyBikePackingRecord({ ...own, itemKey: "demo-state" }), true);
});

test("403 access refusal explains the pause without inventing rejection or losing the original request", async () => {
  const f = fixture(); let error;
  try { await f.make({ operationPreparationEnabled: false }).queue.run(f.input); } catch (caught) { error = caught; }
  assert.match(error.message, /Сервер не разрешил сохранение/); assert.equal(error.isConfirmedOperationRejection, undefined);
  assert.equal(error.isPersonalSaveBlocked, true); assert.equal(f.prepares().length, 0);
  const entry = f.make().transport.writes[0];
  assert.equal(entry.confirmed, undefined); assert.equal(entry.id, operationId); assert.deepEqual(entry.recovery.body, f.body);
  assert.equal(f.receipts.size, 0);
});

for (const mode of ["normal", "lost-ack"]) test(`cold recovery obtains durable preparation after ${mode} and retries only the original UUID/body`, async () => {
  const f = fixture(); await f.deny(); const original = copy(f.businessPosts()[0].envelope);
  f.state.allowOwner = true; f.state.prepare = mode;
  await f.make().queue.run(f.input);
  assert.equal(f.prepares().length, 1); assert.deepEqual(f.prepares()[0].envelope, original);
  assert.equal(f.businessPosts().length, 2); assert.deepEqual(f.businessPosts()[1].envelope, original);
  const preparationIndex = f.calls.findIndex(call => call.path.endsWith("/prepare"));
  const retryIndex = f.calls.findLastIndex(call => call.method === "POST");
  assert.ok(f.calls.slice(preparationIndex + 1, retryIndex).some(call => call.method === "GET" && call.path.endsWith(`/${operationId}`)));
  const before = f.posts().length;
  await f.make({ operationPreparationEnabled: false }).queue.run(f.input);
  assert.equal(f.posts().length, before, "terminal receipt reading works after rollback with no POST");
});

for (const mode of ["response-only", "denied", "newer"]) test(`prepare ${mode} cannot authorize replay while the durable operation is unknown`, async () => {
  const f = fixture(); await f.deny(); const before = [...f.values]; f.state.allowOwner = true; f.state.prepare = mode;
  await assert.rejects(f.make().queue.run(f.input));
  assert.equal(f.prepares().length, 1); assert.equal(f.businessPosts().length, 1); assert.deepEqual([...f.values], before);
});

for (const mode of ["gate-off", "cap-off", "read-only", "wrong-auth", "cancellation-only", "malformed-unknown"]) test(`${mode} retains unknown original without preparing or resending`, async () => {
  const f = fixture(); await f.deny(); f.state.allowOwner = true;
  if (mode === "cap-off") f.state.capabilities.pop();
  if (mode === "wrong-auth") f.state.authActor = "other";
  if (mode === "cancellation-only") f.mutateJournal(entry => { entry.recovery.cancellationOnly = true; });
  if (mode === "malformed-unknown") f.state.getProof = () => ({ ok: true, operation: { state: "unknown" } });
  const before = [...f.values];
  await assert.rejects(f.make({ operationPreparationEnabled: mode !== "gate-off", readOnly: mode === "read-only" }).queue.run(f.input));
  assert.equal(f.prepares().length, 0); assert.equal(f.businessPosts().length, 1); assert.deepEqual([...f.values], before);
});

for (const [name, mutate] of [
  ["actor", p => { p.operation.actorId = "other"; }], ["list", p => { p.operation.listId = "other"; }],
  ["UUID", p => { p.operation.id = crypto.randomUUID(); }], ["digest", p => { p.operation.payloadDigest = "0".repeat(64); }],
  ["kind", p => { p.operation.kind = "list.delete"; }], ["environment", p => { p.operation.environment = "production"; }],
  ["result", p => { p.result = {}; }], ["false retry", p => { p.waiting.retrySameOperation = false; }],
  ["false dependency", p => { p.waiting.operationIds.push(crypto.randomUUID()); }]
]) test(`forged prepared ${name} from GET cannot authorize replay`, async () => {
  const f = fixture(); await f.deny(); const before = [...f.values]; f.state.allowOwner = true;
  f.state.getProof = data => { if (data.operation.state === "waiting") mutate(data); return data; };
  await assert.rejects(f.make().queue.run(f.input));
  assert.equal(f.businessPosts().length, 1); assert.deepEqual([...f.values], before);
});

for (const change of ["actorId", "scopeKey", "listId", "generation", "scope", "environment", "journal-body", "journal-delete", "capability"]) {
  test(`changed ${change} during preparation prevents the original business POST`, async () => {
    const f = fixture(); await f.deny(); f.state.allowOwner = true;
    f.state.hook = path => { if (!path.endsWith("/prepare")) return;
      if (change === "journal-body") f.mutateJournal(entry => { entry.recovery.body.payload.containers.bag.name = "Replaced"; });
      else if (change === "journal-delete") { const key = [...f.values].find(([, value]) => value.includes(operationId))?.[0]; f.values.delete(key); }
      else if (change === "capability") f.state.capabilities.pop();
      else f.context[change] = "changed";
    };
    await assert.rejects(f.make().queue.run(f.input));
    assert.equal(f.prepares().length, 1); assert.equal(f.businessPosts().length, 1);
  });
}

test("prepared waiting is a distinct root-update contract and never a fabricated dependency receipt", () => {
  const f = fixture(), proof = f.prepared(f.expected);
  assert.equal(PERSONAL_LIST_OPERATION_PREPARATION_ENABLED, false);
  assert.equal(validatePreparedPersonalListOperation(proof, f.expected), true);
  assert.equal(validateWaitingOperation(proof, f.expected), false);
  for (const patch of [{ fullReplace: true }, { force: true }, { forceOverwrite: true }, { shareLink: {} }, { userDeletion: {} },
    { causal: { dependsOn: [], reads: [], baseOperationId: operationId } }, { causal: { dependsOn: [], reads: [{ listId: "other", revision: 1 }] } }]) {
    assert.equal(isPersonalListOperationPreparation({ ...f.expected, body: { ...f.body, ...patch } }), false);
  }
});

test("a fulfilled asynchronous scope assertion cannot authorize preparation", async () => {
  const f = fixture(); await f.deny(); const entry = f.make().transport.writes[0];
  await assert.rejects(preparePersonalListOperationRetry({ entry, known: f.unknown(operationId), enabled: true,
    getContext: () => f.context, getEntry: () => entry, assertContext: async () => true,
    read: () => assert.fail("No read"), request: () => assert.fail("No write") }), { code: "operation-preparation" });
});

test("three old immutable outbox actions settle after preparing only the denied root", async () => {
  const f = fixture(), outbox = createPersonalSaveOutbox({ storage: f.storage, ...f.context });
  const records = [1, 2, 3].map(index => { const payload = copy(f.body.payload); payload.containers.bag.name = `Edit ${index}`;
    return outbox.capture({ snapshot: payload, body: { baseStateRevision: 1, payload }, ...(index === 1 ? { operationId } : {}) }); });
  const initial = copy(outbox.list());
  const drain = queue => outbox.drain({ queue, getContext: () => f.context, onConfirmed: (data, record) => {
    outbox.markApplied({ operationId: record.action.operationId, stateRevision: data.list.stateRevision });
  } });
  await assert.rejects(drain(f.make({ operationPreparationEnabled: false }).queue));
  assert.deepEqual(outbox.list(), initial); f.state.allowOwner = true;
  await drain(f.make().queue);
  assert.equal(outbox.hasPending(), false); assert.equal(f.prepares().length, 1); assert.equal(f.state.revision, 4);
  assert.deepEqual(f.businessPosts().map(call => call.envelope.operationId), [operationId, ...records.map(record => record.action.operationId)]);
  for (const record of outbox.list()) assert.deepEqual(record.action, initial.find(before => before.action.operationId === record.action.operationId).action);
});
