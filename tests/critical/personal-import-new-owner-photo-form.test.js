import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { importPhotoChainFixture } from "./personal-import-photo-chain-fixture.js";
import { createPersonalPendingPhotoFormSession } from "../../src/sync/personal-pending-photo-form-session.js";
import { preparePersonalPendingPhotoForm } from "../../src/sync/personal-pending-photo-form-plan.js";
import { personalPhotoFormManifest } from "../../src/sync/personal-photo-form-protocol.js";
import { personalImportPendingPhotoFormChain } from "../../src/sync/personal-import-pending-photo-chain.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";
import { createListOperationQueue } from "../../src/sync/list-operation-queue.js";
import { createPersonalPhotoStaging } from "../../src/sync/personal-photo-staging.js";

const payloadOf = record => record.photoState?.payload || record.action.body.payload;
function request(f, entityType) {
  const parent = f.outbox.recover(), basePayload = payloadOf(parent), entityId = `new-${randomUUID()}`;
  const layout = Object.values(basePayload.layouts).find(value => value.arrangement?.containers?.[f.bag]);
  return { binding: f.binding, snapshot: parent.snapshot, basePayload, baseStateRevision: parent.action.body.baseStateRevision,
    parentOperationId: parent.action.operationId, entityType, entityId, created: true,
    fields: { name: `New ${entityType} with photo`, weight: 31, createdAt: "2026-09-10T01:00:00Z",
      ...(entityType === "item" ? { quantity: 1 } : { nestable: true }) },
    files: [{ fileName: "created.png", file: new Blob(["created photo"], { type: "image/png" }) }],
    ...(entityType === "item" ? { formContext: { version: 1, availabilityStatus: "available",
      placement: { targetLayout: structuredClone(layout), targetContainerId: f.bag, quantity: 3, layoutFields: {} } } }
      : { containerFormContext: { version: 1, targetLayout: structuredClone(layout), sourceLayout: null,
        targetParentId: f.bag, targetIndex: null, layoutFields: {} } }) };
}

for (const kind of ["guest", "archive"]) for (const fileless of [false, true]) for (const type of ["item", "container"])
test(`${kind} fileless=${fileless}: one immutable new ${type} form owns fields, placement and new bytes`, async () => {
  const f = await importPhotoChainFixture(kind, fileless), original = structuredClone(f.root), originalFiles = structuredClone([...f.native]);
  f.outbox = f.make(true, { importNewOwnerFormEnabled: true, itemContextEnabled: true, containerContextEnabled: true });
  const input = request(f, type), form = createPersonalPendingPhotoFormSession({ outbox: f.outbox, store: f.store, getContext: f.getContext,
    enabled: true, importEnabled: true, importNewOwnerEnabled: true, itemContextEnabled: true, containerContextEnabled: true,
    onDurable: record => assert.deepEqual(f.make(false).recover(), record) });
  const saving = form.submit(input); assert.equal(form.submit(input), saving);
  const { record } = await saving;
  assert.equal(record.action.body.ownerResult.version, 4); assert.equal(record.action.body.ownerResult.owner, null);
  assert.equal(record.action.body.baseEntityRevision, null); assert.equal(personalPhotoFormManifest(record.action.body).created, true);
  assert.deepEqual(f.outbox.list()[0], original); for (const [id, value] of originalFiles) assert.deepEqual(f.native.get(id), value);
  assert.equal(f.native.size, originalFiles.length + 1);
  const next = structuredClone(record.photoState.payload); next[type === "item" ? "items" : "containers"][input.entityId].weight = 32;
  const edit = f.outbox.capture({ snapshot: next, body: { payload: next, baseStateRevision: input.baseStateRevision } });
  assert.equal(edit.action.body.photoResults.version, 10);
  const chain = personalImportPendingPhotoFormChain({ records: f.make(false).list(), operationId: edit.action.operationId, listId: f.binding.listId });
  assert.equal(chain.importKind, kind); assert.equal(chain.forms.length, 2);
  const deletion = preparePersonalDeletionBatch(edit.action.body.payload, { type, id: input.entityId });
  const removed = f.outbox.capture({ snapshot: deletion.snapshot, body: { payload: deletion.snapshot, baseStateRevision: input.baseStateRevision, userDeletion: deletion.intent } });
  const selection = { records: f.make(false).list(), operationId: removed.action.operationId, listId: f.binding.listId };
  assert.ok(personalImportPendingPhotoFormChain(selection));
  assert.equal(personalImportPendingPhotoFormChain({ ...selection, entityType: type, entityId: input.entityId }), null);
  assert.equal(personalImportPendingPhotoFormChain({ ...selection, entityType: type, entityId: input.entityId, allowNewOwner: true }), null);
  assert.ok(personalImportPendingPhotoFormChain({ ...selection, entityType: type, entityId: `fresh-${randomUUID()}`, allowNewOwner: true }));
});

test("new import photo form requires its own gate and an absent owner", async () => {
  const f = await importPhotoChainFixture("guest"), input = request(f, "item"), options = { enabled: true, importEnabled: true,
    importNewOwnerEnabled: true, itemContextEnabled: true, containerContextEnabled: true };
  const full = { ...input, importOperationId: f.root.action.operationId, importKind: "guest" };
  assert.throws(() => preparePersonalPendingPhotoForm(full, { ...options, importNewOwnerEnabled: false }));
  assert.throws(() => preparePersonalPendingPhotoForm({ ...full, entityId: f.item }, options));
  assert.throws(() => preparePersonalPendingPhotoForm({ ...full, entityId: f.bag }, options));
  assert.throws(() => preparePersonalPendingPhotoForm({ ...full, files: [], photoIds: [] }, options));
});

async function captured(kind) {
  const f = await importPhotoChainFixture(kind);
  f.outbox = f.make(true, { importNewOwnerFormEnabled: true, itemContextEnabled: true, containerContextEnabled: true });
  const form = createPersonalPendingPhotoFormSession({ outbox: f.outbox, store: f.store, getContext: f.getContext,
    enabled: true, importEnabled: true, importNewOwnerEnabled: true, itemContextEnabled: true, containerContextEnabled: true, onDurable: () => {} });
  const { record } = await form.submit(request(f, "item"));
  const next = structuredClone(record.photoState.payload); next.items[record.action.body.entityId].weight++;
  const edit = f.outbox.capture({ snapshot: next, body: { payload: next, baseStateRevision: 7 } });
  return { ...f, record, edit };
}

for (const kind of ["guest", "archive"]) for (const failure of ["quota", "actorId", "generation"])
test(`${kind} ${failure} preserves a complete new-owner form and the original import`, async () => {
  const f = await importPhotoChainFixture(kind), before = [...f.values], native = structuredClone([...f.native]);
  f.outbox = f.make(true, { importNewOwnerFormEnabled: true, itemContextEnabled: true, containerContextEnabled: true });
  const form = createPersonalPendingPhotoFormSession({ outbox: f.outbox, store: f.store, getContext: f.getContext,
    enabled: true, importEnabled: true, importNewOwnerEnabled: true, itemContextEnabled: true, containerContextEnabled: true,
    onDurable: () => assert.fail("A blocked form must remain open") });
  let release;
  if (failure === "quota") f.storage.setItem = () => { throw new DOMException("full", "QuotaExceededError"); };
  else f.store.ids = () => new Promise(resolve => { release = () => resolve([...f.native.keys()]); });
  const input = request(f, "item"), saving = form.submit(input);
  if (failure !== "quota") { assert.equal(typeof release, "function"); f.context[failure] = "changed"; release(); }
  await assert.rejects(saving); assert.deepEqual([...f.values], before);
  for (const [id, value] of native) assert.deepEqual(f.native.get(id), value);
  assert.equal(f.native.size, native.length + Number(failure === "quota"));
  const copy = form.recoveryCopy();
  if (failure === "actorId") assert.equal(copy, null);
  else { assert.equal(copy.preview.items[input.entityId].name, input.fields.name); assert.equal(await copy.files[0].file.text(), "created photo"); }
});

for (const kind of ["guest", "archive"]) test(`${kind} v4/v10 gates and missing capability prevent every write or native file claim`, async () => {
  const f = await captured(kind), calls = [], locks = { request: async (_key, run) => run() };
  const capabilities = ["personalListCausalOperationsV1", "personalListOperationCancellationV1", "personalCausalPhotoPublicationV1",
    "personalCausalPhotoFormV1", "personalCausalPhotoFormOwnerResultV1", "personalCausalPhotoFormDescendantsV1", "personalCausalGuestImportV1",
    "personalCausalArchiveImportV1", "personalCausalArchivePhotoImportV1", "personalStagedPhotoAssetsV1", "personalStagedPhotoCancellationV1",
    "personalCausalGuestDescendantsV1", "personalCausalArchiveDescendantsV1", "personalCausalImportPhotoFormsV1",
    "personalCausalPhotoContainerFormContextV1", "personalCausalPhotoItemFormContextV1"];
  const transport = { experiment: true, writes: [], apiUrl: path => path, prepare: async () => {}, assertWritable() {},
    beginWrite: () => assert.fail("Unsupported new owners must not claim transport"), confirmWrite: () => true };
  const fetchImpl = async (path, options) => {
    calls.push(path); assert.equal(options.method, "GET");
    return new Response(JSON.stringify(path === "/auth/me" ? { user: { id: f.binding.actorId } }
      : path === "/bike-packing/capabilities" ? { capabilities } : { ok: true, operation: { id: path.split("/").at(-1), state: "unknown" } }));
  };
  const gates = { transport, fetchImpl, locks, getContext: f.getContext, enabled: true, cancellationEnabled: true,
    photoEnabled: true, photoFormEnabled: true, formOwnerResultEnabled: true, pendingFormUpdateEnabled: true,
    importPhotoFormEnabled: true, guestImportEnabled: true, archiveImportEnabled: true, archivePhotoImportEnabled: true,
    itemContextEnabled: true, containerContextEnabled: true };
  for (const record of [f.record, f.edit]) for (const enabled of [false, true]) for (const method of ["run", "cancelExact"]) {
    calls.length = 0;
    const action = record.action, input = { path: `/bike-packing/lists/list${action.kind === "photos.mutate" ? "/photos/mutate" : ""}`,
      method: action.kind === "photos.mutate" ? "POST" : "PUT", operationId: action.operationId, body: JSON.stringify(action.body) };
    await assert.rejects(createListOperationQueue({ ...gates, importNewOwnerFormEnabled: enabled })[method](input), { isOperationReceiptError: true });
    if (enabled) assert.ok(calls.includes("/bike-packing/capabilities"), `${method} ${action.body.ownerResult?.version || action.body.photoResults?.version}: ${JSON.stringify(calls)}`); else assert.deepEqual(calls, []);
  }
  const action = f.record.action, attachment = action.body.changes[0], stageId = attachment.assetId;
  const store = { binding: f.binding, readStage: async () => ({ binding: f.binding, action, stage: { operationId: stageId, ...attachment },
    fileMetadata: { hash: "a".repeat(64) }, intentHash: "b".repeat(64) }), claimStage: () => assert.fail("Unsupported new owners must not claim bytes") };
  for (const enabled of [false, true]) for (const method of ["stage", "cancel"]) {
    calls.length = 0;
    await assert.rejects(createPersonalPhotoStaging({ ...gates, store, batchEnabled: true, formEnabled: true,
      guestEnabled: true, archiveEnabled: true, importNewOwnerFormEnabled: enabled })[method](action.operationId, stageId), { isPhotoStagingBlocked: true });
    if (enabled) assert.ok(calls.includes("/bike-packing/capabilities")); else assert.deepEqual(calls, []);
  }
});
