import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createAdminTemplateClient, validateAdminTemplateReceipt } from "../../src/sync/admin-template-client.js";
import { adminTemplateIntent, canonicalTemplateJson, ADMIN_TEMPLATE_OPERATIONS_ENABLED } from "../../src/sync/admin-template-protocol.js";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";

function fixture() {
  const values = new Map(), receipts = new Map(), calls = [], tails = new Map();
  const state = { lose: false, hidden: false, quota: false, admin: true, actor: "admin-a", afterPost: null, capability: true };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (state.quota) throw Error("Quota"); values.set(key, value); }, removeItem: key => values.delete(key) };
  const locks = { request: (key, fn) => { const next = (tails.get(key) || Promise.resolve()).catch(() => {}).then(fn); tails.set(key, next); return next; } };
  const binding = { actorId: "admin-a", environment: "bike-packing-experiment", listId: "public-demo-state-a", itemKey: "demo-state:a" };
  const context = { ...binding, generation: "one", scope: "admin-template", admin: true };
  const action = () => ({ operationId: randomUUID(), kind: "template.save", body: { version: 1, base: { stateRevision: 7 },
    payload: { items: { a: { id: "a", name: "Captured name" } } }, metadata: { title: "Captured draft", description: "Private draft text", language: "ru" } } });
  const fetchImpl = async (url, options) => {
    calls.push({ url, options }); let data;
    assert.equal(options.redirect, "error"); assert.equal(options.credentials, "include");
    if (url.endsWith("/auth/me")) data = { ok: true, user: { id: state.actor } };
    else if (url.endsWith("/authorization")) data = { ok: true, authorization: { version: 1, role: state.admin ? "admin" : "user", capabilities: state.admin ? ["templates:write"] : [] } };
    else if (url.endsWith("/capabilities")) data = { ok: true, service: "bikepacking-api", capabilities: state.capability ? ["adminTemplateCausalOperationsV1"] : [] };
    else if (options.method === "POST") {
      const input = JSON.parse(options.body), intent = adminTemplateIntent({ actorId: input.expectedActorId, ...input });
      const { id, ...bound } = intent, { body, ...identity } = bound;
      if (!receipts.has(id) || receipts.get(id).operation.state === "waiting") {
        const cancel = url.endsWith("/cancel");
        const payload = { ok: true, listId: intent.listId, itemKey: intent.itemKey, stateRevision: body.base?.stateRevision + 1 || 1,
          ...(intent.kind === "template.delete" ? { deleted: true } : { visibility: intent.kind === "template.publication" && body.published ? "public" : "private" }),
          indexes: (body.indexes || []).map(index => ({ listId: index.listId, stateRevision: index.base.stateRevision + 1 })) };
        receipts.set(id, { operation: { id, ...identity, payloadDigest: createHash("sha256").update(canonicalTemplateJson(bound)).digest("hex"), state: cancel ? "rejected" : "committed" },
          result: { status: cancel ? 409 : 200, payload: cancel ? { ok: false, code: "operation_cancelled",
            cancellation: { version: 1, operationId: id, noBusinessEffects: true, operationCannotApply: true } } : payload } });
      }
      data = { ok: true, ...receipts.get(id) }; state.afterPost?.(); if (state.lose) throw Error("Lost ACK");
    } else data = { ok: true, ...(!state.hidden && receipts.get(url.split("/").at(-1)) || { operation: { id: url.split("/").at(-1), state: "unknown" } }) };
    return new Response(JSON.stringify(data), { status: 200 });
  };
  const make = (options = {}) => {
    const transport = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN }, selection: "direct", storage, locks, fetchImpl });
    return { transport, client: createAdminTemplateClient({ binding, getContext: () => context, transport, storage, locks, fetchImpl, enabled: true, ...options }) };
  };
  return { state, values, receipts, binding, context, action, make, calls, posts: () => calls.filter(call => call.options.method === "POST") };
}

test("admin capture is independently OFF and cannot use a personal-owner context", async () => {
  assert.equal(ADMIN_TEMPLATE_OPERATIONS_ENABLED, false);
  const f = fixture(); await assert.rejects(f.make({ enabled: false }).client.capture(f.action()));
  f.context.scope = "personal"; await assert.rejects(f.make().client.capture(f.action()));
  assert.equal(f.values.size, 0); assert.equal(f.calls.length, 0);
});
test("candidate, target and version freeze before a wait; same UUID rejects replacement", async () => {
  const f = fixture(), client = f.make().client, action = f.action(), pending = client.capture(action);
  action.body.metadata.title = "Later title"; action.body.payload.items.a.name = "Later item";
  const saved = await pending; assert.equal(saved.intent.body.metadata.title, "Captured draft");
  assert.equal(saved.intent.body.payload.items.a.name, "Captured name"); await assert.rejects(client.capture(action));
  assert.equal((await client.list()).length, 1); assert.equal(f.posts().length, 0);
});
test("lost ACK and reload recover one original request; transport never contains private template data", async () => {
  const f = fixture(), first = f.make(), action = f.action(); await first.client.capture(action); f.state.lose = true;
  const receipt = await first.client.run(action.operationId), cold = f.make();
  assert.deepEqual(await cold.client.run(action.operationId), receipt); assert.equal(f.posts().length, 1);
  assert.equal(JSON.stringify(cold.transport.writes).includes("Private draft text"), false);
  assert.equal((await cold.client.read(action.operationId)).intent.body.metadata.description, "Private draft text");
});
test("two tabs sharing native-style locks produce one POST and one unchanged receipt", async () => {
  const f = fixture(), first = f.make().client, second = f.make().client, action = f.action();
  await Promise.all([first.capture(action), second.capture(action)]);
  const [one, two] = await Promise.all([first.run(action.operationId), second.run(action.operationId)]);
  assert.deepEqual(one, two); assert.equal(f.posts().length, 1);
});
test("quota, server actor, admin authority and missing capability each stop before business dispatch", async () => {
  for (const mode of ["quota", "actor", "admin", "capability"]) {
    const f = fixture(), client = f.make().client, action = f.action(); await client.capture(action);
    f.state[mode] = mode === "actor" ? "admin-b" : mode === "quota";
    await assert.rejects(client.run(action.operationId)); assert.equal(f.posts().length, 0);
  }
});
test("route, account, admin-mode changes and quota after POST prevent adopting an old acknowledgement", async () => {
  for (const mode of ["generation", "actorId", "admin", "quota"]) {
    const f = fixture(), client = f.make().client, action = f.action(); await client.capture(action);
    f.state.afterPost = () => { if (mode === "quota") f.state.quota = true; else f.context[mode] = mode === "admin" ? false : "changed"; };
    await assert.rejects(client.run(action.operationId)); assert.equal(f.posts().length, 1);
    f.state.afterPost = null; f.state.quota = false; Object.assign(f.context, { ...f.binding, generation: "one", admin: true });
    assert.equal((await f.make().client.run(action.operationId)).operation.state, "committed"); assert.equal(f.posts().length, 1);
  }
});
test("durable cancellation never resumes the original save after uncertain cancellation", async () => {
  const f = fixture(), first = f.make().client, action = f.action(); await first.capture(action); f.state.lose = true; f.state.hidden = true;
  await assert.rejects(first.cancel(action.operationId));
  f.state.lose = false; f.state.hidden = false;
  const receipt = await f.make().client.run(action.operationId); assert.equal(receipt.result.payload.code, "operation_cancelled");
  assert.equal(f.posts().length, 1); assert.ok(f.posts()[0].url.endsWith("/cancel"));
});
test("a saved terminal result cannot be replaced by unknown or changed server history", async () => {
  const f = fixture(), first = f.make().client, action = f.action(); await first.capture(action); await first.run(action.operationId);
  f.state.hidden = true; await assert.rejects(f.make().client.run(action.operationId)); assert.equal(f.posts().length, 1);
  f.state.hidden = false; f.receipts.get(action.operationId).result.payload.visibility = "public";
  await assert.rejects(f.make().client.run(action.operationId)); assert.equal(f.posts().length, 1);
});
test("receipt validation rejects another target, revision, publication, partial index set and unexpected dependency", async () => {
  const f = fixture(), client = f.make().client, action = f.action(); action.kind = "template.publication";
  action.body = { version: 1, base: { stateRevision: 7 }, published: true, indexes: [] };
  const saved = await client.capture(action), receipt = await client.run(action.operationId);
  for (const change of [{ listId: "public-demo-state-b" }, { stateRevision: 7 }, { visibility: "private" }, { indexes: [{ listId: "public-demo-state-b", stateRevision: 9 }] }]) {
    const bad = structuredClone(receipt); Object.assign(bad.result.payload, change); assert.equal(validateAdminTemplateReceipt(bad, saved), false);
  }
  assert.equal(validateAdminTemplateReceipt({ operation: { ...receipt.operation, state: "waiting" }, result: null,
    waiting: { code: "template_dependency_not_committed", operationIds: [randomUUID()], retrySameOperation: true } }, saved), false);
});
test("OFF still reads an accepted receipt; corrupt persisted input cannot dispatch", async () => {
  const f = fixture(), client = f.make().client, action = f.action(); await client.capture(action); const receipt = await client.run(action.operationId);
  assert.deepEqual(await f.make({ enabled: false }).client.inspect(action.operationId), receipt);
  const key = [...f.values.keys()].find(value => value.startsWith("bike-packing-admin-template-v1:"));
  const saved = JSON.parse(f.values.get(key)); saved.intent.body.metadata.title = "Corrupt"; f.values.set(key, JSON.stringify(saved));
  await assert.rejects(f.make().client.run(action.operationId)); assert.equal(f.posts().length, 1);
});
test("independent admin targets continue during known admin uncertainty; legacy and foreign actors remain barriers", async () => {
  const f = fixture(), first = f.make(), action = f.action(); await first.client.capture(action); f.state.hidden = true; f.state.lose = true;
  await assert.rejects(first.client.run(action.operationId)); f.state.lose = false; f.state.hidden = false;
  const secondBinding = { ...f.binding, listId: "public-demo-state-b", itemKey: "demo-state:b" };
  const second = f.make({ binding: secondBinding, getContext: () => ({ ...f.context, ...secondBinding }) }).client;
  const next = f.action(); await second.capture(next); assert.equal((await second.run(next.operationId)).operation.state, "committed");
  const foreign = f.make({ binding: { ...secondBinding, actorId: "admin-b" }, getContext: () => ({ ...f.context, ...secondBinding, actorId: "admin-b" }) }).client;
  f.state.actor = "admin-b"; const other = f.action(); await foreign.capture(other); await assert.rejects(foreign.run(other.operationId));
  assert.equal(f.posts().length, 2);
});
