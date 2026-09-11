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
  assert.deepEqual(chosen.payload, before.snapshot); assert.deepEqual(chosen.action, before.record.action);
  assert.notStrictEqual(chosen.payload.items.item, chosen.action.body.payload.items.item);
  assert.equal(chosen.action.body.payload.activeLayoutId, "layout");
  assert.equal(Object.hasOwn(chosen.payload, "activeLayoutId"), false);
  assert.deepEqual(chosen.source, { kind: "personal-list", listId: before.binding.listId,
    base: { operationId: before.record.action.operationId }, payloadDigest: await adminTemplateCopyPayloadDigest(before.snapshot) });
});

test("pending personal proof ignores only display fields and retains unknown business data", async () => {
  const input = fixture(); input.record.action.body.payload.items.item.customField = { durable: true };
  input.snapshot = personalBusinessPayload(input.record.action.body.payload);
  input.record.action.body.payload.showOnlyUnpacked = true;
  const chosen = await pendingPersonalTemplateSource(input);
  assert.deepEqual(chosen.payload.items.item.customField, { durable: true });
  assert.equal(Object.hasOwn(chosen.payload, "showOnlyUnpacked"), false);
  assert.equal(chosen.action.body.payload.showOnlyUnpacked, true);
  input.snapshot.items.item.customField.durable = false;
  await assert.rejects(pendingPersonalTemplateSource(input));
});

test("different legacy display mirrors produce the same pending business payload and digest", async () => {
  const input = fixture();
  input.record.action.body.payload.containers.bag = { id: "bag", name: "Bag" };
  input.record.action.body.payload.layouts.layout.arrangement.items.item = { containerId: "", order: 0 };
  input.record.action.body.payload.layouts.layout.arrangement.packedItems.item = false;
  input.snapshot = personalBusinessPayload(input.record.action.body.payload);
  const legacy = structuredClone(input), payload = legacy.record.action.body.payload;
  Object.assign(payload, { activeLayoutId: "obsolete-layout", packedItems: { item: true },
    collapsedContainers: { bag: true }, itemDisplayMode: "compact", showItemMeta: false,
    showFilterContext: false, collectionMode: { active: true }, showOnlyUnpacked: true });
  Object.assign(payload.items.item, { containerId: "obsolete-bag", parentContainerId: "obsolete-bag" });
  Object.assign(payload.containers.bag, { parentId: "obsolete-parent", parentContainerId: "obsolete-parent",
    containerId: "obsolete-parent", itemIds: ["item"], childIds: ["obsolete-child"], order: 50 });
  const before = structuredClone(legacy);
  const original = await pendingPersonalTemplateSource(input), mirrored = await pendingPersonalTemplateSource(legacy);
  assert.deepEqual(mirrored.payload, original.payload);
  assert.equal(mirrored.source.payloadDigest, original.source.payloadDigest);
  assert.equal(mirrored.payload.layouts.layout.arrangement.packedItems.item, false);
  assert.deepEqual(mirrored.action, before.record.action);
  assert.notDeepEqual(mirrored.action.body.payload, original.action.body.payload);
  assert.deepEqual(legacy, before);
});

test("arrangement and unknown business changes cannot reuse a pending source digest or stale proof", async () => {
  const input = fixture(), payload = input.record.action.body.payload;
  payload.layouts.layout.arrangement.items.item = { containerId: "", order: 0 };
  payload.layouts.layout.arrangement.packedItems.item = false;
  payload.layouts.layout.arrangement.itemQuantities.item = 1;
  payload.items.item.customField = { durable: true };
  payload.customBusiness = { value: "original" };
  input.snapshot = personalBusinessPayload(payload);
  const original = await pendingPersonalTemplateSource(input);
  for (const mutate of [
    value => { value.layouts.layout.arrangement.items.item.order = 1; },
    value => { value.layouts.layout.arrangement.packedItems.item = true; },
    value => { value.layouts.layout.arrangement.itemQuantities.item = 2; },
    value => { value.items.item.customField.durable = false; },
    value => { value.customBusiness.value = "changed"; }
  ]) {
    const changed = structuredClone(input);
    mutate(changed.record.action.body.payload);
    await assert.rejects(pendingPersonalTemplateSource(changed), /Ожидающая личная версия/);
    changed.snapshot = personalBusinessPayload(changed.record.action.body.payload);
    const chosen = await pendingPersonalTemplateSource(changed);
    assert.notEqual(chosen.source.payloadDigest, original.source.payloadDigest);
    assert.equal(chosen.source.payloadDigest, await adminTemplateCopyPayloadDigest(chosen.payload));
    assert.deepEqual(chosen.payload, changed.snapshot);
    assert.deepEqual(chosen.action, changed.record.action);
  }
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

test("pending personal source rejects a photo-dependent update without a direct photo record", async () => {
  const input = fixture(), predecessorId = randomUUID();
  input.record.action.body.payload.items.item.photos = [{ id: "pending-photo", listId: input.binding.listId, status: "pending" }];
  input.record.action.body.photoResults = { version: 5, operationId: predecessorId,
    owners: [{ entityType: "item", entityId: "item" }] };
  input.record.action.body.causal = { baseOperationId: predecessorId, reads: [],
    dependsOn: [{ operationId: predecessorId, listId: input.binding.listId }] };
  input.snapshot = personalBusinessPayload(input.record.action.body.payload);
  const before = structuredClone(input);
  assert.equal(Object.hasOwn(input.record, "photoState"), false);
  await assert.rejects(pendingPersonalTemplateSource(input), /Ожидающая личная версия/);
  assert.deepEqual(input, before);
});

test("pending personal source rejects sharing whose result differs from its saved input", async () => {
  const input = fixture();
  input.record.action.body.shareLink = { version: 1, id: `shared-entity-link-${input.record.action.operationId}`,
    mode: "live", scope: "list", entityType: "", entityId: "", layoutId: "", title: "Saved link",
    description: "", includeAuthor: false, authorName: "" };
  const before = structuredClone(input);
  await assert.rejects(pendingPersonalTemplateSource(input), /Ожидающая личная версия/);
  assert.deepEqual(input, before);
});

test("pending personal source rejects reserved result markers even when empty or falsy", async () => {
  for (const field of ["photoResults", "ownerResult", "shareLink", "historyRestore", "archiveImport",
    "guestImport", "publicImport", "serverImport", "migration"]) {
    for (const value of [{}, null, false]) {
      const input = fixture(); input.record.action.body[field] = value;
      await assert.rejects(pendingPersonalTemplateSource(input), /Ожидающая личная версия/, field);
    }
  }
  for (const value of [{}, null, false]) {
    const input = fixture(); input.record.photoState = value;
    await assert.rejects(pendingPersonalTemplateSource(input), /Ожидающая личная версия/, "photoState");
  }
});

test("pending personal source still preserves an ordinary dependent DB deletion and its exact hash", async () => {
  const input = fixture(), predecessorId = randomUUID();
  delete input.record.action.body.payload.items.item;
  input.record.action.body.userDeletion = { type: "item", id: "item" };
  input.record.action.body.causal = { baseOperationId: predecessorId, reads: [],
    dependsOn: [{ operationId: predecessorId, listId: input.binding.listId }] };
  input.snapshot = personalBusinessPayload(input.record.action.body.payload);
  const before = structuredClone(input), chosen = await pendingPersonalTemplateSource(input);
  assert.deepEqual(chosen.action, before.record.action);
  assert.deepEqual(chosen.payload, before.snapshot);
  assert.equal(chosen.source.payloadDigest, await adminTemplateCopyPayloadDigest(before.snapshot));
  assert.deepEqual(input, before);
});
