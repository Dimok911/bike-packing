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

test("explicit photo cancellation settles the original owner only after a matching permanent stage fence and retains its pending draft", async () => {
  const f = fixture(), plan = f.prepare(f.outbox, "attach"), file = f.fileFor(plan);
  file.fileMetadata = { hash: "a".repeat(64) }; file.thumbMetadata = null;
  const store = { read: async () => file }; await f.outbox.capturePhoto({ plan, store, getContext: f.getContext });
  const before = [...f.values], calls = [];
  const stageReceipt = { ok: true, historicalStageOnly: true, actionOperationId: plan.action.operationId,
    operation: { id: plan.action.body.assetId, state: "cancelled", environment: f.binding.environment, actorId: f.binding.actorId, listId: f.binding.listId,
      entityType: "item", entityId: "a", photoId: "added", payloadDigest: "c".repeat(64) },
    cancellation: { version: 1, stageOperationId: plan.action.body.assetId, fileHash: file.fileMetadata.hash, thumbHash: file.fileMetadata.hash,
      noAssetPublished: true, stageCannotPublish: true } };
  const rejected = f.proof(plan.action); rejected.operation.state = "rejected"; rejected.resultStatus = 409; rejected.rejectionCode = "photo_asset_not_ready";
  const queue = { inspect: async () => { throw Object.assign(Error("unknown"), { isOperationReceiptError: true }); },
    settleCancelledPhotoStage: async input => { calls.push(input); return rejected; } };
  const photoStaging = { cancel: async () => stageReceipt };
  const result = await f.outbox.cancelPhotoUpload({ queue, getContext: f.getContext, photoStore: store, photoStaging });
  assert.equal(result.ownerReceipt.operation.id, plan.action.operationId); assert.equal(result.fileRetained, true);
  assert.equal(calls[0].operationId, plan.action.operationId); assert.deepEqual(JSON.parse(calls[0].body), plan.action.body);
  assert.equal(f.outbox.hasPending(), true); assert.deepEqual([...f.values], before);
  stageReceipt.cancellation.stageCannotPublish = false;
  await assert.rejects(f.outbox.cancelPhotoUpload({ queue, getContext: f.getContext, photoStore: store, photoStaging }), { code: "photo-cancellation" });
  assert.equal(calls.length, 1); assert.deepEqual([...f.values], before);
});

test("a committed photo owner is never cancelled or relabelled absent and a switched editor cannot settle the old owner", async () => {
  const f = fixture(), plan = f.prepare(f.outbox, "attach"), file = f.fileFor(plan), store = { read: async () => file };
  await f.outbox.capturePhoto({ plan, store, getContext: f.getContext });
  const queue = { inspect: async () => f.proof(plan.action), settleCancelledPhotoStage: async () => assert.fail("no settlement") };
  const photoStaging = { cancel: async () => assert.fail("committed owner cannot cancel its stage") };
  const result = await f.outbox.cancelPhotoUpload({ queue, getContext: f.getContext, photoStore: store, photoStaging });
  assert.equal(result.alreadyPublished, true); assert.equal(f.outbox.hasPending(), true);
  queue.inspect = async () => { f.context.generation = "new-editor"; return f.proof(plan.action); };
  await assert.rejects(f.outbox.cancelPhotoUpload({ queue, getContext: f.getContext, photoStore: store, photoStaging }), { code: "context" });
});

async function rejectedPhotoFixture() {
  const f = fixture(), plan = f.prepare(f.outbox, "attach"), file = f.fileFor(plan), store = { read: async () => file };
  await f.outbox.capturePhoto({ plan, store, getContext: f.getContext });
  const rejected = action => { const proof = f.proof(action); proof.operation.state = "rejected"; proof.resultStatus = 409;
    proof.rejectionCode = action.kind === "photos.mutate" ? "photo_asset_not_ready" : "stale_state_revision"; return proof; };
  const proofs = new Map([[plan.action.operationId, rejected(plan.action)]]);
  const remote = { id: f.binding.listId, ownerId: f.binding.actorId, stateRevision: 6, payload: structuredClone(f.base) };
  remote.payload.items.a.name = "New server name";
  const options = { queue: { inspect: async input => proofs.get(input.operationId) }, getContext: f.getContext, readRemote: async () => remote };
  return { ...f, plan, file, store, remote, options, proofs, rejected };
}

test("rejected photo requires an explicit keep-current decision with a new CAS action and no replay of the photo manifest", async () => {
  const f = await rejectedPhotoFixture(), before = [...f.values];
  await assert.rejects(f.outbox.reconcile(f.options), { code: "photo-reconciliation" });
  assert.deepEqual([...f.values], before);
  const result = await f.outbox.reconcile({ ...f.options, resolveRejectedPhoto: async details => {
    assert.equal(details.photoOperationId, f.plan.action.operationId); assert.equal(details.localFilesRetained, true); return "keep-server";
  } });
  assert.notEqual(result.action.operationId, f.plan.action.operationId); assert.equal(result.action.kind, "list.update");
  assert.equal(result.action.previousLocalOperationId, f.plan.action.operationId);
  assert.equal(result.action.body.baseStateRevision, 6); assert.deepEqual(result.action.body.payload, f.remote.payload);
  assert.equal(result.action.body.assetId, undefined); assert.equal(result.action.body.photoId, undefined); assert.equal(result.action.body.action, undefined);
  assert.deepEqual(f.make(false).recover(), result); assert.equal(f.file.file.size, 16); assert.equal(f.outbox.hasPending(), true);
});

test("cancelled choices unknown receipts a switched editor and quota cannot discard a retained photo action", async () => {
  for (const mode of ["cancel", "unknown", "actor", "generation", "quota", "remote-owner", "disabled"]) {
    const f = await rejectedPhotoFixture(), before = [...f.values]; let choices = 0;
    if (mode === "unknown") f.options.queue.inspect = async () => { throw Error("unknown"); };
    if (mode === "quota") f.storage.setItem = () => { throw Error("quota"); };
    if (mode === "remote-owner") f.remote.ownerId = "other";
    await assert.rejects((mode === "disabled" ? f.make(false) : f.outbox).reconcile({ ...f.options, resolveRejectedPhoto: async () => {
      choices++; if (mode === "actor") f.context.actorId = "other";
      if (mode === "generation") f.context.generation = "new-editor";
      return mode === "cancel" ? "cancel" : "keep-server";
    } }));
    assert.deepEqual([...f.values], before, mode); assert.equal(f.file.file.size, 16);
    if (["unknown", "remote-owner", "disabled"].includes(mode)) assert.equal(choices, 0);
  }
});

test("a raced keep-current photo choice must be asked again against the newer server revision", async () => {
  const f = await rejectedPhotoFixture(), choices = [];
  const options = { ...f.options, resolveRejectedPhoto: async details => { choices.push(details.stateRevision); return "keep-server"; } };
  const first = await f.outbox.reconcile(options); f.proofs.set(first.action.operationId, f.rejected(first.action));
  f.remote.stateRevision = 7; f.remote.payload.items.a.name = "Even newer";
  const second = await f.outbox.reconcile(options);
  assert.deepEqual(choices, [6, 7]); assert.notEqual(first.action.operationId, second.action.operationId);
  assert.equal(second.action.body.baseStateRevision, 7); assert.equal(second.snapshot.items.a.name, "Even newer");
  assert.equal(second.reconciliation.decision.photoOperationId, f.plan.action.operationId); assert.deepEqual(f.make().recover(), second);
});

test("tampered photo cancellation decisions cannot smuggle a pending photo or change their acknowledged source", async () => {
  for (const mode of ["source", "file-retention", "payload", "manifest"]) {
    const f = await rejectedPhotoFixture();
    const result = await f.outbox.reconcile({ ...f.options, resolveRejectedPhoto: async () => "keep-server" });
    const key = [...f.values.keys()].find(value => value.endsWith(result.action.operationId)), raw = JSON.parse(f.values.get(key));
    if (mode === "source") raw.reconciliation.decision.photoOperationId = crypto.randomUUID();
    if (mode === "file-retention") raw.reconciliation.decision.localFilesRetained = false;
    if (mode === "payload") raw.action.body.payload.items.a.photos.push({ id: "smuggled", status: "pending" });
    if (mode === "manifest") raw.action.body.assetId = f.plan.action.body.assetId;
    f.values.set(key, JSON.stringify(raw)); assert.throws(() => f.make().recover(), { code: "storage" });
  }
});

test("exact terminal photo proof survives compaction later DB saves and a late older certificate without keeping old full snapshots", async () => {
  const f = await rejectedPhotoFixture();
  const decision = await f.outbox.reconcile({ ...f.options, resolveRejectedPhoto: async () => "keep-server" });
  const confirmed = f.proof(decision.action); confirmed.stateRevision = 7; f.proofs.set(decision.action.operationId, confirmed); f.remote.stateRevision = 7;
  await f.outbox.reconcile(f.options);
  const older = [...f.values].find(([key]) => key.includes(":checkpoint:"));
  const expected = f.proofs.get(f.plan.action.operationId);
  assert.deepEqual(f.outbox.photoRecoveryReferences().photoReceipts, [expected]);
  f.outbox.compact();
  assert.equal(f.outbox.list().some(record => record.action.operationId === f.plan.action.operationId), false);
  assert.deepEqual(f.make(false).photoRecoveryReferences().photoReceipts, [expected]);
  const next = structuredClone(f.remote.payload); next.items.a.name = "Later ordinary DB edit";
  const db = f.outbox.capture({ snapshot: next, body: { baseStateRevision: 7, payload: next } });
  f.outbox.markApplied({ operationId: db.action.operationId, stateRevision: 8 }); f.outbox.compact();
  f.values.set(older[0], older[1]);
  const reload = f.make(); assert.deepEqual(reload.photoRecoveryReferences().photoReceipts, [expected]);
  assert.equal(reload.recoverSnapshot().items.a.name, "Later ordinary DB edit");
  const raw = JSON.parse(older[1]); raw.photoReceipts[0].operation.payloadDigest = "b".repeat(64); f.values.set(older[0], JSON.stringify(raw));
  assert.throws(() => f.make().recover(), { code: "storage" });
});

test("photo receipt storage failure leaves the original action pending without half a terminal certificate", async () => {
  const f = await rejectedPhotoFixture();
  const decision = await f.outbox.reconcile({ ...f.options, resolveRejectedPhoto: async () => "keep-server" });
  const confirmed = f.proof(decision.action); confirmed.stateRevision = 7; f.proofs.set(decision.action.operationId, confirmed); f.remote.stateRevision = 7;
  const before = [...f.values]; f.storage.setItem = () => { throw Error("quota"); };
  await assert.rejects(f.outbox.reconcile(f.options), { code: "quota" });
  assert.deepEqual([...f.values], before); assert.equal(f.make().hasPending(), true);
  assert.deepEqual(f.make().photoRecoveryReferences().photoReceipts, []);
});

test("cached photo proof rejects foreign scope a future revision and malformed terminal status without erasing the journal", async () => {
  for (const mode of ["actor", "environment", "future", "status", "unrelated"]) {
    const f = await rejectedPhotoFixture();
    const decision = await f.outbox.reconcile({ ...f.options, resolveRejectedPhoto: async () => "keep-server" });
    const confirmed = f.proof(decision.action); confirmed.stateRevision = 7; f.proofs.set(decision.action.operationId, confirmed); f.remote.stateRevision = 7;
    await f.outbox.reconcile(f.options);
    const [key, value] = [...f.values].find(([key]) => key.includes(":checkpoint:")), raw = JSON.parse(value), proof = raw.photoReceipts[0];
    if (mode === "actor") proof.operation.actorId = "other";
    if (mode === "environment") proof.operation.environment = "production";
    if (mode === "future") proof.stateRevision = 999;
    if (mode === "status") proof.resultStatus = "409";
    if (mode === "unrelated") proof.operation.id = crypto.randomUUID();
    f.values.set(key, JSON.stringify(raw)); const before = [...f.values];
    assert.throws(() => f.make().recover(), { code: "storage" }); assert.deepEqual([...f.values], before);
  }
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
