import test from "node:test";
import assert from "node:assert/strict";
import { treeCopyClientFixture as fixture, copy, hash, commandPrefix, stagePath } from "../fixtures/admin-template-photo-tree-copy-client-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { AMBIGUOUS_WRITE_KEY } from "../../src/sync/experiment-transport.js";
import { createAdminTemplatePhotoTreeCopyClient } from "../../src/sync/admin-template-photo-tree-copy-client.js";
import { adminPhotoCopyRecordInput } from "../fixtures/admin-template-photo-copy-record-fixture.js";

const key = f => [...f.values.keys()].find(name => name.startsWith(commandPrefix));
const saved = f => JSON.parse(f.values.get(key(f))), noPosts = f => { assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0); };
const capture = f => f.make().client.capture(f.record.action);
const seedStages = (f, state = "ready") => f.stages.forEach(stage => f.server.stages.set(stage.receipt.manifest.operationId, { ...copy(stage), assetState: state }));
const cancelFact = f => ({ operation: { ...copy(f.receipt.operation), state: "rejected" }, result: { status: 409, payload: { ok: false, code: "operation_cancelled",
  cancellation: { version: 1, operationId: f.id, noBusinessEffects: true, operationCannotApply: true } } } });

test("all tree owners use typed routes, one claim each and full raw receipts through lost ACK and cold OFF reconciliation", async () => {
  const f = await fixture(); f.controls.loseStage = true; f.controls.loseSave = true;
  const { client } = f.make(), journal = await client.capture(f.record.action);
  assert.equal(journal.recordIntentHash, f.record.intentHash); assert.deepEqual(journal.stageReceipts, [null, null, null, null]);
  const result = await client.run(f.id); assert.deepEqual(result, f.receipt);
  assert.equal(f.server.stagePosts.length, 4); assert.equal(f.server.savePosts.length, 1); assert.equal(f.idb.rows("stage-dispatches").size, 4);
  assert.equal(f.admission.calls, 5); assert.equal(f.admission.active, false); assert.ok(f.admission.checks > 10);
  assert.equal(f.server.calls.filter(row => row.method === "POST" && row.path.includes("template-photo-assets")).every(row => row.path.endsWith(stagePath)), true);
  assert.equal(result.result.payload.photoCopy.owners.some(owner => owner.added.length === 0), true);
  assert.equal(result.result.payload.photoCopy.confirmedPayload.items["target-item"].photos[0].futureMetadata, 8);
  const off = f.make({ enabled: false, adminEnabled: false, appendEnabled: false, createEnabled: false, copyEnabled: false,
    withDispatchAdmission: null, store: f.makeStore({ enabled: false }) }).client;
  assert.deepEqual((await off.read(f.id)).receipt, f.receipt); assert.deepEqual(await off.inspect(f.id), f.receipt);
  assert.deepEqual(await off.run(f.id), f.receipt); assert.deepEqual((await off.capture(f.record.action)).intent, f.intent);
  assert.deepEqual((await off.list()).map(row => row.intent.id), [f.id]); assert.equal(Object.hasOwn(off, "cancel"), false);
  assert.equal(f.server.stagePosts.length, 4); assert.equal(f.server.savePosts.length, 1);
});

test("each prerequisite and the default OFF gate reject capture/dispatch before any POST", async () => {
  for (const flag of ["enabled", "adminEnabled", "appendEnabled", "createEnabled", "copyEnabled"]) {
    const f = await fixture(); await assert.rejects(f.make({ [flag]: false }).client.capture(f.record.action)); assert.equal(f.values.size, 0);
    await capture(f); await assert.rejects(f.make({ [flag]: false }).client.run(f.id)); noPosts(f);
  }
  for (const capability of ["adminTemplateCausalOperationsV1", "adminTemplatePhotoAppendV1", "adminTemplatePhotoCreateV1", "adminTemplatePhotoCopyV1", "adminTemplatePhotoTreeCopyV1"]) {
    const f = await fixture(); await capture(f); f.controls.capabilities = f.controls.capabilities.filter(value => value !== capability);
    await assert.rejects(f.make().client.run(f.id)); noPosts(f);
  }
  const f = await fixture(), { transport } = f.make();
  const defaults = createAdminTemplatePhotoTreeCopyClient({ binding: f.binding, getContext: () => f.current, store: f.store, transport,
    storage: f.storage, locks: f.locks, fetchImpl: f.fetchImpl });
  await assert.rejects(defaults.capture(f.record.action)); noPosts(f);
});

test("missing admission, a bare boolean and a callback without an owned scope cannot authorize claims or POSTs", async () => {
  for (const withDispatchAdmission of [null, true, async () => true, async (proof, task) => task(true)]) {
    const f = await fixture(); await capture(f); const c = f.make({ withDispatchAdmission }).client;
    assert.equal(await c.inspect(f.id), null); await assert.rejects(c.run(f.id)); noPosts(f); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  }
  const f = await fixture(); await capture(f); seedStages(f);
  await assert.rejects(f.make({ withDispatchAdmission: null }).client.run(f.id)); noPosts(f); assert.equal(saved(f).dispatched, false);
});

test("admission remains held through claim/readback and a revoked scope cannot proceed to transport or release its claim", async () => {
  const f = await fixture(); await capture(f); f.controls.afterClaim = () => { f.controls.revokeAdmission = true; };
  await assert.rejects(f.make().client.run(f.id)); noPosts(f); assert.equal(f.idb.rows("stage-dispatches").size, 1);
  assert.equal(f.admission.active, false); f.controls.afterClaim = null; f.controls.revokeAdmission = false;
  await assert.rejects(f.make().client.run(f.id)); noPosts(f); assert.equal(f.idb.rows("stage-dispatches").size, 1);
});

test("an admission wrapper that returns before its asynchronous callback completes cannot leave a detached writer running", async () => {
  const f = await fixture(); await capture(f); let unfinished;
  const withDispatchAdmission = (proof, task) => {
    let held = true;
    unfinished = task({ assertCurrent() { proof.assertCurrent(); if (!held) throw Error("Lease released early"); } });
    unfinished.catch(() => {}); held = false;
  };
  await assert.rejects(f.make({ withDispatchAdmission }).client.run(f.id));
  await assert.rejects(unfinished); noPosts(f); assert.equal(f.idb.rows("stage-dispatches").size, 0);
});

test("scope loss after durable transport registration retains an uncertain barrier without sending the stage", async () => {
  const f = await fixture(); await capture(f); f.controls.afterBegin = () => { f.controls.revokeAdmission = true; };
  const { client, transport } = f.make(); await assert.rejects(client.run(f.id)); noPosts(f);
  const stageId = f.record.stages[0].operationId, entry = transport.writes.find(row => row.id === stageId);
  assert.equal(entry.uncertain, true); assert.equal(f.idb.rows("stage-dispatches").size, 1);
  f.controls.afterBegin = null; f.controls.revokeAdmission = false;
  await assert.rejects(f.make().client.run(f.id)); noPosts(f);
});

test("unknown stage never POSTs twice even after reload and disappearance of the common transport entry", async () => {
  const f = await fixture(); await capture(f); f.controls.unknownStage = true;
  await assert.rejects(f.make().client.run(f.id)); await assert.rejects(f.make().client.run(f.id));
  const stageId = f.record.stages[0].operationId;
  assert.equal((await f.make({ enabled: false, withDispatchAdmission: null }).client.inspectStage(f.id, stageId)).operation.state, "unknown");
  f.storage.removeItem(`${AMBIGUOUS_WRITE_KEY}:${stageId}`);
  await assert.rejects(f.make().client.run(f.id)); assert.equal(f.server.stagePosts.length, 1); assert.equal(f.server.savePosts.length, 0);
  assert.equal(f.idb.rows("stage-dispatches").size, 1); assert.equal(saved(f).receipt, null);
});

test("unknown save and lost ACK with temporarily hidden receipt remain GET-only under the original UUID", async () => {
  for (const mode of ["unknown", "hidden"]) {
    const f = await fixture(); await capture(f);
    if (mode === "unknown") f.controls.unknownSave = true; else { f.controls.loseSave = true; f.controls.hideSave = true; }
    await assert.rejects(f.make().client.run(f.id)); assert.equal(saved(f).dispatched, true); assert.deepEqual(saved(f).stageReceipts, f.stages);
    f.storage.removeItem(`${AMBIGUOUS_WRITE_KEY}:${f.id}`);
    await assert.rejects(f.make().client.run(f.id)); assert.equal(f.server.stagePosts.length, 4); assert.equal(f.server.savePosts.length, 1);
    if (mode === "hidden") { f.controls.hideSave = false; assert.deepEqual(await f.make({ enabled: false, withDispatchAdmission: null }).client.inspect(f.id), f.receipt); }
    else assert.equal(await f.make({ enabled: false, withDispatchAdmission: null }).client.inspect(f.id), null);
    assert.equal(f.server.savePosts.length, 1);
  }
});

test("quota on command capture, stage proof or pre-save marker retains IDB selection and resumes only the same immutable operation", async () => {
  for (const phase of ["capture", "stage", "save"]) {
    const f = await fixture(); if (phase !== "capture") await capture(f);
    f.controls.rejectWrite = (key, value) => key.startsWith(commandPrefix) && (phase === "capture"
      || phase === "stage" && JSON.parse(value).stageReceipts.some(Boolean) || phase === "save" && JSON.parse(value).dispatched);
    await assert.rejects(phase === "capture" ? capture(f) : f.make().client.run(f.id));
    assert.equal(f.server.savePosts.length, 0); assert.deepEqual(await f.store.read(f.id), f.record);
    f.controls.rejectWrite = null; await capture(f); assert.deepEqual(await f.make().client.run(f.id), f.receipt);
    assert.equal(f.server.stagePosts.length, 4); assert.equal(f.server.savePosts.length, 1); assert.equal(f.idb.rows().size, 1);
  }
});

test("interruption after the save dispatch marker but before HTTP never retries the business command", async () => {
  const f = await fixture(); await capture(f); f.controls.throwAfterSaveBegin = true;
  await assert.rejects(f.make().client.run(f.id)); assert.equal(saved(f).dispatched, true); assert.equal(f.server.savePosts.length, 0);
  f.controls.throwAfterSaveBegin = false; await assert.rejects(f.make().client.run(f.id));
  assert.equal(f.server.savePosts.length, 0); assert.equal(f.server.stagePosts.length, 4); assert.equal(saved(f).receipt, null);
});

test("typed stage proof refuses V1, wrong manifest/actor/bytes/path and does not reinterpret errors as unknown", async () => {
  for (const mutate of [
    stage => { stage.receipt.kind = "admin-template-photo-copy"; stage.receipt.version = 1; },
    stage => { stage.receipt.manifest.actorId = "other"; }, stage => { stage.receipt.manifest.target.entityId = "other"; },
    stage => { stage.receipt.stored.file.hash = hash("different"); },
    stage => { stage.receipt.materialization.target = copy(stage.receipt.materialization.source); },
    stage => { stage.ok = false; }, stage => { stage.extra = true; }
  ]) {
    const f = await fixture(); await capture(f); const stage = copy(f.stages[0]); mutate(stage); f.server.stages.set(f.record.stages[0].operationId, stage);
    await assert.rejects(f.make().client.run(f.id)); noPosts(f); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  }
});

test("global cross-owner path alias or inconsistent source byte proof blocks save even when every individual stage looks valid", async () => {
  for (const fault of ["target-alias", "source-bytes"]) {
    const f = await fixture(); await capture(f); seedStages(f);
    const first = f.server.stages.get(f.record.stages[0].operationId), second = f.server.stages.get(f.record.stages[1].operationId);
    if (fault === "target-alias") second.receipt.materialization.target.filePathDigest = first.receipt.materialization.target.filePathDigest;
    else second.receipt.materialization.source.filePathDigest = first.receipt.materialization.source.filePathDigest;
    await assert.rejects(f.make().client.run(f.id)); noPosts(f); assert.equal(saved(f).receipt, null);
    await assert.rejects(f.make().client.read(f.id));
  }
});

test("full raw projection, owner grouping, preserved timestamps and URL origin are validated before confirmation", async () => {
  for (const fault of ["raw", "owner", "timestamp", "origin", "outer-actor"]) {
    const f = await fixture(); await capture(f);
    f.controls.mutateSave = receipt => {
      const result = receipt.result.payload.photoCopy, first = result.owners.find(owner => owner.added.length), photo = first.added[0].photo;
      if (fault === "raw") result.confirmedPayload.opaque = { changed: true };
      if (fault === "owner") result.owners.reverse();
      if (fault === "outer-actor") receipt.operation.actorId = "foreign";
      if (fault === "timestamp") photo.createdAt = "2020-01-01T00:00:00Z";
      if (fault === "origin") photo.url = `https://foreign.example${photo.url}`;
      if (["timestamp", "origin"].includes(fault)) result.confirmedPayload[first.entityType === "item" ? "items" : "containers"][first.entityId].photos[0] = copy(photo);
      result.confirmedPayloadDigest = hash(result.confirmedPayload);
    };
    await assert.rejects(f.make().client.run(f.id)); assert.equal(saved(f).receipt, null); assert.equal(f.server.savePosts.length, 1);
    const journal = saved(f); journal.receipt = f.server.saved; f.values.set(key(f), canonical(journal)); await assert.rejects(f.make().client.read(f.id));
  }
});

test("unavailable history allows terminal reconciliation but never authorizes a new save", async () => {
  const f = await fixture(); await capture(f); seedStages(f, "unavailable");
  const off = f.make({ enabled: false, withDispatchAdmission: null }).client;
  assert.equal((await off.inspectStage(f.id, f.record.stages[0].operationId)).assetState, "unavailable");
  await assert.rejects(f.make().client.run(f.id)); noPosts(f);
  f.server.saved = copy(f.receipt); assert.deepEqual(await off.inspect(f.id), f.receipt); noPosts(f);
  assert.equal(f.idb.rows("stage-dispatches").size, 0);
});

test("strong cancelled fact is readable with OFF but grants no parent fence, stage confirmation or cancellation method", async () => {
  const f = await fixture(); await capture(f); f.controls.unknownStage = true; await assert.rejects(f.make().client.run(f.id));
  const stageId = f.record.stages[0].operationId; f.server.saved = cancelFact(f);
  const { client, transport } = f.make({ enabled: false, withDispatchAdmission: null });
  assert.deepEqual(await client.inspect(f.id), f.server.saved); assert.equal(Object.hasOwn(client, "cancel"), false);
  const stage = transport.writes.find(row => row.id === stageId); assert.equal(stage.uncertain, true); assert.notEqual(stage.confirmed, true);
  assert.equal(stage.parentFenced, false); assert.equal(stage.blocksWrites, true); assert.equal(f.idb.rows("stage-dispatches").size, 1);
  assert.throws(() => transport.assertWritable("/bike-packing/other", "POST")); assert.equal(f.server.savePosts.length, 0);
  const corrupt = saved(f); corrupt.receipt.result.payload.cancellation.operationCannotApply = false;
  f.values.set(key(f), canonical(corrupt)); await assert.rejects(client.read(f.id));
});

test("immutable binding, real actor rights, full record proof and V1 cross-kind refusal fence all dispatch", async () => {
  for (const flag of ["wrongActor", "noRights"]) {
    const f = await fixture(); await capture(f); f.controls[flag] = true; await assert.rejects(f.make().client.run(f.id)); noPosts(f);
  }
  const f = await fixture(), client = f.make().client, action = copy(f.record.action), pending = client.capture(action);
  action.body.photoCopy.fields.name = "late caller change";
  assert.deepEqual((await pending).intent, f.intent); assert.equal(Object.isFrozen(client.binding), true);
  assert.throws(() => { client.binding.actorId = "foreign"; }, TypeError);
  f.current.scope = "personal"; await assert.rejects(client.read(f.id)); f.current.scope = "admin-template";
  const raw = [...f.idb.rows().values()][0]; raw.intentHash = "0".repeat(64);
  await assert.rejects(client.run(f.id)); noPosts(f);
  const old = await adminPhotoCopyRecordInput(); await assert.rejects(client.capture(old.action));
});

test("account change after stage POST keeps its barrier and original actor recovers by exact typed GET", async () => {
  const f = await fixture(); await capture(f); const before = copy(f.current), { client, transport } = f.make();
  f.controls.afterRequest = (path, method) => { if (method === "POST" && path.endsWith(stagePath)) f.current.actorId = "other-account"; };
  await assert.rejects(client.run(f.id)); assert.equal(saved(f).stageReceipts[0], null); assert.equal(f.server.stagePosts.length, 1);
  assert.equal(transport.writes.find(row => row.id === f.record.stages[0].operationId).uncertain, true);
  Object.assign(f.current, before); f.controls.afterRequest = null;
  assert.deepEqual(await f.make({ enabled: false, withDispatchAdmission: null }).client.inspectStage(f.id, f.record.stages[0].operationId), f.stages[0]);
  assert.deepEqual(await f.make().client.run(f.id), f.receipt); assert.equal(f.server.stagePosts.length, 4);
});

test("page end and stalled response JSON prevent late effects and clean their lifecycle listeners", async () => {
  for (const phase of ["pagehide", "json-timeout"]) {
    const f = await fixture(), target = new EventTarget(), listeners = new Map();
    const lifecycle = { addEventListener(type, listener, options) { listeners.set(type, listener); target.addEventListener(type, listener, options); },
      removeEventListener(type, listener) { assert.equal(listeners.get(type), listener); listeners.delete(type); target.removeEventListener(type, listener); },
      dispatchEvent: event => target.dispatchEvent(event) };
    await capture(f);
    const fetchImpl = async (...args) => {
      const response = await f.fetchImpl(...args);
      if (args[0].endsWith("/auth/me")) {
        if (phase === "pagehide") lifecycle.dispatchEvent(new Event("pagehide"));
        else return { status: 200, json: () => new Promise(() => {}) };
      }
      return response;
    };
    await assert.rejects(f.make({ lifecycleTarget: lifecycle, timeoutMs: 20, fetchImpl }).client.run(f.id)); noPosts(f);
    assert.equal(saved(f).receipt, null); assert.equal(f.idb.rows("stage-dispatches").size, 0); assert.equal(listeners.size, 0);
  }
});

test("two clients serialize one business command and unchanged IDs instead of replaying stages", async () => {
  const f = await fixture(); await capture(f);
  const results = await Promise.all([f.make().client.run(f.id), f.make().client.run(f.id)]);
  assert.deepEqual(results, [f.receipt, f.receipt]); assert.equal(f.server.stagePosts.length, 4); assert.equal(f.server.savePosts.length, 1);
  assert.equal(f.idb.rows().size, 1); assert.equal(f.idb.rows("stage-dispatches").size, 4);
});
