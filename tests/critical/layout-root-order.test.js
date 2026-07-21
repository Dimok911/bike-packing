import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  addRootContainerToLayoutInState,
  moveContainerInLayoutArrangement,
  moveItemInLayoutArrangement,
  moveRootColumnInState,
  placeExistingContainerInLayoutInState,
  removeContainerFromLayoutOnlyInState,
  rootColumnInsertIndexFromVisibleNeighbors
} from "../../src/state/layout-ops.js";
import { isRootContainerForEditor } from "../../src/state/layout-selectors.js";
import {
  cleanupEmptyContainersInState,
  createSubcontainerInLayoutState,
  deleteRootContainerFromState,
  placeDuplicatedContainerSnapshotInLayoutState
} from "../../src/state/container-ops.js";
import {
  bindPackingEmptyStateActions,
  renderEmptyState,
  renderPackingAddRootCard,
  renderPackingEmptyState
} from "../../src/ui/empty-state.js";
import {
  applyContentFilterHighlight,
  contentFilterHasNoResults,
  resetContentFilterControls
} from "../../src/ui/filter-controls.js";
import { I18N } from "../../src/data/i18n.js";
import { saveRootContainerDialogAction } from "../../src/ui/item-dialog-save.js";
import { createConflictValueFormatter } from "../../src/ui/conflict-format.js";
import { itemDisplayModeLabel } from "../../src/ui/item-display-mode.js";
import { usageLimitExceededMessage } from "../../src/state/usage-limits.js";

test("CRITICAL empty packing: guidance is actionable and the add button opens the bag picker", () => {
  const html = renderPackingEmptyState({
    title: "Начните с сумок",
    text: "Сначала добавьте сумки.",
    actionText: "Добавить сумку в укладку",
    hint: "Новую сумку можно создать на вкладке «Сумки»."
  });
  assert.match(html, /packing-empty-state/);
  assert.match(html, /data-add-packing-root/);
  assert.doesNotMatch(html, /Ничего не найдено/);

  let clickHandler = null;
  let opened = 0;
  const button = {
    addEventListener(type, handler) {
      if (type === "click") clickHandler = handler;
    }
  };
  bindPackingEmptyStateActions({
    querySelectorAll: (selector) => selector === "[data-add-packing-root]" ? [button] : []
  }, {
    onAddRoot: () => { opened += 1; }
  });
  clickHandler();
  assert.equal(opened, 1);
});

test("CRITICAL filtered bag catalog: empty state can reset every content filter in place", () => {
  const html = renderEmptyState("Nothing found for the current filter", {
    filtered: true,
    resetFiltersText: "Reset filters"
  });
  assert.match(html, /data-reset-content-filters/);
  assert.match(html, />Reset filters<\/button>/);

  const refs = {
    searchInput: { value: "sleep" },
    locationFilter: { value: "home" }
  };
  const runtime = {
    selectedCategoryFilters: ["Camping"],
    filterMatchIndex: 3,
    filterMatchSignature: "old",
    pendingFilterJump: true,
    suppressNextFilterJump: true
  };
  assert.equal(resetContentFilterControls({ refs, runtime }), true);
  assert.equal(refs.searchInput.value, "");
  assert.equal(refs.locationFilter.value, "");
  assert.deepEqual(runtime.selectedCategoryFilters, []);
  assert.equal(runtime.filterMatchIndex, 0);
  assert.equal(runtime.pendingFilterJump, false);
});

test("CRITICAL filtered views: packing, items, and bags expose the same inline reset action", () => {
  const projectRoot = resolve(import.meta.dirname, "../..");
  const controllers = readFileSync(resolve(projectRoot, "src/app/app-tail-controllers.js"), "utf8");
  const itemsRenderer = readFileSync(resolve(projectRoot, "src/ui/items-view-render.js"), "utf8");
  const bagsRenderer = readFileSync(resolve(projectRoot, "src/ui/settings-render.js"), "utf8");

  assert.match(controllers, /renderEmptyState\(emptyText,[\s\S]*?resetFiltersText: t\("filters\.resetAll"\)/);
  assert.match(controllers, /renderItemsViewHtml\(\{[\s\S]*?resetFiltersText: filteredEmpty \? t\("filters\.resetAll"\) : ""/);
  assert.match(controllers, /renderRootContainersEditorHtml\(\{[\s\S]*?resetFiltersText: hasActiveContentFilter\(\) \? t\("filters\.resetAll"\) : ""/);
  assert.match(itemsRenderer, /renderEmptyState\(emptyText, \{[\s\S]*?resetFiltersText/);
  assert.match(bagsRenderer, /renderEmptyState\(emptyText, \{[\s\S]*?resetFiltersText/);
  assert.ok((controllers.match(/bindEmptyContentFilterReset\(refs\.(?:packingView|itemsView|bagsView)\)/g) || []).length >= 6);
});

test("CRITICAL filtered views: the active filter row immediately shows when there are no matches", () => {
  const createClassList = () => {
    const values = new Set();
    return {
      contains: (value) => values.has(value),
      toggle(value, enabled) {
        if (enabled) values.add(value);
        else values.delete(value);
      }
    };
  };
  const control = { classList: createClassList() };
  const label = { classList: createClassList(), dataset: {} };
  const refs = { searchInput: control, searchFilterLabel: label };

  assert.equal(contentFilterHasNoResults({
    active: true,
    context: true,
    root: { querySelector: () => null }
  }), true);
  assert.equal(contentFilterHasNoResults({
    active: true,
    context: true,
    contextHasMatches: true,
    root: { querySelector: () => null }
  }), false);
  assert.equal(contentFilterHasNoResults({
    active: true,
    context: false,
    root: { querySelector: (selector) => selector === ".empty-filtered" ? {} : null }
  }), true);

  applyContentFilterHighlight({
    refs,
    searchActive: true,
    noResults: true,
    activeBadgeText: "FILTER",
    noResultsBadgeText: "NO RESULTS"
  });
  assert.equal(control.classList.contains("filter-no-results"), true);
  assert.equal(label.classList.contains("filter-label-no-results"), true);
  assert.equal(label.dataset.filterStatus, "NO RESULTS");

  applyContentFilterHighlight({
    refs,
    searchActive: true,
    noResults: false,
    activeBadgeText: "FILTER",
    noResultsBadgeText: "NO RESULTS"
  });
  assert.equal(control.classList.contains("filter-no-results"), false);
  assert.equal(label.dataset.filterStatus, "FILTER");
  assert.equal(I18N.ru["filters.noResultsBadge"], "НЕ НАЙДЕНО");
  assert.equal(I18N.en["filters.noResultsBadge"], "NO RESULTS");
});

test("CRITICAL filled packing: trailing card opens the bag picker", () => {
  const html = renderPackingAddRootCard({
    title: "Add bag or place",
    text: "Choose an existing one or create a new one"
  });
  assert.match(html, /packing-add-root-card/);
  assert.match(html, /data-add-packing-root/);

  let clickHandler = null;
  let opened = 0;
  bindPackingEmptyStateActions({
    querySelectorAll: (selector) => selector === "[data-add-packing-root]" ? [{
      addEventListener(type, handler) {
        if (type === "click") clickHandler = handler;
      }
    }] : []
  }, {
    onAddRoot: () => { opened += 1; }
  });
  clickHandler();
  assert.equal(opened, 1);
});

test("CRITICAL bag picker: creating a new bag stays available beside existing choices", () => {
  const projectRoot = resolve(import.meta.dirname, "../..");
  const html = readFileSync(resolve(projectRoot, "index.html"), "utf8");
  const app = readFileSync(resolve(projectRoot, "app.js"), "utf8");

  assert.match(html, /id="createRootForLayoutBtn"/);
  assert.match(html, /id="layoutRootResults"/);
  assert.match(app, /createRootForLayoutBtn\?\.addEventListener\("click", openCreateRootContainerForCurrentLayout\)/);
});

test("CRITICAL item catalog: label rows share the fixed card text height with the item title", () => {
  const projectRoot = resolve(import.meta.dirname, "../..");
  const styles = readFileSync(resolve(projectRoot, "styles.css"), "utf8");

  assert.match(styles, /\.items-list \.item-card:not\(:has\(\.item-photo\)\) \{[\s\S]*?height: 148px;[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.items-list\.with-photo-slots \.item-card \.item-card-top \{[\s\S]*?max-height: var\(--photo-top-row-height\);[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.items-list \.item-card \.meta \{[\s\S]*?min-height: 22px;[\s\S]*?max-height: none;/);
  assert.doesNotMatch(styles, /\.items-list \.item-card \.meta \{[\s\S]*?max-height: 22px;/);
  assert.match(styles, /\.items-list \.item-card \.catalog-card-title-block \{[\s\S]*?grid-column: 1 \/ -1;/);
  assert.match(styles, /\.items-list \.item-card \.item-title \{[\s\S]*?padding-inline-end: 108px;/);
  assert.match(styles, /\.items-list \.item-card \.copy-item-button \{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 1;/);
  assert.match(styles, /\.items-list \.item-card \.delete-item-button \{[\s\S]*?grid-column: 4;[\s\S]*?grid-row: 1;/);
});

test("CRITICAL root placement: the named move dialog title is localized", () => {
  const projectRoot = resolve(import.meta.dirname, "../..");
  const controllers = readFileSync(resolve(projectRoot, "src/app/app-tail-controllers.js"), "utf8");

  assert.equal(I18N.ru["forms.moveNamedContainer"], "Переставить «{name}»");
  assert.equal(I18N.en["forms.moveNamedContainer"], "Move “{name}”");
  assert.match(controllers, /rootPlacementTitle\.textContent = t\("forms\.moveNamedContainer", \{ name: container\.name \}\)/);
  assert.doesNotMatch(controllers, /rootPlacementTitle\.textContent = `Переставить/);
});

test("CRITICAL root placement: every placement slot tooltip is localized", () => {
  const projectRoot = resolve(import.meta.dirname, "../..");
  const controllers = readFileSync(resolve(projectRoot, "src/app/app-tail-controllers.js"), "utf8");
  const localizedSlotLabels = controllers.match(/escapeHtml\(t\("tooltips\.placeHere"\)\)/g) || [];

  assert.equal(I18N.ru["tooltips.placeHere"], "Поставить сюда");
  assert.equal(I18N.en["tooltips.placeHere"], "Place here");
  assert.equal(localizedSlotLabels.length, 3);
  assert.doesNotMatch(controllers, /(aria-label|title)="Поставить сюда"/);
});

test("CRITICAL English UI: secondary labels, limits, and conflict details do not fall back to Russian", () => {
  const en = (english) => english;
  const formatter = createConflictValueFormatter({ localText: en });
  const rows = formatter.conflictDetailRows({
    type: "item",
    localHas: true,
    remoteHas: true,
    localValue: { name: "Pump", weight: 120, photos: [] },
    remoteValue: { name: "Pump", weight: 140, photos: [{ id: "photo-1" }] }
  });

  assert.deepEqual(rows.map((row) => row.label), ["Weight", "Photos"]);
  assert.equal(formatter.formatConflictFieldValue(null, "name", { type: "item" }), "empty");
  assert.equal(itemDisplayModeLabel("meta-photos", en), "With labels and photos");
  assert.equal(usageLimitExceededMessage("photosPerRecord", 3, "en"), "Photos: the standard-user limit is 3 per item or bag.");
  assert.doesNotMatch(JSON.stringify(rows), /[А-Яа-яЁё]/);
});

test("CRITICAL localization audit: generated tooltip attributes do not contain direct Russian literals", () => {
  const projectRoot = resolve(import.meta.dirname, "../..");
  const files = [
    "app.js",
    "src/app/app-tail-controllers.js",
    "src/ui/packing-bike3d.js",
    "src/ui/photo-gallery.js",
    "src/ui/shared-layout-render.js"
  ];
  const directRussianAttribute = /(?:aria-label|title)="(?!\$\{)[^"\r\n]*[А-Яа-яЁё][^"\r\n]*"/;

  files.forEach((relativePath) => {
    const source = readFileSync(resolve(projectRoot, relativePath), "utf8");
    assert.doesNotMatch(source, directRussianAttribute, relativePath);
  });
});

test("CRITICAL add item to bag: a new item can be created directly for the target bag", () => {
  const projectRoot = resolve(import.meta.dirname, "../..");
  const html = readFileSync(resolve(projectRoot, "index.html"), "utf8");
  const controllers = readFileSync(resolve(projectRoot, "src/app/app-tail-controllers.js"), "utf8");

  assert.match(html, /id="createItemForContainerBtn"/);
  assert.match(controllers, /function openNewItemForAddTarget\(\)/);
  assert.match(controllers, /openItemDialog\(null, \{ targetContainerId, targetLayoutId \}\)/);
  assert.match(controllers, /state\.containers\?\.\[targetContainerId\].*targetContainerId/s);
});

test("CRITICAL empty bag picker: a bag created from the picker is placed in the current layout", () => {
  const state = {
    containers: {},
    layouts: {
      "layout-a": {
        id: "layout-a",
        rootContainerIds: [],
        arrangement: { rootContainerIds: [], containers: {}, items: {}, packedItems: {} }
      }
    }
  };
  const refs = {
    saveRootContainerBtn: { disabled: false },
    rootContainerName: { value: "New bag" },
    rootContainerWeight: { value: "0" },
    rootContainerVolume: { value: "" },
    rootContainerColor: { value: "" },
    rootContainerLocation: { value: "home" },
    rootContainerNote: { value: "" },
    rootContainerNestable: { checked: false },
    rootContainerDialog: { open: true }
  };

  const result = saveRootContainerDialogAction({
    changedAt: "2026-07-19T00:00:00.000Z",
    getPublishedEditLayoutId: () => "layout-a",
    placeCreatedRootContainer: (containerId) => addRootContainerToLayoutInState(
      state,
      "layout-a",
      containerId
    ),
    refs,
    state
  });

  assert.equal(result.created, true);
  assert.deepEqual(state.layouts["layout-a"].rootContainerIds, [result.id]);
  assert.equal(state.containers[result.id].name, "New bag");
});

function createState() {
  return {
    containers: {
      "bag-a": { id: "bag-a", name: "A", itemIds: ["item-a"], childIds: [], order: [{ type: "item", id: "item-a" }] },
      "bag-b": { id: "bag-b", name: "B", itemIds: [], childIds: [], order: [] },
      "bag-c": { id: "bag-c", name: "C", itemIds: [], childIds: [], order: [] }
    },
    items: {
      "item-a": { id: "item-a", name: "Item A", containerId: "bag-a" }
    },
    layouts: {
      "layout-a": {
        id: "layout-a",
        rootContainerIds: ["bag-b", "bag-c"],
        arrangement: {
          rootContainerIds: ["bag-b", "bag-c"],
          containers: {
            "bag-b": { parentId: "", itemIds: [], childIds: [], order: [] },
            "bag-c": { parentId: "", itemIds: [], childIds: [], order: [] }
          },
          items: {},
          packedItems: {}
        }
      }
    }
  };
}

test("CRITICAL root column drag: adding a bag inserts it at the requested root index", () => {
  const state = createState();
  const touched = [];
  const marked = [];

  assert.equal(addRootContainerToLayoutInState(state, "layout-a", "bag-a", 1, {
    markRecordActivePublicCatalog: (container) => marked.push(container.id),
    touchLayout: (layoutId) => touched.push(layoutId)
  }), true);

  const layout = state.layouts["layout-a"];
  assert.deepEqual(layout.rootContainerIds, ["bag-b", "bag-a", "bag-c"]);
  assert.deepEqual(layout.arrangement.rootContainerIds, ["bag-b", "bag-a", "bag-c"]);
  assert.equal(layout.arrangement.containers["bag-a"].parentId, "");
  assert.deepEqual(layout.arrangement.containers["bag-a"].itemIds, ["item-a"]);
  assert.equal(layout.arrangement.items["item-a"], "bag-a");
  assert.deepEqual(marked, ["bag-a"]);
  assert.deepEqual(touched, ["layout-a"]);
});

test("CRITICAL item-copy setup: an existing target bag can be linked without source-layout contents", () => {
  const state = createState();

  assert.equal(addRootContainerToLayoutInState(state, "layout-a", "bag-a", null, {
    includeContents: false
  }), true);

  const layout = state.layouts["layout-a"];
  assert.deepEqual(layout.arrangement.containers["bag-a"], {
    parentId: "",
    itemIds: [],
    childIds: [],
    order: []
  });
  assert.equal(layout.arrangement.items["item-a"], undefined);
  assert.deepEqual(state.containers["bag-a"].itemIds, ["item-a"]);
  assert.equal(state.items["item-a"].containerId, "bag-a");
});

test("CRITICAL root column drag: moving a root column updates arrangement order too", () => {
  const state = createState();
  const layout = state.layouts["layout-a"];
  layout.rootContainerIds = ["bag-a", "bag-b", "bag-c"];
  layout.arrangement.rootContainerIds = ["bag-a", "bag-b", "bag-c"];
  layout.arrangement.containers["bag-a"] = { parentId: "", itemIds: ["item-a"], childIds: [], order: [{ type: "item", id: "item-a" }] };
  layout.arrangement.items["item-a"] = "bag-a";

  assert.equal(moveRootColumnInState(state, "layout-a", "bag-a", 2), true);

  assert.deepEqual(layout.rootContainerIds, ["bag-b", "bag-c", "bag-a"]);
  assert.deepEqual(layout.arrangement.rootContainerIds, ["bag-b", "bag-c", "bag-a"]);
  assert.equal(layout.arrangement.containers["bag-a"].parentId, "");
});

test("CRITICAL root column drag: visible neighbor target maps to the full root order", () => {
  const rootIds = ["generated-a", "bag-a", "generated-b", "bag-b", "bag-c"];

  assert.equal(rootColumnInsertIndexFromVisibleNeighbors(rootIds, "bag-a", {
    previousRootId: "bag-c"
  }), 4);

  assert.equal(rootColumnInsertIndexFromVisibleNeighbors(rootIds, "bag-c", {
    nextRootId: "bag-a"
  }), 1);

  assert.equal(rootColumnInsertIndexFromVisibleNeighbors(rootIds, "bag-b", {
    nextRootId: "bag-c",
    previousRootId: "bag-a"
  }), 3);
});

test("CRITICAL reusable nested bag: only an enabled root bag can move inside another bag", () => {
  const state = createState();
  const layout = state.layouts["layout-a"];
  layout.rootContainerIds = ["bag-a", "bag-b", "bag-c"];
  layout.arrangement.rootContainerIds = ["bag-a", "bag-b", "bag-c"];
  layout.arrangement.containers["bag-a"] = { parentId: "", itemIds: ["item-a"], childIds: [], order: [{ type: "item", id: "item-a" }] };
  layout.arrangement.items["item-a"] = "bag-a";

  assert.equal(moveContainerInLayoutArrangement(state, layout, "bag-a", "bag-b"), false);
  state.containers["bag-a"].nestable = true;
  assert.equal(moveContainerInLayoutArrangement(state, layout, "bag-a", "bag-b"), true);
  assert.equal(layout.arrangement.containers["bag-a"].parentId, "bag-b");
  assert.deepEqual(layout.rootContainerIds, ["bag-b", "bag-c"]);
});

test("CRITICAL reusable nested bag: a catalog bag can be dropped directly into a parent", () => {
  const state = createState();
  state.activeLayoutId = "layout-a";
  state.collapsedContainers = {};
  state.containers["bag-a"].nestable = true;
  const applied = [];

  assert.equal(placeExistingContainerInLayoutInState(state, "bag-a", "bag-b", "layout-a", {
    activeLayoutId: "layout-a",
    applyLayoutArrangement: (layoutId) => applied.push(layoutId)
  }), true);

  const layout = state.layouts["layout-a"];
  assert.equal(layout.arrangement.containers["bag-a"].parentId, "bag-b");
  assert.deepEqual(layout.arrangement.containers["bag-b"].childIds, ["bag-a"]);
  assert.deepEqual(layout.rootContainerIds, ["bag-b", "bag-c"]);
  assert.deepEqual(applied, ["layout-a"]);
});

test("CRITICAL reusable nested bag: dragging it out promotes it to the selected root slot", () => {
  const state = createState();
  state.activeLayoutId = "layout-a";
  state.collapsedContainers = {};
  state.containers["bag-a"].nestable = true;
  const layout = state.layouts["layout-a"];

  assert.equal(placeExistingContainerInLayoutInState(state, "bag-a", "bag-b", "layout-a"), true);
  assert.equal(placeExistingContainerInLayoutInState(state, "bag-a", "", "layout-a", { targetIndex: 1 }), true);

  assert.deepEqual(layout.rootContainerIds, ["bag-b", "bag-a", "bag-c"]);
  assert.equal(layout.arrangement.containers["bag-a"].parentId, "");
  assert.deepEqual(layout.arrangement.containers["bag-b"].childIds, []);
  assert.deepEqual(layout.arrangement.containers["bag-b"].order, []);
});

test("CRITICAL reusable nested bag: it stays in the catalog and survives removal from a layout", () => {
  const state = createState();
  state.collapsedContainers = {};
  const layout = state.layouts["layout-a"];
  state.containers["bag-a"].nestable = true;
  layout.rootContainerIds = ["bag-b", "bag-c"];
  layout.arrangement.rootContainerIds = ["bag-b", "bag-c"];
  layout.arrangement.containers["bag-a"] = { parentId: "bag-b", itemIds: ["item-a"], childIds: [], order: [{ type: "item", id: "item-a" }] };
  layout.arrangement.containers["bag-b"].childIds = ["bag-a"];
  layout.arrangement.containers["bag-b"].order = [{ type: "container", id: "bag-a" }];
  layout.arrangement.items["item-a"] = "bag-a";

  assert.equal(isRootContainerForEditor(state, layout, state.containers["bag-a"]), true);
  assert.equal(removeContainerFromLayoutOnlyInState(state, layout, "bag-a"), true);
  assert.ok(state.containers["bag-a"]);
  assert.equal(state.containers["bag-a"].parentId, null);
  assert.deepEqual(state.containers["bag-a"].itemIds, []);
  assert.equal(layout.arrangement.containers["bag-a"], undefined);
});

test("CRITICAL reusable nested bag: removing its last item keeps the empty bag in the layout", () => {
  const state = createState();
  state.collapsedContainers = { "bag-a": false };
  state.containers["bag-a"].nestable = true;
  state.containers["bag-a"].parentId = "bag-b";
  state.containers["bag-b"].childIds = ["bag-a"];
  state.containers["bag-b"].order = [{ type: "container", id: "bag-a" }];
  const layout = state.layouts["layout-a"];
  layout.arrangement.containers["bag-a"] = {
    parentId: "bag-b",
    itemIds: ["item-a"],
    childIds: [],
    order: [{ type: "item", id: "item-a" }]
  };
  layout.arrangement.containers["bag-b"].childIds = ["bag-a"];
  layout.arrangement.containers["bag-b"].order = [{ type: "container", id: "bag-a" }];
  layout.arrangement.items["item-a"] = "bag-a";

  assert.equal(moveItemInLayoutArrangement(state, layout, "item-a", "bag-c"), true);
  assert.equal(layout.arrangement.containers["bag-a"].parentId, "bag-b");
  assert.deepEqual(layout.arrangement.containers["bag-b"].childIds, ["bag-a"]);
  assert.deepEqual(layout.arrangement.containers["bag-b"].order, [{ type: "container", id: "bag-a" }]);

  state.containers["bag-a"].itemIds = [];
  state.containers["bag-a"].order = [];
  cleanupEmptyContainersInState(state, "bag-a");
  assert.ok(state.containers["bag-a"]);
  assert.deepEqual(state.containers["bag-b"].childIds, ["bag-a"]);
});

test("CRITICAL temporary pouch: moving out its last item keeps the empty pouch in the layout", () => {
  const state = createState();
  const layout = state.layouts["layout-a"];
  state.containers["temporary-pouch"] = {
    id: "temporary-pouch",
    name: "Temporary pouch",
    parentId: "bag-b",
    childIds: [],
    itemIds: ["item-a"],
    order: [{ type: "item", id: "item-a" }]
  };
  state.containers["bag-a"].itemIds = [];
  state.containers["bag-a"].order = [];
  state.items["item-a"].containerId = "temporary-pouch";
  layout.arrangement.containers["temporary-pouch"] = {
    parentId: "bag-b",
    childIds: [],
    itemIds: ["item-a"],
    order: [{ type: "item", id: "item-a" }]
  };
  layout.arrangement.containers["bag-b"].childIds = ["temporary-pouch"];
  layout.arrangement.containers["bag-b"].order = [{ type: "container", id: "temporary-pouch" }];
  layout.arrangement.items["item-a"] = "temporary-pouch";

  assert.equal(moveItemInLayoutArrangement(state, layout, "item-a", "bag-c"), true);

  assert.ok(layout.arrangement.containers["temporary-pouch"]);
  assert.deepEqual(layout.arrangement.containers["temporary-pouch"].itemIds, []);
  assert.deepEqual(layout.arrangement.containers["bag-b"].childIds, ["temporary-pouch"]);
  assert.deepEqual(layout.arrangement.containers["bag-b"].order, [
    { type: "container", id: "temporary-pouch" }
  ]);
});

test("CRITICAL temporary pouch: catalog cleanup does not delete it after its last item", () => {
  const state = createState();
  state.containers["temporary-pouch"] = {
    id: "temporary-pouch",
    name: "Temporary pouch",
    parentId: "bag-b",
    childIds: [],
    itemIds: [],
    order: []
  };
  state.containers["bag-b"].childIds = ["temporary-pouch"];
  state.containers["bag-b"].order = [{ type: "container", id: "temporary-pouch" }];

  assert.equal(cleanupEmptyContainersInState(state, "temporary-pouch"), false);
  assert.ok(state.containers["temporary-pouch"]);
  assert.deepEqual(state.containers["bag-b"].childIds, ["temporary-pouch"]);
});

test("CRITICAL reusable nested bag: delete forever removes its nested placement and keeps its items", () => {
  const state = createState();
  state.collapsedContainers = { "bag-a": false };
  state.packedItems = { "item-a": true };
  state.containers["bag-a"].nestable = true;
  state.containers["bag-a"].parentId = "bag-b";
  state.containers["bag-b"].childIds = ["bag-a"];
  state.containers["bag-b"].order = [{ type: "container", id: "bag-a" }];
  const layout = state.layouts["layout-a"];
  layout.arrangement.containers["bag-a"] = {
    parentId: "bag-b",
    itemIds: ["item-a"],
    childIds: [],
    order: [{ type: "item", id: "item-a" }]
  };
  layout.arrangement.containers["bag-b"].childIds = ["bag-a"];
  layout.arrangement.containers["bag-b"].order = [{ type: "container", id: "bag-a" }];
  layout.arrangement.items["item-a"] = "bag-a";
  layout.arrangement.packedItems["item-a"] = true;
  const marked = [];

  assert.equal(deleteRootContainerFromState(state, "bag-a", {
    changedAt: "2026-07-17T12:00:00.000Z",
    markEdited: (record) => marked.push(record.id)
  }), true);

  assert.equal(state.containers["bag-a"], undefined);
  assert.deepEqual(state.containers["bag-b"].childIds, []);
  assert.deepEqual(state.containers["bag-b"].order, []);
  assert.equal(layout.arrangement.containers["bag-a"], undefined);
  assert.equal(layout.arrangement.items["item-a"], undefined);
  assert.equal(layout.arrangement.packedItems["item-a"], undefined);
  assert.equal(state.items["item-a"].containerId, "");
  assert.equal(state.packedItems["item-a"], undefined);
  assert.ok(marked.includes("layout-a"));
  assert.ok(marked.includes("bag-b"));
  assert.ok(marked.includes("item-a"));
});

test("CRITICAL container copy picker: duplicated nested bag is inserted at the selected slot", () => {
  const state = {
    containers: {
      "parent": {
        id: "parent",
        childIds: ["child-a", "child-b"],
        itemIds: [],
        order: [
          { type: "container", id: "child-a" },
          { type: "container", id: "child-b" }
        ]
      },
      "child-a": { id: "child-a", parentId: "parent", childIds: [], itemIds: [], order: [] },
      "child-b": { id: "child-b", parentId: "parent", childIds: [], itemIds: [], order: [] },
      "copy-root": { id: "copy-root", parentId: "parent", childIds: [], itemIds: [], order: [] }
    },
    items: {},
    collapsedContainers: {},
    layouts: {
      "layout-a": {
        id: "layout-a",
        rootContainerIds: ["parent"],
        arrangement: {
          rootContainerIds: ["parent"],
          containers: {
            "parent": {
              parentId: "",
              childIds: ["child-a", "child-b"],
              itemIds: [],
              order: [
                { type: "container", id: "child-a" },
                { type: "container", id: "child-b" }
              ]
            },
            "child-a": { parentId: "parent", childIds: [], itemIds: [], order: [] },
            "child-b": { parentId: "parent", childIds: [], itemIds: [], order: [] }
          },
          items: {},
          packedItems: {}
        }
      }
    }
  };
  const touched = [];

  assert.equal(placeDuplicatedContainerSnapshotInLayoutState(state, "layout-a", "copy-root", {
    copiedPlacements: {
      "copy-root": { parentId: "parent", childIds: [], itemIds: [], order: [] }
    },
    targetParentId: "parent",
    targetIndex: 1,
    touchContainer: (containerId) => touched.push(`container:${containerId}`),
    touchLayout: (layoutId) => touched.push(`layout:${layoutId}`)
  }), true);

  assert.deepEqual(state.containers.parent.order, [
    { type: "container", id: "child-a" },
    { type: "container", id: "copy-root" },
    { type: "container", id: "child-b" }
  ]);
  assert.deepEqual(state.layouts["layout-a"].arrangement.containers.parent.order, [
    { type: "container", id: "child-a" },
    { type: "container", id: "copy-root" },
    { type: "container", id: "child-b" }
  ]);
  assert.deepEqual(touched, ["container:parent", "layout:layout-a"]);
});

test("CRITICAL add-to-container plus: creating a nested bag updates live parent order and layout arrangement", () => {
  const state = {
    containers: {
      "parent": {
        id: "parent",
        childIds: [],
        itemIds: [],
        order: []
      }
    },
    items: {},
    layouts: {
      "layout-a": {
        id: "layout-a",
        rootContainerIds: ["parent"],
        arrangement: {
          rootContainerIds: ["parent"],
          containers: {
            "parent": { parentId: "", childIds: [], itemIds: [], order: [] }
          },
          items: {},
          packedItems: {}
        }
      }
    }
  };
  const touched = [];

  const created = createSubcontainerInLayoutState(state, "parent", "layout-a", {
    changedAt: "2026-07-02T00:00:00.000Z",
    currentCreateMeta: (changedAt) => ({ createdAt: changedAt, updatedAt: changedAt }),
    id: "child-new",
    name: "New pouch",
    touchContainer: (container) => touched.push(`container:${container.id}`),
    touchLayout: (layoutId) => touched.push(`layout:${layoutId}`)
  });

  assert.deepEqual(created, { id: "child-new", parentId: "parent", layoutId: "layout-a" });
  assert.equal(state.containers["child-new"].parentId, "parent");
  assert.deepEqual(state.containers.parent.childIds, ["child-new"]);
  assert.deepEqual(state.containers.parent.order, [{ type: "container", id: "child-new" }]);
  assert.deepEqual(state.layouts["layout-a"].arrangement.containers.parent.childIds, ["child-new"]);
  assert.deepEqual(state.layouts["layout-a"].arrangement.containers.parent.order, [{ type: "container", id: "child-new" }]);
  assert.deepEqual(touched, ["container:parent", "layout:layout-a"]);
});

test("CRITICAL container copy picker: duplicated top-level bag is inserted at the selected root slot", () => {
  const state = {
    containers: {
      "bag-a": { id: "bag-a", parentId: null, childIds: [], itemIds: [], order: [] },
      "bag-b": { id: "bag-b", parentId: null, childIds: [], itemIds: [], order: [] },
      "copy-root": { id: "copy-root", parentId: null, childIds: [], itemIds: [], order: [] }
    },
    items: {},
    collapsedContainers: {},
    layouts: {
      "layout-a": {
        id: "layout-a",
        rootContainerIds: ["bag-a", "bag-b"],
        arrangement: {
          rootContainerIds: ["bag-a", "bag-b"],
          containers: {
            "bag-a": { parentId: "", childIds: [], itemIds: [], order: [] },
            "bag-b": { parentId: "", childIds: [], itemIds: [], order: [] }
          },
          items: {},
          packedItems: {}
        }
      }
    }
  };

  assert.equal(placeDuplicatedContainerSnapshotInLayoutState(state, "layout-a", "copy-root", {
    copiedPlacements: {
      "copy-root": { parentId: "", childIds: [], itemIds: [], order: [] }
    },
    targetIndex: 1
  }), true);

  assert.deepEqual(state.layouts["layout-a"].rootContainerIds, ["bag-a", "copy-root", "bag-b"]);
  assert.deepEqual(state.layouts["layout-a"].arrangement.rootContainerIds, ["bag-a", "copy-root", "bag-b"]);
});

test("CRITICAL container copy: deleting a copied bag does not remove the source bag from another layout", () => {
  const state = {
    containers: {
      "source-root": { id: "source-root", parentId: null, childIds: [], itemIds: ["source-item"], order: [{ type: "item", id: "source-item" }] },
      "copy-root": { id: "copy-root", parentId: null, childIds: [], itemIds: ["copy-item"], order: [{ type: "item", id: "copy-item" }] }
    },
    items: {
      "source-item": { id: "source-item", containerId: "source-root" },
      "copy-item": { id: "copy-item", containerId: "copy-root" }
    },
    collapsedContainers: {},
    packedItems: {},
    layouts: {
      "source-layout": {
        id: "source-layout",
        rootContainerIds: ["source-root"],
        arrangement: {
          rootContainerIds: ["source-root"],
          containers: {
            "source-root": { parentId: "", childIds: [], itemIds: ["source-item"], order: [{ type: "item", id: "source-item" }] }
          },
          items: { "source-item": "source-root" },
          packedItems: {}
        }
      },
      "copy-layout": {
        id: "copy-layout",
        rootContainerIds: ["copy-root"],
        arrangement: {
          rootContainerIds: ["copy-root"],
          containers: {
            "copy-root": { parentId: "", childIds: [], itemIds: ["copy-item"], order: [{ type: "item", id: "copy-item" }] }
          },
          items: { "copy-item": "copy-root" },
          packedItems: {}
        }
      }
    }
  };

  assert.equal(deleteRootContainerFromState(state, "copy-root"), true);

  assert.deepEqual(state.layouts["source-layout"].rootContainerIds, ["source-root"]);
  assert.ok(state.containers["source-root"]);
  assert.ok(state.items["source-item"]);
  assert.equal(state.items["source-item"].containerId, "source-root");
  assert.deepEqual(state.layouts["copy-layout"].rootContainerIds, []);
  assert.equal(state.containers["copy-root"], undefined);
  assert.equal(state.items["copy-item"].containerId, "");
});
