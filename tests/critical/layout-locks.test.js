import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyItemAvailabilityStatus,
  applyLayoutLocked,
  containerPlacementSnapshotChanged,
  itemAvailabilityBlocksPlacement,
  itemPlacementSnapshotChanged,
  isItemUnavailableForPacking,
  isLayoutLocked,
  lockedLayoutMutationBlocked,
  lockedLayoutsContainingContainer,
  lockedLayoutsContainingItem,
  lockedLayoutsContainingNestedContainer,
  normalizeItemAvailabilityStatus,
  unavailableSnapshotItems
} from "../../src/state/layout-locks.js";
import {
  itemAvailabilityBadgeHtml,
  itemAvailabilityCardClass
} from "../../src/ui/item-availability.js";
import { renderListItemHtml } from "../../src/ui/items-view-render.js";
import { renderPackingItemCardHtml } from "../../src/ui/packing-board-render.js";
import {
  backupCopyLayoutName,
  backupLayoutRows,
  restoreSelectedBackupLayoutsToState,
  summarizeBackupLayouts
} from "../../src/backup/restore.js";
import {
  getLayoutContainerIdSet,
  getLayoutItemIdSet
} from "../../src/state/layout-ops.js";

function readProjectFile(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function createState() {
  return {
    activeLayoutId: "layout-locked",
    items: {
      "item-a": { id: "item-a", name: "A" },
      "item-b": { id: "item-b", name: "B" }
    },
    containers: {
      "bag-a": { id: "bag-a", name: "Bag A", itemIds: ["item-a"], childIds: [], order: [{ type: "item", id: "item-a" }] },
      "bag-b": { id: "bag-b", name: "Bag B", itemIds: ["item-b"], childIds: [], order: [{ type: "item", id: "item-b" }] },
      "pouch-a": { id: "pouch-a", name: "Pouch A", parentId: "bag-a", itemIds: [], childIds: [], order: [] }
    },
    layouts: {
      "layout-locked": {
        id: "layout-locked",
        name: "Locked",
        locked: true,
        rootContainerIds: ["bag-a"],
        arrangement: {
          rootContainerIds: ["bag-a"],
          containers: {
            "bag-a": { parentId: "", itemIds: ["item-a"], childIds: ["pouch-a"], order: [{ type: "item", id: "item-a" }, { type: "container", id: "pouch-a" }] },
            "pouch-a": { parentId: "bag-a", itemIds: [], childIds: [], order: [] }
          },
          items: { "item-a": "bag-a" },
          packedItems: {}
        }
      },
      "layout-open": {
        id: "layout-open",
        name: "Open",
        rootContainerIds: ["bag-b"],
        arrangement: {
          rootContainerIds: ["bag-b"],
          containers: {
            "bag-b": { parentId: "", itemIds: ["item-b"], childIds: [], order: [{ type: "item", id: "item-b" }] }
          },
          items: { "item-b": "bag-b" },
          packedItems: {}
        }
      }
    }
  };
}

test("CRITICAL layout lock: locked layouts are discoverable by item and container membership", () => {
  const state = createState();

  assert.deepEqual(lockedLayoutsContainingItem(state, "item-a").map((layout) => layout.id), ["layout-locked"]);
  assert.deepEqual(lockedLayoutsContainingItem(state, "item-b"), []);
  assert.deepEqual(lockedLayoutsContainingContainer(state, "bag-a").map((layout) => layout.id), ["layout-locked"]);
  assert.deepEqual(lockedLayoutsContainingNestedContainer(state, "bag-a"), []);
  assert.deepEqual(lockedLayoutsContainingNestedContainer(state, "pouch-a").map((layout) => layout.id), ["layout-locked"]);
  assert.deepEqual(lockedLayoutsContainingContainer(state, "bag-b"), []);
  assert.equal(lockedLayoutMutationBlocked(state, "layout-locked"), true);
  assert.equal(lockedLayoutMutationBlocked(state, "layout-open"), false);
});

test("CRITICAL layout lock: applying lock uses a compact boolean field", () => {
  const layout = { id: "layout-a" };

  assert.equal(isLayoutLocked(layout), false);
  assert.equal(applyLayoutLocked(layout, true), true);
  assert.equal(isLayoutLocked(layout), true);
  assert.deepEqual(layout, { id: "layout-a", locked: true });
  assert.equal(applyLayoutLocked(layout, false), true);
  assert.equal(isLayoutLocked(layout), false);
  assert.deepEqual(layout, { id: "layout-a" });
});

test("CRITICAL item availability: lost, broken, and retired items are unavailable for packing", () => {
  const item = { id: "item-a" };

  assert.equal(normalizeItemAvailabilityStatus("unknown"), "available");
  assert.equal(isItemUnavailableForPacking(item), false);
  assert.equal(itemAvailabilityBlocksPlacement(item), false);
  assert.equal(applyItemAvailabilityStatus(item, "lost"), true);
  assert.equal(item.availabilityStatus, "lost");
  assert.equal(isItemUnavailableForPacking(item), true);
  assert.equal(itemAvailabilityBlocksPlacement(item), true);
  assert.equal(itemAvailabilityBlocksPlacement({ id: "item-b" }, "broken"), true);
  assert.equal(itemAvailabilityBlocksPlacement({ id: "item-c", availabilityStatus: "retired" }, "available"), true);
  assert.equal(applyItemAvailabilityStatus(item, "available"), true);
  assert.equal(item.availabilityStatus, undefined);
  assert.equal(isItemUnavailableForPacking(item), false);
  assert.equal(itemAvailabilityBlocksPlacement(item, "available"), false);
});

test("CRITICAL item availability: unavailable items are visible in cards and snapshots", () => {
  const item = { id: "item-a", name: "A", availabilityStatus: "broken" };
  const t = (key) => ({
    "items.availability.broken": "Broken"
  })[key] || key;

  assert.equal(itemAvailabilityCardClass(item), "item-unavailable item-unavailable-broken");
  assert.match(itemAvailabilityBadgeHtml(item, t), /item-availability-badge/);
  assert.match(itemAvailabilityBadgeHtml(item, t), /Broken/);
  assert.deepEqual(unavailableSnapshotItems({
    items: {
      "item-a": item,
      "item-b": { id: "item-b", name: "B" }
    }
  }), [{ id: "item-a", name: "A", status: "broken" }]);
  assert.match(renderPackingItemCardHtml({
    categoriesHtml: "",
    collection: false,
    filterMatch: false,
    item,
    justAdded: false,
    labelsVisible: true,
    locationHtml: "Home",
    packed: false,
    packedVisible: false,
    photoHtml: "",
    t,
    titleDragAttr: "",
    titleHtml: "A",
    weightHtml: "0 g"
  }), /item-unavailable-broken/);
  assert.match(renderListItemHtml({
    categories: [],
    filterMatch: false,
    highlightText: (value) => String(value || ""),
    inCurrentLayout: false,
    item,
    photoHtml: "",
    placementText: "Outside layout",
    showLabels: true,
    t
  }), /item-unavailable-broken/);
});

test("CRITICAL layout lock: record field edits are distinct from layout placement changes", () => {
  assert.equal(itemPlacementSnapshotChanged(
    { name: "Old", weight: 100, containerId: "bag-a", photo: "" },
    { name: "New", weight: 120, containerId: "bag-a", photo: "draft:1" }
  ), false);
  assert.equal(itemPlacementSnapshotChanged(
    { containerId: "bag-a" },
    { containerId: "bag-b" }
  ), true);
  assert.equal(containerPlacementSnapshotChanged(
    { name: "Old", weight: 100, parentId: "", parentIndex: "", layoutRootIds: "bag-a\u0000bag-b", photo: "" },
    { name: "New", weight: 120, parentId: "", parentIndex: "", layoutRootIds: "bag-a\u0000bag-b", photo: "draft:1" }
  ), false);
  assert.equal(containerPlacementSnapshotChanged(
    { parentId: "", parentIndex: "", layoutRootIds: "bag-a\u0000bag-b" },
    { parentId: "", parentIndex: "", layoutRootIds: "bag-b\u0000bag-a" }
  ), true);
});

test("CRITICAL layout lock: app tail receives placement and lock helpers", () => {
  const appSource = readProjectFile("app.js");
  const depsStart = appSource.indexOf("const appTailControllerDeps = {");
  assert.notEqual(depsStart, -1, "appTailControllerDeps must exist");
  const depsMatch = appSource.slice(depsStart).match(/const appTailControllerDeps = \{[\s\S]*?\r?\n\};/);
  assert.ok(depsMatch, "appTailControllerDeps object must be readable");
  const depsSource = depsMatch[0];

  [
    "containerPlacementSnapshotChanged",
    "itemAvailabilityBlocksPlacement",
    "itemPlacementSnapshotChanged",
    "lockedLayoutsContainingNestedContainer",
    "unavailableSnapshotItems"
  ].forEach((name) => {
    assert.match(depsSource, new RegExp(`\\b${name}\\b`), `${name} must be passed to app tail controllers`);
  });
});

test("CRITICAL item availability: move and copy buttons warn before opening placement picker", () => {
  const controllers = readProjectFile("src/app/app-tail-controllers.js");
  const moveStart = controllers.indexOf("function openItemContainerPickerDialog");
  const copyStart = controllers.indexOf("async function openItemCopyContainerPickerDialog");
  const nextStart = controllers.indexOf("function openContainerParentPickerDialog");
  assert.notEqual(moveStart, -1, "item move picker opener must exist");
  assert.notEqual(copyStart, -1, "item copy picker opener must exist");
  assert.notEqual(nextStart, -1, "next picker opener must exist");

  const moveSource = controllers.slice(moveStart, copyStart);
  const copySource = controllers.slice(copyStart, nextStart);
  [moveSource, copySource].forEach((source) => {
    const guardIndex = source.indexOf("warnUnavailableItemDialogPlacement()");
    assert.notEqual(guardIndex, -1, "unavailable item guard must run in item placement picker opener");
    assert.ok(guardIndex < source.indexOf("renderContainerPicker()"), "unavailable guard must run before rendering the picker");
    assert.ok(guardIndex < source.indexOf("openModalDialog(refs.containerPickerDialog)"), "unavailable guard must run before opening the picker");
  });
});

test("CRITICAL backup restore: selected restore preserves locked layout protection", () => {
  const backupState = createState();
  backupState.layouts["layout-locked"].locked = false;
  delete backupState.layouts["layout-locked"].notes;

  const currentState = createState();
  currentState.layouts["layout-locked"].locked = true;
  currentState.layouts["layout-locked"].notes = "После похода добавить мелкую отвертку";

  const rows = backupLayoutRows(backupState, currentState);
  const summary = summarizeBackupLayouts({
    backupState,
    currentState,
    getLayoutContainerIdSet,
    getLayoutItemIdSet,
    layoutIds: new Set(["layout-locked"]),
    normalizePhotos: () => [],
    photoFiles: new Map()
  });
  assert.deepEqual(summary.lockedLayoutProtections, [{ id: "layout-locked", name: "Locked" }]);

  const result = restoreSelectedBackupLayoutsToState({
    backupRows: rows,
    changedAt: "2026-07-04T12:00:00.000Z",
    getLayoutContainerIdSet,
    getLayoutItemIdSet,
    normalizePhotos: () => [],
    selectedIds: new Set(["layout-locked"]),
    sourceState: backupState,
    targetState: currentState
  });

  assert.deepEqual(result.restoredLayoutIds, ["layout-locked"]);
  assert.equal(currentState.layouts["layout-locked"].locked, true);
  assert.equal(currentState.layouts["layout-locked"].notes, "После похода добавить мелкую отвертку");
});

test("CRITICAL backup analysis: identical layouts and photos are reported as matching", () => {
  const backupState = createState();
  const currentState = structuredClone(backupState);
  backupState.layouts["layout-locked"].updatedAt = "2026-07-01T10:00:00.000Z";
  currentState.layouts["layout-locked"].updatedAt = "2026-07-12T10:00:00.000Z";
  backupState.items["item-a"].photos = [{ id: "photo-a" }];
  currentState.items["item-a"].photos = [{ id: "photo-a" }];

  const summary = summarizeBackupLayouts({
    backupState,
    currentState,
    getLayoutContainerIdSet,
    getLayoutItemIdSet,
    layoutIds: new Set(["layout-locked"]),
    normalizePhotos: (record) => Array.isArray(record?.photos) ? record.photos : [],
    photoFiles: new Map([["photo-a", {}]])
  });

  assert.equal(summary.unchanged, 1);
  assert.equal(summary.matchesCurrentState, true);
  assert.deepEqual(summary.newPhotos, []);
  assert.deepEqual(summary.photos, []);
});

test("CRITICAL backup analysis: only photos missing from the current entity are counted", () => {
  const backupState = createState();
  const currentState = structuredClone(backupState);
  backupState.items["item-a"].photos = [{ id: "photo-existing" }, { id: "photo-missing" }];
  currentState.items["item-a"].photos = [{ id: "photo-existing" }];

  const summary = summarizeBackupLayouts({
    backupState,
    currentState,
    getLayoutContainerIdSet,
    getLayoutItemIdSet,
    layoutIds: new Set(["layout-locked"]),
    normalizePhotos: (record) => Array.isArray(record?.photos) ? record.photos : [],
    photoFiles: new Map([["photo-existing", {}], ["photo-missing", {}]])
  });

  assert.equal(summary.matchesCurrentState, false);
  assert.deepEqual(summary.newPhotos, ["photo-missing"]);
  assert.deepEqual(summary.photos, ["photo-missing"]);
});

test("CRITICAL backup restore: copy mode keeps the current layout and creates a dated layout", () => {
  const backupState = createState();
  const currentState = createState();
  const rows = backupLayoutRows(backupState, currentState);

  const result = restoreSelectedBackupLayoutsToState({
    backupCreatedAt: "2026-07-01T10:00:00.000Z",
    backupRows: rows,
    changedAt: "2026-07-12T10:00:00.000Z",
    getLayoutContainerIdSet,
    getLayoutItemIdSet,
    normalizePhotos: (record) => Array.isArray(record?.photos) ? record.photos : [],
    restoreMode: "copy",
    selectedIds: new Set(["layout-locked"]),
    sourceState: backupState,
    targetState: currentState,
    uniqueLayoutId: () => "layout-backup-copy"
  });

  assert.deepEqual(result.restoredLayoutIds, ["layout-backup-copy"]);
  assert.equal(currentState.layouts["layout-locked"].name, "Locked");
  assert.equal(currentState.layouts["layout-backup-copy"].name, "Locked — из бэкапа 01.07.2026");
  assert.equal(Object.keys(currentState.items).length, 2);
  assert.equal(Object.keys(currentState.containers).length, 3);
  assert.equal(backupCopyLayoutName("Locked", "2026-07-01", currentState.layouts), "Locked — из бэкапа 01.07.2026 (2)");
  assert.equal(backupCopyLayoutName("Locked", "2026-07-01", {}, "en"), "Locked — from backup 01/07/2026");
});
