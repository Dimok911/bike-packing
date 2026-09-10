import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createPersonalAccessClient, validatePersonalAccessReceipt } from "../../src/sync/personal-access-client.js";
import { PERSONAL_LIST_ACCESS_ENABLED, personalAccessIntent, canonicalAccessJson } from "../../src/sync/personal-access-protocol.js";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";

function fixture() {
  const values = new Map(), receipts = new Map(), calls = [], tails = new Map();
  const state = { loseAck: false, quota: false, statusUnknown: false, missingCapability: false, serverActor: "actor-a", afterPost: null };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (state.quota) throw Error("Quota"); values.set(key, value); }, removeItem: key => values.delete(key) };
  const locks = { request: (key, fn) => {
    const next = (tails.get(key) || Promise.resolve()).catch(() => {}).then(fn); tails.set(key, next); return next;
  } };
  const binding = { actorId: "actor-a", environment: "bike-packing-experiment", listId: "list-a" };
  const context = { ...binding, generation: "one", scope: "personal", scopeKey: "id:actor-a" };
  const action = () => ({ operationId: randomUUID(), kind: "access.grant", body: { version: 1, recipientEmail: "b@example.test",
    role: "viewer", token: "a".repeat(64), expectedGrant: null, dataSource: { stateRevision: 7 } } });
  const fetchImpl = async (url, options) => {
    assert.equal(options.redirect, "error"); assert.equal(options.credentials, "include");
    calls.push({ url, options }); let data;
    if (url.endsWith("/auth/me")) data = { ok: true, user: { id: state.serverActor } };
    else if (url.endsWith("/capabilities")) data = { ok: true, service: "bikepacking-api",
      capabilities: state.missingCapability ? [] : ["personalCausalListAccessV1"] };
    else if (options.method === "POST") {
      const input = JSON.parse(options.body), intent = personalAccessIntent({ actorId: input.expectedActorId, ...input });
      const { id, ...binding } = intent;
      let receipt = receipts.get(id);
      if (!receipt || receipt.operation.state === "waiting") {
        const payload = intent.kind === "access.grant" ? { ok: true, grant: { shareId: "1", grantOperationId: id,
          recipientEmail: intent.body.recipientEmail, role: intent.body.role, sourceStateRevision: 7 } }
          : intent.kind === "access.revoke" ? { ok: true, grant: intent.body.grant, revoked: true }
            : { ok: true, grant: { shareId: intent.body.shareId || "1", grantOperationId: intent.body.grantOperationId || null, role: "viewer" }, accepted: true };
        const cancel = url.endsWith("/cancel");
        receipt = { operation: { id, ...binding, body: undefined,
          payloadDigest: createHash("sha256").update(canonicalAccessJson(binding)).digest("hex"), state: cancel ? "rejected" : "committed" },
          result: { status: cancel ? 409 : 200, payload: cancel ? { ok: false, code: "operation_cancelled",
            cancellation: { version: 1, operationId: id, noBusinessEffects: true, operationCannotApply: true } } : payload } };
        delete receipt.operation.body;
        receipts.set(id, receipt);
      }
      data = { ok: true, ...receipt };
      state.afterPost?.();
      if (state.loseAck) throw Error("Lost ACK");
    } else data = { ok: true, ...(state.statusUnknown ? null : receipts.get(url.split("/").at(-1)))
      || { operation: { id: url.split("/").at(-1), state: "unknown" } } };
    return new Response(JSON.stringify(data), { status: 200 });
  };
  const make = (options = {}) => {
    const transport = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN }, selection: "direct", storage, locks, fetchImpl });
    return { transport, client: createPersonalAccessClient({ binding, getContext: () => context, transport, storage, locks, fetchImpl, enabled: true, ...options }) };
  };
  return { action, make, values, storage, locks, receipts, calls, state, binding, context,
    posts: () => calls.filter(call => call.options.method === "POST") };
}

test("access capture is independently OFF; no lock, storage or network claim is made", async () => {
  assert.equal(PERSONAL_LIST_ACCESS_ENABLED, false);
  const f = fixture(), { client } = f.make({ enabled: false });
  await assert.rejects(client.capture(f.action()));
  assert.equal(f.values.size, 0); assert.equal(f.calls.length, 0);
});
test("intent and secret freeze before an async wait and cannot be replaced under the same ID", async () => {
  const f = fixture(), { client } = f.make(), action = f.action(), pending = client.capture(action);
  action.body.role = "editor"; const saved = await pending;
  assert.equal(saved.intent.body.role, "viewer");
  await assert.rejects(client.capture(action));
  assert.equal((await client.read(action.operationId)).intent.body.role, "viewer");
  assert.equal(f.posts().length, 0);
});
test("lost ACK and cold client recover exactly one POST and retain its original invitation privately", async () => {
  const f = fixture(), first = f.make(), action = f.action(); await first.client.capture(action); f.state.loseAck = true;
  const result = await first.client.run(action.operationId); assert.equal(result.operation.state, "committed");
  const cold = f.make(); assert.deepEqual(await cold.client.run(action.operationId), result);
  assert.equal(f.posts().length, 1);
  assert.equal(JSON.stringify(cold.transport.writes).includes(action.body.token), false);
  assert.equal((await cold.client.read(action.operationId)).intent.body.token, action.body.token);
});
test("concurrent tabs capture/run one immutable ID without double submission", async () => {
  const f = fixture(), one = f.make().client, two = f.make().client, action = f.action();
  await Promise.all([one.capture(action), two.capture(action)]);
  const results = await Promise.all([one.run(action.operationId), two.run(action.operationId)]);
  assert.deepEqual(results[0], results[1]); assert.equal(f.posts().length, 1);
});
test("quota before dispatch and a server account switch each preserve intent without a POST", async () => {
  const f = fixture(), { client } = f.make(), action = f.action(); await client.capture(action);
  const before = [...f.values]; f.state.quota = true;
  await assert.rejects(client.run(action.operationId)); assert.equal(f.posts().length, 0); assert.deepEqual([...f.values], before);
  f.state.quota = false; f.state.serverActor = "actor-b";
  await assert.rejects(client.run(action.operationId)); assert.equal(f.posts().length, 0);
});
test("context changes and quota after a committed POST cannot cause old state adoption or a second POST", async () => {
  for (const mode of ["context", "quota"]) {
    const f = fixture(), { client } = f.make(), action = f.action(); await client.capture(action);
    f.state.afterPost = () => { if (mode === "context") f.context.generation = "two"; else f.state.quota = true; };
    await assert.rejects(client.run(action.operationId));
    f.state.afterPost = null; f.context.generation = "one"; f.state.quota = false;
    assert.equal((await f.make().client.run(action.operationId)).operation.state, "committed"); assert.equal(f.posts().length, 1);
  }
});
test("own gate OFF allows exact historical reading but no capture, send or cancellation", async () => {
  const f = fixture(), { client } = f.make(), action = f.action(); await client.capture(action); const done = await client.run(action.operationId);
  const off = f.make({ enabled: false }).client;
  assert.deepEqual(await off.inspect(action.operationId), done);
  await assert.rejects(off.run(action.operationId)); await assert.rejects(off.cancel(action.operationId));
  assert.equal(f.posts().length, 1);
});
test("missing server capability leaves durable choice unclaimed; malformed local record is preserved", async () => {
  const f = fixture(), { client } = f.make(), action = f.action(); await client.capture(action); f.state.missingCapability = true;
  await assert.rejects(client.run(action.operationId)); assert.equal(f.posts().length, 0);
  const key = [...f.values.keys()][0]; f.values.set(key, "{broken");
  await assert.rejects(client.run(action.operationId)); assert.equal(f.values.get(key), "{broken"); assert.equal(f.posts().length, 0);
});
test("unknown historical status cannot resend an already terminal local record", async () => {
  const f = fixture(), { client } = f.make(), action = f.action(); await client.capture(action); await client.run(action.operationId);
  f.state.statusUnknown = true;
  await assert.rejects(f.make().client.run(action.operationId)); assert.equal(f.posts().length, 1);
});
test("cancellation choice survives lost response and cold start without ever executing the original grant", async () => {
  const f = fixture(), { client } = f.make(), action = f.action(); await client.capture(action);
  f.state.loseAck = true; f.state.statusUnknown = true;
  await assert.rejects(client.cancel(action.operationId)); f.state.statusUnknown = false;
  const result = await f.make().client.run(action.operationId);
  assert.equal(result.result.payload.code, "operation_cancelled");
  assert.equal(f.posts().length, 1); assert.ok(f.posts()[0].url.endsWith("/cancel"));
});
test("malformed or cross-actor receipt cannot settle an exact intent or reveal a different role", async () => {
  const f = fixture(), { client } = f.make(), action = f.action(); const saved = await client.capture(action);
  const done = await client.run(action.operationId);
  for (const mutate of [
    value => { value.operation.actorId = "other"; }, value => { value.operation.payloadDigest = "b".repeat(64); },
    value => { value.result.payload.grant.role = "editor"; }, value => { value.result.payload.grant.grantOperationId = randomUUID(); },
    value => { value.result.payload.grant.sourceStateRevision = 8; }, value => { value.result.payload.token = action.body.token; },
  ]) { const invalid = structuredClone(done); mutate(invalid); assert.equal(validatePersonalAccessReceipt(invalid, saved), false); }
});
test("only recognized same-actor causal peers may coexist with an unknown access request", async () => {
  for (const peer of [
    { type: "list", protocol: "causal-v1", actorId: "actor-a", allowed: true },
    { type: "photo-stage", protocol: "staging-v1", actorId: "actor-a", allowed: true },
    { type: "list", protocol: "causal-v1", actorId: "actor-b", allowed: false },
    { type: "photo", protocol: "legacy", actorId: "actor-a", allowed: false },
  ]) {
    const f = fixture(), { client, transport } = f.make(), action = f.action(), { allowed, ...recovery } = peer;
    const id = randomUUID();
    await transport.beginWrite("/bike-packing/lists/another-list", "PUT", null, { ...recovery, operationId: id });
    transport.noteFailure(Error("Lost unrelated ACK"), "/bike-packing/lists/another-list", "PUT", id);
    await client.capture(action);
    if (allowed) assert.equal((await client.run(action.operationId)).operation.state, "committed");
    else await assert.rejects(client.run(action.operationId));
    assert.equal(f.posts().length, allowed ? 1 : 0);
  }
});
test("read-only inspection of a waiting receipt never resumes an unfinished grant", async () => {
  const f = fixture(), { client } = f.make(), action = f.action(); action.body.dataSource = { operationId: randomUUID() };
  const saved = await client.capture(action);
  const { body, ...metadata } = saved.intent;
  const waiting = { operation: { ...metadata, payloadDigest: saved.payloadDigest, state: "waiting" }, result: null,
    waiting: { code: "access_dependency_not_committed", operationIds: [action.body.dataSource.operationId], retrySameOperation: true } };
  f.receipts.set(action.operationId, waiting);
  assert.deepEqual(await f.make({ enabled: false }).client.inspect(action.operationId), waiting);
  assert.equal(f.posts().length, 0);
});
test("a changed terminal receipt cannot overwrite the earlier proof or clear its immutable choice", async () => {
  const f = fixture(), { client } = f.make(), action = f.action(); await client.capture(action); const done = await client.run(action.operationId);
  const changed = structuredClone(done);
  changed.result.payload.grant.shareId = "2"; f.receipts.set(action.operationId, changed);
  await assert.rejects(f.make().client.inspect(action.operationId));
  assert.deepEqual((await client.read(action.operationId)).receipt, done); assert.equal(f.posts().length, 1);
});
