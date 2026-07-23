import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  DEFAULT_DESKTOP_INPUT_LAYOUT_SELECTOR,
  DESKTOP_INPUT_LAYOUT_MUTE_ICONS,
  convertLatinToRuLayout,
  convertRuToLatinLayout,
  createDesktopInputNormalizer,
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

test("desktop input fields are block-level so controls center against the field without a baseline gap", async () => {
  const stylesSource = await readFile(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(
    stylesSource,
    /\.desktop-input-layout > input,\s*\.desktop-input-layout > textarea\s*\{\s*display:\s*block;/
  );
});

test("desktop layout controls leave a gap for a visible search clear button", async () => {
  const stylesSource = await readFile(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(
    stylesSource,
    /\.search-field:has\(> \.search-clear:not\(\[hidden\]\)\) \.desktop-input-layout-controls\s*\{\s*right:\s*40px;/
  );
  assert.match(stylesSource, /\.search-clear\s*\{[\s\S]*?right:\s*5px;[\s\S]*?width:\s*30px;/);
});

test("pause icon uses centered geometric bars instead of font glyph alignment", async () => {
  const stylesSource = await readFile(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(
    stylesSource,
    /\.desktop-input-layout-mute\s*\{[\s\S]*?position:\s*relative;/
  );
  assert.match(
    stylesSource,
    /\.desktop-input-layout-mute:not\(\.is-muted\)::before\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*calc\(50% \+ 1px\);[\s\S]*?left:\s*50%;[\s\S]*?width:\s*8px;[\s\S]*?height:\s*10px;[\s\S]*?transform:\s*translate\(-50%, -50%\);[\s\S]*?linear-gradient\(/
  );
});
