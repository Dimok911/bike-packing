import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CARD_EDIT_INTERACTIVE_SELECTOR,
  shouldOpenCardEditor
} from "../../src/ui/card-edit-click.js";
import {
  POST_DRAG_CLICK_SUPPRESSION_MS,
  shouldSuppressClickAfterDragAttempt,
  suppressNextClickAfterDrag
} from "../../src/ui/drag-click-suppression.js";
import { updateNestedPackingDisclosure } from "../../src/ui/packing-disclosure.js";

function classList(initial = []) {
  const values = new Set(initial);
  return {
    add(value) {
      values.add(value);
    },
    contains(value) {
      return values.has(value);
    },
    remove(value) {
      values.delete(value);
    },
    toggle(value, force) {
      if (force) values.add(value);
      else values.delete(value);
    }
  };
}

function clickEvent({
  button = 0,
  card,
  closestInteractive = null,
  closestCard = card,
  defaultPrevented = false,
  ...modifiers
} = {}) {
  return {
    button,
    defaultPrevented,
    target: {
      closest(selector) {
        if (selector === CARD_EDIT_INTERACTIVE_SELECTOR) return closestInteractive;
        return closestCard;
      }
    },
    ...modifiers
  };
}

test("CRITICAL card editing: a plain single click on the card surface opens the editor", () => {
  const card = { dataset: {} };
  assert.equal(shouldOpenCardEditor(clickEvent({ card }), {
    card,
    closestCardSelector: ".editable-card"
  }), true);
});

test("CRITICAL card editing: action buttons and photo controls keep their own click behavior", () => {
  const card = { dataset: {} };
  assert.match(CARD_EDIT_INTERACTIVE_SELECTOR, /\[data-photo-controls\]/);
  assert.equal(shouldOpenCardEditor(clickEvent({ card, closestInteractive: {} }), {
    card,
    closestCardSelector: ".editable-card"
  }), false);
});

test("CRITICAL card editing: nested cards, drag completion, and catalog modifiers do not open another editor", () => {
  const card = { dataset: {} };
  assert.equal(shouldOpenCardEditor(clickEvent({ card, closestCard: { dataset: {} } }), {
    card,
    closestCardSelector: ".editable-card"
  }), false);
  card.dataset.justDragged = "true";
  assert.equal(shouldOpenCardEditor(clickEvent({ card }), { card }), false);
  delete card.dataset.justDragged;
  assert.equal(shouldOpenCardEditor(clickEvent({ card, shiftKey: true }), { card }), false);
  assert.equal(shouldOpenCardEditor(clickEvent({ card, ctrlKey: true }), { card }), false);
});

test("CRITICAL card editing: a completed drag consumes exactly the next synthetic click", () => {
  const listeners = new Map();
  const clearedTimers = [];
  const source = {
    dataset: {},
    addEventListener(type, listener, capture) {
      listeners.set(`${type}:${capture}`, listener);
    },
    removeEventListener(type, listener, capture) {
      if (listeners.get(`${type}:${capture}`) === listener) listeners.delete(`${type}:${capture}`);
    }
  };
  const windowRef = {
    setTimeout(callback, delay) {
      assert.equal(delay, POST_DRAG_CLICK_SUPPRESSION_MS);
      return { callback };
    },
    clearTimeout(timer) {
      clearedTimers.push(timer);
    }
  };

  suppressNextClickAfterDrag(source, { windowRef });
  assert.equal(source.dataset.justDragged, "true");

  const calls = [];
  listeners.get("click:true")({
    target: source,
    preventDefault: () => calls.push("prevent"),
    stopPropagation: () => calls.push("stop"),
    stopImmediatePropagation: () => calls.push("immediate")
  });

  assert.deepEqual(calls, ["prevent", "stop", "immediate"]);
  assert.equal(source.dataset.justDragged, undefined);
  assert.equal(listeners.has("click:true"), false);
  assert.equal(clearedTimers.length, 1);
});

test("CRITICAL card editing: drag completion catches the synthetic click at document level", () => {
  const listeners = new Map();
  const documentRoot = {
    addEventListener(type, listener, capture) {
      listeners.set(`${type}:${capture}`, listener);
    },
    removeEventListener(type, listener, capture) {
      if (listeners.get(`${type}:${capture}`) === listener) listeners.delete(`${type}:${capture}`);
    }
  };
  const source = {
    dataset: {},
    ownerDocument: documentRoot,
    addEventListener() {}
  };
  const calls = [];

  suppressNextClickAfterDrag(source, {
    clientX: 240,
    clientY: 180,
    windowRef: {
      setTimeout() {
        return 1;
      },
      clearTimeout() {}
    }
  });
  listeners.get("click:true")({
    target: { dataset: {} },
    clientX: 245,
    clientY: 176,
    preventDefault: () => calls.push("prevent"),
    stopPropagation: () => calls.push("stop"),
    stopImmediatePropagation: () => calls.push("immediate")
  });

  assert.deepEqual(calls, ["prevent", "stop", "immediate"]);
  assert.equal(listeners.has("click:true"), false);
});

test("CRITICAL card editing: drag click suppression expires so later ordinary clicks work", () => {
  const listeners = new Map();
  let timeoutCallback = null;
  const source = {
    dataset: {},
    addEventListener(type, listener, capture) {
      listeners.set(`${type}:${capture}`, listener);
    },
    removeEventListener(type, listener, capture) {
      if (listeners.get(`${type}:${capture}`) === listener) listeners.delete(`${type}:${capture}`);
    }
  };

  suppressNextClickAfterDrag(source, {
    windowRef: {
      setTimeout(callback) {
        timeoutCallback = callback;
        return 1;
      },
      clearTimeout() {}
    }
  });
  timeoutCallback();

  assert.equal(source.dataset.justDragged, undefined);
  assert.equal(listeners.has("click:true"), false);
  assert.equal(shouldOpenCardEditor(clickEvent({ card: source }), { card: source }), true);
});

test("CRITICAL card editing: a recognized drag attempt on a locked layout suppresses its release click", () => {
  assert.equal(shouldSuppressClickAfterDragAttempt(), false);
  assert.equal(shouldSuppressClickAfterDragAttempt({ started: false, blocked: false }), false);
  assert.equal(shouldSuppressClickAfterDragAttempt({ started: true, blocked: false }), true);
  assert.equal(shouldSuppressClickAfterDragAttempt({ started: false, blocked: true }), true);

  const dragSource = readFileSync(new URL("../../src/ui/packing-drag.js", import.meta.url), "utf8");
  const guardedSuppressions = dragSource.match(
    /shouldSuppressClickAfterDragAttempt\(\{\s*started,\s*blocked:\s*dragStartBlocked\s*\}\)/g
  ) || [];
  assert.equal(guardedSuppressions.length, 3);
});

test("CRITICAL card editing: packing and catalog cards use the shared single-click contract", () => {
  const dragSource = readFileSync(new URL("../../src/ui/packing-drag.js", import.meta.url), "utf8");
  const packingSource = readFileSync(new URL("../../src/ui/packing-events.js", import.meta.url), "utf8");
  const settingsSource = readFileSync(new URL("../../src/ui/settings-editor-bindings.js", import.meta.url), "utf8");
  const appTailSource = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  assert.doesNotMatch(packingSource, /addEventListener\("dblclick"/);
  assert.doesNotMatch(settingsSource, /addEventListener\("dblclick"/);
  assert.match(packingSource, /cardSelector: "\.item-card\[data-item-id\]"/);
  assert.match(packingSource, /data-subcontainer-id/);
  assert.match(settingsSource, /cardSelector: "\.root-container-card\[data-root-card\]"/);
  assert.match(appTailSource, /cardSelector: "\.item-card\[data-list-item-id\]"/);
  assert.match(appSource, /bindPhotoGalleries\(document, photoGalleryBindingOptions\(\)\)/);
  assert.match(appTailSource, /\[data-photo-controls\]/);
  assert.match(dragSource, /suppressNextClickAfterDrag\(source,\s*\{\s*clientX:\s*latestX,\s*clientY:\s*latestY\s*\}\)/);
});

test("CRITICAL card editing: gaps around photo dots belong to the gallery controls", () => {
  const gallerySource = readFileSync(new URL("../../src/ui/photo-gallery.js", import.meta.url), "utf8");
  const dragSource = readFileSync(new URL("../../src/ui/packing-drag.js", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

  assert.match(gallerySource, /class="photo-gallery-dots" data-photo-controls/);
  assert.match(gallerySource, /class="photo-gallery-dot-mark"/);
  assert.match(dragSource, /\[data-photo-controls\]/);
  assert.match(stylesSource, /\.photo-gallery-dots\s*\{[^}]*gap:\s*0;/s);
  assert.match(stylesSource, /\.photo-gallery-dot\s*\{[^}]*width:\s*12px;[^}]*height:\s*22px;[^}]*margin:\s*0;/s);
  assert.match(stylesSource, /\.photo-gallery-dot-mark\s*\{[^}]*width:\s*8px;[^}]*height:\s*8px;[^}]*pointer-events:\s*none;/s);
  assert.match(stylesSource, /\.photo-gallery-dot:not\(:disabled\):active,[^}]*translate:\s*0;[^}]*filter:\s*none;/s);
  assert.match(stylesSource, /\.photo-gallery-dot\.active \.photo-gallery-dot-mark\s*\{/);
  assert.doesNotMatch(stylesSource, /\.photo-gallery-dot::before/);
});

test("CRITICAL card editing: cards no longer render redundant edit buttons", () => {
  const packingRenderSource = readFileSync(new URL("../../src/ui/packing-board-render.js", import.meta.url), "utf8");
  const itemsRenderSource = readFileSync(new URL("../../src/ui/items-view-render.js", import.meta.url), "utf8");
  const bagsRenderSource = readFileSync(new URL("../../src/ui/settings-render.js", import.meta.url), "utf8");
  assert.doesNotMatch(packingRenderSource, /data-edit-item|data-edit-container/);
  assert.doesNotMatch(itemsRenderSource, /data-edit-item/);
  assert.doesNotMatch(bagsRenderSource, /data-edit-root/);
  assert.match(packingRenderSource, /data-replace-layout-item/);
  assert.match(packingRenderSource, /data-remove-from-layout/);
  assert.match(itemsRenderSource, /data-copy-item/);
  assert.match(itemsRenderSource, /data-delete-item/);
  assert.match(bagsRenderSource, /data-copy-root/);
  assert.match(bagsRenderSource, /data-delete-root/);
});

test("CRITICAL card editing: collapse arrows have a 44px hit area without taking title space", () => {
  const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(stylesSource, /\.collapse-button\s*\{[^}]*min-height:\s*28px;[^}]*width:\s*28px;[^}]*position:\s*relative;/s);
  assert.match(stylesSource, /\.collapse-button::before\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*-8px;/s);
  assert.doesNotMatch(stylesSource, /\.collapse-button\s*\{[^}]*min-width:\s*44px;/s);
});

test("CRITICAL packing disclosure arrows point right when collapsed and down when expanded", () => {
  const packingRenderSource = readFileSync(new URL("../../src/ui/packing-board-render.js", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(packingRenderSource, /rootCollapsed \? "chevron-right" : "chevron-down"/);
  assert.match(packingRenderSource, /collapsed \? "chevron-right" : "chevron-down"/);
  assert.match(stylesSource, /\.chevron-right\s*\{[^}]*rotate\(-45deg\)/s);
});

test("CRITICAL nested packing disclosure updates immediately without replacing the board", () => {
  const animationListeners = new Map();
  const sectionClasses = classList(["subcontainer", "collapsed"]);
  const iconClasses = classList(["chevron-icon", "chevron-right"]);
  const dropzone = {
    addEventListener(type, listener) {
      animationListeners.set(type, listener);
    }
  };
  const section = {
    dataset: { subcontainerId: "bag-1" },
    classList: sectionClasses,
    querySelector(selector) {
      assert.equal(selector, ":scope > .dropzone");
      return dropzone;
    }
  };
  const attributes = new Map();
  const button = {
    dataset: {
      toggleContainer: "bag-1",
      expandLabel: "Expand",
      collapseLabel: "Collapse"
    },
    closest(selector) {
      assert.equal(selector, ".subcontainer[data-subcontainer-id]");
      return section;
    },
    querySelector(selector) {
      assert.equal(selector, ".chevron-icon");
      return { classList: iconClasses };
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    }
  };

  assert.equal(updateNestedPackingDisclosure(button, false), true);
  assert.equal(sectionClasses.contains("collapsed"), false);
  assert.equal(sectionClasses.contains("native-disclosure-opening"), true);
  assert.equal(iconClasses.contains("chevron-right"), false);
  assert.equal(iconClasses.contains("chevron-down"), true);
  assert.equal(attributes.get("aria-expanded"), "true");
  assert.equal(attributes.get("aria-label"), "Collapse");
  assert.equal(attributes.get("title"), "Collapse");

  animationListeners.get("animationend")();
  assert.equal(sectionClasses.contains("native-disclosure-opening"), false);

  assert.equal(updateNestedPackingDisclosure(button, true), true);
  assert.equal(sectionClasses.contains("collapsed"), true);
  assert.equal(iconClasses.contains("chevron-right"), true);
  assert.equal(iconClasses.contains("chevron-down"), false);
  assert.equal(attributes.get("aria-expanded"), "false");
  assert.equal(attributes.get("aria-label"), "Expand");
});

test("CRITICAL root disclosure keeps the full-render fallback", () => {
  const rootButton = {
    dataset: { toggleContainer: "root-1" },
    closest() {
      return null;
    }
  };
  const packingSource = readFileSync(new URL("../../src/ui/packing-events.js", import.meta.url), "utf8");
  assert.equal(updateNestedPackingDisclosure(rootButton, true), false);
  assert.match(packingSource, /if \(!updatedWithoutRender\) render\(\)/);
});
