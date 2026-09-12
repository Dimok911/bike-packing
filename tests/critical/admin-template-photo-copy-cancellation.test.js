import test from "node:test";
import assert from "node:assert/strict";
import { adminPhotoCopyClientFixture as fixture, copy, hash, commandPrefix } from "../fixtures/admin-template-photo-copy-client-fixture.js";
import { AMBIGUOUS_WRITE_KEY } from "../../src/sync/experiment-transport.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";

const commandKey = f => [...f.values.keys()].find(key => key.startsWith(commandPrefix));
const saved = f => JSON.parse(f.values.get(commandKey(f)));
const off = f => f.make({ enabled: false, appendEnabled: false, createEnabled: false, store: f.makeStore({ enabled: false }) }).client;
const noBusinessPosts = f => { assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0); };
const permission = (f, journal) => ({ operationId: f.id, payloadDigest: journal.payloadDigest,
  stageProtocol: "admin-template-photo-copy-stage-v1", recordIntentHash: f.record.intentHash,
  assets: f.intent.body.photoCopy.assets.map(({ assetId, assetDigest }) => ({ assetId, assetDigest })) });
const metadata = (f, journal) => ({ type: "admin-template", protocol: "admin-template-v1", ...f.binding,
  operationId: f.id, kind: "template.save", payloadDigest: journal.payloadDigest, recordIntentHash: f.record.intentHash });

test("explicit OFF copy cancellation fences the immutable parent while its unknown derived stage stays unknown", async () => {
  const f = await fixture(), active = f.make(); await active.client.capture(f.record.action);
  f.controls.unknownStage = true; await assert.rejects(active.client.run(f.id));
  f.controls.capabilities = ["adminTemplateCausalOperationsV1"];
  const original = copy(saved(f).intent), result = await off(f).cancel(f.id);
  assert.equal(result.result.payload.code, "operation_cancelled"); assert.deepEqual(saved(f).intent, original);
  assert.equal(saved(f).cancelRequested, true); assert.equal(saved(f).dispatched, false);
  assert.equal(f.server.cancelPosts.length, 1); assert.equal(f.server.savePosts.length, 0); assert.equal(f.server.stagePosts.length, 1);
  assert.deepEqual(await off(f).inspect(f.id), result); assert.deepEqual(await off(f).run(f.id), result);
  const stageId = f.record.stages[0].operationId;
  assert.equal((await off(f).inspectStage(f.id, stageId)).operation.state, "unknown");
  assert.equal(f.make().transport.writes.find(row => row.id === stageId).confirmed, undefined);
  assert.equal(f.make().transport.writes.find(row => row.id === stageId).uncertain, true);
  assert.equal(f.idb.rows("stage-dispatches").size, 1); assert.equal((await f.store.read(f.id)).intentHash, f.record.intentHash);
  assert.throws(() => f.make().transport.assertWritable("/bike-packing/admin/template-photo-assets/copy", "POST"));
  assert.equal(f.server.cancelPosts.length, 1);
});

test("lost cancellation ACK recovers by cold GET; unknown cancellation is repeated only by another explicit cancel", async () => {
  for (const committed of [true, false]) {
    const f = await fixture(); await f.make().client.capture(f.record.action);
    f.controls.loseCancel = true; f.controls.unknownCancel = !committed; f.controls.hideSave = true;
    await assert.rejects(off(f).cancel(f.id)); assert.equal(saved(f).cancelRequested, true);
    assert.equal(saved(f).receipt, null); assert.equal(f.server.cancelPosts.length, 1); noBusinessPosts(f);
    await assert.rejects(f.make().client.run(f.id)); assert.equal(f.server.cancelPosts.length, 1);
    f.controls.hideSave = false;
    if (committed) {
      assert.equal((await off(f).inspect(f.id)).result.payload.code, "operation_cancelled");
      assert.equal((await off(f).cancel(f.id)).result.payload.code, "operation_cancelled");
      assert.equal(f.server.cancelPosts.length, 1);
    } else {
      assert.equal(await off(f).inspect(f.id), null); f.controls.unknownCancel = false;
      assert.equal((await off(f).cancel(f.id)).result.payload.code, "operation_cancelled");
      assert.equal(f.server.cancelPosts.length, 2); assert.deepEqual(f.server.cancelPosts[0], f.server.cancelPosts[1]);
    }
    noBusinessPosts(f);
  }
});

test("a committed save wins both before cancellation and in a race with its cancellation POST", async () => {
  for (const late of [false, true]) {
    const f = await fixture(); await f.make().client.capture(f.record.action);
    if (late) { f.controls.unknownSave = true; await assert.rejects(f.make().client.run(f.id)); f.controls.commitBeforeCancel = true; }
    else assert.deepEqual(await f.make().client.run(f.id), f.receipt);
    assert.deepEqual(await off(f).cancel(f.id), f.receipt);
    assert.deepEqual(await off(f).inspect(f.id), f.receipt); assert.equal(f.server.cancelPosts.length, late ? 1 : 0);
    assert.equal(f.server.savePosts.length, 1); assert.equal(f.server.stagePosts.length, 2);
    assert.equal(saved(f).cancelRequested, late);
  }
});

test("cancel marker quota or failed readback sends no request and retains the exact action for an explicit later cancel", async () => {
  for (const readback of [false, true]) {
    const f = await fixture(); await f.make().client.capture(f.record.action); let pendingReadback = null;
    f.controls.rejectWrite = (key, value) => !readback && key.startsWith(commandPrefix) && JSON.parse(value).cancelRequested;
    const storage = { ...f.storage, getItem(key) {
      if (pendingReadback === key) { pendingReadback = null; return null; } return f.storage.getItem(key);
    }, setItem(key, value) {
      f.storage.setItem(key, value);
      if (readback && key.startsWith(commandPrefix) && JSON.parse(value).cancelRequested) pendingReadback = key;
    } };
    await assert.rejects(f.make({ storage, enabled: false }).client.cancel(f.id));
    assert.equal(f.server.cancelPosts.length, 0); noBusinessPosts(f);
    assert.equal(saved(f).cancelRequested, readback); assert.equal((await f.store.read(f.id)).intentHash, f.record.intentHash);
    f.controls.rejectWrite = null;
    assert.equal((await off(f).cancel(f.id)).result.payload.code, "operation_cancelled");
    assert.equal(f.server.cancelPosts.length, 1); noBusinessPosts(f);
  }
});

test("cancellation rechecks actor/admin/global gate and the full source record before any cancel POST", async () => {
  for (const mode of ["actor", "rights", "gate", "capability", "source", "context"]) {
    const f = await fixture(); await f.make().client.capture(f.record.action); const options = { enabled: false };
    if (mode === "actor") f.controls.wrongActor = true;
    if (mode === "rights") f.controls.noRights = true;
    if (mode === "gate") options.adminEnabled = false;
    if (mode === "capability") f.controls.capabilities = [];
    if (mode === "context") f.current.scope = "personal";
    if (mode === "source") options.store = { binding: f.binding, async read() {
      const record = copy(f.record); record.action.body.photoCopy.source.entityId = "other-owner"; return record;
    } };
    await assert.rejects(async () => f.make(options).client.cancel(f.id)); assert.equal(f.server.cancelPosts.length, 0); noBusinessPosts(f);
    assert.equal(saved(f).cancelRequested, false); assert.equal(saved(f).receipt, null);
  }
});

test("tampered cancellation proofs and context changes never acknowledge the parent or any stage", async () => {
  for (const mode of ["effects", "applicable", "uuid", "digest", "extra", "context"]) {
    const f = await fixture(); await f.make().client.capture(f.record.action);
    f.controls.mutateCancel = receipt => {
      const proof = receipt.result.payload.cancellation;
      if (mode === "effects") proof.noBusinessEffects = false;
      if (mode === "applicable") proof.operationCannotApply = false;
      if (mode === "uuid") proof.operationId = crypto.randomUUID();
      if (mode === "digest") receipt.operation.payloadDigest = hash("other");
      if (mode === "extra") proof.confirmStage = true;
      if (mode === "context") f.current.generation = "other-document";
    };
    await assert.rejects(off(f).cancel(f.id)); assert.equal(saved(f).receipt, null); assert.equal(saved(f).cancelRequested, true);
    assert.equal(f.server.cancelPosts.length, 1); assert.equal(f.make().transport.writes.some(row => row.confirmed), false);
    assert.equal(f.idb.rows("stage-dispatches").size, 0); noBusinessPosts(f);
  }
});

test("legacy journals remain byte-exact on read and nonboolean/extra cancellation markers cannot grant dispatch", async () => {
  const f = await fixture(); await f.make().client.capture(f.record.action);
  const old = saved(f); delete old.cancelRequested; const encoded = canonical(old); f.values.set(commandKey(f), encoded);
  assert.deepEqual(await off(f).read(f.id), old); assert.deepEqual(await off(f).capture(f.record.action), old);
  assert.equal(f.values.get(commandKey(f)), encoded); assert.equal(Object.hasOwn(await off(f).read(f.id), "cancelRequested"), false);
  for (const marker of [null, 0, 1, "true", {}, []]) {
    f.values.set(commandKey(f), canonical({ ...old, cancelRequested: marker }));
    await assert.rejects(off(f).read(f.id)); await assert.rejects(off(f).cancel(f.id));
  }
  f.values.set(commandKey(f), canonical({ ...old, cancelRequested: true, cancellationOnly: true }));
  await assert.rejects(off(f).cancel(f.id)); assert.equal(f.server.cancelPosts.length, 0); noBusinessPosts(f);
  f.values.set(commandKey(f), encoded);
  assert.equal((await off(f).cancel(f.id)).result.payload.code, "operation_cancelled");
  assert.deepEqual(saved(f).intent, old.intent);
});

test("copy cancellation transport permission passes only its exact unknown copy stage and original cancellation URL", async () => {
  const f = await fixture(), active = f.make(); const journal = await active.client.capture(f.record.action);
  f.controls.unknownStage = true; await assert.rejects(active.client.run(f.id));
  const stageId = f.record.stages[0].operationId, key = `${AMBIGUOUS_WRITE_KEY}:${stageId}`, original = JSON.parse(f.values.get(key));
  const recovery = metadata(f, journal), permit = permission(f, journal), path = `/bike-packing/admin/template-operations/${f.id}/cancel`;
  active.transport.assertWritable(path, "POST", recovery, permit);
  for (const change of [entry => { entry.mode = "eu"; }, entry => { entry.path = "/bike-packing/admin/template-photo-assets"; },
    entry => { entry.recovery.protocol = "admin-template-photo-create-stage-v2"; }, entry => { entry.recovery.environment = "other"; },
    entry => { entry.recovery.actorId = "other"; }, entry => { entry.recovery.listId = "public-demo-state"; },
    entry => { entry.recovery.itemKey = "demo-state"; }, entry => { entry.recovery.actionOperationId = crypto.randomUUID(); },
    entry => { entry.recovery.operationId = crypto.randomUUID(); }, entry => { entry.recovery.assetDigest = hash("other"); },
    entry => { entry.recovery.intentHash = hash("other"); }, entry => { entry.recovery.extra = true; }]) {
    const entry = copy(original); change(entry); f.values.set(key, JSON.stringify(entry));
    assert.throws(() => active.transport.assertWritable(path, "POST", recovery, permit));
  }
  f.values.set(key, JSON.stringify(original));
  for (const change of [p => { p.stageProtocol = "admin-template-photo-create-stage-v2"; }, p => { p.recordIntentHash = hash("other"); },
    p => { delete p.recordIntentHash; }, p => { p.payloadDigest = hash("other"); }, p => { p.operationId = crypto.randomUUID(); },
    p => { p.assets.reverse(); p.assets.pop(); }, p => { p.assets[0].assetDigest = hash("other"); }, p => { p.assets.push(copy(p.assets[0])); },
    p => { p.extra = true; }]) {
    const changed = copy(permit); change(changed); assert.throws(() => active.transport.assertWritable(path, "POST", recovery, changed));
  }
  assert.throws(() => active.transport.assertWritable(path, "POST", { ...recovery, recordIntentHash: hash("other") }, permit));
  for (const [url, method] of [["/bike-packing/admin/template-operations", "POST"], [path, "PUT"],
    [`/bike-packing/admin/template-operations/${crypto.randomUUID()}/cancel`, "POST"]]) assert.throws(() => active.transport.assertWritable(url, method, recovery, permit));
  assert.equal(f.server.cancelPosts.length, 0); assert.equal(f.server.stagePosts.length, 1);
  assert.equal(active.transport.writes.some(row => row.confirmed), false);
});

test("an unrelated uncertain stage blocks actual cancellation without erasing either pending action", async () => {
  const f = await fixture(), active = f.make(); await active.client.capture(f.record.action);
  f.controls.unknownStage = true; await assert.rejects(active.client.run(f.id));
  const sourceKey = `${AMBIGUOUS_WRITE_KEY}:${f.record.stages[0].operationId}`, foreign = JSON.parse(f.values.get(sourceKey));
  foreign.id = crypto.randomUUID(); foreign.recovery.operationId = foreign.id; foreign.recovery.actionOperationId = crypto.randomUUID();
  const key = `${AMBIGUOUS_WRITE_KEY}:${foreign.id}`, encoded = JSON.stringify(foreign); f.values.set(key, encoded);
  await assert.rejects(off(f).cancel(f.id)); assert.equal(f.server.cancelPosts.length, 0); assert.equal(saved(f).cancelRequested, true);
  assert.equal(f.values.get(key), encoded); assert.equal(f.idb.rows("stage-dispatches").size, 1);
  assert.equal(f.make().transport.writes.filter(row => row.uncertain).length, 2);
});
