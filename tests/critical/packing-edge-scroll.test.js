import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePackingEdgeScroll,
  getPackingBottomScrollRoom,
  getPackingDragBottomBoundary,
  getPackingDragTopBoundary
} from "../../src/ui/packing-edge-scroll.js";
import {
  getPackingDragCancelTargetTop,
  isPointInPackingDragCancelTarget
} from "../../src/ui/packing-drag-cancel.js";
import { I18N } from "../../src/data/i18n.js";
import { getPackingEntryAfterPointer } from "../../src/ui/packing-drop-target.js";
import { createPackingEdgeScrollBinding } from "../../src/ui/settings-pointer-drag.js";

function createOverlay({ top, bottom, left = 0, right = 400, position = "sticky", display = "block" }) {
  return {
    hidden: false,
    style: { display, position, visibility: "visible" },
    getBoundingClientRect() {
      return {
        bottom,
        height: bottom - top,
        left,
        right,
        top,
        width: right - left
      };
    }
  };
}

const fakeWindow = {
  getComputedStyle: (element) => element.style,
  innerHeight: 800
};

test("packing upward edge scroll starts at the bottom of stacked sticky headers", () => {
  const overlays = [
    createOverlay({ top: 0, bottom: 62 }),
    createOverlay({ top: 62, bottom: 106 }),
    createOverlay({ top: 106, bottom: 190, position: "fixed" }),
    createOverlay({ top: 360, bottom: 410 })
  ];
  const topBoundary = getPackingDragTopBoundary({
    documentRef: { querySelectorAll: () => overlays },
    windowRef: fakeWindow,
    viewportHeight: 800
  });

  assert.equal(topBoundary, 190);
  const speed = calculatePackingEdgeScroll({
    clientX: 500,
    clientY: 205,
    maxSpeed: 10,
    horizontalZone: 42,
    verticalZone: 63,
    viewportLeft: 0,
    viewportRight: 1000,
    topBoundary,
    bottomBoundary: 782
  });
  assert.equal(speed.speedX, 0);
  assert.ok(speed.speedY < 0);

  const tallCardSpeed = calculatePackingEdgeScroll({
    clientX: 500,
    clientY: 300,
    maxSpeed: 10,
    horizontalZone: 42,
    verticalZone: 63,
    viewportLeft: 0,
    viewportRight: 1000,
    topBoundary,
    bottomBoundary: 782,
    dragTop: 182,
    dragBottom: 382,
    verticalDirection: -1
  });
  assert.ok(tallCardSpeed.speedY < 0);
});

test("packing downward edge scroll keeps the full reserve even for a short dragged item", () => {
  const room = getPackingBottomScrollRoom({
    baseBoardHeight: 500,
    currentBoardHeight: 500,
    dragHeight: 54,
    remainingScroll: 20,
    reserve: 143,
    viewportHeight: 400
  });

  assert.equal(room.needed, 143);
  assert.equal(room.minBoardHeight, 643);
  assert.ok(calculatePackingEdgeScroll({
    clientX: 500,
    clientY: 775,
    maxSpeed: 10,
    horizontalZone: 42,
    verticalZone: 63,
    viewportLeft: 0,
    viewportRight: 1000,
    topBoundary: 190,
    bottomBoundary: 782
  }).speedY > 0);
});

test("a tall photo card starts downward scroll when its leading edge reaches the boundary", () => {
  const pointerOnly = calculatePackingEdgeScroll({
    clientX: 500,
    clientY: 390,
    maxSpeed: 10,
    horizontalZone: 42,
    verticalZone: 63,
    viewportLeft: 0,
    viewportRight: 1000,
    topBoundary: 190,
    bottomBoundary: 548
  });
  const photoCard = calculatePackingEdgeScroll({
    clientX: 500,
    clientY: 390,
    maxSpeed: 10,
    horizontalZone: 42,
    verticalZone: 63,
    viewportLeft: 0,
    viewportRight: 1000,
    topBoundary: 190,
    bottomBoundary: 548,
    dragTop: 370,
    dragBottom: 570,
    verticalDirection: 1
  });

  assert.equal(pointerOnly.speedY, 0);
  assert.ok(photoCard.speedY > 0);
});

test("hidden fixed scrollbar does not move the bottom drag boundary", () => {
  const hiddenBar = createOverlay({ top: 0, bottom: 0, position: "fixed", display: "none" });
  const visibleBar = createOverlay({ top: 764, bottom: 794, position: "fixed" });
  const documentRef = { querySelector: () => hiddenBar };

  assert.equal(getPackingDragBottomBoundary({ documentRef, windowRef: fakeWindow, viewportHeight: 800 }), 782);
  documentRef.querySelector = () => visibleBar;
  assert.equal(getPackingDragBottomBoundary({ documentRef, windowRef: fakeWindow, viewportHeight: 800 }), 748);
});

test("mobile drag cancel stays compact below sticky headers and has both translations", () => {
  const top = getPackingDragCancelTargetTop({
    stickyBottom: 184,
    viewportTop: 0,
    viewportHeight: 640,
    targetHeight: 52
  });
  const rect = { left: 145, right: 365, top, bottom: top + 52 };

  assert.equal(top, 192);
  assert.equal(isPointInPackingDragCancelTarget(300, 210, rect, 6), true);
  assert.equal(isPointInPackingDragCancelTarget(20, 210, rect, 6), false);
  assert.match(I18N.ru["packing.dragCancel"], /\u043e\u0442\u043c\u0435\u043d/i);
  assert.match(I18N.en["packing.dragCancel"], /cancel/i);
});

test("a tall photo placeholder is removed before resolving its intended drop slot", () => {
  let placeholderRemoved = false;
  const createEntry = (name, topBefore, topAfter) => ({
    name,
    classList: { contains: (value) => value === "item-card" },
    getBoundingClientRect: () => ({
      height: 80,
      top: placeholderRemoved ? topAfter : topBefore
    })
  });
  const first = createEntry("first", 500, 390);
  const second = createEntry("second", 590, 480);
  const placeholder = {
    classList: { contains: () => false },
    remove() {
      placeholderRemoved = true;
    }
  };
  const zone = { children: [placeholder, first, second] };

  const target = getPackingEntryAfterPointer(zone, 465, placeholder);

  assert.equal(placeholderRemoved, true);
  assert.equal(target, second);
});

test("catalog bag drag reconnects edge scroll after switching to a freshly rendered packing board", () => {
  const firstBoard = { id: "first" };
  const secondBoard = { id: "second" };
  let currentBoard = firstBoard;
  const calls = [];
  const created = [];
  const binding = createPackingEdgeScrollBinding({
    getBoard: () => currentBoard,
    getDragMetrics: () => ({ height: 80 }),
    onScroll: () => calls.push("scroll"),
    createScroller: (board, onScroll, getDragMetrics) => {
      const record = { board, paused: 0, stopped: 0, updates: [] };
      created.push(record);
      assert.deepEqual(getDragMetrics(), { height: 80 });
      onScroll();
      return {
        pause: () => record.paused += 1,
        stop: () => record.stopped += 1,
        update: (x, y) => record.updates.push([x, y])
      };
    }
  });

  assert.equal(binding.update(10, 20, { enabled: false }), false);
  assert.equal(binding.update(30, 40), true);
  assert.deepEqual(created[0].updates, [[30, 40]]);

  currentBoard = secondBoard;
  assert.equal(binding.update(50, 60), true);
  assert.equal(created[0].stopped, 1);
  assert.deepEqual(created[1].updates, [[50, 60]]);

  binding.update(70, 80, { enabled: false });
  assert.equal(created[1].paused, 1);
  binding.stop();
  assert.equal(created[1].stopped, 1);
  assert.deepEqual(calls, ["scroll", "scroll"]);
});
