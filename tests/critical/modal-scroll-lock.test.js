import test from "node:test";
import assert from "node:assert/strict";
import { createModalScrollLockController } from "../../src/ui/modal-scroll-lock.js";

function testClassList(initial = []) {
  const classes = new Set(initial);
  return {
    add: (name) => classes.add(name),
    contains: (name) => classes.has(name),
    remove: (name) => classes.delete(name)
  };
}

test("CRITICAL modal scroll lock keeps sticky layout tabs in their native stacking context", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const bodyClasses = testClassList();
  const bodyStyle = { position: "", top: "", left: "", right: "", width: "", overflow: "" };
  const tabsRow = {
    getBoundingClientRect: () => ({ top: 0, bottom: 56 })
  };
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
    }
  };
  const scrollCalls = [];

  globalThis.document = {
    body: { classList: bodyClasses, style: bodyStyle },
    querySelectorAll: (selector) => selector === "dialog" ? [dialog] : (selector === ".tabs-row" ? [tabsRow] : [])
  };
  globalThis.window = {
    getComputedStyle: () => ({ position: "sticky" }),
    innerHeight: 1080,
    innerWidth: 1920,
    matchMedia: () => ({ matches: false }),
    scrollTo: (...args) => scrollCalls.push(args),
    scrollX: 24,
    scrollY: 640
  };

  try {
    const controller = createModalScrollLockController();
    controller.openModalDialog(dialog);
    assert.equal(bodyClasses.contains("modal-scroll-locked"), true);
    assert.equal(bodyStyle.position, "", "body fixed positioning would detach the sticky tabs from page scrolling");
    assert.equal(bodyStyle.top, "");

    dialog.open = false;
    controller.updateModalScrollLock();
    assert.equal(bodyClasses.contains("modal-scroll-locked"), false);
    assert.deepEqual(scrollCalls, [], "soft lock keeps the native page scroll position without restoration jumps");
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test("CRITICAL modal scroll lock still uses the hard lock when no sticky tabs are visible", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const bodyClasses = testClassList();
  const bodyStyle = { position: "", top: "", left: "", right: "", width: "", overflow: "" };
  const dialog = { open: true };

  globalThis.document = {
    body: { classList: bodyClasses, style: bodyStyle },
    querySelectorAll: (selector) => selector === "dialog" ? [dialog] : []
  };
  globalThis.window = {
    innerHeight: 1080,
    innerWidth: 1920,
    matchMedia: () => ({ matches: false }),
    scrollTo: () => {},
    scrollX: 0,
    scrollY: 320
  };

  try {
    const controller = createModalScrollLockController();
    controller.updateModalScrollLock();
    assert.equal(bodyStyle.position, "fixed");
    assert.equal(bodyStyle.top, "-320px");
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});
