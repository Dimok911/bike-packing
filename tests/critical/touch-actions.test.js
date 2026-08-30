import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { bindMainTabTouchNavigation } from "../../src/ui/main-tab-touch-navigation.js";

function tabFixture(view, documentRef) {
  const listeners = new Map();
  const tab = {
    dataset: { view },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    blur() {
      if (documentRef.activeElement === tab) documentRef.activeElement = null;
    },
    dispatch(type, { x = 120, y = 80, active = type !== "touchend" } = {}) {
      let prevented = false;
      let stopped = false;
      const point = { clientX: x, clientY: y };
      const event = {
        changedTouches: [point],
        currentTarget: tab,
        preventDefault: () => { prevented = true; },
        stopPropagation: () => { stopped = true; },
        touches: active ? [point] : []
      };
      listeners.get(type)?.(event);
      return { prevented, stopped };
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    }
  };
  return tab;
}

test("generic mobile feedback leaves scrolling native and tab activation to its dedicated controller", () => {
  const source = readFileSync(new URL("../../src/ui/touch-actions.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

  assert.doesNotMatch(source, /preventDoubleTapZoom/);
  assert.doesNotMatch(source, /touchend[\s\S]{0,240}preventDefault/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]{0,500}touch-action:\s*manipulation;/);
  assert.match(html, /name="viewport"[^>]+maximum-scale=1/);
});

test("a completed tab touch switches without Safari click and releases sticky focus", () => {
  const documentRef = { activeElement: null };
  const frames = [];
  const selected = [];
  let clock = 1000;
  const items = tabFixture("items", documentRef);
  documentRef.activeElement = items;
  bindMainTabTouchNavigation([items], {
    documentRef,
    now: () => clock,
    onSelect: (view) => selected.push(view),
    requestFrame: (callback) => frames.push(callback)
  });

  items.dispatch("touchstart");
  const touchEnd = items.dispatch("touchend", { active: false });
  assert.deepEqual(selected, ["items"]);
  assert.deepEqual(touchEnd, { prevented: true, stopped: true });
  assert.equal(documentRef.activeElement, null);

  const syntheticClick = items.dispatch("click", { active: false });
  assert.deepEqual(selected, ["items"]);
  assert.deepEqual(syntheticClick, { prevented: true, stopped: true });

  documentRef.activeElement = items;
  frames.splice(0).forEach((callback) => callback());
  assert.equal(documentRef.activeElement, null);

  clock = 1800;
  items.dispatch("click", { active: false });
  assert.deepEqual(selected, ["items", "items"]);
});

test("a tab touch that becomes a scroll gesture stays native", () => {
  const selected = [];
  const documentRef = { activeElement: null };
  const bags = tabFixture("bags", documentRef);
  bindMainTabTouchNavigation([bags], {
    documentRef,
    onSelect: (view) => selected.push(view),
    requestFrame: () => {}
  });

  bags.dispatch("touchstart", { x: 120, y: 120 });
  bags.dispatch("touchmove", { x: 123, y: 80 });
  const touchEnd = bags.dispatch("touchend", { x: 124, y: 65, active: false });

  assert.deepEqual(selected, []);
  assert.deepEqual(touchEnd, { prevented: false, stopped: false });
});

test("two direct packing taps retain the compact double-tap action", () => {
  const documentRef = { activeElement: null };
  const selected = [];
  let toggles = 0;
  let clock = 2000;
  const packing = tabFixture("packing", documentRef);
  bindMainTabTouchNavigation([packing], {
    documentRef,
    now: () => clock,
    onPackingDoubleTap: () => { toggles += 1; },
    onSelect: (view) => selected.push(view),
    requestFrame: () => {}
  });

  packing.dispatch("touchstart");
  packing.dispatch("touchend", { active: false });
  clock += 240;
  packing.dispatch("touchstart");
  packing.dispatch("touchend", { active: false });

  assert.deepEqual(selected, ["packing", "packing"]);
  assert.equal(toggles, 1);
});
