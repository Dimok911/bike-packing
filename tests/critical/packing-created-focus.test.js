import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { expandItemPlacementPath } from "../../src/state/layout-focus.js";
import { closeDialogsThenFocus } from "../../src/ui/copy-focus-flow.js";
import { focusRecentlyAddedPackingCard } from "../../src/ui/packing-created-focus.js";

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
  let settled = false;

  assert.equal(focusRecentlyAddedPackingCard({
    getViewportHeight: () => 700,
    onClear: () => { cleared = true; },
    onSettled: () => { settled = true; },
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
  assert.equal(settled, false);

  while (frames.length) frames.shift()();
  assert.equal(card.classList.contains("just-added"), false);
  assert.equal(card.classList.contains("filter-focus"), true);
  assert.equal(card.classList.contains("copied-item-focus"), true);
  assert.deepEqual(card.focusOptions, { preventScroll: true });
  assert.equal(card.attributes.get("tabindex"), "-1");
  assert.equal(settled, true);
  assert.equal(timers[0].delay, 2600);

  timers[0].callback();
  assert.equal(card.classList.contains("filter-focus"), false);
  assert.equal(card.classList.contains("copied-item-focus"), false);
  assert.equal(card.attributes.has("tabindex"), false);
  assert.equal(cleared, true);
});

test("CRITICAL copied item waits for nested dialog restoration before focusing", async () => {
  const pickerDialog = { id: "picker", open: true };
  const sourceDialog = { id: "source", open: true };
  const closeResolvers = [];
  const frames = [];
  const timers = [];
  const order = [];
  let settleFocus = null;

  const flow = closeDialogsThenFocus({
    clearTimer: (timer) => {
      const entry = timers.find((candidate) => candidate.id === timer);
      if (entry) entry.cleared = true;
    },
    closeDialog(dialog, returnValue) {
      order.push(`close:${dialog.id}:${returnValue}`);
      dialog.open = false;
      return new Promise((resolve) => closeResolvers.push(resolve));
    },
    dialogs: [pickerDialog, sourceDialog],
    focus(onSettled) {
      order.push("focus");
      settleFocus = onSettled;
      return true;
    },
    requestFrame: (callback) => frames.push(callback),
    setTimer: (callback, delay) => {
      const id = timers.length + 1;
      timers.push({ callback, cleared: false, delay, id });
      return id;
    }
  });

  assert.deepEqual(order, ["close:picker:copy", "close:source:copy"]);
  assert.equal(frames.length, 0);
  closeResolvers.forEach((resolve) => resolve());
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(frames.length, 1);
  assert.deepEqual(order, ["close:picker:copy", "close:source:copy"]);

  frames.shift()();
  await Promise.resolve();
  assert.deepEqual(order, ["close:picker:copy", "close:source:copy", "focus"]);
  assert.equal(timers[0].delay, 1800);

  const focusedCard = { id: "copied-card" };
  settleFocus(focusedCard);
  assert.equal(await flow, focusedCard);
  assert.equal(timers[0].cleared, true);
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

test("CRITICAL copied item keeps the yellow search focus without scrolling again when packing rerenders", () => {
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
  assert.deepEqual(scrollCalls, [firstCard]);

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

test("CRITICAL copied item focus never inserts artificial room after the real page end", () => {
  const source = readFileSync(new URL("../../src/ui/packing-created-focus.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /packing-focus-scroll-spacer|createElement\(|append\(/);
});

test("CRITICAL personal copy starts sync only after dialog restoration and focus settling", () => {
  const source = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
  const start = source.indexOf("async function duplicateItemToContainerInLayout(");
  const end = source.indexOf("\nfunction snapshotContainerTree(", start);
  const flow = source.slice(start, end);
  assert.match(flow, /scheduleRemoteSave\(COPY_FOCUS_SYNC_FALLBACK_DELAY_MS\)/);
  assert.match(flow, /const focusSettled = closeDialogsThenFocus\(/);
  assert.match(flow, /render\(\);\s*await focusSettled;\s*if \(!targetIsPublic && runtime\.currentUser\) \{\s*void saveRemoteState\(/);
  assert.doesNotMatch(flow, /refs\.containerPickerDialog\.close\(\)/);
});
