import test from "node:test";
import assert from "node:assert/strict";
import {
  bindBoardMomentumTakeover,
  bindBoardScroll,
  bindFixedScrollbar,
  bindStickyRootHeaderRow,
  shouldStartBoardPointerDrag
} from "../../src/ui/packing-scroll.js";
import {
  applyPackingBoardZoomToDragGhost,
  clampPackingBoardZoom,
  PACKING_BOARD_FIXED_SCROLLBAR_CLEARANCE,
  PACKING_BOARD_PAN_MAX_VELOCITY,
  PACKING_BOARD_POST_PINCH_PAN_DELAY_MS,
  packingBoardAllowsDiagonalPan,
  packingBoardAnchoredPageScrollTop,
  packingBoardAnchoredScrollLeft,
  packingBoardFitMaxZoom,
  packingBoardGestureTargetsFixedScrollbar,
  packingBoardGestureTargetsOpenDialog,
  packingBoardPinchZoom,
  packingBoardMomentumScrollLeft,
  packingBoardPanVelocity,
  packingBoardPageMomentumScrollTop,
  packingBoardPagePanScrollTop,
  packingBoardPagePanVelocity,
  packingBoardPostPinchPanReady,
  packingBoardProportionalScrollLeft,
  packingBoardScaledHeight,
  packingBoardTwoFingerMode,
  packingBoardUsableColumnWidth,
  packingBoardVisualMaxScrollTop,
  packingBoardWheelZoom,
  packingBoardWheelPageDelta,
  packingBoardZoomMomentumValue,
  packingBoardZoomedTouchScrollAxis
} from "../../src/ui/packing-board-zoom.js";
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
  const boardClasses = new Set();
  let boardRect = { bottom: 700, left: 12, top: 20, width: 360 };
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
    classList: {
      contains: (name) => boardClasses.has(name)
    },
    clientWidth: 360,
    getBoundingClientRect: () => boardRect,
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

    frames.shift()();
    boardClasses.add("packing-board-page-panning");
    boardRect = { ...boardRect, top: 80 };
    controller.syncGeometry();
    frames.shift()();
    assert.equal(headerClasses.has("is-visible"), true);

    boardClasses.delete("packing-board-page-panning");
    controller.syncGeometry();
    frames.shift()();
    assert.equal(headerClasses.has("is-visible"), false);
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
  const detachFromParent = (node) => {
    if (!node?.parentNode?.children) return;
    node.parentNode.children = node.parentNode.children.filter((child) => child !== node);
  };
  const board = Object.assign(createEventTarget(), {
    children: [],
    classList: {
      add: (name) => boardClasses.add(name),
      contains: (name) => boardClasses.has(name),
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
      detachFromParent(node);
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
    body: {
      children: [],
      appendChild(node) {
        detachFromParent(node);
        node.parentNode = this;
        this.children.push(node);
        return node;
      }
    },
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
    body: documentRef.body,
    frames,
    surface,
    scrollCalls,
    thumb,
    windowRef
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

test("CRITICAL fixed scrollbar: zoom portals the fixed touch surface outside paint containment", () => {
  const harness = createFixedScrollbarHarness();
  harness.bind();
  assert.equal(harness.surface.parentNode, harness.board);

  harness.board.classList.add("packing-board-zoom-active");
  harness.windowRef.dispatch("resize");
  assert.equal(harness.surface.parentNode, harness.body);

  harness.board.classList.remove("packing-board-zoom-active");
  harness.windowRef.dispatch("resize");
  assert.equal(harness.surface.parentNode, harness.board);
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

test("CRITICAL packing zoom: pinch scale is bounded and keeps the touched content point anchored", () => {
  assert.equal(clampPackingBoardZoom(0.05), 0.2);
  assert.equal(clampPackingBoardZoom(2), 1.6);
  assert.equal(clampPackingBoardZoom(1.4, { max: 1.3 }), 1.3);
  assert.ok(Math.abs(packingBoardFitMaxZoom({
    boardWidth: 469,
    columnWidth: 360
  }) - (469 / 360)) < 0.0001);
  assert.equal(packingBoardFitMaxZoom({ boardWidth: 900, columnWidth: 360 }), 1.6);
  assert.equal(packingBoardFitMaxZoom({ boardWidth: 340, columnWidth: 360 }), 1);
  assert.equal(packingBoardUsableColumnWidth(0, 1, 47), null);
  assert.equal(packingBoardUsableColumnWidth(0, 320), 320);
  assert.equal(packingBoardPinchZoom(1, 200, 150), 0.75);
  assert.equal(packingBoardPinchZoom(0.8, 100, 150), 1.2);
  assert.equal(packingBoardPinchZoom(1.3, 100, 200, { maxZoom: 1.3 }), 1.3);
  assert.equal(packingBoardPinchZoom(1.3, 100, 200, {
    elastic: true,
    maxZoom: 1.3
  }), 1.43);
  assert.equal(packingBoardTwoFingerMode({
    currentDistance: 102,
    startDistance: 100
  }), "");
  assert.equal(packingBoardTwoFingerMode({
    currentDistance: 130,
    startDistance: 100
  }), "zoom");
  assert.equal(packingBoardZoomedTouchScrollAxis(5, 9), "vertical");
  assert.equal(packingBoardZoomedTouchScrollAxis(12, 3), "horizontal");
  assert.equal(packingBoardZoomedTouchScrollAxis(5, 3), "");
  assert.equal(packingBoardAllowsDiagonalPan(0.99), true);
  assert.equal(packingBoardAllowsDiagonalPan(1), false);
  assert.equal(packingBoardAllowsDiagonalPan(1.2), false);
  assert.equal(PACKING_BOARD_POST_PINCH_PAN_DELAY_MS, 80);
  assert.equal(packingBoardPostPinchPanReady(79), false);
  assert.equal(packingBoardPostPinchPanReady(80), true);
  assert.equal(packingBoardProportionalScrollLeft({
    nextMaxScrollLeft: 400,
    startMaxScrollLeft: 800,
    startScrollLeft: 200
  }), 100);
  assert.equal(packingBoardAnchoredScrollLeft({
    anchorClientX: 250,
    anchorContentX: 600,
    boardClientLeft: 20,
    maxScrollLeft: 1000,
    zoom: 0.75
  }), 220);
  assert.equal(packingBoardAnchoredScrollLeft({
    anchorClientX: 250,
    anchorContentX: 100,
    boardClientLeft: 20,
    maxScrollLeft: 1000,
    zoom: 0.5
  }), 0);
  assert.equal(packingBoardPagePanScrollTop({
    currentClientY: 140,
    currentScrollTop: 300,
    previousClientY: 180
  }), 340);
  assert.equal(packingBoardPagePanScrollTop({
    currentClientY: 240,
    currentScrollTop: 20,
    previousClientY: 180
  }), 0);
  assert.equal(packingBoardPagePanVelocity({
    currentClientY: 140,
    elapsedMs: 20,
    previousClientY: 180
  }), PACKING_BOARD_PAN_MAX_VELOCITY);
  assert.equal(packingBoardPagePanVelocity({
    currentClientY: 220,
    elapsedMs: 20,
    previousClientY: 180
  }), -PACKING_BOARD_PAN_MAX_VELOCITY);
  assert.equal(packingBoardPanVelocity({
    currentClientCoordinate: 20,
    elapsedMs: 1,
    previousClientCoordinate: 120
  }), PACKING_BOARD_PAN_MAX_VELOCITY);
  assert.equal(packingBoardPanVelocity({
    currentClientCoordinate: 120,
    elapsedMs: 1,
    previousClientCoordinate: 20
  }), -PACKING_BOARD_PAN_MAX_VELOCITY);
  assert.equal(packingBoardPageMomentumScrollTop({
    currentScrollTop: 300,
    elapsedMs: 16,
    maxScrollTop: 1000,
    velocity: 2
  }), 332);
  assert.equal(packingBoardPageMomentumScrollTop({
    currentScrollTop: 20,
    elapsedMs: 16,
    maxScrollTop: 1000,
    velocity: -2
  }), 0);
  assert.equal(packingBoardVisualMaxScrollTop({
    boardClientBottom: 500,
    currentScrollTop: 1000,
    hostMaxScrollTop: 2000,
    scrollHostClientTop: 50,
    viewportHeight: 844
  }), 606);
  assert.equal(packingBoardVisualMaxScrollTop({
    boardClientBottom: 500,
    currentScrollTop: 1000,
    hostMaxScrollTop: 500,
    scrollHostClientTop: 50,
    viewportHeight: 844
  }), 500);
  assert.equal(packingBoardAnchoredPageScrollTop({
    anchorClientY: 550,
    anchorContentY: 50,
    boardDocumentTop: 500,
    maxScrollTop: 1000,
    zoom: 0.7
  }), 0);
  assert.equal(packingBoardAnchoredPageScrollTop({
    anchorClientY: 550,
    anchorContentY: 350,
    boardDocumentTop: 500,
    maxScrollTop: 1000,
    zoom: 0.7
  }), 195);
  assert.equal(packingBoardScaledHeight({
    contentHeight: 800,
    paddingBottom: 18,
    zoom: 0.75
  }), 618);
  assert.ok(Math.abs(packingBoardScaledHeight({
    contentHeight: 800,
    paddingBottom: 18,
    zoom: 0.2
  }) - 178) < 0.001);
  assert.ok(Math.abs(packingBoardScaledHeight({
    bottomClearance: PACKING_BOARD_FIXED_SCROLLBAR_CLEARANCE,
    contentHeight: 800,
    paddingBottom: 18,
    zoom: 0.2
  }) - 230) < 0.001);
});

test("CRITICAL packing zoom: Ctrl-wheel scaling is bounded and board momentum is continuous", () => {
  assert.ok(packingBoardWheelZoom(0.5, -100, { maxZoom: 1.6 }) > 0.53);
  assert.ok(packingBoardWheelZoom(0.5, -100, { maxZoom: 1.6 }) < 0.55);
  assert.ok(packingBoardWheelZoom(0.5, 100, { maxZoom: 1.6 }) > 0.46);
  assert.ok(packingBoardWheelZoom(0.5, 100, { maxZoom: 1.6 }) < 0.48);
  assert.equal(packingBoardWheelZoom(1.6, -100, { maxZoom: 1.6 }), 1.6);
  assert.equal(packingBoardWheelPageDelta({ deltaY: 100 }), 100);
  assert.equal(packingBoardWheelPageDelta({ deltaMode: 1, deltaY: 3 }), 48);
  assert.equal(packingBoardWheelPageDelta({ deltaMode: 2, deltaY: 1, viewportHeight: 800 }), 800);
  assert.equal(packingBoardMomentumScrollLeft({
    currentScrollLeft: 120,
    elapsedMs: 16,
    maxScrollLeft: 500,
    velocity: 0.5
  }), 128);
  assert.equal(packingBoardMomentumScrollLeft({
    currentScrollLeft: 496,
    elapsedMs: 16,
    maxScrollLeft: 500,
    velocity: 0.5
  }), 500);
  assert.ok(packingBoardZoomMomentumValue({
    currentZoom: 0.7,
    elapsedMs: 16,
    maxZoom: 1.4,
    velocity: 0.002
  }) > 0.7);
  assert.ok(packingBoardZoomMomentumValue({
    currentZoom: 0.7,
    elapsedMs: 16,
    maxZoom: 1.4,
    velocity: -0.002
  }) < 0.7);
  assert.equal(packingBoardZoomMomentumValue({
    currentZoom: 1.39,
    elapsedMs: 16,
    maxZoom: 1.4,
    velocity: 0.002
  }), 1.4);
});

test("CRITICAL packing zoom: an open dialog keeps wheel and touch gestures away from the board", () => {
  const openDialog = { open: true };
  const closedDialog = { open: false };

  assert.equal(packingBoardGestureTargetsOpenDialog({
    target: { closest: () => openDialog }
  }), true);
  assert.equal(packingBoardGestureTargetsOpenDialog({
    target: { closest: () => closedDialog }
  }), false);
  assert.equal(packingBoardGestureTargetsOpenDialog({
    target: { closest: () => null }
  }), false);
  assert.equal(packingBoardGestureTargetsOpenDialog({ target: null }), false);
  assert.equal(packingBoardGestureTargetsOpenDialog({
    target: { closest: () => null }
  }, {
    documentRef: { querySelector: () => openDialog }
  }), true);
});

test("CRITICAL packing zoom: the fixed scrollbar keeps exclusive ownership of its touch direction", () => {
  assert.equal(packingBoardGestureTargetsFixedScrollbar({
    target: { closest: (selector) => selector.includes("kanban-board-touch-surface") ? {} : null }
  }), true);
  assert.equal(packingBoardGestureTargetsFixedScrollbar({
    target: { closest: () => null }
  }), false);
  assert.equal(packingBoardGestureTargetsFixedScrollbar({
    target: { closest: () => null },
    touches: [{ clientX: 180, clientY: 826 }]
  }, {
    documentRef: {
      querySelector: () => ({
        getBoundingClientRect: () => ({ left: 12, right: 378, top: 800, bottom: 844 })
      })
    }
  }), true);
  const source = fs.readFileSync(new URL("../../src/ui/packing-board-zoom.js", import.meta.url), "utf8");
  assert.match(source, /const onTouchStart = \(event\) => \{[\s\S]*packingBoardGestureTargetsFixedScrollbar\(event, \{ documentRef \}\)[\s\S]*stopPageMomentum\(\)/);
});

test("CRITICAL packing zoom: drag ghosts retain the board's visual scale", () => {
  const style = createStyle();
  const ghost = { style };
  const source = {
    closest: () => ({ dataset: { packingBoardZoom: "0.75" } })
  };

  assert.equal(applyPackingBoardZoomToDragGhost(source, ghost, { width: 240 }), 0.75);
  assert.equal(style.width, "320px");
  assert.equal(style["--packing-board-drag-ghost-scale"], "0.75");
  assert.equal(style.transformOrigin, "top left");
});

test("CRITICAL packing zoom: runtime binds every 2D board and styles only board roots", () => {
  const styles = fs.readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  const appTailSource = fs.readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
  const packingDragSource = fs.readFileSync(new URL("../../src/ui/packing-drag.js", import.meta.url), "utf8");
  const horizontalTouchSource = fs.readFileSync(new URL("../../src/ui/horizontal-touch-scroll.js", import.meta.url), "utf8");
  const packingZoomSource = fs.readFileSync(new URL("../../src/ui/packing-board-zoom.js", import.meta.url), "utf8");
  const packingScrollSource = fs.readFileSync(new URL("../../src/ui/packing-scroll.js", import.meta.url), "utf8");

  assert.equal((appTailSource.match(/bindPackingBoardZoom\(/g) || []).length, 3);
  assert.equal((packingDragSource.match(/applyPackingBoardZoomToDragGhost\(/g) || []).length, 3);
  assert.equal((packingDragSource.match(/addEventListener\("packing-board-pinch-start", cancelAndFinish\)/g) || []).length, 3);
  assert.equal((packingDragSource.match(/addEventListener\("packing-board-page-pan-start", cancelAndFinish\)/g) || []).length, 3);
  assert.equal((packingDragSource.match(/isPackingBoardPinching\(board\)/g) || []).length, 4);
  assert.match(packingDragSource, /packing-board-zooming[\s\S]*?packing-board-page-panning/);
  const packingGestureGuard = packingDragSource.match(/function isPackingBoardPinching\(board\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.doesNotMatch(packingGestureGuard, /packing-board-zoom-active/);
  assert.equal((packingDragSource.match(/boardHeightLock\.unlock\(\)/g) || []).length, 3);
  assert.equal((packingDragSource.match(/inputType === "touch" && Number\(event\?\.touches\?\.length \|\| 0\) !== 1/g) || []).length, 3);
  assert.match(packingZoomSource, /postPinchPanning[\s\S]*?verticalScrollHost\.scrollTop\s*=\s*nextScrollTop/);
  assert.match(packingZoomSource, /packingBoardPostPinchPanReady\(frameNow\(\) - postPinchStartedAt\)[\s\S]*?singleTouchBoardVelocity = 0;[\s\S]*?return;/);
  assert.match(packingZoomSource, /const anchor = currentPinchAnchor\(\);[\s\S]*?packingBoardZoomMomentumValue\([\s\S]*?applyZoom/);
  assert.match(packingZoomSource, /continueZoomMomentum = postPinchPanning && !postPinchPanActivated/);
  assert.match(packingZoomSource, /classifyTouchScrollAxis\([\s\S]*?singleTouchAxis === "vertical"[\s\S]*?verticalScrollHost\.scrollTop\s*=\s*nextScrollTop/);
  assert.match(packingZoomSource, /startPageMomentum[\s\S]*?packingBoardPageMomentumScrollTop[\s\S]*?requestFrame\(step\)/);
  assert.match(packingZoomSource, /preserveHorizontalPoint[\s\S]*?packingBoardAnchoredScrollLeft/);
  assert.match(packingZoomSource, /desiredScrollLeft[\s\S]*?naturalMaxScrollLeft[\s\S]*?horizontalAnchorGutter[\s\S]*?paddingRight/);
  assert.match(packingZoomSource, /packingBoardFitMaxZoom\([\s\S]*?elasticMaxZoom[\s\S]*?settleZoomToFit/);
  assert.match(packingZoomSource, /dragHeightLocked[^\n]*!== "true"[\s\S]*?removeProperty\("min-height"\)/);
  assert.match(packingZoomSource, /fixedScrollbar[\s\S]*?PACKING_BOARD_FIXED_SCROLLBAR_CLEARANCE[\s\S]*?bottomClearance/);
  assert.match(packingZoomSource, /settleBoardGeometry[\s\S]*?verticalScrollMaximum\(\)[\s\S]*?scrollTop = maxScrollTop/);
  assert.match(packingZoomSource, /verticalScrollMaximum[\s\S]*?packingBoardVisualMaxScrollTop[\s\S]*?Math\.min\(verticalScrollMaximum\(\), packingBoardPagePanScrollTop/);
  assert.match(packingZoomSource, /gesturestart[\s\S]*?preventNativeBoardZoom[\s\S]*?passive: false/);
  assert.match(packingZoomSource, /packingBoardTwoFingerMode\([\s\S]*?board\.classList\.add\("packing-board-zooming"\)/);
  assert.doesNotMatch(packingZoomSource, /twoFingerGallery|packing-board-two-finger-gallery/);
  assert.match(packingZoomSource, /requestVerticalScrollClamp[\s\S]*?verticalScrollMaximum\(\)[\s\S]*?scrollTop = maxScrollTop/);
  assert.match(packingZoomSource, /addEventListener\?\.\("scroll", requestVerticalScrollClamp, \{ passive: true \}\)/);
  assert.match(packingZoomSource, /packingBoardAllowsDiagonalPan\(zoom\)[\s\S]*?singleTouchAxis = "diagonal"[\s\S]*?board\.scrollLeft = clampBoardScrollLeft[\s\S]*?verticalScrollHost\.scrollTop = nextScrollTop/);
  assert.match(packingZoomSource, /const onTouchMove = \(event\) => \{[\s\S]*?dragging-ui[\s\S]*?return;[\s\S]*?if \(!pinching\)/);
  assert.match(packingZoomSource, /singleTouchAxis === "diagonal"[\s\S]*?startPageMomentum\(\)[\s\S]*?startBoardMomentum\(\)/);
  assert.doesNotMatch(packingZoomSource, /singleTouchGallery/);
  assert.match(packingZoomSource, /singleTouchAxis === "vertical"\s*&&\s*Math\.abs\(zoom - 1\) >= 0\.005/);
  assert.match(packingZoomSource, /addEventListener\?\.\("touchend", finishPinch, \{ capture: true, passive: false \}\)/);
  assert.match(packingZoomSource, /anchorClientX: pair\.centerX[\s\S]*?anchorClientY: pair\.centerY/);
  assert.match(packingScrollSource, /cancelForBoardGesture[\s\S]*?packing-board-pinch-start[\s\S]*?packing-board-page-pan-start/);
  assert.match(packingScrollSource, /pinchActive[\s\S]*?cancelPositionTimeline[\s\S]*?packing-board-pinch-start[\s\S]*?packing-board-pinch-end/);
  assert.match(packingScrollSource, /remainsVisibleDuringPinch[\s\S]*?headerRow\.classList\.contains\("is-visible"\)/);
  assert.match(packingZoomSource, /PinchEndEventCtor[\s\S]*?packing-board-pinch-end/);
  assert.match(packingZoomSource, /const gestureSurface = documentRef[\s\S]*?gestureY >= Number\(boardRect\.top\)/);
  assert.match(packingZoomSource, /const isNativeGestureInsideBoard = \(event\) => \{\s*if \(packingBoardGestureTargetsOpenDialog\(event, \{ documentRef \}\)\) return false;/);
  assert.match(packingZoomSource, /const onTouchStart = \(event\) => \{\s*if \(packingBoardGestureTargetsOpenDialog\(event, \{ documentRef \}\)\) return;/);
  assert.match(packingZoomSource, /const onTouchMove = \(event\) => \{\s*if \(packingBoardGestureTargetsOpenDialog\(event, \{ documentRef \}\)\) return;/);
  assert.match(packingZoomSource, /activatePagePan[\s\S]*?packing-board-page-pan-start", \{ bubbles: true \}[\s\S]*?keepPagePanAxisLocked/);
  assert.match(horizontalTouchSource, /packing-board-page-panning[\s\S]*?cancelForPagePan[\s\S]*?packing-board-page-pan-start/);
  assert.match(styles, /\.board\.packing-board-zooming \.photo-gallery-track\s*\{[\s\S]*?pointer-events:\s*none;[\s\S]*?touch-action:\s*none;/);
  assert.match(styles, /\.board\s*\{[\s\S]*?touch-action:\s*pan-x pan-y;/);
  assert.match(styles, /\.board\.packing-board-zoom-active\s*\{[\s\S]*?contain:\s*paint;[\s\S]*?touch-action:\s*none;/);
  assert.match(styles, /\.packing-root-header-row\.packing-board-zoom-active\s*\{[\s\S]*?touch-action:\s*none;/);
  assert.match(styles, /\.board\.packing-board-zoom-active \.photo-gallery-track\s*\{[\s\S]*?overscroll-behavior-y:\s*none;[\s\S]*?touch-action:\s*none;/);
  assert.match(styles, /\.subcontainer-title\s*\{[\s\S]*?touch-action:\s*pan-x pan-y;/);
  assert.match(styles, /\.item-title-hitarea\s*\{[\s\S]*?touch-action:\s*pan-x pan-y;/);
  assert.match(styles, /\.item-title\s*\{[\s\S]*?touch-action:\s*pan-x pan-y;/);
  assert.match(packingZoomSource, /const onWheel = \(event\) => \{[\s\S]*?isNativeGestureInsideBoard\(event\)[\s\S]*?event\?\.ctrlKey[\s\S]*?packingBoardWheelPageDelta[\s\S]*?packingBoardWheelZoom[\s\S]*?preserveHorizontalPoint:\s*true[\s\S]*?preserveVerticalPoint:\s*true/);
  assert.match(packingZoomSource, /gestureSurface\?\.addEventListener\?\.\("wheel", onWheel, \{ capture: true, passive: false \}\)/);
  assert.match(packingDragSource, /packing-board-page-panning/);
  assert.match(styles, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.board \.item-photo \.photo-gallery-track\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?touch-action:\s*none;/);
  assert.match(styles, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.board \.photo-gallery-dot\s*\{[\s\S]*?width:\s*32px;[\s\S]*?height:\s*32px;/);
  assert.match(styles, /\.board\.packing-board-zoom-active > \.container-card,[\s\S]*?width:\s*var\(--packing-board-base-column-width, 360px\);[\s\S]*?transform:\s*scale\(var\(--packing-board-zoom, 1\)\);/);
  assert.match(styles, /\.packing-root-header-row\.packing-board-zoom-active[\s\S]*?width:\s*var\(--packing-board-base-column-width, 360px\);[\s\S]*?transform:\s*scale\(var\(--packing-board-zoom, 1\)\);/);
  assert.doesNotMatch(styles, /\.board\.packing-board-zoom-active[\s\S]{0,500}?\bzoom\s*:/);
  assert.match(styles, /\.packing-board-zoom-reset\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*63;/);
  assert.match(styles, /body:not\(:has\(#packingView:not\(\.hidden\) \.board\.packing-board-zoom-active\)\) \.packing-board-zoom-reset\s*\{\s*display:\s*none;/);
});
