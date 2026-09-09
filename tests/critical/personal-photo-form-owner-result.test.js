import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { personalPhotoFormOwnerResult, personalPhotoFormOwnerValidationBody, assertPersonalPhotoFormOwnerBase,
  PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED } from "../../src/sync/personal-photo-form-owner-result.js";

function fixture() {
  const photo = { id: "photo", photoId: "photo", assetId: randomUUID(), listId: "list", status: "pending" };
  const owner = { id: "owner", name: "Frozen owner", photos: [photo], custom: { preserved: true } };
  const body = { version: 1, action: "form", entityType: "container", entityId: owner.id, baseStateRevision: 3,
    baseEntityRevision: null, ownerResult: { version: 1, operationId: randomUUID(), owner }, fields: { name: "Later edit" },
    changes: [{ version: 1, action: "delete", entityType: "container", entityId: owner.id, baseEntityRevision: null,
      expectedPhotoIds: [photo.id], photoId: photo.id, assetId: photo.assetId, basePhotoRevision: null }] };
  return { body, base: { containers: { owner }, items: {}, layouts: {} } };
}

test("pending owner reference retains the complete predecessor and keeps validation revisions out of the request", () => {
  const { body, base } = fixture(), original = structuredClone(body);
  assert.deepEqual(assertPersonalPhotoFormOwnerBase(body, base, "list"), body.ownerResult);
  const view = personalPhotoFormOwnerValidationBody(body);
  assert.equal(view.baseEntityRevision, 1); assert.equal(view.changes[0].basePhotoRevision, 1);
  assert.equal(Object.hasOwn(view, "ownerResult"), false); assert.deepEqual(body, original);
  assert.equal(PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED, false);
});

test("pending owner parser rejects invented revisions, lossy JSON, foreign owners and modified pending photo tuples", () => {
  for (const mutate of [
    body => { body.baseEntityRevision = 1; }, body => { body.ownerResult.operationId = "unbound"; },
    body => { body.ownerResult.owner.id = "other"; }, body => { body.ownerResult.owner.sharedSourceId = "shared"; },
    body => { body.ownerResult.owner.custom.value = NaN; }, body => { body.ownerResult.owner.custom.value = undefined; },
    body => { body.ownerResult.owner.photos[0].url = "/invented"; }, body => { body.copySource = {}; },
    body => { body.changes[0].basePhotoRevision = 1; }, body => { body.changes[0].entityId = "other"; },
    body => { body.ownerResult.owner.photos.push(structuredClone(body.ownerResult.owner.photos[0])); }
  ]) { const { body } = fixture(); mutate(body); assert.throws(() => personalPhotoFormOwnerResult(body), undefined, mutate.toString()); }
});

test("full frozen owner must equal the immediate local base, including unknown fields and the bound list", () => {
  for (const mutate of [base => { base.containers.owner.name = "New source"; }, base => { delete base.containers.owner.custom; },
    base => { delete base.containers.owner; }]) {
    const { body, base } = fixture(), changed = structuredClone(base); mutate(changed);
    assert.throws(() => assertPersonalPhotoFormOwnerBase(body, changed, "list"));
  }
  const { body, base } = fixture(); assert.throws(() => assertPersonalPhotoFormOwnerBase(body, base, "other"));
});
