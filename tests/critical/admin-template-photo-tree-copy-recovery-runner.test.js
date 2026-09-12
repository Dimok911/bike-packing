import test from "node:test";
import assert from "node:assert/strict";
import { treeRecoveryRunnerFixture, copy, hash } from "../fixtures/admin-template-photo-tree-copy-recovery-runner-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";

const noPost = f => assert.equal(f.server.calls.some(call => call.method === "POST"), false);
const setJournal = (f, mutate) => { const row = f.journal(); mutate(row); f.values.set(f.commandKey, canonical(row)); };

test("V9 recovery read proves the original local facts under both common locks without network or writes", async () => {
  const f = await treeRecoveryRunnerFixture(), before = new Map(f.values), rows = copy([...f.idb.rows()]);
  const result = await f.make().read(f.id);
  assert.deepEqual(result, { plan: f.plan, record: f.record, journal: f.journal(), receipt: null, stageReceipts: f.record.stages.map(() => null) });
  assert.deepEqual(f.server.calls, []); assert.deepEqual(f.values, before); assert.deepEqual([...f.idb.rows()], rows);
  assert.equal(f.held.size, 0);
  const enters = f.lockEvents.filter(([event]) => event === "enter").map(([, name]) => name);
  assert.equal(enters.length, 2); assert.deepEqual(enters, [...enters].sort());
  result.record.snapshot.target.metadata.name = "detached"; assert.deepEqual(await f.store.read(f.id), f.record);
  assert.throws(() => f.recovery.scopedContext(), /сверки/);
});

test("OFF inspect reconciles unknown with GET only and keeps a partial immutable stage and all IDs", async () => {
  const f = await treeRecoveryRunnerFixture();
  setJournal(f, row => { row.stageReceipts[0] = copy(f.stages[0]); });
  const before = new Map(f.values), result = await f.make().inspect(f.id);
  assert.equal(result.receipt, null); assert.deepEqual(result.stageReceipts[0], f.stages[0]);
  assert.equal(result.stageReceipts.slice(1).every(stage => stage === null), true);
  assert.deepEqual(result.plan, f.plan); assert.deepEqual(result.record, f.record); noPost(f); assert.deepEqual(f.values, before);
  const enters = f.lockEvents.filter(([event]) => event === "enter").map(([, name]) => name);
  assert.equal(enters.length, 3); assert.equal(enters[2], f.commandKey); assert.equal(f.held.size, 0);
});

test("explicit OFF cancellation fences an unknown stage without confirming or deleting its claim", async () => {
  const f = await treeRecoveryRunnerFixture(); f.controls.unknownStage = true;
  await assert.rejects(f.businessMake().client.run(f.id));
  const claims = copy([...f.idb.rows("stage-dispatches")]), stagesBefore = copy(f.journal().stageReceipts);
  assert.equal(claims.length, 1);
  const result = await f.make().cancel(f.id);
  assert.equal(result.receipt.result.payload.code, "operation_cancelled"); assert.equal(result.journal.cancelRequested, true);
  assert.deepEqual(result.stageReceipts, stagesBefore); assert.equal(f.cancelPosts.length, 1);
  assert.equal(f.server.stagePosts.length, 1); assert.equal(f.server.savePosts.length, 0);
  assert.deepEqual([...f.idb.rows("stage-dispatches")], claims); assert.deepEqual(await f.store.read(f.id), f.record);
  const transport = f.businessMake().transport; await transport.prepare();
  const stage = transport.writes.find(row => row.id === f.record.stages[0].operationId);
  assert.equal(stage.confirmed, undefined); assert.equal(stage.parentFenced, true); assert.equal(stage.blocksWrites, false);
  assert.throws(() => f.recovery.scopedGuard(), /сверки/); assert.equal(f.held.size, 0);
});

test("lost cancellation ACK returns the durable server fact, while a cold local read sends nothing", async () => {
  const f = await treeRecoveryRunnerFixture(); f.recovery.loseCancel = true;
  const result = await f.make().cancel(f.id); assert.equal(result.receipt.result.payload.code, "operation_cancelled");
  const calls = f.server.calls.length, before = new Map(f.values);
  assert.deepEqual(await f.make().read(f.id), result); assert.equal(f.server.calls.length, calls); assert.deepEqual(f.values, before);
  assert.equal(f.cancelPosts.length, 1); assert.equal(f.server.stagePosts.length + f.server.savePosts.length, 0);
});

test("unknown cancellation retains its marker; cold inspect never repeats POST, explicit cancel may retry only cancellation", async () => {
  const f = await treeRecoveryRunnerFixture(); f.recovery.unknownCancel = true;
  await assert.rejects(f.make().cancel(f.id)); assert.equal(f.journal().cancelRequested, true);
  assert.equal((await f.make().inspect(f.id)).receipt, null); assert.equal(f.cancelPosts.length, 1);
  f.recovery.unknownCancel = false;
  const result = await f.make().cancel(f.id); assert.equal(result.receipt.result.payload.code, "operation_cancelled");
  assert.equal(f.cancelPosts.length, 2); assert.equal(f.server.stagePosts.length + f.server.savePosts.length, 0);
});

test("offline Stop persists cancelRequested before auth GET failure; cold reconciliation stays read-only", async () => {
  const f = await treeRecoveryRunnerFixture(); f.recovery.offline = true;
  await assert.rejects(f.make().cancel(f.id)); assert.equal(f.journal().cancelRequested, true); noPost(f);
  const local = await f.make().read(f.id); assert.equal(local.journal.cancelRequested, true); assert.equal(local.receipt, null);
  f.recovery.offline = false; assert.equal((await f.make().inspect(f.id)).receipt, null); noPost(f);
  assert.equal(f.values.get(f.planKey), f.planText); assert.deepEqual(await f.store.read(f.id), f.record);
});

test("late commit wins cancellation and requires every full typed stage proof without business POST or local projection", async () => {
  const f = await treeRecoveryRunnerFixture(); f.recovery.lateCommit = true;
  f.stages.forEach((stage, index) => f.server.stages.set(f.record.stages[index].operationId, copy(stage)));
  const result = await f.make().cancel(f.id);
  assert.deepEqual(result.receipt, f.receipt); assert.deepEqual(result.stageReceipts, f.stages);
  assert.equal(result.journal.cancelRequested, true); assert.deepEqual(result.record.snapshot, f.record.snapshot);
  assert.equal(f.cancelPosts.length, 1); assert.equal(f.server.stagePosts.length + f.server.savePosts.length, 0);
  assert.deepEqual(await f.make().read(f.id), result);
});

test("wrong or unavailable late-commit stage pauses instead of yielding a receipt-shaped authority", async () => {
  const f = await treeRecoveryRunnerFixture(); f.recovery.lateCommit = true;
  f.stages.forEach((stage, index) => f.server.stages.set(f.record.stages[index].operationId, copy(stage)));
  const bad = f.server.stages.get(f.record.stages[0].operationId); bad.receipt.kind = "admin-template-photo-copy";
  await assert.rejects(f.make().cancel(f.id)); assert.equal(f.journal().receipt, null); assert.equal(f.journal().cancelRequested, true);
  assert.equal(f.server.stagePosts.length + f.server.savePosts.length, 0);
});

test("actor or raw-plan change after beginWrite prevents cancellation POST and preserves the original record", async () => {
  for (const change of [f => { f.current.actorId = "other"; }, f => { f.values.delete(f.planKey); }]) {
    const f = await treeRecoveryRunnerFixture(); f.controls.afterBegin = () => change(f);
    await assert.rejects(f.make().cancel(f.id)); noPost(f); assert.equal(f.journal().cancelRequested, true); assert.equal(f.held.size, 0);
  }
});

test("raw plan loss during local client read is detected before any network request", async () => {
  const f = await treeRecoveryRunnerFixture(); f.recovery.afterClientRead = () => f.values.delete(f.planKey);
  await assert.rejects(f.make().inspect(f.id)); assert.deepEqual(f.server.calls, []); assert.equal(f.held.size, 0);
});

test("generic plan cancel marker, rehashed dirty snapshot and wrong layout cannot enter recovery", async () => {
  for (const mutate of [row => { row.cancelRequested = true; }, row => {
    row.plan.editorSnapshot.metadata.name = "forged"; row.digest = hash(row.plan);
  }]) {
    const f = await treeRecoveryRunnerFixture(), row = JSON.parse(f.planText); mutate(row); f.values.set(f.planKey, canonical(row));
    await assert.rejects(f.make().cancel(f.id)); assert.deepEqual(f.server.calls, []);
  }
  const f = await treeRecoveryRunnerFixture(); await assert.rejects(f.make({ layoutId: f.record.snapshot.source.layoutId }).inspect(f.id)); noPost(f);
});

test("cross-kind or malformed typed journals and factory receipts cannot bypass actual cold proof", async () => {
  for (const mutate of [row => { row.kind = "admin-template-photo-copy"; }, row => { row.cancelRequested = "true"; },
    row => { row.recordIntentHash = "0".repeat(64); }]) {
    const f = await treeRecoveryRunnerFixture(); setJournal(f, mutate); await assert.rejects(f.make().read(f.id)); assert.deepEqual(f.server.calls, []);
  }
  const f = await treeRecoveryRunnerFixture(); f.recovery.mutateResult = value => { value.result.payload.code = "unrelated"; return value; };
  await assert.rejects(f.make().cancel(f.id)); assert.equal(f.journal().receipt.result.payload.code, "operation_cancelled");
});

test("expired cancellation scope and scoped context cannot be reused after completion or failure", async () => {
  const f = await treeRecoveryRunnerFixture(); await f.make().cancel(f.id);
  assert.throws(() => f.recovery.scopedGuard(), /сверки/); assert.throws(() => f.recovery.scopedContext(), /сверки/);
  const failed = await treeRecoveryRunnerFixture(); failed.recovery.unknownCancel = true; await assert.rejects(failed.make().cancel(failed.id));
  assert.throws(() => failed.recovery.scopedGuard(), /сверки/); assert.equal(failed.held.size, 0);
});

test("async context/factory/requested guards fail closed without an unhandled rejection or POST", async () => {
  const unhandled = [], listener = error => unhandled.push(error); process.on("unhandledRejection", listener);
  try {
    const f = await treeRecoveryRunnerFixture();
    await assert.rejects(f.make({ getContext: () => Promise.reject(Error("async context")) }).read(f.id));
    await assert.rejects(f.make({ createClient: () => Promise.reject(Error("async factory")) }).read(f.id));
    let attempt;
    await f.make({ createClient: options => {
      attempt = () => options.withCancellationAdmission({ intent: f.intent, recordIntentHash: f.record.intentHash,
        assertCurrent: () => Promise.reject(Error("async requested guard")) }, () => assert.fail("No authority"));
      return { binding: f.binding, async read() { await assert.rejects(attempt()); return f.journal(); } };
    } }).read(f.id);
    await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(unhandled, []); noPost(f);
    await assert.rejects(attempt());
  } finally { process.off("unhandledRejection", listener); }
});
