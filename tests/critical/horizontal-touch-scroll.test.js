import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bindHorizontalTouchScroll,
  classifyTouchScrollAxis,
  resetHorizontalTouchScroll
} from "../../src/ui/horizontal-touch-scroll.js";

function createBoard() {
  const listeners = new Map();
  const capturedPointers = new Set();
  return {
    dataset: {},
    scrollWidth: 900,
    clientWidth: 300,
    scrollLeft: 100,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    setPointerCapture(pointerId) {
      capturedPointers.add(pointerId);
    },
    hasPointerCapture(pointerId) {
      return capturedPointers.has(pointerId);
    },
    releasePointerCapture(pointerId) {
      capturedPointers.delete(pointerId);
    },
    dispatch(type, event) {
      listeners.get(type)?.(event);
    }
  };
}

test("touch scroll axis locks after a short intentional movement", () => {
  assert.equal(classifyTouchScrollAxis(3, 0), "");
  assert.equal(classifyTouchScrollAxis(-4, 1), "horizontal");
  assert.equal(classifyTouchScrollAxis(1, -4), "");
  assert.equal(classifyTouchScrollAxis(4, 4), "");
  assert.equal(classifyTouchScrollAxis(1, -12), "vertical");
});

test("horizontal swipe scrolls the board and suppresses the following click", () => {
  const board = createBoard();
  bindHorizontalTouchScroll(board, { pointerEventsSupported: false });
  board.dispatch("touchstart", { touches: [{ clientX: 200, clientY: 100 }] });

  let movePrevented = false;
  board.dispatch("touchmove", {
    touches: [{ clientX: 195, clientY: 99 }],
    cancelable: true,
    preventDefault() {
      movePrevented = true;
    }
  });

  assert.equal(movePrevented, true);
  assert.equal(board.scrollLeft, 105);

  let clickPrevented = false;
  let clickPropagationStopped = false;
  board.dispatch("click", {
    preventDefault() {
      clickPrevented = true;
    },
    stopPropagation() {
      clickPropagationStopped = true;
    }
  });
  assert.equal(clickPrevented, true);
  assert.equal(clickPropagationStopped, true);
});

test("a small initial vertical wobble can still become a horizontal swipe", () => {
  const board = createBoard();
  bindHorizontalTouchScroll(board, { pointerEventsSupported: false });
  board.dispatch("touchstart", { touches: [{ clientX: 200, clientY: 100 }] });

  let prevented = false;
  const preventDefault = () => {
    prevented = true;
  };
  board.dispatch("touchmove", {
    touches: [{ clientX: 198, clientY: 95 }],
    cancelable: true,
    preventDefault
  });
  board.dispatch("touchmove", {
    touches: [{ clientX: 180, clientY: 94 }],
    cancelable: true,
    preventDefault
  });

  assert.equal(prevented, true);
  assert.equal(board.scrollLeft, 120);
});

test("a clearly vertical gesture never switches to horizontal scrolling", () => {
  const board = createBoard();
  bindHorizontalTouchScroll(board, { pointerEventsSupported: false });
  board.dispatch("touchstart", { touches: [{ clientX: 200, clientY: 100 }] });
  board.dispatch("touchmove", {
    touches: [{ clientX: 198, clientY: 87 }],
    cancelable: true,
    preventDefault() {}
  });
  board.dispatch("touchmove", {
    touches: [{ clientX: 180, clientY: 86 }],
    cancelable: true,
    preventDefault() {}
  });
  assert.equal(board.scrollLeft, 100);
});

test("pointer scrolling captures the whole board and a new picker opening resets it", () => {
  const board = createBoard();
  bindHorizontalTouchScroll(board, { pointerEventsSupported: true });
  board.dispatch("pointerdown", {
    pointerType: "touch",
    pointerId: 7,
    clientX: 200,
    clientY: 100
  });
  board.dispatch("pointermove", {
    pointerType: "touch",
    pointerId: 7,
    clientX: 198,
    clientY: 95
  });
  board.dispatch("pointermove", {
    pointerType: "touch",
    pointerId: 7,
    clientX: 180,
    clientY: 94
  });

  assert.equal(board.scrollLeft, 120);
  assert.equal(board.hasPointerCapture(7), true);
  resetHorizontalTouchScroll(board);
  assert.equal(board.scrollLeft, 0);
  assert.equal(board.hasPointerCapture(7), false);
});

test("picker boards reserve horizontal gestures for the custom touch handler", async () => {
  const styles = await readFile(new URL("../../styles.css", import.meta.url), "utf8");
  const controllerSource = await readFile(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
  assert.match(styles, /\.root-placement-board\s*\{[^}]*touch-action:\s*pan-y pinch-zoom;/s);
  assert.match(styles, /\.root-placement-board\s*>\s*\*\s*\{[^}]*touch-action:\s*pan-y pinch-zoom;/s);
  assert.match(styles, /\.container-picker-board\s*\{[^}]*touch-action:\s*pan-y pinch-zoom;/s);
  assert.match(styles, /\.container-picker-board\s+\*\s*\{[^}]*touch-action:\s*pan-y pinch-zoom;/s);
  assert.match(controllerSource, /bindHorizontalTouchScroll\(refs\.rootPlacementBoard\);\s*resetHorizontalTouchScroll\(refs\.rootPlacementBoard\);/);
  assert.match(controllerSource, /bindHorizontalTouchScroll\(refs\.containerPickerBoard\);\s*resetHorizontalTouchScroll\(refs\.containerPickerBoard\);/);
});
