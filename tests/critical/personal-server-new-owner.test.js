import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { serverPhotoChainFixture } from "./personal-server-photo-chain-fixture.js";
import { createPersonalPendingPhotoFormSession } from "../../src/sync/personal-pending-photo-form-session.js";
import { createPersonalPendingImportCreateSession } from "../../src/sync/personal-pending-import-create.js";
import { personalServerPendingPhotoFormChain } from "../../src/sync/personal-server-pending-photo-chain.js";
import { personalPhotoFormManifest } from "../../src/sync/personal-photo-form-protocol.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";
import { createListOperationQueue } from "../../src/sync/list-operation-queue.js";
import { createPersonalPhotoStaging } from "../../src/sync/personal-photo-staging.js";
import { personalPhotoRecoveryCancellationHead } from "../../src/sync/personal-photo-recovery-cancel.js";
import { createPersonalPhotoActionStore } from "../../src/sync/personal-photo-action-store.js";

const payloadOf = record => record.photoState?.payload || record.action.body.payload;
function request(f, type, photos) {
  const head = f.outbox.recover(), base = payloadOf(head), layout = Object.values(base.layouts).find(value => value.arrangement?.containers?.[f.bag]);
  return { binding: f.binding, snapshot: head.snapshot, basePayload: base, baseStateRevision: head.action.body.baseStateRevision,
    parentOperationId: head.action.operationId, entityType: type, entityId: `new-${randomUUID()}`, created: true,
    fields: { name: `Created ${type}`, weight: 31, createdAt: "2026-09-10T01:00:00Z",
      ...(type === "item" ? { quantity: 1 } : { nestable: true }) },
    ...(photos ? { files: [{ fileName: "created.png", file: new Blob(["created server photo"], { type: "image/png" }) }] } : {}),
    ...(type === "item" ? { formContext: { version: 1, availabilityStatus: "available",
      placement: { targetLayout: structuredClone(layout), targetContainerId: f.bag, quantity: 3, layoutFields: {} } } }
      : { containerFormContext: { version: 1, targetLayout: structuredClone(layout), sourceLayout: null,
        targetParentId: f.bag, targetIndex: null, layoutFields: {} } }) };
}
function session(f, photos, overrides = {}) {
  return (photos ? createPersonalPendingPhotoFormSession : createPersonalPendingImportCreateSession)({ outbox: f.outbox,
    store: f.store, getContext: f.getContext, enabled: true, serverEnabled: true, serverNewOwnerEnabled: true,
    itemContextEnabled: true, containerContextEnabled: true, onDurable: record => assert.deepEqual(f.make(false).recover(), record), ...overrides });
}

for (const fileless of [false, true]) for (const photos of [false, true]) for (const type of ["item", "container"])
test(`server creation ${type}, root fileless=${fileless}, new files=${photos}: exact placement, cold recovery and deletion`, async () => {
  const f = await serverPhotoChainFixture(fileless), root = structuredClone(f.root), native = structuredClone([...f.native]);
  f.outbox = f.make(true, { serverNewOwnerFormEnabled: true, itemContextEnabled: true, containerContextEnabled: true });
  const input = request(f, type, photos), form = session(f, photos), saving = form.submit(input);
  assert.equal(form.submit(input), saving); const result = await saving, record = photos ? result.record : result;
  assert.deepEqual(f.outbox.list().find(row => row.action.operationId === root.action.operationId), root);
  for (const [id, value] of native) assert.deepEqual(f.native.get(id), value);
  assert.equal(f.native.size, native.length + Number(photos));
  if (photos) {
    assert.equal(record.action.body.ownerResult.version, 7); assert.equal(record.action.body.ownerResult.owner, null);
    assert.equal(record.action.body.baseEntityRevision, null); assert.equal(personalPhotoFormManifest(record.action.body).created, true);
  } else { assert.equal(record.action.kind, "list.update"); assert.equal(record.action.body.photoResults.version, 12); }
  const payload = payloadOf(record), layout = Object.values(payload.layouts).find(value => value.arrangement?.containers?.[f.bag]);
  assert.equal(payload[type === "item" ? "items" : "containers"][input.entityId].photos.length, Number(photos));
  if (type === "item") { assert.equal(layout.arrangement.items[input.entityId], f.bag); assert.equal(layout.arrangement.itemQuantities[input.entityId], 3); }
  else assert.equal(layout.arrangement.containers[input.entityId].parentId, f.bag);
  const changed = structuredClone(payload); changed[type === "item" ? "items" : "containers"][input.entityId].weight++;
  const edit = f.outbox.capture({ snapshot: changed, body: { payload: changed, baseStateRevision: 7 } });
  assert.equal(edit.action.body.photoResults.version, photos ? 14 : 12);
  const deletion = preparePersonalDeletionBatch(changed, { type, id: input.entityId });
  const removed = f.outbox.capture({ snapshot: deletion.snapshot, body: { payload: deletion.snapshot, baseStateRevision: 7, userDeletion: deletion.intent } });
  const selection = { records: f.make(false).list(), operationId: removed.action.operationId, listId: f.binding.listId };
  assert.ok(personalServerPendingPhotoFormChain(selection));
  assert.equal(personalServerPendingPhotoFormChain({ ...selection, entityType: type, entityId: input.entityId }), null);
  assert.equal(personalServerPendingPhotoFormChain({ ...selection, entityType: type, entityId: input.entityId, allowNewOwner: true }), null);
  assert.ok(personalServerPendingPhotoFormChain({ ...selection, entityType: type, entityId: `fresh-${randomUUID()}`, allowNewOwner: true }));
});

for (const photos of [false, true]) for (const failure of ["quota", "actorId", "generation"])
test(`server creation files=${photos} retains the complete form on ${failure}`, async () => {
  const f = await serverPhotoChainFixture(), before = [...f.values], native = structuredClone([...f.native]);
  f.outbox = f.make(true, { serverNewOwnerFormEnabled: true, itemContextEnabled: true, containerContextEnabled: true });
  const input = request(f, "item", photos), form = session(f, photos, { onDurable: () => assert.fail("The form must stay open") });
  let release;
  if (failure === "quota") f.storage.setItem = () => { throw new DOMException("full", "QuotaExceededError"); };
  else f.store.ids = () => new Promise(resolve => { release = () => resolve([...f.native.keys()]); });
  const saving = form.submit(input), rejected = assert.rejects(saving);
  if (failure !== "quota") { assert.equal(typeof release, "function"); f.context[failure] = "changed"; release(); }
  await rejected; assert.deepEqual([...f.values], before);
  for (const [id, value] of native) assert.deepEqual(f.native.get(id), value);
  assert.equal(f.native.size, native.length + Number(photos && failure === "quota"));
  const recovery = form.recoveryCopy();
  if (failure === "actorId") assert.equal(recovery, null);
  else { assert.equal(recovery.preview.items[input.entityId].name, input.fields.name); assert.equal(recovery.files.length, Number(photos)); }
});

for (const photos of [false, true]) test(`server creation files=${photos} cannot borrow guest/archive gates or an existing owner ID`, async () => {
  const f = await serverPhotoChainFixture(), before = [...f.values], native = structuredClone([...f.native]);
  const input = request(f, "item", photos);
  await assert.rejects(session(f, photos, { serverEnabled: false, serverNewOwnerEnabled: false, importEnabled: true, importNewOwnerEnabled: true }).submit(input));
  await assert.rejects(session(f, photos).submit({ ...input, entityId: f.bag }));
  assert.deepEqual([...f.values], before); assert.deepEqual([...f.native], native);
});

async function captured() {
  const f = await serverPhotoChainFixture();
  f.outbox = f.make(true, { serverNewOwnerFormEnabled: true, itemContextEnabled: true, containerContextEnabled: true });
  const { record } = await session(f, true).submit(request(f, "item", true));
  const payload = structuredClone(record.photoState.payload); payload.items[record.action.body.entityId].weight++;
  const edit = f.outbox.capture({ snapshot: payload, body: { payload, baseStateRevision: 7 } });
  return { ...f, record, edit };
}

test("native server form capture and stage claim check their own gates before writing IndexedDB", async () => {
  const f = await captured();
  for (const disabled of ["serverEnabled", "serverPhotoFormEnabled", "serverNewOwnerFormEnabled"]) {
    const store = createPersonalPhotoActionStore({ ...f.binding, getContext: f.getContext, enabled: true, batchEnabled: true,
      formEnabled: true, serverEnabled: true, serverPhotoFormEnabled: true, serverNewOwnerFormEnabled: true, [disabled]: false,
      indexedDB: { open: () => assert.fail("A disabled native writer must not open IndexedDB") } });
    const saved = await f.store.read(f.record.action.operationId);
    await assert.rejects(store.captureForm(saved), { code: "server-form-disabled" });
    // Supply the exact decoded durable record to isolate the claim write gate.
    store.read = f.store.read;
    await assert.rejects(store.claimStage(f.record.action.operationId, saved.files[0].stage.operationId), { code: "server-form-disabled" });
  }
});

test("server v7/v14 writer gates and missing capability stop sending, cancellation and native-file claims", async () => {
  const f = await captured(), calls = [], locks = { request: async (_key, run) => run() };
  const capabilities = ["personalListCausalOperationsV1", "personalListOperationCancellationV1", "personalCausalPhotoPublicationV1",
    "personalCausalPhotoFormV1", "personalCausalPhotoFormOwnerResultV1", "personalCausalPhotoFormDescendantsV1",
    "personalCausalServerImportV1", "personalCausalServerDescendantsV1", "personalCausalServerEntitiesV1", "personalCausalServerPhotoFormsV1",
    "personalStagedPhotoAssetsV1", "personalStagedPhotoCancellationV1", "personalCausalPhotoContainerFormContextV1", "personalCausalPhotoItemFormContextV1"];
  const transport = { experiment: true, writes: [], apiUrl: path => path, prepare: async () => {}, assertWritable() {},
    beginWrite: () => assert.fail("An unsupported form must not claim transport"), confirmWrite: () => true };
  const fetchImpl = async (path, options) => {
    calls.push(path); assert.equal(options.method, "GET");
    return new Response(JSON.stringify(path === "/auth/me" ? { user: { id: f.binding.actorId } }
      : path === "/bike-packing/capabilities" ? { capabilities } : { ok: true, operation: { id: path.split("/").at(-1), state: "unknown" } }));
  };
  const gates = { transport, fetchImpl, locks, getContext: f.getContext, enabled: true, cancellationEnabled: true,
    photoEnabled: true, photoFormEnabled: true, formOwnerResultEnabled: true, pendingFormUpdateEnabled: true,
    serverPhotoFormEnabled: true, serverImportEnabled: true, 
    itemContextEnabled: true, containerContextEnabled: true };
  for (const record of [f.record, f.edit]) for (const enabled of [false, true]) for (const method of ["run", "cancelExact"]) {
    calls.length = 0;
    const action = record.action, input = { path: `/bike-packing/lists/list${action.kind === "photos.mutate" ? "/photos/mutate" : ""}`,
      method: action.kind === "photos.mutate" ? "POST" : "PUT", operationId: action.operationId, body: JSON.stringify(action.body) };
    await assert.rejects(createListOperationQueue({ ...gates, serverNewOwnerFormEnabled: enabled })[method](input), { isOperationReceiptError: true });
    if (enabled) assert.ok(calls.includes("/bike-packing/capabilities"), `${method}: ${JSON.stringify(calls)}`); else assert.deepEqual(calls, []);
  }
  const action = f.record.action, attachment = action.body.changes[0], stageId = attachment.assetId;
  const store = { binding: f.binding, readStage: async () => ({ binding: f.binding, action, stage: { operationId: stageId, ...attachment },
    fileMetadata: { hash: "a".repeat(64) }, intentHash: "b".repeat(64) }), claimStage: () => assert.fail("An unsupported form must not claim bytes") };
  for (const enabled of [false, true]) for (const method of ["stage", "cancel"]) {
    calls.length = 0;
    await assert.rejects(createPersonalPhotoStaging({ ...gates, store, batchEnabled: true, formEnabled: true,
      serverEnabled: true, serverNewOwnerFormEnabled: enabled })[method](action.operationId, stageId), { isPhotoStagingBlocked: true });
    if (enabled) assert.ok(calls.includes("/bike-packing/capabilities")); else assert.deepEqual(calls, []);
  }
});

for (const laterExistingForm of [false, true]) test("disabled new server owners stop the entire retained chain, later existing form=" + laterExistingForm, async () => {
  const f = await captured();
  if (laterExistingForm) {
    const parent = f.outbox.recover(), base = payloadOf(parent);
    const saved = await session(f, true).submit({ binding: f.binding, snapshot: parent.snapshot, basePayload: base,
      baseStateRevision: 7, parentOperationId: parent.action.operationId, entityType: "container", entityId: f.bag, created: false,
      fields: { name: "Existing bag after new owner" },
      files: [{ fileName: "later.png", file: new Blob(["later exact bytes"], { type: "image/png" }) }] });
    assert.equal(saved.record.action.body.ownerResult.version, 6);
    const payload = structuredClone(payloadOf(saved.record)); payload.containers[f.bag].weight = 71;
    f.edit = f.outbox.capture({ snapshot: payload, body: { payload, baseStateRevision: 7 } });
    assert.equal(f.edit.action.body.photoResults.version, 13);
  }
  const options = { batchEnabled: true, formEnabled: true, editEnabled: true, formOwnerResultEnabled: true,
    serverEnabled: true,  serverPhotoFormEnabled: true, 
    pendingFormUpdateEnabled: true, records: f.outbox.list() };
  assert.equal(personalPhotoRecoveryCancellationHead(f.edit, { ...options, serverNewOwnerFormEnabled: true }), true);
  assert.equal(personalPhotoRecoveryCancellationHead(f.edit, { ...options, serverNewOwnerFormEnabled: false }), false);
  const outbox = f.make(true, { serverNewOwnerFormEnabled: false, photoBatchCancellationEnabled: true });
  assert.deepEqual(outbox.recover(), f.edit); const before = [...f.values], native = structuredClone([...f.native]);
  const unexpected = () => assert.fail("The disabled chain must not touch the network");
  const queue = { inspect: unexpected, run: unexpected, cancelExact: unexpected }, staging = { inspect: unexpected, stage: unexpected, cancel: unexpected };
  await assert.rejects(outbox.drain({ queue, getContext: f.getContext, photoStore: f.store, photoStaging: staging }), { code: "server-photo-form-disabled" });
  await assert.rejects(outbox.cancelPhotoUpload({ queue, getContext: f.getContext, photoStore: f.store, photoStaging: staging }), { code: "server-photo-form-disabled" });
  assert.deepEqual([...f.values], before); assert.deepEqual([...f.native], native);
});
