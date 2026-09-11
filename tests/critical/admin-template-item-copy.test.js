import test from "node:test";
import assert from "node:assert/strict";
import { prepareAdminTemplateItemCopy } from "../../src/sync/admin-template-item-copy.js";
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
