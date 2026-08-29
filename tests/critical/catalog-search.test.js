import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  matchesItemFieldsFilter,
  matchesRootContainerFieldsFilter,
  recordNoteMatchesQuery
} from "../../src/state/catalog-search.js";
import {
  renderRootContainerColumnHtml,
  renderSubcontainerSectionHtml
} from "../../src/ui/packing-board-render.js";
import { renderSearchNoteMatchBadge } from "../../src/ui/search-note-match.js";
import { highlightSearchText } from "../../src/ui/search-highlight.js";
import {
  createNoteSearchNavigator,
  findNoteSearchMatches
} from "../../src/ui/note-search-navigation.js";

const item = {
  id: "item-1",
  name: "Stove",
  categories: ["Kitchen"],
  location: "Home",
  note: "For hot meals",
  containerId: "bag-1"
};

const options = {
  includeContainerPath: true,
  itemCategories: (value) => value.categories,
  containerPath: () => "Rear rack bag / Cooking pouch"
};

test("note match badge overlays the desktop photo instead of being clipped from the title row", () => {
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.items-list\.with-photo-slots \.item-card:has\(\.item-photo\) \.item-card-top \{[\s\S]*?overflow:\s*visible;/);
  assert.match(styles, /\.item-card:has\(\.item-photo\) \.catalog-card-title-block > \.search-note-match-badge \{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*calc\(var\(--photo-top-row-height\) \+ 76px\);/);
  assert.match(styles, /button\.search-note-match-badge \{[\s\S]*?pointer-events:\s*auto;/);
  assert.match(styles, /textarea\.note-search-match-active::selection \{[\s\S]*?background:\s*#ffb52e;/);
});

test("item search excludes fields handled by dedicated filters and placement UI", () => {
  assert.equal(matchesItemFieldsFilter(item, { ...options, query: "rear rack" }), false);
  assert.equal(matchesItemFieldsFilter(item, { ...options, query: "cooking pouch" }), false);
  assert.equal(matchesItemFieldsFilter(item, { ...options, query: "kitchen" }), false);
  assert.equal(matchesItemFieldsFilter(item, { ...options, query: "home" }), false);
});

test("item search includes only the name and note", () => {
  assert.equal(matchesItemFieldsFilter(item, { ...options, query: "stove" }), true);
  assert.equal(matchesItemFieldsFilter(item, { ...options, query: "hot meals" }), true);
});

test("multi-word search requires every word without requiring an exact phrase", () => {
  const electricPump = {
    ...item,
    name: "Насос велосипедный электрический",
    note: "Зарядить перед поездкой"
  };
  assert.equal(matchesItemFieldsFilter(electricPump, { ...options, query: "насос электрический" }), true);
  assert.equal(matchesItemFieldsFilter(electricPump, { ...options, query: "электрический насос" }), true);
  assert.equal(matchesItemFieldsFilter(electricPump, { ...options, query: "насос ручной" }), false);
  assert.equal(matchesItemFieldsFilter(electricPump, { ...options, query: "  НАСОС   электрический  " }), true);
  assert.equal(
    highlightSearchText(electricPump.name, "насос электрический"),
    "<mark>Насос</mark> велосипедный <mark>электрический</mark>"
  );
});

test("bag search includes only the name and note", () => {
  const bag = {
    name: "Frame bag",
    categories: ["Bags"],
    color: "Orange",
    location: "Garage",
    note: "For the long tour"
  };
  const bagOptions = {
    containerCategories: (value) => value.categories,
    containerLocation: bag.location
  };

  assert.equal(matchesRootContainerFieldsFilter(bag, { ...bagOptions, query: "frame" }), true);
  assert.equal(matchesRootContainerFieldsFilter(bag, { ...bagOptions, query: "long tour" }), true);
  assert.equal(matchesRootContainerFieldsFilter(bag, { ...bagOptions, query: "bags" }), false);
  assert.equal(matchesRootContainerFieldsFilter(bag, { ...bagOptions, query: "orange" }), false);
  assert.equal(matchesRootContainerFieldsFilter(bag, { ...bagOptions, query: "garage" }), false);
});

test("category and storage filters still apply independently of text search", () => {
  assert.equal(matchesItemFieldsFilter(item, {
    ...options,
    query: "stove",
    categories: ["Kitchen"],
    location: "Home"
  }), true);
  assert.equal(matchesItemFieldsFilter(item, { ...options, categories: ["Clothes"] }), false);
  assert.equal(matchesItemFieldsFilter(item, { ...options, location: "Garage" }), false);
});

test("note match is detected separately from a name-only match", () => {
  assert.equal(recordNoteMatchesQuery(item, "hot meals"), true);
  assert.equal(recordNoteMatchesQuery(item, "stove"), false);
  assert.equal(recordNoteMatchesQuery(item, "  HOT MEALS  "), true);
  assert.equal(recordNoteMatchesQuery(item, ""), false);
});

test("note match badge is visible only when the note contains the search text", () => {
  const t = (key) => key === "filters.noteMatch" ? "Match in note" : key;
  assert.match(renderSearchNoteMatchBadge(item, "hot meals", t), /search-note-match-badge/);
  assert.match(renderSearchNoteMatchBadge(item, "hot meals", t), />Match in note</);
  assert.match(
    renderSearchNoteMatchBadge(item, "hot meals", t, { editAttribute: "data-note-match-open" }),
    /<button[^>]*data-note-match-open="item-1"[^>]*>Match in note<\/button>/
  );
  assert.equal(renderSearchNoteMatchBadge(item, "stove", t), "");
});

test("matching root and nested bags participate in packing search navigation", () => {
  const container = { id: "bag-1", name: "Frame bag", note: "Long tour" };
  const rootHtml = renderRootContainerColumnHtml({
    container,
    contentsHtml: "",
    filterMatch: true,
    photoHtml: "",
    rootCollapsed: false,
    searchQuery: "long tour",
    t: (key) => key === "filters.noteMatch" ? "Match in note" : key,
    titleHtml: "Frame bag",
    totalWeightHtml: ""
  });
  const nestedHtml = renderSubcontainerSectionHtml({
    collapsed: false,
    container,
    contentsHtml: "",
    filterMatch: true,
    photoHtml: "",
    searchQuery: "frame",
    t: (key) => key,
    titleHtml: "Frame bag",
    weightHtml: ""
  });

  assert.match(rootHtml, /class="container-card[^"]*filter-match/);
  assert.match(rootHtml, /data-filter-match-id="root-bag-1"/);
  assert.match(rootHtml, /search-note-match-badge/);
  assert.match(nestedHtml, /class="subcontainer[^"]*filter-match/);
  assert.match(nestedHtml, /data-filter-match-id="bag-bag-1"/);
  assert.doesNotMatch(nestedHtml, /search-note-match-badge/);
});

test("collapsed bags keep their own photo visible while hiding their contents", () => {
  const container = { id: "bag-photo", name: "Photo bag", note: "" };
  const photoHtml = '<div data-test="own-photo"></div>';
  const rootHtml = renderRootContainerColumnHtml({
    container,
    contentsHtml: '<div data-test="root-contents"></div>',
    photoHtml,
    rootCollapsed: true,
    t: (key) => key,
    titleHtml: "Photo bag",
    totalWeightHtml: ""
  });
  const nestedHtml = renderSubcontainerSectionHtml({
    collapsed: true,
    container,
    contentsHtml: '<div data-test="nested-contents"></div>',
    photoHtml,
    t: (key) => key,
    titleHtml: "Photo bag",
    weightHtml: ""
  });

  assert.match(rootHtml, /data-test="own-photo"/);
  assert.doesNotMatch(rootHtml, /data-test="root-contents"/);
  assert.match(nestedHtml, /data-test="own-photo"/);
  assert.match(nestedHtml, /class="subcontainer collapsed/);
});

test("note search navigation finds every full phrase without case sensitivity", () => {
  assert.deepEqual(findNoteSearchMatches(
    "MARKER first\nmarker second\nno match\nMarker third",
    "  marker  "
  ), [
    { start: 0, end: 6 },
    { start: 13, end: 19 },
    { start: 36, end: 42 }
  ]);
  assert.deepEqual(findNoteSearchMatches("aaaa", "aa"), [
    { start: 0, end: 2 },
    { start: 2, end: 4 }
  ]);
  assert.deepEqual(findNoteSearchMatches("text", ""), []);
});

test("note search navigation visits separate words when the full phrase is not contiguous", () => {
  assert.deepEqual(findNoteSearchMatches(
    "Электрический насос для велосипеда и запасной насос",
    "насос электрический"
  ), [
    { start: 0, end: 13 },
    { start: 14, end: 19 },
    { start: 46, end: 51 }
  ]);
  assert.deepEqual(findNoteSearchMatches("Только электрический вариант", "насос электрический"), []);
});

test("note search navigation opens the first match and cycles through the rest", () => {
  const listeners = new Map();
  const classes = new Set();
  const classList = {
    add(value) {
      classes.add(value);
    },
    toggle(value, force) {
      if (force) classes.add(value);
      else classes.delete(value);
    }
  };
  const button = () => ({
    disabled: false,
    addEventListener(type, listener) {
      listeners.set(this === previousButton ? `previous:${type}` : `next:${type}`, listener);
    }
  });
  const previousButton = button();
  const nextButton = button();
  const textarea = {
    value: "marker at start\nand another marker later",
    classList,
    addEventListener(type, listener) {
      listeners.set(`textarea:${type}`, listener);
    }
  };
  const container = { hidden: true, classList };
  const status = { textContent: "" };
  const queryLabel = { textContent: "" };
  const revealed = [];
  const navigator = createNoteSearchNavigator({
    container,
    nextButton,
    previousButton,
    queryLabel,
    requestAnimationFrame: (callback) => callback(),
    revealMatch: (options) => revealed.push(options),
    status,
    t: (key, values) => key === "noteSearch.status" ? `${values.current} / ${values.total}` : key,
    textarea
  });

  assert.equal(navigator.open("marker"), 2);
  assert.equal(container.hidden, false);
  assert.equal(status.textContent, "1 / 2");
  assert.equal(queryLabel.textContent, "marker");
  assert.deepEqual(revealed.at(-1), { textarea, start: 0, end: 6, scrollField: true });

  listeners.get("next:click")({ preventDefault() {} });
  assert.equal(status.textContent, "2 / 2");
  assert.deepEqual(revealed.at(-1), { textarea, start: 28, end: 34, scrollField: false });

  listeners.get("next:click")({ preventDefault() {} });
  assert.equal(status.textContent, "1 / 2");
  listeners.get("previous:click")({ preventDefault() {} });
  assert.equal(status.textContent, "2 / 2");

  textarea.value = "the phrase was removed";
  listeners.get("textarea:input")();
  assert.equal(container.hidden, true);
  assert.equal(classes.has("note-search-match-active"), false);
});

test("item and bag dialogs activate note navigation only after they open", () => {
  const sourceText = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
  assert.match(sourceText, /openModalDialog\(refs\.dialog\);[\s\S]{0,160}itemNoteSearchNavigator\.open\(refs\.searchInput\.value\)/);
  assert.match(sourceText, /openModalDialog\(refs\.rootContainerDialog\);[\s\S]{0,160}rootContainerNoteSearchNavigator\.open\(refs\.searchInput\.value\)/);
});
