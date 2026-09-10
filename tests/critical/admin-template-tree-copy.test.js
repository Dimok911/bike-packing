import test from "node:test";
import assert from "node:assert/strict";
import { prepareAdminTemplateTreeCopy } from "../../src/sync/admin-template-tree-copy.js";
import { createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";

const options = { operationId: "8ad83878-2144-455e-b0ce-8b8cce033fdc", changedAt: "2026-09-11T01:00:00Z" };
function fixture() {
  const owned = row => ({ ...row, publicCatalogLayoutId: "layout", sharedSourceId: "old-" + row.id, photos: [] });
  const state = { items: { item: owned({ id: "item", name: "Pump", containerId: "child", quantity: 3 }) },
    containers: { root: owned({ id: "root", name: "Bag", parentId: null, childIds: ["child"], itemIds: [], order: [{ type: "container", id: "child" }] }),
      child: owned({ id: "child", name: "Pocket", parentId: "root", childIds: [], itemIds: ["item"], order: [{ type: "item", id: "item" }] }) },
    layouts: {}, packedItems: { item: true }, collapsedContainers: {} };
  state.layouts.layout = { id: "layout", rootContainerIds: ["root"], adminCausalSource: { exists: true },
    arrangement: createLayoutArrangementFromCurrentState(state, ["root"]) };
  state.items.item.quantity = 1;
  const request = { rootId: "root", sourceLayoutId: "layout", targetLayoutId: "layout", includeContents: true, targetIndex: 0 };
  return { state, request };
}
for (const includeContents of [true, false]) for (const nested of [true, false]) test(`admin tree planner freezes ${includeContents ? "tree" : "shell"} at ${nested ? "nested" : "root"} position`, async () => {
  const f = fixture(), original = structuredClone(f.state);
  const promise = prepareAdminTemplateTreeCopy(f.state, { ...f.request, includeContents, targetParentId: nested ? "root" : "" }, options);
  f.state.items.item.name = "Changed during preparation";
  const prepared = await promise, layout = prepared.snapshot.layouts.layout, root = prepared.snapshot.containers[prepared.rootId];
  assert.equal(root.parentId || "", nested ? "root" : ""); assert.equal(root.sharedSourceId, undefined);
  assert.equal(root.publicCatalogLayoutId, "layout"); assert.equal(prepared.entries.length, includeContents ? 3 : 1);
  assert.equal(prepared.snapshot.items.item.name, "Pump"); assert.equal(layout.arrangement.itemQuantities.item, 3);
  assert.equal(layout.arrangement.packedItems.item, true);
  if (includeContents) {
    const item = prepared.entries.find(entry => entry.type === "items").targetId;
    assert.equal(prepared.snapshot.items[item].quantity, 1); assert.equal(layout.arrangement.itemQuantities[item], 3);
    assert.equal(layout.arrangement.packedItems[item], undefined); assert.equal(prepared.snapshot.items[item].sharedSourceId, undefined);
  }
  if (nested) assert.deepEqual(layout.arrangement.containers.root.order[0], { type: "container", id: prepared.rootId });
  else assert.equal(layout.arrangement.rootContainerIds[0], prepared.rootId);
  const again = await prepareAdminTemplateTreeCopy(original, { ...f.request, includeContents, targetParentId: nested ? "root" : "" }, options);
  assert.deepEqual(prepared, again);
});
test("admin tree rejects foreign owners, photos, dangling and duplicate links, target corruption and occupied IDs without changing state", async () => {
  const mutations = [
    f => { f.state.items.item.publicCatalogLayoutId = "foreign"; },
    f => { f.state.items.item.photos = [{ id: "photo" }]; },
    f => { f.state.items.item.availabilityStatus = "lost"; },
    f => { f.state.layouts.layout.arrangement.containers.child.childIds.push("root"); f.state.layouts.layout.arrangement.containers.child.order.push({ type: "container", id: "root" }); },
    f => { f.state.layouts.layout.arrangement.containers.root.childIds.push("missing"); },
    f => { f.state.layouts.layout.arrangement.containers.child.itemIds.push("item"); },
    f => { f.request.targetParentId = "missing"; },
    f => { f.request.sourceLayoutId = "foreign"; },
    f => { f.state.layouts.layout.locked = true; },
    f => { f.state.items[`item-template-tree-${options.operationId}-0`] = {}; },
    f => { f.state.layouts.layout.arrangement.items.unknown = "root"; }
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f); const before = structuredClone(f.state);
    await assert.rejects(prepareAdminTemplateTreeCopy(f.state, f.request, options)); assert.deepEqual(f.state, before);
  }
});
