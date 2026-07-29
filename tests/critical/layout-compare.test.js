import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLayoutComparison,
  comparisonContainerEntries,
  comparisonEntryVisible
} from "../../src/state/layout-compare.js";
import { renderLayoutComparisonBoardHtml } from "../../src/ui/layout-comparison-render.js";
import {
  loadLayoutComparisonSelection,
  saveLayoutComparisonSelection
} from "../../src/ui/layout-comparison-selection.js";
import { comparisonMoveArrowGeometry } from "../../src/ui/layout-comparison-link.js";
import { readFileSync } from "node:fs";

const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const appTailSource = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");

function placement({ parentId = "", itemIds = [], childIds = [] } = {}) {
  return {
    parentId,
    itemIds,
    childIds,
    order: [
      ...itemIds.map((id) => ({ type: "item", id })),
      ...childIds.map((id) => ({ type: "container", id }))
    ]
  };
}

function layout(id, roots, containers, items) {
  return {
    id,
    name: id,
    rootContainerIds: roots,
    arrangement: {
      rootContainerIds: roots,
      containers,
      items,
      packedItems: {}
    }
  };
}

test("CRITICAL layout comparison uses shared entity ids across independently created layouts", () => {
  const state = {
    items: {
      stove: { id: "stove", name: "Stove", weight: 100 },
      mug: { id: "mug", name: "Mug", weight: 50 },
      pump: { id: "pump", name: "Pump", weight: 80 }
    },
    containers: {
      handlebar: { id: "handlebar", name: "Handlebar", weight: 200 },
      saddle: { id: "saddle", name: "Saddle", weight: 300 }
    },
    layouts: {
      long: layout("long", ["handlebar", "saddle"], {
        handlebar: placement({ itemIds: ["stove", "mug"] }),
        saddle: placement()
      }, { stove: "handlebar", mug: "handlebar" }),
      weekend: layout("weekend", ["handlebar", "saddle"], {
        handlebar: placement(),
        saddle: placement({ itemIds: ["stove", "pump"] })
      }, { stove: "saddle", pump: "saddle" })
    }
  };

  const comparison = buildLayoutComparison(state, "long", "weekend");

  assert.equal(comparison.itemDiffs.stove.status, "moved");
  assert.equal(comparison.itemDiffs.stove.fromContainerId, "handlebar");
  assert.equal(comparison.itemDiffs.stove.toContainerId, "saddle");
  assert.equal(comparison.itemDiffs.mug.status, "removed");
  assert.equal(comparison.itemDiffs.pump.status, "added");
  assert.deepEqual(comparison.summary, {
    addedItems: 1,
    removedItems: 1,
    movedItems: 1,
    addedContainers: 0,
    removedContainers: 0,
    movedContainers: 0,
    fromWeight: 650,
    toWeight: 680,
    weightDelta: 30
  });

  assert.deepEqual(comparisonContainerEntries(comparison, "handlebar"), [
    { type: "item", id: "stove", variant: "source-ghost" },
    { type: "item", id: "mug", variant: "source" }
  ]);
  assert.deepEqual(comparisonContainerEntries(comparison, "saddle"), [
    { type: "item", id: "stove", variant: "target" },
    { type: "item", id: "pump", variant: "target" }
  ]);
});

test("CRITICAL moved container stays one operation while its internal changes are compared", () => {
  const state = {
    items: {
      bandage: { id: "bandage", name: "Bandage" },
      iodine: { id: "iodine", name: "Iodine" },
      patches: { id: "patches", name: "Patches" }
    },
    containers: {
      handlebar: { id: "handlebar", name: "Handlebar" },
      saddle: { id: "saddle", name: "Saddle" },
      firstAid: { id: "firstAid", name: "First aid" }
    },
    layouts: {
      before: layout("before", ["handlebar", "saddle"], {
        handlebar: placement({ childIds: ["firstAid"] }),
        saddle: placement(),
        firstAid: placement({ parentId: "handlebar", itemIds: ["bandage", "iodine"] })
      }, { bandage: "firstAid", iodine: "firstAid" }),
      after: layout("after", ["handlebar", "saddle"], {
        handlebar: placement(),
        saddle: placement({ childIds: ["firstAid"] }),
        firstAid: placement({ parentId: "saddle", itemIds: ["bandage", "patches"] })
      }, { bandage: "firstAid", patches: "firstAid" })
    }
  };

  const comparison = buildLayoutComparison(state, "before", "after");

  assert.equal(comparison.containerDiffs.firstAid.status, "moved");
  assert.equal(comparison.itemDiffs.bandage.status, "unchanged");
  assert.equal(comparison.itemDiffs.iodine.status, "removed");
  assert.equal(comparison.itemDiffs.patches.status, "added");
  assert.equal(comparison.summary.movedContainers, 1);
  assert.equal(comparison.summary.movedItems, 0);

  assert.deepEqual(comparisonContainerEntries(comparison, "handlebar"), [
    { type: "container", id: "firstAid", variant: "source-ghost" }
  ]);
  assert.deepEqual(comparisonContainerEntries(comparison, "saddle"), [
    { type: "container", id: "firstAid", variant: "target" }
  ]);
  assert.deepEqual(comparisonContainerEntries(comparison, "firstAid"), [
    { type: "item", id: "bandage", variant: "target" },
    { type: "item", id: "patches", variant: "target" },
    { type: "item", id: "iodine", variant: "source" }
  ]);
  assert.equal(comparisonEntryVisible(comparison, { type: "item", id: "bandage" }, true), false);
  assert.equal(comparisonEntryVisible(comparison, { type: "item", id: "iodine" }, true), true);
  assert.equal(comparisonEntryVisible(comparison, { type: "container", id: "firstAid" }, true), true);

  const translations = {
    "compare.statusAdd": "+ Add",
    "compare.statusRemove": "− Remove",
    "compare.statusMoveHere": "Here from {source}",
    "compare.statusTakeFromHere": "Take from here to {destination}",
    "compare.layoutRoot": "root",
    "compare.unnamedItem": "Unnamed item",
    "compare.unnamedContainer": "Unnamed container",
    "compare.noChangesTitle": "No changes",
    "compare.noChangesText": "Layouts match",
    "tooltips.expand": "Expand",
    "tooltips.collapse": "Collapse"
  };
  const t = (key, values = {}) => String(translations[key] || key)
    .replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
  const html = renderLayoutComparisonBoardHtml({
    comparison,
    escapeHtml: (value) => String(value),
    formatItemWeight: () => "0 g",
    onlyChanges: true,
    state,
    t
  });

  assert.match(html, /comparison-source-ghost[\s\S]*First aid[\s\S]*Take from here to Saddle/);
  assert.match(html, /comparison-moved[\s\S]*First aid[\s\S]*Here from Handlebar/);
  assert.match(html, /Patches[\s\S]*\+ Add/);
  assert.match(html, /Iodine[\s\S]*− Remove/);
  assert.doesNotMatch(html, /Bandage/);
});

test("CRITICAL comparison is read-only and does not mutate either layout", () => {
  const state = {
    items: { map: { id: "map", name: "Map" } },
    containers: { bag: { id: "bag", name: "Bag" } },
    layouts: {
      a: layout("a", ["bag"], { bag: placement({ itemIds: ["map"] }) }, { map: "bag" }),
      b: layout("b", ["bag"], { bag: placement() }, {})
    }
  };
  const before = structuredClone(state);

  buildLayoutComparison(state, "a", "b");

  assert.deepEqual(state, before);
});

test("CRITICAL comparison dialog remains scrollable inside the viewport", () => {
  assert.match(stylesSource, /#layoutCompareDialog\s*\{[^}]*max-height:\s*calc\(100dvh - 24px\);[^}]*overflow:\s*hidden;/s);
  assert.match(stylesSource, /\.layout-compare-dialog-card\s*\{[^}]*max-height:\s*inherit;[^}]*box-sizing:\s*border-box;[^}]*overflow-y:\s*auto;/s);
});

test("CRITICAL comparison remembers the last valid layout pair locally", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };

  assert.equal(saveLayoutComparisonSelection("comparison-key", {
    fromLayoutId: "long",
    toLayoutId: "weekend"
  }, storage), true);
  assert.deepEqual(
    loadLayoutComparisonSelection("comparison-key", ["weekend", "long"], storage),
    { fromLayoutId: "long", toLayoutId: "weekend" }
  );
  assert.equal(loadLayoutComparisonSelection("comparison-key", ["long"], storage), null);
});

test("CRITICAL moved items keep photos in both the pale source card and destination card", () => {
  const state = {
    items: {
      stove: {
        id: "stove",
        name: "Stove",
        location: "Workshop",
        photos: [{ id: "photo-stove" }]
      }
    },
    containers: {
      oldPouch: { id: "oldPouch", name: "Old pouch" },
      saddle: { id: "saddle", name: "Saddle bag" }
    },
    layouts: {
      before: layout("before", ["oldPouch", "saddle"], {
        oldPouch: placement({ itemIds: ["stove"] }),
        saddle: placement()
      }, { stove: "oldPouch" }),
      after: layout("after", ["saddle"], {
        saddle: placement({ itemIds: ["stove"] })
      }, { stove: "saddle" })
    }
  };
  const comparison = buildLayoutComparison(state, "before", "after");
  const t = (key, values = {}) => String({
    "compare.statusMoveHere": "Here from {source}",
    "compare.statusTakeFromHere": "Take from here to {destination}",
    "compare.layoutRoot": "root",
    "compare.unnamedItem": "Unnamed item",
    "compare.unnamedContainer": "Unnamed container",
    "compare.noChangesTitle": "No changes",
    "compare.noChangesText": "Layouts match",
    "tooltips.expand": "Expand",
    "tooltips.collapse": "Collapse"
  }[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");

  const html = renderLayoutComparisonBoardHtml({
    comparison,
    escapeHtml: (value) => String(value),
    formatItemWeight: () => "100 g",
    onlyChanges: true,
    renderPhoto: (record) => record.photos?.length
      ? `<img data-test-photo="${record.photos[0].id}">`
      : "",
    state,
    t
  });

  assert.equal((html.match(/data-comparison-entity="item:stove"/g) || []).length, 2);
  assert.equal((html.match(/data-test-photo="photo-stove"/g) || []).length, 2);
  assert.equal((html.match(/data-compare-show-move-link/g) || []).length, 2);
  assert.match(html, /data-comparison-variant="source-ghost"/);
  assert.match(html, /data-comparison-variant="target"/);
  assert.match(html, /comparison-source-ghost[\s\S]*data-test-photo="photo-stove"/);
  assert.match(html, /comparison-moved[\s\S]*data-test-photo="photo-stove"/);
});

test("CRITICAL moved-item arrow points from the source card edge to the destination card edge", () => {
  const geometry = comparisonMoveArrowGeometry(
    { left: 10, right: 110, top: 20, bottom: 100, width: 100, height: 80 },
    { left: 310, right: 410, top: 180, bottom: 260, width: 100, height: 80 },
    {
      boardRect: { left: 10, top: 20 },
      scrollLeft: 40,
      scrollTop: 0
    }
  );

  assert.deepEqual(geometry.start, { x: 140, y: 40 });
  assert.deepEqual(geometry.end, { x: 340, y: 200 });
  assert.match(geometry.path, /^M 140 40 C /);
  assert.match(geometry.path, /, 340 200$/);
  assert.match(appTailSource, /data-compare-show-move-link[\s\S]*toggleLayoutComparisonMoveLink/);
  assert.match(stylesSource, /\.comparison-move-arrow-overlay\s*\{[^}]*position:\s*absolute;[^}]*pointer-events:\s*none;/s);
  assert.match(stylesSource, /\.comparison-move-arrow-path\s*\{[^}]*stroke:\s*#aa7c00;[^}]*vector-effect:\s*non-scaling-stroke;/s);
});
