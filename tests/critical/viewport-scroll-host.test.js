import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  disableIsolatedViewportScrollHost,
  enableIsolatedViewportScrollHost,
  scrollViewportBy,
  scrollViewportTo,
  shouldIsolateViewportScroll,
  viewportScrollHost,
  viewportScrollLeft,
  viewportScrollTop
} from "../../src/ui/viewport-scroll-host.js";

function classList() {
  const values = new Set();
  return {
    add: (value) => values.add(value),
    contains: (value) => values.has(value),
    remove: (value) => values.delete(value)
  };
}

function viewportFixture({ hasExperimentalBanner = false, initialX = 0, initialY = 0 } = {}) {
  const attributes = new Set();
  const appListeners = new Map();
  const windowListeners = new Map();
  const html = { classList: classList(), scrollLeft: initialX, scrollTop: initialY };
  const body = { classList: classList() };
  const app = {
    classList: classList(),
    parentElement: body,
    scrollHeight: 2400,
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 400,
    clientHeight: 800,
    clientWidth: 400,
    addEventListener(type, listener) {
      appListeners.set(type, listener);
    },
    dispatch(type) {
      appListeners.get(type)?.({ type });
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    querySelector(selector) {
      if (selector === ".experiment-banner" && hasExperimentalBanner) return {};
      return null;
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    removeEventListener(type, listener) {
      if (appListeners.get(type) === listener) appListeners.delete(type);
    },
    setAttribute(name) {
      attributes.add(name);
    },
    scrollTo(options) {
      if (Number.isFinite(options.left)) this.scrollLeft = options.left;
      if (Number.isFinite(options.top)) this.scrollTop = options.top;
    }
  };
  const documentRef = {
    body,
    documentElement: html,
    scrollingElement: html,
    querySelector(selector) {
      if (selector === ".app") return app;
      if (selector === "[data-viewport-scroll-host]" && app.hasAttribute("data-viewport-scroll-host")) return app;
      return null;
    }
  };
  class ScrollEvent {
    constructor(type) {
      this.type = type;
    }
  }
  const windowScrollCalls = [];
  const windowRef = {
    Event: ScrollEvent,
    pageXOffset: initialX,
    pageYOffset: initialY,
    scrollX: initialX,
    scrollY: initialY,
    addEventListener(type, listener) {
      windowListeners.set(type, listener);
    },
    dispatchEvent(event) {
      windowListeners.get(event.type)?.(event);
    },
    scrollTo(options) {
      windowScrollCalls.push(options);
    }
  };
  return { app, body, documentRef, html, windowRef, windowListeners, windowScrollCalls };
}

test("only iOS and touch-capable iPadOS desktop identity use the isolated scroll host", () => {
  assert.equal(shouldIsolateViewportScroll({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)" }), true);
  assert.equal(shouldIsolateViewportScroll({ userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0)" }), true);
  assert.equal(shouldIsolateViewportScroll({ platform: "MacIntel", maxTouchPoints: 5 }), true);
  assert.equal(shouldIsolateViewportScroll({ platform: "MacIntel", maxTouchPoints: 0 }), false);
  assert.equal(shouldIsolateViewportScroll({ platform: "Win32", maxTouchPoints: 10 }), false);
});

test("iOS momentum belongs to .app while the document body stays outside that scroll host", () => {
  const fixture = viewportFixture({ initialX: 4, initialY: 640 });
  const host = enableIsolatedViewportScrollHost({
    documentRef: fixture.documentRef,
    navigatorRef: { userAgent: "iPhone" },
    windowRef: fixture.windowRef
  });

  assert.equal(host, fixture.app);
  assert.equal(viewportScrollHost({ documentRef: fixture.documentRef }), fixture.app);
  assert.equal(fixture.app.parentElement, fixture.body);
  assert.equal(fixture.app.hasAttribute("data-viewport-scroll-host-no-banner"), true);
  assert.equal(fixture.body.classList.contains("isolated-viewport-scroll"), true);
  assert.equal(fixture.html.classList.contains("isolated-viewport-scroll"), true);
  assert.deepEqual({ left: fixture.app.scrollLeft, top: fixture.app.scrollTop }, { left: 4, top: 640 });
  assert.deepEqual({ left: fixture.html.scrollLeft, top: fixture.html.scrollTop }, { left: 0, top: 0 });
});

test("experimental banner keeps the original scroll-host top spacing", () => {
  const fixture = viewportFixture({ hasExperimentalBanner: true });
  enableIsolatedViewportScrollHost({
    documentRef: fixture.documentRef,
    force: true,
    navigatorRef: {},
    windowRef: fixture.windowRef
  });

  assert.equal(fixture.app.hasAttribute("data-viewport-scroll-host-no-banner"), false);
});

test("isolated host forwards scroll compatibility events and owns viewport scroll commands", () => {
  const fixture = viewportFixture();
  let forwardedScrolls = 0;
  fixture.windowRef.addEventListener("scroll", () => {
    forwardedScrolls += 1;
  });
  enableIsolatedViewportScrollHost({
    documentRef: fixture.documentRef,
    force: true,
    navigatorRef: {},
    windowRef: fixture.windowRef
  });

  fixture.app.scrollTop = 900;
  fixture.app.dispatch("scroll");
  assert.equal(forwardedScrolls, 1);
  assert.equal(viewportScrollTop({ documentRef: fixture.documentRef, windowRef: fixture.windowRef }), 900);

  scrollViewportTo(
    { left: 3, top: 120, behavior: "auto" },
    { documentRef: fixture.documentRef, windowRef: fixture.windowRef }
  );
  scrollViewportBy(
    { left: 2, top: -120, behavior: "auto" },
    { documentRef: fixture.documentRef, windowRef: fixture.windowRef }
  );
  assert.equal(viewportScrollLeft({ documentRef: fixture.documentRef, windowRef: fixture.windowRef }), 5);
  assert.equal(viewportScrollTop({ documentRef: fixture.documentRef, windowRef: fixture.windowRef }), 0);
  assert.deepEqual(fixture.windowScrollCalls, []);
});

test("disabling isolation restores the scroll position to the document viewport", () => {
  const fixture = viewportFixture();
  enableIsolatedViewportScrollHost({
    documentRef: fixture.documentRef,
    force: true,
    navigatorRef: {},
    windowRef: fixture.windowRef
  });
  fixture.app.scrollLeft = 8;
  fixture.app.scrollTop = 720;

  assert.equal(disableIsolatedViewportScrollHost({
    documentRef: fixture.documentRef,
    windowRef: fixture.windowRef
  }), true);
  assert.equal(fixture.app.hasAttribute("data-viewport-scroll-host"), false);
  assert.equal(fixture.app.hasAttribute("data-viewport-scroll-host-no-banner"), false);
  assert.deepEqual(fixture.windowScrollCalls, [{ left: 8, top: 720, behavior: "auto" }]);
});

test("portal is a body sibling of the isolated scroller and adds no sticky-header spacer", () => {
  const source = readFileSync(new URL("../../src/ui/catalog-back-to-top.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  const enableIndex = source.indexOf("enableIsolatedViewportScrollHost({");
  const portalIndex = source.indexOf("createPortalElements(documentRef)", enableIndex);

  assert.ok(enableIndex >= 0 && portalIndex > enableIndex, "scroll host is isolated before the portal is created");
  assert.match(source, /\(documentRef\.body \|\| documentRef\.documentElement\)\?\.append\?\.\(layer\)/);
  assert.match(styles, /html\.isolated-viewport-scroll,[\s\S]*?overflow:\s*hidden;/);
  assert.match(styles, /\.app\[data-viewport-scroll-host\]\s*\{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(styles, /\[data-viewport-scroll-host-no-banner\]\s*\{[\s\S]*?padding-top:\s*0;/);
  assert.match(styles, /\[data-viewport-scroll-host-no-banner\]\s+\.tabs-row,[\s\S]*?margin-top:\s*0;/);
  assert.match(styles, /\.catalog-back-to-top-layer\s*\{[\s\S]*?position:\s*fixed;/);
  assert.doesNotMatch(styles, /\.catalog-back-to-top-layer\s*\{[^}]*\bmargin\b/);
  assert.doesNotMatch(styles, /\.catalog-back-to-top-layer\s*\{[^}]*\bpadding\b/);
});
