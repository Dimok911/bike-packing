import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { wholeCopyFixture } from "../fixtures/admin-template-photo-whole-copy-fixture.js";
import { wholeRecordInput } from "../fixtures/admin-template-photo-whole-copy-record-fixture.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";
import { assertAdminTemplatePhotoCopyEditor } from "../../src/sync/admin-template-photo-copy-record.js";
import { allocateAdminTemplatePhotoWholeCopySelection } from "../../src/public/admin-template-photo-whole-copy-selection.js";
import { prepareAdminTemplatePhotoWholeCopyForm } from "../../src/public/admin-template-photo-whole-copy-flow.js";
import { prepareAdminTemplatePhotoWholeCopyRecord } from "../../src/sync/admin-template-photo-whole-copy-record.js";
import { adminTemplateCopyPayloadDigest } from "../../src/sync/admin-template-copy-projection.js";
import { adminTemplatePhotoCopyReference } from "../../src/sync/admin-template-photo-copy-protocol.js";
import { adminTemplatePhotoWholeCopySourceReference, adminTemplatePhotoWholeCopySourceArrangement } from "../../src/sync/admin-template-photo-whole-copy-source.js";
import { projectAdminTemplatePhotoWholeCopyPayload, adminTemplatePhotoWholeCopySourceInventory } from "../../src/sync/admin-template-photo-whole-copy-projection.js";

function legacyFixture() {
  const f = wholeCopyFixture(); delete f.sourcePayload.layouts["source-layout"].arrangement.itemQuantities;
  for (const type of ["items", "containers"]) for (const owner of Object.values(f.sourcePayload[type])) {
    for (const photo of owner.photos || []) { photo.localId = photo.id ?? photo.photoId; photo.error = ""; }
  }
  return f;
}

test("published legacy source reaches typed whole record without changing raw bytes or digest", async () => {
  const f = legacyFixture(), payload = f.sourcePayload, before = structuredClone(payload), digest = await adminTemplateCopyPayloadDigest(payload);
  const binding = { environment: "bike-packing-experiment", actorId: "public-source-admin", listId: f.sourceListId, itemKey: "demo-state:whole-source" };
  const metadata = { title: "Published source", description: "Confirmed", language: "en" }, layoutId = "public-source-editor";
  const server = { exists: true, visibility: "public", stateRevision: 111, payload, metadata };
  const layout = { id: layoutId, adminDemo: true, adminDemoListId: binding.listId, adminDemoLanguage: "en" };
  assert.throws(() => projectAdminTemplateServerVariant(layout, server, randomUUID(), { photoBinding: binding, photoOwnerMapEnabled: true }));
  const projected = projectAdminTemplateServerVariant(layout, server, randomUUID(), { photoBinding: binding, photoOwnerMapEnabled: true, allowPublicSource: true });
  projected.layout.templatePublished = true;
  projected.layout.adminCausalSource = { ...projected.layout.adminCausalSource, version: 1, binding, exists: true, visibility: "public",
    deleted: false, base: { stateRevision: 111 }, planId: null };
  const source = { layoutId, metadata, ownerMap: projected.layout.adminCausalSource.photoOwnerMap,
    beforeState: { activeLayoutId: layoutId, layouts: { [layoutId]: projected.layout }, items: projected.items, containers: projected.containers,
      locations: structuredClone(payload.locations), categories: structuredClone(payload.categories), packedItems: structuredClone(projected.layout.arrangement.packedItems) } };
  const proof = { binding, revision: 111, payload, side: source };
  assert.throws(() => assertAdminTemplatePhotoCopyEditor(proof), "ordinary/tree copy retains private-only editor validation");
  assertAdminTemplatePhotoCopyEditor({ ...proof, allowPublicSource: true });
  const selection = allocateAdminTemplatePhotoWholeCopySelection({ source, sourcePayload: payload, targetKind: "shared", metadata: f.metadata, occupiedIds: [] });
  const record = await prepareAdminTemplatePhotoWholeCopyForm(selection);
  assert.equal(record.action.body.source.payloadDigest, digest);
  assert.deepEqual(record.action.body.photoCopy.sourcePayload, before);
  assert.deepEqual((await prepareAdminTemplatePhotoWholeCopyRecord({ binding: record.binding, action: record.action, snapshot: record.snapshot })).snapshot.source, source);
  assert.deepEqual(payload, before);
  for (const mutate of [s => { s.beforeState.layouts[layoutId].templatePublished = false; },
    s => { s.beforeState.layouts[layoutId].adminCausalSource.visibility = "private"; },
    s => { s.beforeState.items[Object.keys(s.beforeState.items)[0]].name += " unsaved"; },
    s => { s.beforeState.layouts[layoutId].arrangement.itemQuantities = {}; }]) {
    const changed = structuredClone(source); mutate(changed);
    assert.throws(() => assertAdminTemplatePhotoCopyEditor({ ...proof, side: changed, allowPublicSource: true }));
  }
});

test("whole legacy source produces independent canonical photos and explicit quantities only in target", () => {
  const f = legacyFixture(), before = structuredClone(f.sourcePayload), projected = projectAdminTemplatePhotoWholeCopyPayload(f);
  const inventory = adminTemplatePhotoWholeCopySourceInventory({ payload: f.sourcePayload, listId: f.sourceListId });
  assert.equal(inventory.photoCount, 5);
  for (const owner of f.owners) for (const photo of projected[owner.entityType === "item" ? "items" : "containers"][owner.entityId].photos || []) {
    assert.equal(Object.hasOwn(photo, "localId"), false); adminTemplatePhotoCopyReference(photo, f.targetListId);
  }
  const map = Object.fromEntries(f.owners.map(owner => [owner.sourceEntityId, owner.entityId]));
  assert.deepEqual(projected.layouts[projected.activeLayoutId].arrangement.itemQuantities,
    { [map["item-a"]]: 4, [map["item-b"]]: 2, [map["item-nested"]]: 3 });
  assert.deepEqual(f.sourcePayload, before);
});

test("source-only alias does not permit pending files, foreign IDs, errors, or invalid present quantities", () => {
  const f = legacyFixture(), photo = f.sourcePayload.containers["a-root"].photos[0];
  assert.throws(() => adminTemplatePhotoCopyReference(photo, f.sourceListId));
  adminTemplatePhotoWholeCopySourceReference(photo, f.sourceListId);
  for (const patch of [{ localId: "other-local-file" }, { status: "pending" }, { error: "upload failed" }, { assetId: "invalid" }]) {
    assert.throws(() => adminTemplatePhotoWholeCopySourceReference({ ...photo, ...patch }, f.sourceListId));
  }
  for (const itemQuantities of [null, {}, { "item-a": 0 }, { "item-a": 1, "item-b": 2, "item-nested": 3, foreign: 1 }]) {
    const payload = structuredClone(f.sourcePayload); payload.layouts["source-layout"].arrangement.itemQuantities = itemQuantities;
    assert.throws(() => adminTemplatePhotoWholeCopySourceInventory({ payload, listId: f.sourceListId }));
  }
  assert.deepEqual(adminTemplatePhotoWholeCopySourceArrangement(f.sourcePayload, f.sourcePayload.layouts["source-layout"].arrangement).itemQuantities,
    { "item-a": 4, "item-b": 2, "item-nested": 3 });
});

test("whole record accepts a consistent public source produced by the real projector", async () => {
  const record = await wholeRecordInput({ sourceVisibility: "public" });
  assert.equal(record.snapshot.source.beforeState.layouts[record.snapshot.source.layoutId].templatePublished, true);
  await prepareAdminTemplatePhotoWholeCopyRecord(record);
});
