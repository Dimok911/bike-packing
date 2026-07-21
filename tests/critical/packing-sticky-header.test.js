import test from "node:test";
import assert from "node:assert/strict";
import { bindStickyRootHeaderRow } from "../../src/ui/packing-scroll.js";

function createStyle() {
  return {
    setProperty(name, value) {
      this[name] = value;
    }
  };
}

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
