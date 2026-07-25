import test from "node:test";
import assert from "node:assert/strict";

import { expandItemPlacementPath } from "../../src/state/layout-focus.js";
import {
  focusRecentlyAddedPackingCard,
  reservePackingFocusScrollRoom
} from "../../src/ui/packing-created-focus.js";

function createCard(dataset) {
  const classes = new Set(["just-added"]);
  const attributes = new Map();
  return {
    attributes,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      contains: (name) => classes.has(name),
      remove: (...names) => names.forEach((name) => classes.delete(name))
    },
    dataset,
    focusOptions: null,
    focus(options) {
      this.focusOptions = options;
    },
    getAttribute: (name) => attributes.get(name) ?? null,
    hasAttribute: (name) => attributes.has(name),
    offsetWidth: 320,
    removeAttribute: (name) => attributes.delete(name),
    setAttribute: (name, value) => attributes.set(name, value)
  };
}

test("CRITICAL copied item uses search-style highlight while scrolling and keeps it after settling", () => {
  const card = createCard({ itemId: "item-copy" });
  const tops = [1200, 760, 420, 300, 300, 300];
  card.getBoundingClientRect = () => {
    const top = tops.shift() ?? 300;
    return { bottom: top + 120, top };
  };
  const frames = [];
  const timers = [];
  const scrollCalls = [];
  let cleared = false;

  assert.equal(focusRecentlyAddedPackingCard({
    getViewportHeight: () => 700,
    onClear: () => { cleared = true; },
    recordId: "item-copy",
    requestFrame: (callback) => frames.push(callback),
    root: { querySelectorAll: () => [card] },
    scrollCard: (target) => scrollCalls.push(target),
    setTimer: (callback, delay) => timers.push({ callback, delay })
  }), true);
  assert.equal(card.classList.contains("just-added"), false);
  assert.equal(card.classList.contains("filter-focus"), true);
  assert.equal(card.classList.contains("copied-item-focus"), true);
  assert.deepEqual(scrollCalls, [card]);

  while (frames.length) frames.shift()();
  assert.equal(card.classList.contains("just-added"), false);
  assert.equal(card.classList.contains("filter-focus"), true);
  assert.equal(card.classList.contains("copied-item-focus"), true);
  assert.deepEqual(card.focusOptions, { preventScroll: true });
  assert.equal(card.attributes.get("tabindex"), "-1");
  assert.equal(timers[0].delay, 2600);

  timers[0].callback();
  assert.equal(card.classList.contains("filter-focus"), false);
  assert.equal(card.classList.contains("copied-item-focus"), false);
  assert.equal(card.attributes.has("tabindex"), false);
  assert.equal(cleared, true);
});

test("CRITICAL copied item focus retries until the switched layout is rendered", () => {
  const card = createCard({ itemId: "item-late" });
  const frames = [];
  let queries = 0;
  assert.equal(focusRecentlyAddedPackingCard({
    recordId: "item-late",
    requestFrame: (callback) => frames.push(callback),
    root: {
      querySelectorAll() {
        queries += 1;
        return queries < 3 ? [] : [card];
      }
    },
    scrollCard: () => {},
    setTimer: () => {}
  }), false);

  while (frames.length) frames.shift()();
  assert.equal(queries, 3);
  assert.equal(card.classList.contains("copied-item-focus"), true);
});

test("CRITICAL copied item keeps the yellow search focus when packing rerenders", () => {
  const firstCard = createCard({ itemId: "item-copy" });
  const replacementCard = createCard({ itemId: "item-copy" });
  let visibleCard = firstCard;
  let mutationCallback = null;
  let observerDisconnected = false;
  const timers = [];
  const scrollCalls = [];
  const root = { querySelectorAll: () => [visibleCard] };

  focusRecentlyAddedPackingCard({
    createMutationObserver(callback) {
      mutationCallback = callback;
      return {
        disconnect: () => { observerDisconnected = true; },
        observe() {}
      };
    },
    recordId: "item-copy",
    root,
    scrollCard: (card) => scrollCalls.push(card),
    setTimer: (callback, delay) => timers.push({ callback, delay })
  });

  visibleCard = replacementCard;
  mutationCallback();
  assert.equal(firstCard.classList.contains("filter-focus"), false);
  assert.equal(replacementCard.classList.contains("just-added"), false);
  assert.equal(replacementCard.classList.contains("filter-focus"), true);
  assert.deepEqual(scrollCalls, [firstCard, replacementCard]);

  timers[0].callback();
  assert.equal(replacementCard.classList.contains("filter-focus"), false);
  assert.equal(observerDisconnected, true);
});

test("CRITICAL copied item focus expands its target container and ancestors", () => {
  const state = {
    collapsedContainers: { child: true, root: true },
    containers: {
      child: { id: "child", parentId: "root" },
      root: { id: "root", parentId: "" }
    },
    items: { copy: { id: "copy", containerId: "stale" } },
    layouts: {
      target: {
        id: "target",
        arrangement: {
          containers: {
            child: { parentId: "root" },
            root: { parentId: "" }
          },
          items: { copy: "child" }
        }
      }
    }
  };

  assert.deepEqual(expandItemPlacementPath(state, "target", "copy"), ["child", "root"]);
  assert.equal(state.collapsedContainers.child, false);
  assert.equal(state.collapsedContainers.root, false);
});

test("CRITICAL copied item at the page end reserves enough room to reach the sticky offset", () => {
  const spacer = {
    setAttribute() {},
    style: {}
  };
  const view = {
    append(target) {
      this.spacer = target;
    },
    querySelector: () => null
  };
  const target = {
    closest: (selector) => selector === ".view" ? view : null,
    getBoundingClientRect: () => ({ top: 620 })
  };
  const host = {
    clientHeight: 700,
    scrollHeight: 1300,
    scrollTop: 600
  };
  const documentRef = {
    createElement: () => spacer,
    documentElement: { clientHeight: 700 },
    querySelector: () => null,
    scrollingElement: host
  };
  const windowRef = {
    getComputedStyle(element) {
      if (element === documentRef.documentElement) {
        return { getPropertyValue: () => "0px" };
      }
      return { display: "none", visibility: "hidden" };
    },
    innerHeight: 700,
    scrollY: 600
  };

  const result = reservePackingFocusScrollRoom(target, { documentRef, windowRef });

  assert.deepEqual(
    { desiredTop: result.desiredTop, maxScrollTop: result.maxScrollTop, reservedHeight: result.reservedHeight },
    { desiredTop: 1208, maxScrollTop: 600, reservedHeight: 632 }
  );
  assert.equal(spacer.style.height, "632px");
  assert.equal(view.spacer, spacer);
});
