import test from "node:test";
import assert from "node:assert/strict";
import {
  bindBoardMomentumTakeover,
  bindBoardScroll,
  bindFixedScrollbar,
  bindStickyRootHeaderRow,
  shouldStartBoardPointerDrag
} from "../../src/ui/packing-scroll.js";
import fs from "node:fs";

function createStyle() {
  return {
    removeProperty(name) {
      delete this[name];
    },
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
  let animationCall = null;
  let timelineOptions = null;
  const track = {
    animate(keyframes, options) {
      animationCall = { keyframes, options };
      return { cancel() {} };
    },
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
    scrollLeft: 0,
    style: createStyle()
  };
  const board = {
    addEventListener() {},
    clientWidth: 360,
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

    class FakeScrollTimeline {
      constructor(options) {
        timelineOptions = options;
      }
    }
    const controller = bindStickyRootHeaderRow(board, { ScrollTimelineCtor: FakeScrollTimeline });

    assert.equal(headerClasses.has("is-visible"), true);
    assert.equal(cell.hidden, false);
    assert.equal(cell.style.width, "320px");
    assert.equal(headerRow.scrollLeft, 0);
    assert.equal(controller.usesScrollTimeline(), true);
    assert.equal(timelineOptions.source, board);
    assert.equal(timelineOptions.axis, "x");
    assert.equal(animationCall.keyframes[1].transform, "translate3d(-360px, 0, 0)");
    assert.equal(animationCall.options.timeline instanceof FakeScrollTimeline, true);
    assert.equal(frames.length, 1);
  } finally {
    for (const [name, value] of Object.entries(originalGlobals)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const current = listeners.get(type) || [];
      current.push(listener);
      listeners.set(type, current);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter((candidate) => candidate !== listener));
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event);
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    }
  };
}

function createFixedScrollbarHarness() {
  const scrollCalls = [];
  const boardClasses = new Set();
  const board = Object.assign(createEventTarget(), {
    children: [],
    classList: {
      add: (name) => boardClasses.add(name),
      remove: (name) => boardClasses.delete(name)
    },
    clientWidth: 300,
    scrollLeft: 260,
    scrollWidth: 900,
    style: createStyle(),
    scrollTo({ left, behavior }) {
      this.scrollLeft = left;
      scrollCalls.push({ behavior, left });
    },
    appendChild(node) {
      node.parentNode = this;
      this.children.push(node);
      return node;
    }
  });
  const bar = Object.assign(createEventTarget(), {
    capturedPointerId: null,
    hasPointerCapture(pointerId) {
      return this.capturedPointerId === pointerId;
    },
    releasePointerCapture() {
      this.capturedPointerId = null;
    },
    setPointerCapture(pointerId) {
      this.capturedPointerId = pointerId;
    }
  });
  const track = {
    clientWidth: 300,
    getBoundingClientRect: () => ({ left: 0 })
  };
  const thumb = { style: {} };
  const surface = Object.assign(createEventTarget(), {
    className: "",
    parentNode: null,
    capturedPointerId: null,
    hasPointerCapture(pointerId) {
      return this.capturedPointerId === pointerId;
    },
    releasePointerCapture() {
      this.capturedPointerId = null;
    },
    remove() {
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        this.parentNode = null;
      }
    },
    setAttribute() {},
    setPointerCapture(pointerId) {
      this.capturedPointerId = pointerId;
    }
  });
  const documentRef = {
    createElement() {
      return surface;
    },
    querySelector(selector) {
      if (selector === "#kanbanScrollbar") return bar;
      if (selector === "#kanbanScrollTrack") return track;
      if (selector === "#kanbanScrollThumb") return thumb;
      return null;
    }
  };
  const windowRef = createEventTarget();
  const frames = [];
  let nowValue = 0;
  const bind = () => bindFixedScrollbar(board, {
    cancelFrame(frame) {
      const entry = frames.find((candidate) => candidate.id === frame);
      if (entry) entry.cancelled = true;
    },
    documentRef,
    now: () => nowValue,
    requestFrame(callback) {
      const frame = { callback, cancelled: false, id: frames.length + 1 };
      frames.push(frame);
      return frame.id;
    },
    windowRef
  });
  return {
    advanceNow(delta) {
      nowValue += delta;
    },
    bar,
    bind,
    board,
    boardClasses,
    frames,
    surface,
    scrollCalls,
    thumb
  };
}

test("CRITICAL fixed scrollbar: touch surface is a board child so Safari scrolls the real columns", () => {
  const harness = createFixedScrollbarHarness();
  harness.bind();
  assert.equal(harness.surface.parentNode, harness.board);
  assert.equal(harness.surface.className, "kanban-board-touch-surface");
  assert.equal(harness.surface.listenerCount("scroll"), 0);

  harness.board.scrollLeft = 360;
  harness.board.dispatch("scroll");
  assert.equal(harness.board.scrollLeft, 360);
});

test("CRITICAL fixed scrollbar: animation-frame timestamp cannot send the thumb beyond its track", () => {
  const harness = createFixedScrollbarHarness();
  harness.bind();

  harness.board.scrollLeft = 360;
  harness.board.dispatch("scroll");
  assert.equal(harness.frames.length, 1);
  harness.frames[0].callback(987654.25);

  assert.equal(harness.thumb.style.width, "100px");
  assert.equal(harness.thumb.style.left, "120px");
});

test("CRITICAL fixed scrollbar: rerender replaces handlers instead of multiplying gestures", () => {
  const harness = createFixedScrollbarHarness();
  harness.bind();
  harness.bind();

  assert.equal(harness.surface.listenerCount("pointerdown"), 1);
  assert.equal(harness.surface.listenerCount("pointermove"), 1);
  assert.equal(harness.surface.listenerCount("touchstart"), 1);
  assert.equal(harness.surface.listenerCount("touchmove"), 1);
  assert.equal(harness.surface.listenerCount("scroll"), 0);
  assert.equal(harness.board.listenerCount("scroll"), 1);
});

test("CRITICAL fixed scrollbar: the thumb follows the finger while board content moves oppositely", () => {
  const harness = createFixedScrollbarHarness();
  harness.bind();
  const initialThumbLeft = Number.parseFloat(harness.thumb.style.left);
  let prevented = false;

  harness.surface.dispatch("touchstart", {
    touches: [{ clientX: 100, clientY: 20, identifier: 9 }]
  });
  assert.equal(harness.boardClasses.has("fixed-bar-scroll-ready"), true);
  harness.advanceNow(8);
  harness.surface.dispatch("touchmove", {
    cancelable: true,
    touches: [{ clientX: 105, clientY: 20, identifier: 9 }],
    preventDefault() {
      prevented = true;
    }
  });
  assert.equal(harness.board.scrollLeft, 260);
  assert.equal(harness.boardClasses.has("fixed-bar-scroll-preview"), false);
  assert.equal(Number.parseFloat(harness.thumb.style.left), initialThumbLeft);
  harness.advanceNow(16);
  harness.surface.dispatch("touchmove", {
    cancelable: true,
    touches: [{ clientX: 140, clientY: 21, identifier: 9 }],
    preventDefault() {
      prevented = true;
    }
  });

  assert.equal(harness.board.scrollLeft, 260);
  assert.equal(harness.boardClasses.has("fixed-bar-scroll-preview"), true);
  assert.equal(prevented, true);
  assert.ok(Math.abs(Number.parseFloat(harness.thumb.style.left) - initialThumbLeft - 35) < 0.01);
  harness.surface.dispatch("touchcancel", { touches: [] });
  assert.equal(harness.board.scrollLeft, 365);
  assert.equal(harness.boardClasses.has("fixed-bar-scroll-preview"), false);
  assert.equal(harness.boardClasses.has("fixed-bar-scroll-ready"), false);
});

test("CRITICAL fixed scrollbar: a swipe beside the thumb keeps soft 1:1 board displacement", () => {
  const harness = createFixedScrollbarHarness();
  harness.bind();

  harness.surface.dispatch("touchstart", {
    touches: [{ clientX: 250, clientY: 20, identifier: 10 }]
  });
  harness.advanceNow(8);
  harness.surface.dispatch("touchmove", {
    cancelable: true,
    touches: [{ clientX: 255, clientY: 20, identifier: 10 }],
    preventDefault() {}
  });
  harness.advanceNow(16);
  harness.surface.dispatch("touchmove", {
    cancelable: true,
    touches: [{ clientX: 290, clientY: 21, identifier: 10 }],
    preventDefault() {}
  });

  assert.equal(harness.board.scrollLeft, 260);
  harness.surface.dispatch("touchcancel", { touches: [] });
  assert.equal(harness.board.scrollLeft, 295);
});

test("CRITICAL fixed scrollbar: release momentum is one native smooth scroll without JS frames", () => {
  const harness = createFixedScrollbarHarness();
  harness.bind();

  harness.surface.dispatch("touchstart", {
    touches: [{ clientX: 100, clientY: 20, identifier: 11 }]
  });
  harness.advanceNow(8);
  harness.surface.dispatch("touchmove", {
    cancelable: true,
    touches: [{ clientX: 105, clientY: 20, identifier: 11 }],
    preventDefault() {}
  });
  harness.advanceNow(16);
  harness.surface.dispatch("touchmove", {
    cancelable: true,
    touches: [{ clientX: 140, clientY: 21, identifier: 11 }],
    preventDefault() {}
  });
  harness.surface.dispatch("touchend", { touches: [] });

  assert.equal(harness.scrollCalls.length, 1);
  assert.equal(harness.scrollCalls[0].behavior, "smooth");
  assert.ok(harness.scrollCalls[0].left > 365);
  assert.equal(harness.frames.length, 0);
});

test("CRITICAL fixed scrollbar: the 44px touch surface preserves vertical page panning", () => {
  const styles = fs.readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.kanban-scrollbar\s*\{[\s\S]*?bottom:\s*-3px;[\s\S]*?height:\s*44px;[\s\S]*?touch-action:\s*auto;/);
  assert.match(styles, /\.kanban-scrollbar::before\s*\{[\s\S]*?inset:\s*7px 0;[\s\S]*?border-radius:\s*8px;/);
  assert.match(styles, /\.kanban-board-touch-surface\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?height:\s*44px;[\s\S]*?touch-action:\s*pan-y;/);
  assert.match(styles, /\.kanban-scrollbar\s*\{[\s\S]*?pointer-events:\s*none;/);
  assert.match(styles, /\.kanban-scroll-track\s*\{[\s\S]*?height:\s*14px;/);
  assert.match(styles, /\.kanban-scroll-thumb\s*\{[\s\S]*?top:\s*-7px;[\s\S]*?height:\s*24px;[\s\S]*?background:\s*color-mix\(in srgb,\s*var\(--accent\)\s*18%,\s*#f6f4ee\);[\s\S]*?border:\s*2px solid var\(--accent\);/);
  assert.match(styles, /body:has\(\.board\.fixed-bar-scroll-ready\)\s+\.kanban-scroll-thumb\s*\{[\s\S]*?var\(--accent\)\s*30%/);
  assert.match(styles, /\.kanban-scrollbar\s*\{[\s\S]*?z-index:\s*60;/);
  assert.match(styles, /\.kanban-board-touch-surface\s*\{[\s\S]*?z-index:\s*61;/);
  assert.match(styles, /\.board\.fixed-bar-scroll-ready\s*>\s*\.container-card\s*\{[\s\S]*?will-change:\s*translate;/);
  assert.match(styles, /\.board\.fixed-bar-scroll-preview\s*>\s*\.container-card\s*\{[\s\S]*?translate:\s*var\(--fixed-bar-scroll-preview-x,\s*0\)\s+0;/);
  assert.doesNotMatch(styles, /\.board\.fixed-bar-scroll-preview\s*>\s*:not\(/);
});

test("CRITICAL packing momentum: a moving board makes nested photo galleries pass through to native scrolling", () => {
  const classes = new Set();
  const board = Object.assign(createEventTarget(), {
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name)
    },
    clientWidth: 300,
    scrollLeft: 100,
    scrollWidth: 900
  });
  let settleCallback = null;
  const windowRef = {
    clearTimeout() {
      settleCallback = null;
    },
    setTimeout(callback) {
      settleCallback = callback;
      return 7;
    }
  };
  bindBoardMomentumTakeover(board, { windowRef });
  assert.equal(classes.has("photo-scroll-pass-through"), false);

  board.dispatch("scroll");
  assert.equal(classes.has("photo-scroll-pass-through"), true);
  assert.equal(typeof settleCallback, "function");
  settleCallback();
  assert.equal(classes.has("photo-scroll-pass-through"), false);

  const styles = fs.readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.board\.photo-scroll-pass-through\s+\.photo-gallery-track\s*\{\s*pointer-events:\s*none;/);
});
