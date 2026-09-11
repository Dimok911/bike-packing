import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAdminTemplateClient } from "../../src/sync/admin-template-client.js";
import { adminTemplateIntent, canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { AMBIGUOUS_WRITE_KEY } from "../../src/sync/experiment-transport.js";
import { adminPhotoStagingFixture as fixture, copy, sha } from "../fixtures/admin-template-photo-staging-fixture.js";

async function clientFixture() {
  const f = await fixture(), operationId = f.stage.templateOperationId, stageId = f.stage.operationId;
  const intent = adminTemplateIntent({ ...f.binding, operationId, kind: "template.save", body: f.body });
  const { id, ...input } = intent;
  const photo = { id: f.stage.photoId, photoId: f.stage.photoId, assetId: stageId, listId: f.binding.listId, status: "synced",
    url: `https://example.test/bike-packing/lists/${f.binding.listId}/photos/${f.stage.photoId}/file`,
    thumbUrl: `https://example.test/bike-packing/lists/${f.binding.listId}/photos/${f.stage.photoId}/thumb`,
    ...Object.fromEntries(["fileName", "type", "size", "width", "height"].map(key => [key, f.data.receipt.stored.file[key]])) };
  const confirmedPayload = copy(f.body.payload); confirmedPayload.items[f.stage.entityId].photos.push(photo);
  const { photoId: _photoId, ...asset } = f.body.photoAppend.assets[0];
  const receipt = { operation: { ...Object.fromEntries(["environment", "actorId", "listId", "itemKey", "kind"].map(key => [key, intent[key]])),
    id, payloadDigest: sha(canonicalTemplateJson(input)), state: "committed" }, result: { status: 200, payload: {
    ok: true, listId: f.binding.listId, itemKey: f.binding.itemKey, stateRevision: 4, visibility: "private", indexes: [],
    photoAppend: { version: 1, ownerId: f.data.receipt.ownerId, added: [{ ...asset, photo }], confirmedPayload,
      confirmedPayloadDigest: sha(canonicalTemplateJson(confirmedPayload)) } } } };
  const server = { saved: null, posts: [], paths: [], loseAck: false, hidden: false, corrupt: false };
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname; let result;
    const cancel = path.endsWith("/admin/template-operations/" + operationId + "/cancel");
    if ((path.endsWith("/admin/template-operations") || cancel) && options.method === "POST") {
      const envelope = JSON.parse(options.body); server.posts.push(envelope); server.paths.push(path);
      assert.deepEqual(envelope.body, f.body); if (!cancel) assert.equal(f.posts().length, 1);
      if (!server.saved) server.saved = cancel ? { operation: { ...copy(receipt.operation), state: "rejected" }, result: { status: 409, payload: {
        ok: false, code: "operation_cancelled", cancellation: { version: 1, operationId, noBusinessEffects: true, operationCannotApply: true } } } } : copy(receipt);
      if (server.corrupt && !cancel) server.saved.result.payload.photoAppend.confirmedPayloadDigest = sha("wrong");
      if (server.loseAck) throw new TypeError("Lost final save response");
      result = { ok: true, ...server.saved };
    } else if (path.endsWith("/admin/template-operations/" + operationId)) result = server.saved && !server.hidden ? { ok: true, ...server.saved }
      : { ok: true, operation: { id: operationId, state: "unknown" } };
    else return f.fetchImpl(url, options);
    return { status: 200, json: async () => copy(result) };
  };
  const make = options => {
    const { client: staging, transport } = f.make();
    return { transport, client: createAdminTemplateClient({ binding: f.binding, getContext: () => f.current, storage: f.storage,
      locks: f.locks, transport, fetchImpl, enabled: true, photoAppendEnabled: true, photoStore: f.store, photoStaging: staging, ...options }) };
  };
  return { ...f, makeClient: make, receipt, server, operationId, stageId };
}

test("admin photo save persists full stage proof before POST and reads exact confirmed result with the new flag OFF", async () => {
  const f = await clientFixture(), { client } = f.makeClient();
  const captured = await client.capture(f.record.action); assert.equal(captured.photoStages, null);
  assert.deepEqual(await client.run(f.operationId), f.receipt);
  const saved = await f.makeClient({ photoAppendEnabled: false, photoStore: null, photoStaging: null }).client.read(f.operationId);
  assert.deepEqual(saved.photoStages, [f.data]); assert.deepEqual(saved.receipt, f.receipt);
  assert.deepEqual(await f.makeClient().client.run(f.operationId), f.receipt);
  assert.equal(f.server.posts.length, 1); assert.equal(f.posts().length, 1);
});

test("lost final save ACK recovers the same complete receipt without another stage or save", async () => {
  const f = await clientFixture(); f.server.loseAck = true;
  const { client } = f.makeClient(); await client.capture(f.record.action);
  assert.deepEqual(await client.run(f.operationId), f.receipt);
  assert.equal(f.server.posts.length, 1); assert.equal(f.posts().length, 1);
});

test("missing durable files, OFF and unavailable stage block the administrative save before its POST", async () => {
  for (const options of [{ photoAppendEnabled: false }, { photoStore: null }]) {
    const f = await clientFixture(); await assert.rejects(f.makeClient(options).client.capture(f.record.action));
    assert.equal(f.server.posts.length, 0); assert.equal(f.posts().length, 0);
  }
  const f = await clientFixture(), { client } = f.makeClient(); await client.capture(f.record.action);
  f.controls.known = { ...copy(f.data), assetState: "unavailable" };
  await assert.rejects(client.run(f.operationId)); assert.equal(f.server.posts.length, 0);
});

test("a matching operation ID cannot acknowledge a corrupted authoritative snapshot or stored stage proof", async () => {
  const f = await clientFixture(); f.server.corrupt = true;
  const { client, transport } = f.makeClient(); await client.capture(f.record.action);
  await assert.rejects(client.run(f.operationId));
  assert.equal((await client.read(f.operationId)).receipt, null);
  assert.notEqual(transport.writes.find(row => row.id === f.operationId).confirmed, true);
  const key = [...f.values.keys()].find(value => value.startsWith("bike-packing-admin-template-v1:") && value.endsWith(f.operationId));
  const saved = JSON.parse(f.values.get(key)); saved.photoStages[0].receipt.manifest.photoId = "other";
  f.values.set(key, JSON.stringify(saved));
  await assert.rejects(client.read(f.operationId)); assert.equal(f.server.posts.length, 1);
});

const recoveryFor = saved => ({ type: "admin-template", protocol: "admin-template-v1", environment: saved.intent.environment,
  operationId: saved.intent.id, actorId: saved.intent.actorId, listId: saved.intent.listId, itemKey: saved.intent.itemKey,
  kind: saved.intent.kind, payloadDigest: saved.payloadDigest });
const cancellationFor = saved => ({ operationId: saved.intent.id, payloadDigest: saved.payloadDigest,
  assets: saved.intent.body.photoAppend.assets.map(({ assetId, assetDigest }) => ({ assetId, assetDigest })) });
const gateway = "/bike-packing/admin/template-operations";

async function unknownStageFixture() {
  const f = await clientFixture(); f.controls.unknown = true;
  const { client, transport } = f.makeClient(); await client.capture(f.record.action);
  await assert.rejects(client.run(f.operationId));
  assert.equal(f.posts().length, 1); assert.equal(f.server.posts.length, 0);
  assert.equal(transport.writes.find(row => row.id === f.stageId).uncertain, true);
  return { ...f, client, transport };
}

test("server-confirmed cancellation passes only its own unknown stage and leaves that stage pending after reload", async () => {
  const f = await unknownStageFixture(), saved = await f.client.read(f.operationId);
  const stageBefore = copy(f.transport.writes.find(row => row.id === f.stageId)), claimBefore = copy(f.claims.get(f.stageId));
  await assert.rejects(f.client.run(f.operationId)); assert.equal(f.posts().length, 1);
  const result = await f.client.cancel(f.operationId);
  assert.equal(result.result.payload.code, "operation_cancelled");
  const cancelPath = gateway + "/" + f.operationId + "/cancel";
  assert.deepEqual(f.server.paths, [new URL(f.transport.apiUrl(cancelPath)).pathname]);
  assert.deepEqual(f.transport.writes.find(row => row.id === f.stageId), stageBefore);
  assert.deepEqual(f.claims.get(f.stageId), claimBefore);
  const entry = f.transport.writes.find(row => row.id === f.operationId);
  assert.equal(entry.path, cancelPath); assert.equal(entry.confirmed, true);
  assert.deepEqual(entry.recovery, recoveryFor(saved));
  assert.equal(Object.hasOwn(entry, "cancellation"), false);
  const cold = f.makeClient(), retained = await cold.client.read(f.operationId);
  assert.equal(retained.cancelRequested, true); assert.equal(retained.photoStages, null);
  assert.deepEqual(await cold.client.run(f.operationId), result);
  assert.equal(f.posts().length, 1); assert.equal(f.server.posts.length, 1);
  assert.throws(() => cold.transport.assertWritable(gateway, "POST", recoveryFor(saved), cancellationFor(saved)), /unknown outcome/);
  assert.throws(() => cold.transport.assertWritable("/auth/logout", "POST"), /unknown outcome/);
  assert.equal((await f.make().client.inspect(f.operationId, f.stageId)).operation.state, "unknown");
  await assert.rejects(f.make().client.stage(f.operationId, f.stageId)); assert.equal(f.posts().length, 1);
});

test("lost cancellation ACK keeps the original cancellation intent and never resumes a save or unknown stage", async () => {
  const f = await unknownStageFixture(); f.server.loseAck = true; f.server.hidden = true;
  await assert.rejects(f.client.cancel(f.operationId));
  assert.equal((await f.client.read(f.operationId)).cancelRequested, true);
  f.server.hidden = false; f.server.loseAck = false;
  const cold = f.makeClient({ photoAppendEnabled: false, photoStore: null, photoStaging: null });
  assert.equal((await cold.client.run(f.operationId)).result.payload.code, "operation_cancelled");
  assert.deepEqual(f.server.paths, [new URL(cold.transport.apiUrl(gateway + "/" + f.operationId + "/cancel")).pathname]);
  assert.equal(f.posts().length, 1); assert.equal(cold.transport.writes.find(row => row.id === f.stageId).uncertain, true);
});

test("cancellation preserves an existing ordinary admin journal identity instead of replacing its registration", async () => {
  const f = await unknownStageFixture(), saved = await f.client.read(f.operationId), recovery = recoveryFor(saved);
  const prior = { id: f.operationId, path: gateway, method: "POST", mode: "direct", uncertain: true, recovery,
    createdAt: "2026-09-11T00:00:00.000Z", identity: "" };
  f.storage.setItem(`${AMBIGUOUS_WRITE_KEY}:${f.operationId}`, JSON.stringify(prior));
  const cold = f.makeClient(); assert.equal((await cold.client.cancel(f.operationId)).result.payload.code, "operation_cancelled");
  const entry = cold.transport.writes.find(row => row.id === f.operationId);
  assert.equal(entry.path, gateway); assert.equal(entry.createdAt, prior.createdAt); assert.deepEqual(entry.recovery, recovery);
  assert.equal(entry.confirmed, true); assert.equal(cold.transport.writes.find(row => row.id === f.stageId).uncertain, true);
  assert.equal(f.server.posts.length, 1); assert.equal(f.posts().length, 1);
});

test("another stage digest, actor, namespace, action or stage UUID cannot authorize cancellation past the barrier", async () => {
  const mutations = [
    row => { row.recovery.assetDigest = sha("other bytes"); },
    row => { row.recovery.actorId = "another-admin"; },
    row => { row.recovery.environment = "bike-packing"; },
    row => { row.recovery.listId = "public-demo-state-other"; },
    row => { row.recovery.itemKey = "demo-state:other"; },
    row => { row.recovery.actionOperationId = randomUUID(); },
    row => { row.recovery.operationId = randomUUID(); },
    row => { row.recovery.protocol = "staging-v1"; },
    row => { row.recovery.intentHash = "malformed"; },
    row => { row.recovery.extra = true; },
    row => { row.mode = "eu"; },
    row => { row.path = "/bike-packing/lists/private/photo-assets"; },
    row => { row.method = "PUT"; },
  ];
  for (const mutate of mutations) {
    const f = await unknownStageFixture(), key = `${AMBIGUOUS_WRITE_KEY}:${f.stageId}`;
    const row = JSON.parse(f.storage.getItem(key)); mutate(row); f.storage.setItem(key, JSON.stringify(row));
    await assert.rejects(f.makeClient().client.cancel(f.operationId), /unknown outcome/);
    assert.equal(f.server.posts.length, 0); assert.equal(f.posts().length, 1);
    assert.deepEqual(JSON.parse(f.storage.getItem(key)), row);
  }
  const f = await unknownStageFixture(), original = f.transport.writes.find(row => row.id === f.stageId);
  const unrelated = { ...copy(original), id: randomUUID() }; unrelated.recovery.operationId = unrelated.id;
  unrelated.recovery.actionOperationId = randomUUID();
  f.storage.setItem(`${AMBIGUOUS_WRITE_KEY}:${unrelated.id}`, JSON.stringify(unrelated));
  await assert.rejects(f.makeClient().client.cancel(f.operationId), /unknown outcome/);
  assert.equal(f.server.posts.length, 0); assert.equal(f.posts().length, 1);
});

test("a cancellation permission cannot authorize a save, another URL/UUID/digest, or survive a journal change during registration", async () => {
  const f = await unknownStageFixture(), saved = await f.client.read(f.operationId), recovery = recoveryFor(saved), permission = cancellationFor(saved);
  const path = gateway + "/" + f.operationId + "/cancel";
  assert.doesNotThrow(() => f.transport.assertWritable(path, "POST", recovery, permission));
  const mutations = [p => { p.operationId = randomUUID(); }, p => { p.payloadDigest = sha("other save"); },
    p => { p.assets[0].assetDigest = sha("other bytes"); }, p => { p.assets[0].assetId = randomUUID(); },
    p => { p.assets = []; }, p => { p.assets.push(copy(p.assets[0])); }, p => { p.extra = true; }];
  for (const mutate of mutations) {
    const invalid = copy(permission); mutate(invalid);
    assert.throws(() => f.transport.assertWritable(path, "POST", recovery, invalid), /unknown outcome/);
  }
  for (const [url, method, metadata] of [[gateway, "POST", recovery], [path, "PUT", recovery],
    [gateway + "/" + randomUUID() + "/cancel", "POST", recovery], ["/auth/logout", "POST", recovery],
    [path, "POST", { ...recovery, kind: "template.publication" }], [path, "POST", { ...recovery, actorId: "other" }]]) {
    assert.throws(() => f.transport.assertWritable(url, method, metadata, permission), /unknown outcome/);
  }
  const key = `${AMBIGUOUS_WRITE_KEY}:${f.stageId}`, row = JSON.parse(f.storage.getItem(key));
  const pending = f.transport.beginWrite(path, "POST", null, recovery, permission);
  row.recovery.assetDigest = sha("changed during registration"); f.storage.setItem(key, JSON.stringify(row));
  await assert.rejects(pending, /unknown outcome/);
  assert.equal(f.transport.writes.some(entry => entry.id === f.operationId), false); assert.equal(f.server.posts.length, 0);
});
