import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { personalArchivePhotoPlan } from "../../src/sync/personal-archive-photo-plan.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";
import { personalArchivePhotoResultReference, isPersonalPendingArchiveUpdate, personalPendingArchiveUpdateSource } from "../../src/sync/personal-pending-archive-update.js";

function fixture() {
  const base = { items: {}, containers: {}, layouts: {}, locations: [], categories: [] };
  const sourcePayload = { ...structuredClone(base), items: { item: { id: "item", name: "Frozen item", photos: [{ id: "old-1" }, { id: "old-2" }] }, fileless: { id: "fileless", name: "No photo owner" } },
    containers: { bag: { id: "bag", name: "Frozen bag", photos: [{ id: "old-bag" }] } },
    layouts: { layout: { id: "layout", name: "Archived layout", rootContainerIds: [], arrangement: { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {} } } } };
  const files = [["item", "item", "old-1"], ["item", "item", "old-2"], ["container", "bag", "old-bag"]].map(([entityType, entityId, sourcePhotoId]) => ({
    entityType, entityId, sourcePhotoId, photoId: randomUUID(), assetId: randomUUID(), file: { hash: "a".repeat(64), size: 5, type: "image/png", fileName: "original.png" }, thumb: null }));
  const options = { currentPayload: base, sourcePayload, listId: "list", mode: "full", layoutTargets: [], sourceActiveLayoutId: "", editMeta: {} };
  const plan = personalArchivePhotoPlan(options, files), payload = plan.payload;
  const action = { environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list", kind: "list.import", operationId: randomUUID(), generation: 1,
    body: { baseStateRevision: 1, payload, causal: { dependsOn: [], reads: [] }, archiveImport: { version: 2, mode: "full", sourcePayload,
      sourceHash: "a".repeat(64), payloadHash: "b".repeat(64), targetStateRevision: 1, layoutTargets: [], sourceActiveLayoutId: "", editMeta: {}, files } } };
  return { version: 1, action, snapshot: structuredClone(payload), mergeBase: { payload: base, stateRevision: 1 },
    photoState: { version: 1, payload, fileIntentHash: "c".repeat(64), fileInventoryVersion: 2 } };
}
const allowed = (source, basePayload, payload, userDeletion = null) => isPersonalPendingArchiveUpdate({ source, basePayload, payload, userDeletion, listId: "list" });
const child = (source, parent, payload, userDeletion) => ({ version: 1, snapshot: structuredClone(payload), action: { ...parent.action,
  kind: "list.update", operationId: randomUUID(), generation: parent.action.generation + 1,
  body: { baseStateRevision: 1, payload, ...(userDeletion ? { userDeletion } : {}), photoResults: personalArchivePhotoResultReference(source),
    causal: { baseOperationId: parent.action.operationId, reads: [], dependsOn: [...new Set([parent.action.operationId, source.action.operationId])].map(operationId => ({ operationId, listId: "list" })) } } } });

test("pending archive permits DB fields and sequential explicit owner deletion without mutating the frozen archive", () => {
  const source = fixture(), before = structuredClone(source), base = source.action.body.payload, edited = structuredClone(base);
  edited.items.item.weight = 41; edited.containers.bag.name = "Later bag fields";
  assert.equal(allowed(source, base, edited), true);
  const first = child(source, source, edited), deletion = preparePersonalDeletionBatch(edited, { type: "item", id: "item" });
  assert.equal(allowed(source, edited, deletion.snapshot, deletion.intent), true);
  const second = child(source, first, deletion.snapshot, deletion.intent), final = structuredClone(deletion.snapshot); final.containers.bag.weight = 99;
  const third = child(source, second, final);
  assert.equal(personalPendingArchiveUpdateSource({ records: [third, source, first, second], operationId: third.action.operationId, listId: "list" }), source);
  assert.deepEqual(source, before);
  assert.equal(allowed(source, deletion.snapshot, edited), false, "A later edit must not resurrect an already deleted imported owner");
});

test("pending archive refuses altered file order, owner rebinding, file replacement and unproved removal", () => {
  const source = fixture(), base = source.action.body.payload;
  for (const mutate of [p => p.items.item.photos.reverse(), p => p.items.item.photos.pop(), p => delete p.items.item,
    p => p.containers.bag.photos = p.items.item.photos, p => p.items.item.photos[0].assetId = randomUUID(),
    p => p.items.item.photos[0].status = "synced", p => p.items.item.photos[0].url = "https://foreign.test/file",
    p => p.items.other = { ...structuredClone(p.items.item), id: "other" }]) {
    const payload = structuredClone(base); mutate(payload); assert.equal(allowed(source, base, payload), false);
  }
});

test("pending archive layout deletion preserves catalogue owners and all of their exact file bindings", () => {
  const source = fixture(), base = source.action.body.payload, payload = structuredClone(base), intent = { type: "layout", id: "layout" };
  delete payload.layouts.layout;
  assert.equal(allowed(source, base, payload, intent), true);
  assert.equal(allowed(source, base, base, intent), false);
  const lostFileless = structuredClone(payload); delete lostFileless.items.fileless;
  assert.equal(allowed(source, base, lostFileless, intent), false);
  delete payload.items.item; assert.equal(allowed(source, base, payload, intent), false);
});

test("pending archive descendant ancestry needs both exact parents and rejects forks, cycles, foreign bindings and imported body substitution", () => {
  const source = fixture(), payload = structuredClone(source.action.body.payload); payload.items.item.weight = 7;
  const first = child(source, source, payload), second = child(source, first, payload);
  assert.equal(personalPendingArchiveUpdateSource({ records: [source], operationId: source.action.operationId, listId: "list" }), null);
  assert.equal(personalPendingArchiveUpdateSource({ records: [source], operationId: source.action.operationId, listId: "list", includeSource: true }), source);
  for (const mutate of [r => r.action.body.causal.dependsOn.pop(), r => r.action.actorId = "foreign",
    r => r.action.body.causal.baseOperationId = r.action.operationId, r => r.action.body.photoResults.operationId = randomUUID(),
    r => r.action.body.photoResults.owners.reverse(), r => r.action.generation++, r => r.action.body.payload.items.item.photos.reverse()]) {
    const changed = structuredClone(second); mutate(changed);
    assert.equal(personalPendingArchiveUpdateSource({ records: [source, first, changed], operationId: changed.action.operationId, listId: "list" }), null);
  }
});
