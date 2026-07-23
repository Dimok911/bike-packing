import assert from "node:assert/strict";
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
