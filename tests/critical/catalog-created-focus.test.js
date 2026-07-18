import test from "node:test";
import assert from "node:assert/strict";
import { focusCreatedCatalogCard } from "../../src/ui/catalog-created-focus.js";
import { renderItemsViewHtml } from "../../src/ui/items-view-render.js";
import { resetDialogScrollPosition } from "../../src/ui/modal-focus.js";
import { renderRootContainersEditorHtml } from "../../src/ui/settings-render.js";

function createCard(dataset) {
  const classes = new Set();
  const scrollCalls = [];
  return {
    classList: {
      add: (name) => classes.add(name),
      contains: (name) => classes.has(name),
      remove: (name) => classes.delete(name)
    },
    dataset,
    offsetWidth: 320,
    scrollCalls,
    scrollIntoView: (options) => scrollCalls.push(options)
  };
}

test("CRITICAL catalog create focus scrolls to and highlights a new item", () => {
  const card = createCard({ listItemId: "item-new" });
  const timers = [];
  const focused = focusCreatedCatalogCard({
    recordId: "item-new",
    root: { querySelectorAll: () => [card] },
    setTimer: (callback, delay) => timers.push({ callback, delay }),
    type: "item"
  });

  assert.equal(focused, true);
  assert.equal(card.classList.contains("just-added"), true);
  assert.deepEqual(card.scrollCalls, [{ block: "center", inline: "nearest", behavior: "smooth" }]);
  assert.equal(timers[0].delay, 1700);
  timers[0].callback();
  assert.equal(card.classList.contains("just-added"), false);
});

test("CRITICAL catalog create focus targets a new bag card by its catalog id", () => {
  const other = createCard({ rootCard: "container-old" });
  const created = createCard({ rootCard: "container-new" });
  assert.equal(focusCreatedCatalogCard({
    recordId: "container-new",
    root: { querySelectorAll: () => [other, created] },
    setTimer: () => {},
    type: "container"
  }), true);
  assert.equal(other.classList.contains("just-added"), false);
  assert.equal(created.classList.contains("just-added"), true);
});

test("CRITICAL catalog create focus waits for dialog scroll restoration to finish", () => {
  const card = createCard({ listItemId: "item-delayed" });
  const frames = [];
  let settled = null;
  assert.equal(focusCreatedCatalogCard({
    after: { then: (callback) => { settled = callback; } },
    recordId: "item-delayed",
    requestFrame: (callback) => frames.push(callback),
    root: { querySelectorAll: () => [card] },
    setTimer: () => {}
  }), true);
  assert.equal(card.classList.contains("just-added"), false);

  settled();
  assert.equal(card.classList.contains("just-added"), false);
  frames[0]();
  assert.equal(card.classList.contains("just-added"), true);
  assert.equal(card.scrollCalls.length, 1);
});

test("CRITICAL catalog highlight starts only after a long smooth scroll settles", () => {
  const card = createCard({ listItemId: "item-far-away" });
  const tops = [1200, 850, 520, 300, 300, 300];
  card.getBoundingClientRect = () => {
    const top = tops.shift() ?? 300;
    return { bottom: top + 120, top };
  };
  const frames = [];
  const timers = [];
  assert.equal(focusCreatedCatalogCard({
    getViewportHeight: () => 700,
    recordId: "item-far-away",
    requestFrame: (callback) => frames.push(callback),
    root: { querySelectorAll: () => [card] },
    setTimer: (callback, delay) => timers.push({ callback, delay })
  }), true);
  assert.equal(card.classList.contains("just-added"), false);

  while (frames.length) frames.shift()();
  assert.equal(card.classList.contains("just-added"), true);
  assert.equal(timers[0].delay, 1700);
});

test("CRITICAL item dialog opens at the top for desktop and mobile scrollers", () => {
  const card = { scrollTop: 640 };
  const dialog = {
    querySelector: () => card,
    scrollTop: 520
  };
  const frames = [];
  assert.equal(resetDialogScrollPosition(dialog, {
    requestFrame: (callback) => frames.push(callback)
  }), true);
  assert.equal(dialog.scrollTop, 0);
  assert.equal(card.scrollTop, 0);

  dialog.scrollTop = 180;
  card.scrollTop = 260;
  frames[0]();
  assert.equal(dialog.scrollTop, 0);
  assert.equal(card.scrollTop, 0);
});

test("CRITICAL item and bag action toolbars remain sticky below the tab row", () => {
  const itemsHtml = renderItemsViewHtml({
    counts: { all: 0, away: 0, current: 0, noWeight: 0, unused: 0 },
    itemSortMode: "none",
    itemUsageFilter: "all",
    items: [],
    renderListItem: () => ""
  });
  const bagsHtml = renderRootContainersEditorHtml({
    counts: { all: 0, current: 0, unused: 0 },
    renderRootContainerCard: () => "",
    rootContainerSortMode: "none",
    rootContainerUsageFilter: "all",
    roots: [],
    showLabels: false,
    showPhotos: false
  });

  assert.match(itemsHtml, /items-toolbar catalog-toolbar-sticky/);
  assert.match(bagsHtml, /root-containers-toolbar catalog-toolbar-sticky/);
});
