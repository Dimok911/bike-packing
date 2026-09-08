import test from "node:test";
import assert from "node:assert/strict";
import { personalPhotoTreeCopyLayout } from "../../src/sync/personal-photo-tree-copy-layout.js";

function fixture() {
  const placement = (parentId, children = [], items = []) => ({ parentId, childIds: children, itemIds: items,
    order: [...children.map(id => ({ type: "container", id })), ...items.map(id => ({ type: "item", id }))] });
  const sourceLayout = { id: "from", name: "Original", unknownField: { chosen: true }, rootContainerIds: ["bag"],
    arrangement: { rootContainerIds: ["bag"], containers: { bag: placement("", ["pouch"], ["pump"]), pouch: placement("bag") },
      items: { pump: "bag" }, itemQuantities: { pump: 3 }, packedItems: { pump: true } } };
  const targetLayout = { id: "to", name: "Destination", rootContainerIds: ["keep"],
    arrangement: { rootContainerIds: ["keep"], containers: { keep: placement("", [], ["existing"]) }, items: { existing: "keep" },
      itemQuantities: { existing: 7 }, packedItems: { existing: true } } };
  const body = { owners: [["container", "bag"], ["container", "pouch"], ["item", "pump"]].map(([entityType, sourceId]) =>
    ({ entityType, entityId: `${sourceId}-copy`, copySource: { entityId: sourceId } })),
    copyTree: { version: 1, rootId: "bag", includeContents: true, sourceLayout, targetLayout, targetParentId: "", targetIndex: 0, layoutFields: { updatedAt: "2026-09-08T12:00:00Z" } } };
  const state = { layouts: { from: structuredClone(sourceLayout), to: structuredClone(targetLayout) }, containers: { keep: { id: "keep" } } };
  return { body, state };
}

for (const parent of ["", "keep"]) test(`photo tree placement freezes the complete branch and target ${parent || "root"} without changing source or existing quantities`, () => {
  const f = fixture(); f.body.copyTree.targetParentId = parent;
  const original = structuredClone(f), result = personalPhotoTreeCopyLayout(f.body, f.state);
  assert.deepEqual(f, original); assert.equal(result.rootId, "bag-copy"); assert.equal(result.targetLayoutId, "to");
  assert.deepEqual(result.sources, { containers: ["bag", "pouch"], items: ["pump"] });
  const a = result.layout.arrangement;
  assert.equal(a.containers["bag-copy"].parentId, parent); assert.equal(a.containers["pouch-copy"].parentId, "bag-copy");
  assert.deepEqual(a.containers["bag-copy"].order, [{ type: "container", id: "pouch-copy" }, { type: "item", id: "pump-copy" }]);
  assert.deepEqual(a.items, { existing: "keep", "pump-copy": "bag-copy" });
  assert.deepEqual(a.itemQuantities, { existing: 7, "pump-copy": 3 }); assert.deepEqual(a.packedItems, { existing: true });
  assert.deepEqual(a.rootContainerIds, parent ? ["keep"] : ["bag-copy", "keep"]);
  if (parent) assert.deepEqual(a.containers.keep.order, [{ type: "container", id: "bag-copy" }, { type: "item", id: "existing" }]);
  f.body.copyTree.sourceLayout.arrangement.itemQuantities.pump = 99; f.state.layouts.to.name = "Changed later";
  assert.equal(a.itemQuantities["pump-copy"], 3); assert.equal(result.layout.name, "Destination");
});

test("incomplete, stale, cyclic, public, locked or colliding tree selections fail before mutation", () => {
  for (const mutate of [f => { f.body.owners.pop(); }, f => { f.body.owners.splice(1, 1); },
    f => { f.body.owners[1].entityId = "bag-copy"; }, f => { f.body.owners[1].copySource.entityId = "bag"; },
    f => { f.body.copyTree.sourceLayout.arrangement.itemQuantities.pump = 7; }, f => { f.body.copyTree.targetLayout.name = "Stale"; },
    f => { f.body.copyTree.targetLayout.locked = true; }, f => { f.body.copyTree.sourceLayout.adminDemo = true; },
    f => { f.body.copyTree.sourceLayout.arrangement.containers.pouch.childIds = ["bag"]; },
    f => { f.body.copyTree.targetParentId = "absent"; }, f => { f.body.copyTree.targetIndex = -1; },
    f => { f.body.copyTree.layoutFields.name = "Hidden rename"; }, f => { f.body.copyTree.extra = true; },
    f => { f.body.copyTree.sourceLayout.arrangement.containers.bag.itemIds = []; }]) {
    const f = fixture(); mutate(f); const original = structuredClone(f);
    assert.throws(() => personalPhotoTreeCopyLayout(f.body, f.state), { code: "photo-copy-tree" }); assert.deepEqual(f, original);
  }
  // Without a live state, the receipt validator must still verify graph completeness.
  const incomplete = fixture(); incomplete.body.copyTree.sourceLayout.arrangement.containers.bag.itemIds = [];
  assert.throws(() => personalPhotoTreeCopyLayout(incomplete.body), { code: "photo-copy-tree" });
});

test("an explicitly selected empty bag copy retains the full frozen source but does not include its contents", () => {
  const f = fixture(); f.body.copyTree.includeContents = false; f.body.owners = f.body.owners.slice(0, 1);
  const result = personalPhotoTreeCopyLayout(f.body, f.state);
  assert.deepEqual(result.sources, { containers: ["bag"], items: [] });
  assert.deepEqual(result.layout.arrangement.containers["bag-copy"], { parentId: "", childIds: [], itemIds: [], order: [] });
  assert.deepEqual(result.layout.arrangement.items, f.state.layouts.to.arrangement.items);
});
