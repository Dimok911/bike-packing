import test from "node:test";
import assert from "node:assert/strict";
import { prepareAdminTemplateTreeCopy } from "../../src/sync/admin-template-tree-copy.js";
import { prepareAdminTemplateContainerReplacement } from "../../src/sync/admin-template-container-replace.js";
import { createEmptyLayoutArrangement, createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";

const options = { operationId: "8ad83878-2144-455e-b0ce-8b8cce033fdc", changedAt: "2026-09-11T01:00:00Z" };

function replacementFixture(kind = "root", occupied = false) {
  const f = fixture(), own = row => ({ ...row, publicCatalogLayoutId: "layout", photos: [] });
  f.state.containers.replacement = own({ id: "replacement", name: "New bag", nestable: true, parentId: null,
    itemIds: occupied ? ["spare-item"] : [], childIds: occupied ? ["spare-child"] : [],
    order: occupied ? [{ type: "item", id: "spare-item" }, { type: "container", id: "spare-child" }] : [] });
  if (occupied) {
    f.state.items["spare-item"] = own({ id: "spare-item", name: "Spare", containerId: "replacement", quantity: 4 });
    f.state.containers["spare-child"] = own({ id: "spare-child", name: "Detached tree", parentId: "replacement", itemIds: ["spare-nested"], childIds: [], order: [{ type: "item", id: "spare-nested" }] });
    f.state.items["spare-nested"] = own({ id: "spare-nested", name: "Nested spare", containerId: "spare-child", quantity: 5 });
  }
  if (kind === "reusable") f.state.containers.child.nestable = true;
  f.request = { rootId: "replacement", replacedId: kind === "root" ? "root" : "child", sourceLayoutId: "layout", targetLayoutId: "layout" };
  return f;
}
for (const kind of ["root", "reusable", "temporary"]) for (const occupied of [false, true]) {
  test(`admin bag replacement preserves ${kind} contents and ${occupied ? "occupied" : "empty"} replacement catalog`, () => {
    const f = replacementFixture(kind, occupied), original = structuredClone(f.state);
    const result = prepareAdminTemplateContainerReplacement(f.state, f.request, options), layout = result.snapshot.layouts.layout;
    assert.deepEqual(f.state, original); assert.deepEqual(result.entries, []);
    const arrangement = structuredClone(original.layouts.layout.arrangement), old = arrangement.containers[f.request.replacedId];
    arrangement.containers.replacement = structuredClone(old); delete arrangement.containers[f.request.replacedId];
    if (kind === "root") { arrangement.rootContainerIds = ["replacement"]; arrangement.containers.child.parentId = "replacement"; }
    else { arrangement.items.item = "replacement"; arrangement.containers.root.childIds = ["replacement"]; arrangement.containers.root.order = [{ type: "container", id: "replacement" }]; }
    assert.deepEqual(layout.arrangement, arrangement);
    assert.equal(layout.arrangement.itemQuantities.item, 3); assert.equal(layout.arrangement.packedItems.item, true);
    assert.deepEqual(Object.keys(result.snapshot.items).sort(), Object.keys(original.items).sort());
    assert.equal(Boolean(result.snapshot.containers[f.request.replacedId]), kind !== "temporary");
    if (kind !== "temporary") assert.deepEqual(result.snapshot.containers[f.request.replacedId], { ...original.containers[f.request.replacedId], parentId: null, childIds: [], itemIds: [], order: [] });
    assert.deepEqual(result.removals, kind === "temporary" ? [{ type: "containers", id: "child" }] : []);
    if (occupied) {
      assert.deepEqual(result.snapshot.items["spare-item"], { ...original.items["spare-item"], containerId: "" });
      assert.deepEqual(result.snapshot.containers["spare-child"], { ...original.containers["spare-child"], parentId: null });
      assert.deepEqual(result.snapshot.items["spare-nested"], original.items["spare-nested"]);
    }
    const captured = createLayoutArrangementFromCurrentState(result.snapshot, layout.rootContainerIds, { itemQuantities: arrangement.itemQuantities });
    assert.deepEqual(captured, arrangement);
  });
}
test("admin bag replacement rejects ambiguous ownership, membership, quantities and occupied positions", () => {
  const mutations = [
    f => { f.state.containers.replacement.publicCatalogLayoutId = "foreign"; },
    f => { f.state.containers.replacement.nestable = false; },
    f => { f.state.containers.child.photos = [{ id: "photo" }]; },
    f => { f.state.items["spare-item"].containerId = "unknown"; },
    f => { f.state.containers.replacement.childIds.push("spare-child"); },
    f => { f.state.items.orphan = { id: "orphan", containerId: "replacement", publicCatalogLayoutId: "layout" }; },
    f => { f.state.containers["spare-child"].itemIds.push("item"); },
    f => { delete f.state.layouts.layout.arrangement.itemQuantities.item; },
    f => { f.state.layouts.layout.arrangement.containers.root.childIds.push("child"); },
    f => { f.state.layouts.other = { arrangement: { containers: { child: {} } } }; }
  ];
  for (const mutate of mutations) {
    const f = replacementFixture("temporary", true); mutate(f); const original = structuredClone(f.state);
    assert.throws(() => prepareAdminTemplateContainerReplacement(f.state, f.request, options)); assert.deepEqual(f.state, original);
  }
});
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
