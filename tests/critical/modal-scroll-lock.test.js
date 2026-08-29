import test from "node:test";
import assert from "node:assert/strict";
import "./mobile-dialog-field-controls.test.js";
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
  const scrollHostStyle = { overflow: "scroll" };
  const scrollHost = { hasAttribute: () => false, style: scrollHostStyle };
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
    scrollingElement: scrollHost,
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
    assert.equal(scrollHostStyle.overflow, "hidden", "soft lock freezes the actual page scroll host");

    dialog.open = false;
    controller.updateModalScrollLock();
    assert.equal(bodyClasses.contains("modal-scroll-locked"), false);
    assert.equal(scrollHostStyle.overflow, "scroll");
    assert.deepEqual(scrollCalls, [], "soft lock keeps the native page scroll position without restoration jumps");
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test("CRITICAL modal scroll lock blocks wheel events retargeted from the backdrop to the dialog", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const listeners = new Map();
  const bodyClasses = testClassList();
  const bodyStyle = { position: "", top: "", left: "", right: "", width: "", overflow: "" };
  const dialog = {
    addEventListener: () => {},
    clientHeight: 400,
    closest: () => dialog,
    getBoundingClientRect: () => ({ top: 100, right: 500, bottom: 500, left: 100 }),
    open: true,
    parentElement: null,
    scrollHeight: 800,
    scrollTop: 100
  };

  globalThis.document = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    body: { classList: bodyClasses, style: bodyStyle },
    querySelectorAll: (selector) => selector === "dialog" ? [dialog] : []
  };
  globalThis.window = {
    getComputedStyle: () => ({ overflowY: "auto", position: "static" }),
    innerHeight: 1080,
    innerWidth: 1920,
    matchMedia: () => ({ matches: false }),
    scrollTo: () => {},
    scrollX: 0,
    scrollY: 320
  };

  try {
    const controller = createModalScrollLockController();
    controller.setupModalScrollLock();
    controller.updateModalScrollLock();
    let prevented = false;
    let stopped = false;
    listeners.get("wheel")({
      clientX: 50,
      clientY: 200,
      deltaY: 120,
      preventDefault: () => { prevented = true; },
      stopImmediatePropagation: () => { stopped = true; },
      target: dialog
    });
    assert.equal(prevented, true);
    assert.equal(stopped, true, "background components must not handle a backdrop wheel event");
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test("CRITICAL modal scroll lock lets a fullscreen gallery swipe above an edit dialog", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const listeners = new Map();
  const bodyClasses = testClassList();
  const bodyStyle = { position: "", top: "", left: "", right: "", width: "", overflow: "" };
  const editDialog = {
    addEventListener: () => {},
    open: true
  };
  const lightbox = {
    addEventListener: () => {},
    hasAttribute: (name) => name === "data-modal-gesture-surface",
    open: true
  };
  const image = {
    closest: (selector) => selector === "dialog" ? lightbox : null
  };

  globalThis.document = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    body: { classList: bodyClasses, style: bodyStyle },
    querySelectorAll: (selector) => selector === "dialog" ? [editDialog, lightbox] : []
  };
  globalThis.window = {
    getComputedStyle: () => ({ overflowY: "hidden", position: "static" }),
    innerHeight: 1080,
    innerWidth: 390,
    matchMedia: () => ({ matches: true }),
    scrollTo: () => {},
    scrollX: 0,
    scrollY: 320
  };

  try {
    const controller = createModalScrollLockController();
    controller.setupModalScrollLock();
    controller.updateModalScrollLock();
    let prevented = false;
    let stopped = false;
    listeners.get("touchstart")({
      target: image,
      touches: [{ clientX: 300, clientY: 200 }]
    });
    listeners.get("touchmove")({
      target: image,
      touches: [{ clientX: 120, clientY: 204 }],
      preventDefault: () => { prevented = true; },
      stopImmediatePropagation: () => { stopped = true; }
    });
    assert.equal(prevented, false);
    assert.equal(stopped, false, "the lightbox must receive its horizontal swipe above another modal");
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test("CRITICAL modal scroll lock hands a category edge swipe to the dialog card", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const listeners = new Map();
  const bodyClasses = testClassList();
  const bodyStyle = { position: "", top: "", left: "", right: "", width: "", overflow: "" };
  const dialog = {
    addEventListener: () => {},
    hasAttribute: () => false,
    open: true,
    parentElement: null
  };
  const dialogCard = {
    clientHeight: 500,
    parentElement: dialog,
    scrollHeight: 1000,
    scrollTop: 200
  };
  const categoryPicker = {
    clientHeight: 180,
    parentElement: dialogCard,
    scrollHeight: 360,
    scrollTop: 180
  };
  const categoryOption = {
    clientHeight: 40,
    closest: (selector) => selector === "dialog" ? dialog : null,
    parentElement: categoryPicker,
    scrollHeight: 40,
    scrollTop: 0
  };

  globalThis.document = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    body: { classList: bodyClasses, style: bodyStyle },
    querySelectorAll: (selector) => selector === "dialog" ? [dialog] : []
  };
  globalThis.window = {
    getComputedStyle: (element) => ({
      overflowY: element === categoryPicker || element === dialogCard ? "auto" : "visible",
      position: "static"
    }),
    innerHeight: 844,
    innerWidth: 390,
    matchMedia: () => ({ matches: true }),
    scrollTo: () => {},
    scrollX: 0,
    scrollY: 0
  };

  try {
    const controller = createModalScrollLockController();
    controller.setupModalScrollLock();
    controller.updateModalScrollLock();
    let prevented = false;
    listeners.get("touchstart")({
      target: categoryOption,
      touches: [{ clientX: 180, clientY: 300 }]
    });
    listeners.get("touchmove")({
      target: categoryOption,
      touches: [{ clientX: 180, clientY: 250 }],
      preventDefault: () => { prevented = true; },
      stopImmediatePropagation: () => {}
    });
    assert.equal(prevented, false, "a downward swipe at the field bottom must continue in the dialog card");

    dialogCard.scrollTop = 500;
    prevented = false;
    listeners.get("touchmove")({
      target: categoryOption,
      touches: [{ clientX: 180, clientY: 220 }],
      preventDefault: () => { prevented = true; },
      stopImmediatePropagation: () => {}
    });
    assert.equal(prevented, true, "the background stays locked after every modal scroller reaches its edge");
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test("CRITICAL modal scroll lock never blocks the category slider at the top edge", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const listeners = new Map();
  const bodyClasses = testClassList();
  const bodyStyle = { position: "", top: "", left: "", right: "", width: "", overflow: "" };
  const dialog = {
    addEventListener: () => {},
    hasAttribute: () => false,
    open: true,
    parentElement: null
  };
  const dialogCard = {
    clientHeight: 500,
    parentElement: dialog,
    scrollHeight: 1000,
    scrollTop: 0
  };
  const slider = {
    closest: (selector) => {
      if (selector === "dialog") return dialog;
      if (selector === "[data-modal-scroll-control]") return slider;
      return null;
    },
    parentElement: dialogCard
  };

  globalThis.document = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    body: { classList: bodyClasses, style: bodyStyle },
    querySelectorAll: (selector) => selector === "dialog" ? [dialog] : []
  };
  globalThis.window = {
    getComputedStyle: () => ({ overflowY: "auto", position: "static" }),
    innerHeight: 844,
    innerWidth: 390,
    matchMedia: () => ({ matches: true }),
    scrollTo: () => {},
    scrollX: 0,
    scrollY: 0
  };

  try {
    const controller = createModalScrollLockController();
    controller.setupModalScrollLock();
    controller.updateModalScrollLock();
    let prevented = false;
    listeners.get("touchstart")({
      target: slider,
      touches: [{ clientX: 360, clientY: 300 }]
    });
    listeners.get("touchmove")({
      target: slider,
      touches: [{ clientX: 360, clientY: 360 }],
      preventDefault: () => { prevented = true; },
      stopImmediatePropagation: () => {}
    });
    assert.equal(prevented, false, "the slider must own its gesture even while the modal card is at scrollTop 0");
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
