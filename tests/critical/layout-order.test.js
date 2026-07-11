import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLayoutOrderToState,
  applyLayoutOrderToSources,
  layoutOrderIdsFromSections,
  layoutOrderSections,
  layoutOrderSectionsFromSources,
  orderedLayouts,
  moveLayoutBeforeInSections,
  moveLayoutWithinSections,
  sortLayoutSectionByDate,
  sortLayoutSectionByName
} from "../../src/state/layout-order.js";

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
