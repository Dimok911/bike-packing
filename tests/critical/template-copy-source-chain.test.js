import test from "node:test";
import assert from "node:assert/strict";
import {
  cloneIsolatedPublicEntity,
  publicCopySourceIdFromRecord,
  stripPublishedPublicOriginMarkers
} from "../../src/public/copy-public-to-private.js";
import {
  isPublicSharedLayoutListRecord,
  pruneRuntimeSharedLayouts,
  sharedLayoutIdFromPublicListRecord,
  sharedLayoutLanguageFromPayload
} from "../../src/public/shared-layouts.js";
import { removeManagedSharedLayoutTreesFromState } from "../../src/state/layout-delete.js";

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

test("template delete removes every local draft for the same published shared id", () => {
  const state = {
    layouts: {
      "layout-copy-a": {
        id: "layout-copy-a",
        adminTemplateCopy: true,
        adminSharedSourceId: "shared-copy",
        rootContainerIds: ["container-a"]
      },
      "layout-copy-b": {
        id: "layout-copy-b",
        adminSharedSourceId: "shared-copy",
        rootContainerIds: ["container-b"]
      },
      "layout-other": {
        id: "layout-other",
        adminTemplateCopy: true,
        adminSharedSourceId: "shared-other",
        rootContainerIds: ["container-other"]
      }
    },
    containers: {
      "container-a": { id: "container-a", itemIds: ["item-a"], childIds: [] },
      "container-b": { id: "container-b", itemIds: ["item-b"], childIds: [] },
      "container-other": { id: "container-other", itemIds: ["item-other"], childIds: [] }
    },
    items: {
      "item-a": { id: "item-a" },
      "item-b": { id: "item-b" },
      "item-other": { id: "item-other" }
    },
    collapsedContainers: {
      "container-a": true,
      "container-b": true,
      "container-other": true
    },
    activeLayoutId: "layout-copy-a"
  };

  const removed = removeManagedSharedLayoutTreesFromState(state, "shared-copy");

  assert.deepEqual(removed.sort(), ["layout-copy-a", "layout-copy-b"]);
  assert.equal(state.layouts["layout-copy-a"], undefined);
  assert.equal(state.layouts["layout-copy-b"], undefined);
  assert.equal(state.containers["container-a"], undefined);
  assert.equal(state.containers["container-b"], undefined);
  assert.equal(state.items["item-a"], undefined);
  assert.equal(state.items["item-b"], undefined);
  assert.equal(state.collapsedContainers["container-a"], undefined);
  assert.equal(state.collapsedContainers["container-b"], undefined);
  assert.ok(state.layouts["layout-other"]);
  assert.ok(state.containers["container-other"]);
  assert.ok(state.items["item-other"]);
});

test("public shared list rows can be reconciled back into the template catalog", () => {
  const row = {
    id: "public-shared-layout-template-copy-ru-123",
    title: "Bikepacking reference 2"
  };
  const payload = {
    layouts: {
      "layout-main": {
        id: "layout-main",
        name: "Bikepacking reference 2",
        language: "ru"
      }
    },
    activeLayoutId: "layout-main"
  };

  assert.equal(isPublicSharedLayoutListRecord(row), true);
  assert.equal(sharedLayoutIdFromPublicListRecord(row), "template-copy-ru-123");
  assert.equal(sharedLayoutLanguageFromPayload(payload, "en"), "ru");
  assert.equal(sharedLayoutIdFromPublicListRecord({ id: "public-demo-state" }), "");
});

test("public shared catalog prunes stale template-copy runtime entries", () => {
  const layoutsByLanguage = {
    ru: [
      { id: "bikepacking-reference-bags", name: "Bikepacking reference", runtimeSharedTemplate: true },
      { id: "template-copy-ru-existing", name: "Bikepacking reference 2", runtimeSharedTemplate: true },
      { id: "template-copy-ru-stale", name: "Bikepacking reference 2", runtimeSharedTemplate: true }
    ],
    en: [
      { id: "template-copy-en-stale", name: "Bikepacking reference 2", runtimeSharedTemplate: true }
    ]
  };
  const publicSharedIds = new Set(["bikepacking-reference-bags", "template-copy-ru-existing"]);

  const removed = pruneRuntimeSharedLayouts(layoutsByLanguage, (layout) =>
    layout?.runtimeSharedTemplate &&
    String(layout.id || "").startsWith("template-copy-") &&
    !publicSharedIds.has(layout.id)
  );

  assert.equal(removed, 2);
  assert.deepEqual(layoutsByLanguage.ru.map((layout) => layout.id), [
    "bikepacking-reference-bags",
    "template-copy-ru-existing"
  ]);
  assert.deepEqual(layoutsByLanguage.en, []);
});
