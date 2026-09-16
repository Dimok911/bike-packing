import test from "node:test";
import assert from "node:assert/strict";
import { treeCopyAcceptanceFixture, copy, hash } from "../fixtures/admin-template-photo-tree-copy-acceptance-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { prepareAdminTemplatePhotoTreeCopyAcceptance, readAdminTemplatePhotoTreeCopyAcceptance } from "../../src/public/admin-template-photo-tree-copy-acceptance.js";

const journal = f => JSON.parse(f.values.get(f.journalKey));
const mutateJournal = (f, fn) => { const value = journal(f); fn(value); f.values.set(f.journalKey, canonical(value)); };
const mirrorWrites = f => f.writes.filter(([key]) => key === f.key);
const acceptanceWrites = f => f.writes.filter(([key]) => key === f.acceptanceKey);
const noNetwork = f => assert.deepEqual(f.server.calls, []);

test("confirmed mirror precedes acceptance; live merge follows both and retains all original records/claims", async () => {
  const f = await treeCopyAcceptanceFixture(); f.pending(); const before = copy(f.state), recordRows = copy([...f.idb.rows()]);
  const claims = copy([...f.idb.rows("stage-dispatches")]);
  f.hooks.set = (key, value) => {
    assert.deepEqual(f.state, before, "no optimistic live merge before either write");
    if (key === f.acceptanceKey) assert.equal(f.mirror().layouts[f.record.snapshot.target.layoutId].adminCausalSource.base.stateRevision, 12);
    f.values.set(key, value);
  };
  const result = await f.run(), accepted = await f.read();
  assert.deepEqual(f.writes.map(([key]) => key), [f.key, f.acceptanceKey]);
  assert.deepEqual(accepted.acceptance, result.acceptance); assert.deepEqual(accepted.targetSnapshot, result.targetSnapshot);
  assert.deepEqual(accepted.record, f.record); assert.deepEqual(accepted.plan, f.plan); assert.deepEqual(accepted.receipt, f.receipt);
  assert.deepEqual([...f.idb.rows()], recordRows); assert.deepEqual([...f.idb.rows("stage-dispatches")], claims); noNetwork(f);
});

test("acceptance survives ordinary mirror/state replacement and a later confirmed base without normalizing current edits", async () => {
  const f = await treeCopyAcceptanceFixture(); await f.run(); const raw = f.values.get(f.acceptanceKey), id = f.record.snapshot.target.layoutId;
  const next = f.mirror(); next.layouts[id].name = "ordinary later name";
  next.layouts[id].adminCausalSource.base.stateRevision = 13; next.layouts[id].adminCausalSource.canonicalPayload = { later: true };
  next.items["private-item"].quantity = 23; f.values.set(f.key, JSON.stringify(next)); f.state = copy(next);
  const before = copy(f.state), accepted = await f.read(); accepted.assertCurrent();
  assert.equal(accepted.receipt.result.payload.stateRevision, 12); assert.equal(f.values.get(f.acceptanceKey), raw);
  assert.deepEqual(f.state, before); assert.equal(await f.candidate(), null); noNetwork(f);
});

test("late committed stop is accepted, and optional cancel marker changes do not rewrite historical acceptance", async () => {
  const f = await treeCopyAcceptanceFixture(); await f.run(); const raw = f.values.get(f.acceptanceKey), previous = await f.read();
  mutateJournal(f, value => { value.cancelRequested = true; value.dispatched = false; });
  assert.throws(previous.assertCurrent); const current = await f.read(); current.assertCurrent();
  assert.equal(current.journal.cancelRequested, true); assert.equal(current.receipt.operation.state, "committed");
  assert.equal(f.values.get(f.acceptanceKey), raw);
  const stopped = await treeCopyAcceptanceFixture(); mutateJournal(stopped, value => { value.cancelRequested = true; });
  assert.equal((await stopped.run()).acceptance.operationId, stopped.id); noNetwork(stopped);
});

test("actual typed stage GET can update availability without invalidating immutable acceptance", async () => {
  const f = await treeCopyAcceptanceFixture(); await f.run(); const raw = f.values.get(f.acceptanceKey), before = await f.read();
  const stage = copy(f.stages[0]); stage.assetState = "unavailable";
  f.server.stages.set(f.record.stages[0].operationId, stage);
  await f.make().client.inspectStage(f.id, f.record.stages[0].operationId);
  assert.throws(before.assertCurrent, "old raw journal guard still notices the observation update");
  const accepted = await f.read(); accepted.assertCurrent();
  assert.equal(accepted.stageReceipts[0].assetState, "unavailable"); assert.equal(f.values.get(f.acceptanceKey), raw);
  assert.deepEqual(accepted.stageReceipts[0].receipt, f.stages[0].receipt);
  assert.equal(f.server.calls.some(call => call.method === "POST"), false);
  mutateJournal(f, value => { value.stageReceipts[0].assetState = "client-says-safe"; });
  await assert.rejects(f.read());
});

test("mirror quota yields neither acceptance nor live changes; retry retains exact IDs", async () => {
  const f = await treeCopyAcceptanceFixture(); f.pending(); const before = copy(f.state), raw = f.values.get(f.key);
  f.hooks.set = () => { throw Object.assign(Error("full"), { name: "QuotaExceededError" }); };
  await assert.rejects(f.run(), { name: "QuotaExceededError" });
  assert.equal(await f.read(), null); assert.deepEqual(f.state, before); assert.equal(f.values.get(f.key), raw);
  f.hooks.set = null; assert.equal((await f.run()).operationId, f.id); assert.equal(acceptanceWrites(f).length, 1); noNetwork(f);
});

test("acceptance quota leaves confirmed mirror and pending live; exact cold candidate completes the same operation", async () => {
  const f = await treeCopyAcceptanceFixture(); f.pending(); const before = copy(f.state);
  f.hooks.set = (key, value) => { if (key === f.acceptanceKey) throw Error("acceptance quota"); f.values.set(key, value); };
  await assert.rejects(f.run(), /acceptance quota/); assert.deepEqual(f.state, before); assert.equal(await f.read(), null);
  assert.equal(mirrorWrites(f).length, 1);
  const candidate = await f.candidate(); candidate.assertCurrent();
  assert.equal(candidate.plan.id, f.id); assert.deepEqual(candidate.record, f.record);
  f.state = copy(f.mirror()); f.hooks.set = null;
  const result = await f.run(); assert.equal(result.state, "already-applied"); assert.equal(mirrorWrites(f).length, 1);
  assert.equal((await f.read()).acceptance.operationId, f.id); noNetwork(f);
});

test("acceptance lost readback returns no live success; preserved row is fully re-proved on cold retry", async () => {
  const f = await treeCopyAcceptanceFixture(); f.pending(); const before = copy(f.state);
  f.hooks.set = (key, value) => {
    f.values.set(key, value);
    if (key === f.acceptanceKey) f.hooks.get = name => { if (name === key) throw Error("acceptance readback lost"); };
  };
  await assert.rejects(f.run(), /readback lost/); assert.deepEqual(f.state, before); assert.ok(f.values.has(f.acceptanceKey));
  f.hooks.get = null; f.hooks.set = null; assert.equal((await f.read()).acceptance.operationId, f.id);
  await f.run(); assert.equal(mirrorWrites(f).length, 1); assert.equal(acceptanceWrites(f).length, 1); noNetwork(f);
});

test("cold exact-confirmed candidate can finish acceptance after a later source edit without merging either live namespace", async () => {
  const f = await treeCopyAcceptanceFixture();
  f.hooks.set = (key, value) => { if (key === f.acceptanceKey) throw Error("acceptance quota"); f.values.set(key, value); };
  await assert.rejects(f.run(), /acceptance quota/);
  f.state = copy(f.mirror()); f.state.layouts[f.record.snapshot.source.layoutId].note = "legitimate later source edit";
  f.values.set(f.key, JSON.stringify(f.state)); f.hooks.set = null;
  const before = copy(f.state), candidate = await f.candidate(); candidate.assertCurrent();
  const prepared = await prepareAdminTemplatePhotoTreeCopyAcceptance({ plan: candidate.plan, store: f.store,
    receipt: candidate.receipt, stageReceipts: candidate.stageReceipts, targetSnapshot: candidate.targetSnapshot,
    getContext: f.input.getContext, getMirrorContext: f.input.getMirrorContext }, () => {});
  prepared.persist(); prepared.assertCurrent();
  assert.deepEqual(f.state, before); assert.deepEqual(f.mirror(), before); assert.equal(mirrorWrites(f).length, 1);
  assert.equal((await f.read()).acceptance.operationId, f.id); noNetwork(f);
});

test("rejection, cancellation and parent fence never become accepted committed facts", async () => {
  for (const fault of ["rejected", "cancelled", "fenced"]) {
    const f = await treeCopyAcceptanceFixture(); await f.run();
    mutateJournal(f, row => {
      if (fault === "fenced") { row.receipt = null; row.parentFenced = true; return; }
      row.receipt = { operation: { ...row.receipt.operation, state: "rejected" }, result: { status: 409,
        payload: fault === "rejected" ? { ok: false, code: "base_conflict" } : { ok: false, code: "operation_cancelled",
          cancellation: { version: 1, operationId: f.id, noBusinessEffects: true, operationCannotApply: true } } } };
    });
    await assert.rejects(f.read()); noNetwork(f);
  }
});

test("full cold proof refuses rehashed plan changes, missing records, absent stage and cross-kind journals", async () => {
  for (const fault of ["plan", "record", "stage", "kind"]) {
    const f = await treeCopyAcceptanceFixture(); await f.run();
    if (fault === "plan") {
      const row = JSON.parse(f.values.get(f.planKey)); row.plan.editorSnapshot.metadata.title = "tamper"; row.digest = hash(row.plan);
      f.values.set(f.planKey, canonical(row));
    }
    if (fault === "record") f.idb.rows().clear();
    if (fault === "stage") mutateJournal(f, row => { row.stageReceipts[0] = null; });
    if (fault === "kind") mutateJournal(f, row => { row.kind = "admin-template-photo-copy"; });
    await assert.rejects(f.read()); noNetwork(f);
  }
});

test("forged acceptance digests, binding or mirror location fail closed without overwriting the row", async () => {
  for (const fault of ["targetSnapshotDigest", "terminalJournalDigest", "binding", "mirrorKey"]) {
    const f = await treeCopyAcceptanceFixture(); await f.run();
    const row = JSON.parse(f.values.get(f.acceptanceKey));
    if (fault === "binding") row.binding.actorId = "other";
    else row[fault] = fault === "mirrorKey" ? "another-key" : "0".repeat(64);
    const raw = canonical(row); f.values.set(f.acceptanceKey, raw);
    await assert.rejects(f.read()); await assert.rejects(f.run()); assert.equal(f.values.get(f.acceptanceKey), raw); noNetwork(f);
  }
});

test("reader and cold-candidate guards expire with the caller scope and immutable raw pointers", async () => {
  const f = await treeCopyAcceptanceFixture(); await f.run(); let active = true;
  const guard = () => { if (!active) throw Error("expired"); };
  const accepted = await f.read(guard), candidate = await f.candidate(guard); active = false;
  assert.throws(accepted.assertCurrent, /expired/); assert.throws(candidate.assertCurrent, /expired/);
  const next = await f.read(); f.values.delete(f.planKey); assert.throws(next.assertCurrent);
});

test("actor or raw journal changes between proof and acceptance prevent live apply and acknowledged acceptance", async () => {
  for (const fault of ["actor", "journal"]) {
    const f = await treeCopyAcceptanceFixture(); f.pending(); const before = copy(f.state);
    f.hooks.set = (key, value) => {
      f.values.set(key, value);
      if (key !== f.key) return;
      if (fault === "actor") f.current.actorId = "other"; else f.values.delete(f.journalKey);
    };
    await assert.rejects(f.run()); assert.deepEqual(f.state, before); assert.equal(acceptanceWrites(f).length, 0); noNetwork(f);
  }
});

test("prepared writer refuses unconfirmed mirror, expired scope and forged caller projection", async () => {
  const f = await treeCopyAcceptanceFixture(); await f.run(); const accepted = await f.read(); f.values.delete(f.acceptanceKey);
  const request = { plan: f.plan, store: f.store, receipt: f.receipt, stageReceipts: f.stages,
    targetSnapshot: accepted.targetSnapshot, getContext: () => f.current, getMirrorContext: () => f.mirrorContext };
  let active = true;
  const handle = await prepareAdminTemplatePhotoTreeCopyAcceptance(request, () => { if (!active) throw Error("expired"); });
  active = false; assert.throws(handle.persist, /expired/); assert.equal(await f.read(), null);
  const forged = copy(accepted.targetSnapshot); forged.beforeState.layouts[forged.layoutId].name = "tamper";
  await assert.rejects(prepareAdminTemplatePhotoTreeCopyAcceptance({ ...request, targetSnapshot: forged }, () => {}));
  const next = await prepareAdminTemplatePhotoTreeCopyAcceptance(request, () => {});
  f.values.set(f.key, JSON.stringify({ ...f.mirror(), layouts: { ...f.mirror().layouts,
    [f.record.snapshot.target.layoutId]: copy(f.record.snapshot.target.beforeState.layouts[f.record.snapshot.target.layoutId]) } }));
  assert.throws(next.persist); assert.equal(await f.read(), null); noNetwork(f);
});

test("subsequent mirror-only edits do not become cold recovery candidates, including identical revision with changed fields", async () => {
  const f = await treeCopyAcceptanceFixture(); await f.run(); f.values.delete(f.acceptanceKey);
  const value = f.mirror(); value.layouts[f.record.snapshot.target.layoutId].note = "another tab changed";
  f.values.set(f.key, JSON.stringify(value)); assert.equal(await f.candidate(), null); assert.equal(await f.read(), null);
  await assert.rejects(f.run()); noNetwork(f);
});

test("async getters and guards are rejected synchronously without unhandled promises or writes", async () => {
  const f = await treeCopyAcceptanceFixture(), errors = [], listener = error => errors.push(error); process.on("unhandledRejection", listener);
  try {
    await assert.rejects(f.read(async () => { throw Error("async guard"); }));
    await assert.rejects(readAdminTemplatePhotoTreeCopyAcceptance({ ...f.readInput, getContext: async () => { throw Error("async context"); } }, () => {}));
    await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(errors, []); assert.deepEqual(f.writes, []);
  } finally { process.off("unhandledRejection", listener); }
});
