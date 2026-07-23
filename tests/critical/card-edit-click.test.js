import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CARD_EDIT_INTERACTIVE_SELECTOR,
  shouldOpenCardEditor
} from "../../src/ui/card-edit-click.js";

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

test("CRITICAL card editing: packing and catalog cards use the shared single-click contract", () => {
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
