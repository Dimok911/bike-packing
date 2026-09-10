import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PERSONAL_SERVER_PHOTO_FORM_ENABLED, PERSONAL_SERVER_NEW_OWNER_FORM_ENABLED, personalServerPhotoFormCapabilities,
  assertPersonalServerPhotoFormReference, assertPersonalServerPhotoFormBase, personalServerPhotoFormSummary,
  validatePersonalServerPhotoFormResult } from "../../src/sync/personal-server-photo-form-result.js";
import { personalPublicPendingPhotoInventory } from "../../src/sync/personal-public-photo-form-result.js";

const listId = "private-server-copy";
const photo = () => { const id = randomUUID(); return { id, photoId: id, assetId: randomUUID(), listId, status: "pending" }; };
function fixture(created = false) {
  const first = photo(), other = photo(), added = photo();
  const base = { locations: [], categories: [], layouts: {}, items: { selected: { id: "selected", name: "Frozen owner", photos: [first] } },
    containers: { other: { id: "other", name: "Other copied owner", photos: [other] } } };
  const entityId = created ? "new-owner" : "selected";
  const body = { version: 1, action: "form", entityType: "item", entityId, baseEntityRevision: null, fields: { name: "Next form" },
    ownerResult: { version: created ? 7 : 6, operationId: randomUUID(), serverOperationId: randomUUID(),
      owner: created ? null : structuredClone(base.items.selected), pendingPhotos: personalPublicPendingPhotoInventory(base, listId) },
    changes: [{ version: 1, action: "attach", entityType: "item", entityId, expectedPhotoIds: created ? [] : [first.id],
      photoId: added.id, assetId: added.assetId, index: created ? 0 : 1 }] };
  const final = structuredClone(base);
  if (created) final.items[entityId] = { id: entityId, name: "Next form", photos: [] };
  final.items[entityId].photos.push(added);
  for (const field of ["items", "containers"]) for (const owner of Object.values(final[field])) owner.photos.forEach(value => value.status = "synced");
  return { body, base, final };
}

for (const created of [false, true]) test(`server ${created ? "new" : "existing"} owner form preserves inherited photos across all copied owners`, () => {
  const f = fixture(created), original = structuredClone(f);
  assert.deepEqual(assertPersonalServerPhotoFormBase(f.body, f.base, listId), f.body.ownerResult);
  const summary = personalServerPhotoFormSummary(f.body, listId);
  assert.equal(summary.serverOperationId, f.body.ownerResult.serverOperationId);
  assert.equal(summary.pendingPhotos.reduce((sum, owner) => sum + owner.photos.length, 0), 3);
  assert.equal(summary.pendingPhotos.length, created ? 3 : 2);
  const result = { serverPhotoForm: summary, list: { payload: f.final } };
  assert.equal(validatePersonalServerPhotoFormResult(result, f.body, listId), true);
  for (const mutate of [value => value.serverPhotoForm.serverOperationId = randomUUID(),
    value => value.list.payload.containers.other.photos = [], value => value.list.payload.containers.other.photos[0].assetId = randomUUID(),
    value => value.publicPhotoForm = summary, value => value.importPhotoForm = summary]) {
    const bad = structuredClone(result); mutate(bad); assert.equal(validatePersonalServerPhotoFormResult(bad, f.body, listId), false);
  }
  assert.deepEqual(f, original);
});

test("server form rejects foreign lineage versions, changed owners and incomplete inherited inventories", () => {
  const f = fixture();
  for (const patch of [{ version: 2 }, { version: 3 }, { publicOperationId: randomUUID() }, { importOperationId: randomUUID() },
    { serverOperationId: "not-a-uuid" }, { operationId: "not-a-uuid" }, { owner: null }])
    assert.throws(() => assertPersonalServerPhotoFormReference({ ...f.body, ownerResult: { ...f.body.ownerResult, ...patch } }, listId));
  const changed = structuredClone(f.base); changed.items.selected.name = "Changed source";
  assert.throws(() => assertPersonalServerPhotoFormBase(f.body, changed, listId));
  const partial = structuredClone(f.body); partial.ownerResult.pendingPhotos = partial.ownerResult.pendingPhotos.filter(row => row.entityType === "item");
  assert.throws(() => assertPersonalServerPhotoFormBase(partial, f.base, listId));
});

test("a new server owner cannot reuse any existing owner or layout placement", () => {
  const f = fixture(true);
  for (const mutate of [value => value.items["new-owner"] = { id: "new-owner", photos: [] },
    value => value.containers["new-owner"] = { id: "new-owner", photos: [] },
    value => value.layouts.layout = { rootContainerIds: ["new-owner"] }]) {
    const base = structuredClone(f.base); mutate(base); assert.throws(() => assertPersonalServerPhotoFormBase(f.body, base, listId));
  }
});

test("server forms and new owners keep their own disabled writers and distinguish descendant capabilities", () => {
  assert.equal(PERSONAL_SERVER_PHOTO_FORM_ENABLED, false); assert.equal(PERSONAL_SERVER_NEW_OWNER_FORM_ENABLED, false);
  const basic = ["personalCausalServerImportV1", "personalCausalServerPhotoFormsV1"];
  for (const version of [6, 13]) assert.deepEqual(personalServerPhotoFormCapabilities({ version }), basic);
  for (const version of [7, 14]) assert.deepEqual(personalServerPhotoFormCapabilities({ version }), [...basic, "personalCausalServerNewOwnerFormsV1"]);
});
