import test from "node:test";
import assert from "node:assert/strict";
import { personalGuestImportOwner, personalGuestOwnerReuseMatches } from "../../src/sync/personal-guest-import-owner.js";
import { publicCopyRecordContentHash } from "../../src/public/copy-duplicates.js";

test("guest owner copy keeps business fields and template provenance while removing public and placement bindings", () => {
  for (const entityType of ["item", "container"]) {
    const source = { id: "guest-source", name: "Tent", note: "Do not lose", weight: 42, dimensions: { width: 1, height: 2, depth: 3 },
      customField: { frozen: true }, photos: [{ id: "guest-photo" }], scope: "public", sharedSourceId: "original-template",
      publicCatalogLayoutId: "catalog-layout", parentId: null, parentContainerId: "old-parent", containerId: "old-bag", childIds: [], itemIds: [], order: [] };
    const descriptor = { entityType, sourceId: source.id, targetId: "private-copy", reuse: false, sourceLayoutId: "guest-layout" };
    const before = structuredClone(source), photos = [{ id: "private-photo", status: "pending" }];
    const result = personalGuestImportOwner({ source, descriptor, photos, editMeta: { createdAt: "2026-09-09T00:00:00Z" } });
    assert.deepEqual(source, before); assert.deepEqual(result.photos, photos); assert.notEqual(result.photos, photos);
    assert.deepEqual(result.dimensions, source.dimensions); assert.deepEqual(result.customField, source.customField);
    assert.equal(result.note, source.note); assert.equal(result._publicCopySourceId, "original-template");
    assert.equal(result._publicCopySourceLayoutId, "guest-layout"); assert.equal(result._publicCopySourceKind, entityType);
    assert.equal(result._publicCopySourceContentHash, publicCopyRecordContentHash(source, entityType));
    for (const key of ["scope", "sharedSourceId", "publicCatalogLayoutId", "containerId", "parentContainerId"]) assert.equal(result[key], undefined);
    if (entityType === "container") for (const key of ["parentId", "childIds", "itemIds", "order"]) assert.equal(result[key], undefined);
  }
});

test("guest reuse preserves the existing private owner and its different photos without accepting edited or unrelated targets", () => {
  const source = { id: "guest", name: "Tent", weight: 42, quantity: 1, _publicCopySourceKind: "item", _publicCopySourceId: "template", photos: [{ id: "guest-photo" }] };
  const target = { ...source, id: "private", photos: [{ id: "already-synced" }], updatedAt: "2020-01-01T00:00:00Z", personalExtra: 42 };
  const descriptor = { entityType: "item", sourceId: source.id, targetId: target.id, reuse: true };
  assert.equal(personalGuestOwnerReuseMatches(source, target, "item"), true);
  const copy = personalGuestImportOwner({ source, target, descriptor });
  assert.deepEqual(copy, target); copy.photos[0].id = "late"; assert.equal(target.photos[0].id, "already-synced");
  for (const changed of [{ ...target, weight: 43 }, { ...target, _publicCopySourceId: "different" }, { ...target, scope: "public" }]) {
    assert.equal(personalGuestOwnerReuseMatches(source, changed, "item"), false);
    assert.throws(() => personalGuestImportOwner({ source, target: changed, descriptor }));
  }
  assert.throws(() => personalGuestImportOwner({ source, target, descriptor, photos: [{ id: "replacement" }] }));
  assert.throws(() => personalGuestImportOwner({ source, descriptor: { ...descriptor, reuse: false }, editMeta: { id: "injected" } }));
});
