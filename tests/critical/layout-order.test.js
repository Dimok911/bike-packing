import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyLayoutOrderToState,
  applyLayoutOrderToSources,
  changedPersonalLayoutOrderIds,
  layoutOrderIdsFromSections,
  layoutOrderSections,
  layoutOrderSectionsFromSources,
  orderedLayouts,
  moveLayoutBeforeInSections,
  moveLayoutWithinSections,
  sortLayoutSectionByDate,
  sortLayoutSectionByName
} from "../../src/state/layout-order.js";
import {
  persistPublicTemplateOrderUpdates,
  publicTemplateOrderPatchRequest,
  publicTemplateOrderUpdates
} from "../../src/public/public-template-order-sync.js";
import { publicDemoTemplateEntryFromRecord } from "../../src/public/public-template-catalog.js";
import { sharedLayoutCatalogEntryFromPublicRecord } from "../../src/public/shared-layouts.js";

function createState() {
  return {
    layouts: {
      "demo-b": { id: "demo-b", name: "Demo B", adminDemo: true, createdAt: "2026-02-01T00:00:00.000Z" },
      "demo-a": { id: "demo-a", name: "Demo A", adminDemo: true, createdAt: "2026-01-01T00:00:00.000Z" },
      "shared-b": { id: "shared-b", name: "Shared B", adminSharedSourceId: "shared-b", createdAt: "2026-04-01T00:00:00.000Z" },
      "shared-a": { id: "shared-a", name: "Shared A", adminSharedSourceId: "shared-a", createdAt: "2026-03-01T00:00:00.000Z" },
      "layout-b": { id: "layout-b", name: "Packing B", createdAt: "2026-06-01T00:00:00.000Z" },
      "layout-a": { id: "layout-a", name: "Packing A", createdAt: "2026-05-01T00:00:00.000Z" }
    }
  };
}

test("CRITICAL layout order: sections are always demo, shared, personal", () => {
  const sections = layoutOrderSections(createState().layouts);

  assert.deepEqual(sections.map((section) => section.id), ["demo", "shared", "personal"]);
  assert.deepEqual(sections.map((section) => section.layouts.map((layout) => layout.id)), [
    ["demo-b", "demo-a"],
    ["shared-b", "shared-a"],
    ["layout-b", "layout-a"]
  ]);
});

test("CRITICAL layout order: personal fallback keeps existing creation order", () => {
  const state = createState();

  assert.deepEqual(orderedLayouts(state.layouts, {
    includeLayout: (layout) => !layout.adminDemo && !layout.adminSharedSourceId
  }).map((layout) => layout.id), ["layout-b", "layout-a"]);
});

test("CRITICAL layout order: item and bag copy targets use the main selector order", () => {
  const controllers = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
  const helper = controllers.slice(
    controllers.indexOf("function orderedPersonalCopyTargetLayouts"),
    controllers.indexOf("async function openSharedItemCopyPicker")
  );
  const pickerOptions = controllers.slice(
    controllers.indexOf("function getContainerPickerLayoutOptions"),
    controllers.indexOf("async function offerCreateLayoutWhenNoCopyTargets")
  );

  assert.match(helper, /return orderedLayouts\(state\.layouts/);
  assert.match(helper, /guestDemoCopyFlag: GUEST_DEMO_COPY_FLAG/);
  assert.match(helper, /locale: uiLanguage \|\| "ru"/);
  assert.match(pickerOptions, /const personalLayouts = orderedPersonalCopyTargetLayouts\(\)/);
});

test("CRITICAL layout order: public template catalog entries render without local drafts", () => {
  const sections = layoutOrderSectionsFromSources({
    layouts: {
      "layout-a": { id: "layout-a", name: "Packing A" }
    },
    demoTemplates: [
      { id: "public-demo-state", listId: "public-demo-state", name: "Demo", language: "ru", serverConfirmed: true }
    ],
    sharedTemplates: [
      { id: "shared-a", name: "Shared A", language: "ru", serverConfirmed: true }
    ]
  });

  assert.deepEqual(sections.map((section) => section.layouts.map((layout) => layout.id)), [
    ["public-demo:public-demo-state"],
    ["public-shared:shared-a"],
    ["layout-a"]
  ]);
});

test("CRITICAL layout order: server catalog hides legacy local template history", () => {
  const sections = layoutOrderSectionsFromSources({
    layouts: {
      "legacy-demo-a": { id: "legacy-demo-a", name: "Old demo 1", adminDemo: true },
      "legacy-demo-b": { id: "legacy-demo-b", name: "Old demo 2", adminDemo: true },
      "current-draft": {
        id: "current-draft",
        name: "Unpublished demo",
        adminDemo: true,
        adminTemplateCopy: true,
        adminDemoListId: "draft-demo"
      },
      "layout-a": { id: "layout-a", name: "Packing A" }
    },
    demoTemplates: [
      { id: "public-demo-state", listId: "public-demo-state", name: "Demo", language: "ru", serverConfirmed: true }
    ],
    serverCatalogVisible: true
  });

  assert.deepEqual(sections.map((section) => section.layouts.map((layout) => layout.id)), [
    ["public-demo:public-demo-state", "current-draft"],
    [],
    ["layout-a"]
  ]);
});

test("CRITICAL layout order: lightweight server catalogs retain cross-device order", () => {
  assert.equal(publicDemoTemplateEntryFromRecord({
    id: "public-demo-state",
    language: "ru",
    layoutOrder: 4
  }).layoutOrder, 4);
  assert.equal(sharedLayoutCatalogEntryFromPublicRecord({
    id: "public-shared-layout-shared-a",
    sharedLayoutId: "shared-a",
    language: "en",
    layoutOrder: 5
  }).layoutOrder, 5);
});

test("CRITICAL layout order: manual moves stay inside their section", () => {
  const sections = layoutOrderSections(createState().layouts);
  const moved = moveLayoutWithinSections(sections, "shared-b", 1);

  assert.deepEqual(layoutOrderIdsFromSections(moved), [
    "demo-b",
    "demo-a",
    "shared-a",
    "shared-b",
    "layout-b",
    "layout-a"
  ]);
});

test("CRITICAL layout order: drag target cannot cross section boundaries", () => {
  const sections = layoutOrderSections(createState().layouts);
  const moved = moveLayoutBeforeInSections(sections, "layout-a", "demo-b");

  assert.deepEqual(layoutOrderIdsFromSections(moved), layoutOrderIdsFromSections(sections));
});

test("CRITICAL layout order: section sort supports names and creation dates", () => {
  const sections = layoutOrderSections(createState().layouts);

  assert.deepEqual(layoutOrderIdsFromSections(sortLayoutSectionByName(sections, "personal", "asc")), [
    "demo-b",
    "demo-a",
    "shared-b",
    "shared-a",
    "layout-a",
    "layout-b"
  ]);
  assert.deepEqual(layoutOrderIdsFromSections(sortLayoutSectionByDate(sections, "demo", "asc")), [
    "demo-a",
    "demo-b",
    "shared-b",
    "shared-a",
    "layout-b",
    "layout-a"
  ]);
});

test("CRITICAL layout order: applying order writes layoutOrder and preserves dictionary order", () => {
  const state = createState();
  const touched = [];
  const orderedIds = ["demo-a", "demo-b", "shared-a", "shared-b", "layout-a", "layout-b"];

  assert.equal(applyLayoutOrderToState(state, orderedIds, {
    changedAt: "2026-07-10T00:00:00.000Z",
    markEdited: (layout, changedAt) => touched.push(`${layout.id}:${changedAt}`)
  }), true);

  assert.deepEqual(Object.keys(state.layouts), orderedIds);
  assert.equal(state.layouts["demo-a"].layoutOrder, 1);
  assert.equal(state.layouts["layout-b"].layoutOrder, 6);
  assert.equal(touched.length, 6);
});

test("CRITICAL layout order: personal order save waits for every changed private layout", () => {
  const before = {
    "layout-a": { id: "layout-a", layoutOrder: 1 },
    "layout-b": { id: "layout-b", layoutOrder: 2 },
    "layout-public": { id: "layout-public", adminSharedSourceId: "shared-a", layoutOrder: 1 }
  };
  const after = {
    "layout-a": { id: "layout-a", layoutOrder: 2 },
    "layout-b": { id: "layout-b", layoutOrder: 1 },
    "layout-public": { id: "layout-public", adminSharedSourceId: "shared-a", layoutOrder: 2 }
  };

  assert.deepEqual(changedPersonalLayoutOrderIds(before, after), ["layout-a", "layout-b"]);

  const controllers = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
  const saveFlow = controllers.slice(
    controllers.indexOf("async function applyLayoutOrderSections"),
    controllers.indexOf("function toggleLayoutOrderPanel")
  );
  assert.match(saveFlow, /await saveRemoteState\(\{/);
  assert.match(saveFlow, /layouts:\s*personalOrderLayoutIds/);
});

test("CRITICAL layout order: applying public template order updates runtime catalogs", () => {
  const state = createState();
  const demoTemplates = [
    { id: "public-demo-state", listId: "public-demo-state", name: "Demo" }
  ];
  const sharedTemplates = [
    { id: "shared-a", name: "Shared A" }
  ];
  const result = applyLayoutOrderToSources(state, [
    "public-demo:public-demo-state",
    "public-shared:shared-a",
    "layout-a"
  ], {
    demoTemplates,
    sharedTemplates,
    changedAt: "2026-07-10T00:00:00.000Z",
    markEdited: () => {}
  });

  assert.equal(result.changed, true);
  assert.equal(result.stateChanged, true);
  assert.equal(result.demoTemplates[0].layoutOrder, 1);
  assert.equal(result.sharedTemplates[0].layoutOrder, 2);
  assert.equal(state.layouts["layout-a"].layoutOrder, 1);
});

test("CRITICAL layout order: public template order changes produce server metadata patches", () => {
  const updates = publicTemplateOrderUpdates({
    beforeDemoTemplates: [{ listId: "public-demo-state", language: "ru", name: "Demo", layoutOrder: 2 }],
    afterDemoTemplates: [{ listId: "public-demo-state", language: "ru", name: "Demo", layoutOrder: 1 }],
    beforeSharedTemplates: [{ id: "shared-a", language: "en", name: "Shared", layoutOrder: 1 }],
    afterSharedTemplates: [{ id: "shared-a", language: "en", name: "Shared", layoutOrder: 2 }]
  });

  assert.deepEqual(updates.map(({ type, sourceId, layoutOrder }) => ({ type, sourceId, layoutOrder })), [
    { type: "demo", sourceId: "public-demo-state", layoutOrder: 1 },
    { type: "shared", sourceId: "shared-a", layoutOrder: 2 }
  ]);
  assert.deepEqual(publicTemplateOrderPatchRequest(updates[1]), {
    path: "/bike-packing/admin/shared-layouts/shared-a/metadata",
    body: { title: "Shared", name: "Shared", language: "en", layoutOrder: 2 }
  });
});

test("CRITICAL layout order: a server patch must confirm the saved order", async () => {
  const calls = [];
  await persistPublicTemplateOrderUpdates([{
    type: "shared",
    sourceId: "shared-a",
    name: "Shared",
    language: "ru",
    layoutOrder: 3
  }], {
    apiFetch: async (path, options) => {
      calls.push({ path, options });
      return { layoutOrder: 3 };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(JSON.parse(calls[0].options.body).layoutOrder, 3);

  await assert.rejects(() => persistPublicTemplateOrderUpdates([{
    type: "shared",
    sourceId: "shared-a",
    name: "Shared",
    language: "ru",
    layoutOrder: 4
  }], {
    apiFetch: async () => ({ ok: true })
  }), /did not confirm layoutOrder/);
});
