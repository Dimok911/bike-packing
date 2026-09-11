import test from "node:test";
import assert from "node:assert/strict";
import { createAdminTemplateClient, validateAdminTemplateReceipt } from "../../src/sync/admin-template-client.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";
import { adminPhotoEditFixture, photoEditStorage, copy, hash } from "../fixtures/admin-template-photo-edit-fixture.js";

function fixture() {
  const f = adminPhotoEditFixture(), persistence = photoEditStorage(), calls = [], posts = [];
  const context = { ...f.binding, scope: "admin-template", admin: true, generation: "one" };
  const server = { receipt: null, lose: false, hidden: false, capability: true, corrupt: null, afterPost: null, beforeJson: null };
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname; calls.push({ path, method: options.method || "GET" }); let data;
    if (path.endsWith("/auth/me")) data = { ok: true, user: { id: f.binding.actorId } };
    else if (path.endsWith("/authorization")) data = { ok: true, authorization: { version: 1, role: "admin", capabilities: ["templates:write"] } };
    else if (path.endsWith("/capabilities")) data = { ok: true, service: "bikepacking-api", capabilities: ["adminTemplateCausalOperationsV1", ...(server.capability ? ["adminTemplatePhotoEditV1"] : [])] };
    else if (options.method === "POST") {
      const envelope = JSON.parse(options.body); posts.push({ path, body: options.body, envelope });
      assert.equal(envelope.operationId, f.action.operationId); assert.deepEqual(envelope.body, f.body);
      if (!server.receipt) {
        server.receipt = copy(f.receipt);
        if (path.endsWith("/cancel")) {
          server.receipt.operation.state = "rejected";
          server.receipt.result = { status: 409, payload: { ok: false, code: "operation_cancelled",
            cancellation: { version: 1, operationId: f.action.operationId, noBusinessEffects: true, operationCannotApply: true } } };
        }
      }
      server.corrupt?.(server.receipt); server.afterPost?.(); if (server.lose) throw Error("Lost ACK");
      data = { ok: true, ...server.receipt };
    } else data = { ok: true, ...(!server.hidden && server.receipt || { operation: { id: f.action.operationId, state: "unknown" } }) };
    return { status: 200, json: async () => { server.beforeJson?.(path); return copy(data); } };
  };
  const make = options => {
    const transport = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN }, selection: "direct", ...persistence, fetchImpl });
    return { transport, client: createAdminTemplateClient({ binding: f.binding, getContext: () => context, ...persistence,
      transport, fetchImpl, enabled: true, photoEditEnabled: true, ...options }) };
  };
  return { ...f, ...persistence, context, server, calls, posts, make };
}

test("edit capture and save preserve the original body and read the complete proof with the photo gate OFF", async () => {
  const f = fixture(), { client } = f.make(), captured = await client.capture(f.action);
  assert.equal(Object.hasOwn(captured, "photoStages"), false);
  assert.deepEqual(await client.run(f.action.operationId), f.receipt);
  const cold = f.make({ photoEditEnabled: false });
  assert.deepEqual((await cold.client.read(f.action.operationId)).receipt, f.receipt);
  assert.deepEqual(await cold.client.inspect(f.action.operationId), f.receipt);
  assert.deepEqual(await cold.client.run(f.action.operationId), f.receipt);
  assert.equal(f.posts.length, 1); assert.equal(f.calls.some(row => row.path.includes("photo-assets")), false);
});

test("photo gate OFF, personal context or missing server capability never send a business POST", async () => {
  const f = fixture(); await assert.rejects(f.make({ photoEditEnabled: false }).client.capture(f.action));
  assert.equal(f.values.size, 0);
  f.context.scope = "personal"; await assert.rejects(f.make().client.capture(f.action)); f.context.scope = "admin-template";
  const { client } = f.make(); await client.capture(f.action); f.server.capability = false;
  await assert.rejects(client.run(f.action.operationId)); assert.equal(f.posts.length, 0);
  f.server.capability = true; await assert.rejects(f.make({ photoEditEnabled: false }).client.run(f.action.operationId));
  assert.equal(f.posts.length, 0);
});

test("lost ACK is reconciled with GET; a cold unknown retry keeps the same UUID and byte-identical body", async () => {
  for (const hidden of [false, true]) {
    const f = fixture(), { client } = f.make(); await client.capture(f.action); f.server.lose = true; f.server.hidden = hidden;
    if (hidden) await assert.rejects(client.run(f.action.operationId)); else assert.deepEqual(await client.run(f.action.operationId), f.receipt);
    assert.equal(f.posts.length, 1);
    if (hidden) {
      f.server.lose = false;
      assert.deepEqual(await f.make().client.run(f.action.operationId), f.receipt);
      assert.equal(f.posts.length, 2); assert.equal(f.posts[0].body, f.posts[1].body);
    } else assert.deepEqual(await f.make().client.run(f.action.operationId), f.receipt);
  }
});

test("lost cancellation ACK remains cancellation after reload and cannot resume the original save", async () => {
  const f = fixture(), { client } = f.make(); await client.capture(f.action); f.server.lose = true; f.server.hidden = true;
  await assert.rejects(client.cancel(f.action.operationId)); assert.equal((await client.read(f.action.operationId)).cancelRequested, true);
  f.server.lose = false; f.server.hidden = false;
  const receipt = await f.make({ photoEditEnabled: false }).client.run(f.action.operationId);
  assert.equal(receipt.result.payload.code, "operation_cancelled"); assert.equal(f.posts.length, 1); assert.equal(f.posts[0].path.endsWith("/cancel"), true);
});

test("a complete receipt with wrong raw data, revision, visibility or digest never confirms transport", async () => {
  for (const mutate of [r => { r.result.payload.photoEdit.confirmedPayload.opaque = {}; r.result.payload.photoEdit.confirmedPayloadDigest = hash(r.result.payload.photoEdit.confirmedPayload); },
    r => { r.result.payload.photoEdit.confirmedPayloadDigest = "0".repeat(64); }, r => { r.result.payload.stateRevision++; },
    r => { r.result.payload.visibility = "public"; }, r => { r.operation.actorId = "other"; }]) {
    const f = fixture(), { client, transport } = f.make(); await client.capture(f.action); f.server.corrupt = mutate;
    await assert.rejects(client.run(f.action.operationId)); assert.equal((await client.read(f.action.operationId)).receipt, null);
    assert.notEqual(transport.writes.find(row => row.id === f.action.operationId)?.confirmed, true);
  }
});

test("cold read recomputes the confirmed payload digest and cannot accept a merely structural receipt", async () => {
  const f = fixture(), { client } = f.make(); await client.capture(f.action); await client.run(f.action.operationId);
  const key = [...f.values.keys()].find(value => value.startsWith("bike-packing-admin-template-v1:")), saved = JSON.parse(f.values.get(key));
  saved.receipt.result.payload.photoEdit.confirmedPayloadDigest = "0".repeat(64);
  assert.equal(validateAdminTemplateReceipt(saved.receipt, saved), true, "The containing validator is structural; the client additionally hashes the extension");
  f.values.set(key, JSON.stringify(saved)); await assert.rejects(f.make({ photoEditEnabled: false }).client.read(f.action.operationId));
});

test("context changes after the server commits preserve the original pending receipt until the original actor returns", async () => {
  const f = fixture(), { client } = f.make(); await client.capture(f.action);
  f.server.afterPost = () => { f.context.generation = "other-tab"; };
  await assert.rejects(client.run(f.action.operationId)); assert.equal(f.posts.length, 1);
  assert.equal((await f.make().client.read(f.action.operationId)).receipt, null);
  f.server.afterPost = null;
  assert.deepEqual(await f.make().client.run(f.action.operationId), f.receipt); assert.equal(f.posts.length, 1);
});

test("two clients sharing native-style locks send one original edit and receive the same proof", async () => {
  const f = fixture(), one = f.make().client, two = f.make().client;
  await Promise.all([one.capture(f.action), two.capture(f.action)]);
  const results = await Promise.all([one.run(f.action.operationId), two.run(f.action.operationId)]);
  assert.deepEqual(results, [f.receipt, f.receipt]); assert.equal(f.posts.length, 1);
});

test("with the edit flag OFF capture can only read an already identical action, even when storage is full", async () => {
  const f = fixture(), saved = await f.make().client.capture(f.action), cold = f.make({ photoEditEnabled: false }).client;
  const before = [...f.values]; f.controls.quota = true;
  assert.deepEqual(await cold.capture(f.action), saved); assert.deepEqual([...f.values], before);
  const changed = copy(f.action); changed.body.metadata.title = "Different intent";
  await assert.rejects(cold.capture(changed));
  const newAction = copy(f.action); newAction.operationId = crypto.randomUUID();
  await assert.rejects(cold.capture(newAction)); assert.deepEqual([...f.values], before); assert.equal(f.posts.length, 0);
});

test("plans can cancel an already captured edit with its own flag/capability OFF without sending a save", async () => {
  const f = fixture(), initialClient = f.make().client;
  const initialPlans = createAdminTemplateSavePlans({ binding: f.binding, client: initialClient, getContext: () => f.context,
    storage: f.storage, locks: f.locks, enabled: true });
  await initialPlans.capturePhotoEdit(f.input); await initialClient.capture(f.action);
  const cold = f.make({ photoEditEnabled: false }).client;
  const plans = createAdminTemplateSavePlans({ binding: f.binding, client: cold, getContext: () => f.context,
    storage: f.storage, locks: f.locks, enabled: true });
  f.server.capability = false;
  const result = await plans.cancel(f.action.operationId);
  assert.equal(result.state, "cancelled"); assert.equal(f.posts.length, 1); assert.equal(f.posts[0].path.endsWith("/cancel"), true);
  assert.deepEqual(f.posts[0].envelope.body, f.body); assert.equal((await plans.read(f.action.operationId)).cancelRequested, true);
  assert.equal((await cold.read(f.action.operationId)).receipt.result.payload.code, "operation_cancelled");
});
