import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { PERSONAL_PHOTO_OUTBOX_ENABLED } from "../../src/sync/personal-photo-outbox-record.js";
import { createPersonalSaveRecovery } from "../../src/sync/personal-save-recovery.js";
import { inspectPersonalPhotoRecovery } from "../../src/sync/personal-photo-recovery-inventory.js";

const photo = (id, status = "synced") => ({ id, photoId: id, assetId: crypto.randomUUID(), status });
function fixture() {
  const values = new Map(), binding = { actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a", environment: "bike-packing-experiment" };
  const context = { ...binding, scope: "personal", generation: "editor-1" };
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = enabled => createPersonalSaveOutbox({ storage, ...binding, photoEnabled: enabled ?? true });
  const outbox = make(), base = { items: { a: { id: "a", weight: 100, photos: [photo("first"), photo("second")] } }, containers: {}, layouts: {} };
  outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 5 });
  const prepare = (target = outbox, action = "order", revision = 5) => {
    const payload = structuredClone(base), body = { version: 1, action, entityType: "item", entityId: "a", baseStateRevision: revision,
      baseEntityRevision: revision, expectedPhotoIds: ["first", "second"] };
    if (action === "order") { body.photoIds = ["second", "first"]; payload.items.a.photos.reverse(); }
    else if (action === "delete") { Object.assign(body, { photoId: "first", assetId: base.items.a.photos[0].assetId, basePhotoRevision: 3 }); payload.items.a.photos.shift(); }
    else { const added = photo("added", "pending"); Object.assign(body, { photoId: "added", assetId: added.assetId, index: 2 }); payload.items.a.photos.push(added); }
    return target.preparePhoto({ snapshot: { ...structuredClone(payload), localUi: "photos" }, payload, body, operationId: crypto.randomUUID() });
  };
  const fileFor = plan => ({ binding, intentHash: "a".repeat(64), action: structuredClone(plan.action), snapshot: structuredClone(plan.snapshot),
    stage: { operationId: plan.action.body.assetId, photoId: plan.action.body.photoId, entityId: "a", entityType: "item" }, file: new Blob(["exact local file"], { type: "image/png" }) });
  const proof = action => ({ historicalOnly: true, operation: { id: action.operationId, environment: binding.environment, actorId: binding.actorId,
    kind: action.kind, listId: binding.listId, state: "committed", payloadDigest: "d".repeat(64) }, stateRevision: 6, resultStatus: 200, rejectionCode: null });
  return { values, binding, context, storage, make, outbox, base, prepare, fileFor, proof, getContext: () => context };
}

test("photo outbox is gated and a pure photo candidate cannot include an unrelated edit or a cross-list copy", async () => {
  assert.equal(PERSONAL_PHOTO_OUTBOX_ENABLED, false);
  const f = fixture(); assert.throws(() => f.prepare(f.make(false)), { code: "photo-disabled" });
  const plan = f.prepare(); const body = { ...plan.action.body }; delete body.causal;
  for (const change of [p => p.items.a.weight++, p => p.items.a.photos.pop(), p => p.items.a.photos[0].assetId = crypto.randomUUID()]) {
    const payload = structuredClone(plan.payload); change(payload);
    assert.throws(() => f.outbox.preparePhoto({ snapshot: payload, payload, body }), { code: "photo-record" });
  }
  assert.equal(f.values.size, 0);
  const copied = photo("copied", "pending"), copyPayload = structuredClone(f.base); copyPayload.items.a.photos.push(copied);
  assert.throws(() => f.outbox.preparePhoto({ snapshot: copyPayload, payload: copyPayload, body: { ...body, action: "copy", photoId: copied.id,
    assetId: copied.assetId, index: 2, source: { listId: "other-list", photoId: "original", assetId: crypto.randomUUID(), photoRevision: 4 } } }), { code: "photo-composite" });
});

test("photo order joins the DB predecessor and blocks later saves until an atomic current-state certificate is stored", async () => {
  const f = fixture();
  const db = f.outbox.capture({ snapshot: f.base, body: { baseStateRevision: 5, payload: f.base } });
  assert.throws(() => f.prepare(), { code: "photo-base" });
  f.outbox.markApplied({ operationId: db.action.operationId, stateRevision: 6 });
  const plan = f.prepare(f.outbox, "order", 6), record = await f.outbox.capturePhoto({ plan, getContext: f.getContext });
  assert.equal(record.action.generation, 2); assert.equal(record.action.body.causal.baseOperationId, db.action.operationId);
  assert.deepEqual(f.make(false).recover(), record, "disabled writer can still read version-three photo records");
  assert.throws(() => f.outbox.capture({ snapshot: f.base, body: { baseStateRevision: 6, payload: f.base } }), { code: "photo-pending" });
  assert.throws(() => f.outbox.markApplied({ operationId: record.action.operationId, stateRevision: 7 }), { code: "photo-checkpoint" });
  const calls = [], queue = { run: async input => { calls.push(input); return { list: { id: "list-a", payload: plan.payload, stateRevision: 7 } }; },
    inspect: async input => ({ ...f.proof(input.operationId === db.action.operationId ? db.action : record.action), stateRevision: input.operationId === db.action.operationId ? 6 : 7 }) };
  await f.outbox.drain({ queue, getContext: f.getContext });
  assert.deepEqual(calls.map(input => input.path), ["/bike-packing/lists/list-a", "/bike-packing/lists/list-a/photos/mutate", "/bike-packing/lists/list-a/photos/mutate"]);
  assert.equal(calls[0].receiptOnly, true); assert.equal(calls[1].receiptOnly, true);
  const adopted = await f.outbox.reconcile({ queue, getContext: f.getContext,
    readRemote: async () => ({ id: "list-a", ownerId: "actor-a", stateRevision: 7, payload: plan.payload }) });
  assert.equal(adopted.adoptedBaseline, true); assert.equal(f.make().hasPending(), false);
  assert.deepEqual(f.make().recoverSnapshot(), plan.payload);
  const nextPayload = structuredClone(plan.payload); nextPayload.items.a.weight++;
  const next = f.outbox.capture({ snapshot: nextPayload, body: { baseStateRevision: 7, payload: nextPayload } });
  assert.equal(next.action.previousLocalOperationId, record.action.operationId); assert.equal(next.action.body.causal.baseOperationId, undefined);
  assert.deepEqual(f.make().recover(), next);
});

test("attachment dispatch requires the exact durable file before stage receipt and owner publication", async () => {
  const f = fixture(), plan = f.prepare(f.outbox, "attach"), saved = f.fileFor(plan);
  const store = { read: async () => saved };
  const record = await f.outbox.capturePhoto({ plan, store, getContext: f.getContext });
  const calls = [], queue = { run: async input => { calls.push("publish"); assert.equal(input.operationId, plan.action.operationId); return { list: { id: "list-a" } }; } };
  const staging = { stage: async id => { calls.push("stage"); return { historicalStageOnly: true, actionOperationId: id,
    operation: { id: plan.action.body.assetId }, asset: { id: plan.action.body.assetId, state: "ready" } }; } };
  await assert.rejects(f.outbox.drain({ queue, getContext: f.getContext }), { code: "photo-file" });
  await assert.rejects(f.make(false).drain({ queue, getContext: f.getContext, photoStore: store, photoStaging: staging }), { code: "photo-disabled" });
  assert.deepEqual(calls, []);
  await f.make().drain({ queue, getContext: f.getContext, photoStore: store, photoStaging: staging });
  assert.deepEqual(calls, ["stage", "publish", "publish"]); assert.deepEqual(f.make().recover(), record);
  saved.intentHash = "b".repeat(64); calls.length = 0;
  await assert.rejects(f.make().drain({ queue, getContext: f.getContext, photoStore: store, photoStaging: staging }), { code: "photo-record" });
  assert.deepEqual(calls, []); assert.equal(f.make().hasPending(), true);
});

test("quota or another tab between durable file capture and queue registration preserves the file and frozen draft without sending", async () => {
  for (const mode of ["quota", "context", "tab", "mismatch", "missing"]) {
    const f = fixture(), plan = f.prepare(f.outbox, "attach"), saved = f.fileFor(plan), before = [...f.values];
    const store = { read: async () => {
      if (mode === "quota") f.storage.setItem = () => { throw Error("quota"); };
      if (mode === "context") f.context.generation = "changed";
      if (mode === "tab") f.make().capture({ snapshot: f.base, body: { baseStateRevision: 5, payload: f.base } });
      if (mode === "mismatch") saved.action.body.index = 0;
      return mode === "missing" ? null : saved;
    } };
    await assert.rejects(f.outbox.capturePhoto({ plan, store, getContext: f.getContext }), error => error.isPersonalSaveBlocked
      && JSON.stringify(error.unconfirmedMemoryDraft) === JSON.stringify(plan.snapshot), mode);
    assert.equal(saved.file.size, 16);
    if (mode !== "tab") assert.deepEqual([...f.values], before);
    else assert.equal(f.make().recover().action.kind, "list.update");
  }
});

test("an unconfirmed file stage never permits publication and a rejected photo cannot be silently rebased to a new UUID", async () => {
  const f = fixture(), plan = f.prepare(f.outbox, "attach"), store = { read: async () => f.fileFor(plan) };
  const record = await f.outbox.capturePhoto({ plan, store, getContext: f.getContext });
  const before = [...f.values], queue = { run: async () => assert.fail("not permitted"),
    inspect: async () => ({ ...f.proof(record.action), resultStatus: 409, rejectionCode: "stale_state_revision",
      operation: { ...f.proof(record.action).operation, state: "rejected" } }) };
  await assert.rejects(f.outbox.drain({ queue, getContext: f.getContext, photoStore: store, photoStaging: { stage: async () => ({}) } }), { code: "photo-stage" });
  await assert.rejects(f.outbox.reconcile({ queue, getContext: f.getContext }), { code: "photo-reconciliation" });
  assert.deepEqual([...f.values], before);
});

test("photo baseline quota is atomic and corrupt local photo manifest stops recovery without erasure", async () => {
  const f = fixture(), plan = f.prepare(), record = await f.outbox.capturePhoto({ plan, getContext: f.getContext });
  const before = [...f.values]; f.storage.setItem = () => { throw Error("quota"); };
  await assert.rejects(f.outbox.reconcile({ getContext: f.getContext, queue: { inspect: async () => f.proof(record.action) },
    readRemote: async () => ({ id: "list-a", ownerId: "actor-a", stateRevision: 6, payload: plan.payload }) }), { code: "quota" });
  assert.deepEqual([...f.values], before); assert.equal(f.make().hasPending(), true);
  const [key, value] = before[0], bad = JSON.parse(value); bad.photoState.payload.items.a.weight++;
  f.values.set(key, JSON.stringify(bad)); assert.throws(f.make, { code: "photo-record" }); assert.equal(f.values.size, 1);
});

test("the real recovery wrapper preserves the outbox receiver for photo preparation and atomic capture", async () => {
  const f = fixture(), wrapped = createPersonalSaveRecovery().outbox(() => f.outbox, f.binding.scopeKey), plan = f.prepare(wrapped);
  const record = await wrapped.capturePhoto({ plan, getContext: f.getContext });
  assert.equal(record.action.kind, "photos.mutate"); assert.deepEqual(wrapped.recover(), record);
});

test("read-only photo inventory separates unlinked files from matching pending actions without giving dispatch authority", async () => {
  const f = fixture(), plan = f.prepare(f.outbox, "attach"), file = f.fileFor(plan);
  const store = { binding: f.binding, ids: async () => [plan.action.operationId], read: async () => file };
  const inspect = () => inspectPersonalPhotoRecovery({ outbox: f.outbox, store, getContext: f.getContext });
  const before = [...f.values], orphan = await inspect();
  assert.equal(orphan.entries[0].state, "unlinked"); assert.equal(orphan.needsRecovery, true); assert.deepEqual([...f.values], before);
  await f.outbox.capturePhoto({ plan, store, getContext: f.getContext });
  const linked = await inspect(); assert.equal(linked.entries[0].state, "linked"); assert.equal(linked.needsRecovery, false);
  assert.equal(linked.automaticDispatchAllowed, false); assert.equal(linked.entries[0].dispatchAllowed, false);
  file.intentHash = "b".repeat(64);
  assert.equal((await inspect()).entries[0].state, "link-mismatch");
  store.read = async () => { throw Object.assign(Error("bad bytes"), { code: "missing-or-corrupt-bytes" }); };
  assert.equal((await inspect()).entries[0].state, "corrupt-file");
  store.ids = async () => [];
  assert.equal((await inspect()).entries[0].state, "missing-file"); assert.equal(f.outbox.hasPending(), true);
});

test("photo inventory never silently accepts changing file/head sets or a switched account during its asynchronous scan", async () => {
  for (const change of ["ids", "head", "context"]) {
    const f = fixture(), plan = f.prepare(f.outbox, "attach"), file = f.fileFor(plan); let scanned = false;
    const store = { binding: f.binding, ids: async () => scanned && change === "ids" ? [] : [plan.action.operationId], read: async () => {
      scanned = true;
      if (change === "head") f.make().capture({ snapshot: f.base, body: { baseStateRevision: 5, payload: f.base } });
      if (change === "context") f.context.actorId = "other";
      return file;
    } };
    await assert.rejects(inspectPersonalPhotoRecovery({ outbox: f.outbox, store, getContext: f.getContext }));
    assert.equal(file.file.size, 16);
  }
});

test("compaction never turns a retained file into resend permission or claims its retired UUID alone is a server receipt", async () => {
  const f = fixture(), plan = f.prepare(f.outbox, "attach"), file = f.fileFor(plan);
  const store = { binding: f.binding, ids: async () => [plan.action.operationId], read: async () => file };
  const record = await f.outbox.capturePhoto({ plan, store, getContext: f.getContext });
  const remote = structuredClone(plan.payload); remote.items.a.photos.at(-1).status = "synced";
  await f.outbox.reconcile({ queue: { inspect: async () => f.proof(record.action) }, getContext: f.getContext,
    readRemote: async () => ({ id: "list-a", ownerId: "actor-a", stateRevision: 6, payload: remote }) });
  remote.items.a.weight++;
  const next = f.outbox.capture({ snapshot: remote, body: { payload: remote, baseStateRevision: 6 } });
  f.outbox.markApplied({ operationId: next.action.operationId, stateRevision: 7 }); f.outbox.compact();
  const inventory = await inspectPersonalPhotoRecovery({ outbox: f.outbox, store, getContext: f.getContext });
  assert.equal(inventory.entries[0].state, "retired-needs-proof"); assert.equal(inventory.needsRecovery, true);
  assert.equal(inventory.automaticDispatchAllowed, false); assert.equal(file.file.size, 16);
});
