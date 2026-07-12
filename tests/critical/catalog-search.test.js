import assert from "node:assert/strict";
import test from "node:test";

import {
  matchesItemFieldsFilter,
  matchesRootContainerFieldsFilter
} from "../../src/state/catalog-search.js";

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
