import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  centerElementInHorizontalScrollHost,
  scrollElementBelowStickyHeader,
  stickyHeaderOffsetForTarget
} from "../../src/ui/sticky-scroll.js";

function fixture({ bannerHeight = 60, packing = false, packingHeaderVisible = true } = {}) {
  const toolbar = {
    hidden: false,
    offsetParent: {},
    getBoundingClientRect: () => ({ height: 96 })
  };
  const view = { querySelector: () => packing ? null : toolbar };
  let boardScrollOptions = null;
  const packingHeader = {
    classList: {
      contains: (name) => name === "packing-root-header-row" || (name === "is-visible" && packingHeaderVisible)
    },
    getBoundingClientRect: () => ({ height: 86 })
  };
  const board = {
    clientWidth: 320,
    getBoundingClientRect: () => ({ left: 20, width: 320 }),
    previousElementSibling: packingHeader,
    scrollLeft: 500,
    scrollTo(options) { boardScrollOptions = options; },
    scrollWidth: 1200
  };
  const target = {
    closest(selector) {
      if (selector === ".view") return view;
      if (selector === ".board") return packing ? board : null;
      return null;
    },
    getBoundingClientRect: () => ({ left: 400, top: 420, width: 100 })
  };
  const documentRef = { documentElement: {} };
  let scrollOptions = null;
  const windowRef = {
    scrollY: 800,
    scrollX: 3,
    getComputedStyle(element) {
      if (element === documentRef.documentElement) {
        return {
          getPropertyValue(name) {
            if (name === "--sticky-banner-height") return `${bannerHeight}px`;
            if (name === "--sticky-controls-height") return "180px";
            return "48px";
          }
        };
      }
      if (element === packingHeader) {
        return {
          display: packingHeaderVisible ? "block" : "none",
          visibility: "visible",
          getPropertyValue(name) {
            return name === "--packing-root-header-cell-height" ? "78px" : "";
          }
        };
      }
      return { display: "grid" };
    },
    scrollTo(options) { scrollOptions = options; }
  };
  return {
    board,
    documentRef,
    target,
    windowRef,
    getBoardScrollOptions: () => boardScrollOptions,
    getScrollOptions: () => scrollOptions
  };
}

test("sticky search offset includes experimental banner, controls, tabs, catalog toolbar and gap", () => {
  const { documentRef, target, windowRef } = fixture();
  assert.equal(stickyHeaderOffsetForTarget(target, { documentRef, windowRef }), 396);
});

test("production without an experimental banner uses no empty banner spacer", () => {
  const { documentRef, target, windowRef } = fixture({ bannerHeight: 0 });
  assert.equal(stickyHeaderOffsetForTarget(target, { documentRef, windowRef }), 336);
});

test("search result is aligned immediately below the complete sticky stack", () => {
  const { documentRef, target, windowRef, getScrollOptions } = fixture();
  const result = scrollElementBelowStickyHeader(target, { documentRef, windowRef });
  assert.deepEqual(result, { top: 824, offset: 396 });
  assert.deepEqual(getScrollOptions(), { top: 824, left: 3, behavior: "smooth" });
});

test("desktop search uses the live sticky bottom while cached height variables are stale", () => {
  const { documentRef, target, windowRef } = fixture({ bannerHeight: 0 });
  const toolbar = target.closest(".view").querySelector(".catalog-toolbar-sticky");
  toolbar.getBoundingClientRect = () => ({ top: 240, bottom: 336, height: 96 });
  const originalGetComputedStyle = windowRef.getComputedStyle;
  windowRef.getComputedStyle = (element) => {
    if (element === documentRef.documentElement) {
      return { getPropertyValue: () => "0px" };
    }
    if (element === toolbar) {
      return {
        display: "grid",
        position: "sticky",
        top: "240px",
        visibility: "visible"
      };
    }
    return originalGetComputedStyle(element);
  };

  assert.equal(stickyHeaderOffsetForTarget(target, { documentRef, windowRef }), 348);
});

test("packing search includes the visible fixed root header and centers the match horizontally", () => {
  const {
    documentRef,
    target,
    windowRef,
    getBoardScrollOptions,
    getScrollOptions
  } = fixture({ packing: true });
  const result = scrollElementBelowStickyHeader(target, { documentRef, windowRef });

  assert.deepEqual(result, { top: 834, offset: 386 });
  assert.deepEqual(getScrollOptions(), { top: 834, left: 3, behavior: "smooth" });
  assert.deepEqual(getBoardScrollOptions(), { left: 770, behavior: "smooth" });
});

test("packing search reserves the root header before scrolling makes it fixed", () => {
  const {
    documentRef,
    target,
    windowRef,
    getScrollOptions
  } = fixture({ packing: true, packingHeaderVisible: false });
  const result = scrollElementBelowStickyHeader(target, { documentRef, windowRef });

  assert.deepEqual(result, { top: 842, offset: 378 });
  assert.deepEqual(getScrollOptions(), { top: 842, left: 3, behavior: "smooth" });
});

test("horizontal packing search is clamped to the board scroll range", () => {
  const { board, target } = fixture({ packing: true });
  target.getBoundingClientRect = () => ({ left: 980, top: 420, width: 100 });

  assert.deepEqual(
    centerElementInHorizontalScrollHost(target),
    { left: 880, maxScroll: 880 }
  );
  assert.equal(board.scrollLeft, 500);
});

test("catalog search does not start an unrelated horizontal scroll", () => {
  const { target } = fixture();
  assert.equal(centerElementInHorizontalScrollHost(target), null);
});

test("mobile sticky tabs stay below an optional experimental banner", () => {
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  const mobileStyles = styles.slice(styles.lastIndexOf("@media (max-width: 520px)"));

  assert.match(
    mobileStyles,
    /\.tabs-row \{\s*position: sticky;\s*top: var\(--sticky-banner-offset, 0px\);/
  );
  assert.doesNotMatch(mobileStyles, /\.tabs-row \{\s*position: sticky;\s*top: 0;/);
});

test("tab row keeps horizontal scrolling without a native vertical scrollbar", () => {
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

  assert.match(
    styles,
    /\.tabs\s*\{[\s\S]*?overflow-x:\s*auto;[\s\S]*?overflow-y:\s*hidden;/
  );
});

test("context search navigation keeps the compact experimental dimensions", () => {
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

  assert.match(styles, /\.filter-nav\s*\{[\s\S]*?gap:\s*0;/);
  assert.match(styles, /\.filter-nav button\s*\{[\s\S]*?width:\s*32px;[\s\S]*?min-height:\s*32px;/);
  assert.match(styles, /\.filter-nav span\s*\{[\s\S]*?min-width:\s*30px;/);
});
