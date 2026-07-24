import test from "node:test";
import assert from "node:assert/strict";
import {
  bindBoardScroll,
  bindStickyRootHeaderRow,
  shouldStartBoardPointerDrag
} from "../../src/ui/packing-scroll.js";

function createStyle() {
  return {
    setProperty(name, value) {
      this[name] = value;
    }
  };
}

test("CRITICAL packing scroll: touch pointers never start desktop board dragging", () => {
  assert.equal(shouldStartBoardPointerDrag({
    button: 0,
    pointerType: "touch"
  }), false);
  assert.equal(shouldStartBoardPointerDrag({
    button: 0,
    pointerType: "pen"
  }), false);
  assert.equal(shouldStartBoardPointerDrag({
    button: 0,
    pointerType: "mouse"
  }), true);
  assert.equal(shouldStartBoardPointerDrag({
    button: 0,
    pointerType: "mouse"
  }, { interactive: true }), false);
});

test("CRITICAL packing scroll: vertical touch movement cannot nudge board scrollLeft", () => {
  const listeners = new Map();
  const classes = new Set();
  let capturedPointer = null;
  const board = {
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name)
    },
    scrollLeft: 240,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    hasPointerCapture(pointerId) {
      return capturedPointer === pointerId;
    },
    releasePointerCapture() {
      capturedPointer = null;
    },
    setPointerCapture(pointerId) {
      capturedPointer = pointerId;
    }
  };
  const target = { closest: () => null };

  bindBoardScroll(board);
  listeners.get("pointerdown")({
    button: 0,
    clientX: 100,
    pointerId: 7,
    pointerType: "touch",
    target
  });
  listeners.get("pointermove")({
    clientX: 96,
    pointerId: 7,
    pointerType: "touch",
    target
  });

  assert.equal(board.scrollLeft, 240);
  assert.equal(capturedPointer, null);
  assert.equal(classes.has("drag-scroll"), false);

  listeners.get("pointerdown")({
    button: 0,
    clientX: 100,
    pointerId: 8,
    pointerType: "mouse",
    target
  });
  listeners.get("pointermove")({
    clientX: 90,
    pointerId: 8,
    pointerType: "mouse",
    target
  });

  assert.equal(board.scrollLeft, 250);
  assert.equal(capturedPointer, 8);
  assert.equal(classes.has("drag-scroll"), true);
});

test("CRITICAL packing sticky header: visibility is restored before the first animation frame", () => {
  const originalGlobals = {
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    window: globalThis.window
  };
  const frames = [];
  const headerClasses = new Set(["packing-root-header-row"]);
  const card = {
    dataset: { rootContainerId: "bag-a" },
    getBoundingClientRect: () => ({ left: 24, width: 320 })
  };
  const cell = {
    dataset: { stickyRootContainerId: "bag-a" },
    hidden: true,
    offsetHeight: 52,
    style: createStyle()
  };
  const track = {
    querySelectorAll: () => [cell],
    style: createStyle()
  };
  const headerRow = {
    classList: {
      contains: (name) => headerClasses.has(name),
      toggle(name, enabled) {
        if (enabled) headerClasses.add(name);
        else headerClasses.delete(name);
      }
    },
    querySelector: () => track,
    style: createStyle()
  };
  const board = {
    addEventListener() {},
    getBoundingClientRect: () => ({ bottom: 700, left: 12, top: 20, width: 360 }),
    previousElementSibling: headerRow,
    querySelectorAll: () => [card],
    scrollLeft: 18,
    scrollWidth: 720
  };

  try {
    globalThis.document = { documentElement: {} };
    globalThis.getComputedStyle = () => ({
      getPropertyValue: (name) => name === "--sticky-tabs-height" ? "44" : "0"
    });
    globalThis.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    globalThis.window = {
      addEventListener() {},
      clearTimeout() {},
      requestAnimationFrame: globalThis.requestAnimationFrame,
      setTimeout() {}
    };

    bindStickyRootHeaderRow(board);

    assert.equal(headerClasses.has("is-visible"), true);
    assert.equal(cell.hidden, false);
    assert.equal(cell.style.width, "320px");
    assert.equal(track.style.transform, "translate3d(-18px, 0, 0)");
    assert.equal(frames.length, 1);
  } finally {
    for (const [name, value] of Object.entries(originalGlobals)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});
