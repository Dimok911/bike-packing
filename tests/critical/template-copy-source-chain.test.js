import test from "node:test";
import assert from "node:assert/strict";
import {
  cloneIsolatedPublicEntity,
  publicCopySourceIdFromRecord,
  stripPublishedPublicOriginMarkers
} from "../../src/public/copy-public-to-private.js";

test("template copy uses the original public source id when copying a copy", () => {
  const copiedItem = {
    id: "item-shared-item-tent-111",
    name: "Tent",
    sharedSourceId: "item-tent"
  };
  const copiedContainer = {
    id: "container-shared-container-bag-111",
    name: "Bag",
    sharedSourceId: "container-bag"
  };

  assert.equal(publicCopySourceIdFromRecord(copiedItem, "item", copiedItem.id), "item-tent");
  assert.equal(
    publicCopySourceIdFromRecord(copiedContainer, "container", copiedContainer.id),
    "container-bag"
  );
  const nextItemId = `item-shared-${publicCopySourceIdFromRecord(copiedItem, "item", copiedItem.id)}-222`;
  const nextContainerId = `container-shared-${publicCopySourceIdFromRecord(copiedContainer, "container", copiedContainer.id)}-222`;
  assert.equal(nextItemId.includes("item-shared-item-shared"), false);
  assert.equal(nextContainerId.includes("container-shared-container-shared"), false);
});

test("published template payloads drop local public-copy markers", () => {
  const item = {
    id: "item-tent",
    name: "Tent",
    sharedSourceId: "item-shared-item-tent-111",
    _publicCopySourceKind: "item",
    _publicCopySourceId: "item-tent",
    _publicCopySourceLayoutId: "layout-source",
    publicCatalogLayoutId: "layout-admin-shared",
    photos: [{ id: "photo-1", url: "/photos/photo-1/file" }]
  };

  assert.equal(stripPublishedPublicOriginMarkers(item), true);
  assert.equal(item.sharedSourceId, undefined);
  assert.equal(item._publicCopySourceKind, undefined);
  assert.equal(item._publicCopySourceId, undefined);
  assert.equal(item._publicCopySourceLayoutId, undefined);
  assert.equal(item.publicCatalogLayoutId, undefined);
  assert.deepEqual(item.photos, [{ id: "photo-1", url: "/photos/photo-1/file" }]);
});

test("isolated public clones do not keep shared source markers", () => {
  const clone = cloneIsolatedPublicEntity({
    id: "item-shared-item-tent-111",
    name: "Tent",
    sharedSourceId: "item-tent",
    adminSharedSourceId: "shared-layout"
  });

  assert.equal(clone.sharedSourceId, undefined);
  assert.equal(clone.adminSharedSourceId, undefined);
  assert.equal(clone.name, "Tent");
});
