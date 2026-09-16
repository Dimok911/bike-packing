import test from "node:test";
import assert from "node:assert/strict";
import { wholeCopyAcceptanceFixture, copy, hash } from "../fixtures/admin-template-photo-whole-copy-acceptance-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { prepareAdminTemplatePhotoWholeCopyAcceptance } from "../../src/public/admin-template-photo-whole-copy-acceptance.js";

const mutateJournal = (f, fn) => { const row = JSON.parse(f.values.get(f.journalKey)); fn(row); f.values.set(f.journalKey, canonical(row)); };
const accept = async f => { const handle = await f.prepare(); f.installMirror(); handle.persist(); handle.assertCurrent(); return handle; };
const noNetwork = f => assert.deepEqual(f.server.calls, []);

test("whole acceptance persists only after exact confirmed target mirror and retains full original records", async () => {
  const f = await wholeCopyAcceptanceFixture(), before = copy(f.state), records = copy([...f.idb.rows()]);
  const handle = await f.prepare();
  assert.throws(handle.persist, /принятия/); assert.equal(await f.read(), null);
  const next = await accept(f), accepted = await f.read();
  assert.deepEqual(accepted.acceptance, next.acceptance); assert.deepEqual(accepted.plan, f.plan);
  assert.deepEqual(accepted.record, f.record); assert.deepEqual(accepted.targetSnapshot, f.targetSnapshot);
  assert.deepEqual(f.writes.map(([key]) => key), [f.acceptanceKey]);
  assert.deepEqual(f.state, before); assert.deepEqual([...f.idb.rows()], records); noNetwork(f);
});

test("accepted historical whole copy survives later source and target edits without reading them as its original input", async () => {
  const f = await wholeCopyAcceptanceFixture(); await accept(f); const acceptedText = f.values.get(f.acceptanceKey);
  const mirror = f.mirror(), sourceId = f.record.snapshot.source.layoutId;
  mirror.layouts[sourceId].note = "later source"; mirror.layouts[sourceId].adminCausalSource.base.stateRevision++;
  mirror.layouts[f.targetId].name = "later target"; mirror.layouts[f.targetId].adminCausalSource.base.stateRevision++;
  f.values.set(f.key, JSON.stringify(mirror)); const raw = f.values.get(f.key);
  const accepted = await f.read(); accepted.assertCurrent();
  assert.equal(accepted.receipt.result.payload.stateRevision, 1); assert.equal(f.values.get(f.acceptanceKey), acceptedText);
  assert.equal(f.values.get(f.key), raw); assert.equal(await f.candidate(), null); noNetwork(f);
});

test("mirror-only interruption candidate completes acceptance even after the source legitimately changes", async () => {
  const f = await wholeCopyAcceptanceFixture(); f.installMirror();
  const mirror = f.mirror(); mirror.layouts[f.record.snapshot.source.layoutId].note = "later source"; f.values.set(f.key, JSON.stringify(mirror));
  assert.equal(await f.read(), null); const candidate = await f.candidate(); candidate.assertCurrent();
  assert.deepEqual(candidate.targetSnapshot, f.targetSnapshot);
  const before = f.values.get(f.key), handle = await f.prepare(); handle.persist(); handle.assertCurrent();
  assert.equal(f.values.get(f.key), before); assert.equal((await f.read()).acceptance.operationId, f.id); noNetwork(f);
});

test("acceptance quota and lost readback preserve mirror and immutable facts for retry", async () => {
  for (const fault of ["quota", "readback"]) {
    const f = await wholeCopyAcceptanceFixture(); f.installMirror(); const mirror = f.values.get(f.key);
    const handle = await f.prepare();
    f.hooks.set = (key, value) => {
      if (fault === "quota") throw Error("acceptance quota");
      f.values.set(key, value); f.hooks.get = name => { if (name === key) throw Error("readback lost"); };
    };
    assert.throws(handle.persist); assert.equal(f.values.get(f.key), mirror);
    f.hooks.get = null; f.hooks.set = null;
    assert.equal(Boolean(await f.read()), fault === "readback");
    const retry = await f.prepare(); retry.persist(); assert.equal((await f.read()).acceptance.operationId, f.id);
    assert.deepEqual(await f.store.read(f.id), f.record); noNetwork(f);
  }
});

test("journal availability and stop observations preserve receipt-bound acceptance but invalidate stale guards", async () => {
  const f = await wholeCopyAcceptanceFixture(); await accept(f); const before = await f.read(), raw = f.values.get(f.acceptanceKey);
  mutateJournal(f, row => { row.stageReceipts[0].assetState = "unavailable"; row.cancelRequested = true; row.dispatched = false; });
  assert.throws(before.assertCurrent);
  const now = await f.read(); now.assertCurrent(); assert.equal(now.stageReceipts[0].assetState, "unavailable");
  assert.equal(f.values.get(f.acceptanceKey), raw);
  mutateJournal(f, row => { row.stageReceipts[0].assetState = "invented"; }); await assert.rejects(f.read()); noNetwork(f);
});

test("rehashing a modified plan, missing typed record, forged stage or acceptance never grants accepted authority", async () => {
  for (const fault of ["plan", "record", "stage", "kind", "targetDigest", "receipt"]) {
    const f = await wholeCopyAcceptanceFixture(); await accept(f);
    if (fault === "plan") {
      const row = JSON.parse(f.values.get(f.planKey)); row.plan.sourceEditorSnapshot.metadata.title = "forged"; row.digest = hash(row.plan);
      f.values.set(f.planKey, canonical(row));
    }
    if (fault === "record") f.idb.rows().clear();
    if (fault === "stage") mutateJournal(f, row => { row.stageReceipts[0].receipt.assetDigest = "0".repeat(64); });
    if (fault === "kind") mutateJournal(f, row => { row.kind = "admin-template-photo-tree-copy"; });
    if (fault === "receipt") mutateJournal(f, row => { row.receipt.operation.state = "rejected"; });
    if (fault === "targetDigest") {
      const row = JSON.parse(f.values.get(f.acceptanceKey)); row.targetSnapshotDigest = "0".repeat(64); f.values.set(f.acceptanceKey, canonical(row));
    }
    const raw = f.values.get(f.acceptanceKey); await assert.rejects(f.read()); assert.equal(f.values.get(f.acceptanceKey), raw); noNetwork(f);
  }
});

test("prepared acceptance refuses forged caller target, changed mirror, expired or asynchronous guards", async () => {
  const f = await wholeCopyAcceptanceFixture(); f.installMirror();
  const forged = copy(f.targetSnapshot); forged.beforeState.layouts[f.targetId].note += " forged";
  await assert.rejects(prepareAdminTemplatePhotoWholeCopyAcceptance({ ...f.input, targetSnapshot: forged }, () => {}));
  let active = true;
  const handle = await f.prepare(() => { if (!active) throw Error("expired"); }); active = false;
  assert.throws(handle.persist, /expired/);
  const next = await f.prepare(), mirror = f.mirror(); mirror.layouts[f.targetId].name = "later edit"; f.values.set(f.key, JSON.stringify(mirror));
  assert.throws(next.persist); assert.equal(await f.candidate(), null);
  await assert.rejects(f.prepare(async () => { throw Error("async guard"); }));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(await f.read(), null); assert.deepEqual(f.writes, []); noNetwork(f);
});
