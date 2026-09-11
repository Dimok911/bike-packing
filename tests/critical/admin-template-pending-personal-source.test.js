import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pendingPersonalTemplateSource } from "../../src/sync/admin-template-pending-personal-source.js";
import { personalBusinessPayload } from "../../src/sync/personal-server-payload.js";
import { adminTemplateCopyPayloadDigest } from "../../src/sync/admin-template-copy-projection.js";

function fixture() {
  const binding = { environment: "bike-packing-experiment", actorId: "admin-a", listId: "personal-a", scopeKey: "id:admin-a" };
  const payload = { activeLayoutId: "layout", items: { item: { id: "item", name: "Pending name", quantity: 1, containerId: "" } }, containers: {},
    layouts: { layout: { id: "layout", rootContainerIds: [], arrangement: { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {} } } } };
  const record = { action: { ...binding, operationId: randomUUID(), kind: "list.update", generation: 2, body: { payload, baseStateRevision: 3 } }, snapshot: payload };
  return { binding, record, snapshot: personalBusinessPayload(payload) };
}

test("pending personal source freezes the saved body and UUID before hashing", async () => {
  const input = fixture(), before = structuredClone(input);
  const pending = pendingPersonalTemplateSource(input);
  input.record.action.body.payload.items.item.name = "Later edit"; input.record.action.operationId = randomUUID(); input.binding.listId = "other";
  const chosen = await pending;
  assert.deepEqual(chosen.payload, before.record.action.body.payload); assert.deepEqual(chosen.action, before.record.action);
  assert.deepEqual(chosen.source, { kind: "personal-list", listId: before.binding.listId,
    base: { operationId: before.record.action.operationId }, payloadDigest: await adminTemplateCopyPayloadDigest(before.record.action.body.payload) });
});

test("pending personal proof ignores only display fields and retains unknown business data", async () => {
  const input = fixture(); input.record.action.body.payload.items.item.customField = { durable: true };
  input.snapshot = personalBusinessPayload(input.record.action.body.payload);
  input.record.action.body.payload.showOnlyUnpacked = true;
  const chosen = await pendingPersonalTemplateSource(input);
  assert.deepEqual(chosen.payload.items.item.customField, { durable: true }); assert.equal(chosen.payload.showOnlyUnpacked, true);
  input.snapshot.items.item.customField.durable = false;
  await assert.rejects(pendingPersonalTemplateSource(input));
});

test("pending personal proof rejects unstored edits, wrong bindings and file/import result references", async () => {
  const changes = [
    input => { input.snapshot.items.item.name = "Unsaved"; },
    input => { input.record.action.actorId = "other"; },
    input => { input.record.action.listId = "other"; },
    input => { input.record.action.scopeKey = "id:other"; },
    input => { input.binding.environment = "production"; input.record.action.environment = "production"; },
    input => { input.record.action.kind = "list.import"; },
    input => { input.record.action.operationId = "bad"; },
    input => { input.record.photoState = {}; },
    input => { input.record.action.body.ownerResult = {}; },
    input => { input.record.action.body.publicImport = {}; },
    input => { input.record.action.body.serverImport = {}; },
    input => { delete input.record.action.body.payload.layouts.layout.arrangement; }
  ];
  for (const change of changes) { const input = fixture(); change(input); await assert.rejects(pendingPersonalTemplateSource(input)); }
});
