import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { validateAdminTemplateReceipt } from "../../src/sync/admin-template-client.js";
import { ADMIN_TEMPLATE_OPERATIONS_ENABLED } from "../../src/sync/admin-template-protocol.js";

import { adminClientFixture as fixture } from "../fixtures/admin-template-client-fixture.js";

test("a fetch failure preserves its original error and retained operation for recovery", async () => {
  const f = fixture(), action = f.action(), failure = new TypeError("Interrupted request");
  const client = f.make({ fetchImpl: () => Promise.reject(failure) }).client;
  const saved = await client.capture(action);
  await assert.rejects(client.run(action.operationId), error => error === failure);
  const retained = await client.read(action.operationId);
  assert.deepEqual(retained.intent, saved.intent); assert.equal(retained.receipt, null); assert.equal(retained.dispatched, false);
  assert.equal(f.posts().length, 0);
  assert.equal((await f.make().client.run(action.operationId)).operation.state, "committed");
  assert.equal(f.posts().length, 1);
});

for (const event of ["beforeunload", "pagehide"]) test(`${event} aborts the active attempt and retains the original operation`, async () => {
  const f = fixture(), lifecycleTarget = new EventTarget(), action = f.action(); let listening = 0;
  const add = lifecycleTarget.addEventListener.bind(lifecycleTarget), remove = lifecycleTarget.removeEventListener.bind(lifecycleTarget);
  lifecycleTarget.addEventListener = (...args) => { listening++; return add(...args); };
  lifecycleTarget.removeEventListener = (...args) => { listening--; return remove(...args); };
  const client = f.make({ lifecycleTarget, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    queueMicrotask(() => lifecycleTarget.dispatchEvent(new Event(event)));
  }) }).client;
  await client.capture(action);
  await assert.rejects(client.run(action.operationId), error => error.name === "AbortError");
  assert.equal(listening, 0); assert.equal((await client.read(action.operationId)).receipt, null); assert.equal(f.posts().length, 0);
  assert.equal((await f.make().client.run(action.operationId)).operation.state, "committed");
  assert.equal(f.posts().length, 1);
});

for (const event of ["beforeunload", "pagehide"]) {
  test(`${event} between requests stops the next fetch, including after a lock wait`, async () => {
    for (const phase of ["lock", "body"]) {
      const f = fixture(), lifecycleTarget = new EventTarget(), action = f.action();
      await f.make().client.capture(action);
      let fetches = 0;
      const client = f.make({ lifecycleTarget,
        ...(phase === "lock" ? { locks: { request: async (_key, task) => {
          lifecycleTarget.dispatchEvent(new Event(event)); return task();
        } } } : {}),
        fetchImpl: async () => {
          fetches++;
          return { status: 200, json: async () => {
            lifecycleTarget.dispatchEvent(new Event(event));
            return { ok: true, user: { id: f.binding.actorId } };
          } };
        },
      }).client;
      await assert.rejects(client.run(action.operationId), error => error.name === "AbortError");
      assert.equal(fetches, phase === "lock" ? 0 : 1);
      assert.equal((await client.read(action.operationId)).receipt, null);
      assert.equal(f.posts().length, 0);
    }
  });

  test(`${event} after POST retains uncertainty and a later attempt checks the same receipt`, async () => {
    const f = fixture(), lifecycleTarget = new EventTarget(), action = f.action();
    const client = f.make({ lifecycleTarget }).client;
    await client.capture(action);
    f.state.afterPost = () => lifecycleTarget.dispatchEvent(new Event(event));
    await assert.rejects(client.run(action.operationId), error => error.name === "AbortError");
    assert.equal(f.posts().length, 1);
    const retained = await client.read(action.operationId);
    assert.equal(retained.receipt, null); assert.equal(retained.dispatched, true);
    assert.equal(f.calls.at(-1).options.method, "POST");
    f.state.afterPost = null;
    // Covers a cancelled navigation or a restored document using the same client.
    assert.equal((await client.run(action.operationId)).operation.state, "committed");
    assert.equal(f.posts().length, 1);
  });
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

test("source-checked save requires its own capability and retains the exact source after lost ACK", async () => {
  const f = fixture(), client = f.make().client, action = f.action();
  action.body.source = { itemKey: "shared-layout:source", listId: "public-shared-layout-source", base: { stateRevision: 3 }, payloadDigest: "a".repeat(64) };
  await client.capture(action); f.state.copyCapability = true;
  await assert.rejects(client.run(action.operationId)); assert.equal(f.posts().length, 0);
  f.state.sourceSaveCapability = true; f.state.lose = true;
  const receipt = await client.run(action.operationId); f.state.sourceSaveCapability = false;
  assert.deepEqual(await f.make().client.run(action.operationId), receipt); assert.equal(f.posts().length, 1);
  assert.deepEqual(JSON.parse(f.posts()[0].options.body).body.source, action.body.source);
});

test("personal source needs explicit server capability; terminal replay works after it is disabled", async () => {
  const f = fixture(), action = f.action(), client = f.make().client;
  action.body.source = { kind: "personal-list", listId: "personal-source", base: { stateRevision: 3 }, payloadDigest: "b".repeat(64) };
  f.state.sourceSaveCapability = true; await client.capture(action);
  await assert.rejects(client.run(action.operationId)); assert.equal(f.posts().length, 0);
  f.state.personalSourceCapability = true; f.state.lose = true;
  const receipt = await client.run(action.operationId); f.state.personalSourceCapability = false;
  assert.deepEqual(await f.make().client.run(action.operationId), receipt);
  assert.equal(f.posts().length, 1); assert.deepEqual(JSON.parse(f.posts()[0].options.body).body.source, action.body.source);
});

test("private source preparation uses the guarded read client without a write journal", async () => {
  const f = fixture();
  f.state.personalPrepared = { ok: true, actorId: f.binding.actorId, environment: f.binding.environment,
    listId: "personal-source", stateRevision: 3, payload: { items: {} }, payloadDigest: "a".repeat(64) };
  const client = f.make({ enabled: false }).client;
  assert.deepEqual(await client.preparePersonalSource("personal-source"), f.state.personalPrepared);
  assert.equal(f.values.size, 0); assert.equal(f.receipts.size, 0);
  assert.deepEqual(JSON.parse(f.posts()[0].options.body), { personalListId: "personal-source" });
  for (const change of [{ actorId: "other" }, { environment: "production" }, { listId: "other" }]) {
    const original = f.state.personalPrepared; f.state.personalPrepared = { ...original, ...change };
    await assert.rejects(client.preparePersonalSource("personal-source")); f.state.personalPrepared = original;
  }
  await assert.rejects(client.preparePersonalSource("public-demo-state"));
  f.state.afterPersonalPrepare = () => { f.context.generation = "changed"; };
  await assert.rejects(client.preparePersonalSource("personal-source"));
  assert.equal(f.values.size, 0); assert.equal(f.receipts.size, 0);
});

test("pending template source waits for its captured predecessor across reload and cannot accept unrelated waiting receipts", async () => {
  const f = fixture(), action = f.action(), parentId = randomUUID();
  action.body.source = { itemKey: "shared-layout:source", listId: "public-shared-layout-source",
    base: { operationId: parentId }, payloadDigest: "c".repeat(64) };
  f.state.sourceSaveCapability = true;
  const client = f.make().client, saved = await client.capture(action);
  await assert.rejects(client.run(action.operationId)); assert.equal(f.posts().length, 0);
  f.state.pendingSourceCapability = true; f.state.pendingSource = true;
  const waiting = await client.run(action.operationId);
  assert.equal(waiting.operation.state, "waiting");
  assert.deepEqual(waiting.waiting.operationIds, [parentId]);
  assert.equal(validateAdminTemplateReceipt(waiting, saved), true);
  assert.equal(validateAdminTemplateReceipt({ ...waiting, waiting: { ...waiting.waiting, operationIds: [randomUUID()] } }, saved), false);
  assert.deepEqual(await f.make().client.run(action.operationId), waiting);
  f.state.pendingSource = false; f.state.lose = true;
  const receipt = await f.make().client.run(action.operationId);
  assert.equal(receipt.operation.state, "committed");
  f.state.pendingSourceCapability = false;
  assert.deepEqual(await f.make().client.run(action.operationId), receipt);
  assert.equal(f.posts().length, 3);
  for (const post of f.posts()) assert.deepEqual(JSON.parse(post.options.body).body.source, action.body.source);
});

test("pending source cancellation freezes rejection without waiting for the source", async () => {
  const f = fixture(), action = f.action();
  action.body.source = { itemKey: "shared-layout:source", listId: "public-shared-layout-source",
    base: { operationId: randomUUID() }, payloadDigest: "d".repeat(64) };
  f.state.sourceSaveCapability = true; f.state.pendingSourceCapability = true; f.state.pendingSource = true;
  const client = f.make().client; await client.capture(action);
  assert.equal((await client.run(action.operationId)).operation.state, "waiting");
  const receipt = await f.make().client.cancel(action.operationId);
  assert.equal(receipt.result.payload.code, "operation_cancelled");
  f.state.pendingSource = false;
  assert.deepEqual(await f.make().client.run(action.operationId), receipt);
  assert.equal(f.posts().length, 2);
});

test("pending personal source needs its own capability and retains the exact private dependency through recovery", async () => {
  const f = fixture(), action = f.action(), parentId = randomUUID();
  action.body.source = { kind: "personal-list", listId: "personal-pending", base: { operationId: parentId }, payloadDigest: "e".repeat(64) };
  f.state.sourceSaveCapability = true; f.state.personalSourceCapability = true; f.state.pendingSourceCapability = true;
  const client = f.make().client; await client.capture(action);
  await assert.rejects(client.run(action.operationId)); assert.equal(f.posts().length, 0);
  f.state.pendingPersonalSourceCapability = true; f.state.pendingSource = true;
  const waiting = await client.run(action.operationId); assert.equal(waiting.operation.state, "waiting");
  assert.deepEqual(waiting.waiting.operationIds, [parentId]);
  assert.deepEqual(await f.make().client.run(action.operationId), waiting);
  f.state.pendingSource = false; f.state.lose = true;
  const receipt = await f.make().client.run(action.operationId); assert.equal(receipt.operation.state, "committed");
  f.state.pendingPersonalSourceCapability = false;
  assert.deepEqual(await f.make().client.run(action.operationId), receipt);
  assert.equal(f.posts().length, 3);
  for (const post of f.posts()) assert.deepEqual(JSON.parse(post.options.body).body.source, action.body.source);
});

test("pending personal source cancellation remains final after its predecessor becomes available", async () => {
  const f = fixture(), action = f.action();
  action.body.source = { kind: "personal-list", listId: "personal-pending", base: { operationId: randomUUID() }, payloadDigest: "f".repeat(64) };
  Object.assign(f.state, { sourceSaveCapability: true, personalSourceCapability: true, pendingSourceCapability: true, pendingPersonalSourceCapability: true, pendingSource: true });
  const client = f.make().client; await client.capture(action); assert.equal((await client.run(action.operationId)).operation.state, "waiting");
  const receipt = await f.make().client.cancel(action.operationId); assert.equal(receipt.result.payload.code, "operation_cancelled");
  f.state.pendingSource = false; assert.deepEqual(await f.make().client.run(action.operationId), receipt);
  assert.equal(f.posts().length, 2);
});
