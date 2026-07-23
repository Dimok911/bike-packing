import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { I18N } from "../../src/data/i18n.js";
import {
  DEFAULT_INTERFACE_COLOR_BRIGHTNESS,
  DEFAULT_INTERFACE_COLOR_THEME,
  INTERFACE_COLOR_THEME_OPTIONS,
  applyInterfaceColorTheme,
  createInterfaceColorThemeController,
  normalizeInterfaceColorBrightness,
  normalizeInterfaceColorTheme
} from "../../src/ui/interface-color-theme.js";
import {
  loadStoredUiSettings,
  saveStoredUiSettings
} from "../../src/storage/ui-settings.js";

test("interface color picker offers eleven named themes and keeps jade as the default", () => {
  assert.equal(DEFAULT_INTERFACE_COLOR_THEME, "jade");
  assert.equal(DEFAULT_INTERFACE_COLOR_BRIGHTNESS, 100);
  assert.equal(INTERFACE_COLOR_THEME_OPTIONS.length, 11);
  assert.equal(new Set(INTERFACE_COLOR_THEME_OPTIONS.map((option) => option.value)).size, 11);
  assert.equal(new Set(INTERFACE_COLOR_THEME_OPTIONS.map((option) => option.hue)).size, 11);
  assert.equal(new Set(INTERFACE_COLOR_THEME_OPTIONS.map((option) => option.saturation)).size, 11);
  INTERFACE_COLOR_THEME_OPTIONS.forEach((option) => {
    assert.ok(option.saturation >= 70);
    assert.ok(I18N.ru[option.labelKey]);
    assert.ok(I18N.en[option.labelKey]);
  });
  assert.equal(normalizeInterfaceColorTheme(" AMETHYST "), "amethyst");
  assert.equal(normalizeInterfaceColorTheme("unknown"), "jade");
});

test("interface color brightness is bounded and defaults to 100 percent", () => {
  assert.equal(normalizeInterfaceColorBrightness(undefined), 100);
  assert.equal(normalizeInterfaceColorBrightness("115"), 115);
  assert.equal(normalizeInterfaceColorBrightness(20), 70);
  assert.equal(normalizeInterfaceColorBrightness(180), 130);
});

test("default button restores jade and 100 percent brightness together", () => {
  const defaultListeners = new Map();
  const brightnessListeners = new Map();
  const createElement = () => ({
    classList: { toggle() {} },
    dataset: {},
    style: { setProperty() {} },
    setAttribute() {},
    append() {}
  });
  const documentRef = {
    createElement,
    documentElement: {
      dataset: {},
      style: { setProperty() {} }
    },
    querySelector: () => null
  };
  const optionsRoot = {
    addEventListener() {},
    contains: () => true,
    removeEventListener() {},
    replaceChildren() {},
    setAttribute() {}
  };
  const brightnessInput = {
    value: "125",
    addEventListener: (type, listener) => brightnessListeners.set(type, listener),
    removeEventListener: (type) => brightnessListeners.delete(type)
  };
  const brightnessOutput = { textContent: "", value: "" };
  const defaultButton = {
    addEventListener: (type, listener) => defaultListeners.set(type, listener),
    removeEventListener: (type) => defaultListeners.delete(type)
  };
  const changes = [];
  const controller = createInterfaceColorThemeController({
    brightnessInput,
    brightnessOutput,
    defaultButton,
    documentRef,
    initialBrightness: 125,
    initialValue: "ruby",
    onBrightnessChange: (value) => changes.push(["brightness", value]),
    onChange: (value) => changes.push(["color", value]),
    optionsRoot
  });

  defaultListeners.get("click")();

  assert.equal(controller.getValue(), "jade");
  assert.equal(controller.getBrightness(), 100);
  assert.equal(brightnessInput.value, "100");
  assert.equal(brightnessOutput.textContent, "100%");
  assert.deepEqual(changes, [["color", "jade"], ["brightness", 100]]);
  controller.destroy();
  assert.equal(defaultListeners.size, 0);
  assert.equal(brightnessListeners.size, 0);
});

test("applying an interface color updates the shared hue and browser theme color", () => {
  const properties = new Map();
  const meta = {
    content: "",
    setAttribute(name, value) {
      if (name === "content") this.content = value;
    }
  };
  const documentRef = {
    documentElement: {
      dataset: {},
      style: {
        setProperty: (name, value) => properties.set(name, value)
      }
    },
    querySelector: (selector) => selector === 'meta[name="theme-color"]' ? meta : null
  };

  assert.equal(applyInterfaceColorTheme({
    brightness: 125,
    documentRef,
    value: "amethyst"
  }), "amethyst");
  assert.equal(documentRef.documentElement.dataset.interfaceColorTheme, "amethyst");
  assert.equal(properties.get("--interface-hue"), "274deg");
  assert.equal(properties.get("--interface-accent-saturation"), "76%");
  assert.equal(properties.get("--interface-medium-saturation"), "47%");
  assert.equal(properties.get("--interface-soft-saturation"), "36%");
  assert.equal(properties.get("--interface-accent-lightness"), "32%");
  assert.equal(properties.get("--interface-dark-lightness"), "26%");
  assert.equal(properties.get("--interface-darker-lightness"), "19.5%");
  assert.equal(meta.content, "#7030a5");
});

test("interface color is preserved in local UI settings", () => {
  const previousLocalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const options = {
    storageKey: "test-interface-color",
    normalizeSortMode: (value) => value || "asc",
    normalizePackingVisualStyle: (value) => value || "cards",
    normalizePackingViewMode: (value) => value || "columns",
    normalizeBike3dTransforms: (value) => value || {},
    normalizeBike3dViewState: (value) => value || {},
    normalizeInterfaceColorBrightness,
    normalizeInterfaceColorTheme,
    packingVisualStyleVersion: 1,
    defaultPackingVisualStyle: "cards",
    defaultInterfaceColorTheme: DEFAULT_INTERFACE_COLOR_THEME
  };

  try {
    saveStoredUiSettings({
      itemSortMode: "asc",
      rootContainerSortMode: "asc",
      dictionaryLocationSortMode: "asc",
      dictionaryCategorySortMode: "asc",
      interfaceColorBrightness: 124,
      interfaceColorTheme: "ruby",
      packingVisualStyle: "cards",
      packingViewMode: "columns",
      bike3dTransforms: {},
      bike3dViewState: {}
    }, options);

    assert.equal(loadStoredUiSettings(options).interfaceColorTheme, "ruby");
    assert.equal(loadStoredUiSettings(options).interfaceColorBrightness, 124);
  } finally {
    globalThis.localStorage = previousLocalStorage;
  }
});

test("interface accents use hue-relative CSS while preserving existing shade values", async () => {
  const [stylesSource, indexSource] = await Promise.all([
    readFile(new URL("../../styles.css", import.meta.url), "utf8"),
    readFile(new URL("../../index.html", import.meta.url), "utf8")
  ]);

  assert.match(stylesSource, /--interface-hue:\s*165deg/);
  assert.match(stylesSource, /--interface-accent-saturation:\s*70%/);
  assert.match(stylesSource, /hsl\(calc\(var\(--interface-hue\)/);
  assert.doesNotMatch(stylesSource, /rgba\(31,\s*111,\s*91,/);
  assert.doesNotMatch(stylesSource, /rgba\(220,\s*236,\s*230,/);
  assert.match(indexSource, /id="interfaceColorMenuBtn"/);
  assert.match(indexSource, /id="interfaceColorDialog"/);
  assert.match(indexSource, /id="interfaceColorOptions"/);
  assert.match(indexSource, /id="interfaceColorBrightness"/);
  assert.match(indexSource, /id="interfaceColorDefaultBtn"/);
  assert.equal(I18N.ru["interfaceColor.brightness"], "Яркость цвета");
  assert.equal(I18N.en["interfaceColor.default"], "Default");
});

test("interface color dialog and card share one contained width without horizontal scrolling", async () => {
  const stylesSource = await readFile(new URL("../../styles.css", import.meta.url), "utf8");

  assert.match(
    stylesSource,
    /#interfaceColorDialog\s*\{[\s\S]*?width:\s*min\(680px,\s*calc\(100vw - 24px\)\);[\s\S]*?overflow:\s*hidden;/
  );
  assert.match(
    stylesSource,
    /\.interface-color-dialog-card\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?box-sizing:\s*border-box;/
  );
  assert.match(
    stylesSource,
    /\.interface-color-options\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/
  );
});
