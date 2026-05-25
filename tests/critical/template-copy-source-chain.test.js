import test from "node:test";
import assert from "node:assert/strict";
import {
  guestDemoCopyCleanupPlan,
  normalizeDemoTemplateName,
  normalizePublishedDemoTemplatePayload
} from "../../src/public/demo-template-state.js";
import {
  demoAdminStatePathForLanguage,
  demoItemKeyForLanguage,
  demoPublicListIdForLanguage
} from "../../src/public/scope.js";
import {
  demoLanguageFromLayoutChoice,
  demoLayoutChoiceForLanguage,
  demoLayoutChoiceForTemplate,
  demoTemplateIdFromLayoutChoice
} from "../../src/public/demo-layout-choice.js";
import {
  createDemoTemplateListId,
  demoTemplateEntryForLanguage,
  demoTemplateForLanguage,
  demoTemplatesForLanguage,
  findDemoTemplateForLanguage,
  publicDemoTemplateEntryFromRecord,
  publicTemplateChoice
} from "../../src/public/public-template-catalog.js";
import {
  cloneIsolatedPublicEntity,
  publicCopySourceIdFromRecord,
  stripPublishedPublicOriginMarkers
} from "../../src/public/copy-public-to-private.js";
import {
  createSharedLayoutsByLanguage,
  findSharedLayoutForLanguage,
  isConcretePublicSharedLayoutListRecord,
  isPublicSharedLayoutListRecord,
  mergeSharedLayoutCatalogEntries,
  pruneRuntimeSharedLayouts,
  serverConfirmedSharedLayoutsFromPublicRecords,
  sharedLayoutIdFromPublicListRecord,
  sharedLayoutLanguageFromPayload,
  visibleSharedLayoutsForLanguage
} from "../../src/public/shared-layouts.js";
import { buildAdminSharedTemplateOptions } from "../../src/public/admin-shared-template-options.js";
import {
  isNetworkUnavailable,
  publishedTemplateBlockReason
} from "../../src/public/public-template-availability.js";
import {
  createSharedLayoutCatalogDiagnostics,
  shouldWarnAboutSharedLayoutCatalog
} from "../../src/public/shared-layout-catalog-diagnostics.js";
import {
  guestDemoCopyLayoutName,
  guestDemoStartupAction
} from "../../src/public/guest-demo-startup.js";
import {
  purgeDeletedSharedTemplateFromFrontendState,
  purgeUnconfirmedSharedTemplatesFromFrontendState
} from "../../src/public/shared-layout-admin.js";
import { repairEmptyTemplateCopyDraftFromPublishedLayout } from "../../src/public/template-copy-admin-repair.js";
import {
  removeManagedSharedLayoutTreesFromState,
  removeManagedSharedTemplateTreesFromState
} from "../../src/state/layout-delete.js";
import {
  adoptTemplateCopySharedSourceId,
  createDemoTemplateCopyRecord,
  findAdoptableTemplateCopyDraft,
  isTemplateCopySharedId
} from "../../src/state/layout-manage.js";

const RU_DEMO_NAME = "\u0414\u0435\u043c\u043e-\u0443\u043a\u043b\u0430\u0434\u043a\u0430";

test("demo public ids keep the legacy RU slot and explicit EN slot", () => {
  assert.equal(demoPublicListIdForLanguage("ru"), "public-demo-state");
  assert.equal(demoItemKeyForLanguage("ru"), "demo-state");
  assert.equal(demoAdminStatePathForLanguage("ru"), "/bike-packing/admin/demo-state");
  assert.equal(demoPublicListIdForLanguage("en"), "public-demo-state-en");
  assert.equal(demoItemKeyForLanguage("en"), "demo-state:en");
  assert.equal(demoAdminStatePathForLanguage("en"), "/bike-packing/admin/demo-states/en/state");
});

test("demo layout choices encode the selected UI language", () => {
  const options = {
    currentLanguage: "ru",
    defaultLanguage: "en",
    demoSelectValue: "demo:default",
    normalizeLanguage: (language) => String(language || "en").trim().toLowerCase() || "en"
  };

  assert.equal(demoLayoutChoiceForLanguage("ru", options), "demo:ru");
  assert.equal(demoLayoutChoiceForLanguage("en", options), "demo:default");
  assert.equal(demoLanguageFromLayoutChoice("demo:ru", options), "ru");
  assert.equal(demoLanguageFromLayoutChoice("demo:default", options), "en");
});

test("demo layout choices can target exact public template rows", () => {
  const options = {
    currentLanguage: "ru",
    defaultLanguage: "en",
    demoSelectValue: "demo:default",
    normalizeLanguage: (language) => String(language || "en").trim().toLowerCase() || "en"
  };
  const choice = demoLayoutChoiceForTemplate({
    listId: "public-demo-state-copy-ru-a1",
    language: "ru"
  }, options);

  assert.equal(choice, "demo:ru:public-demo-state-copy-ru-a1");
  assert.equal(demoLanguageFromLayoutChoice(choice, options), "ru");
  assert.equal(demoTemplateIdFromLayoutChoice(choice), "public-demo-state-copy-ru-a1");
});

test("demo templates use catalog metadata like shared templates", () => {
  const enEntry = publicDemoTemplateEntryFromRecord({
    id: "public-demo-state-en",
    title: "Demo layout",
    language: "en",
    publicTemplateKind: "demo"
  });
  const legacyEntryWithoutLanguage = publicDemoTemplateEntryFromRecord({
    id: "public-demo-state-en",
    title: "Demo layout",
    publicTemplateKind: "demo"
  });
  const ruFallback = demoTemplateEntryForLanguage("ru", {
    listId: "public-demo-state",
    name: "Демо-укладка",
    missing: true
  });

  assert.equal(legacyEntryWithoutLanguage, null);
  assert.equal(enEntry?.publicTemplateKind, "demo");
  assert.equal(enEntry?.language, "en");
  assert.equal(enEntry?.name, "Demo layout");
  assert.equal(demoTemplateForLanguage([enEntry], "ru", { fallbackEntry: ruFallback }), ruFallback);
  assert.equal(publicTemplateChoice(enEntry, {
    demoChoiceForLanguage: (language) => language === "en" ? "demo:default" : `demo:${language}`
  }), "demo:default");
});

test("demo catalog supports multiple templates per language and pairs them on language switch", () => {
  const catalog = [
    demoTemplateEntryForLanguage("ru", { listId: "public-demo-state-copy-ru-2", name: `${RU_DEMO_NAME} 2`, serverConfirmed: true }),
    demoTemplateEntryForLanguage("ru", { listId: "public-demo-state", name: RU_DEMO_NAME, serverConfirmed: true }),
    demoTemplateEntryForLanguage("en", { listId: "public-demo-state-en-copy-2", name: "Demo layout 2", serverConfirmed: true }),
    demoTemplateEntryForLanguage("en", { listId: "public-demo-state-en", name: "Demo layout", serverConfirmed: true })
  ];

  assert.deepEqual(demoTemplatesForLanguage(catalog, "ru").map((entry) => entry.name), [
    RU_DEMO_NAME,
    `${RU_DEMO_NAME} 2`
  ]);
  assert.equal(demoTemplateForLanguage(catalog, "ru")?.listId, "public-demo-state");
  assert.equal(
    findDemoTemplateForLanguage(catalog, "public-demo-state-copy-ru-2", "en", { sourceLanguage: "ru" })?.listId,
    "public-demo-state-en-copy-2"
  );
});

test("demo catalog language switch falls back to nearest template in the selected language", () => {
  const catalog = [
    demoTemplateEntryForLanguage("ru", { listId: "demo-ru-a", name: "Alpha", serverConfirmed: true }),
    demoTemplateEntryForLanguage("ru", { listId: "demo-ru-b", name: "Beta", serverConfirmed: true }),
    demoTemplateEntryForLanguage("en", { listId: "demo-en-a", name: "One", serverConfirmed: true }),
    demoTemplateEntryForLanguage("en", { listId: "demo-en-b", name: "Two", serverConfirmed: true })
  ];

  assert.equal(
    findDemoTemplateForLanguage(catalog, "demo-ru-b", "en", { sourceLanguage: "ru" })?.listId,
    "demo-en-b"
  );
});

test("demo catalog metadata keeps the title exactly for rendering options", () => {
  const ruEntry = publicDemoTemplateEntryFromRecord({
    id: "public-demo-state",
    title: `${RU_DEMO_NAME} 2`,
    language: "ru",
    publicTemplateKind: "demo"
  });

  assert.equal(ruEntry?.name, `${RU_DEMO_NAME} 2`);
});

test("demo template copies stay demo templates with their own public list id", () => {
  const demoListId = createDemoTemplateListId({
    language: "ru",
    takenListIds: [],
    now: () => 12345,
    random: () => 0.123456789
  });
  const record = createDemoTemplateCopyRecord({
    id: "layout-copy",
    name: `${RU_DEMO_NAME} 3`,
    sourceLayout: {
      id: "layout-demo",
      adminDemo: true,
      adminDemoLanguage: "ru",
      rootContainerIds: ["bag-a"],
      arrangement: { rootContainerIds: ["bag-a"], containers: {}, items: {} }
    },
    arrangement: { rootContainerIds: ["bag-a"], containers: {}, items: {} },
    language: "ru",
    demoListId
  });

  assert.equal(demoListId, "public-demo-state-copy-ru-9ix-12345678");
  assert.equal(record.adminDemo, true);
  assert.equal(record.adminTemplateCopy, undefined);
  assert.equal(record.adminDemoLanguage, "ru");
  assert.equal(record.language, "ru");
  assert.equal(record.adminDemoListId, demoListId);
});

test("demo template name keeps explicit title suffixes", () => {
  assert.equal(normalizeDemoTemplateName(`${RU_DEMO_NAME} 2`, {
    fallbackName: "Demo layout",
    demoNames: [RU_DEMO_NAME, "Demo layout"]
  }), `${RU_DEMO_NAME} 2`);
  assert.equal(normalizeDemoTemplateName("Demo layout 7", {
    fallbackName: "Demo layout",
    demoNames: [RU_DEMO_NAME, "Demo layout"]
  }), "Demo layout 7");
  assert.equal(normalizeDemoTemplateName("Custom trip 2", {
    fallbackName: "Demo layout",
    demoNames: [RU_DEMO_NAME, "Demo layout"]
  }), "Custom trip 2");
});

test("published demo payload is collapsed to one canonical layout", () => {
  const payload = {
    layouts: {
      "layout-main": {
        id: "layout-main",
        name: `${RU_DEMO_NAME} 2`,
        rootContainerIds: ["container-a"]
      },
      "layout-stale": {
        id: "layout-stale",
        name: "stale",
        rootContainerIds: ["container-b"]
      }
    },
    activeLayoutId: "layout-main",
    containers: {
      "container-a": { id: "container-a", itemIds: ["item-a"], childIds: [] },
      "container-b": { id: "container-b", itemIds: ["item-b"], childIds: [] }
    },
    items: {
      "item-a": { id: "item-a", containerId: "container-a" },
      "item-b": { id: "item-b", containerId: "container-b" }
    }
  };

  const normalized = normalizePublishedDemoTemplatePayload(payload, {
    fallbackName: "Demo layout",
    demoNames: [RU_DEMO_NAME, "Demo layout"]
  });

  assert.equal(normalized.activeLayoutId, "layout-main");
  assert.deepEqual(Object.keys(normalized.layouts), ["layout-main"]);
  assert.equal(normalized.layouts["layout-main"].name, `${RU_DEMO_NAME} 2`);
  assert.deepEqual(normalized.layouts["layout-main"].rootContainerIds, ["container-a"]);
  assert.deepEqual(Object.keys(normalized.containers), ["container-a"]);
  assert.deepEqual(Object.keys(normalized.items), ["item-a"]);
});

test("guest demo startup cleanup removes only unedited duplicate auto-copies", () => {
  const layouts = {
    edited: { id: "edited", guestDemoCopy: true, updatedAt: "2026-05-24T10:00:00.000Z" },
    active: { id: "active", guestDemoCopy: true, updatedAt: "2026-05-24T09:00:00.000Z" },
    stale: { id: "stale", guestDemoCopy: true, updatedAt: "2026-05-24T08:00:00.000Z" },
    private: { id: "private" }
  };

  const plan = guestDemoCopyCleanupPlan({
    layouts,
    activeLayoutId: "active",
    hasUserEdits: (layout) => layout.id === "edited"
  });

  assert.equal(plan.keepLayoutId, "active");
  assert.deepEqual(plan.removeLayoutIds, ["stale"]);
});

test("guest startup creates one automatic demo layout only when startup policy allows it", () => {
  assert.equal(
    guestDemoStartupAction({
      preferLocalCopy: true,
      canUsePrivateState: false,
      syncDirty: false
    }),
    "readonly"
  );
  assert.equal(
    guestDemoStartupAction({
      preferLocalCopy: true,
      allowAutomaticLocalCopy: true,
      canUsePrivateState: false
    }),
    "copy"
  );
  assert.equal(
    guestDemoStartupAction({
      syncDirty: true,
      hadAuthoritativeLocalStateAtStartup: true,
      suspiciousEmptyState: false
    }),
    "keep"
  );
});

test("automatic guest demo layout keeps the template title without uniqueness suffixes", () => {
  const uniqueName = (name) => `${name} 2`;

  assert.equal(
    guestDemoCopyLayoutName("Demo-packing", {
      fallbackName: "Demo copy",
      normalizeName: (name) => name.trim(),
      uniqueName,
      exactTemplateName: true
    }),
    "Demo-packing"
  );
  assert.equal(
    guestDemoCopyLayoutName("Demo-packing", {
      fallbackName: "Demo copy",
      normalizeName: (name) => name.trim(),
      uniqueName,
      exactTemplateName: false
    }),
    "Demo-packing 2"
  );
});

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

test("template delete removes stale local drafts for the same template identity", () => {
  const state = {
    layouts: {
      "layout-old-draft": {
        id: "layout-old-draft",
        name: "Bikepacking reference 2",
        adminTemplateCopy: true,
        adminSharedSourceId: "bikepacking-reference-bags",
        language: "ru",
        rootContainerIds: ["container-old"]
      },
      "layout-private": {
        id: "layout-private",
        name: "Bikepacking reference 2",
        language: "ru",
        rootContainerIds: ["container-private"]
      }
    },
    containers: {
      "container-old": { id: "container-old", itemIds: ["item-old"], childIds: [] },
      "container-private": { id: "container-private", itemIds: ["item-private"], childIds: [] }
    },
    items: {
      "item-old": { id: "item-old" },
      "item-private": { id: "item-private" }
    },
    collapsedContainers: { "container-old": true },
    activeLayoutId: "layout-old-draft"
  };

  const removed = removeManagedSharedTemplateTreesFromState(state, {
    sharedId: "template-copy-ru-123",
    name: "Bikepacking reference 2",
    language: "ru"
  });

  assert.deepEqual(removed, ["layout-old-draft"]);
  assert.equal(state.layouts["layout-old-draft"], undefined);
  assert.equal(state.containers["container-old"], undefined);
  assert.equal(state.items["item-old"], undefined);
  assert.ok(state.layouts["layout-private"]);
});

test("deleted template-copy is purged from runtime catalog and admin drafts", () => {
  const state = {
    layouts: {
      "layout-local-draft": {
        id: "layout-local-draft",
        name: "Bikepacking reference 2",
        adminTemplateCopy: true,
        adminSharedSourceId: "bikepacking-reference-bags",
        language: "ru",
        rootContainerIds: ["container-local"]
      }
    },
    containers: {
      "container-local": { id: "container-local", itemIds: ["item-local"], childIds: [] }
    },
    items: {
      "item-local": { id: "item-local" }
    },
    activeLayoutId: "layout-local-draft"
  };
  const layoutsByLanguage = {
    ru: [
      { id: "bikepacking-reference-bags", name: "Bikepacking reference", runtimeSharedTemplate: true, language: "ru" },
      { id: "template-copy-ru-123", name: "Bikepacking reference 2", runtimeSharedTemplate: true, language: "ru" },
      { id: "template-copy-ru-stale", name: "Bikepacking reference 2", runtimeSharedTemplate: true, language: "ru" }
    ],
    en: [
      { id: "template-copy-en-456", name: "Bikepacking reference 2", runtimeSharedTemplate: true, language: "en" }
    ]
  };

  const result = purgeDeletedSharedTemplateFromFrontendState({
    targetState: state,
    layoutsByLanguage,
    sharedId: "template-copy-ru-123",
    name: "Bikepacking reference 2",
    language: "ru"
  });

  assert.equal(result.removedRuntimeCount, 2);
  assert.deepEqual(result.removedLayoutIds, ["layout-local-draft"]);
  assert.deepEqual(layoutsByLanguage.ru.map((layout) => layout.id), ["bikepacking-reference-bags"]);
  assert.deepEqual(layoutsByLanguage.en.map((layout) => layout.id), ["template-copy-en-456"]);
  assert.equal(state.layouts["layout-local-draft"], undefined);
});

test("unconfirmed server catalog entries cannot remain visible from local state", () => {
  const state = {
    layouts: {
      "layout-stale-draft": {
        id: "layout-stale-draft",
        name: "Deleted Copy",
        adminTemplateCopy: true,
        adminSharedSourceId: "template-copy-ru-deleted",
        language: "ru",
        rootContainerIds: ["container-stale"]
      }
    },
    containers: {
      "container-stale": { id: "container-stale", itemIds: ["item-stale"], childIds: [] }
    },
    items: {
      "item-stale": { id: "item-stale" }
    },
    activeLayoutId: "layout-stale-draft"
  };
  const layoutsByLanguage = {
    ru: [
      { id: "template-copy-ru-deleted", name: "Deleted Copy", runtimeSharedTemplate: true, language: "ru" },
      { id: "template-copy-ru-confirmed", name: "Confirmed Copy", runtimeSharedTemplate: true, language: "ru" }
    ]
  };
  const confirmedSharedLayouts = [{
    id: "template-copy-ru-confirmed",
    name: "Confirmed Copy",
    runtimeSharedTemplate: true,
    language: "ru"
  }];

  const purged = purgeUnconfirmedSharedTemplatesFromFrontendState({
    targetState: state,
    layoutsByLanguage,
    confirmedSharedLayouts,
    fallbackLanguage: "ru"
  });
  const options = buildAdminSharedTemplateOptions({
    canOpen: true,
    localLayouts: Object.values(state.layouts),
    sharedLayouts: Object.values(layoutsByLanguage).flat(),
    serverConfirmedSharedLayouts: confirmedSharedLayouts,
    requireServerConfirmationForSharedTemplates: true,
    fallbackLanguage: "ru",
    isLayoutMeaningful: () => true,
    templateCopySourceScore: () => 3
  });

  assert.deepEqual(purged, {
    removedRuntimeCount: 1,
    removedLayoutIds: ["layout-stale-draft"]
  });
  assert.deepEqual(layoutsByLanguage.ru.map((layout) => layout.id), ["template-copy-ru-confirmed"]);
  assert.deepEqual(Object.keys(state.layouts), []);
  assert.deepEqual(options.map((option) => option[0]), ["shared:template-copy-ru-confirmed"]);
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

test("public shared catalog language uses server metadata before payload language", () => {
  const row = {
    id: "public-shared-layout-template-copy-ru-123",
    title: "Bikepacking reference 2",
    language: "en"
  };
  const layoutsByLanguage = {
    ru: [{
      id: "template-copy-ru-123",
      name: "Bikepacking reference 2",
      language: "ru",
      runtimeSharedTemplate: true
    }],
    en: []
  };

  const confirmed = serverConfirmedSharedLayoutsFromPublicRecords([row], {
    layoutsByLanguage,
    fallbackLanguage: "ru"
  });

  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0].id, "template-copy-ru-123");
  assert.equal(confirmed[0].language, "en");
});

test("public shared catalog ignores rows without language metadata", () => {
  const row = {
    id: "public-shared-layout-bikepacking-reference-bags",
    title: "Bikepacking reference",
    ownerId: "user-1",
    stateRevision: 3
  };

  const confirmed = serverConfirmedSharedLayoutsFromPublicRecords([row], {
    layoutsByLanguage: { ru: [], en: [] }
  });

  assert.deepEqual(confirmed, []);
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
    !publicSharedIds.has(layout.id)
  );

  assert.equal(removed, 2);
  assert.deepEqual(layoutsByLanguage.ru.map((layout) => layout.id), [
    "bikepacking-reference-bags",
    "template-copy-ru-existing"
  ]);
  assert.deepEqual(layoutsByLanguage.en, []);
});

test("shared runtime catalog starts empty without server rows", () => {
  const layoutsByLanguage = createSharedLayoutsByLanguage([{
    id: "bikepacking-reference-bags",
    name: "Bikepacking reference"
  }], { languages: ["ru", "en"] });

  assert.deepEqual(layoutsByLanguage, { ru: [], en: [] });
});

test("public shared options show only server-confirmed rows", () => {
  const layoutsByLanguage = {
    en: [
      {
        id: "bikepacking-reference-bags-en",
        name: "Bikepacking reference",
        language: "en"
      },
      {
        id: "bikepacking-reference-bags",
        name: "Bikepacking reference",
        language: "en",
        runtimeSharedTemplate: true,
        statePayload: { activeLayoutId: "layout-main", layouts: {} }
      }
    ]
  };

  const visible = visibleSharedLayoutsForLanguage(layoutsByLanguage, "en", {
    defaultLanguage: "en",
    serverConfirmedSharedLayouts: [{ id: "bikepacking-reference-bags" }]
  });

  assert.deepEqual(visible.map((layout) => layout.id), ["bikepacking-reference-bags"]);
});

test("public shared options stay empty while the server row is absent", () => {
  const layoutsByLanguage = {
    en: [{
      id: "bikepacking-reference-bags-en",
      name: "Bikepacking reference",
      language: "en"
    }]
  };

  const visible = visibleSharedLayoutsForLanguage(layoutsByLanguage, "en", {
    defaultLanguage: "en",
    serverConfirmedSharedLayouts: []
  });

  assert.deepEqual(visible.map((layout) => layout.id), []);
});

test("public shared options do not borrow another language when the selected language is empty", () => {
  const layoutsByLanguage = {
    ru: [],
    en: [{
      id: "bikepacking-reference-bags-en",
      name: "Bikepacking reference",
      language: "en",
      serverConfirmed: true
    }]
  };

  const visible = visibleSharedLayoutsForLanguage(layoutsByLanguage, "ru", {
    defaultLanguage: "en",
    serverConfirmedSharedLayouts: [{ id: "bikepacking-reference-bags-en" }]
  });

  assert.deepEqual(visible.map((layout) => layout.id), []);
});

test("public shared catalog treats demo-index-only entries as non-concrete", () => {
  assert.equal(isConcretePublicSharedLayoutListRecord({
    id: "public-shared-layout-bikepacking-reference-bags",
    title: "Bikepacking reference",
    sharedLayoutId: "bikepacking-reference-bags"
  }), false);
  assert.equal(isConcretePublicSharedLayoutListRecord({
    id: "public-shared-layout-bikepacking-reference-bags",
    title: "Bikepacking reference",
    ownerId: "user-1",
    stateRevision: 3,
    sharedLayoutId: "bikepacking-reference-bags"
  }), true);
});

test("language switch picks the shared template pair by family or name", () => {
  const byFamily = findSharedLayoutForLanguage({
    ru: [{ id: "bikepacking-reference-bags", name: "Bikepacking reference", language: "ru", serverConfirmed: true }],
    en: [{ id: "bikepacking-reference-bags-en", name: "Bikepacking reference", language: "en", serverConfirmed: true }]
  }, "bikepacking-reference-bags", "en", {
    sourceLanguage: "ru",
    serverConfirmedSharedLayouts: [
      { id: "bikepacking-reference-bags" },
      { id: "bikepacking-reference-bags-en" }
    ]
  });
  const byName = findSharedLayoutForLanguage({
    ru: [{ id: "reference-ru", name: "Bikepacking reference", language: "ru", serverConfirmed: true }],
    en: [{ id: "reference-en", name: "Bikepacking reference", language: "en", serverConfirmed: true }]
  }, "reference-ru", "en", {
    sourceLanguage: "ru",
    serverConfirmedSharedLayouts: [
      { id: "reference-ru" },
      { id: "reference-en" }
    ]
  });

  assert.equal(byFamily?.id, "bikepacking-reference-bags-en");
  assert.equal(byName?.id, "reference-en");
});

test("language switch falls back to the nearest shared template in selected language", () => {
  const target = findSharedLayoutForLanguage({
    ru: [
      { id: "ru-first", name: "First", language: "ru", serverConfirmed: true },
      { id: "ru-second", name: "Second", language: "ru", serverConfirmed: true }
    ],
    en: [
      { id: "en-first", name: "Other first", language: "en", serverConfirmed: true },
      { id: "en-second", name: "Other second", language: "en", serverConfirmed: true }
    ]
  }, "ru-second", "en", {
    sourceLanguage: "ru",
    serverConfirmedSharedLayouts: [
      { id: "ru-first" },
      { id: "ru-second" },
      { id: "en-first" },
      { id: "en-second" }
    ]
  });

  assert.equal(target?.id, "en-second");
});

test("language switch returns no shared target when the selected language has no shared templates", () => {
  const target = findSharedLayoutForLanguage({
    ru: [{ id: "bikepacking-reference-bags", name: "Bikepacking reference", language: "ru", serverConfirmed: true }],
    en: []
  }, "bikepacking-reference-bags", "en", {
    sourceLanguage: "ru",
    serverConfirmedSharedLayouts: [{ id: "bikepacking-reference-bags" }]
  });

  assert.equal(target, null);
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
  const confirmed = [{
    id: "template-copy-ru-123",
    name: "Bikepacking reference 2",
    language: "ru",
    runtimeSharedTemplate: true
  }];
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
    serverConfirmedSharedLayouts: confirmed,
    requireServerConfirmationForSharedTemplates: true,
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

test("admin template options hide local and runtime entries without server confirmation", () => {
  const options = buildAdminSharedTemplateOptions({
    canOpen: true,
    localLayouts: [{
      id: "layout-local-draft",
      name: "Bikepacking reference 2",
      adminTemplateCopy: true,
      adminSharedSourceId: "template-copy-ru-123",
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
    serverConfirmedSharedLayouts: [],
    requireServerConfirmationForSharedTemplates: true,
    fallbackLanguage: "ru",
    isLayoutMeaningful: () => true,
    templateCopySourceScore: () => 3
  });

  assert.deepEqual(options, []);
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

test("published templates are blocked when offline or forced offline", () => {
  assert.equal(isNetworkUnavailable({
    forcedOffline: false,
    hasNavigatorOnline: true,
    navigatorOnline: true
  }), false);
  assert.equal(isNetworkUnavailable({
    forcedOffline: false,
    hasNavigatorOnline: true,
    navigatorOnline: false
  }), true);
  assert.equal(isNetworkUnavailable({
    forcedOffline: true,
    hasNavigatorOnline: true,
    navigatorOnline: true
  }), true);
  assert.match(publishedTemplateBlockReason({
    forcedOffline: false,
    hasNavigatorOnline: true,
    navigatorOnline: false,
    language: "ru"
  }), /нет интернета/);
});

test("shared template catalog diagnostics warn when confirmed rows create no options", () => {
  const diagnostics = createSharedLayoutCatalogDiagnostics({
    source: "/bike-packing/public-shared-layouts",
    records: [{ id: "public-shared-layout-template-copy-ru-1" }],
    sharedLayoutIdFromRecord: sharedLayoutIdFromPublicListRecord,
    confirmedLayouts: [{ id: "template-copy-ru-1" }],
    visibleOptions: []
  });

  assert.equal(diagnostics.recordCount, 1);
  assert.equal(diagnostics.parsedIdCount, 1);
  assert.equal(diagnostics.confirmedCount, 1);
  assert.equal(shouldWarnAboutSharedLayoutCatalog(diagnostics), true);
  assert.equal(shouldWarnAboutSharedLayoutCatalog({
    ...diagnostics,
    visibleSharedOptionCount: 1
  }), false);
});
