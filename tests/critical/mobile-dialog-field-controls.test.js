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
  assert.match(html, /id="itemCategoryScroll"[^>]+type="range"[^>]+data-modal-scroll-control/);
  assert.match(html, /id="rootContainerCategoryScroll"[^>]+type="range"[^>]+data-modal-scroll-control/);
  assert.match(styles, /\.category-picker-shell\[data-scrollable\] \.category-picker\s*\{[^}]*overflow-y:\s*hidden;[^}]*touch-action:\s*pan-y;/s);
  assert.match(styles, /\.mobile-note-resize-handle\s*\{[^}]*touch-action:\s*none;/s);
  assert.match(styles, /\.mobile-category-scroll-control::\-webkit-slider-runnable-track\s*\{[^}]*width:\s*14px;[^}]*background:\s*#dbe1db;/s);
  assert.match(styles, /\.mobile-category-scroll-control::\-webkit-slider-thumb\s*\{[^}]*width:\s*24px;[^}]*height:\s*56px;[^}]*background:\s*color-mix\(in srgb,\s*var\(--accent\)\s*18%,\s*#f6f4ee\);/s);
});
