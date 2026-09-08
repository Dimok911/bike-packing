import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPersonalSaveOutbox, PERSONAL_SAVE_OUTBOX_ENABLED } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalSnapshot, decodePersonalSnapshot, personalSnapshotWithUiPreferences } from "../../src/sync/personal-snapshot-codec.js";
import { personalDeletionIntent, personalDeletionReference, preservesUndeletedEntities,
  preparePersonalDeletionBatch, retainedPersonalDeletionIntent } from "../../src/sync/personal-deletion-intent.js";
import { createPersonalSaveRecovery } from "../../src/sync/personal-save-recovery.js";
import { saveRootContainerDialogAction, saveItemDialogAction } from "../../src/ui/item-dialog-save.js";
import { resolveSyncVisualState } from "../../src/ui/sync-visual-state.js";
import { isKnownEmptyPersonalSave } from "../../src/sync/personal-empty-save.js";

const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
function appFunction(name, dependencies) {
  const source = appSource.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))?.[0];
  assert.ok(source, `actual app function ${name} exists`);
  return new Function(...Object.keys(dependencies), `return (${source});`)(...Object.values(dependencies));
}

function fixture() {
  const values = new Map();
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const binding = { actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a", environment: "bike-packing-experiment" };
  const context = { ...binding, scope: "personal", generation: "editor-1" };
  const make = () => createPersonalSaveOutbox({ storage, ...binding });
  const input = value => ({ snapshot: { items: { a: { weight: value } }, localUi: "packing" },
    body: { baseStateRevision: 5, payload: { items: { a: { weight: value } } } } });
  return { values, storage, context, make, input, outbox: make() };
}

test("confirmed base reader exposes the observed initial server version, never a mutable draft or UI preference", () => {
  const f = fixture(), base = { items: {}, containers: {} };
  assert.equal(f.outbox.confirmedBase(), null);
  f.outbox.adoptRemoteBaseline({ snapshot: { ...base, ui: "local" }, payload: base, stateRevision: 5 });
  assert.deepEqual(f.outbox.confirmedBase(), { payload: base, stateRevision: 5 });
  const view = f.outbox.confirmedBase(); view.payload.items.other = { id: "other" };
  assert.deepEqual(f.outbox.confirmedBase(), { payload: base, stateRevision: 5 });
  // A new instance without an observed server read must not infer this base.
  assert.equal(f.make().confirmedBase(), null);
});

test("confirmed base follows the newest applied DB head, not an older checkpoint snapshot", () => {
  const f = fixture(), firstInput = f.input(1), first = f.outbox.capture(firstInput);
  assert.equal(f.outbox.confirmedBase(), null);
  f.outbox.markApplied({ operationId: first.action.operationId, stateRevision: 6 });
  f.outbox.adoptRemoteBaseline({ snapshot: firstInput.snapshot, payload: firstInput.body.payload, stateRevision: 6 });
  f.outbox.compact();
  const nextInput = f.input(2); nextInput.body.baseStateRevision = 6;
  const second = f.outbox.capture(nextInput); assert.equal(f.outbox.confirmedBase(), null);
  f.outbox.markApplied({ operationId: second.action.operationId, stateRevision: 7 });
  assert.deepEqual(f.outbox.confirmedBase(), { payload: nextInput.body.payload, stateRevision: 7 });
  f.outbox.compact();
  assert.deepEqual(f.make().confirmedBase(), { payload: nextInput.body.payload, stateRevision: 7 });
});

test("confirmed empty list edits survive reload and follow causal ancestry rather than dates or storage order", () => {
  const f = fixture(), base = { items: {}, containers: {}, layouts: { layout: { id: "layout", name: "Empty" } }, categories: [] };
  f.outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 5 });
  const payload = { ...structuredClone(base), categories: ["First category"] };
  const first = f.outbox.capture({ snapshot: payload, body: { baseStateRevision: 5, payload } });
  assert.equal(isKnownEmptyPersonalSave({ records: f.make().list(), operationId: first.action.operationId, payload }), true);
  const next = { ...structuredClone(payload), locations: ["First location"] };
  const second = f.outbox.capture({ snapshot: next, body: { baseStateRevision: 5, payload: next } });
  assert.equal(isKnownEmptyPersonalSave({ records: f.make().list().reverse(), operationId: second.action.operationId, payload: next }), true);
  assert.equal(isKnownEmptyPersonalSave({ records: [second], operationId: second.action.operationId, payload: next }), false);
});

test("empty-state heuristic exception cannot authorize lost owners, layouts, missing baseline or different intent", () => {
  const f = fixture(), base = { items: {}, containers: {}, layouts: { layout: { id: "layout", name: "Keep" } } };
  f.outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 5 });
  const payload = { ...structuredClone(base), categories: ["First"] };
  const original = f.outbox.capture({ snapshot: payload, body: { baseStateRevision: 5, payload } });
  for (const mutate of [r => { delete r.mergeBase; }, r => { r.mergeBase.stateRevision++; },
    r => { r.mergeBase.payload.items.lost = { id: "lost" }; }, r => { r.mergeBase.payload.containers.lost = { id: "lost" }; },
    r => { r.mergeBase.payload.layouts.lost = { id: "lost" }; }, r => { r.action.body.forceOverwrite = true; },
    r => { r.action.kind = "photos.mutate"; }, r => { r.reconciliation = {}; }, r => { r.action.body.payload.items = null; }]) {
    const record = structuredClone(original); mutate(record);
    assert.equal(isKnownEmptyPersonalSave({ records: [record], operationId: record.action.operationId, payload: record.action.body.payload }), false);
  }
  assert.equal(isKnownEmptyPersonalSave({ records: [original], operationId: original.action.operationId,
    payload: { ...payload, categories: ["Later unsaved value"] } }), false);
  assert.equal(isKnownEmptyPersonalSave({ records: [original, original], operationId: original.action.operationId, payload }), false);
});

test("outbox remains disabled; atomic action plus local data survive a crash before the mirror write", () => {
  assert.equal(PERSONAL_SAVE_OUTBOX_ENABLED, false);
  const f = fixture(), input = f.input(100), saved = f.outbox.capture(input);
  input.snapshot.items.a.weight = 900; input.body.payload.items.a.weight = 900;
  assert.equal(f.values.size, 1);
  const restored = f.make().recover();
  assert.deepEqual(restored, saved);
  assert.equal(restored.snapshot.items.a.weight, 100);
  assert.equal(restored.action.body.payload.items.a.weight, 100);
});

test("capture records dependencies synchronously, preserves UUIDs on reload and ignores UI-only changes", () => {
  const f = fixture(), first = f.outbox.capture(f.input(100));
  const ui = f.input(100); ui.snapshot.localUi = "catalog";
  assert.equal(f.outbox.capture(ui).action.operationId, first.action.operationId);
  const second = f.outbox.capture(f.input(200));
  assert.deepEqual(second.action.body.causal, { reads: [], baseOperationId: first.action.operationId,
    dependsOn: [{ operationId: first.action.operationId, listId: "list-a" }] });
  assert.equal(second.action.generation, 2);
  assert.equal(f.make().recover().action.operationId, second.action.operationId);
});

test("quota never deletes prior intents; malformed or incomplete journals fail closed", () => {
  const f = fixture(), first = f.outbox.capture(f.input(100));
  const write = f.storage.setItem; f.storage.setItem = () => { throw Error("quota"); };
  assert.throws(() => f.outbox.capture(f.input(200)), { code: "quota" });
  assert.equal(f.make().recover().action.operationId, first.action.operationId);
  f.storage.setItem = write;
  f.outbox.capture(f.input(200));
  f.values.delete([...f.values.keys()][0]);
  assert.throws(f.make, { code: "storage" });
  const bad = fixture(); bad.outbox.capture(bad.input(1));
  bad.values.set([...bad.values.keys()][0], "broken JSON");
  assert.throws(bad.make, { code: "storage" });
});

test("oversized capture blocks before publication and exports the whole memory draft with the previous journal", () => {
  for (const create of [false, true]) {
    const f = fixture();
    if (!create) f.outbox.capture(f.input(1));
    const before = [...f.values], recovery = createPersonalSaveRecovery();
    const guarded = recovery.outbox(f.make, f.context.scopeKey), input = f.input("я".repeat(1600000));
    assert.throws(() => guarded.capture({ ...input, create }), { code: "payload-size" });
    assert.deepEqual([...f.values], before);
    const copy = recovery.recoveryCopy(f.storage);
    assert.equal(copy.reasonCode, "payload-size"); assert.deepEqual(copy.unconfirmedMemoryDraft, input.snapshot);
    assert.deepEqual(copy.journalEntries.map(({ key, value }) => [key, value]), before);
    assert.throws(() => guarded.capture(f.input(2)), { code: "payload-size" });
  }
});

test("stale tabs cannot acquire an unobserved predecessor; true concurrent forks keep both versions", () => {
  const f = fixture(), other = f.make();
  f.outbox.capture(f.input(100));
  assert.throws(() => other.capture(f.input(200)), { code: "stale-tab" });
  assert.equal(f.values.size, 1);
  const racing = fixture(), second = racing.make(), write = racing.storage.setItem;
  let nested = false;
  racing.storage.setItem = (key, value) => {
    if (!nested) { nested = true; second.capture(racing.input(200)); }
    write(key, value);
  };
  assert.throws(() => racing.outbox.capture(racing.input(100)), { code: "fork" });
  assert.equal(racing.values.size, 2, "neither concurrent intent is overwritten");
  assert.throws(racing.make, { code: "fork" });
});

test("known ID create is frozen before dispatch and never silently recreated", () => {
  const f = fixture(), first = f.outbox.capture({ ...f.input(1), create: true });
  assert.equal(first.action.kind, "list.create"); assert.equal(first.action.body.id, "list-a");
  assert.throws(() => f.outbox.capture({ ...f.input(2), create: true }), { code: "create" });
  assert.throws(() => createPersonalSaveOutbox({ storage: f.storage, actorId: "a", listId: "b", scopeKey: "c", environmentId: "production" }), { code: "scope" });
});

test("only the current action can receive a local applied checkpoint; a newer action remains pending", () => {
  const f = fixture(), first = f.outbox.capture(f.input(1));
  assert.equal(f.outbox.hasPending(), true);
  f.outbox.markApplied({ operationId: first.action.operationId, stateRevision: 6 });
  assert.equal(f.make().hasPending(), false);
  const second = f.outbox.capture(f.input(2));
  assert.equal(f.make().hasPending(), true);
  assert.throws(() => f.outbox.markApplied({ operationId: first.action.operationId, stateRevision: 6 }), { code: "checkpoint" });
  f.storage.setItem = () => { throw Error("quota"); };
  assert.throws(() => f.outbox.markApplied({ operationId: second.action.operationId, stateRevision: 7 }), { code: "storage" });
  assert.equal(f.make().hasPending(), true);
});

test("drain follows dependencies, settles historical receipts without UI apply, then validates only the latest", async () => {
  const f = fixture(), first = f.outbox.capture(f.input(100)), second = f.outbox.capture(f.input(200));
  const calls = [], confirmations = [];
  const queue = { run: async input => { calls.push(input); return { ok: true }; } };
  const options = { queue, getContext: () => ({ ...f.context }), onConfirmed: (result, record) => confirmations.push(record.action.operationId) };
  await f.make().drain(options);
  assert.deepEqual(calls.map(call => [call.operationId, !!call.receiptOnly]), [
    [first.action.operationId, true], [second.action.operationId, true], [second.action.operationId, false]
  ]);
  assert.deepEqual(confirmations, [second.action.operationId]);
  assert.equal(JSON.parse(calls[0].body).payload.items.a.weight, 100);
});

test("lost ACK, offline, waiting, account switch, newer edit and server conflicts never clear local intent", async () => {
  for (const failure of ["unknown", "waiting", "offline", "actor", "generation", "new-action", "conflict"]) {
    const f = fixture(); f.outbox.capture(f.input(100));
    let confirmed = false, count = 0;
    const queue = { run: async () => {
      count++;
      if (failure === "actor") f.context.actorId = "other";
      else if (failure === "generation") f.context.generation = "new";
      else if (failure === "new-action") f.outbox.capture(f.input(200));
      else throw Error(failure);
      return { ok: true };
    } };
    await assert.rejects(f.outbox.drain({ queue, getContext: () => ({ ...f.context }), onConfirmed: () => { confirmed = true; } }));
    assert.equal(count, 1); assert.equal(confirmed, false);
    assert.ok(f.values.size >= 1);
  }
});

function historicalProof(f, record, state = "committed") {
  return { historicalOnly: true, resultStatus: state === "committed" ? 200 : 409, stateRevision: 6,
    operation: { ...f.outbox.binding, id: record.action.operationId, kind: record.action.kind, state, payloadDigest: "1".repeat(64) } };
}

function reconciliationFixture(bodyExtras = {}) {
  const f = fixture();
  const payload = { items: { a: { id: "a", name: "Original", weight: 100 } }, containers: {}, layouts: {} };
  f.outbox.adoptRemoteBaseline({ snapshot: payload, payload, stateRevision: 5 });
  const local = structuredClone(payload); local.items.a.name = "Local";
  const first = f.outbox.capture({ snapshot: { ...local, localUi: "packing" }, body: { baseStateRevision: 5, payload: local, ...bodyExtras } });
  const remote = { id: "list-a", ownerId: "actor-a", stateRevision: 6, payload: structuredClone(payload) };
  remote.payload.items.a.weight = 200;
  const proofs = new Map([[first.action.operationId, { ...historicalProof(f, first, "rejected"), rejectionCode: "stale_state_revision" }]]);
  const calls = [];
  const queue = { inspect: async input => { calls.push(input); return structuredClone(proofs.get(input.operationId)); },
    run: async input => { calls.push(input); return { list: { stateRevision: 7 } }; } };
  const options = { queue, getContext: () => f.context, readRemote: async () => remote,
    makeSnapshot: (candidate, previous) => ({ ...candidate, localUi: previous.localUi }) };
  return { ...f, first, remote, proofs, queue, calls, options };
}

test("explicit conflicting choices are frozen into a new action without changing rejected bytes", async () => {
  const f = reconciliationFixture(); f.remote.payload.items.a.name = "Remote";
  const before = [...f.values]; let called = 0;
  const next = await f.outbox.reconcile({ ...f.options, resolveConflicts: async (conflicts, details) => {
    called++; assert.equal(conflicts[0].localValue.name, "Local"); assert.equal(details.stateRevision, 6);
    conflicts[0].localValue.name = "Mutated dialog copy";
    return { 0: "local" };
  } });
  assert.equal(called, 1); assert.equal(next.action.body.payload.items.a.name, "Local");
  assert.equal(next.action.body.baseStateRevision, 6); assert.equal(next.action.body.force, false);
  assert.notEqual(next.action.operationId, f.first.action.operationId);
  assert.deepEqual([...f.values].slice(0, before.length), before);
  assert.equal(f.make().recover().action.operationId, next.action.operationId);
});

test("server reconciliation cannot inherit a previous tree, layout or placed item copy marker", async () => {
  for (const marker of ["userLayoutCopy", "userContainerTree", "userItemCopyPlacement"]) {
    const f = reconciliationFixture({ [marker]: { version: 1, sourceLayoutId: "source", targetLayoutId: "copy" } }), before = [...f.values];
    const next = await f.outbox.reconcile(f.options);
    assert.equal(Object.hasOwn(next.action.body, marker), false);
    assert.deepEqual([...f.values].slice(0, before.length), before);
    assert.notEqual(next.action.operationId, f.first.action.operationId);
  }
});

test("oversized reconciliation retains the chosen merged draft without publishing a successor", async () => {
  const f = reconciliationFixture(), before = [...f.values], recovery = createPersonalSaveRecovery();
  f.remote.payload.items.b = { id: "b", name: "я".repeat(1600000) };
  await assert.rejects(recovery.run(() => f.outbox.reconcile(f.options), { scopeKey: f.context.scopeKey }), { code: "payload-size" });
  assert.deepEqual([...f.values], before);
  const copy = recovery.recoveryCopy(f.storage);
  assert.deepEqual(copy.unconfirmedMemoryDraft.items.b, f.remote.payload.items.b);
  assert.equal(copy.unconfirmedMemoryDraft.items.a.name, "Local");
  assert.equal(copy.unconfirmedMemoryDraft.items.a.weight, 200);
  assert.ok(f.calls.every(call => !Object.hasOwn(call, "receiptOnly")), "no successor dispatch");
});

test("cancel, incomplete choices, changed editor and structural validation never publish a chosen action", async () => {
  for (const mode of ["cancel", "missing", "actor", "generation", "new-action", "structure"]) {
    const f = reconciliationFixture(); f.remote.payload.items.a.name = "Remote";
    const before = [...f.values];
    await assert.rejects(f.outbox.reconcile({ ...f.options,
      makeSnapshot: mode === "structure" ? () => { throw Error("invalid related placements"); } : f.options.makeSnapshot,
      resolveConflicts: async () => {
        if (mode === "cancel") return "cancel";
        if (mode === "missing") return {};
        if (mode === "actor") f.context.actorId = "other";
        if (mode === "generation") f.context.generation = "changed";
        if (mode === "new-action") f.outbox.capture(f.input(300));
        return { 0: "local" };
      }
    }));
    assert.deepEqual([...f.values].slice(0, before.length), before, mode);
    assert.equal(f.values.size, before.length + (mode === "new-action" ? 1 : 0), mode);
    assert.ok(f.calls.every(call => !Object.hasOwn(call, "receiptOnly")), "no dispatch while choosing");
  }
});

test("a second server conflict is compared afresh instead of reusing the first user choice", async () => {
  const f = reconciliationFixture(); f.remote.payload.items.a.name = "Remote";
  const choices = [];
  const options = { ...f.options, resolveConflicts: async (conflicts, details) => {
    choices.push([conflicts[0].remoteValue.name, details.stateRevision]); return { 0: "local" };
  } };
  const first = await f.outbox.reconcile(options);
  f.proofs.set(first.action.operationId, { ...historicalProof(f, first, "rejected"), rejectionCode: "stale_state_revision", stateRevision: 7 });
  f.remote.stateRevision = 7; f.remote.payload.items.a.name = "Newer remote";
  const second = await f.outbox.reconcile(options);
  assert.deepEqual(choices, [["Remote", 6], ["Newer remote", 7]]);
  assert.notEqual(first.action.operationId, second.action.operationId);
  assert.equal(second.action.body.baseStateRevision, 7);
});

test("reconciliation publishes a new immutable action and snapshot atomically, then rechecks old receipts after reload", async () => {
  const f = reconciliationFixture(), before = [...f.values];
  const next = await f.outbox.reconcile(f.options);
  assert.notEqual(next.action.operationId, f.first.action.operationId);
  assert.equal(next.action.previousLocalOperationId, f.first.action.operationId);
  assert.equal(next.action.generation, 2); assert.equal(next.action.body.baseStateRevision, 6);
  assert.deepEqual(next.action.body.causal, { reads: [], dependsOn: [] });
  assert.equal(next.action.body.force, false);
  assert.equal(next.snapshot.items.a.name, "Local"); assert.equal(next.snapshot.items.a.weight, 200);
  assert.equal(next.snapshot.localUi, "packing");
  assert.deepEqual([...f.values].slice(0, 1), before, "old rejected action bytes never change");
  assert.deepEqual(f.make().recover(), next);
  f.calls.length = 0;
  await f.make().drain({ queue: f.queue, getContext: () => f.context });
  assert.deepEqual(f.calls.map(input => input.operationId), [f.first.action.operationId, next.action.operationId, next.action.operationId]);
  f.outbox.markApplied({ operationId: next.action.operationId, stateRevision: 7 });
  f.outbox.compact();
  assert.equal(f.values.size, 3); assert.equal(f.make().hasPending(), false);
  f.calls.length = 0;
  await f.make().drain({ queue: f.queue, getContext: () => f.context });
  assert.deepEqual(f.calls.map(input => input.operationId), [next.action.operationId, next.action.operationId]);
});

test("unknown, waiting, forbidden, deleted, older or conflicting remote data never authorize reconciliation", async () => {
  for (const failure of ["unknown", "waiting", "forbidden", "committed", "deleted", "older", "owner", "id", "same-field", "delete-entity", "files", "missing-base"]) {
    const f = reconciliationFixture();
    if (["unknown", "waiting", "forbidden", "committed"].includes(failure)) {
      const proof = f.proofs.get(f.first.action.operationId);
      if (failure === "forbidden") { proof.resultStatus = 403; proof.rejectionCode = "forbidden"; }
      else proof.operation.state = failure;
    }
    if (failure === "deleted") f.remote.deleted = true;
    if (failure === "older") f.remote.stateRevision = 4;
    if (failure === "owner") f.remote.ownerId = "other";
    if (failure === "id") f.remote.id = "other";
    if (failure === "same-field") f.remote.payload.items.a.name = "Remote";
    if (failure === "delete-entity") delete f.remote.payload.items.a;
    if (failure === "files") f.remote.payload.items.a.photos = [{ id: "p" }];
    if (failure === "missing-base") {
      const [key, value] = [...f.values][0], record = JSON.parse(value); delete record.mergeBase;
      f.values.set(key, JSON.stringify(record));
    }
    const before = [...f.values];
    await assert.rejects(f.outbox.reconcile(f.options), undefined, failure);
    assert.deepEqual([...f.values], before, failure);
  }
});

test("reconciliation preserves the old journal on quota, changed editor, account or a new local action", async () => {
  for (const failure of ["quota", "generation", "actor", "scope", "new-action"]) {
    const f = reconciliationFixture(), before = [...f.values];
    if (failure === "quota") f.storage.setItem = () => { throw Error("quota"); };
    f.options.readRemote = async () => {
      if (failure === "generation") f.context.generation = "next";
      if (failure === "actor") f.context.actorId = "other";
      if (failure === "scope") f.context.scope = "readonly";
      if (failure === "new-action") f.outbox.capture(f.input(999));
      return f.remote;
    };
    await assert.rejects(f.outbox.reconcile(f.options));
    assert.deepEqual([...f.values].slice(0, 1), before);
    assert.equal(f.values.size, failure === "new-action" ? 2 : 1);
  }
});

test("a second server edit requires a new comparison and ID, never blind revision advancement", async () => {
  const f = reconciliationFixture(), next = await f.outbox.reconcile(f.options);
  f.proofs.set(next.action.operationId, { ...historicalProof(f, next, "rejected"), stateRevision: 8, rejectionCode: "stale_state_revision" });
  f.remote.stateRevision = 8; f.remote.payload.items.a.weight = 300;
  const third = await f.outbox.reconcile(f.options);
  assert.equal(third.action.generation, 3); assert.equal(third.action.body.baseStateRevision, 8);
  assert.equal(third.snapshot.items.a.weight, 300); assert.equal(third.snapshot.items.a.name, "Local");
  assert.deepEqual(f.make().recover(), third);
  f.proofs.set(third.action.operationId, { ...historicalProof(f, third, "rejected"), stateRevision: 9, rejectionCode: "stale_state_revision" });
  f.remote.stateRevision = 9; f.remote.payload.items.a.name = "Remote";
  await assert.rejects(f.outbox.reconcile(f.options), { code: "reconciliation-conflict" });
  assert.equal(f.make().recover().action.operationId, third.action.operationId);
});

test("tampered reconciliation evidence and unknown descendants cannot bypass a rejected predecessor", async () => {
  for (const failure of ["proof", "predecessor", "revision", "unknown-descendant"]) {
    const f = reconciliationFixture();
    if (failure === "unknown-descendant") {
      f.outbox.capture(f.input(999));
      await assert.rejects(f.outbox.reconcile(f.options));
    } else {
      const next = await f.outbox.reconcile(f.options);
      const key = [...f.values.keys()].find(value => value.endsWith(next.action.operationId)), record = JSON.parse(f.values.get(key));
      if (failure === "proof") record.reconciliation.settled[0].operation.actorId = "other";
      if (failure === "predecessor") delete record.action.previousLocalOperationId;
      if (failure === "revision") record.action.body.baseStateRevision = 999;
      f.values.set(key, JSON.stringify(record));
      assert.throws(f.make, { code: "storage" });
    }
  }
});

test("reconciliation uses the latest committed predecessor instead of replaying already accepted edits", async () => {
  const f = reconciliationFixture();
  f.proofs.set(f.first.action.operationId, historicalProof(f, f.first));
  const local = structuredClone(f.first.action.body.payload); local.items.a.weight = 250;
  const second = f.outbox.capture({ snapshot: local, body: { baseStateRevision: 5, payload: local } });
  f.proofs.set(second.action.operationId, { ...historicalProof(f, second, "rejected"), stateRevision: 8, rejectionCode: "stale_state_revision" });
  f.remote.stateRevision = 8; f.remote.payload.items.a.name = "Changed after committed local rename";
  f.remote.payload.items.a.weight = 100;
  const next = await f.outbox.reconcile(f.options);
  assert.equal(next.action.body.payload.items.a.name, "Changed after committed local rename");
  assert.equal(next.action.body.payload.items.a.weight, 250);
});

test("changed historical receipt blocks a reconciled action before any dispatch", async () => {
  const f = reconciliationFixture(); await f.outbox.reconcile(f.options);
  f.calls.length = 0; f.proofs.get(f.first.action.operationId).operation.payloadDigest = "0".repeat(64);
  await assert.rejects(f.make().drain({ queue: f.queue, getContext: () => f.context }), { code: "receipt" });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].operationId, f.first.action.operationId);
});

test("reconciliation settles unknown descendants only behind an exact rejected predecessor; public inspect never sends", async () => {
  const f = reconciliationFixture();
  const local = structuredClone(f.first.action.body.payload); local.items.a.note = "second local edit";
  const second = f.outbox.capture({ snapshot: local, body: { baseStateRevision: 5, payload: local } });
  let settlements = 0;
  const inspect = f.queue.inspect;
  f.queue.inspect = async input => {
    if (!f.proofs.has(input.operationId)) throw Object.assign(Error("unknown"), { isOperationReceiptError: true });
    return inspect(input);
  };
  f.queue.settleRejectedDependency = async input => {
    settlements++; assert.equal(input.operationId, second.action.operationId);
    assert.equal(input.predecessor.operationId, f.first.action.operationId);
    assert.deepEqual(JSON.parse(input.body), second.action.body);
    const proof = { ...historicalProof(f, second, "rejected"), rejectionCode: "dependency_rejected" };
    f.proofs.set(second.action.operationId, proof); return proof;
  };
  await assert.rejects(f.outbox.inspect(f.options)); assert.equal(settlements, 0);
  const merged = await f.outbox.reconcile(f.options);
  assert.equal(settlements, 1); assert.equal(merged.action.generation, 3);
  assert.equal(merged.snapshot.items.a.note, "second local edit");
  assert.equal(merged.snapshot.items.a.name, "Local"); assert.equal(merged.snapshot.items.a.weight, 200);
  assert.deepEqual(f.make().recover(), merged);
});

test("a failed non-conflict ancestor cannot turn dependency rejections into reconciliation permission", async () => {
  const f = reconciliationFixture();
  const second = f.outbox.capture(f.input(250));
  f.proofs.get(f.first.action.operationId).rejectionCode = "forbidden";
  f.proofs.set(second.action.operationId, { ...historicalProof(f, second, "rejected"), rejectionCode: "dependency_rejected" });
  const before = [...f.values]; await assert.rejects(f.outbox.reconcile(f.options), { code: "reconciliation" });
  assert.deepEqual([...f.values], before);
});

function committedBaselineFixture() {
  const f = reconciliationFixture();
  f.proofs.set(f.first.action.operationId, historicalProof(f, f.first));
  f.remote.stateRevision = 20; f.remote.payload.items.a.name = "Newer remote value";
  f.options.makeBaselineMeta = () => ({ dirty: false, serverUpdatedAt: "verified remote timestamp" });
  return f;
}

test("a committed stale head adopts the current remote snapshot atomically without replaying the old payload", async () => {
  const f = committedBaselineFixture(), before = [...f.values];
  const adopted = await f.outbox.reconcile(f.options);
  assert.equal(adopted.adoptedBaseline, true); assert.equal(adopted.action.operationId, f.first.action.operationId);
  assert.equal(adopted.historicalConfirmation.stateRevision, 6); assert.equal(adopted.baseline.stateRevision, 20);
  assert.equal(adopted.snapshot.items.a.name, "Newer remote value");
  assert.deepEqual([...f.values].slice(0, 1), before, "the historical action is not rewritten");
  assert.equal(f.values.size, 2, "one atomic certificate owns both confirmation and new baseline");
  assert.equal(f.make().hasPending(), false);
  assert.deepEqual(f.make().recoverSnapshot(), adopted.snapshot);
  assert.equal(f.make().baseline().meta.dirty, false);
  assert.equal(f.make().recover().action.body.payload.items.a.name, "Local");
  f.outbox.compact(); assert.equal(f.values.size, 3);
  assert.deepEqual(f.make().recoverSnapshot(), adopted.snapshot);
  const body = { baseStateRevision: 20, payload: structuredClone(adopted.baseline.payload) };
  body.payload.items.a.weight = 777;
  const next = f.outbox.capture({ snapshot: body.payload, body });
  assert.equal(next.action.previousLocalOperationId, f.first.action.operationId);
  assert.deepEqual(next.action.body.causal, { dependsOn: [], reads: [] });
  assert.equal(next.mergeBase.stateRevision, 20);
});

test("a crash before or after atomic baseline publication never leaves an applied-only stale snapshot", async () => {
  for (const afterWrite of [false, true]) {
    const f = committedBaselineFixture(), write = f.storage.setItem;
    f.storage.setItem = (key, value) => { if (afterWrite) write(key, value); throw Error("crash"); };
    await assert.rejects(f.outbox.reconcile(f.options), { code: "quota" });
    const restored = f.make();
    assert.equal(restored.hasPending(), !afterWrite);
    assert.equal(restored.recoverSnapshot().items.a.name, afterWrite ? "Newer remote value" : "Local");
    assert.equal(restored.baseline()?.stateRevision ?? null, afterWrite ? 20 : null);
  }
});

test("failed conversion/cleanup of an inline confirmation keeps its current baseline recoverable", async () => {
  for (const failure of ["before-marker", "after-marker", "checkpoint", "cleanup"]) {
    const f = committedBaselineFixture(); await f.outbox.reconcile(f.options);
    const write = f.storage.setItem;
    f.storage.setItem = (key, value) => {
      if (key.includes(":applied:") && failure.includes("marker")) {
        if (failure === "after-marker") write(key, value);
        throw Error(failure);
      }
      if (key.includes(":checkpoint:") && failure === "checkpoint") throw Error(failure);
      write(key, value);
    };
    if (failure === "cleanup") f.storage.removeItem = () => { throw Error(failure); };
    f.outbox.compact();
    assert.equal(f.make().hasPending(), false, failure);
    assert.equal(f.make().recoverSnapshot().items.a.name, "Newer remote value", failure);
    assert.equal(f.make().baseline().stateRevision, 20, failure);
  }
});

test("inline confirmation must match the head, account, state and revision; incomplete certificates cannot apply", async () => {
  for (const failure of ["id", "actor", "state", "revision", "baseline", "marker"]) {
    const f = committedBaselineFixture(); await f.outbox.reconcile(f.options);
    const key = [...f.values.keys()].find(key => key.includes(":checkpoint:")), checkpoint = JSON.parse(f.values.get(key));
    if (failure === "id") checkpoint.confirmation.operation.id = crypto.randomUUID();
    if (failure === "actor") checkpoint.confirmation.operation.actorId = "other";
    if (failure === "state") checkpoint.confirmation.operation.state = "rejected";
    if (failure === "revision") checkpoint.confirmation.stateRevision = 999;
    if (failure === "baseline") delete checkpoint.baseline;
    if (failure === "marker") delete checkpoint.confirmation;
    f.values.set(key, JSON.stringify(checkpoint));
    assert.throws(f.make, { code: "storage" }, failure);
  }
});

test("a concurrent edit during remote adoption remains pending and cannot be retired by the old certificate", async () => {
  const f = committedBaselineFixture(), write = f.storage.setItem;
  let raced = false;
  f.storage.setItem = (key, value) => {
    if (key.includes(":checkpoint:") && !raced) { raced = true; f.outbox.capture(f.input(999)); }
    write(key, value);
  };
  await assert.rejects(f.outbox.reconcile(f.options), { code: "stale-tab" });
  assert.equal(f.make().hasPending(), true);
  assert.equal(f.make().recoverSnapshot().items.a.weight, 999);
  assert.equal(f.make().list().length, 2);
});

test("baseline refresh before inline confirmation compaction preserves the atomic confirmation", async () => {
  const f = committedBaselineFixture(); await f.outbox.reconcile(f.options);
  const fresh = structuredClone(f.remote.payload); fresh.items.a.weight = 999;
  f.outbox.adoptRemoteBaseline({ payload: fresh, snapshot: fresh, stateRevision: 21 });
  assert.equal(f.make().hasPending(), false); assert.equal(f.make().recoverSnapshot().items.a.weight, 999);
  f.outbox.compact(); assert.equal(f.make().baseline().stateRevision, 21);
});

test("actual base-state reader prefers the durable baseline and never swallows a journal failure", async () => {
  const f = committedBaselineFixture(); await f.outbox.reconcile(f.options);
  let fail = false;
  const readBase = appFunction("loadBaseState", {
    personalSaveOutboxForScope: () => { if (fail) throw Object.assign(Error("bad journal"), { isPersonalSaveBlocked: true }); return f.outbox; },
    localStorage: { getItem: () => assert.fail("stale mirror must not supply the merge base") },
    normalizeRemoteState: value => value
  });
  assert.equal(readBase().items.a.name, "Newer remote value");
  fail = true; assert.throws(readBase, { isPersonalSaveBlocked: true });
});

test("outbox inspection settles exact historical actions without applying, clearing or changing their snapshots", async () => {
  const f = fixture(), first = f.outbox.capture(f.input(100)), second = f.outbox.capture(f.input(200));
  const before = [...f.values], calls = [];
  const result = await f.outbox.inspect({ getContext: () => f.context, queue: {
    inspect: async input => { calls.push(input); return historicalProof(f, input.operationId === first.action.operationId ? first : second,
      input.operationId === first.action.operationId ? "committed" : "rejected"); },
    run: () => assert.fail("historical inspection must never dispatch")
  } });
  assert.deepEqual(calls.map(call => call.operationId), [first.action.operationId, second.action.operationId]);
  assert.equal(result.headOperationId, second.action.operationId);
  assert.deepEqual(result.outcomes.map(proof => proof.operation.state), ["committed", "rejected"]);
  assert.equal(f.make().hasPending(), true);
  assert.deepEqual([...f.values], before);
});

test("outbox inspection cannot become a complete settlement with an unknown or malformed child", async () => {
  for (const defect of ["unknown", "wrong-id", "wrong-actor", "not-historical"]) {
    const f = fixture(), first = f.outbox.capture(f.input(100)); f.outbox.capture(f.input(200));
    const before = [...f.values]; let count = 0;
    await assert.rejects(f.outbox.inspect({ getContext: () => f.context, queue: { inspect: async () => {
      count++;
      if (defect === "unknown") throw Object.assign(Error("unknown"), { isAmbiguousMutation: true });
      const proof = historicalProof(f, first);
      if (defect === "wrong-id") proof.operation.id = crypto.randomUUID();
      if (defect === "wrong-actor") proof.operation.actorId = "other";
      if (defect === "not-historical") proof.historicalOnly = false;
      return proof;
    } } }));
    assert.equal(count, 1); assert.deepEqual([...f.values], before);
  }
});

test("outbox inspection freezes the editor and stops at a new action or scope switch", async () => {
  for (const change of ["edit", "actor", "generation", "scope"]) {
    const f = fixture(), first = f.outbox.capture(f.input(100)); let count = 0;
    await assert.rejects(f.outbox.inspect({ getContext: () => f.context, queue: { inspect: async () => {
      count++;
      if (change === "edit") f.outbox.capture(f.input(200));
      if (change === "actor") f.context.actorId = "other";
      if (change === "generation") f.context.generation = "next";
      if (change === "scope") f.context.scope = "readonly";
      return historicalProof(f, first);
    } } }), { code: "context" });
    assert.equal(count, 1);
    assert.equal(f.make().hasPending(), true);
  }
});

test("the first mutation durably freezes the server base this editor actually observed", () => {
  const f = fixture(), base = f.input(50);
  assert.equal(f.outbox.adoptRemoteBaseline({ snapshot: base.snapshot, payload: base.body.payload, stateRevision: 5 }), false);
  base.body.payload.items.a.weight = 999;
  const saved = f.outbox.capture(f.input(100));
  assert.equal(f.values.size, 1, "base, intent and snapshot use one atomic record");
  assert.deepEqual(saved.mergeBase, { stateRevision: 5, payload: f.input(50).body.payload });
  assert.deepEqual(f.make().recover().mergeBase, saved.mergeBase);
  assert.equal(f.outbox.capture(f.input(200)).mergeBase, undefined, "an unconfirmed predecessor is not a new common server base");
});

test("a confirmed predecessor or adopted remote baseline supplies the next action's immutable merge base", () => {
  const f = fixture(), first = f.outbox.capture(f.input(100));
  f.outbox.markApplied({ operationId: first.action.operationId, stateRevision: 6 });
  const second = f.outbox.capture(f.input(200));
  assert.deepEqual(second.mergeBase, { stateRevision: 6, payload: first.action.body.payload });
  f.outbox.markApplied({ operationId: second.action.operationId, stateRevision: 7 }); f.outbox.compact();
  const remote = f.input(250);
  f.outbox.adoptRemoteBaseline({ snapshot: remote.snapshot, payload: remote.body.payload, stateRevision: 20 });
  const next = f.input(300); next.body.baseStateRevision = 20;
  assert.deepEqual(f.outbox.capture(next).mergeBase, { stateRevision: 20, payload: remote.body.payload });
});

test("missing or wrong-revision initial bases are not invented from a mutable mirror", () => {
  const f = fixture(), remote = f.input(50);
  f.outbox.adoptRemoteBaseline({ snapshot: remote.snapshot, payload: remote.body.payload, stateRevision: 4 });
  assert.equal(f.outbox.capture(f.input(100)).mergeBase, undefined);
  const cold = fixture(); assert.equal(cold.outbox.capture(cold.input(100)).mergeBase, undefined);
});

test("actual app persistence writes the intent before its mirror and cannot fallback after a quota error", () => {
  const calls = [], f = fixture();
  let fail = false;
  const persist = appFunction("persistStateSnapshot", {
    personalSaveRecovery: createPersonalSaveRecovery(),
    personalSavePilotEnabled: () => true, hasPendingPersonalSave: () => false, applyingRemoteState: false, STORAGE_KEY: "mirror",
    capturePersonalSaveIntent: snapshot => {
      calls.push("intent"); if (fail) throw Error("quota"); return f.outbox.capture({ ...f.input(1), snapshot });
    },
    scopedLocalStorageKey: key => key,
    safeSetLocalStorage: () => { calls.push("mirror"); return false; },
    writeLargeScopedLocalValue: () => { calls.push("legacy"); return true; }
  });
  assert.equal(persist({ items: {} }), true);
  assert.deepEqual(calls, ["intent", "mirror"]);
  assert.ok(f.make().recover());
  calls.length = 0; fail = true;
  assert.throws(() => persist({ items: {} }), /quota/);
  assert.deepEqual(calls, ["intent"]);
  calls.length = 0;
  persist({ items: {} }, { recordAction: false });
  assert.deepEqual(calls, ["legacy"], "read-time normalization is not a user action");
});

test("storage recovery latches the failure, freezes the unsaved draft and blocks subsequent writes", () => {
  const f = fixture(), notifications = [];
  const recovery = createPersonalSaveRecovery({ onBlocked: info => notifications.push(info.error) });
  const guarded = recovery.outbox(f.make, f.context.scopeKey);
  guarded.capture(f.input(100));
  const before = [...f.values];
  f.storage.setItem = () => { throw Error("quota"); };
  const next = f.input(200);
  let failure;
  assert.throws(() => guarded.capture(next), error => { failure = error; return error.code === "quota"; });
  next.snapshot.items.a.weight = 999;
  assert.deepEqual([...f.values], before);
  assert.equal(recovery.owns(failure), true);
  assert.throws(() => guarded.capture(f.input(300)), error => error === failure);
  assert.throws(() => guarded.markApplied({}), error => error === failure);
  assert.throws(() => guarded.compact(), error => error === failure);
  const copy = recovery.recoveryCopy(f.storage);
  assert.equal(copy.unconfirmedMemoryDraft.items.a.weight, 200);
  assert.equal(copy.automaticImportAllowed, false);
  assert.equal(copy.photoFilesIncluded, false);
  assert.deepEqual(notifications, [failure]);
});

test("corrupt journal recovery exports only the affected actor and no auth or production keys", () => {
  const f = fixture(); f.outbox.capture(f.input(100));
  const key = [...f.values.keys()][0];
  f.values.set(key, "broken JSON: retain exactly");
  for (const [actorId, environment] of [["other", "bike-packing-experiment"], ["actor-a", "production"]]) {
    const binding = { environment, actorId, scopeKey: `id:${actorId}`, listId: "list-a" };
    f.values.set(`bike-packing-personal-save-v1:${encodeURIComponent(JSON.stringify(binding))}:anchor`, "secret");
  }
  f.values.set("auth-session", "secret token"); f.values.set("unrelated", "secret");
  const recovery = createPersonalSaveRecovery();
  assert.throws(() => recovery.outbox(f.make, f.context.scopeKey), { code: "storage" });
  const copy = recovery.recoveryCopy(f.storage);
  assert.deepEqual(copy.journalEntries, [{ key, value: "broken JSON: retain exactly" }]);
  assert.equal(copy.memoryDraftAvailable, false);
  assert.equal(JSON.stringify(copy).includes("secret"), false);
  assert.equal(f.values.size, 5, "export never cleans or rewrites storage");
});

test("recovery observes asynchronous storage failures but not ordinary offline or context outcomes", async () => {
  const recovery = createPersonalSaveRecovery();
  for (const error of [Error("offline"), Object.assign(Error("new editor"), { isPersonalSaveBlocked: true, code: "context" })]) {
    await assert.rejects(recovery.run(async () => { throw error; }), value => value === error);
    assert.equal(recovery.message(), "");
  }
  const error = Object.assign(Error("checkpoint not saved"), { isPersonalSaveBlocked: true, code: "storage" });
  await assert.rejects(recovery.run(async () => { throw error; }, { scopeKey: "id:actor-a" }), value => value === error);
  assert.equal(recovery.message(), error.message);
  assert.throws(() => recovery.run(() => assert.fail("must not run")), value => value === error);
  const copy = recovery.recoveryCopy({ get length() { throw Error("storage unavailable"); } });
  assert.equal(copy.storageReadable, false);
});

test("stale editor recovery keeps the other tab's journal and the rejected editor draft separate", () => {
  const f = fixture(), recovery = createPersonalSaveRecovery();
  const stale = recovery.outbox(f.make, f.context.scopeKey);
  f.outbox.capture(f.input(100));
  assert.throws(() => stale.capture(f.input(200)), { code: "stale-tab" });
  const copy = recovery.recoveryCopy(f.storage);
  assert.equal(copy.unconfirmedMemoryDraft.items.a.weight, 200);
  assert.equal(JSON.parse(copy.journalEntries[0].value).action.body.payload.items.a.weight, 100);
  assert.equal(copy.journalEntries.length, 1);
});

function staleDraftFixture() {
  const f = fixture(), payload = { items: { a: { id: "a", name: "Original", weight: 100 } }, containers: {}, layouts: {} };
  const base = f.outbox.capture({ snapshot: payload, body: { baseStateRevision: 5, payload } });
  f.outbox.markApplied({ operationId: base.action.operationId, stateRevision: 6 }); f.outbox.compact();
  const recovery = createPersonalSaveRecovery({ isCurrentScope: scope => scope === f.context.scopeKey });
  const stale = recovery.outbox(f.make, f.context.scopeKey);
  const local = structuredClone(payload); local.items.a.name = "Local rename";
  const remote = structuredClone(payload); remote.items.a.weight = 222;
  return { ...f, base, recovery, stale, local, remote,
    saveRemote: () => f.outbox.capture({ snapshot: remote, body: { baseStateRevision: 6, payload: remote } }),
    failCapture: () => assert.throws(() => stale.capture({ snapshot: local, body: { baseStateRevision: 6, payload: local } }), { code: "stale-tab" }),
    options: { getContext: () => f.context }
  };
}

test("stale draft recovery merges the frozen editor base and publishes one durable successor before unlocking", async () => {
  const f = staleDraftFixture(), remote = f.saveRemote(); f.failCapture();
  assert.equal(f.recovery.canRecoverDraft(), true); const before = [...f.values];
  const result = await f.recovery.recoverDraft(f.options);
  assert.doesNotThrow(f.recovery.assertRunning);
  assert.equal(result.localReconciliation.sourceOperationId, f.base.action.operationId);
  assert.equal(result.localReconciliation.targetOperationId, remote.action.operationId);
  assert.equal(result.action.body.causal.baseOperationId, remote.action.operationId);
  assert.equal(result.action.body.payload.items.a.name, "Local rename"); assert.equal(result.action.body.payload.items.a.weight, 222);
  assert.deepEqual([...f.values].slice(0, before.length), before);
  assert.equal(f.values.size, before.length + 1); assert.deepEqual(f.make().recover(), result);
  const calls = [];
  await f.make().drain({ queue: { run: async input => { calls.push(input.operationId); return {}; } }, getContext: () => f.context });
  assert.ok(calls.indexOf(remote.action.operationId) < calls.indexOf(result.action.operationId));
});

test("stale draft recovery survives compaction of its observed ancestor and uses the adopted server base", async () => {
  const f = staleDraftFixture(), remote = f.saveRemote();
  f.outbox.markApplied({ operationId: remote.action.operationId, stateRevision: 7 }); f.outbox.compact();
  f.remote.items.a.weight = 333;
  f.outbox.adoptRemoteBaseline({ payload: f.remote, snapshot: f.remote, stateRevision: 20 });
  f.failCapture();
  const result = await f.recovery.recoverDraft(f.options);
  assert.equal(result.action.body.baseStateRevision, 20); assert.deepEqual(result.action.body.causal.dependsOn, []);
  assert.equal(result.action.previousLocalOperationId, remote.action.operationId);
  assert.equal(result.action.body.payload.items.a.name, "Local rename"); assert.equal(result.action.body.payload.items.a.weight, 333);
  assert.equal(result.mergeBase.stateRevision, 20);
});

test("a stale draft conflict needs an explicit decision and can be postponed without releasing the recovery latch", async () => {
  const f = staleDraftFixture(); f.remote.items.a.name = "Other tab name"; const remote = f.saveRemote(); f.failCapture();
  const before = [...f.values];
  await assert.rejects(f.recovery.recoverDraft({ ...f.options, resolveConflicts: async (conflicts, info) => {
    assert.equal(info.localComparison, true); assert.equal(conflicts[0].remoteValue.name, "Other tab name"); return "cancel";
  } }), { code: "reconciliation-cancelled" });
  assert.throws(f.recovery.assertRunning, { code: "stale-tab" }); assert.deepEqual([...f.values], before);
  const result = await f.recovery.recoverDraft({ ...f.options, resolveConflicts: async () => "server" });
  assert.notEqual(result.action.operationId, remote.action.operationId, "even accepting the other head has a durable decision");
  assert.equal(result.action.body.payload.items.a.name, "Other tab name"); assert.doesNotThrow(f.recovery.assertRunning);
});

test("changed editor/account/other head, invalid structures and quota preserve the stale draft and latch", async () => {
  for (const mode of ["context", "actor", "other-head", "structure", "quota-before", "quota-after"]) {
    const f = staleDraftFixture(); f.remote.items.a.name = "Other"; f.saveRemote(); f.failCapture();
    const before = [...f.values], write = f.storage.setItem;
    if (mode.startsWith("quota")) f.storage.setItem = (key, value) => {
      if (mode === "quota-after") write(key, value); throw Error("quota");
    };
    await assert.rejects(f.recovery.recoverDraft({ ...f.options,
      makeSnapshot: mode === "structure" ? () => { throw Error("invalid structure"); } : payload => payload,
      resolveConflicts: async () => {
        if (mode === "context") f.context.generation = "new editor";
        if (mode === "actor") f.context.actorId = "other";
        if (mode === "other-head") { f.remote.items.a.weight++; f.saveRemote(); }
        return { 0: "local" };
      }
    }));
    assert.throws(f.recovery.assertRunning, { code: "stale-tab" }, mode);
    assert.deepEqual([...f.values].slice(0, before.length), before, mode);
    assert.equal(f.recovery.recoveryCopy(f.storage).unconfirmedMemoryDraft.items.a.name, "Local rename");
    if (mode === "quota-after") assert.equal(f.make().recover().localReconciliation.version, 1);
    if (mode.startsWith("quota")) {
      assert.equal(f.recovery.canRecoverDraft(), false);
      await assert.rejects(f.recovery.recoverDraft(f.options));
    }
  }
});

test("concurrent recovery clicks cannot create two successors from one frozen stale draft", async () => {
  const f = staleDraftFixture(); f.remote.items.a.name = "Other"; f.saveRemote(); f.failCapture();
  let choose;
  const first = f.recovery.recoverDraft({ ...f.options, resolveConflicts: () => new Promise(resolve => { choose = resolve; }) });
  assert.equal(f.recovery.canRecoverDraft(), false);
  await assert.rejects(f.recovery.recoverDraft(f.options), /No recoverable draft/);
  choose({ 0: "local" }); const record = await first;
  assert.equal(f.make().list().filter(entry => entry.localReconciliation).length, 1);
  assert.equal(f.make().recover().action.operationId, record.action.operationId);
  await assert.rejects(f.recovery.recoverDraft(f.options), /No recoverable draft/);
});

test("recovery cannot invent the other tab's parent or load a malformed local reconciliation marker", async () => {
  const f = staleDraftFixture(); f.saveRemote(); f.failCapture();
  const record = await f.recovery.recoverDraft(f.options);
  const key = [...f.values.keys()].find(key => key.endsWith(record.action.operationId)), original = f.values.get(key);
  for (const change of [{ version: 9 }, { targetOperationId: crypto.randomUUID() }, { sourceOperationId: "wrong" }]) {
    const value = JSON.parse(original); Object.assign(value.localReconciliation, change);
    f.values.set(key, JSON.stringify(value)); assert.throws(f.make, { code: "storage" });
  }
  f.values.set(key, original); assert.equal(f.make().recover().action.operationId, record.action.operationId);
});

test("missing common base, stored forks and non-stale storage failures never enable draft replay", async () => {
  const f = fixture(), recovery = createPersonalSaveRecovery(), stale = recovery.outbox(f.make, f.context.scopeKey);
  f.outbox.capture(f.input(100)); assert.throws(() => stale.capture(f.input(200)), { code: "stale-tab" });
  assert.equal(recovery.canRecoverDraft(), false);
  await assert.rejects(recovery.recoverDraft({ getContext: () => f.context }), /No recoverable draft/);
  assert.throws(recovery.assertRunning, { code: "stale-tab" });
  for (const code of ["fork", "storage", "quota", "selection"]) {
    const latch = createPersonalSaveRecovery();
    latch.report(Object.assign(Error(code), { code, isPersonalSaveBlocked: true }), { scopeKey: "id:actor-a", snapshot: {} });
    assert.equal(latch.canRecoverDraft(), false); await assert.rejects(latch.recoverDraft({}));
  }
});

test("a late storage failure cannot expose another account's draft or authorize recovery export after scope change", async () => {
  let scope = "id:actor-a", reject;
  const recovery = createPersonalSaveRecovery({ isCurrentScope: value => value === scope });
  const failure = Object.assign(Error("quota"), { code: "quota", isPersonalSaveBlocked: true });
  const pending = recovery.run(() => new Promise((resolve, fail) => { reject = fail; }), {
    scopeKey: scope, snapshot: { private: "actor-a" }
  });
  scope = "id:actor-b"; reject(failure);
  await assert.rejects(pending, error => error === failure);
  assert.equal(recovery.message(), "");
  assert.throws(() => recovery.recoveryCopy({}), /No blocked/);
  recovery.report(failure, { scopeKey: scope, snapshot: { private: "actor-b" } });
  scope = "id:actor-c";
  assert.throws(() => recovery.recoveryCopy({}), /different account/);
});

test("bag creation/edit and item placement do not close their forms before durable save succeeds", () => {
  const error = Error("injected storage failure");
  for (const editing of [false, true]) {
    const state = { containers: editing ? { bag: { id: "bag" } } : {} };
    const refs = Object.fromEntries(["rootContainerName", "rootContainerWeight", "rootContainerVolume", "rootContainerLocation", "rootContainerNote"]
      .map(key => [key, { value: "test" }]));
    refs.saveRootContainerBtn = { disabled: false };
    assert.throws(() => saveRootContainerDialogAction({ state, refs, editingRootContainerId: editing ? "bag" : "",
      saveLayoutMutation: () => { throw error; },
      closeDialogWithoutRestoringFocus: () => assert.fail("must retain form"), render: () => assert.fail("must not render success")
    }), value => value === error);
  }
  for (const containerId of ["next-bag", ""]) {
    const refs = Object.fromEntries(["itemName", "itemWeight", "itemLocation", "itemNote"].map(key => [key, { value: "test" }]));
    refs.itemContainer = { value: containerId }; refs.saveItemBtn = { disabled: false };
    assert.throws(() => saveItemDialogAction({ refs, state: { items: { item: {} }, layouts: { layout: {} } },
      editingItemId: "item", itemDialogTargetLayoutId: "layout", getItemContainerIdInLayout: () => "previous-bag",
      placeExistingItemInLayout: () => true, saveLayoutMutation: () => { throw error; },
      closeDialogWithoutRestoringFocus: () => assert.fail("must retain form"), render: () => assert.fail("must not render success")
    }), value => value === error);
  }
  assert.equal(resolveSyncVisualState({ saveBlocked: true, loggedIn: true, forcedOffline: true }), "error");
  assert.equal(resolveSyncVisualState({ saveBlocked: true, message: "saving", loggedIn: true }), "error");
});

test("snapshot codec preserves all local fields without a second full business payload or prototype mutation", () => {
  const payload = { items: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [String(i), { name: `item-${i}`, weight: i }])) };
  const snapshot = { ...payload, localUi: { collapsed: ["bag"], active: null }, array: [1, null, {}] };
  const patch = encodePersonalSnapshot(payload, snapshot);
  assert.deepEqual(decodePersonalSnapshot(payload, patch), snapshot);
  assert.ok(JSON.stringify(patch).length < JSON.stringify(payload).length / 20);
  const hostile = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"x":1}}');
  assert.deepEqual(decodePersonalSnapshot({}, encodePersonalSnapshot({}, hostile)), hostile);
  assert.equal({}.polluted, undefined);
  assert.throws(() => decodePersonalSnapshot({}, [{ path: ["__proto__", "polluted"], value: true }]));
  const variants = [{ a: [1, 2], b: 3 }, { a: null }, { a: { x: true } }, {}];
  for (const a of variants) for (const b of variants) assert.deepEqual(decodePersonalSnapshot(a, encodePersonalSnapshot(a, b)), b);
});

test("confirmed compaction retains the exact last action and its dependency for the next save", async () => {
  const f = fixture();
  for (let i = 0; i < 30; i++) f.outbox.capture(f.input(i));
  const before = f.outbox.recover();
  assert.equal(f.outbox.compact().pending, true); assert.equal(f.values.size, 30);
  f.outbox.markApplied({ operationId: before.action.operationId, stateRevision: 35 });
  assert.equal(f.outbox.compact().pending, false);
  assert.equal(f.values.size, 3, "one action, one applied marker, one immutable checkpoint");
  assert.deepEqual(f.make().recover(), before);
  const next = f.make().capture(f.input(40));
  assert.equal(next.action.body.causal.baseOperationId, before.action.operationId);
  const calls = [];
  await f.make().drain({ queue: { run: async input => { calls.push(input); return {}; } }, getContext: () => f.context });
  assert.equal(calls.length, 3, "old discarded history is not repeatedly downloaded");
  assert.deepEqual(calls.map(call => call.operationId), [before.action.operationId, next.action.operationId, next.action.operationId]);
});

test("UI-only mirror preferences survive recovery without overriding durable entities or placement", () => {
  const saved = { items: {}, containers: {}, layouts: { a: { id: "a" } }, packedItems: {}, activeLayoutId: "a", showItemMeta: false };
  const mirror = { items: { deleted: { id: "deleted" } }, containers: { deleted: {} }, layouts: {},
    packedItems: { deleted: true }, activeLayoutId: "old", showItemMeta: true, collapsedContainers: { a: true } };
  const restored = personalSnapshotWithUiPreferences(saved, JSON.stringify(mirror));
  assert.deepEqual(restored, { ...saved, showItemMeta: true, collapsedContainers: { a: true } });
  assert.deepEqual(personalSnapshotWithUiPreferences(saved, "broken"), saved);
  assert.equal(saved.showItemMeta, false);
});

test("interrupted compaction at every deletion is restartable and cannot retire unconfirmed input", () => {
  for (const failAt of [0, 1, 2, 3, 4]) {
    const f = fixture();
    for (let i = 0; i < 4; i++) f.outbox.capture(f.input(i));
    const saved = f.outbox.recover(); f.outbox.markApplied({ operationId: saved.action.operationId, stateRevision: 9 });
    let count = 0; const remove = f.storage.removeItem;
    f.storage.removeItem = key => { if (count++ >= failAt) throw Error("interrupted"); remove(key); };
    f.outbox.compact();
    assert.deepEqual(f.make().recover(), saved);
    f.storage.removeItem = remove; f.make().compact(); assert.equal(f.values.size, 3);
    const newer = f.make().capture(f.input(50));
    assert.equal(f.make().compact().pending, true);
    assert.equal(f.make().recover().action.operationId, newer.action.operationId);
  }
});

test("failed checkpoint publication deletes nothing; a late stale branch remains present and blocked", () => {
  const f = fixture(); const first = f.outbox.capture(f.input(1)), second = f.outbox.capture(f.input(2));
  f.outbox.markApplied({ operationId: second.action.operationId, stateRevision: 7 });
  const original = new Map(f.values), write = f.storage.setItem;
  f.storage.setItem = () => { throw Error("quota"); };
  assert.equal(f.outbox.compact().pending, true); assert.deepEqual(f.values, original);
  f.storage.setItem = write; f.outbox.compact();
  const stale = { ...first, action: { ...first.action, operationId: crypto.randomUUID() } };
  const key = [...original.keys()].find(key => key.endsWith(first.action.operationId)).replace(first.action.operationId, stale.action.operationId);
  f.values.set(key, JSON.stringify(stale));
  assert.throws(f.make, { code: "fork" });
  assert.ok(f.values.has(key), "stale local data is not garbage-collected");
});

test("a fresh server baseline starts a new revision-checked action, never rewrites the old UUID or its body", async () => {
  const f = fixture(), first = f.outbox.capture(f.input(1));
  f.outbox.markApplied({ operationId: first.action.operationId, stateRevision: 6 });
  const remote = f.input(200);
  f.outbox.adoptRemoteBaseline({ ...remote, payload: remote.body.payload, stateRevision: 20, meta: { serverUpdatedAt: "confirmed" } });
  assert.deepEqual(f.make().recover().action, first.action);
  assert.deepEqual(f.make().recoverSnapshot(), remote.snapshot);
  assert.equal(f.make().baseline().stateRevision, 20);
  assert.throws(() => f.outbox.capture(f.input(300)), { code: "baseline" });
  const next = f.outbox.capture({ ...f.input(300), body: { ...f.input(300).body, baseStateRevision: 20 } });
  assert.notEqual(next.action.operationId, first.action.operationId);
  assert.equal(next.action.previousLocalOperationId, first.action.operationId);
  assert.deepEqual(next.action.body.causal, { dependsOn: [], reads: [] });
  const calls = [];
  await f.make().drain({ queue: { run: async input => { calls.push(input); return {}; } }, getContext: () => f.context });
  assert.deepEqual(calls.map(call => call.operationId), [next.action.operationId, next.action.operationId]);
  f.outbox.markApplied({ operationId: next.action.operationId, stateRevision: 21 });
  f.outbox.compact(); assert.equal(f.make().baseline(), null); assert.equal(f.values.size, 3);
});

test("pending changes, revision regression and quota block baseline adoption without changing saved action", () => {
  const f = fixture(), saved = f.outbox.capture(f.input(1)), remote = f.input(200);
  const input = { snapshot: remote.snapshot, payload: remote.body.payload, stateRevision: 20 };
  assert.throws(() => f.outbox.adoptRemoteBaseline(input), { code: "baseline" });
  f.outbox.markApplied({ operationId: saved.action.operationId, stateRevision: 6 });
  f.outbox.adoptRemoteBaseline(input);
  assert.throws(() => f.outbox.adoptRemoteBaseline({ ...input, stateRevision: 19 }), { code: "baseline" });
  f.storage.setItem = () => { throw Error("quota"); };
  assert.throws(() => f.outbox.adoptRemoteBaseline({ ...input, stateRevision: 21 }), { code: "quota" });
  assert.equal(f.make().baseline().stateRevision, 20); assert.deepEqual(f.make().recover(), saved);
});

function confirmedFixture() {
  const f = fixture();
  f.outbox.capture(f.input(1));
  const head = f.outbox.capture(f.input(2));
  f.outbox.markApplied({ operationId: head.action.operationId, stateRevision: 7 });
  f.outbox.compact();
  f.remote = revision => ({ snapshot: f.input(revision).snapshot, payload: f.input(revision).body.payload, stateRevision: revision });
  return f;
}

function beforeCheckpointWrite(f, callback) {
  const write = f.storage.setItem;
  f.storage.setItem = (key, value) => {
    if (key.endsWith(":anchor") || key.includes(":checkpoint:")) {
      f.storage.setItem = write;
      callback();
    }
    write(key, value);
  };
}

test("an older compaction cannot overwrite a concurrent newer remote baseline", () => {
  const f = confirmedFixture(), other = f.make();
  beforeCheckpointWrite(f, () => other.adoptRemoteBaseline(f.remote(20)));
  assert.throws(() => f.outbox.compact(), { code: "stale-tab" });
  assert.equal(f.make().baseline().stateRevision, 20);
  assert.equal(f.make().recoverSnapshot().items.a.weight, 20);
  f.make().compact();
  assert.equal(f.values.size, 3);
});

test("simultaneous baseline refreshes retain the highest server revision in either arrival order", () => {
  for (const [outer, inner] of [[15, 20], [20, 15]]) {
    const f = confirmedFixture(), other = f.make();
    beforeCheckpointWrite(f, () => other.adoptRemoteBaseline(f.remote(inner)));
    if (outer < inner) assert.throws(() => f.outbox.adoptRemoteBaseline(f.remote(outer)), { code: "stale-tab" });
    else assert.equal(f.outbox.adoptRemoteBaseline(f.remote(outer)), true);
    assert.equal(f.make().baseline().stateRevision, 20);
    assert.equal(f.make().recoverSnapshot().items.a.weight, 20);
    f.make().compact(); assert.equal(f.values.size, 3);
  }
});

test("a baseline change stales an editor even when its action head did not change", () => {
  const f = confirmedFixture(), stale = f.make();
  f.outbox.adoptRemoteBaseline(f.remote(20));
  const before = [...f.values];
  assert.throws(() => stale.capture(f.input(300)), { code: "stale-tab" });
  assert.deepEqual([...f.values], before);
});

test("delayed cleanup cannot lose a newer confirmed head or the new baseline behind it", () => {
  const f = confirmedFixture(), other = f.make();
  let next;
  beforeCheckpointWrite(f, () => {
    next = other.capture(f.input(3));
    other.markApplied({ operationId: next.action.operationId, stateRevision: 8 });
    other.compact();
    other.adoptRemoteBaseline(f.remote(20));
  });
  assert.throws(() => f.outbox.compact(), { code: "stale-tab" });
  assert.equal(f.make().recover().action.operationId, next.action.operationId);
  assert.equal(f.make().baseline().stateRevision, 20);
  f.make().compact(); assert.equal(f.values.size, 3);
});

test("a delayed newer server baseline remains authoritative across a newer local confirmed head", () => {
  const f = confirmedFixture(), other = f.make();
  let next;
  beforeCheckpointWrite(f, () => {
    next = other.capture(f.input(3));
    other.markApplied({ operationId: next.action.operationId, stateRevision: 8 });
    other.compact();
  });
  assert.throws(() => f.outbox.adoptRemoteBaseline(f.remote(20)), { code: "stale-tab" });
  const restored = f.make();
  assert.equal(restored.recover().action.operationId, next.action.operationId);
  assert.equal(restored.baseline().stateRevision, 20);
  assert.equal(restored.recoverSnapshot().items.a.weight, 20);
  restored.compact(); assert.equal(f.values.size, 3);
  const input = f.input(30); input.body.baseStateRevision = 20;
  const saved = restored.capture(input);
  assert.equal(saved.action.previousLocalOperationId, next.action.operationId);
  assert.equal(saved.action.body.baseStateRevision, 20);
});

test("concurrent compactions preserve a baseline and converge without making an editor stale", () => {
  const f = confirmedFixture(); f.outbox.adoptRemoteBaseline(f.remote(20));
  const other = f.make();
  beforeCheckpointWrite(f, () => other.compact());
  assert.equal(f.outbox.compact().pending, false);
  assert.equal(f.make().baseline().stateRevision, 20);
  f.outbox.compact(); assert.equal(f.values.size, 3);
  assert.ok(other.capture({ ...f.input(30), body: { ...f.input(30).body, baseStateRevision: 20 } }));
});

test("an adoption overlapping cleanup carries the baseline in either publication order", () => {
  for (const afterPublish of [false, true]) {
    const f = confirmedFixture(), other = f.make();
    const write = f.storage.setItem;
    f.storage.setItem = (key, value) => {
      f.storage.setItem = write;
      if (afterPublish) write(key, value);
      // Simulate the other tab's already prepared stale certificate, not a new
      // observation of the freshly published baseline.
      const old = [...f.values].find(([key]) => key.includes(":checkpoint:"));
      if (afterPublish) {
        const copy = JSON.parse(old[1]); delete copy.baseline;
        write(old[0].replace(/[^:]+$/, crypto.randomUUID()), JSON.stringify(copy));
      } else other.compact();
      if (!afterPublish) write(key, value);
    };
    f.outbox.adoptRemoteBaseline(f.remote(20));
    assert.equal(f.make().baseline().stateRevision, 20);
    f.make().compact(); assert.equal(f.values.size, 3);
  }
});

test("capture during compaction is never in that cleanup's retirement set", () => {
  const f = confirmedFixture(), other = f.make();
  let pending;
  beforeCheckpointWrite(f, () => { pending = other.capture(f.input(300)); });
  assert.throws(() => f.outbox.compact(), { code: "stale-tab" });
  assert.equal(f.make().recover().action.operationId, pending.action.operationId);
  assert.equal(f.make().recoverSnapshot().items.a.weight, 300);
  assert.equal(f.make().hasPending(), true);
});

test("a racing baseline adoption keeps a rejected capture recoverable without sending it", () => {
  const f = confirmedFixture(), other = f.make(), write = f.storage.setItem;
  const previous = f.outbox.recover();
  f.storage.setItem = (key, value) => {
    f.storage.setItem = write;
    other.adoptRemoteBaseline(f.remote(20));
    write(key, value);
  };
  assert.throws(() => f.outbox.capture(f.input(300)), { code: "stale-tab" });
  const pending = f.make().recover();
  assert.equal(pending.action.body.causal.baseOperationId, previous.action.operationId);
  assert.equal(f.make().recover().action.operationId, pending.action.operationId);
  assert.equal(f.make().baseline().stateRevision, 20);
  assert.equal(f.make().hasPending(), true);
});

test("every publication and deletion boundary is recoverable after reload", () => {
  const f = confirmedFixture();
  f.outbox.adoptRemoteBaseline(f.remote(20));
  f.outbox.capture({ ...f.input(30), body: { ...f.input(30).body, baseStateRevision: 20 } });
  f.outbox.capture(f.input(31));
  const head = f.outbox.recover(); f.outbox.markApplied({ operationId: head.action.operationId, stateRevision: 22 });
  const snapshots = [], write = f.storage.setItem, remove = f.storage.removeItem;
  f.storage.setItem = (key, value) => { write(key, value); snapshots.push(new Map(f.values)); };
  f.storage.removeItem = key => { remove(key); snapshots.push(new Map(f.values)); };
  f.outbox.compact();
  assert.ok(snapshots.length > 3);
  f.storage.setItem = write; f.storage.removeItem = remove;
  for (const snapshot of snapshots) {
    f.values.clear(); for (const entry of snapshot) f.values.set(...entry);
    assert.deepEqual(f.make().recover(), head);
    assert.equal(f.make().hasPending(), false);
    f.make().compact(); assert.equal(f.values.size, 3);
  }
});

test("a scan interrupted by another tab's compaction retries a consistent observation", () => {
  const f = confirmedFixture();
  for (let i = 0; i < 5; i++) f.outbox.capture(f.input(40 + i));
  const head = f.outbox.recover(); f.outbox.markApplied({ operationId: head.action.operationId, stateRevision: 30 });
  const keyAt = f.storage.key;
  f.storage.key = index => {
    if (index === 1) { f.storage.key = keyAt; f.outbox.compact(); }
    return keyAt(index);
  };
  assert.deepEqual(f.make().recover(), head);
  assert.equal(f.values.size, 3);
});

test("legacy singleton and applied markers remain readable but are never overwritten or deleted", () => {
  const f = confirmedFixture();
  const [checkpointKey, checkpoint] = [...f.values].find(([key]) => key.includes(":checkpoint:"));
  const legacyKey = checkpointKey.replace(/checkpoint:[^:]+$/, "anchor");
  f.values.set(legacyKey, checkpoint); f.values.delete(checkpointKey);
  const [appliedKey, applied] = [...f.values].find(([key]) => key.includes(":applied:"));
  f.values.set(appliedKey.replace(/:\d+$/, ""), applied); f.values.delete(appliedKey);
  const outbox = f.make();
  outbox.adoptRemoteBaseline(f.remote(20));
  const next = outbox.capture({ ...f.input(30), body: { ...f.input(30).body, baseStateRevision: 20 } });
  outbox.markApplied({ operationId: next.action.operationId, stateRevision: 21 }); outbox.compact();
  assert.equal(f.values.get(legacyKey), checkpoint);
  assert.equal(f.values.size, 4, "one read-only legacy singleton plus the new checkpoint/action/applied");
  assert.equal(f.make().recover().action.operationId, next.action.operationId);
});

test("same-revision contradictions and unrelated confirmed branches are retained and blocked", () => {
  for (const mismatch of ["payload", "branch", "generation"]) {
    const f = confirmedFixture(); f.outbox.adoptRemoteBaseline(f.remote(20));
    const [key, value] = [...f.values].find(([key]) => key.includes(":checkpoint:"));
    const copy = JSON.parse(value);
    if (mismatch === "payload") copy.baseline.payload.items.a.weight = 999;
    if (mismatch === "branch") { copy.operationId = crypto.randomUUID(); copy.generation++; copy.stateRevision++; }
    if (mismatch === "generation") copy.generation++;
    f.values.set(key.replace(/[^:]+$/, crypto.randomUUID()), JSON.stringify(copy));
    const before = [...f.values];
    assert.throws(f.make, { code: "storage" });
    assert.deepEqual([...f.values], before);
  }
});

test("conflicting applied revisions cannot overwrite each other, including a racing write", () => {
  const f = fixture(), head = f.outbox.capture(f.input(1)), other = f.make();
  const write = f.storage.setItem;
  f.storage.setItem = (key, value) => {
    f.storage.setItem = write;
    other.markApplied({ operationId: head.action.operationId, stateRevision: 8 });
    write(key, value);
  };
  assert.throws(() => f.outbox.markApplied({ operationId: head.action.operationId, stateRevision: 7 }), { code: "storage" });
  assert.deepEqual([...f.values].filter(([key]) => key.includes(":applied:")).map(([, value]) => JSON.parse(value).stateRevision).sort(), [7, 8]);
  assert.throws(f.make, { code: "storage" });
});

test("retirement evidence survives many compactions without retaining old large payloads", () => {
  const f = fixture();
  const first = f.outbox.capture(f.input(1));
  for (let i = 0; i < 40; i++) {
    const items = Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [String(index), { weight: i + index, name: `item-${index}` }]));
    const saved = f.outbox.capture({ snapshot: { items }, body: { payload: { items }, baseStateRevision: 5 } });
    f.outbox.markApplied({ operationId: saved.action.operationId, stateRevision: i + 7 });
    f.outbox.compact();
    assert.equal(f.values.size, 3);
  }
  const checkpoint = JSON.parse([...f.values].find(([key]) => key.includes(":checkpoint:"))[1]);
  assert.equal(checkpoint.retired.length, 40);
  assert.ok(checkpoint.retired.includes(first.action.operationId));
  assert.ok(JSON.stringify(checkpoint).length < 3000, "only IDs remain, not old full lists");
  assert.throws(() => f.outbox.capture({ ...f.input(100), operationId: first.action.operationId }), { code: "input" });
});

test("actual app pilot blocks legacy list writes and file upload bypasses before network access", async () => {
  const dependencies = { personalSavePilotEnabled: () => true, currentUser: { id: "actor-a" },
    isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, modeState: {} };
  const fetch = appFunction("apiFetch", dependencies);
  const upload = appFunction("apiUploadFormData", dependencies);
  await assert.rejects(fetch("/bike-packing/lists/list-a", { method: "PUT", body: "{}" }), /обход/);
  await assert.rejects(fetch("/bike-packing/lists", { method: "POST", body: "{}" }), /обход/);
  await assert.rejects(upload("/bike-packing/lists/list-a/photos", {}), /фотографиями/);
  assert.match(appSource, /hasPendingPersonalSave\(\) && !hasLocalSyncChanges\(\)/);
  assert.match(appSource, /outbox\.markApplied\(\{ operationId: record\.action\.operationId/);
});

test("declared deletion removes only its item and placements from the comparison baseline", () => {
  const base = { items: { a: { id: "a", containerId: "bag" }, b: { id: "b" } },
    containers: { bag: { id: "bag", itemIds: ["a"], order: [{ type: "item", id: "a" }] } },
    layouts: { layout: { arrangement: { items: { a: "bag", b: "bag" }, containers: { bag: { itemIds: ["a", "b"], order: [] } } } } } };
  const record = { action: { body: { userDeletion: { type: "item", id: "a" }, payload: { items: { b: base.items.b } } } } };
  const reference = personalDeletionReference(base, [record]);
  assert.deepEqual(Object.keys(reference.items), ["b"]);
  assert.equal(reference.layouts.layout.arrangement.items.a, undefined);
  assert.ok(base.items.a, "comparison cannot mutate the real baseline");
  assert.equal(preservesUndeletedEntities(reference, reference), true);
  assert.equal(preservesUndeletedEntities({ ...reference, items: {} }, reference), false);
  const lostPlacement = structuredClone(reference); lostPlacement.layouts.layout.arrangement.items = {};
  assert.equal(preservesUndeletedEntities(lostPlacement, reference), false);
  assert.equal(personalDeletionReference(base, []), null);
  assert.throws(() => personalDeletionReference(base, [{ action: { body: { userDeletion: { type: "item", id: "a" }, payload: base } } }]));
});

test("confirmed root deletion accounts for nested placements without authorizing deletion of its retained items", () => {
  const base = { items: { a: { id: "a", containerId: "child" } }, containers: {
    bag: { id: "bag", childIds: ["child"] }, child: { id: "child", parentId: "bag", itemIds: ["a"] } },
    layouts: { layout: { rootContainerIds: ["bag"], arrangement: { rootContainerIds: ["bag"],
      containers: { bag: { childIds: ["child"], itemIds: [] }, child: { parentId: "bag", childIds: [], itemIds: ["a"] } },
      items: { a: "child" }, packedItems: {} } } } };
  const reference = personalDeletionReference(base, [{ action: { body: { userDeletion: { type: "container", id: "bag" }, payload: { containers: {} } } } }]);
  assert.deepEqual(Object.keys(reference.containers), []);
  assert.ok(reference.items.a); assert.equal(reference.items.a.containerId, "");
  assert.equal(preservesUndeletedEntities({ ...reference, items: {} }, reference), false);
});

function deletionBatchFixture() {
  return { items: { a: { id: "a", containerId: "bag" }, b: { id: "b", containerId: "child" }, kept: { id: "kept" } },
    containers: { bag: { id: "bag", childIds: ["child", "nested"], itemIds: ["a"], order: [{ type: "item", id: "a" }] },
      child: { id: "child", parentId: "bag", itemIds: ["b"] }, nested: { id: "nested", parentId: "bag", nestable: true } },
    layouts: { layout: { rootContainerIds: ["bag"], arrangement: { rootContainerIds: ["bag"],
      containers: { bag: { childIds: ["child", "nested"], itemIds: ["a"], order: [{ type: "item", id: "a" }] },
        child: { parentId: "bag", itemIds: ["b"] }, nested: { parentId: "bag" } },
      items: { a: "bag", b: "child" }, itemQuantities: { a: 2, b: 3 }, packedItems: { a: true, b: true } } } },
    packedItems: { a: true, b: true }, collapsedContainers: { bag: true, child: true, nested: false } };
}

test("batch deletion prepares a frozen complete candidate, declares only its IDs and retains unrelated data", () => {
  const state = deletionBatchFixture(), before = structuredClone(state);
  const intent = { type: "batch", operations: ["a", "b"].map(id => ({ type: "item", id })) };
  const { snapshot, intent: frozen } = preparePersonalDeletionBatch(state, intent, {
    changedAt: "test-date", markEdited: (record, date) => { record.updatedAt = date; }
  });
  assert.deepEqual(state, before); assert.deepEqual(frozen, intent);
  assert.deepEqual(Object.keys(snapshot.items), ["kept"]);
  assert.deepEqual(snapshot.layouts.layout.arrangement.items, {});
  assert.deepEqual(snapshot.layouts.layout.arrangement.itemQuantities, {});
  assert.deepEqual(snapshot.packedItems, {}); assert.equal(snapshot.layouts.layout.updatedAt, "test-date");
  const reference = personalDeletionReference(state, [{ action: { body: { userDeletion: frozen, payload: snapshot } } }]);
  assert.equal(preservesUndeletedEntities(snapshot, reference), true);
  assert.equal(preservesUndeletedEntities({ ...snapshot, items: {} }, reference), false);
  intent.operations[0].id = "kept"; assert.equal(frozen.operations[0].id, "a");
  assert.throws(() => personalDeletionReference(state, [{ action: { body: { userDeletion: frozen, payload: before } } }]), /Снимок/);
});

test("whole batch preparation aborts for malformed targets or any deleted photo owner without touching the original", () => {
  const state = deletionBatchFixture(); state.containers.child.photos = [{ id: "cached-child" }];
  const before = structuredClone(state), intent = { type: "batch", operations: [{ type: "item", id: "a" }, { type: "container", id: "bag" }] };
  assert.throws(() => preparePersonalDeletionBatch(state, intent, { hasPhotos: record => Boolean(record.photos?.length) }), /фото/);
  assert.deepEqual(state, before);
  for (const invalid of [[], [{ type: "item", id: "a" }, { type: "item", id: "a" }],
    [{ type: "batch", operations: [{ type: "item", id: "a" }] }], [{ type: "item", id: " a " }],
    [{ type: "item", id: "__proto__" }], [{ type: "item", id: "missing" }], [{ type: "container", id: "child" }]]) {
    assert.throws(() => preparePersonalDeletionBatch(state, { type: "batch", operations: invalid }));
    assert.deepEqual(state, before);
  }
  delete state.containers.child.photos; state.containers.nested.photos = [{ id: "retained" }];
  const prepared = preparePersonalDeletionBatch(state, intent, { hasPhotos: record => Boolean(record.photos?.length) });
  assert.deepEqual(Object.keys(prepared.snapshot.containers), ["nested"]);
  assert.equal(prepared.snapshot.containers.nested.photos[0].id, "retained");
  assert.equal(prepared.snapshot.items.b.containerId, "");
});

test("a later explicit choice filters only retained deletions from a new batch intent", () => {
  const value = { type: "batch", operations: [{ type: "item", id: "a" }, { type: "container", id: "bag" }] };
  assert.deepEqual(retainedPersonalDeletionIntent(value, { items: { a: {} }, containers: {} }),
    { type: "batch", operations: [{ type: "container", id: "bag" }] });
  assert.equal(retainedPersonalDeletionIntent(value, { items: { a: {} }, containers: { bag: {} } }), null);
  assert.equal(value.operations.length, 2);
});

test("actual deletion adapter publishes one whole action and binds confirmation to its editor version", () => {
  const state = deletionBatchFixture(), f = fixture(), warnings = [], saved = [];
  let context = { actorId: "actor-a", generation: 1, scope: "personal" };
  const prepare = appFunction("preparePersonalCatalogDeletion", {
    personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor-a", isReadOnlyBikePackingContext: () => false,
    isAdminPublicEditScope: () => false, modeState: {}, personalSaveRecovery: { assertRunning() {} },
    personalDeletionIntent, personalSaveContext: () => context, showToast: message => warnings.push(message),
    localText: (en, ru) => ru, preparePersonalDeletionBatch, state, nowIso: () => "test-date", markEdited() {},
    personalPhotoFormUiEnabled: () => false,
    normalizeItemPhotos: record => record.photos || [], editingRootContainerId: null,
    persistStateSnapshot: (snapshot, { personalMutation, operationId }) => {
      assert.ok(state.items.a); assert.ok(state.items.b);
      saved.push(f.outbox.capture({ snapshot, operationId,
        body: { baseStateRevision: 5, payload: snapshot, userDeletion: personalMutation } }));
    },
    saveState: options => { assert.equal(options.recordAction, false); assert.equal(options.captureArrangement, false); }
  });
  const intent = { type: "batch", operations: ["a", "b"].map(id => ({ type: "item", id })) };
  const stale = prepare(intent); context = { ...context, generation: 2 };
  assert.equal(stale(), false); assert.ok(state.items.a); assert.equal(saved.length, 0);
  const commit = prepare(intent); assert.equal(commit(), true); assert.equal(commit(), false);
  assert.equal(saved.length, 1); assert.equal(f.values.size, 1);
  assert.deepEqual(f.make().recover().action.body.userDeletion, intent);
  assert.deepEqual(Object.keys(f.make().recover().snapshot.items), ["kept"]);
  assert.equal(warnings.length, 2);
});
