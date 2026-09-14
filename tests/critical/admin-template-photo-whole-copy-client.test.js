import test from "node:test";
import assert from "node:assert/strict";
import { wholeCopyClientFixture as fixture, copy, hash, commandPrefix, stagePath, parentPath, transportPrefix }
  from "../fixtures/admin-template-photo-whole-copy-client-fixture.js";
import { createAdminTemplatePhotoWholeCopyClient } from "../../src/sync/admin-template-photo-whole-copy-client.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";

const key = f => [...f.values.keys()].find(name => name.startsWith(commandPrefix));
const saved = f => JSON.parse(f.values.get(key(f)));
const capture = f => f.make().client.capture(f.record.action);
const noPosts = f => { assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.parentPosts.length, 0); assert.equal(f.server.cancelPosts.length, 0); };
const seed = (f, state = "ready") => f.stages.forEach(stage => f.server.stages.set(stage.receipt.manifest.operationId, { ...copy(stage), assetState: state }));
const off = f => f.make({ enabled: false, adminEnabled: false, appendEnabled: false, createEnabled: false, copyEnabled: false,
  withDispatchAdmission: null, withCancellationAdmission: null }).client;

test("five typed V3 stages and one absent-target template.copy retain original IDs through lost ACK and cold OFF reads", async () => {
  const f = await fixture(); f.controls.loseStage = true; f.controls.loseParent = true;
  const client = f.make().client; const journal = await client.capture(f.record.action);
  assert.deepEqual(journal.stageReceipts, [null, null, null, null, null]); assert.equal(journal.kind, "admin-template-photo-whole-copy");
  assert.ok(key(f).startsWith(commandPrefix)); assert.equal(journal.recordIntentHash, f.record.intentHash);
  assert.deepEqual(await client.run(f.id), f.receipt);
  assert.equal(f.server.stagePosts.length, 5); assert.equal(f.server.parentPosts.length, 1);
  assert.equal(f.admission.calls, 6); assert.equal(f.admission.active, false);
  assert.ok(f.admission.checks > 20); assert.equal(f.server.parentPosts[0].kind, "template.copy");
  assert.equal(f.server.parentPosts[0].body.base, null); assert.equal(f.receipt.result.payload.stateRevision, 1);
  assert.ok(f.server.stagePosts.every(body => body.manifest.kind === "admin-template-photo-whole-copy" && body.manifest.version === 3));
  const cold = off(f);
  assert.deepEqual((await cold.read(f.id)).receipt, f.receipt); assert.deepEqual(await cold.inspect(f.id), f.receipt);
  assert.deepEqual(await cold.run(f.id), f.receipt); assert.deepEqual((await cold.capture(f.record.action)).intent, f.intent);
  assert.deepEqual((await cold.list()).map(row => row.intent.id), [f.id]);
  assert.equal(f.server.parentPosts.length, 1); assert.equal(f.server.stagePosts.length, 5);
});

test("each own/older gate and required capability blocks capture or fresh POST", async () => {
  for (const flag of ["enabled", "adminEnabled", "appendEnabled", "createEnabled", "copyEnabled"]) {
    const f = await fixture(); await assert.rejects(f.make({ [flag]: false }).client.capture(f.record.action)); assert.equal(f.values.size, 0);
    await capture(f); await assert.rejects(f.make({ [flag]: false }).client.run(f.id)); noPosts(f);
  }
  const f = await fixture(); await capture(f);
  for (const capability of [...f.controls.capabilities]) {
    const original = f.controls.capabilities; f.controls.capabilities = original.filter(value => value !== capability);
    await assert.rejects(f.make().client.run(f.id)); noPosts(f); f.controls.capabilities = original;
  }
  const g = await fixture(), { transport } = g.make();
  const defaults = createAdminTemplatePhotoWholeCopyClient({ binding: g.binding, getContext: () => g.current, store: g.store,
    transport, storage: g.storage, locks: g.locks, fetchImpl: g.fetchImpl });
  await assert.rejects(defaults.capture(g.record.action)); noPosts(g);
});

test("dispatch admission rejects missing, asynchronous, false and unowned assertions before any claim", async () => {
  for (const withDispatchAdmission of [null, true, async () => true, async (proof, task) => task(true),
    async (proof, task) => task({ assertCurrent: async () => true }), async (proof, task) => task({ assertCurrent: () => false }),
    async (proof, task) => task({ assertCurrent() {}, globalAllowed: true })]) {
    const f = await fixture(); await capture(f);
    const client = f.make({ withDispatchAdmission }).client;
    assert.equal(await client.inspect(f.id), null); await assert.rejects(client.run(f.id)); noPosts(f);
    assert.equal(f.idb.rows("stage-dispatches").size, 0);
  }
});

test("early admission release cannot leave an asynchronous writer running", async () => {
  const f = await fixture(); await capture(f); let unfinished;
  const withDispatchAdmission = (proof, task) => { let held = true;
    unfinished = task({ assertCurrent() { proof.assertCurrent(); if (!held) throw Error("Released"); } });
    unfinished.catch(() => {}); held = false;
  };
  await assert.rejects(f.make({ withDispatchAdmission }).client.run(f.id)); await assert.rejects(unfinished);
  noPosts(f); assert.equal(f.idb.rows("stage-dispatches").size, 0);
});

test("revocation after durable stage claim retains that claim and cannot trigger another POST after reload", async () => {
  const f = await fixture(); await capture(f); f.controls.afterClaim = () => { f.controls.revokeAdmission = true; };
  await assert.rejects(f.make().client.run(f.id)); noPosts(f); assert.equal(f.idb.rows("stage-dispatches").size, 1);
  f.controls.afterClaim = null; f.controls.revokeAdmission = false;
  await assert.rejects(f.make().client.run(f.id)); noPosts(f); assert.equal(f.idb.rows("stage-dispatches").size, 1);
});

test("same operation journal replacement during beginWrite pauses before stage or parent HTTP", async () => {
  for (const phase of ["stage", "parent"]) for (const fault of ["whitespace", "cancel-marker"]) {
    const f = await fixture(); await capture(f); if (phase === "parent") seed(f);
    f.controls.afterBegin = path => {
      if (path !== (phase === "stage" ? stagePath : parentPath)) return;
      const name = key(f), value = f.values.get(name);
      f.values.set(name, fault === "whitespace" ? value + " " : canonical({ ...JSON.parse(value), cancelRequested: true }));
    };
    await assert.rejects(f.make().client.run(f.id)); noPosts(f);
    const operationId = phase === "stage" ? f.record.stages[0].operationId : f.id;
    assert.equal(JSON.parse(f.values.get(transportPrefix + operationId)).uncertain, true);
  }
});

test("cold read detects exact journal replacement while its typed record is being validated", async () => {
  for (const fault of ["whitespace", "valid-change"]) {
    const f = await fixture(); await capture(f);
    f.controls.afterRead = () => {
      f.controls.afterRead = null; const name = key(f), text = f.values.get(name);
      f.values.set(name, fault === "whitespace" ? text + " " : canonical({ ...JSON.parse(text), cancelRequested: true }));
    };
    await assert.rejects(off(f).read(f.id), { code: "admin-template-photo-whole-copy-client-journal-changed" }); noPosts(f);
  }
});

test("unknown stage keeps a durable one-shot claim even when transport record disappears", async () => {
  const f = await fixture(); await capture(f); f.controls.unknownStage = true;
  await assert.rejects(f.make().client.run(f.id)); const stageId = f.record.stages[0].operationId;
  f.storage.removeItem(transportPrefix + stageId);
  await assert.rejects(f.make().client.run(f.id));
  assert.equal((await off(f).inspectStage(f.id, stageId)).operation.state, "unknown");
  assert.equal(f.server.stagePosts.length, 1); assert.equal(f.server.parentPosts.length, 0);
  assert.equal(f.idb.rows("stage-dispatches").size, 1);
});

test("unknown parent or hidden lost ACK cannot allocate or POST another copy after reload", async () => {
  for (const mode of ["unknown", "hidden"]) {
    const f = await fixture(); await capture(f);
    if (mode === "unknown") f.controls.unknownParent = true; else { f.controls.loseParent = true; f.controls.hideParent = true; }
    await assert.rejects(f.make().client.run(f.id)); assert.equal(saved(f).dispatched, true);
    f.storage.removeItem(transportPrefix + f.id); await assert.rejects(f.make().client.run(f.id));
    assert.equal(f.server.parentPosts.length, 1); assert.equal(f.server.stagePosts.length, 5);
    if (mode === "hidden") { f.controls.hideParent = false; assert.deepEqual(await off(f).inspect(f.id), f.receipt); }
    else assert.equal(await off(f).inspect(f.id), null);
    assert.equal(f.server.parentPosts.length, 1);
  }
});

test("quota before capture, stage proof or parent marker preserves record and original operation recovery", async () => {
  for (const phase of ["capture", "stage", "parent"]) {
    const f = await fixture(); if (phase !== "capture") await capture(f);
    f.controls.rejectWrite = (name, value) => name.startsWith(commandPrefix) && (phase === "capture"
      || phase === "stage" && JSON.parse(value).stageReceipts.some(Boolean) || phase === "parent" && JSON.parse(value).dispatched);
    await assert.rejects(phase === "capture" ? capture(f) : f.make().client.run(f.id));
    assert.equal(f.server.parentPosts.length, 0); assert.deepEqual(await f.store.read(f.id), f.record);
    f.controls.rejectWrite = null; await capture(f); assert.deepEqual(await f.make().client.run(f.id), f.receipt);
    assert.equal(f.server.parentPosts.length, 1); assert.equal(f.server.stagePosts.length, 5);
  }
});

test("actor, generation and readonly scope changes during authenticated reads or beginWrite stop all POSTs", async () => {
  for (const mutate of [f => { f.current.actorId = "foreign"; }, f => { f.current.generation += "next"; },
    f => { f.current.scope = "readonly"; }]) for (const phase of ["read", "begin"]) {
    const f = await fixture(); await capture(f);
    if (phase === "read") f.controls.afterRequest = path => { if (path.endsWith("/authorization")) mutate(f); };
    else f.controls.afterBegin = () => mutate(f);
    await assert.rejects(f.make().client.run(f.id)); noPosts(f);
  }
  for (const flag of ["wrongActor", "noRights"]) { const f = await fixture(); await capture(f); f.controls[flag] = true;
    await assert.rejects(f.make().client.run(f.id)); noPosts(f); }
});

test("typed historical stage rejects another version, actor, file proof or unavailable bytes before parent POST", async () => {
  for (const mutate of [s => { s.receipt.version = 2; }, s => { s.receipt.kind = "admin-template-photo-tree-copy"; },
    s => { s.receipt.manifest.actorId = "foreign"; }, s => { s.receipt.stored.file.hash = hash("other bytes"); },
    s => { s.receipt.materialization.target = copy(s.receipt.materialization.source); }, s => { s.assetState = "unavailable"; }]) {
    const f = await fixture(); await capture(f); const stage = copy(f.stages[0]); mutate(stage);
    f.server.stages.set(f.record.stages[0].operationId, stage); await assert.rejects(f.make().client.run(f.id)); noPosts(f);
  }
});

test("global cross-owner materialization collision prevents parent creation", async () => {
  const f = await fixture(); await capture(f); seed(f);
  const first = f.server.stages.get(f.record.stages[0].operationId), second = f.server.stages.get(f.record.stages[1].operationId);
  second.receipt.materialization.target.filePathDigest = first.receipt.materialization.target.filePathDigest;
  await assert.rejects(f.make().client.run(f.id)); noPosts(f); assert.equal(saved(f).receipt, null);
});

test("committed parent validates whole result, new owner, revision 1 and full raw payload before confirmation", async () => {
  for (const fault of ["owner", "revision", "payload", "layout"]) {
    const f = await fixture(); await capture(f);
    f.controls.mutateParent = receipt => {
      const payload = receipt.result.payload;
      if (fault === "owner") payload.photoCopy.ownerId = "other-admin";
      if (fault === "revision") payload.stateRevision = 2;
      if (fault === "layout") payload.photoCopy.layoutId = "foreign";
      if (fault === "payload") { payload.photoCopy.confirmedPayload.opaqueTop = {}; payload.photoCopy.confirmedPayloadDigest = hash(payload.photoCopy.confirmedPayload); }
    };
    await assert.rejects(f.make().client.run(f.id)); assert.equal(saved(f).receipt, null); assert.equal(f.server.parentPosts.length, 1);
    await assert.rejects(off(f).inspect(f.id)); assert.equal(f.server.parentPosts.length, 1);
  }
});

test("unavailable stages permit authenticated committed-history reads but cannot create the target", async () => {
  const f = await fixture(); await capture(f); seed(f, "unavailable");
  assert.equal((await off(f).inspectStage(f.id, f.record.stages[0].operationId)).assetState, "unavailable");
  await assert.rejects(f.make().client.run(f.id)); noPosts(f);
  f.server.saved = copy(f.receipt); assert.deepEqual(await off(f).inspect(f.id), f.receipt); noPosts(f);
});

test("cancellation requires the new typed parent fence and never falls back to the tree fence", async () => {
  const f = await fixture(); await capture(f); const { transport } = f.make();
  delete transport.fenceWholeCopyParent;
  transport.fenceTreeCopyParent = async () => assert.fail("wrong protocol fence");
  await assert.rejects(f.make({ transport }).client.cancel(f.id), { code: "admin-template-photo-whole-copy-client-parent-fence" });
  assert.equal(saved(f).cancelRequested, true); assert.equal(f.server.calls.length, 0); noPosts(f);
  await assert.rejects(f.make().client.run(f.id)); noPosts(f);
});

test("fence withdrawal after durable cancel registration prevents the cancellation POST", async () => {
  const f = await fixture(); await capture(f); const { transport } = f.make();
  f.controls.afterBegin = path => { if (path.endsWith("/cancel")) delete transport.fenceWholeCopyParent; };
  await assert.rejects(f.make({ transport }).client.cancel(f.id));
  assert.equal(saved(f).cancelRequested, true); noPosts(f);
  assert.equal(JSON.parse(f.values.get(transportPrefix + f.id)).uncertain, true);
});

test("cancel admission assertions must be synchronous and cannot permit a business POST", async () => {
  for (const withCancellationAdmission of [null, async () => true, async (proof, task) => task({ assertCurrent: async () => true }),
    async (proof, task) => task({ assertCurrent: () => false })]) {
    const f = await fixture(); await capture(f);
    await assert.rejects(f.make({ withCancellationAdmission }).client.cancel(f.id));
    assert.equal(saved(f).cancelRequested, true); noPosts(f);
  }
});

test("explicit cancellation with lost ACK fences only the original parent and keeps stage claims separate", async () => {
  const f = await fixture(); await capture(f); f.controls.unknownStage = true;
  await assert.rejects(f.make().client.run(f.id)); const stageId = f.record.stages[0].operationId;
  f.controls.loseCancel = true;
  const cancelled = await f.make().client.cancel(f.id);
  assert.equal(cancelled.result.payload.code, "operation_cancelled"); assert.equal(saved(f).cancelRequested, true);
  assert.equal(f.fences.length, 1); assert.equal(f.server.cancelPosts.length, 1);
  assert.equal(JSON.parse(f.values.get(transportPrefix + stageId)).confirmed, false);
  assert.equal(f.idb.rows("stage-dispatches").size, 1); assert.equal(f.server.parentPosts.length, 0);
  assert.deepEqual(await off(f).inspect(f.id), cancelled); assert.equal(f.server.cancelPosts.length, 1);
});

test("late committed copy wins over requested cancellation without a cancellation POST or fabricated fence", async () => {
  const f = await fixture(); await capture(f); seed(f); f.server.saved = copy(f.receipt);
  assert.deepEqual(await f.make().client.cancel(f.id), f.receipt);
  assert.equal(saved(f).cancelRequested, true); assert.equal(f.fences.length, 0); noPosts(f);
});
