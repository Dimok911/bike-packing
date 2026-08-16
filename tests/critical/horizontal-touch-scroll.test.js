import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bindHorizontalTouchScroll,
  classifyTouchScrollAxis
} from "../../src/ui/horizontal-touch-scroll.js";

function createBoard() {
  const listeners = new Map();
  return {
    dataset: {},
    scrollWidth: 900,
    clientWidth: 300,
    scrollLeft: 100,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type, event) {
      listeners.get(type)?.(event);
    }
  };
}

test("touch scroll axis locks after a short intentional movement", () => {
  assert.equal(classifyTouchScrollAxis(3, 0), "");
  assert.equal(classifyTouchScrollAxis(-4, 1), "horizontal");
  assert.equal(classifyTouchScrollAxis(1, -4), "vertical");
  assert.equal(classifyTouchScrollAxis(4, 4), "vertical");
});

test("horizontal swipe scrolls the board and suppresses the following click", () => {
  const board = createBoard();
  bindHorizontalTouchScroll(board);
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

test("a gesture that starts vertically never switches to horizontal scrolling", () => {
  const board = createBoard();
  bindHorizontalTouchScroll(board);
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

  assert.equal(prevented, false);
  assert.equal(board.scrollLeft, 100);
});

test("picker boards reserve horizontal gestures for the custom touch handler", async () => {
  const styles = await readFile(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.root-placement-board\s*\{[^}]*touch-action:\s*pan-y pinch-zoom;/s);
  assert.match(styles, /\.root-placement-board\s*>\s*\*\s*\{[^}]*touch-action:\s*pan-y pinch-zoom;/s);
  assert.match(styles, /\.container-picker-board\s*\{[^}]*touch-action:\s*pan-y pinch-zoom;/s);
  assert.match(styles, /\.container-picker-board\s+\*\s*\{[^}]*touch-action:\s*pan-y pinch-zoom;/s);
});
