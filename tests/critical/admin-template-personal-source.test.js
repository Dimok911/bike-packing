import test from "node:test";
import assert from "node:assert/strict";
import { prepareAdminTemplateItemCopy } from "../../src/sync/admin-template-item-copy.js";
import { prepareAdminTemplateTreeCopy } from "../../src/sync/admin-template-tree-copy.js";
import { prepareAdminTemplateMissingItems } from "../../src/sync/admin-template-missing-items.js";
import { createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";

const options = { operationId: "057ce763-f74a-44e2-9e59-dc2e9e20e719", sourceKind: "personal" };
const request = { sourceLayoutId: "personal", targetLayoutId: "target", rootId: "bag", includeContents: true, targetParentId: "", targetIndex: 0 };
function fixture() {
  const state = { items: {}, containers: {}, layouts: {}, activeLayoutId: "personal", packedItems: { item: true }, collapsedContainers: {} };
  state.items.item = { id: "item", name: "Existing", weight: 20, quantity: 2, containerId: "bag" };
  state.items.nested = { id: "nested", name: "Missing", weight: 10, quantity: 3, containerId: "pocket" };
  state.items.anchor = { ...state.items.item, id: "anchor", containerId: "target-bag", publicCatalogLayoutId: "target" };
  state.containers.bag = { id: "bag", name: "Bag", weight: 100, parentId: "", childIds: ["pocket"], itemIds: ["item"], order: [{ type: "item", id: "item" }, { type: "container", id: "pocket" }] };
  state.containers.pocket = { id: "pocket", name: "Pocket", nestable: true, parentId: "bag", childIds: [], itemIds: ["nested"], order: [{ type: "item", id: "nested" }] };
  state.containers["target-bag"] = { ...structuredClone(state.containers.bag), id: "target-bag", publicCatalogLayoutId: "target", childIds: [], itemIds: ["anchor"], order: [{ type: "item", id: "anchor" }] };
  for (const [id, root] of [["personal", "bag"], ["target", "target-bag"]]) state.layouts[id] = {
    id, rootContainerIds: [root], arrangement: createLayoutArrangementFromCurrentState(state, [root]),
    ...(id === "target" ? { adminCausalSource: { exists: true }, adminDemo: true } : {})
  };
  for (const row of Object.values(state.items)) row.quantity = 1;
  return state;
}

for (const mode of ["item", "tree", "shell", "nested", "missing"]) test(`personal source ${mode} preserves source, destination neighbors and quantities`, async () => {
  const state = fixture(), before = structuredClone(state);
  const input = mode === "item" ? { ...request, sourceId: "item", targetParentId: "target-bag" }
    : { ...request, rootId: mode === "nested" ? "pocket" : "bag", includeContents: mode !== "shell" };
  const plan = await (mode === "item" ? prepareAdminTemplateItemCopy : mode === "missing" ? prepareAdminTemplateMissingItems : prepareAdminTemplateTreeCopy)(state, input, options);
  assert.deepEqual(state, before);
  assert.deepEqual(plan.snapshot.layouts.personal, before.layouts.personal);
  for (const type of ["items", "containers"]) for (const [id, row] of Object.entries(before[type])) {
    if (id !== "target-bag") assert.deepEqual(plan.snapshot[type][id], row);
  }
  const arrangement = plan.snapshot.layouts.target.arrangement;
  assert.equal(arrangement.itemQuantities.anchor, 2);
  for (const entry of plan.entries) {
    assert.equal(plan.snapshot[entry.type][entry.targetId].publicCatalogLayoutId, "target");
    if (entry.type === "items") {
      assert.equal(plan.snapshot.items[entry.targetId].quantity, 1);
      assert.equal(arrangement.itemQuantities[entry.targetId], mode === "item" ? 1 : before.layouts.personal.arrangement.itemQuantities[entry.sourceId]);
      assert.equal(arrangement.packedItems[entry.targetId], undefined);
    }
  }
  assert.equal(plan.entries.filter(row => row.type === "items").length, mode === "tree" ? 2 : mode === "shell" ? 0 : 1);
  if (mode === "missing") assert.deepEqual(Object.keys(plan.snapshot.containers), Object.keys(before.containers));
});

test("personal source cannot link, impersonate a template, use files or repair source quantities", async () => {
  for (const mutate of [
    s => { s.layouts.personal.adminCausalSource = { exists: true }; },
    s => { s.containers.pocket.publicCatalogLayoutId = "foreign"; },
    s => { s.items.nested.photos = [{ id: "photo" }]; },
    s => { delete s.layouts.personal.arrangement.itemQuantities.item; }
  ]) {
    const state = fixture(); mutate(state); const before = structuredClone(state);
    await assert.rejects(prepareAdminTemplateTreeCopy(state, request, options)); assert.deepEqual(state, before);
  }
  await assert.rejects(prepareAdminTemplateTreeCopy(fixture(), { ...request, mode: "link" }, options));
  await assert.rejects(prepareAdminTemplateTreeCopy(fixture(), request, { ...options, sourceKind: "template" }));
});

for (const parentId of ["", "detached-bag"]) test(`personal detached item retains catalog quantity and source parent ${parentId}`, async () => {
  const state = fixture();
  state.items.detached = { id: "detached", name: "Detached", weight: 12, quantity: 4, containerId: parentId };
  if (parentId) state.containers[parentId] = { id: parentId, name: "Detached bag", parentId: "", childIds: [], itemIds: ["detached"], order: [{ type: "item", id: "detached" }] };
  const before = structuredClone(state);
  const result = prepareAdminTemplateItemCopy(state, { ...request, sourceId: "detached", targetParentId: "target-bag" }, options);
  assert.deepEqual(state, before);
  assert.deepEqual(result.snapshot.layouts.personal, before.layouts.personal);
  assert.deepEqual(result.snapshot.items.detached, before.items.detached);
  if (parentId) assert.deepEqual(result.snapshot.containers[parentId], before.containers[parentId]);
  assert.equal(result.snapshot.items[result.itemId].quantity, 1);
  assert.equal(result.snapshot.layouts.target.arrangement.itemQuantities[result.itemId], 4);
  assert.equal(result.snapshot.layouts.target.arrangement.itemQuantities.anchor, 2);
});
