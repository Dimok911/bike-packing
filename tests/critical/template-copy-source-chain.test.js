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
import { buildAdminSharedTemplateOptions } from "../../src/public/admin-shared-template-options.js";
import { repairEmptyTemplateCopyDraftFromPublishedLayout } from "../../src/public/template-copy-admin-repair.js";
import { removeManagedSharedLayoutTreesFromState } from "../../src/state/layout-delete.js";
import {
  adoptTemplateCopySharedSourceId,
  findAdoptableTemplateCopyDraft,
  isTemplateCopySharedId
} from "../../src/state/layout-manage.js";

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

test("published template-copy row adopts a same-name local draft with an old source id", () => {
  const state = {
    layouts: {
      "layout-local-draft": {
        id: "layout-local-draft",
        name: "Bikepacking reference 2",
        adminTemplateCopy: true,
        adminSharedSourceId: "bikepacking-reference-bags",
        language: "ru",
        rootContainerIds: []
      },
      "layout-private": {
        id: "layout-private",
        name: "Bikepacking reference 2",
        language: "ru",
        rootContainerIds: []
      }
    }
  };
  const published = {
    id: "template-copy-ru-123",
    name: "Bikepacking reference 2",
    language: "ru",
    runtimeSharedTemplate: true
  };

  assert.equal(isTemplateCopySharedId(published.id), true);
  assert.equal(findAdoptableTemplateCopyDraft(state.layouts, published)?.id, "layout-local-draft");

  const adopted = adoptTemplateCopySharedSourceId(state, published, "ru");

  assert.deepEqual(adopted, {
    layoutId: "layout-local-draft",
    previousSharedSourceId: "bikepacking-reference-bags",
    sharedSourceId: "template-copy-ru-123"
  });
  assert.equal(state.layouts["layout-local-draft"].adminSharedSourceId, "template-copy-ru-123");
  assert.equal(findAdoptableTemplateCopyDraft(state.layouts, published), null);
});

test("admin template options collapse local draft and published template-copy row into one option", () => {
  const options = buildAdminSharedTemplateOptions({
    canOpen: true,
    localLayouts: [{
      id: "layout-local-draft",
      name: "Bikepacking reference 2",
      adminTemplateCopy: true,
      adminSharedSourceId: "bikepacking-reference-bags",
      language: "ru",
      rootContainerIds: ["container-a"]
    }],
    sharedLayouts: [{
      id: "template-copy-ru-123",
      name: "Bikepacking reference 2",
      language: "ru",
      runtimeSharedTemplate: true,
      statePayload: {}
    }],
    fallbackLanguage: "ru",
    isLayoutMeaningful: () => true,
    templateCopySourceScore: () => 3,
    labels: {
      templatePrefix: "Template",
      sharedPrefix: "Shared",
      defaultName: "Template",
      languageOptionLabel: (language) => language.toUpperCase(),
      publicTemplateOptionLabel: ({ prefix, sharedPrefix, name, languageLabel }) =>
        `${prefix}: ${sharedPrefix}: ${name} (${languageLabel})`
    }
  });

  assert.equal(options.length, 1);
  assert.equal(options[0][0], "template-draft:layout-local-draft");
});

test("empty local template-copy draft is hydrated from meaningful published payload", () => {
  const state = {
    layouts: {
      "layout-local-draft": {
        id: "layout-local-draft",
        name: "Bikepacking reference 2",
        adminTemplateCopy: true,
        adminSharedSourceId: "template-copy-ru-123",
        language: "ru",
        rootContainerIds: []
      }
    },
    containers: {},
    items: {},
    activeLayoutId: "layout-local-draft"
  };
  const payload = {
    layouts: {
      "layout-main": {
        id: "layout-main",
        name: "Bikepacking reference 2",
        language: "ru",
        rootContainerIds: ["container-a"]
      }
    },
    activeLayoutId: "layout-main",
    containers: {
      "container-a": { id: "container-a", itemIds: ["item-a"], childIds: [] }
    },
    items: {
      "item-a": { id: "item-a", containerId: "container-a" }
    }
  };
  const sharedLayout = {
    id: "template-copy-ru-123",
    name: "Bikepacking reference 2",
    language: "ru",
    statePayload: payload
  };

  const repaired = repairEmptyTemplateCopyDraftFromPublishedLayout({
    state,
    sharedLayout,
    editableLayout: state.layouts["layout-local-draft"],
    fallbackLanguage: "ru",
    canRepair: true,
    isLayoutMeaningful: () => false,
    sharedLayoutStatePayload: (layout) => layout.statePayload,
    sharedPayloadActiveLayout: (sourceState) => sourceState.layouts[sourceState.activeLayoutId],
    templateCopySourceScore: () => 3,
    removeLayoutTree: (layoutId, targetState) => {
      delete targetState.layouts[layoutId];
      targetState.containers = {};
      targetState.items = {};
      return true;
    },
    copyPublishedContainerToState: (sourceState, containerId) => {
      const nextContainerId = `copy-${containerId}`;
      const nextItemId = "copy-item-a";
      state.containers[nextContainerId] = {
        ...sourceState.containers[containerId],
        id: nextContainerId,
        itemIds: [nextItemId]
      };
      state.items[nextItemId] = { ...sourceState.items["item-a"], id: nextItemId, containerId: nextContainerId };
      return nextContainerId;
    },
    createLayoutArrangementFromCurrentState: (targetState, rootContainerIds) => ({
      rootContainerIds,
      containers: {
        [rootContainerIds[0]]: { parentId: "", itemIds: ["copy-item-a"], childIds: [], order: [{ type: "item", id: "copy-item-a" }] }
      },
      items: { "copy-item-a": rootContainerIds[0] },
      packedItems: {}
    }),
    normalizeLayoutArrangement: () => {},
    ensureLayoutDictionaries: () => ({ locations: ["Home"], categories: ["Gear"] }),
    currentMeta: { updatedByDeviceId: "test-device", updatedByDeviceName: "test" },
    nowIso: () => "2026-05-23T00:00:00.000Z"
  });

  assert.equal(repaired?.id, "layout-local-draft");
  assert.equal(state.activeLayoutId, "layout-local-draft");
  assert.equal(state.layouts["layout-local-draft"].adminSharedSourceId, "template-copy-ru-123");
  assert.deepEqual(state.layouts["layout-local-draft"].rootContainerIds, ["copy-container-a"]);
  assert.ok(state.items["copy-item-a"]);
});
