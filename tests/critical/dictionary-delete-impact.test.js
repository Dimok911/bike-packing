import assert from "node:assert/strict";
import test from "node:test";

import {
  collectDictionaryValueUsage,
  dictionaryDeleteImpactHtml
} from "../../src/ui/dictionary-delete-impact.js";

test("dictionary deletion distinguishes items from bags and places", () => {
  const usage = collectDictionaryValueUsage("location", "Unknown location", {
    items: [{ id: "item-home", name: "Pump", location: "Home" }],
    containers: [
      { id: "bag-feeder", name: "Feeder Bags - Revelate Designs", location: "Unknown location" },
      { id: "bag-home", name: "Backpack", location: "Home" }
    ]
  });

  assert.equal(usage.items.length, 0);
  assert.equal(usage.containers.length, 1);

  const html = dictionaryDeleteImpactHtml(usage, { language: "ru" });
  assert.match(html, /Затронуто: 1 сумка или место\./);
  assert.match(html, /Сумки и места \(1\)/);
  assert.match(html, /Feeder Bags - Revelate Designs/);
  assert.doesNotMatch(html, /<details/);
  assert.doesNotMatch(html, /1 вещь/);
});

test("dictionary deletion shows up to three affected records immediately", () => {
  const usage = {
    items: [
      { name: "Item one" },
      { name: "Item two" }
    ],
    containers: [{ name: "Bag one" }]
  };

  const html = dictionaryDeleteImpactHtml(usage, { language: "en" });
  assert.match(html, /Affected: 2 items, 1 bag or place\./);
  assert.match(html, /Items \(2\)/);
  assert.match(html, /Bags and places \(1\)/);
  assert.doesNotMatch(html, /<details/);
});

test("dictionary deletion collapses longer affected-record lists and escapes names", () => {
  const usage = {
    items: [
      { name: "Item <one>" },
      { name: "Item two" },
      { name: "Item three" }
    ],
    containers: [{ name: "Bag & place" }]
  };

  const html = dictionaryDeleteImpactHtml(usage, { language: "ru" });
  assert.match(html, /<details class="dictionary-delete-impact-details">/);
  assert.match(html, /Показать список \(4\)/);
  assert.match(html, /Item &lt;one&gt;/);
  assert.match(html, /Bag &amp; place/);
  assert.doesNotMatch(html, /Item <one>/);
});

test("category usage includes categorized items and containers", () => {
  const usage = collectDictionaryValueUsage("category", "Repair", {
    items: [{ name: "Tool", categories: ["Repair"] }],
    containers: [{ name: "Tool bag", categories: ["Repair", "Camping"] }],
    itemCategories: (item) => item.categories || [],
    containerCategories: (container) => container.categories || []
  });

  assert.equal(usage.items.length, 1);
  assert.equal(usage.containers.length, 1);
});
