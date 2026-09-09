import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { personalArchivePhotoSelection, personalArchivePhotoPlan } from "../../src/sync/personal-archive-photo-plan.js";

function fixture(mode = "replace") {
  const photo = id => ({ id, photoId: id, assetId: randomUUID(), listId: "list", status: "synced", url: `https://example.test/${id}`,
    thumbUrl: `https://example.test/thumb/${id}`, fileName: "source.png", type: "image/png", size: 5, width: 1, height: 1 });
  const current = { items: { item: { id: "item", name: "Current catalogue item", photos: [photo("same"), photo("newer")] } },
    containers: { bag: { id: "bag", name: "Current bag", photos: [photo("bag-photo")] } }, locations: [], categories: [],
    layouts: { old: { id: "old", name: "Selected layout", rootContainerIds: ["bag"], arrangement: { rootContainerIds: ["bag"],
      containers: { bag: { parentId: "", childIds: [], itemIds: ["item"], order: [{ type: "item", id: "item" }] } },
      items: { item: "bag" }, itemQuantities: { item: 2 }, packedItems: {} } } } };
  const source = structuredClone(current); source.items.item.name = "Archived item";
  source.items.item.photos = [{ id: "same", url: "https://old.test/changed-but-not-selected" }, { id: "old", url: "https://old.test/original" }];
  source.containers.bag.photos = [{ id: "old", url: "https://old.test/original" }];
  return { currentPayload: current, sourcePayload: source, listId: "list", mode, sourceActiveLayoutId: "old",
    layoutTargets: mode === "full" ? [] : [{ sourceId: "old", targetId: mode === "copy" ? "copy" : "old", name: mode === "copy" ? "Fixed copy" : "Selected layout" }] };
}
const filesFor = input => personalArchivePhotoSelection(input).owners.flatMap(owner => owner.photos.map(photo => ({
  entityType: owner.entityType, entityId: owner.targetId, sourcePhotoId: photo.id, photoId: randomUUID(), assetId: randomUUID(),
  file: { hash: "a".repeat(64), size: 5, type: "image/png", fileName: "frozen.png" }, thumb: null })));

test("archive selected merge retains current catalogue and photo order while giving each imported file a new independent owner binding", () => {
  for (const mode of ["replace", "copy"]) {
    const input = fixture(mode), before = structuredClone(input), files = filesFor(input), result = personalArchivePhotoPlan(input, files);
    assert.deepEqual(input, before); assert.equal(files.length, 2); assert.equal(result.deletions.length, 0);
    assert.deepEqual(result.payload.items.item.photos.slice(0, 2), input.currentPayload.items.item.photos);
    assert.deepEqual(result.payload.containers.bag.photos.slice(0, 1), input.currentPayload.containers.bag.photos);
    assert.equal(result.payload.items.item.name, "Current catalogue item");
    assert.deepEqual(result.attachments.map(value => [value.entityType, value.index]), [["item", 2], ["container", 1]]);
    assert.equal(result.payload.items.item.photos[2].id, files[0].photoId);
    assert.equal(result.payload.containers.bag.photos[1].id, files[1].photoId); assert.notEqual(files[0].photoId, files[1].photoId);
  }
});

test("full photo archive replaces every old reference, preserves archived order and includes unplaced owners", () => {
  const input = fixture("full"); input.sourcePayload.items.unplaced = { id: "unplaced", name: "Not in a layout", photos: [{ id: "spare" }] };
  const files = filesFor(input), result = personalArchivePhotoPlan(input, files);
  assert.equal(files.length, 4); assert.deepEqual(result.deletions.map(value => value.photoId), ["same", "newer", "bag-photo"]);
  assert.equal(result.payload.items.item.name, "Archived item");
  assert.deepEqual(result.payload.items.item.photos.map(value => value.id), files.slice(0, 2).map(value => value.photoId));
  assert.equal(result.payload.items.unplaced.photos[0].id, files[2].photoId);
  assert.equal(result.payload.containers.bag.photos[0].id, files[3].photoId);
});

test("archive photo planning rejects unconfirmed current files, missing selected parts, foreign bindings, reused IDs and invalid metadata", () => {
  for (const mutate of [input => input.currentPayload.items.item.photos[0].listId = "elsewhere", input => input.currentPayload.items.item.photos[0].status = "pending",
    input => input.sourcePayload.items.item.photos.push({ id: "old" }), input => input.sourcePayload.containers.bag.adminDemo = true]) {
    const input = fixture(); mutate(input); assert.throws(() => personalArchivePhotoSelection(input));
  }
  const input = fixture();
  for (const mutate of [files => files.pop(), files => files[0].entityId = "bag", files => files.reverse(),
    files => files[0].assetId = input.currentPayload.items.item.photos[0].assetId, files => files[0].photoId = files[1].photoId,
    files => files[0].file.hash = "invalid", files => files[0].file.type = "text/plain", files => files[0].thumb = { hash: "a".repeat(64), size: 0, type: "image/png" }]) {
    const files = filesFor(input); mutate(files); assert.throws(() => personalArchivePhotoPlan(input, files), { code: "archive-photo-plan" });
  }
});
