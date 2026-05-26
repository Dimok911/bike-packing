import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGuestLocalDisplayPreferences,
  guestDemoCopyCleanupPlan,
  guestDemoCopyRecordWasEdited,
  guestLocalDisplayPreferences,
  guestLocalDisplayPreferencesWereChanged,
  guestLocalLayoutImportPlan,
  isAutomaticGuestDemoCopyLayout,
  isGuestLocalPersonalLayout,
  normalizeDemoTemplateName,
  normalizePublishedDemoTemplatePayload
} from "../../src/public/demo-template-state.js";
import {
  demoAdminPathForPublicListId,
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
  buildAdminDemoTemplateOptions,
  createDemoTemplateListId,
  demoTemplateEntryForLanguage,
  demoTemplateForLanguage,
  demoTemplatesForLanguage,
  findDemoTemplateForLanguage,
  localDemoTemplateEntriesFromLayouts,
  mergeDemoTemplateEntriesForAdmin,
  mergeServerDemoTemplateCatalog,
  publicDemoTemplateEntryFromRecord,
  publicDemoTemplatePayloadTarget,
  publicTemplateChoice,
  removePublicTemplateCatalogEntry,
  upsertDemoTemplateCatalogEntry
} from "../../src/public/public-template-catalog.js";
import {
  applyPublicTemplateMetadataToPayload,
  normalizePublicTemplateMetadataResponse,
  publicTemplateDeletePath,
  publicTemplateMetadataPath,
  publicTemplateMetadataRequest,
  publicTemplateMetadataTarget
} from "../../src/public/public-template-metadata.js";
import {
  appendCopiedFromTemplateNote,
  cloneIsolatedPublicEntity,
  publicCopySourceIdFromRecord,
  stripPublishedPublicOriginMarkers
} from "../../src/public/copy-public-to-private.js";
import {
  createSharedLayoutsByLanguage,
  findSharedLayoutForLanguage,
  isConcretePublicSharedLayoutListRecord,
  isPublicSharedLayoutListRecord,
  isPublicSharedTemplatePayload,
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
  publishedTemplateBlockReason,
  readonlyPublicTemplateOptionLabel
} from "../../src/public/public-template-availability.js";
import { publicTemplateDeleteBlockReason } from "../../src/public/public-template-delete-guard.js";
import {
  createSharedLayoutCatalogDiagnostics,
  shouldWarnAboutSharedLayoutCatalog
} from "../../src/public/shared-layout-catalog-diagnostics.js";
import {
  guestDemoCopyLayoutName,
  guestDemoStartupAction
} from "../../src/public/guest-demo-startup.js";
import { validateGuestImportSyncState } from "../../src/public/guest-login-import.js";
import {
  purgeDeletedSharedTemplateFromFrontendState,
  purgeUnconfirmedSharedTemplatesFromFrontendState
} from "../../src/public/shared-layout-admin.js";
import { repairEmptyTemplateCopyDraftFromPublishedLayout } from "../../src/public/template-copy-admin-repair.js";
import {
  removeManagedDemoTemplateTreesFromState,
  removeManagedSharedLayoutTreesFromState,
  removeManagedSharedTemplateTreesFromState
} from "../../src/state/layout-delete.js";
import {
  adoptTemplateCopySharedSourceId,
  createDemoTemplateCopyRecord,
  createEmptyPublicTemplateDraftRecord,
  findAdoptableTemplateCopyDraft,
  isDisposableManagedPublicDraft,
  isManagedDemoTemplateLayout,
  isManagedPublicTemplateDraft,
  isTemplateCopySharedId,
  publicLayoutChoiceValue,
  shouldCopyPublicTemplatePhotoReferencesOnServer,
  shouldCreatePublishedTemplateBeforePhotos
} from "../../src/state/layout-manage.js";
import { solidifyTemplateDraftLayout } from "../../src/state/layout-draft-solidify.js";
import { repairMojibakeLayoutNames } from "../../src/state/names.js";

const RU_DEMO_NAME = "\u0414\u0435\u043c\u043e-\u0443\u043a\u043b\u0430\u0434\u043a\u0430";

test("demo public ids keep the legacy RU slot and explicit EN slot", () => {
  assert.equal(demoPublicListIdForLanguage("ru"), "public-demo-state");
  assert.equal(demoItemKeyForLanguage("ru"), "demo-state");
  assert.equal(demoAdminStatePathForLanguage("ru"), "/bike-packing/admin/demo-state");
  assert.equal(demoPublicListIdForLanguage("en"), "public-demo-state-en");
  assert.equal(demoItemKeyForLanguage("en"), "demo-state:en");
  assert.equal(demoAdminStatePathForLanguage("en"), "/bike-packing/admin/demo-states/en/state");
  assert.equal(demoAdminPathForPublicListId("/metadata", "public-demo-state", "ru"), "/bike-packing/admin/demo-state/metadata");
  assert.equal(demoAdminPathForPublicListId("/metadata", "public-demo-state-en", "en"), "/bike-packing/admin/demo-states/en/metadata");
  assert.equal(
    demoAdminPathForPublicListId("/metadata", "public-demo-state-copy-ru-abc", "ru"),
    "/bike-packing/admin/demo-states/copy-ru-abc/metadata"
  );
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

test("demo and shared templates use the same metadata request model", () => {
  const normalizeLanguage = (language) => String(language || "ru").trim().toLowerCase() || "ru";
  const normalizeDemoName = (name) => String(name || "").trim();
  const demoPath = publicTemplateMetadataPath({
    type: "demo",
    demoListId: "public-demo-state-en",
    language: "en"
  }, {
    demoAdminPathForPublicListId
  });
  const sharedPath = publicTemplateMetadataPath({
    type: "shared",
    sharedId: "bikepacking-reference-bags"
  }, {
    demoAdminPathForPublicListId
  });
  const demoDeletePath = publicTemplateDeletePath({
    type: "demo",
    demoListId: "public-demo-state-en",
    language: "en"
  }, {
    demoAdminPathForPublicListId
  });
  const sharedDeletePath = publicTemplateDeletePath({
    type: "shared",
    sharedId: "bikepacking-reference-bags"
  }, {
    demoAdminPathForPublicListId
  });

  assert.equal(demoPath, "/bike-packing/admin/demo-states/en/metadata");
  assert.equal(sharedPath, "/bike-packing/admin/shared-layouts/bikepacking-reference-bags/metadata");
  assert.equal(demoDeletePath, "/bike-packing/admin/demo-states/en");
  assert.equal(sharedDeletePath, "/bike-packing/admin/shared-layouts/bikepacking-reference-bags");
  assert.deepEqual(publicTemplateMetadataRequest({
    name: "Demo-packing 4",
    adminDemoLanguage: "en"
  }, {
    type: "demo",
    demoListId: "public-demo-state-en",
    language: "en"
  }, {
    normalizeLanguage,
    normalizeDemoName,
    demoFallbackName: () => "Demo-packing"
  }), {
    title: "Demo-packing 4",
    name: "Demo-packing 4",
    language: "en"
  });
  assert.deepEqual(publicTemplateMetadataRequest({
    name: "Bikepacking reference",
    language: "ru"
  }, {
    type: "shared",
    sharedId: "bikepacking-reference-bags"
  }, {
    normalizeLanguage
  }), {
    title: "Bikepacking reference",
    name: "Bikepacking reference",
    language: "ru"
  });
  assert.deepEqual(normalizePublicTemplateMetadataResponse({
    title: "Bikepacking reference 2",
    language: "EN"
  }, {
    name: "fallback",
    language: "ru"
  }, {
    normalizeLanguage
  }), {
    title: "Bikepacking reference 2",
    name: "Bikepacking reference 2",
    language: "en"
  });
});

test("demo metadata rename keeps the edited public row while changing catalog language", () => {
  const target = publicTemplateMetadataTarget({
    type: "demo",
    demoListId: "public-demo-state-en",
    language: "en"
  }, {
    previousTarget: {
      type: "demo",
      demoListId: "public-demo-state",
      language: "ru"
    }
  });
  const path = publicTemplateMetadataPath(target, { demoAdminPathForPublicListId });
  const body = publicTemplateMetadataRequest({
    name: "Renamed demo",
    adminDemoLanguage: "en"
  }, target, {
    normalizeLanguage: (language) => String(language || "ru").trim().toLowerCase() || "ru",
    normalizeDemoName: (name) => String(name || "").trim(),
    demoFallbackName: () => "Demo layout"
  });

  assert.equal(target.demoListId, "public-demo-state");
  assert.equal(target.language, "en");
  assert.equal(path, "/bike-packing/admin/demo-state/metadata");
  assert.deepEqual(body, {
    title: "Renamed demo",
    name: "Renamed demo",
    language: "en"
  });
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

test("demo template payload cache targets exact public list rows", () => {
  assert.deepEqual(publicDemoTemplatePayloadTarget({
    id: "public-demo-state-copy-en-2",
    title: "Demo-packing 2",
    language: "en",
    updated_at: "2026-05-26T00:00:00.000Z"
  }, {
    fallbackLanguage: "ru",
    demoListIdForLanguage: demoPublicListIdForLanguage
  }), {
    language: "en",
    listId: "public-demo-state-copy-en-2",
    name: "Demo-packing 2",
    updatedAt: "2026-05-26T00:00:00.000Z"
  });
  assert.deepEqual(publicDemoTemplatePayloadTarget({
    language: "ru"
  }, {
    fallbackLanguage: "en",
    demoListIdForLanguage: demoPublicListIdForLanguage
  }), {
    language: "ru",
    listId: "public-demo-state",
    name: "",
    updatedAt: ""
  });
});

test("admin demo catalog includes local drafts before server confirmation", () => {
  const server = [
    demoTemplateEntryForLanguage("ru", { listId: "public-demo-state", name: RU_DEMO_NAME, serverConfirmed: true })
  ];
  const local = localDemoTemplateEntriesFromLayouts({
    "layout-new-demo": {
      id: "layout-new-demo",
      name: `${RU_DEMO_NAME} 2`,
      adminDemo: true,
      adminDemoLanguage: "ru",
      adminDemoListId: "public-demo-state-copy-ru-new",
      updatedAt: "2026-05-26T00:00:00.000Z"
    }
  }, {
    fallbackLanguage: "ru"
  });
  const catalog = mergeDemoTemplateEntriesForAdmin(server, local);

  assert.deepEqual(demoTemplatesForLanguage(catalog, "ru").map((entry) => entry.listId), [
    "public-demo-state",
    "public-demo-state-copy-ru-new"
  ]);
  assert.equal(catalog.find((entry) => entry.listId === "public-demo-state-copy-ru-new")?.serverConfirmed, false);
});

test("server demo catalog refresh updates rows without dropping known templates", () => {
  const current = [
    demoTemplateEntryForLanguage("ru", { listId: "public-demo-state", name: RU_DEMO_NAME, serverConfirmed: true }),
    demoTemplateEntryForLanguage("en", { listId: "public-demo-state-en", name: "Demo layout", serverConfirmed: true })
  ];
  const incoming = [
    demoTemplateEntryForLanguage("ru", { listId: "public-demo-state-copy-ru-new", name: `${RU_DEMO_NAME} 2`, serverConfirmed: true })
  ];

  const catalog = mergeServerDemoTemplateCatalog(current, incoming);

  assert.deepEqual(new Set(catalog.map((entry) => entry.listId)), new Set([
    "public-demo-state",
    "public-demo-state-en",
    "public-demo-state-copy-ru-new"
  ]));
  assert.equal(catalog.find((entry) => entry.listId === "public-demo-state-copy-ru-new")?.serverConfirmed, true);
});

test("demo catalog updates target the selected public list id", () => {
  const catalog = [
    demoTemplateEntryForLanguage("ru", { listId: "public-demo-state", name: RU_DEMO_NAME, serverConfirmed: true }),
    demoTemplateEntryForLanguage("ru", { listId: "public-demo-state-copy-ru-3", name: `${RU_DEMO_NAME} 3`, serverConfirmed: true }),
    demoTemplateEntryForLanguage("en", { listId: "public-demo-state-en", name: "Demo layout", serverConfirmed: true })
  ];

  const next = upsertDemoTemplateCatalogEntry(catalog, "ru", {
    listId: "public-demo-state-copy-ru-3",
    serverConfirmed: false,
    missing: true,
    fallbackListId: "public-demo-state",
    fallbackName: RU_DEMO_NAME
  });

  assert.equal(next.find((entry) => entry.listId === "public-demo-state")?.missing, false);
  assert.equal(next.find((entry) => entry.listId === "public-demo-state-copy-ru-3")?.missing, true);
  assert.deepEqual(demoTemplatesForLanguage(next, "ru").map((entry) => entry.listId), [
    "public-demo-state"
  ]);
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
  assert.equal(record.adminTemplateCopy, true);
  assert.equal(record.adminDemoLanguage, "ru");
  assert.equal(record.language, "ru");
  assert.equal(record.adminDemoListId, demoListId);
});

test("demo template delete removes server catalog entry and local admin drafts", () => {
  const demoListId = "public-demo-state-copy-ru-delete";
  const catalog = [
    demoTemplateEntryForLanguage("ru", { listId: "public-demo-state", name: RU_DEMO_NAME, serverConfirmed: true }),
    demoTemplateEntryForLanguage("ru", { listId: demoListId, name: `${RU_DEMO_NAME} 2`, serverConfirmed: true })
  ];
  const state = {
    activeLayoutId: "layout-demo-copy",
    layouts: {
      "layout-demo-copy": {
        id: "layout-demo-copy",
        adminDemo: true,
        adminDemoLanguage: "ru",
        adminDemoListId: demoListId,
        rootContainerIds: ["bag-a"]
      },
      "layout-other": {
        id: "layout-other",
        adminDemo: true,
        adminDemoLanguage: "ru",
        adminDemoListId: "public-demo-state",
        rootContainerIds: ["bag-b"]
      }
    },
    containers: {
      "bag-a": { id: "bag-a", itemIds: ["item-a"], childIds: [] },
      "bag-b": { id: "bag-b", itemIds: ["item-b"], childIds: [] }
    },
    items: {
      "item-a": { id: "item-a" },
      "item-b": { id: "item-b" }
    },
    collapsedContainers: {
      "bag-a": true,
      "bag-b": true
    }
  };

  assert.deepEqual(
    removePublicTemplateCatalogEntry(catalog, { listId: demoListId, publicTemplateKind: "demo" })
      .map((entry) => entry.listId),
    ["public-demo-state"]
  );
  assert.deepEqual(removeManagedDemoTemplateTreesFromState(state, {
    listId: demoListId,
    language: "ru"
  }), ["layout-demo-copy"]);
  assert.equal(state.layouts["layout-demo-copy"], undefined);
  assert.equal(state.layouts["layout-other"].id, "layout-other");
  assert.equal(state.containers["bag-a"], undefined);
  assert.equal(state.items["item-a"], undefined);
  assert.equal(state.collapsedContainers["bag-a"], undefined);
});

test("public template delete is blocked for the last template of each kind in a language", () => {
  const label = (language) => language.toUpperCase();

  assert.equal(publicTemplateDeleteBlockReason({
    target: { type: "demo", demoListId: "public-demo-state", language: "ru" },
    layout: { adminDemo: true, adminDemoListId: "public-demo-state", adminDemoLanguage: "ru" },
    deletePublished: true,
    demoTemplates: [
      demoTemplateEntryForLanguage("ru", { listId: "public-demo-state", serverConfirmed: true }),
      demoTemplateEntryForLanguage("en", { listId: "public-demo-state-en", serverConfirmed: true })
    ],
    languageLabel: label
  }), "Нельзя удалить последний demo-шаблон для языка RU.");

  assert.equal(publicTemplateDeleteBlockReason({
    target: { type: "demo", demoListId: "public-demo-state", language: "ru" },
    layout: { adminDemo: true, adminDemoListId: "public-demo-state", adminDemoLanguage: "ru" },
    deletePublished: true,
    demoTemplates: [
      demoTemplateEntryForLanguage("ru", { listId: "public-demo-state", serverConfirmed: true }),
      demoTemplateEntryForLanguage("ru", { listId: "public-demo-state-copy-ru-2", serverConfirmed: true })
    ],
    languageLabel: label
  }), "");

  assert.equal(publicTemplateDeleteBlockReason({
    target: { type: "shared", sharedId: "template-copy-ru-last" },
    layout: { adminSharedSourceId: "template-copy-ru-last", language: "ru", adminTemplateCopy: true },
    deletePublished: true,
    sharedTemplates: [
      { id: "template-copy-ru-last", language: "ru", runtimeSharedTemplate: true },
      { id: "template-copy-en", language: "en", runtimeSharedTemplate: true }
    ],
    languageLabel: label
  }), "Нельзя удалить последний shared-шаблон для языка RU.");
});

test("empty public template draft records can be created for demo and shared languages", () => {
  const arrangement = { rootContainerIds: [], containers: {}, items: {}, packedItems: {} };
  const demo = createEmptyPublicTemplateDraftRecord({
    id: "layout-demo-new",
    name: "Demo EN",
    kind: "demo",
    language: "en",
    arrangement,
    demoListId: "public-demo-state-copy-en-new"
  });
  const shared = createEmptyPublicTemplateDraftRecord({
    id: "layout-shared-new",
    name: "Shared RU",
    kind: "shared",
    language: "ru",
    arrangement
  });

  assert.equal(demo.adminDemo, true);
  assert.equal(demo.adminTemplateCopy, true);
  assert.equal(demo.adminDemoLanguage, "en");
  assert.equal(demo.adminDemoListId, "public-demo-state-copy-en-new");
  assert.equal(shared.adminTemplateCopy, true);
  assert.equal(shared.language, "ru");
  assert.equal(isTemplateCopySharedId(shared.adminSharedSourceId), true);
});

test("demo and shared templates share the persistent draft contract", () => {
  const arrangement = { rootContainerIds: [], containers: {}, items: {}, packedItems: {} };
  const demo = createEmptyPublicTemplateDraftRecord({
    id: "layout-demo-draft",
    name: "Demo draft",
    kind: "demo",
    language: "ru",
    arrangement,
    demoListId: "public-demo-state-copy-ru-draft"
  });
  const shared = createEmptyPublicTemplateDraftRecord({
    id: "layout-shared-draft",
    name: "Shared draft",
    kind: "shared",
    language: "ru",
    arrangement
  });

  assert.equal(isManagedPublicTemplateDraft(demo), true);
  assert.equal(isManagedPublicTemplateDraft(shared), true);
  assert.equal(isDisposableManagedPublicDraft(demo), false);
  assert.equal(isDisposableManagedPublicDraft(shared), false);
  assert.equal(publicLayoutChoiceValue(demo, {
    demoChoiceForLayout: () => "demo-choice",
    demoChoiceForLanguage: () => "demo-language-choice"
  }), "template-draft:layout-demo-draft");
});

test("new demo and shared template copies are primed before photo copy", () => {
  assert.equal(shouldCreatePublishedTemplateBeforePhotos({
    adminDemo: true,
    adminTemplateCopy: true,
    adminDemoListId: "public-demo-state-copy-ru-new"
  }, null), true);
  assert.equal(shouldCreatePublishedTemplateBeforePhotos({
    adminSharedSourceId: "template-copy-ru-new",
    adminTemplateCopy: true
  }, null), true);
  assert.equal(shouldCreatePublishedTemplateBeforePhotos({
    adminDemo: true,
    adminTemplateCopy: true,
    adminDemoListId: "public-demo-state"
  }, { listId: "public-demo-state" }), false);
});

test("demo and shared template copies use the same server photo reference copy path", () => {
  assert.equal(shouldCopyPublicTemplatePhotoReferencesOnServer({
    adminDemo: true,
    adminTemplateCopy: true,
    adminDemoListId: "public-demo-state-copy-ru-new"
  }), true);
  assert.equal(shouldCopyPublicTemplatePhotoReferencesOnServer({
    adminSharedSourceId: "template-copy-ru-new",
    adminTemplateCopy: true
  }), true);
  assert.equal(shouldCopyPublicTemplatePhotoReferencesOnServer({
    adminDemo: true,
    adminTemplateCopy: false
  }), false);
  assert.equal(shouldCopyPublicTemplatePhotoReferencesOnServer({
    adminTemplateCopy: true
  }), false);
});

test("legacy demo shared source is treated as a demo template source", () => {
  assert.equal(isManagedDemoTemplateLayout({
    adminSharedSourceId: "demo-layout"
  }, "demo-layout"), true);
  assert.equal(isManagedDemoTemplateLayout({
    adminSharedSourceId: "template-copy-ru-1"
  }, "demo-layout"), false);
  assert.equal(isManagedDemoTemplateLayout({
    adminDemo: true,
    adminSharedSourceId: "template-copy-ru-1"
  }, "demo-layout"), true);
});

test("admin demo options use the same draft choice path as shared template drafts", () => {
  const options = buildAdminDemoTemplateOptions({
    canOpen: true,
    localLayouts: [{
      id: "layout-demo-draft",
      name: `${RU_DEMO_NAME} 2`,
      adminDemo: true,
      adminTemplateCopy: true,
      adminDemoLanguage: "ru",
      adminDemoListId: "public-demo-state-copy-ru-draft",
      rootContainerIds: []
    }],
    serverTemplates: [
      demoTemplateEntryForLanguage("ru", { listId: "public-demo-state", name: RU_DEMO_NAME, serverConfirmed: true })
    ],
    fallbackLanguage: "ru",
    draftChoice: (layoutId) => `template-draft:${layoutId}`,
    demoChoiceForTemplate: (entry) => `demo:${entry.language}:${entry.listId}`,
    labels: {
      templatePrefix: "Template",
      languageOptionLabel: (language) => language.toUpperCase()
    }
  });

  assert.deepEqual(new Set(options.map((option) => option[0])), new Set([
    "template-draft:layout-demo-draft",
    "demo:ru:public-demo-state"
  ]));
  assert.equal(options.find((option) => option[0] === "template-draft:layout-demo-draft")?.[2], "demo");
});

test("demo template drafts are solidified through the same arrangement path as shared drafts", () => {
  const state = {
    activeLayoutId: "layout-demo-draft",
    layouts: {
      "layout-demo-draft": {
        id: "layout-demo-draft",
        name: "Demo draft",
        adminDemo: true,
        adminDemoLanguage: "ru",
        adminDemoListId: "public-demo-state-copy-ru-draft",
        rootContainerIds: ["bag-root"],
        arrangement: { rootContainerIds: [], containers: {}, items: {}, packedItems: {} }
      }
    },
    containers: {
      "bag-root": {
        id: "bag-root",
        parentId: "",
        childIds: [],
        itemIds: ["item-a"],
        order: [{ type: "item", id: "item-a" }]
      }
    },
    items: {
      "item-a": { id: "item-a", containerId: "bag-root" }
    },
    packedItems: {
      "item-a": true
    }
  };

  assert.equal(solidifyTemplateDraftLayout(state, "layout-demo-draft", {
    liveSnapshotForRoot: (rootId) => ({
      rootId,
      containers: {
        [rootId]: state.containers[rootId]
      },
      items: {
        "item-a": state.items["item-a"]
      }
    })
  }), true);
  assert.deepEqual(state.layouts["layout-demo-draft"].arrangement.rootContainerIds, ["bag-root"]);
  assert.equal(state.layouts["layout-demo-draft"].arrangement.items["item-a"], "bag-root");
  assert.equal(state.layouts["layout-demo-draft"].arrangement.packedItems["item-a"], true);
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

test("published demo payload may be an empty template like shared templates", () => {
  const payload = {
    layouts: {
      "layout-main": {
        id: "layout-main",
        name: `${RU_DEMO_NAME} 3`,
        rootContainerIds: []
      }
    },
    activeLayoutId: "layout-main",
    containers: {},
    items: {},
    packedItems: {}
  };

  const normalized = normalizePublishedDemoTemplatePayload(payload, {
    fallbackName: RU_DEMO_NAME
  });

  assert.equal(normalized.activeLayoutId, "layout-main");
  assert.deepEqual(Object.keys(normalized.layouts), ["layout-main"]);
  assert.equal(normalized.layouts["layout-main"].name, `${RU_DEMO_NAME} 3`);
  assert.deepEqual(normalized.layouts["layout-main"].rootContainerIds, []);
  assert.deepEqual(normalized.containers, {});
  assert.deepEqual(normalized.items, {});
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

test("guest demo cleanup does not remove user-created guest layouts", () => {
  const layouts = {
    auto: { id: "layout-guest-demo-1", guestDemoCopy: true, demoSourceLanguage: "en", updatedAt: "2026-05-24T08:00:00.000Z" },
    autoStale: { id: "layout-guest-demo-2", guestDemoCopy: true, demoSourceLanguage: "en", updatedAt: "2026-05-24T07:00:00.000Z" },
    userEmpty: { id: "layout-user-empty", guestDemoCopy: true, name: "My empty plan", updatedAt: "2026-05-24T09:00:00.000Z" },
    userCopy: { id: "layout-user-copy", guestDemoCopy: true, name: "Copied shared", updatedAt: "2026-05-24T10:00:00.000Z" }
  };

  const plan = guestDemoCopyCleanupPlan({
    layouts,
    activeLayoutId: "layout-user-empty",
    isAutomaticDemoCopy: isAutomaticGuestDemoCopyLayout,
    hasUserEdits: () => false
  });

  assert.equal(plan.keepLayoutId, "layout-guest-demo-1");
  assert.deepEqual(plan.removeLayoutIds, ["layout-guest-demo-2"]);
});

test("guest import plan includes all user-created guest layouts and edited demo", () => {
  const layouts = {
    autoClean: {
      id: "layout-guest-demo-clean",
      guestDemoCopy: true,
      demoSourceLanguage: "en",
      createdAt: "2026-05-24T08:00:00.000Z",
      updatedAt: "2026-05-24T08:00:00.000Z"
    },
    autoEdited: {
      id: "layout-guest-demo-edited",
      guestDemoCopy: true,
      demoSourceLanguage: "en",
      createdAt: "2026-05-24T08:00:00.000Z",
      updatedAt: "2026-05-24T08:05:00.000Z"
    },
    userEmpty: {
      id: "layout-user-empty",
      guestDemoCopy: true,
      createdAt: "2026-05-24T09:00:00.000Z",
      updatedAt: "2026-05-24T09:00:00.000Z"
    },
    userCopy: {
      id: "layout-user-copy",
      guestDemoCopy: true,
      createdAt: "2026-05-24T10:00:00.000Z",
      updatedAt: "2026-05-24T10:00:00.000Z"
    }
  };

  const plan = guestLocalLayoutImportPlan({
    layouts,
    activeLayoutId: "layout-user-empty",
    isAutomaticDemoCopy: isAutomaticGuestDemoCopyLayout,
    hasUserEdits: (layout) => guestDemoCopyRecordWasEdited(layout, layout)
  });

  assert.equal(plan.primaryLayoutId, "layout-user-empty");
  assert.deepEqual(plan.layoutIds, ["layout-user-empty", "layout-user-copy", "layout-guest-demo-edited"]);
});

test("guest import plan includes personal guest layouts without legacy guest flag", () => {
  const layouts = {
    personal: {
      id: "layout-personal",
      name: "My guest tab",
      createdAt: "2026-05-24T09:00:00.000Z",
      updatedAt: "2026-05-24T09:00:00.000Z"
    },
    publicDraft: {
      id: "layout-public-draft",
      name: "Public draft",
      adminDemo: true,
      createdAt: "2026-05-24T10:00:00.000Z",
      updatedAt: "2026-05-24T10:00:00.000Z"
    }
  };

  assert.equal(isGuestLocalPersonalLayout(layouts.personal), true);
  assert.equal(isGuestLocalPersonalLayout(layouts.publicDraft), false);
  const plan = guestLocalLayoutImportPlan({
    layouts,
    activeLayoutId: "layout-personal",
    isAutomaticDemoCopy: isAutomaticGuestDemoCopyLayout,
    hasUserEdits: () => false
  });

  assert.deepEqual(plan.layoutIds, ["layout-personal"]);
});

test("guest display preference changes do not import an unedited automatic demo layout", () => {
  const sourceState = {
    itemDisplayMode: "photos",
    showItemMeta: false,
    showFilterContext: true
  };
  const layouts = {
    autoClean: {
      id: "layout-guest-demo-clean",
      guestDemoCopy: true,
      demoSourceLanguage: "en",
      createdAt: "2026-05-24T08:00:00.000Z",
      updatedAt: "2026-05-24T08:00:00.000Z"
    }
  };

  assert.equal(guestLocalDisplayPreferencesWereChanged(sourceState), true);
  const plan = guestLocalLayoutImportPlan({
    layouts,
    activeLayoutId: "layout-guest-demo-clean",
    isAutomaticDemoCopy: isAutomaticGuestDemoCopyLayout,
    hasUserEdits: () => false
  });

  assert.deepEqual(plan.layoutIds, []);
});

test("guest import plan can keep personal layouts while skipping unedited automatic demo", () => {
  const layouts = {
    autoClean: {
      id: "layout-guest-demo-clean",
      guestDemoCopy: true,
      demoSourceLanguage: "en",
      createdAt: "2026-05-24T08:00:00.000Z",
      updatedAt: "2026-05-24T08:00:00.000Z"
    },
    personal: {
      id: "layout-personal",
      name: "My guest tab",
      createdAt: "2026-05-24T09:00:00.000Z",
      updatedAt: "2026-05-24T09:00:00.000Z"
    }
  };

  const plan = guestLocalLayoutImportPlan({
    layouts,
    activeLayoutId: "layout-personal",
    isAutomaticDemoCopy: isAutomaticGuestDemoCopyLayout,
    hasUserEdits: (layout) => guestDemoCopyRecordWasEdited(layout, layout)
  });

  assert.deepEqual(plan.layoutIds, ["layout-personal"]);
});

test("guest display preferences are copied to imported account state", () => {
  const preferences = guestLocalDisplayPreferences({
    itemDisplayMode: "photos",
    showItemMeta: false,
    showFilterContext: true
  });
  const targetState = {
    itemDisplayMode: "none",
    showItemMeta: false,
    showFilterContext: false
  };

  assert.equal(applyGuestLocalDisplayPreferences(targetState, preferences), true);
  assert.deepEqual(targetState, {
    itemDisplayMode: "photos",
    showItemMeta: false,
    showFilterContext: true
  });
});

test("guest import sync validation rejects the empty local import that server save blocks", () => {
  const emptyImportedState = {
    layouts: {
      "layout-imported": {
        id: "layout-imported",
        name: "Demo-packing",
        rootContainerIds: [],
        arrangement: { rootContainerIds: [], containers: {}, items: {} }
      }
    },
    containers: {},
    items: {}
  };

  const validation = validateGuestImportSyncState(emptyImportedState, ["layout-imported"]);

  assert.equal(validation.ok, false);
  assert.equal(validation.reason, "empty-state");
  assert.equal(validation.stats.totalContainerCount, 0);
  assert.equal(validation.stats.totalItemCount, 0);
});

test("guest import sync validation requires saved remote state to return imported layouts with content", () => {
  const savedState = {
    layouts: {
      "layout-imported": {
        id: "layout-imported",
        name: "Demo-packing",
        rootContainerIds: ["container-root"],
        arrangement: {
          rootContainerIds: ["container-root"],
          containers: {
            "container-root": {
              parentId: "",
              itemIds: ["item-a"],
              childIds: [],
              order: [{ type: "item", id: "item-a" }]
            }
          },
          items: {
            "item-a": "container-root"
          }
        }
      }
    },
    containers: {
      "container-root": {
        id: "container-root",
        itemIds: ["item-a"],
        childIds: [],
        order: [{ type: "item", id: "item-a" }]
      }
    },
    items: {
      "item-a": {
        id: "item-a",
        containerId: "container-root",
        name: "Tent"
      }
    }
  };
  const missingRemoteState = {
    ...savedState,
    layouts: {}
  };

  const savedValidation = validateGuestImportSyncState(savedState, ["layout-imported"]);
  const missingValidation = validateGuestImportSyncState(missingRemoteState, ["layout-imported"]);

  assert.equal(savedValidation.ok, true);
  assert.equal(savedValidation.stats.importedLayoutCount, 1);
  assert.equal(savedValidation.stats.importedContainerCount, 1);
  assert.equal(savedValidation.stats.importedItemCount, 1);
  assert.equal(missingValidation.ok, false);
  assert.equal(missingValidation.reason, "missing-layouts");
});

test("guest demo edit detection uses local copy time as baseline", () => {
  const layout = {
    id: "layout-guest-demo-1",
    guestDemoCopy: true,
    demoSourceLanguage: "en",
    guestDemoCopyCreatedAt: "2026-05-24T10:00:00.000Z",
    createdAt: "2026-05-24T10:00:00.000Z",
    updatedAt: "2026-05-24T10:00:00.000Z"
  };

  assert.equal(
    guestDemoCopyRecordWasEdited({ createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-05-24T09:00:00.000Z" }, layout),
    false
  );
  assert.equal(
    guestDemoCopyRecordWasEdited({ createdAt: "2026-05-24T10:00:00.000Z", updatedAt: "2026-05-24T10:00:01.000Z" }, layout),
    true
  );
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

test("automatic guest demo layout prefers confirmed template title over mojibake payload name", () => {
  const uniqueName = (name) => `${name} 2`;

  assert.equal(
    guestDemoCopyLayoutName("Р”РµРјРѕ-СѓРєР»Р°РґРєР°", {
      fallbackName: "Demo copy",
      preferredName: "Demo-packing",
      normalizeName: (name) => name.trim(),
      uniqueName,
      exactTemplateName: true
    }),
    "Demo-packing"
  );
  assert.equal(
    guestDemoCopyLayoutName("Р”РµРјРѕ-СѓРєР»Р°РґРєР°", {
      fallbackName: "Demo copy",
      preferredName: "Demo-packing",
      normalizeName: (name) => name.trim(),
      uniqueName,
      exactTemplateName: false
    }),
    "Demo-packing 2"
  );
});

test("private mojibake layout names are repaired from catalog fallback names", () => {
  const state = {
    layouts: {
      privateLayout: {
        id: "privateLayout",
        name: "Р”РµРјРѕ-СѓРєР»Р°РґРєР°",
        demoSourceLanguage: "en"
      },
      publicTemplate: {
        id: "publicTemplate",
        name: "Р”РµРјРѕ-СѓРєР»Р°РґРєР°",
        adminDemo: true
      }
    }
  };

  assert.equal(repairMojibakeLayoutNames(state, {
    fallbackNameForLayout: (layout) => layout.demoSourceLanguage === "en" ? "Demo-packing" : ""
  }), true);
  assert.equal(state.layouts.privateLayout.name, "Demo-packing");
  assert.equal(state.layouts.publicTemplate.name, "Р”РµРјРѕ-СѓРєР»Р°РґРєР°");
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
    title: "Renamed shared template",
    language: "en"
  };
  const layoutsByLanguage = {
    ru: [{
      id: "template-copy-ru-123",
      name: "Old payload/runtime name",
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
  assert.equal(confirmed[0].name, "Renamed shared template");
  assert.equal(confirmed[0].language, "en");
});

test("public template metadata is applied over stale payload layout titles", () => {
  const payload = {
    activeLayoutId: "layout-main",
    layouts: {
      "layout-main": {
        id: "layout-main",
        name: "Old payload title",
        language: "ru"
      }
    },
    containers: {},
    items: {}
  };

  const next = applyPublicTemplateMetadataToPayload(payload, {
    title: "Metadata title",
    language: "en"
  });

  assert.equal(next.layouts["layout-main"].name, "Metadata title");
  assert.equal(next.layouts["layout-main"].language, "en");
  assert.equal(payload.layouts["layout-main"].name, "Old payload title");
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

test("empty public shared payload is a valid template payload", () => {
  assert.equal(isPublicSharedTemplatePayload({
    activeLayoutId: "layout-main",
    layouts: {
      "layout-main": {
        id: "layout-main",
        name: "Empty shared template",
        rootContainerIds: []
      }
    },
    containers: {},
    items: {}
  }), true);
  assert.equal(isPublicSharedTemplatePayload({
    activeLayoutId: "layout-main",
    layouts: {},
    containers: {}
  }), false);
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

test("private copies from public templates are marked in entity notes", () => {
  const item = { id: "item-a", note: "Keep dry" };
  const container = { id: "bag-a", note: "" };

  assert.equal(appendCopiedFromTemplateNote(item, "Demo-packing"), true);
  assert.equal(item.note, "Keep dry\nСкопировано из шаблона: Demo-packing");
  assert.equal(appendCopiedFromTemplateNote(item, "Demo-packing"), false);
  assert.equal(item.note, "Keep dry\nСкопировано из шаблона: Demo-packing");
  assert.equal(appendCopiedFromTemplateNote(container, "Tristan Kit"), true);
  assert.equal(container.note, "Скопировано из шаблона: Tristan Kit");
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

test("admin template options can show local drafts before server confirmation", () => {
  const options = buildAdminSharedTemplateOptions({
    canOpen: true,
    localLayouts: [{
      id: "layout-local-draft",
      name: "New shared template",
      adminTemplateCopy: true,
      adminSharedSourceId: "template-copy-ru-new",
      language: "ru",
      rootContainerIds: []
    }],
    sharedLayouts: [],
    serverConfirmedSharedLayouts: [],
    requireServerConfirmationForSharedTemplates: true,
    allowUnconfirmedLocalLayouts: true,
    fallbackLanguage: "ru",
    isLayoutMeaningful: () => false,
    templateCopySourceScore: () => 0,
    labels: {
      templatePrefix: "Template",
      languageOptionLabel: (language) => language.toUpperCase()
    }
  });

  assert.equal(options.length, 1);
  assert.equal(options[0][0], "template-draft:layout-local-draft");
  assert.equal(options[0][1], "Template: New shared template (RU)");
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

test("readonly public template options get a stable lock marker", () => {
  assert.equal(
    readonlyPublicTemplateOptionLabel("Template: Demo", { readonly: false }),
    "Template: Demo"
  );
  assert.equal(
    readonlyPublicTemplateOptionLabel("Template: Demo", { readonly: true }),
    "🔒 Template: Demo"
  );
  assert.equal(
    readonlyPublicTemplateOptionLabel("🔒 Template: Demo", { readonly: true }),
    "🔒 Template: Demo"
  );
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
