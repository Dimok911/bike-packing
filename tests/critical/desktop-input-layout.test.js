import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  DEFAULT_DESKTOP_INPUT_LAYOUT_SELECTOR,
  DESKTOP_INPUT_LAYOUT_MUTE_ICONS,
  convertLatinToRuLayout,
  convertRuToLatinLayout,
  createDesktopInputNormalizer,
  isExternalTextInsertion,
  shouldEnableDesktopInputLayout
} from "../../src/ui/desktop-input-layout.js";

test("desktop input layout uses distinct pause and resume icons instead of a second clear cross", () => {
  assert.deepEqual(DESKTOP_INPUT_LAYOUT_MUTE_ICONS, {
    disable: "⏸",
    enable: "▶"
  });
  assert.notEqual(DESKTOP_INPUT_LAYOUT_MUTE_ICONS.disable, "×");
});

test("desktop input layout converts physical keyboard keys in both directions", () => {
  assert.equal(convertLatinToRuLayout("ghbdtn"), "привет");
  assert.equal(convertLatinToRuLayout("Ghbdtn"), "Привет");
  assert.equal(convertRuToLatinLayout("руддщ"), "hello");
  assert.equal(convertRuToLatinLayout("Руддщ"), "Hello");
});

test("desktop input layout defaults to RU and converts only the changed fragment", () => {
  const normalizer = createDesktopInputNormalizer({
    initialValue: "Красная сумка"
  });
  const input = {
    value: "Красная ,fuf; сумка",
    selectionStart: 13,
    selectionEnd: 13,
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  };

  assert.equal(normalizer.getMode(), "RU");
  assert.equal(normalizer.normalizeInput(input), "Красная багаж сумка");
  assert.equal(input.selectionStart, 13);
  assert.equal(input.selectionEnd, 13);
});

test("desktop input layout can switch to EN without reconverting existing text", () => {
  const normalizer = createDesktopInputNormalizer({
    initialMode: "RU",
    initialValue: "Bag "
  });
  normalizer.toggleMode();
  const input = {
    value: "Bag руддщ",
    selectionStart: 9,
    selectionEnd: 9,
    setSelectionRange() {}
  };

  assert.equal(normalizer.getMode(), "EN");
  assert.equal(normalizer.normalizeInput(input), "Bag hello");
});

test("layout controls are enabled only for RU desktop UI", () => {
  assert.equal(shouldEnableDesktopInputLayout({ language: "ru", desktopMatches: true }), true);
  assert.equal(shouldEnableDesktopInputLayout({ language: "en", desktopMatches: true }), false);
  assert.equal(shouldEnableDesktopInputLayout({ language: "ru", desktopMatches: false }), false);
});

test("desktop layout selector covers search, item, bag, layout and dictionary fields", () => {
  [
    "#searchInput",
    "#categoryFilterSearch",
    "#itemCategorySearch",
    "#rootContainerCategorySearch",
    "#itemName",
    "#rootContainerName",
    "#itemColor",
    "#rootContainerColor",
    "#itemNote",
    "#rootContainerNote",
    "#layoutEditName",
    "#layoutEditNotes",
    "#layoutName",
    "#categoryInput",
    "#locationInput",
    "[data-new-category-input]",
    "[data-dictionary-edit-input]"
  ].forEach((selector) => assert.match(DEFAULT_DESKTOP_INPUT_LAYOUT_SELECTOR, new RegExp(selector.replace(/[[\]#]/g, "\\$&"))));
});

test("desktop input controls and styles come from the shared module", async () => {
  const stylesSource = await readFile(new URL("../../src/vendor/vniipo-input-layout-fallback.js", import.meta.url), "utf8");
  assert.match(
    stylesSource,
    /\.desktop-input-layout>input,\.desktop-input-layout>textarea\{display:block;/
  );
  assert.match(stylesSource, /createController/);
  assert.match(stylesSource, /vniipo-input-layout-v1-styles/);
  assert.match(
    stylesSource,
    /\.desktop-input-layout-controls button\{[^}]*min-width:0;min-height:0;/
  );
});

test("desktop layout controls leave a gap for a visible search clear button", async () => {
  const stylesSource = await readFile(new URL("../../src/vendor/vniipo-input-layout-fallback.js", import.meta.url), "utf8");
  assert.match(
    stylesSource,
    /\.desktop-input-layout\.with-search-clear \.desktop-input-layout-controls,[^{]*\{right:40px\}/
  );
  const appStyles = await readFile(new URL("../../styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(appStyles, /\.desktop-input-layout\s*\{/);
  assert.match(appStyles, /\.search-clear\s*\{[\s\S]*?right:\s*5px;[\s\S]*?width:\s*30px;/);
});

test("pasted or dropped text bypasses layout conversion", () => {
  assert.equal(isExternalTextInsertion({ inputType: "insertFromPaste" }), true);
  assert.equal(isExternalTextInsertion({ inputType: "insertFromDrop" }), true);
  assert.equal(isExternalTextInsertion({ inputType: "insertText" }), false);
});
