import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CATALOG_BACK_TO_TOP_THRESHOLD_PX,
  createCatalogBackToTopController,
  renderCatalogBackToTopButton,
  shouldShowCatalogBackToTop
} from "../../src/ui/catalog-back-to-top.js";
import {
  bindExplicitViewportScrollIntent,
  hasExplicitViewportScrollIntent,
  markExplicitViewportScrollIntent,
  resetExplicitViewportScrollIntent
} from "../../src/ui/viewport-scroll-intent.js";

test("catalog back-to-top appears only after the catalog was scrolled", () => {
  assert.equal(shouldShowCatalogBackToTop({ scrollY: CATALOG_BACK_TO_TOP_THRESHOLD_PX }), false);
  assert.equal(shouldShowCatalogBackToTop({ scrollY: CATALOG_BACK_TO_TOP_THRESHOLD_PX + 1 }), true);
  assert.equal(shouldShowCatalogBackToTop({ rootVisible: false, scrollY: 1000 }), false);
});

test("catalog render keeps only a hidden positioning anchor inside rerendered panels", () => {
  const html = renderCatalogBackToTopButton("Back & up");
  assert.match(html, /data-catalog-back-to-top-anchor/);
  assert.doesNotMatch(html, /<button/);
  assert.match(html, /hidden/);
  assert.match(html, /data-label="Back &amp; up"/);
});

test("items and bags render anchors and bind the same stable document portal", () => {
  const itemsSource = readFileSync(new URL("../../src/ui/items-view-render.js", import.meta.url), "utf8");
  const bagsSource = readFileSync(new URL("../../src/ui/settings-render.js", import.meta.url), "utf8");
  const controllerSource = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");

  assert.match(itemsSource, /renderCatalogBackToTopButton\(tr\(t,\s*"navigation\.backToTop"/);
  assert.match(bagsSource, /renderCatalogBackToTopButton\(tr\(t,\s*"navigation\.backToTop"/);
  assert.match(controllerSource, /bindCatalogBackToTop\(refs\.itemsView\)/);
  assert.match(controllerSource, /bindCatalogBackToTop\(refs\.bagsView\)/);
});

test("explicit back-to-top intent temporarily overrides search viewport restoration", () => {
  resetExplicitViewportScrollIntent();
  markExplicitViewportScrollIntent({ now: 1000, durationMs: 700 });
  assert.equal(hasExplicitViewportScrollIntent(1699), true);
  assert.equal(hasExplicitViewportScrollIntent(1701), false);
});

test("a fast vertical touch gesture cancels pending viewport restoration once", () => {
  resetExplicitViewportScrollIntent();
  const documentTarget = eventTarget();
  const windowTarget = eventTarget();
  let cancellations = 0;
  const cleanup = bindExplicitViewportScrollIntent({
    documentRef: documentTarget,
    onIntent: () => { cancellations += 1; },
    windowRef: windowTarget
  });

  documentTarget.dispatch("touchstart", { touches: [{ clientX: 120, clientY: 420 }] });
  documentTarget.dispatch("touchmove", { touches: [{ clientX: 122, clientY: 405 }] });
  documentTarget.dispatch("touchmove", { touches: [{ clientX: 123, clientY: 340 }] });

  assert.equal(cancellations, 1);
  assert.equal(hasExplicitViewportScrollIntent(), true);
  cleanup();
  assert.equal(documentTarget.listenerCount("touchmove"), 0);
});

test("a horizontal touch gesture does not cancel vertical viewport restoration", () => {
  resetExplicitViewportScrollIntent();
  const documentTarget = eventTarget();
  const windowTarget = eventTarget();
  let cancellations = 0;
  bindExplicitViewportScrollIntent({
    documentRef: documentTarget,
    onIntent: () => { cancellations += 1; },
    windowRef: windowTarget
  });

  documentTarget.dispatch("touchstart", { touches: [{ clientX: 120, clientY: 420 }] });
  documentTarget.dispatch("touchmove", { touches: [{ clientX: 210, clientY: 414 }] });
  assert.equal(cancellations, 0);
});

function eventTarget(extra = {}) {
  const listeners = new Map();
  const attributes = new Map();
  return {
    hidden: false,
    style: {},
    ...extra,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event);
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) || null;
    }
  };
}

function catalogRoot(anchor, { hidden = false } = {}) {
  return {
    hidden,
    offsetParent: {},
    classList: { contains: (name) => name === "hidden" && hidden },
    contains: (candidate) => candidate === anchor
  };
}

function touchEvent(x, y) {
  let prevented = false;
  let stopped = false;
  return {
    touches: [{ clientX: x, clientY: y }],
    changedTouches: [{ clientX: x, clientY: y }],
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; },
    get prevented() { return prevented; },
    get stopped() { return stopped; }
  };
}

function createHarness({ scrollY = 900 } = {}) {
  let nowMs = 1000;
  let buttonHovered = false;
  const button = eventTarget({
    hidden: true,
    contains: (target) => target === button,
    getBoundingClientRect: () => ({ bottom: 214, left: 10, right: 54, top: 170 }),
    matches: (selector) => selector === ":hover" && buttonHovered
  });
  const layer = eventTarget({ hidden: true });
  const scrollingElement = { scrollTop: scrollY };
  const documentElement = { scrollTop: scrollY };
  const body = { scrollTop: scrollY };
  const documentRef = eventTarget({ body, documentElement, scrollingElement });
  const scrollCalls = [];
  const windowRef = eventTarget({
    scrollY,
    requestAnimationFrame: () => 0,
    scrollTo(options) {
      scrollCalls.push(options);
      windowRef.scrollY = options.top;
      scrollingElement.scrollTop = options.top;
      documentElement.scrollTop = options.top;
      body.scrollTop = options.top;
    }
  });
  const controller = createCatalogBackToTopController({
    button,
    documentRef,
    layer,
    mutationObserverFactory: null,
    now: () => nowMs,
    windowRef
  });
  return {
    advanceTime(milliseconds) { nowMs += milliseconds; },
    body,
    button,
    controller,
    documentRef,
    documentElement,
    layer,
    scrollCalls,
    scrollingElement,
    setButtonHovered(value) { buttonHovered = Boolean(value); },
    windowRef
  };
}

function catalogAnchor({ label = "Back to top", left = 20, top = 180 } = {}) {
  return {
    dataset: { label },
    hidden: true,
    isConnected: true,
    getBoundingClientRect: () => ({
      height: 44,
      left,
      top,
      width: 44
    })
  };
}

test("catalog back-to-top mouse click scrolls smoothly from the stable portal", () => {
  const harness = createHarness();
  const anchor = catalogAnchor();
  harness.controller.register(catalogRoot(anchor), anchor, { label: "Back to top" });

  assert.equal(harness.button.hidden, false);
  harness.button.dispatch("click");
  assert.deepEqual(harness.scrollCalls, [{ top: 0, left: 0, behavior: "smooth" }]);
});

test("first touch during momentum reaches top before touchend without a painted stop frame", () => {
  const harness = createHarness();
  const anchor = catalogAnchor();
  harness.controller.register(catalogRoot(anchor), anchor, { label: "Back to top" });
  const start = touchEvent(30, 190);
  const end = touchEvent(30, 190);

  harness.windowRef.dispatch("scroll");
  harness.button.dispatch("touchstart", start);

  assert.equal(harness.windowRef.listenerCount("scroll"), 1, "one stable controller owns the scroll listener");
  assert.deepEqual(harness.scrollCalls, [
    { top: 900, left: 0, behavior: "auto" },
    { top: 0, left: 0, behavior: "auto" }
  ]);
  assert.equal(harness.scrollingElement.scrollTop, 0);
  assert.equal(harness.documentElement.scrollTop, 0);
  assert.equal(harness.body.scrollTop, 0);
  assert.equal(start.prevented, true);

  harness.button.dispatch("touchend", end);
  assert.equal(harness.scrollCalls.length, 2, "touchend does not schedule a second jump");
  assert.equal(end.stopped, true);
});

test("ignored iPhone momentum tap is recovered from hover at scrollend", () => {
  const harness = createHarness();
  const anchor = catalogAnchor();
  harness.controller.register(catalogRoot(anchor), anchor, { label: "Back to top" });
  const surface = {};
  harness.documentRef.dispatch("touchstart", {
    target: surface,
    touches: [{ clientX: 120, clientY: 440 }]
  });
  harness.documentRef.dispatch("touchmove", {
    target: surface,
    touches: [{ clientX: 122, clientY: 300 }]
  });
  harness.documentRef.dispatch("touchend", {
    target: surface,
    touches: [],
    changedTouches: [{ clientX: 122, clientY: 300 }]
  });
  harness.windowRef.dispatch("scroll");
  harness.setButtonHovered(true);

  // WebKit consumes the interrupting tap itself: no touch or click is
  // dispatched to the button. The changed hit-test state plus scrollend is
  // the only non-destructive signal available to the page.
  harness.windowRef.dispatch("scrollend");
  assert.deepEqual(harness.scrollCalls, [{ top: 0, left: 0, behavior: "auto" }]);
});

test("natural momentum completion never activates the hover fallback", () => {
  const harness = createHarness();
  const anchor = catalogAnchor();
  harness.controller.register(catalogRoot(anchor), anchor);
  const surface = {};
  harness.documentRef.dispatch("touchstart", {
    target: surface,
    touches: [{ clientX: 120, clientY: 440 }]
  });
  harness.documentRef.dispatch("touchmove", {
    target: surface,
    touches: [{ clientX: 122, clientY: 300 }]
  });
  harness.documentRef.dispatch("touchend", { target: surface, touches: [] });
  harness.windowRef.dispatch("scroll");
  harness.windowRef.dispatch("scrollend");
  assert.deepEqual(harness.scrollCalls, []);
});

test("a fling ending over the button is not mistaken for a second tap", () => {
  const harness = createHarness();
  const anchor = catalogAnchor();
  harness.controller.register(catalogRoot(anchor), anchor);
  const surface = {};
  harness.documentRef.dispatch("touchstart", {
    target: surface,
    touches: [{ clientX: 120, clientY: 440 }]
  });
  harness.documentRef.dispatch("touchmove", {
    target: surface,
    touches: [{ clientX: 122, clientY: 300 }]
  });
  harness.setButtonHovered(true);
  harness.documentRef.dispatch("touchend", {
    target: surface,
    touches: [],
    changedTouches: [{ clientX: 30, clientY: 190 }]
  });
  harness.windowRef.dispatch("scrollend");
  assert.deepEqual(harness.scrollCalls, []);
});

test("stationary touch waits for touchend when no momentum is active", () => {
  const harness = createHarness();
  const anchor = catalogAnchor();
  harness.controller.register(catalogRoot(anchor), anchor);

  harness.button.dispatch("touchstart", touchEvent(30, 190));
  assert.deepEqual(harness.scrollCalls, []);
  harness.button.dispatch("touchend", touchEvent(30, 190));
  assert.deepEqual(harness.scrollCalls, [{ top: 0, left: 0, behavior: "auto" }]);
});

test("synthetic click after the first touch does not start a second scroll", () => {
  const harness = createHarness();
  const anchor = catalogAnchor();
  harness.controller.register(catalogRoot(anchor), anchor);

  harness.windowRef.dispatch("scroll");
  harness.button.dispatch("touchstart", touchEvent(30, 190));
  harness.button.dispatch("touchend", touchEvent(30, 190));
  harness.button.dispatch("click", touchEvent(30, 190));

  assert.equal(harness.scrollCalls.length, 2);
});

test("vertical swipe beginning on the portal button is not treated as activation", () => {
  const harness = createHarness();
  const anchor = catalogAnchor();
  harness.controller.register(catalogRoot(anchor), anchor);

  harness.button.dispatch("touchstart", touchEvent(30, 190));
  harness.button.dispatch("touchmove", touchEvent(30, 210));
  harness.button.dispatch("touchend", touchEvent(30, 210));

  assert.deepEqual(harness.scrollCalls, []);
});

test("panel rerender replaces only the anchor and keeps one live portal handler", () => {
  const harness = createHarness();
  const firstAnchor = catalogAnchor({ top: 180 });
  const root = catalogRoot(firstAnchor);
  const removeFirst = harness.controller.register(root, firstAnchor);
  const portalButton = harness.button;

  removeFirst();
  const nextAnchor = catalogAnchor({ top: 196 });
  root.contains = (candidate) => candidate === nextAnchor;
  harness.controller.register(root, nextAnchor);

  assert.equal(harness.button, portalButton);
  assert.equal(harness.button.listenerCount("touchstart"), 1);
  assert.equal(harness.button.style.top, "196px");
  harness.button.dispatch("touchstart", touchEvent(30, 200));
  harness.button.dispatch("touchend", touchEvent(30, 200));
  assert.equal(harness.scrollCalls.length, 1);
});

test("one portal follows the visible items and bags catalog anchors", () => {
  const harness = createHarness();
  const itemAnchor = catalogAnchor({ label: "Items up", left: 20, top: 180 });
  const bagAnchor = catalogAnchor({ label: "Bags up", left: 64, top: 220 });
  const itemRoot = catalogRoot(itemAnchor);
  const bagRoot = catalogRoot(bagAnchor, { hidden: true });
  harness.controller.register(itemRoot, itemAnchor, { label: "Items up" });
  harness.controller.register(bagRoot, bagAnchor, { label: "Bags up" });

  assert.equal(harness.button.getAttribute("aria-label"), "Items up");
  assert.equal(harness.button.style.left, "20px");

  itemRoot.hidden = true;
  itemRoot.classList = { contains: (name) => name === "hidden" };
  bagRoot.hidden = false;
  bagRoot.classList = { contains: () => false };
  harness.controller.refresh();

  assert.equal(harness.button.getAttribute("aria-label"), "Bags up");
  assert.equal(harness.button.style.left, "64px");
  assert.equal(harness.button.style.top, "220px");
});

test("portal placement works with the experimental banner and without it", () => {
  const harness = createHarness();
  const anchor = catalogAnchor({ top: 240 });
  const root = catalogRoot(anchor);
  harness.controller.register(root, anchor);
  assert.equal(harness.button.style.top, "240px");

  anchor.getBoundingClientRect = () => ({ height: 44, left: 20, top: 188, width: 44 });
  harness.controller.refresh();
  assert.equal(harness.button.style.top, "188px");
});

test("fixed portal does not add a spacer to the optional sticky header area", () => {
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.catalog-back-to-top-layer\s*\{[\s\S]*?position:\s*fixed;/);
  assert.match(styles, /\.catalog-back-to-top-anchor\[hidden\]\s*\{\s*display:\s*none;/);
  assert.doesNotMatch(styles, /\.catalog-back-to-top-layer\s*\{[^}]*\bmargin\b/);
  assert.doesNotMatch(styles, /\.catalog-back-to-top-layer\s*\{[^}]*\bpadding\b/);
});
