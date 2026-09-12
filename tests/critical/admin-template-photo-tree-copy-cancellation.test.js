import test from "node:test";
import assert from "node:assert/strict";
import { treeCancellationFixture as fixture, copy, commandKey, saved, cancellationFact, commandPrefix } from "../fixtures/admin-template-photo-tree-copy-cancellation-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { AMBIGUOUS_WRITE_KEY } from "../../src/sync/experiment-transport.js";

const noBusinessPosts = f => { assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0); };
const noPosts = f => { noBusinessPosts(f); assert.equal(f.cancelPosts.length, 0); };
const capture = async f => { await f.make().client.capture(f.record.action); return copy(saved(f)); };
const serveStages = f => f.stages.forEach((stage, index) => f.server.stages.set(f.record.stages[index].operationId, copy(stage)));

test("explicit cancellation with every photo gate OFF uses the original full envelope and distinct common admission", async () => {
  const f = await fixture(), original = await capture(f); f.controls.capabilities = ["adminTemplateCausalOperationsV1"];
  // A changed current source/base belongs to normal dispatch, not a fence on
  // the immutable action. The cancellation adapter deliberately has no such gate.
  let businessCalls = 0;
  const result = await f.cancel({ withDispatchAdmission: () => { businessCalls++; throw Error("Business source changed"); } });
  assert.deepEqual(result, cancellationFact(f)); assert.equal(businessCalls, 0);
  assert.deepEqual(saved(f), { ...original, cancelRequested: true, receipt: result });
  assert.equal(f.cancelPosts.length, 1); noBusinessPosts(f); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  assert.equal(f.cancellation.admissionCalls, 1); assert.ok(f.cancellation.admissionChecks > 5);
  assert.equal(f.server.calls.find(row => row.path.endsWith(`/template-operations/${f.id}`)).method, "GET");
  assert.deepEqual(await f.off().client.run(f.id), result); assert.deepEqual(await f.cancel(), result);
  assert.equal(f.cancelPosts.length, 1); assert.equal(f.values.get(f.planKey), f.planText);
});

test("legacy eight-key bytes remain exact on read/list/recapture and optional markers accept only booleans", async () => {
  const f = await fixture(), original = await capture(f), key = commandKey(f), raw = f.values.get(key);
  assert.equal(Object.keys(original).length, 8);
  const client = f.off().client;
  assert.deepEqual(await client.read(f.id), original); assert.deepEqual(await client.list(), [original]);
  assert.deepEqual(await client.capture(f.record.action), original); assert.equal(f.values.get(key), raw);
  for (const marker of [false, true]) {
    const row = { ...original, cancelRequested: marker }, bytes = canonical(row); f.values.set(key, bytes);
    assert.deepEqual(await client.read(f.id), row); assert.deepEqual(await client.capture(f.record.action), row);
    assert.equal(f.values.get(key), bytes);
  }
  for (const marker of [null, 0, 1, "true", {}, []]) {
    f.values.set(key, canonical({ ...original, cancelRequested: marker })); await assert.rejects(client.read(f.id));
  }
  f.values.set(key, canonical({ ...original, cancelRequested: true, adopted: true })); await assert.rejects(client.read(f.id));
  noPosts(f);
});

test("missing or malformed cancellation admission preserves the stop marker and grants no POST", async () => {
  for (const callback of [null, async () => true, async (proof, task) => task(true),
    async (proof, task) => task({ assertCurrent() {}, extra: true }),
    async (proof, task) => task({ async assertCurrent() {} }),
    async (proof, task) => task({ async assertCurrent() { throw Error("Async guard is forbidden"); } }),
    async (proof, task) => task({ assertCurrent: () => false })]) {
    const f = await fixture(); await capture(f);
    await assert.rejects(f.cancel({ withCancellationAdmission: callback }));
    assert.equal(saved(f).cancelRequested, true); assert.equal(saved(f).receipt, null); noPosts(f);
    const before = f.server.calls.length; await assert.rejects(f.make().client.run(f.id));
    assert.ok(f.server.calls.slice(before).every(row => row.method === "GET")); noPosts(f);
  }
  const f = await fixture(); await capture(f); await assert.rejects(f.off().client.cancel(f.id));
  assert.equal(saved(f).cancelRequested, true); noPosts(f);
});

test("cancel marker quota and failed readback stop before admission without evicting immutable records", async () => {
  for (const readback of [false, true]) {
    const f = await fixture(), original = await capture(f); let pending = null;
    f.controls.rejectWrite = (key, bytes) => !readback && key.startsWith(commandPrefix) && JSON.parse(bytes).cancelRequested;
    const storage = { ...f.storage, getItem(key) { if (pending === key) { pending = null; return null; } return f.storage.getItem(key); },
      setItem(key, bytes) { f.storage.setItem(key, bytes); if (readback && key.startsWith(commandPrefix) && JSON.parse(bytes).cancelRequested) pending = key; } };
    await assert.rejects(f.cancel({ storage })); noPosts(f); assert.equal(f.cancellation.admissionCalls, 0);
    assert.deepEqual(saved(f), readback ? { ...original, cancelRequested: true } : original);
    assert.deepEqual(await f.store.read(f.id), f.record); assert.equal(f.values.get(f.planKey), f.planText);
    f.controls.rejectWrite = null; assert.deepEqual(await f.cancel(), cancellationFact(f)); assert.equal(f.cancelPosts.length, 1);
  }
});

test("lost cancellation ACK is reconciled by cold GET and never automatically replays cancellation or business POST", async () => {
  for (const committed of [true, false]) {
    const f = await fixture(); await capture(f);
    Object.assign(f.cancellation, { loseCancel: true, unknownCancel: !committed }); f.controls.hideSave = true;
    await assert.rejects(f.cancel()); assert.equal(saved(f).cancelRequested, true); assert.equal(saved(f).receipt, null);
    assert.equal(f.cancelPosts.length, 1); const before = f.server.calls.length;
    await assert.rejects(f.make().client.run(f.id)); assert.ok(f.server.calls.slice(before).every(row => row.method === "GET"));
    f.controls.hideSave = false;
    if (committed) {
      assert.deepEqual(await f.off().client.inspect(f.id), cancellationFact(f)); assert.deepEqual(await f.cancel(), cancellationFact(f));
      assert.equal(f.cancelPosts.length, 1);
    } else {
      assert.equal(await f.off().client.inspect(f.id), null);
      Object.assign(f.cancellation, { loseCancel: false, unknownCancel: false });
      assert.deepEqual(await f.cancel(), cancellationFact(f)); assert.equal(f.cancelPosts.length, 2);
      assert.deepEqual(f.cancelPosts[0], f.cancelPosts[1]);
    }
    noBusinessPosts(f); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  }
});

test("a late committed save wins before or during cancellation only after every actual typed stage proof", async () => {
  for (const late of [false, true]) {
    const f = await fixture(); await capture(f); serveStages(f);
    if (late) f.cancellation.lateCommit = true; else f.server.saved = copy(f.receipt);
    assert.deepEqual(await f.cancel(), f.receipt); assert.deepEqual(saved(f).stageReceipts, f.stages);
    assert.deepEqual(saved(f).receipt, f.receipt); assert.equal(saved(f).cancelRequested, late ? true : undefined);
    assert.equal(f.cancelPosts.length, late ? 1 : 0); noBusinessPosts(f);
    assert.equal(f.server.calls.filter(row => row.path.includes("template-photo-assets/tree-copy/")).length, f.stages.length);
  }
});

test("late-commit corruption cannot confirm a parent using individually plausible but aliased stage paths", async () => {
  const f = await fixture(); await capture(f); serveStages(f); f.cancellation.lateCommit = true;
  const stage = f.server.stages.get(f.record.stages[1].operationId);
  stage.receipt.materialization.target.filePathDigest = f.stages[0].receipt.materialization.target.filePathDigest;
  await assert.rejects(f.cancel()); assert.equal(saved(f).receipt, null); assert.equal(saved(f).cancelRequested, true);
  assert.equal(f.cancelPosts.length, 1); assert.notEqual(f.off().transport.writes.find(row => row.id === f.id)?.confirmed, true); noBusinessPosts(f);
});

test("account, lifecycle, own plan and retained record loss after beginWrite prevent cancellation POST", async () => {
  for (const fault of ["actor", "generation", "pagehide", "plan-delete", "plan-replace", "record", "scope"]) {
    const f = await fixture(); await capture(f);
    f.controls.afterBegin = () => {
      if (fault === "actor") f.current.actorId = "other-admin";
      if (fault === "generation") f.current.generation = "different-document";
      if (fault === "pagehide") f.lifecycle.dispatchEvent(new Event("pagehide"));
      if (fault === "plan-delete") f.values.delete(f.planKey);
      if (fault === "plan-replace") f.values.set(f.planKey, f.planText + " ");
      if (fault === "record") f.idb.rows().clear();
      if (fault === "scope") f.cancellation.revoke = true;
    };
    await assert.rejects(f.cancel()); noPosts(f); assert.equal(saved(f).cancelRequested, true);
    assert.equal(f.make().transport.writes.find(row => row.id === f.id)?.uncertain, true);
  }
});

test("account loss after POST retains the cancellation barrier and the original actor recovers by exact GET", async () => {
  const f = await fixture(); await capture(f); f.cancellation.afterCancel = () => { f.current.actorId = "other-admin"; };
  await assert.rejects(f.cancel()); assert.equal(f.cancelPosts.length, 1); assert.equal(saved(f).receipt, null);
  assert.equal(f.make().transport.writes.find(row => row.id === f.id)?.uncertain, true);
  f.current.actorId = f.binding.actorId; f.cancellation.afterCancel = null;
  const before = f.server.calls.length; assert.deepEqual(await f.off().client.run(f.id), cancellationFact(f));
  assert.ok(f.server.calls.slice(before).every(row => row.method === "GET")); assert.equal(f.cancelPosts.length, 1); noBusinessPosts(f);
});

test("late command-journal mutation during asynchronous record reproof cannot clear the stop and authorize POST", async () => {
  const f = await fixture(); await capture(f); let armed = false;
  f.controls.afterBegin = () => { armed = true; };
  const store = { binding: f.store.binding, async read(id) {
    const record = await f.store.read(id);
    if (armed) {
      armed = false; const row = saved(f); row.cancelRequested = false; f.values.set(commandKey(f), canonical(row));
    }
    return record;
  } };
  await assert.rejects(f.cancel({ store })); noPosts(f);
  assert.equal(f.make().transport.writes.find(row => row.id === f.id)?.uncertain, true);
  assert.deepEqual(await f.store.read(f.id), f.record);
});

test("cancellation requires actual actor rights, general admin flag/capability and full retained record", async () => {
  for (const fault of ["actor", "rights", "general-off", "capability", "record"]) {
    const f = await fixture(); await capture(f);
    if (fault === "actor") f.controls.wrongActor = true;
    if (fault === "rights") f.controls.noRights = true;
    if (fault === "capability") f.controls.capabilities = [];
    if (fault === "record") f.idb.rows().clear();
    await assert.rejects(f.cancel(fault === "general-off" ? { adminEnabled: false } : {})); noPosts(f);
  }
});

test("real transport fences only the cancelled parent while its unknown tree stage retains its bytes and claim", async () => {
  const f = await fixture(); await capture(f); f.controls.unknownStage = true;
  await assert.rejects(f.make().client.run(f.id)); assert.equal(f.server.stagePosts.length, 1);
  const stageId = f.record.stages[0].operationId, before = copy(f.make().transport.writes.find(row => row.id === stageId));
  const stageKey = `${AMBIGUOUS_WRITE_KEY}:${stageId}`, raw = f.values.get(stageKey);
  assert.equal(before.uncertain, true); assert.equal(before.confirmed, undefined);
  assert.deepEqual(await f.cancel(), cancellationFact(f));
  assert.equal(f.cancelPosts.length, 1); assert.equal(f.server.savePosts.length, 0); assert.equal(saved(f).cancelRequested, true);
  assert.equal(f.idb.rows("stage-dispatches").size, 1); assert.equal(f.values.get(stageKey), raw);
  const cold = f.off(); await cold.transport.prepare();
  const retained = cold.transport.writes.find(row => row.id === stageId);
  assert.equal(retained.uncertain, true); assert.notEqual(retained.confirmed, true);
  assert.equal(retained.parentFenced, true); assert.equal(retained.blocksWrites, false);
  assert.equal((await cold.client.inspectStage(f.id, stageId)).operation.state, "unknown");
  assert.equal(f.values.get(stageKey), raw); assert.deepEqual(await f.store.read(f.id), f.record);
});

test("tree cancellation permission cannot bypass a foreign actor, path, mode or record-hash stage barrier", async () => {
  for (const fault of ["actor", "path", "mode", "hash"]) {
    const f = await fixture(); await capture(f); f.controls.unknownStage = true;
    await assert.rejects(f.make().client.run(f.id));
    const stageId = f.record.stages[0].operationId, key = `${AMBIGUOUS_WRITE_KEY}:${stageId}`, row = JSON.parse(f.values.get(key));
    if (fault === "actor") row.recovery.actorId = "other-admin";
    if (fault === "path") row.path = "/bike-packing/admin/template-photo-assets/copy";
    if (fault === "mode") row.mode = "eu";
    if (fault === "hash") row.recovery.intentHash = "f".repeat(64);
    const raw = JSON.stringify(row); f.values.set(key, raw);
    await assert.rejects(f.cancel()); assert.equal(f.cancelPosts.length, 0); assert.equal(f.server.savePosts.length, 0);
    assert.equal(saved(f).cancelRequested, true); assert.equal(f.values.get(key), raw); assert.equal(f.idb.rows("stage-dispatches").size, 1);
  }
});

test("missing parent-fence adapter cannot report successful retirement or rewrite the retained stage", async () => {
  const f = await fixture(); await capture(f); const real = f.off();
  await assert.rejects(f.cancel({ transport: { ...real.transport, get writes() { return real.transport.writes; }, fenceTreeCopyParent: undefined } }), /requires|сверки/);
  assert.equal(f.cancelPosts.length, 1); assert.deepEqual(saved(f).receipt, cancellationFact(f)); noBusinessPosts(f);
  assert.equal(f.idb.rows("stage-dispatches").size, 0);
});

test("early-return cancellation scopes expire before asynchronous callbacks can POST", async () => {
  const f = await fixture(); await capture(f); let unfinished;
  await assert.rejects(f.cancel({ withCancellationAdmission(proof, task) {
    unfinished = task({ assertCurrent: proof.assertCurrent }); unfinished.catch(() => {});
  } }));
  await assert.rejects(unfinished); noPosts(f); assert.equal(saved(f).cancelRequested, true);
});
