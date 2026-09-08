import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { personalPhotoHistoryPlan } from "../../src/sync/personal-photo-history-plan.js";

function fixture() {
  const photo = () => { const id = randomUUID(); return { id, photoId: id, assetId: randomUUID(), listId: "list", status: "synced",
    url: `/photo/${id}`, thumbUrl: `/thumb/${id}`, fileName: "chosen.png", type: "image/png", size: 30, width: 2, height: 3 }; };
  const old = photo(), fresh = photo(), other = photo();
  const state = photos => ({ items: { item: { id: "item", photos } }, containers: { bag: { id: "bag", photos: [other] } } });
  const head = (reference, entityType, entityId, deleted = false) => ({ photoId: reference.id, assetId: reference.assetId,
    entityType, entityId, revision: deleted ? 4 : 6, deleted, reference: structuredClone(reference) });
  return { input: { listId: "list", baseStateRevision: 9, currentPayload: state([fresh]), payload: state([old]),
    heads: [head(fresh, "item", "item"), head(old, "item", "item", true), head(other, "container", "bag")] }, old, fresh, other };
}

test("history freezes exact revival, retirement and retained photos without touching source, destination or IDs", () => {
  const f = fixture(), before = structuredClone(f.input), plan = personalPhotoHistoryPlan(f.input);
  assert.deepEqual(f.input, before); assert.deepEqual(plan.revive, [f.old.id]); assert.deepEqual(plan.retire, [f.fresh.id]); assert.deepEqual(plan.retained, [f.other.id]);
  assert.deepEqual(plan.manifest.owners, [{ entityType: "item", entityId: "item", photoIds: [f.old.id] }, { entityType: "container", entityId: "bag", photoIds: [f.other.id] }]);
  const reordered = structuredClone(f.input); reordered.heads.reverse(); assert.deepEqual(personalPhotoHistoryPlan(reordered), plan);
  f.input.heads[0].reference.fileName = "later"; assert.deepEqual(plan.manifest.heads.find(head => head.photoId === f.fresh.id).reference, before.heads[0].reference);
});

test("whole history can restore a retired owner or remove a live owner; scoped history retains unrelated photos and chosen order", () => {
  const retired = fixture(); delete retired.input.currentPayload.items.item; retired.input.heads[0].deleted = true;
  assert.deepEqual(personalPhotoHistoryPlan(retired.input).revive, [retired.old.id]);
  const removed = fixture(); delete removed.input.payload.items.item;
  assert.deepEqual(personalPhotoHistoryPlan(removed.input).retire, [removed.fresh.id]);
  const ordered = fixture(); ordered.input.payload.items.item.photos = [ordered.old, ordered.fresh];
  const result = personalPhotoHistoryPlan(ordered.input); assert.deepEqual(result.manifest.owners[0].photoIds, [ordered.old.id, ordered.fresh.id]);
  assert.ok(result.retained.includes(ordered.other.id)); assert.ok(result.retained.includes(ordered.fresh.id)); assert.deepEqual(result.retire, []);
});

test("unregistered, pending, foreign, moved, altered and duplicate references never become historical authority", () => {
  for (const mutate of [f => { f.input.heads.pop(); }, f => { f.input.payload.items.item.photos[0].status = "pending"; },
    f => { f.input.payload.items.item.photos[0].listId = "other"; }, f => { f.input.payload.items.item.photos[0].size++; },
    f => { f.input.payload.items.item.photos[0].extra = true; }, f => { f.input.payload.containers.bag.photos.push(f.old); },
    f => { f.input.payload.items.item.id = "other"; }, f => { f.input.payload.items.item.publicCatalogLayoutId = "public"; },
    f => { f.input.heads[0].deleted = true; }, f => { f.input.heads[1].deleted = false; },
    f => { f.input.heads[0].revision = 10; }, f => { f.input.heads[0].revision = "6"; },
    f => { f.input.heads.push(structuredClone(f.input.heads[0])); }, f => { f.input.heads[1].entityId = "someone-else"; }]) {
    const f = fixture(); mutate(f); const before = structuredClone(f.input);
    assert.throws(() => personalPhotoHistoryPlan(f.input), { code: "photo-history-plan" }); assert.deepEqual(f.input, before);
  }
});

test("a retired unselected registry is retained as proof without inventing file effects", () => {
  const f = fixture(); f.input.currentPayload = { items: {}, containers: {} }; f.input.payload = { items: {}, containers: {} };
  for (const head of f.input.heads) head.deleted = true;
  const result = personalPhotoHistoryPlan(f.input); assert.equal(result.manifest.heads.length, 3);
  assert.deepEqual(result.revive, []); assert.deepEqual(result.retire, []); assert.deepEqual(result.retained, []); assert.deepEqual(result.manifest.owners, []);
});
