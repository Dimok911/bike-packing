import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bindHorizontalTouchScroll,
  classifyTouchScrollAxis,
  packingBoardUsesDedicatedTouchPan,
  resetHorizontalTouchScroll
} from "../../src/ui/horizontal-touch-scroll.js";

function createBoard() {
  const listeners = new Map();
  const capturedPointers = new Set();
  const classes = new Set();
  return {
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      contains: (name) => classes.has(name),
      remove: (...names) => names.forEach((name) => classes.delete(name))
    },
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

test("touch scroll axis favors the vertical page through initial finger wobble", () => {
  assert.equal(classifyTouchScrollAxis(9, 1), "");
  assert.equal(classifyTouchScrollAxis(-10, 1), "horizontal");
  assert.equal(classifyTouchScrollAxis(1, -6), "");
  assert.equal(classifyTouchScrollAxis(10, 9), "");
  assert.equal(classifyTouchScrollAxis(7, -7), "");
  assert.equal(classifyTouchScrollAxis(5, -7), "vertical");
});

test("zoomed packing boards reserve the gesture for their diagonal pan controller", () => {
  const board = createBoard();
  board.classList.add("packing-board-zoom-active");
  assert.equal(packingBoardUsesDedicatedTouchPan(board), true);
  bindHorizontalTouchScroll(board, { pointerEventsSupported: false });
  board.dispatch("touchstart", { touches: [{ clientX: 200, clientY: 100 }] });
  let prevented = false;
  board.dispatch("touchmove", {
    touches: [{ clientX: 150, clientY: 70 }],
    cancelable: true,
    preventDefault() {
      prevented = true;
    }
  });
  assert.equal(board.scrollLeft, 100);
  assert.equal(prevented, false);
});

test("horizontal swipe scrolls the board and suppresses the following click", () => {
  const board = createBoard();
  bindHorizontalTouchScroll(board, { pointerEventsSupported: false });
  board.dispatch("touchstart", { touches: [{ clientX: 200, clientY: 100 }] });

  let movePrevented = false;
  board.dispatch("touchmove", {
    touches: [{ clientX: 180, clientY: 98 }],
    cancelable: true,
    preventDefault() {
      movePrevented = true;
    }
  });

  assert.equal(movePrevented, true);
  assert.equal(board.scrollLeft, 120);

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

test("an undecided diagonal wobble can still become an intentional horizontal swipe", () => {
  const board = createBoard();
  bindHorizontalTouchScroll(board, { pointerEventsSupported: false });
  board.dispatch("touchstart", { touches: [{ clientX: 200, clientY: 100 }] });

  let prevented = false;
  const preventDefault = () => {
    prevented = true;
  };
  board.dispatch("touchmove", {
    touches: [{ clientX: 194, clientY: 96 }],
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

test("a vertical gesture with an initial horizontal wobble never switches axes", () => {
  const board = createBoard();
  bindHorizontalTouchScroll(board, { pointerEventsSupported: false });
  board.dispatch("touchstart", { touches: [{ clientX: 200, clientY: 100 }] });
  board.dispatch("touchmove", {
    touches: [{ clientX: 194, clientY: 96 }],
    cancelable: true,
    preventDefault() {}
  });
  board.dispatch("touchmove", {
    touches: [{ clientX: 192, clientY: 82 }],
    cancelable: true,
    preventDefault() {}
  });
  assert.equal(board.scrollLeft, 100);
});

test("pointer scrolling captures the whole board and a new picker opening resets it", () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  let scheduledReset = null;
  globalThis.requestAnimationFrame = (callback) => {
    scheduledReset = callback;
    return 17;
  };
  globalThis.cancelAnimationFrame = () => {};
  const board = createBoard();
  try {
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
      clientX: 194,
      clientY: 96
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
    board.scrollLeft = 70;
    scheduledReset();
    assert.equal(board.scrollLeft, 0);
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
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
