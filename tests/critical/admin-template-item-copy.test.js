import test from "node:test";
import assert from "node:assert/strict";
import { prepareAdminTemplateItemCopy } from "../../src/sync/admin-template-item-copy.js";
import { prepareAdminTemplateItemReplacement } from "../../src/sync/admin-template-item-replace.js";
import { createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";

const options = { operationId: "8ad83878-2144-455e-b0ce-8b8cce033fdc", changedAt: "2026-09-11T02:00:00Z" };
function fixture(detached = false) {
  const state = { items: { source: { id: "source", name: "Pump", quantity: 3, containerId: detached ? "" : "from-bag",
    publicCatalogLayoutId: "from", sharedSourceId: "old-source" }, anchor: { id: "anchor", name: "Food", quantity: 2, containerId: "to-bag", publicCatalogLayoutId: "to" } },
    containers: { "from-bag": { id: "from-bag", publicCatalogLayoutId: "from", childIds: [], itemIds: detached ? [] : ["source"],
      order: detached ? [] : [{ type: "item", id: "source" }] },
    "to-bag": { id: "to-bag", publicCatalogLayoutId: "to", childIds: [], itemIds: ["anchor"], order: [{ type: "item", id: "anchor" }] } },
    layouts: {}, packedItems: { source: true, anchor: true } };
  for (const id of ["from", "to"]) state.layouts[id] = { id, rootContainerIds: [id + "-bag"], adminCausalSource: { exists: true },
    arrangement: createLayoutArrangementFromCurrentState(state, [id + "-bag"]) };
  return { state, request: { sourceId: "source", sourceLayoutId: "from", targetLayoutId: "to", targetParentId: "to-bag" } };
}
for (const detached of [false, true]) test(`cross-template item freezes source and preserves target (${detached ? "detached" : "placed"})`, () => {
  const f = fixture(detached), before = structuredClone(f.state);
  const result = prepareAdminTemplateItemCopy(f.state, f.request, options), id = result.itemId;
  assert.deepEqual(f.state, before); assert.deepEqual(result.snapshot.layouts.from, before.layouts.from);
  assert.deepEqual(result.snapshot.items.source, before.items.source); assert.deepEqual(result.snapshot.containers["from-bag"], before.containers["from-bag"]);
  assert.deepEqual(result.snapshot.items.anchor, before.items.anchor);
  const row = result.snapshot.items[id], arrangement = result.snapshot.layouts.to.arrangement;
  assert.equal(row.publicCatalogLayoutId, "to"); assert.equal(row.sharedSourceId, undefined); assert.equal(row.quantity, 1);
  assert.equal(row.containerId, "to-bag"); assert.equal(arrangement.itemQuantities[id], detached ? 3 : 1);
  assert.equal(arrangement.packedItems[id], undefined); assert.equal(arrangement.packedItems.anchor, true);
  assert.equal(arrangement.itemQuantities.anchor, 2);
  assert.deepEqual(arrangement.containers["to-bag"].order, [{ type: "item", id: "anchor" }, { type: "item", id }]);
  assert.deepEqual(prepareAdminTemplateItemCopy(f.state, f.request, options), result);
});
test("cross-template item rejects unavailable sources, foreign placement and silent target repair", () => {
  for (const mutate of [
    f => { f.state.items.source.photos = [{ id: "file" }]; },
    f => { f.state.items.source.availabilityStatus = "lost"; },
    f => { f.state.items.source.publicCatalogLayoutId = "other"; },
    f => { f.state.layouts.to.locked = true; },
    f => { f.request.targetParentId = "from-bag"; },
    f => { f.request.sourceLayoutId = "missing"; },
    f => { f.request.targetLayoutId = "from"; },
    f => { f.state.items[`item-template-copy-${options.operationId}`] = {}; },
    f => { delete f.state.layouts.to.arrangement.itemQuantities.anchor; },
    f => { f.state.layouts.to.arrangement.items.unknown = "to-bag"; }
  ]) {
    const f = fixture(); mutate(f); const before = structuredClone(f.state);
    assert.throws(() => prepareAdminTemplateItemCopy(f.state, f.request, options)); assert.deepEqual(f.state, before);
  }
});


test("existing standalone catalog item keeps its ID, quantity and durable placement without a copy", () => {
  const f = fixture(true), before = structuredClone(f.state), request = { ...f.request, mode: "link", targetLayoutId: "from", targetParentId: "from-bag" };
  const result = prepareAdminTemplateItemCopy(f.state, request, options);
  assert.deepEqual(f.state, before); assert.deepEqual(result.entries, []); assert.equal(result.itemId, "source");
  assert.deepEqual(Object.keys(result.snapshot.items), Object.keys(before.items));
  assert.equal(result.snapshot.items.source.sharedSourceId, before.items.source.sharedSourceId);
  assert.equal(result.snapshot.layouts.from.arrangement.itemQuantities.source, 3);
  assert.equal(result.snapshot.layouts.from.arrangement.packedItems.source, undefined);
  assert.deepEqual(result.snapshot.layouts.to, before.layouts.to);
  assert.throws(() => prepareAdminTemplateItemCopy(result.snapshot, request, options));
  assert.throws(() => prepareAdminTemplateItemCopy(f.state, { ...f.request, mode: "link" }, options));
  f.state.items.source.containerId = "detached-catalog-bag";
  assert.throws(() => prepareAdminTemplateItemCopy(f.state, request, options));
});

test("existing item leaves only its detached catalog parent and preserves sibling records", () => {
  const f = fixture(true), request = { ...f.request, mode: "link", targetLayoutId: "from", targetParentId: "from-bag" };
  f.state.items.source.containerId = "detached";
  f.state.items.stays = { id: "stays", name: "Stays", publicCatalogLayoutId: "from", containerId: "detached", quantity: 5 };
  f.state.containers.detached = { id: "detached", publicCatalogLayoutId: "from", parentId: "", childIds: [],
    itemIds: ["source", "stays"], order: [{ type: "item", id: "source" }, { type: "item", id: "stays" }] };
  const before = structuredClone(f.state), result = prepareAdminTemplateItemCopy(f.state, request, options);
  assert.deepEqual(f.state, before); assert.deepEqual(result.entries, []);
  assert.deepEqual(result.updates, [{ type: "items", id: "source" }, { type: "containers", id: "detached" }]);
  assert.deepEqual(result.snapshot.items.stays, before.items.stays);
  assert.deepEqual(result.snapshot.containers.detached, { ...before.containers.detached,
    itemIds: ["stays"], order: [{ type: "item", id: "stays" }] });
  assert.equal(result.snapshot.items.source.id, "source"); assert.equal(result.snapshot.items.source.containerId, "from-bag");
  assert.equal(result.snapshot.items.source.quantity, 1); assert.equal(result.snapshot.layouts.from.arrangement.itemQuantities.source, 3);
  assert.deepEqual(Object.keys(result.snapshot.items), Object.keys(before.items));
  for (const mutate of [
    state => { state.containers.detached.publicCatalogLayoutId = "other"; },
    state => { state.containers.detached.itemIds.push("source"); },
    state => { state.containers.detached.order = []; },
    state => { state.containers["from-bag"].itemIds.push("source"); },
    state => { state.layouts.from.arrangement.containers.detached = {}; }
  ]) {
    const state = structuredClone(before); mutate(state); const unchanged = structuredClone(state);
    assert.throws(() => prepareAdminTemplateItemCopy(state, request, options)); assert.deepEqual(state, unchanged);
  }
});

for (const detachedParent of [false, true]) test(`admin replacement keeps the old position and quantity (${detachedParent ? "catalog tree" : "standalone"})`, () => {
  const f = fixture(), own = row => ({ ...row, publicCatalogLayoutId: "from" });
  f.state.items.before = own({ id: "before", name: "Before", containerId: "from-bag", quantity: 4 });
  f.state.items.after = own({ id: "after", name: "After", containerId: "from-bag", quantity: 5 });
  const parent = f.state.containers["from-bag"];
  parent.itemIds = ["before", "source", "after"]; parent.order = parent.itemIds.map(id => ({ type: "item", id }));
  f.state.layouts.from.arrangement = createLayoutArrangementFromCurrentState(f.state, ["from-bag"]);
  f.state.layouts.from.arrangement.itemQuantities.source = 2; f.state.items.source.quantity = 1;
  f.state.items.replacement = own({ id: "replacement", name: "Replacement", quantity: 7, containerId: detachedParent ? "detached" : "" });
  if (detachedParent) {
    f.state.items.stays = own({ id: "stays", name: "Stays", quantity: 4, containerId: "detached" });
    f.state.containers.detached = own({ id: "detached", parentId: "", childIds: [], itemIds: ["replacement", "stays"],
      order: [{ type: "item", id: "replacement" }, { type: "item", id: "stays" }] });
  }
  const original = structuredClone(f.state), request = { sourceId: "replacement", replacedId: "source",
    sourceLayoutId: "from", targetLayoutId: "from", targetParentId: "from-bag" };
  const result = prepareAdminTemplateItemReplacement(f.state, request, options), arrangement = result.snapshot.layouts.from.arrangement;
  assert.deepEqual(f.state, original); assert.deepEqual(result.entries, []);
  assert.deepEqual(Object.keys(result.snapshot.items), Object.keys(original.items));
  assert.deepEqual(arrangement.containers["from-bag"].order, ["before", "replacement", "after"].map(id => ({ type: "item", id })));
  assert.equal(arrangement.itemQuantities.replacement, 2); assert.equal(arrangement.items.source, undefined);
  assert.equal(arrangement.packedItems.source, undefined); assert.equal(arrangement.packedItems.replacement, undefined);
  assert.deepEqual(result.snapshot.items.source, { ...original.items.source, containerId: "" });
  assert.equal(result.snapshot.items.replacement.quantity, 1); assert.equal(result.snapshot.items.replacement.containerId, "from-bag");
  assert.deepEqual(result.snapshot.items.before, original.items.before); assert.deepEqual(result.snapshot.items.after, original.items.after);
  if (detachedParent) {
    assert.deepEqual(result.snapshot.items.stays, original.items.stays);
    assert.deepEqual(result.snapshot.containers.detached.itemIds, ["stays"]);
  }
  for (const mutate of [
    state => { state.items.source.photos = [{ id: "photo" }]; },
    state => { state.items.source.publicCatalogLayoutId = "other"; },
    state => { delete state.layouts.from.arrangement.itemQuantities.source; },
    state => { state.layouts.from.arrangement.containers["from-bag"].order = []; }
  ]) {
    const state = structuredClone(original); mutate(state); const before = structuredClone(state);
    assert.throws(() => prepareAdminTemplateItemReplacement(state, request, options)); assert.deepEqual(state, before);
  }
});
