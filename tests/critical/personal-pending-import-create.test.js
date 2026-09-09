import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { importPhotoChainFixture } from "./personal-import-photo-chain-fixture.js";
import { createPersonalPendingImportCreateSession, preparePersonalPendingImportCreate } from "../../src/sync/personal-pending-import-create.js";
import { personalPhotoFormManifest } from "../../src/sync/personal-photo-form-protocol.js";
import { personalImportPendingPhotoFormChain } from "../../src/sync/personal-import-pending-photo-chain.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";

const payloadOf = record => record.photoState?.payload || record.action.body.payload;
function input(f, entityType = "item", placed = true) {
  const head = f.outbox.recover(), base = payloadOf(head), entityId = `new-${randomUUID()}`;
  const layout = Object.values(base.layouts).find(layout => layout.arrangement?.containers?.[f.bag]);
  assert.ok(layout);
  return { binding: f.binding, snapshot: head.snapshot, basePayload: base, baseStateRevision: head.action.body.baseStateRevision,
    parentOperationId: head.action.operationId, created: true, entityType, entityId,
    fields: { name: `New ${entityType}`, weight: 23, color: "", location: "Дом", category: "", categories: [], note: "", dimensions: null,
      createdAt: "2026-09-10T01:00:00Z", updatedAt: "2026-09-10T01:00:00Z", updatedByDeviceId: "device", updatedByDeviceName: "Windows",
      ...(entityType === "item" ? { quantity: 1 } : { volume: 0, nestable: true }) },
    ...(placed ? entityType === "item" ? { formContext: { version: 1, availabilityStatus: "available",
      placement: { targetLayout: structuredClone(layout), targetContainerId: f.bag, quantity: 3, layoutFields: {} } } }
      : { containerFormContext: { version: 1, targetLayout: structuredClone(layout), sourceLayout: null,
        targetParentId: f.bag, targetIndex: null, layoutFields: {} } } : {}) };
}
const session = (f, options = {}) => createPersonalPendingImportCreateSession({ outbox: f.outbox, store: f.store, getContext: f.getContext,
  enabled: true, itemContextEnabled: true, containerContextEnabled: true,
  onDurable: record => assert.deepEqual(f.make(false).recover(), record), ...options });

for (const kind of ["guest", "archive"]) for (const fileless of [false, true]) for (const type of ["item", "container"])
test(`${kind} pending creation ${type}, fileless=${fileless}: one durable owner and placement without rewriting import or files`, async () => {
  const f = await importPhotoChainFixture(kind, fileless), before = structuredClone(f.root), files = structuredClone([...f.native]);
  assert.equal(f.native.size, fileless ? 0 : 1);
  const request = input(f, type), form = session(f), saving = form.submit(request);
  assert.equal(form.submit({ ...request, fields: { name: "different click" } }), saving);
  request.fields.name = "changed after click";
  const record = await saving, owner = record.action.body.payload[type === "item" ? "items" : "containers"][request.entityId];
  assert.equal(owner.name, `New ${type}`); assert.deepEqual(owner.photos, []);
  assert.equal(record.action.kind, "list.update"); assert.equal(record.action.body.photoResults.version, kind === "guest" ? 4 : 3);
  const targetId = (request.formContext?.placement || request.containerFormContext).targetLayout.id;
  const layout = record.action.body.payload.layouts[targetId];
  if (type === "item") { assert.equal(layout.arrangement.items[request.entityId], f.bag); assert.equal(layout.arrangement.itemQuantities[request.entityId], 3); }
  else assert.equal(layout.arrangement.containers[request.entityId].parentId, f.bag);
  assert.deepEqual(f.outbox.list().find(row => row.action.operationId === f.root.action.operationId), before);
  assert.deepEqual([...f.native], files);
  const cold = f.make(false), chain = personalImportPendingPhotoFormChain({ records: cold.list(), operationId: record.action.operationId, listId: f.binding.listId });
  assert.equal(chain.importKind, kind); assert.equal(chain.head.action.operationId, record.action.operationId);
});

for (const kind of ["guest", "archive"]) test(`${kind} quota keeps the new owner draft and all original import files`, async () => {
  const f = await importPhotoChainFixture(kind), before = [...f.values], files = structuredClone([...f.native]), request = input(f);
  const form = session(f, { onDurable: () => assert.fail("quota must not close the form") });
  f.storage.setItem = () => { throw new DOMException("full", "QuotaExceededError"); };
  await assert.rejects(form.submit(request)); assert.deepEqual([...f.values], before); assert.deepEqual([...f.native], files);
  const recovery = form.recoveryCopy(); assert.equal(recovery.preview.items[request.entityId].name, "New item");
  assert.equal(recovery.automaticImportAllowed, false);
});

for (const kind of ["guest", "archive"]) for (const key of ["actorId", "generation"])
test(`${kind} pending creation stops when ${key} changes during file inventory inspection`, async () => {
  const f = await importPhotoChainFixture(kind), before = [...f.values], request = input(f), form = session(f);
  let release; f.store.ids = () => new Promise(resolve => { release = () => resolve([...f.native.keys()]); });
  const saving = form.submit(request); assert.equal(typeof release, "function"); f.context[key] = "changed"; release();
  await assert.rejects(saving); assert.deepEqual([...f.values], before);
  assert.equal(Boolean(form.recoveryCopy()), key === "generation");
});

test("pending creation cannot reuse a deleted import owner or cross owner kinds, and empty photo operations remain invalid", async () => {
  const f = await importPhotoChainFixture("guest"), request = input(f, "item", false);
  assert.throws(() => preparePersonalPendingImportCreate({ ...request, entityId: f.bag }, { enabled: true }));
  const deletion = preparePersonalDeletionBatch(payloadOf(f.root), { type: "item", id: f.item });
  f.outbox.capture({ snapshot: deletion.snapshot, body: { payload: deletion.snapshot, baseStateRevision: 7,
    userDeletion: { type: "item", id: f.item } } });
  const before = [...f.values], replacement = input(f, "item", false); replacement.entityId = f.item;
  await assert.rejects(session(f).submit(replacement)); assert.deepEqual([...f.values], before);
  assert.throws(() => personalPhotoFormManifest({ version: 1, action: "form", entityType: "item", entityId: request.entityId,
    baseStateRevision: 7, baseEntityRevision: 0, fields: { name: "new" }, changes: [] }));
  assert.throws(() => preparePersonalPendingImportCreate(request));
});
