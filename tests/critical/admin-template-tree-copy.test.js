import test from "node:test";
import assert from "node:assert/strict";
import { prepareAdminTemplateTreeCopy } from "../../src/sync/admin-template-tree-copy.js";
import { createEmptyLayoutArrangement, createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";

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

for (const includeContents of [true, false]) test(`cross-template ${includeContents ? "tree" : "shell"} changes only the target catalog and placement`, async () => {
  const f = fixture();
  f.state.containers.target = { id: "target", name: "Target", publicCatalogLayoutId: "destination", childIds: [], itemIds: [], order: [] };
  f.state.layouts.destination = { id: "destination", adminDemo: true, adminCausalSource: { exists: true }, rootContainerIds: ["target"],
    arrangement: createLayoutArrangementFromCurrentState(f.state, ["target"]) };
  const request = { ...f.request, targetLayoutId: "destination", targetParentId: "target", includeContents }, before = structuredClone(f.state);
  const result = await prepareAdminTemplateTreeCopy(f.state, request, options);
  assert.deepEqual(f.state, before); assert.deepEqual(result.snapshot.layouts.layout, before.layouts.layout);
  for (const id of ["root", "child"]) assert.deepEqual(result.snapshot.containers[id], before.containers[id]);
  assert.deepEqual(result.snapshot.items.item, before.items.item);
  assert.equal(result.snapshot.containers[result.rootId].publicCatalogLayoutId, "destination");
  assert.deepEqual(result.snapshot.layouts.destination.arrangement.containers.target.order[0], { type: "container", id: result.rootId });
  const copiedItem = result.entries.find(row => row.type === "items")?.targetId;
  assert.equal(Boolean(copiedItem), includeContents);
  if (copiedItem) {
    assert.equal(result.snapshot.items[copiedItem].publicCatalogLayoutId, "destination");
    assert.equal(result.snapshot.layouts.destination.arrangement.itemQuantities[copiedItem], 3);
    assert.equal(result.snapshot.layouts.destination.arrangement.packedItems[copiedItem], undefined);
  }
  await assert.rejects(prepareAdminTemplateTreeCopy(f.state, { ...request, mode: "link" }, options));
  await assert.rejects(prepareAdminTemplateTreeCopy(f.state, { ...request, targetParentId: "root" }, options));
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

for (const nested of [false, true]) test(`admin link places an existing catalog tree at ${nested ? "nested" : "root"} position and survives editor capture`, async () => {
  const f = fixture(), layout = f.state.layouts.layout;
  layout.rootContainerIds = []; layout.arrangement = createEmptyLayoutArrangement();
  f.state.items.item.quantity = 3;
  if (nested) {
    f.state.containers.target = { id: "target", name: "Target", publicCatalogLayoutId: "layout", parentId: null, childIds: [], itemIds: [], order: [] };
    layout.arrangement = createLayoutArrangementFromCurrentState(f.state, ["target"]); layout.rootContainerIds = ["target"];
  }
  const original = structuredClone(f.state);
  const linked = await prepareAdminTemplateTreeCopy(f.state, { ...f.request, mode: "link", targetParentId: nested ? "target" : "" }, options);
  assert.deepEqual(f.state, original); assert.deepEqual(linked.snapshot.items, original.items);
  for (const id of ["root", "child"]) assert.deepEqual(linked.snapshot.containers[id], original.containers[id]);
  assert.deepEqual(linked.entries, []);
  const captured = createLayoutArrangementFromCurrentState(linked.snapshot, linked.snapshot.layouts.layout.rootContainerIds,
    { itemQuantities: linked.snapshot.layouts.layout.arrangement.itemQuantities });
  assert.deepEqual(captured.containers, linked.snapshot.layouts.layout.arrangement.containers);
  assert.deepEqual(captured.items, linked.snapshot.layouts.layout.arrangement.items);
  assert.deepEqual(captured.itemQuantities, linked.snapshot.layouts.layout.arrangement.itemQuantities);
  assert.equal(linked.rootId, "root"); assert.equal(linked.snapshot.layouts.layout.arrangement.itemQuantities.item, 3);
  assert.equal(linked.snapshot.layouts.layout.arrangement.packedItems.item, undefined);
  assert.equal(linked.snapshot.layouts.layout.arrangement.containers.root.parentId, nested ? "target" : "");
});

test("admin link rejects any overlap and never uses shell placement to erase catalog children", async () => {
  const f = fixture();
  await assert.rejects(prepareAdminTemplateTreeCopy(f.state, { ...f.request, mode: "link" }, options));
  f.state.layouts.layout.arrangement = createEmptyLayoutArrangement(); f.state.layouts.layout.rootContainerIds = [];
  await assert.rejects(prepareAdminTemplateTreeCopy(f.state, { ...f.request, mode: "link", includeContents: false }, options));
  f.state.layouts.layout.arrangement.items.item = "child";
  await assert.rejects(prepareAdminTemplateTreeCopy(f.state, { ...f.request, mode: "link" }, options));
  delete f.state.layouts.layout.arrangement.items.item;
  f.state.containers.empty = { id: "empty", name: "Empty", publicCatalogLayoutId: "layout", parentId: null, childIds: [], itemIds: [], order: [] };
  const result = await prepareAdminTemplateTreeCopy(f.state, { ...f.request, rootId: "empty", mode: "link", includeContents: false }, options);
  assert.deepEqual(result.snapshot.layouts.layout.arrangement.rootContainerIds, ["empty"]);
});
