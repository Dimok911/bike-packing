import test from "node:test";
import assert from "node:assert/strict";
import { adminPhotoCopyClientFixture as fixture, copy, hash, commandPrefix } from "../fixtures/admin-template-photo-copy-client-fixture.js";
import { AMBIGUOUS_WRITE_KEY, EXPERIMENT_FRONTEND_ORIGIN, EU_EXPERIMENT_API_BASE } from "../../src/sync/experiment-transport.js";
import { EXPERIMENT_API_BASE } from "../../src/config/constants.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { createAdminTemplatePhotoCopyClient, validateAdminTemplatePhotoCopyReceipt } from "../../src/sync/admin-template-photo-copy-client.js";

const command = f => [...f.values.keys()].find(key => key.startsWith(commandPrefix));
const saved = f => JSON.parse(f.values.get(command(f)));
const noPosts = f => { assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0); };

for (const entityType of ["item", "container"]) test(`${entityType}: real BE relative photo references survive committed/lost ACK and cold OFF reconciliation byte-for-byte`, async () => {
  const f = await fixture({ entityType }); f.controls.loseStage = true; f.controls.loseSave = true;
  const { client } = f.make(), initial = await client.capture(f.record.action);
  assert.equal(initial.recordIntentHash, f.record.intentHash); assert.deepEqual(initial.stageReceipts, [null, null]);
  const originalResult = canonicalTemplateJson(f.receipt);
  for (const { photo } of f.receipt.result.payload.photoCopy.added) {
    const route = `/letters-vniipo/api/bike-packing/lists/${encodeURIComponent(f.binding.listId)}/photos/${encodeURIComponent(photo.id)}`;
    assert.equal(photo.url, `${route}/file`); assert.equal(photo.thumbUrl, `${route}/thumb`);
  }
  assert.deepEqual(await client.run(f.id), f.receipt);
  const off = f.make({ enabled: false, adminEnabled: false, appendEnabled: false, createEnabled: false,
    store: f.makeStore({ enabled: false }) }).client;
  assert.deepEqual((await off.read(f.id)).receipt, f.receipt); assert.deepEqual(await off.inspect(f.id), f.receipt);
  assert.deepEqual(await off.run(f.id), f.receipt); assert.deepEqual((await off.capture(f.record.action)).intent, f.intent);
  assert.equal(f.server.stagePosts.length, 2); assert.equal(f.server.savePosts.length, 1);
  assert.equal(f.idb.rows().size, 1); assert.equal(f.idb.rows("stage-dispatches").size, 2);
  assert.deepEqual((await off.list()).map(row => row.intent.id), [f.id]); assert.equal(Object.hasOwn(off, "cancel"), false);
  assert.equal(canonicalTemplateJson((await off.read(f.id)).receipt), originalResult);
  assert.equal(canonicalTemplateJson(f.receipt), originalResult);
});

test("receipt URL validation also retains exact approved absolute origins without rewriting their raw payload", async () => {
  const f = await fixture();
  for (const base of [EXPERIMENT_API_BASE, EU_EXPERIMENT_API_BASE, `${EXPERIMENT_FRONTEND_ORIGIN}/letters-vniipo/api`, "https://api.vniipo-help.ru/letters-vniipo/api"]) {
    const receipt = copy(f.receipt), result = receipt.result.payload.photoCopy;
    for (const { photo } of result.added) {
      const route = `${base}/bike-packing/lists/${encodeURIComponent(f.binding.listId)}/photos/${encodeURIComponent(photo.id)}`;
      photo.url = `${route}/file`; photo.thumbUrl = `${route}/thumb`;
    }
    result.confirmedPayload.items[result.entityId].photos = result.added.map(value => copy(value.photo));
    result.confirmedPayloadDigest = hash(result.confirmedPayload); const original = canonicalTemplateJson(receipt);
    assert.equal(await validateAdminTemplatePhotoCopyReceipt(receipt, { intent: f.intent, payloadDigest: receipt.operation.payloadDigest, stageReceipts: f.stages }), true);
    assert.equal(canonicalTemplateJson(receipt), original);
  }
});

test("receipt URL validation rejects foreign/protocol-relative origins and any nonexact relative route even with a matching raw payload hash", async () => {
  const f = await fixture();
  for (const field of ["url", "thumbUrl"]) for (const change of [
    value => `https://foreign.example${value}`, value => `//api.vniipo-help.ru${value}`,
    value => value.replace("/letters-vniipo/api/", "/another/api/"), value => value.slice(1),
    value => value.replace("/photos/", "/photos/../photos/"), value => `${value}?extra=1`, value => `${value}#extra`,
    value => value.replace(`/lists/${f.binding.listId}/`, "/lists/other/")
  ]) {
    const receipt = copy(f.receipt), result = receipt.result.payload.photoCopy;
    result.added[0].photo[field] = change(result.added[0].photo[field]);
    result.confirmedPayload.items[result.entityId].photos[0][field] = result.added[0].photo[field];
    result.confirmedPayloadDigest = hash(result.confirmedPayload);
    assert.equal(await validateAdminTemplatePhotoCopyReceipt(receipt, { intent: f.intent, payloadDigest: receipt.operation.payloadDigest, stageReceipts: f.stages }), false);
  }
});

test("all write gates default OFF and each required capability blocks before the first derived POST", async () => {
  for (const flag of ["enabled", "adminEnabled", "appendEnabled", "createEnabled"]) {
    const f = await fixture(); await assert.rejects(f.make({ [flag]: false }).client.capture(f.record.action)); assert.equal(f.values.size, 0);
    await f.make().client.capture(f.record.action); await assert.rejects(f.make({ [flag]: false }).client.run(f.id)); noPosts(f);
  }
  for (const capability of ["adminTemplateCausalOperationsV1", "adminTemplatePhotoAppendV1", "adminTemplatePhotoCreateV1", "adminTemplatePhotoCopyV1"]) {
    const f = await fixture(); await f.make().client.capture(f.record.action); f.controls.capabilities = f.controls.capabilities.filter(value => value !== capability);
    await assert.rejects(f.make().client.run(f.id)); noPosts(f);
  }
  const f = await fixture(), { transport } = f.make();
  const defaults = createAdminTemplatePhotoCopyClient({ binding: f.binding, getContext: () => f.current, store: f.store, transport,
    storage: f.storage, locks: f.locks, fetchImpl: f.fetchImpl });
  await assert.rejects(defaults.capture(f.record.action)); noPosts(f);
});

test("wrong actor, missing administrative authority and source/target/map corruption fail before POST", async () => {
  const guarded = await fixture(), bound = guarded.make().client, originalContext = copy(guarded.current);
  assert.deepEqual(bound.binding, guarded.binding); assert.notEqual(bound.binding, guarded.binding);
  assert.equal(Object.isFrozen(bound), true); assert.equal(Object.isFrozen(bound.binding), true);
  assert.throws(() => { bound.binding.actorId = "other"; }, TypeError);
  assert.throws(() => { bound.binding = { ...guarded.binding, actorId: "other" }; }, TypeError);
  for (const [field, value] of [["actorId", "other"], ["scope", "personal"], ["admin", false], ["listId", "public-demo-state"],
    ["itemKey", "demo-state"], ["environment", "other"]]) {
    guarded.current[field] = value;
    await assert.rejects(bound.capture(guarded.record.action)); noPosts(guarded); assert.equal(guarded.values.size, 0);
    Object.assign(guarded.current, originalContext);
  }
  for (const flag of ["wrongActor", "noRights"]) {
    const f = await fixture(); await f.make().client.capture(f.record.action); f.controls[flag] = true;
    await assert.rejects(f.make().client.run(f.id)); noPosts(f);
  }
  for (const mutate of [
    record => { record.binding.actorId = "other"; }, record => { record.action.itemKey = "demo-state"; },
    record => { record.action.body.photoCopy.source.entityId = "detached"; },
    record => { record.snapshot.source.ownerMap.owners[0].serverId = "other-owner"; },
    record => { record.snapshot.target.beforeState.layouts[record.snapshot.target.layoutId].arrangement.unknown = "unsaved"; }
  ]) {
    const f = await fixture(), record = copy(f.record); mutate(record);
    const client = f.make({ store: { binding: f.binding, read: async () => record } }).client;
    await assert.rejects(client.capture(f.record.action)); noPosts(f); assert.equal(f.values.size, 0);
  }
});

test("unknown derived stage never re-POSTs after reload or removal of its common transport entry", async () => {
  const f = await fixture(); f.controls.unknownStage = true; const active = f.make(); await active.client.capture(f.record.action);
  await assert.rejects(active.client.run(f.id)); await assert.rejects(f.make().client.run(f.id));
  const stageId = f.record.stages[0].operationId;
  assert.equal((await f.make({ enabled: false }).client.inspectStage(f.id, stageId)).operation.state, "unknown");
  f.storage.removeItem(`${AMBIGUOUS_WRITE_KEY}:${stageId}`);
  await assert.rejects(f.make().client.run(f.id)); assert.equal(f.server.stagePosts.length, 1); assert.equal(f.server.savePosts.length, 0);
  assert.equal(f.idb.rows("stage-dispatches").size, 1); assert.equal(saved(f).receipt, null);
});

test("loss after the IDB stage claim but before transport registration never starts an automatic POST", async () => {
  const f = await fixture(); await f.make().client.capture(f.record.action);
  const store = { binding: f.binding, read: id => f.store.read(id), async claimStage(...args) {
    await f.store.claimStage(...args); throw Error("Document stopped after actual committed claim");
  } };
  await assert.rejects(f.make({ store }).client.run(f.id)); noPosts(f);
  assert.equal(f.idb.rows("stage-dispatches").size, 1);
  assert.equal([...f.values.keys()].some(key => key.startsWith(`${AMBIGUOUS_WRITE_KEY}:`)), false);
  await assert.rejects(f.make().client.run(f.id)); noPosts(f);
  assert.equal((await f.make({ enabled: false }).client.inspectStage(f.id, f.record.stages[0].operationId)).operation.state, "unknown");
});

test("unknown save after HTTP remains GET-only with its original UUID and ordered proofs", async () => {
  const f = await fixture(); f.controls.unknownSave = true; const { client } = f.make(); await client.capture(f.record.action);
  await assert.rejects(client.run(f.id)); assert.equal(saved(f).dispatched, true); assert.deepEqual(saved(f).stageReceipts, f.stages);
  f.storage.removeItem(`${AMBIGUOUS_WRITE_KEY}:${f.id}`);
  await assert.rejects(f.make().client.run(f.id)); assert.equal(f.server.savePosts.length, 1); assert.equal(f.server.stagePosts.length, 2);
  assert.equal(await f.make({ enabled: false }).client.inspect(f.id), null);
});

test("lost save ACK followed by unavailable receipt recovers by GET after reload without another command", async () => {
  const f = await fixture(); f.controls.loseSave = true; f.controls.hideSave = true;
  const { client } = f.make(); await client.capture(f.record.action); await assert.rejects(client.run(f.id));
  assert.equal(saved(f).receipt, null); assert.notEqual(f.server.saved, null);
  f.controls.hideSave = false;
  assert.deepEqual(await f.make({ enabled: false }).client.inspect(f.id), f.receipt);
  assert.equal(f.server.savePosts.length, 1); assert.equal(f.server.stagePosts.length, 2);
});

test("quota before the durable save claim permits an exact later retry; loss after it permits only inspection", async () => {
  const f = await fixture(); await f.make().client.capture(f.record.action);
  f.controls.rejectWrite = (key, value) => key.startsWith(commandPrefix) && JSON.parse(value).dispatched;
  await assert.rejects(f.make().client.run(f.id)); assert.equal(saved(f).dispatched, false); assert.equal(f.server.savePosts.length, 0);
  const before = copy(saved(f).stageReceipts); f.controls.rejectWrite = null; f.controls.throwAfterSaveBegin = true;
  await assert.rejects(f.make().client.run(f.id)); assert.equal(saved(f).dispatched, true); assert.equal(f.server.savePosts.length, 0);
  f.controls.throwAfterSaveBegin = false;
  await assert.rejects(f.make().client.run(f.id)); assert.deepEqual(saved(f).stageReceipts, before);
  assert.equal(f.server.savePosts.length, 0); assert.equal(f.server.stagePosts.length, 2);
});

test("quota on command capture or stage receipt persistence retains the immutable IDB selection and resumes with identical IDs", async () => {
  for (const phase of ["capture", "stage-proof"]) {
    const f = await fixture(), { client } = f.make();
    if (phase === "stage-proof") await client.capture(f.record.action);
    f.controls.rejectWrite = (key, value) => key.startsWith(commandPrefix) && (phase === "capture" || JSON.parse(value).stageReceipts.some(Boolean));
    await assert.rejects(phase === "capture" ? client.capture(f.record.action) : client.run(f.id));
    assert.equal(f.server.savePosts.length, 0); assert.equal((await f.store.read(f.id)).intentHash, f.record.intentHash);
    f.controls.rejectWrite = null; const cold = f.make().client; await cold.capture(f.record.action);
    assert.deepEqual(await cold.run(f.id), f.receipt); assert.equal(f.server.stagePosts.length, 2); assert.equal(f.server.savePosts.length, 1);
  }
});

test("historical unavailable stages remain inspectable with OFF, but never grant new copy dispatch", async () => {
  const f = await fixture(), stageId = f.record.stages[0].operationId, unavailable = { ...copy(f.stages[0]), assetState: "unavailable" };
  f.server.stages.set(stageId, unavailable); await f.make().client.capture(f.record.action);
  assert.deepEqual(await f.make({ enabled: false }).client.inspectStage(f.id, stageId), unavailable);
  await assert.rejects(f.make().client.run(f.id)); noPosts(f);
});

test("malformed/foreign staged receipts cannot become unknown or be replaced with an upload", async () => {
  for (const mutate of [stage => { stage.receipt.manifest.source.listId = "public-demo-state-other"; },
    stage => { stage.receipt.manifest.target.entityId = "wrong"; }, stage => { stage.receipt.baseEntityRevision = 1; },
    stage => { stage.receipt.stored.file.hash = hash("different copied bytes"); }, stage => { stage.receipt.materialization.target = copy(stage.receipt.materialization.source); }]) {
    const f = await fixture(), stage = copy(f.stages[0]); mutate(stage); f.server.stages.set(f.record.stages[0].operationId, stage);
    await f.make().client.capture(f.record.action); await assert.rejects(f.make().client.run(f.id)); noPosts(f);
    assert.equal(f.idb.rows("stage-dispatches").size, 0);
  }
});

test("full raw result, owners, digest, order and photo URL origin are independently validated before confirmation", async () => {
  for (const mode of ["raw", "owner", "digest", "order", "origin", "outer-actor"]) {
    const f = await fixture(); await f.make().client.capture(f.record.action);
    f.controls.mutateSave = receipt => {
      const result = receipt.result.payload.photoCopy;
      if (mode === "raw") { result.confirmedPayload.opaque = { changed: true }; result.confirmedPayloadDigest = hash(result.confirmedPayload); }
      if (mode === "owner") result.sourceOwnerId = "other-source-owner";
      if (mode === "digest") result.confirmedPayloadDigest = hash("wrong");
      if (mode === "order") result.added.reverse();
      if (mode === "outer-actor") receipt.operation.actorId = "other";
      if (mode === "origin") {
        result.added[0].photo.url = `https://foreign.example${result.added[0].photo.url}`;
        result.confirmedPayload["items"][result.entityId].photos[0].url = result.added[0].photo.url;
        result.confirmedPayloadDigest = hash(result.confirmedPayload);
      }
    };
    await assert.rejects(f.make().client.run(f.id)); assert.equal(saved(f).receipt, null);
    const damaged = saved(f); damaged.receipt = f.server.saved; f.values.set(command(f), canonicalTemplateJson(damaged));
    await assert.rejects(f.make().client.read(f.id)); assert.equal(f.server.savePosts.length, 1);
  }
});

test("cold journal corruption, record-hash mismatch and foreign transport recovery identity block before POST", async () => {
  for (const mode of ["hash", "stage-order", "action", "transport", "null-intent"]) {
    const f = await fixture(), { client } = f.make(); await client.capture(f.record.action);
    if (mode === "transport") {
      f.controls.unknownStage = true; await assert.rejects(client.run(f.id));
      const key = `${AMBIGUOUS_WRITE_KEY}:${f.record.stages[0].operationId}`, value = JSON.parse(f.values.get(key)); value.recovery.actorId = "other";
      f.values.set(key, JSON.stringify(value)); const count = f.server.stagePosts.length;
      await assert.rejects(f.make().client.run(f.id)); assert.equal(f.server.stagePosts.length, count); assert.equal(f.server.savePosts.length, 0); continue;
    }
    const value = saved(f);
    if (mode === "hash") value.recordIntentHash = hash("other record");
    if (mode === "stage-order") value.stageReceipts = [f.stages[1], f.stages[0]];
    if (mode === "action") value.intent.body.photoCopy.source.entityId = "detached";
    if (mode === "null-intent") value.intent = null;
    f.values.set(command(f), canonicalTemplateJson(value)); await assert.rejects(f.make().client.run(f.id)); noPosts(f);
  }
});

test("document end and stalled response JSON retain claims and recover only by GET from a new client", async () => {
  for (const phase of ["stage-pagehide", "save-json-timeout"]) {
    const f = await fixture(), lifecycleTarget = new EventTarget(); await f.make().client.capture(f.record.action);
    if (phase === "stage-pagehide") f.controls.afterRequest = (path, method) => {
      if (method === "POST" && path.endsWith("/template-photo-assets/copy")) lifecycleTarget.dispatchEvent(new Event("pagehide"));
    };
    const fetchImpl = async (url, options) => {
      const response = await f.fetchImpl(url, options);
      return phase === "save-json-timeout" && options.method === "POST" && url.endsWith("/template-operations")
        ? { status: 200, json: () => new Promise(() => {}) } : response;
    };
    await assert.rejects(f.make({ lifecycleTarget, fetchImpl, timeoutMs: 40 }).client.run(f.id));
    assert.equal(saved(f).receipt, null); assert.equal(f.server.savePosts.length, phase === "save-json-timeout" ? 1 : 0);
    assert.equal(f.idb.rows("stage-dispatches").size, phase === "save-json-timeout" ? 2 : 1);
    f.controls.afterRequest = null;
    assert.deepEqual(await f.make().client.run(f.id), f.receipt);
    assert.equal(f.server.stagePosts.length, 2); assert.equal(f.server.savePosts.length, 1);
  }
});

test("actor/generation change during source decode or returned HTTP cannot persist another context's receipt", async () => {
  for (const phase of ["decode", "stage", "save"]) {
    const f = await fixture(); await f.make().client.capture(f.record.action);
    const store = phase === "decode" ? { binding: f.binding, async read(id) { const value = await f.store.read(id); f.current.generation = "changed"; return value; } } : f.store;
    if (phase !== "decode") f.controls.afterRequest = (path, method) => {
      if (method === "POST" && path.endsWith(phase === "stage" ? "/template-photo-assets/copy" : "/template-operations")) f.current.generation = "changed";
    };
    await assert.rejects(f.make({ store }).client.run(f.id)); assert.equal(saved(f).receipt, null);
    assert.equal(f.server.savePosts.length, phase === "save" ? 1 : 0);
  }
});

test("concurrent client runs serialize immutable claims and send each stage/save once", async () => {
  const f = await fixture(); await f.make().client.capture(f.record.action);
  const receipts = await Promise.all([f.make().client.run(f.id), f.make().client.run(f.id)]);
  assert.deepEqual(receipts, [f.receipt, f.receipt]); assert.equal(f.server.stagePosts.length, 2); assert.equal(f.server.savePosts.length, 1);
});

test("terminal rejection/cancellation is readable with OFF without staging or dispatching another command", async () => {
  for (const cancellation of [false, true]) {
    const f = await fixture(); await f.make().client.capture(f.record.action);
    f.server.saved = { operation: { ...copy(f.receipt.operation), state: "rejected" }, result: { status: 409, payload: { ok: false,
      code: cancellation ? "operation_cancelled" : "template_source_changed", ...(cancellation ? { cancellation: { version: 1, operationId: f.id,
        noBusinessEffects: true, operationCannotApply: true } } : {}) } } };
    assert.deepEqual(await f.make({ enabled: false }).client.inspect(f.id), f.server.saved); noPosts(f);
  }
});
