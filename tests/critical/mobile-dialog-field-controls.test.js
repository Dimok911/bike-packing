import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  categoryScrollMaximum,
  nextNoteHeight,
  noteResizeBounds
} from "../../src/ui/mobile-dialog-field-controls.js";

test("mobile note resize clamps touch movement to a useful viewport range", () => {
  assert.deepEqual(noteResizeBounds({ viewportHeight: 800 }), { min: 96, max: 520 });
  assert.equal(nextNoteHeight(120, 180, { viewportHeight: 800 }), 300);
  assert.equal(nextNoteHeight(120, -500, { viewportHeight: 800 }), 96);
  assert.equal(nextNoteHeight(500, 500, { viewportHeight: 800 }), 520);
});

test("category range uses the exact hidden overflow distance", () => {
  assert.equal(categoryScrollMaximum({ clientHeight: 190, scrollHeight: 760 }), 570);
  assert.equal(categoryScrollMaximum({ clientHeight: 190, scrollHeight: 120 }), 0);
});

test("mobile edit dialogs expose touch controls while category swipes belong to the form", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

  assert.match(html, /id="itemNoteResizeHandle"/);
  assert.match(html, /id="rootContainerNoteResizeHandle"/);
  assert.match(html, /id="itemCategoryScroll"[^>]+type="range"/);
  assert.match(html, /id="rootContainerCategoryScroll"[^>]+type="range"/);
  assert.match(styles, /\.category-picker-shell\[data-scrollable\] \.category-picker\s*\{[^}]*overflow-y:\s*hidden;[^}]*touch-action:\s*pan-y;/s);
  assert.match(styles, /\.mobile-note-resize-handle\s*\{[^}]*touch-action:\s*none;/s);
});
