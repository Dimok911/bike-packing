import test from "node:test";
import assert from "node:assert/strict";
import { adminPhotoCreateClientFixture as fixture, copy, hash } from "../fixtures/admin-template-photo-create-client-fixture.js";
import { AMBIGUOUS_WRITE_KEY } from "../../src/sync/experiment-transport.js";

for (const entityType of ["item", "container"]) test(`${entityType}: exact binary stage v2 and full create result survive lost ACK and cold OFF reads`, async () => {
  const f = await fixture({ entityType }); f.controls.loseStage = true; f.controls.loseSave = true;
  const { client } = f.make(); const saved = await client.capture(f.record.action);
  assert.equal(saved.recordIntentHash, f.record.intentHash); assert.equal(saved.photoStages, null);
  f.controls.beforeSave = () => {
    const entry = [...f.values.values()].map(value => JSON.parse(value)).find(row => row.intent?.id === f.id);
    assert.deepEqual(entry.photoStages, f.stages); assert.equal(entry.dispatched, true);
  };
  assert.deepEqual(await client.run(f.id), f.receipt);
  const cold = f.make({ photoCreateEnabled: false, photoAppendEnabled: false, photoStore: f.makeStore({ enabled: false, createEnabled: false }) }).client;
  assert.deepEqual((await cold.read(f.id)).receipt, f.receipt); assert.deepEqual((await cold.capture(f.record.action)).intent, f.intent);
  assert.deepEqual(await cold.inspect(f.id), f.receipt); assert.deepEqual(await cold.run(f.id), f.receipt);
  assert.equal(f.server.savePosts.length, 1); assert.equal(f.server.stagePosts.length, f.stages.length);
  assert.equal(f.idb.rows().size, 1); assert.equal((await f.store.read(f.id)).intentHash, saved.recordIntentHash);
});

test("create/append gates and capabilities close new capture and dispatch; missing binary record never grants cancel", async () => {
  for (const kind of ["create-off", "append-off", "create-cap", "append-cap"]) {
    const f = await fixture(), options = kind === "create-off" ? { photoCreateEnabled: false } : kind === "append-off" ? { photoAppendEnabled: false } : {};
    if (kind.endsWith("off")) { await assert.rejects(f.make(options).client.capture(f.record.action)); assert.equal(f.values.size, 0); }
    await f.make().client.capture(f.record.action);
    if (kind.endsWith("cap")) f.controls.capabilities = f.controls.capabilities.filter(cap => cap !== (kind === "create-cap" ? "adminTemplatePhotoCreateV1" : "adminTemplatePhotoAppendV1"));
    await assert.rejects(f.make(options).client.run(f.id)); assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0);
  }
  const f = await fixture(); await f.make().client.capture(f.record.action);
  for (const photoStore of [null, { binding: f.binding, read: async () => null }]) {
    const client = f.make({ photoStore }).client;
    await assert.rejects(client.read(f.id)); await assert.rejects(client.cancel(f.id));
  }
  assert.equal(f.server.calls.length, 0);
});

test("unknown stage is never uploaded again after cold reload or cleared transport history; exact cancel leaves its claim pending", async () => {
  const f = await fixture(); f.controls.unknownStage = true;
  const active = f.make(); await active.client.capture(f.record.action); await assert.rejects(active.client.run(f.id));
  const stageId = f.record.files[0].stage.operationId;
  await assert.rejects(f.make().client.run(f.id)); assert.equal(f.server.stagePosts.length, 1);
  const off = f.make({ photoCreateEnabled: false, photoAppendEnabled: false });
  assert.equal((await off.staging.inspect(f.id, stageId)).operation.state, "unknown");
  const before = copy(f.idb.rows("stage-dispatches"));
  await off.client.capture(f.record.action);
  assert.equal((await off.client.cancel(f.id)).result.payload.code, "operation_cancelled");
  assert.deepEqual(f.idb.rows("stage-dispatches"), before); assert.equal(f.server.stagePosts.length, 1);
  assert.equal(off.transport.writes.find(row => row.id === stageId).uncertain, true);
  assert.equal(f.server.savePosts[0].path.endsWith(`/${f.id}/cancel`), true);
  f.storage.removeItem(`${AMBIGUOUS_WRITE_KEY}:${stageId}`);
  await assert.rejects(f.make().staging.stage(f.id, stageId)); assert.equal(f.server.stagePosts.length, 1);
});

test("unknown create-stage cancel bypass requires exact protocol, owner binding, action UUID, asset digest and binary record hash", async () => {
  for (const mutate of [r => { r.protocol = "admin-template-photo-stage-v1"; }, r => { r.actorId = "other"; },
    r => { r.actionOperationId = crypto.randomUUID(); }, r => { r.operationId = crypto.randomUUID(); },
    r => { r.assetDigest = hash("other"); }, r => { r.intentHash = hash("other"); }, r => { r.itemKey = "demo-state"; }]) {
    const f = await fixture(); f.controls.unknownStage = true; const active = f.make();
    await active.client.capture(f.record.action); await assert.rejects(active.client.run(f.id));
    const key = `${AMBIGUOUS_WRITE_KEY}:${f.record.files[0].stage.operationId}`, entry = JSON.parse(f.values.get(key)); mutate(entry.recovery); f.values.set(key, JSON.stringify(entry));
    await assert.rejects(f.make({ photoCreateEnabled: false }).client.cancel(f.id)); assert.equal(f.server.savePosts.length, 0);
  }
});

test("tampered terminal payload or stage binding never confirms the save; cold digest recomputation does not bypass full proof", async () => {
  for (const mode of ["digest", "raw", "owner", "stage"]) {
    const f = await fixture(); await f.make().client.capture(f.record.action);
    f.controls.mutateReceipt = receipt => {
      const result = receipt.result.payload.photoCreate;
      if (mode === "digest") result.confirmedPayloadDigest = hash("wrong");
      else if (mode === "raw") { result.confirmedPayload.opaque = { changed: true }; result.confirmedPayloadDigest = hash(result.confirmedPayload); }
      else if (mode === "owner") result.ownerId = "actor-instead-of-owner";
      else result.added[0].assetDigest = hash("wrong");
    };
    await assert.rejects(f.make().client.run(f.id)); const saved = await f.make().client.read(f.id);
    assert.equal(saved.receipt, null); assert.equal(f.make().transport.writes.find(row => row.id === f.id).uncertain, true);
    const key = [...f.values.keys()].find(key => key.startsWith("bike-packing-admin-template-v1:"));
    saved.receipt = f.server.saved; f.values.set(key, JSON.stringify(saved)); await assert.rejects(f.make().client.read(f.id));
  }
});

test("quota before action or stage-proof persistence keeps original IDB bytes and cannot post business effects", async () => {
  for (const phase of ["capture", "stages"]) {
    const f = await fixture(), before = (await f.store.read(f.id)).intentHash;
    if (phase === "stages") await f.make().client.capture(f.record.action);
    f.controls.quotaPrefix = "bike-packing-admin-template-v1:";
    if (phase === "capture") await assert.rejects(f.make().client.capture(f.record.action)); else await assert.rejects(f.make().client.run(f.id));
    assert.equal(f.server.savePosts.length, 0); assert.equal((await f.store.read(f.id)).intentHash, before);
    f.controls.quotaPrefix = null;
    const cold = f.make(); await cold.client.capture(f.record.action); assert.deepEqual(await cold.client.run(f.id), f.receipt);
    assert.equal(f.server.stagePosts.length, f.stages.length); assert.equal(f.server.savePosts.length, 1);
  }
});

test("actor or editor generation change while decoding or dispatching cannot persist a create receipt", async () => {
  for (const phase of ["read", "post"]) {
    const f = await fixture(); await f.make().client.capture(f.record.action);
    const store = phase === "read" ? { binding: f.binding, async read(id) { const row = await f.store.read(id); f.current.generation = "different"; return row; } } : f.store;
    if (phase === "post") f.controls.afterRequest = path => { if (path.endsWith("/template-operations")) f.current.generation = "different"; };
    await assert.rejects(f.make({ photoStore: store }).client.run(f.id));
    const key = [...f.values.keys()].find(key => key.startsWith("bike-packing-admin-template-v1:"));
    assert.equal(JSON.parse(f.values.get(key)).receipt, null);
    assert.equal(f.server.savePosts.length, phase === "post" ? 1 : 0);
  }
});

test("create staging never interprets a v1 or altered receipt as absent; unavailable known v2 remains inspectable with gates OFF", async () => {
  for (const mode of ["v1", "owner-revision", "manifest"]) {
    const f = await fixture(), value = copy(f.stages[0]), stageId = value.receipt.manifest.operationId;
    if (mode === "v1") value.receipt.version = 1;
    if (mode === "owner-revision") value.receipt.baseEntityRevision = 1;
    if (mode === "manifest") value.receipt.manifest.entityId = "different-new-owner";
    f.server.known.set(stageId, value);
    await assert.rejects(f.make().staging.stage(f.id, stageId)); assert.equal(f.server.stagePosts.length, 0); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  }
  const f = await fixture(), value = { ...copy(f.stages[0]), assetState: "unavailable" }, stageId = value.receipt.manifest.operationId;
  f.server.known.set(stageId, value); await assert.rejects(f.make().staging.stage(f.id, stageId));
  assert.deepEqual(await f.make({ photoCreateEnabled: false, photoAppendEnabled: false }).staging.inspect(f.id, stageId), value);
  assert.equal(f.server.stagePosts.length, 0);
});

test("create cancellation permission is restricted to the original cancellation URL and cannot authorize save, PUT or another action", async () => {
  const f = await fixture(); f.controls.unknownStage = true; const active = f.make();
  const saved = await active.client.capture(f.record.action); await assert.rejects(active.client.run(f.id));
  const recovery = { type: "admin-template", protocol: "admin-template-v1", ...f.binding, operationId: f.id, kind: "template.save", payloadDigest: saved.payloadDigest };
  const permission = { operationId: f.id, payloadDigest: saved.payloadDigest,
    assets: f.intent.body.photoCreate.assets.map(({ assetId, assetDigest }) => ({ assetId, assetDigest })),
    stageProtocol: "admin-template-photo-create-stage-v2", recordIntentHash: f.record.intentHash };
  const path = `/bike-packing/admin/template-operations/${f.id}/cancel`;
  active.transport.assertWritable(path, "POST", recovery, permission);
  for (const [url, method] of [["/bike-packing/admin/template-operations", "POST"], [path, "PUT"],
    [`/bike-packing/admin/template-operations/${crypto.randomUUID()}/cancel`, "POST"]]) assert.throws(() => active.transport.assertWritable(url, method, recovery, permission));
  assert.equal(f.server.savePosts.length, 0); assert.equal(active.transport.writes.some(row => row.confirmed), false);
});
