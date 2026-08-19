import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  pickerListPhotosEnabled,
  pickerListThumbnailHtml,
  syncPickerListPhotoToggle
} from "../../src/ui/picker-list-thumbnails.js";
import { loadStoredUiSettings, saveStoredUiSettings } from "../../src/storage/ui-settings.js";

const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
const htmlSource = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../../src/data/i18n.js", import.meta.url), "utf8");
globalThis.window = globalThis.window || { location: { href: "https://example.test/" } };

test("picker list thumbnails stay off by default and render the primary thumbnail when enabled", () => {
  assert.equal(pickerListPhotosEnabled(undefined), false);
  assert.equal(pickerListThumbnailHtml({ photos: [{ thumbUrl: "/thumb.jpg" }] }), "");

  const html = pickerListThumbnailHtml({
    photos: [{ id: "photo-1", thumbUrl: "/thumb.jpg", url: "/photo.jpg", updatedAt: "2026-08-15" }]
  }, { enabled: true });

  assert.match(html, /class="picker-list-thumbnail"/);
  assert.match(html, /data-photo-local-id="photo-1"/);
  assert.match(html, /thumb\.jpg/);
  assert.match(html, /loading="lazy"/);
});

test("picker list thumbnail prefers an available local preview and keeps an aligned empty slot", () => {
  const localHtml = pickerListThumbnailHtml({
    photos: [{ localId: "local-1", thumbUrl: "/thumb.jpg", url: "/photo.jpg" }]
  }, {
    enabled: true,
    photoObjectUrls: { sources: () => ({ preview: "blob:local-preview" }) }
  });
  assert.match(localHtml, /src="blob:local-preview"/);
  assert.match(localHtml, /data-photo-local-id="local-1"/);

  assert.match(
    pickerListThumbnailHtml({ photos: [] }, { enabled: true }),
    /picker-list-thumbnail empty/
  );
});

test("picker list photo toggle exposes its current state accessibly", () => {
  const label = { textContent: "" };
  const attributes = new Map();
  const classes = new Set();
  const button = {
    classList: { toggle: (name, force) => force ? classes.add(name) : classes.delete(name) },
    querySelector: () => label,
    setAttribute: (name, value) => attributes.set(name, value),
    title: ""
  };

  syncPickerListPhotoToggle(button, true, { showLabel: "Show photos", hideLabel: "Hide photos" });
  assert.equal(attributes.get("aria-pressed"), "true");
  assert.equal(attributes.get("aria-label"), "Hide photos");
  assert.equal(label.textContent, "Hide photos");
  assert.equal(classes.has("active"), true);
});

test("picker list photo preference survives UI settings reload", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const identity = (value) => value;
  const options = {
    storageKey: "picker-list-test",
    normalizeSortMode: identity,
    normalizePackingVisualStyle: identity,
    normalizePackingViewMode: identity,
    normalizeBike3dTransforms: (value) => value || {},
    normalizeBike3dViewState: (value) => value || {},
    packingVisualStyleVersion: 1,
    defaultPackingVisualStyle: "columns"
  };
  saveStoredUiSettings({
    pickerListPhotos: true,
    packingVisualStyle: "columns",
    packingViewMode: "columns",
    bike3dTransforms: {},
    bike3dViewState: {}
  }, options);
  assert.equal(loadStoredUiSettings(options).pickerListPhotos, true);
});

test("the nested picker always shows photos while the root picker keeps its persisted toggle", () => {
  assert.doesNotMatch(htmlSource, /id="addToContainerPhotoToggleBtn"/);
  assert.match(htmlSource, /id="layoutRootPhotoToggleBtn"/);
  assert.match(appSource, /layoutRootPhotoToggleBtn\?\.addEventListener\("click", togglePickerListPhotos\)/);
  assert.match(controllerSource, /function renderAddToContainerResults\(\)[\s\S]*?const showPhotos = true;/);
  assert.match(controllerSource, /pickerListThumbnailHtml\(item/);
  assert.match(controllerSource, /pickerListThumbnailHtml\(container/);
  assert.match(controllerSource, /saveUiSettings\(\)/);
  assert.match(stylesSource, /\.add-item-result\.with-thumbnail/);
  assert.equal((translationsSource.match(/"picker\.showPhotos"/g) || []).length, 2);
  assert.equal((translationsSource.match(/"picker\.hidePhotos"/g) || []).length, 2);
});
