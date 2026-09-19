import test from "node:test";
import assert from "node:assert/strict";
import { wholeCopyAcceptanceFixture, copy } from "../fixtures/admin-template-photo-whole-copy-acceptance-fixture.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { wholeCopyClientFixture } from "../fixtures/admin-template-photo-whole-copy-client-fixture.js";
import { wholeRecordInput } from "../fixtures/admin-template-photo-whole-copy-record-fixture.js";
import { prepareAdminTemplatePhotoWholeCopyRecord } from "../../src/sync/admin-template-photo-whole-copy-record.js";
import { adminTemplatePhotoWholeCopySourceEditorSnapshot } from "../../src/sync/admin-template-photo-whole-copy-save-plan.js";
import { withAdminTemplateCapture } from "../../src/sync/admin-template-capture-lease.js";

async function fixture(side = "target") {
  const f = await wholeCopyAcceptanceFixture(), acceptance = await f.prepare(); f.installMirror(); acceptance.persist();
  const binding = side === "target" ? f.binding : f.record.snapshot.source.ownerMap.binding;
  const context = { ...binding, scope: "admin-template", admin: true, generation: "successor" };
  const storage = { get length() { return f.values.size; }, key: index => [...f.values.keys()][index],
    getItem: key => f.values.get(key) ?? null, setItem: (key, value) => f.values.set(key, value) };
  const calls = [], controls = { afterCapture: null, hook: null };
  const client = { async capture(input) { calls.push(["capture", input.operationId]); await controls.afterCapture?.(); },
    async run(id) { calls.push(["run", id]); return { operation: { id, state: "committed" }, result: { payload: { ok: true } } }; } };
  const reader = async ({ binding: requested, operationId, guard }) => {
    assert.deepEqual(requested, f.binding); assert.equal(operationId, f.id);
    const result = await f.read(guard); await controls.hook?.(result); return result;
  };
  const make = (extra = {}) => createAdminTemplateSavePlans({ binding, client, storage, locks: f.locks, getContext: () => context,
    enabled: true, readWholeCopyAcceptance: reader, ...extra });
  const input = () => ({ operationId: crypto.randomUUID(), base: { stateRevision: side === "target" ? 1 : 7 },
    exists: true, visibility: "private", payload: { items: { changed: { id: "changed", name: "After acceptance" } } },
    metadata: { title: "Next save", description: "", language: "ru" }, published: false });
  return Object.assign(f, { make, input, calls, controlsSuccessor: controls, successorContext: context });
}

for (const side of ["source", "target"]) test(`accepted whole copy permits numeric-base ${side} save through real acceptance reader`, async () => {
  const f = await fixture(side), input = f.input(), before = f.values.get(f.planKey), plans = f.make();
  await plans.capture(input);
  assert.equal((await plans.run(input.operationId)).state, "committed");
  assert.deepEqual(f.calls, [["capture", input.operationId], ["run", input.operationId]]);
  assert.equal(f.values.get(f.planKey), before); assert.ok(await f.read());
});

test("default hook, no-op and boolean cannot release even a fully accepted V10", async () => {
  const f = await fixture();
  for (const hook of [null, () => {}, () => true, () => ({ assertCurrent() {} })]) {
    await assert.rejects(f.make({ readWholeCopyAcceptance: hook }).capture(f.input()));
  }
  assert.deepEqual(f.calls, []);
});

test("acceptance never permits a pending operation base, stale source revision or absent-target recreation", async () => {
  for (const side of ["source", "target"]) {
    const f = await fixture(side);
    const pending = f.input(); pending.base = { operationId: f.id };
    await assert.rejects(f.make().capture(pending));
    const create = f.input(); Object.assign(create, { base: null, exists: false, visibility: null });
    await assert.rejects(f.make().capture(create));
    if (side === "source") { const stale = f.input(); stale.base.stateRevision = 6; await assert.rejects(f.make().capture(stale)); }
    assert.deepEqual(f.calls, []);
  }
});

test("typed acceptance mismatch and asynchronous proof guards fail before successor persistence", async () => {
  const f = await fixture();
  for (const mutate of [value => { value.plan.recordIntentHash = "0".repeat(64); },
    value => { value.record.stages[0].target.photoId = crypto.randomUUID(); },
    value => { value.receipt.operation.state = "rejected"; },
    value => { value.acceptance.targetSnapshotDigest = "0".repeat(64); },
    value => { value.targetSnapshot.metadata.title += " forged"; },
    value => { value.assertCurrent = async () => {}; }]) {
    const input = f.input();
    await assert.rejects(f.make({ readWholeCopyAcceptance: async ({ guard }) => {
      const proof = await f.read(guard), { assertCurrent, ...data } = proof;
      const value = { ...copy(data), assertCurrent }; mutate(value); return value;
    } }).capture(input));
    assert.equal([...f.values.keys()].some(key => key.endsWith(input.operationId)), false);
  }
  assert.deepEqual(f.calls, []);
});

test("historical plan/context changes during acceptance await stop capture with raw evidence retained", async () => {
  for (const change of [f => f.values.set(f.planKey, f.values.get(f.planKey) + " "),
    f => { f.successorContext.generation = "changed"; }]) {
    const f = await fixture(), input = f.input(); f.controlsSuccessor.hook = () => change(f);
    await assert.rejects(f.make().capture(input));
    assert.equal([...f.values.keys()].some(key => key.endsWith(input.operationId)), false); assert.deepEqual(f.calls, []);
  }
});

test("acceptance revocation after client capture prevents successor business dispatch", async () => {
  const f = await fixture(), input = f.input(), plans = f.make(); await plans.capture(input);
  f.controlsSuccessor.afterCapture = () => f.values.delete(f.acceptanceKey);
  await assert.rejects(plans.run(input.operationId));
  assert.deepEqual(f.calls, [["capture", input.operationId]]);
  assert.ok(await plans.read(input.operationId));
});

test("generic excluded UUID cannot bypass missing durable acceptance", async () => {
  const f = await fixture(); f.values.delete(f.acceptanceKey);
  await assert.rejects(f.make({ getExcludedPlans: () => [f.id] }).capture(f.input())); assert.deepEqual(f.calls, []);
});

test("accepted target cannot become the absent target of another fully typed V10", async () => {
  const f = await fixture(), next = await wholeCopyClientFixture();
  const input = await wholeRecordInput({ protocolInput: { ...next.input, ...f.binding } });
  const record = await prepareAdminTemplatePhotoWholeCopyRecord(input);
  // Supply both independently valid immutable records to isolate the registry's
  // target-reuse barrier from the action store's own stronger creation barrier.
  const store = { binding: f.binding, read: async id => copy(id === f.id ? f.record : record) };
  const plans = f.make({ photoWholeCopyEnabled: true, photoWholeCopyStore: store, assertWholeCopyAdmission: () => true });
  const bindings = [f.binding, record.snapshot.source.ownerMap.binding];
  await assert.rejects(withAdminTemplateCapture({ bindings, locks: f.locks }, captureLease => plans.capturePhotoWholeCopy({
    operationId: record.action.operationId, body: record.action.body, recordIntentHash: record.intentHash,
    sourceEditorSnapshot: adminTemplatePhotoWholeCopySourceEditorSnapshot(record),
  }, { captureLease })));
  assert.equal([...f.values.keys()].some(key => key.endsWith(record.action.operationId)), false); assert.deepEqual(f.calls, []);
});

test("resuming an existing successor still requires acceptance before any client capture", async () => {
  const f = await fixture(), input = f.input(); await f.make().capture(input);
  await assert.rejects(f.make({ readWholeCopyAcceptance: null }).run(input.operationId)); assert.deepEqual(f.calls, []);
});

for (const mutation of ["add", "remove", "replace-ignored", "corrupt-ignored"]) {
  test(`whole-copy inventory ${mutation} during acceptance blocks successor dispatch`, async () => {
    const f = await fixture(), input = f.input(), plans = f.make();
    const otherKey = f.planKey + ":another";
    if (mutation.endsWith("ignored")) f.values.set(otherKey, JSON.stringify({ plan: { version: 1 } }));
    f.controlsSuccessor.hook = () => {
      if (mutation === "remove") f.values.delete(f.planKey);
      else if (mutation === "corrupt-ignored") f.values.set(otherKey, JSON.stringify({ plan: { version: 10 } }));
      else f.values.set(otherKey, f.values.get(f.planKey));
    };
    await assert.rejects(plans.capture(input));
    assert.equal([...f.values.keys()].some(key => key.endsWith(input.operationId)), false);
    assert.deepEqual(f.calls, []);
  });
}

test("nested acceptance does not multiply capture inventory scans for forty previous commands", async () => {
  const { adminTemplateCommandPlan } = await import("../../src/sync/admin-template-save-plan.js");
  const { canonicalTemplateJson: canonical } = await import("../../src/sync/admin-template-protocol.js");
  const { hash } = await import("../fixtures/admin-template-photo-whole-copy-acceptance-fixture.js");
  const f = await fixture(); let scans = 0;
  const prefix = "bike-packing-admin-save-plans-v1:" + encodeURIComponent(canonical(f.binding)) + ":";
  const input = () => ({ operationId: crypto.randomUUID(), kind: "template.metadata",
    body: { version: 1, base: { stateRevision: 42 }, metadata: { title: "Rename", language: "en" } },
    editorSnapshot: { payload: f.record.action.body.photoCopy.sourcePayload, metadata: f.record.snapshot.target.metadata } });
  for (let i = 0; i < 40; i++) {
    const plan = adminTemplateCommandPlan({ ...input(), binding: f.binding });
    f.values.set(prefix + plan.id, canonical({ version: 1, plan, digest: hash(plan), cancelRequested: false }));
  }
  let keys = [...f.values.keys()];
  const storage = { get length() { return keys.length; }, key(i) { if (i === 0) scans++; return keys[i]; },
    getItem: name => f.values.get(name) ?? null, setItem(name, value) { f.values.set(name, value); keys = [...f.values.keys()]; } };
  const plans = f.make({ storage, assertCaptureAllowed: async ({ guard }) => { await f.read(guard); return true; } });
  await plans.captureCommand(input());
  assert.ok(scans < 1500, "nested inventory cascade: " + scans + " scans");
  assert.ok(scans > 0); assert.deepEqual(f.calls, []);
});

test("mutations during nested acceptance still stop successor before persistence", async () => {
  for (const mutation of ["add", "remove", "replace"]) {
    const f = await fixture(), input = f.input(); let armed = false;
    f.hooks.get = name => {
      if (!armed || name !== f.journalKey) return; armed = false;
      if (mutation === "add") f.values.set(f.planKey + ":another", f.values.get(f.planKey));
      if (mutation === "remove") f.values.delete(f.planKey);
      if (mutation === "replace") f.values.set(f.planKey, f.values.get(f.planKey) + " ");
    };
    const plans = f.make({ assertCaptureAllowed: async ({ guard }) => { armed = true; await f.read(guard); return true; } });
    await assert.rejects(plans.capture(input));
    assert.equal([...f.values.keys()].some(key => key.endsWith(input.operationId)), false); assert.deepEqual(f.calls, []);
  }
});

const ownedAcceptance = f => ({ store: f.store, getContext: f.readInput.getContext, getMirrorContext: f.readInput.getMirrorContext });

test("registry-owned acceptance validates fresh storage and avoids the compatibility adapter's second derivation", async t => {
  const f = await fixture(), original = crypto.subtle.digest; let hashes = 0;
  crypto.subtle.digest = function(...args) { hashes++; return original.apply(this, args); };
  t.after(() => { crypto.subtle.digest = original; });
  await f.make().capture(f.input()); const legacyHashes = hashes; hashes = 0;
  let dependencies = 0;
  const input = f.input(), plans = f.make({ getWholeCopyAcceptanceContext() { dependencies++; return ownedAcceptance(f); },
    readWholeCopyAcceptance: () => assert.fail('prevalidated adapter must not run') });
  await plans.capture(input); const ownedHashes = hashes;
  assert.ok(dependencies >= 2, 'each separate proof obtains fresh storage dependencies');
  assert.ok(ownedHashes < legacyHashes * 0.7, `duplicate validation returned: owned=${ownedHashes}, adapter=${legacyHashes}`);
  assert.equal((await plans.run(input.operationId)).state, 'committed');
  f.idb.rows().clear(); await assert.rejects(plans.capture(f.input()));
});

test("registry-owned acceptance detects forged journal or receipt data even with recomputed acceptance digests", async () => {
  const { canonicalTemplateJson: canonical } = await import('../../src/sync/admin-template-protocol.js');
  const { hash } = await import('../fixtures/admin-template-photo-whole-copy-acceptance-fixture.js');
  for (const fault of ['payloadDigest', 'stage', 'receipt', 'targetDigest', 'record']) {
    const f = await fixture(), journal = JSON.parse(f.values.get(f.journalKey)), accepted = JSON.parse(f.values.get(f.acceptanceKey));
    if (fault === 'payloadDigest') journal.payloadDigest = '0'.repeat(64);
    if (fault === 'stage') journal.stageReceipts[0].receipt.assetDigest = '0'.repeat(64);
    if (fault === 'receipt') journal.receipt.result.payload.photoCopy.confirmedPayloadDigest = '0'.repeat(64);
    if (fault === 'targetDigest') accepted.targetSnapshotDigest = '0'.repeat(64);
    if (fault === 'record') f.idb.rows().clear();
    const terminal = Object.fromEntries(['version','kind','intent','payloadDigest','recordIntentHash','stageReceipts','receipt'].map(key => [key,journal[key]]));
    terminal.stageReceipts = journal.stageReceipts.map(stage => stage.receipt);
    accepted.terminalJournalDigest = hash(terminal);
    f.values.set(f.journalKey, canonical(journal)); f.values.set(f.acceptanceKey, canonical(accepted));
    const input = f.input();
    await assert.rejects(f.make({ getWholeCopyAcceptanceContext: () => ownedAcceptance(f) }).capture(input), undefined, fault);
    assert.equal([...f.values.keys()].some(key => key.endsWith(input.operationId)), false); assert.deepEqual(f.calls, []);
  }
});

test("registry-owned acceptance preserves inventory and context checks while awaiting the complete proof", async () => {
  for (const fault of ['add', 'remove', 'replace', 'context', 'typed-delete']) {
    const f = await fixture(), input = f.input(); let armed = true;
    f.idb.controls.onCommit = ({ mode }) => {
      if (!armed || mode !== 'readonly') return; armed = false;
      if (fault === 'add') f.values.set(f.planKey + ':another', f.values.get(f.planKey));
      if (fault === 'remove') f.values.delete(f.planKey);
      if (fault === 'replace') f.values.set(f.journalKey, f.values.get(f.journalKey) + ' ');
      if (fault === 'context') f.successorContext.generation = 'changed';
      if (fault === 'typed-delete') f.idb.rows().clear();
    };
    await assert.rejects(f.make({ getWholeCopyAcceptanceContext: () => ownedAcceptance(f) }).capture(input), undefined, fault);
    assert.equal([...f.values.keys()].some(key => key.endsWith(input.operationId)), false); assert.deepEqual(f.calls, []);
  }
});

test("dependency adapters cannot supply authority, substitute routing or become asynchronous", async () => {
  const f = await fixture();
  for (const resolver of [true, () => true, () => ({ assertCurrent() {} }),
    async () => ownedAcceptance(f), () => ({ ...ownedAcceptance(f), binding: f.binding }),
    () => ({ ...ownedAcceptance(f), getContext: () => ({ ...f.current, actorId: 'foreign' }) })]) {
    await assert.rejects(f.make({ getWholeCopyAcceptanceContext: resolver }).capture(f.input()));
  }
  assert.deepEqual(f.calls, []);
});

test("registry-owned proof still blocks stale bases, pending dependencies and revoked acceptance after client capture", async () => {
  for (const side of ['source', 'target']) {
    const f = await fixture(side), plans = f.make({ getWholeCopyAcceptanceContext: () => ownedAcceptance(f) });
    const pending = f.input(); pending.base = { operationId: f.id }; await assert.rejects(plans.capture(pending));
    const missing = f.input(); Object.assign(missing, { exists: false, visibility: null, base: null }); await assert.rejects(plans.capture(missing));
    if (side === 'source') { const stale = f.input(); stale.base.stateRevision = 6; await assert.rejects(plans.capture(stale)); }
    const input = f.input(); await plans.capture(input);
    f.controlsSuccessor.afterCapture = () => f.values.delete(f.acceptanceKey);
    await assert.rejects(plans.run(input.operationId));
    assert.deepEqual(f.calls, [['capture', input.operationId]]);
  }
});
