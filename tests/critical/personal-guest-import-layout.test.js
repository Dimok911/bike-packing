import test from "node:test";
import assert from "node:assert/strict";
import { personalGuestImportLayout } from "../../src/sync/personal-guest-import-layout.js";
import { remapGuestLayoutArrangement } from "../../src/public/guest-login-entity-reuse.js";

function fixture() {
  const sourcePayload = { containers: { root: { id: "root", location: "Bike" }, child: { id: "child", categories: ["Repair"] } },
    items: { a: { id: "a", location: "Bike" }, b: { id: "b", categories: ["Camp"] }, detached: { id: "detached", location: "Detached only" } },
    layouts: { guest: { id: "guest", name: "Original", guestDemoCopy: true, guestSharedLinkCopyTarget: true, guestSharedLinkDetachedItemIds: ["detached"],
      _publicCopySourceKind: "layout", _publicCopySourceId: "shared-template", demoSourceListId: "public-demo", notes: "Frozen notes", locked: true,
      rootContainerIds: ["root"], locations: ["Bike", "Custom shelf"], categories: ["Repair", "Custom category"],
      arrangement: { rootContainerIds: ["root"], containers: {
        root: { parentId: "", childIds: ["child"], itemIds: ["a"], order: [{ type: "container", id: "child" }, { type: "item", id: "a" }] },
        child: { parentId: "root", childIds: [], itemIds: ["b"], order: [{ type: "item", id: "b" }] } },
      items: { a: "root", b: "child" }, itemQuantities: { a: 2, b: 4 }, packedItems: { a: true, b: false } } } }, locations: [], categories: [] };
  const ownerTargets = [["container", "root"], ["container", "child"], ["item", "a"], ["item", "b"], ["item", "detached"]]
    .map(([entityType, sourceId]) => ({ entityType, sourceId, targetId: `private-${sourceId}`, reuse: false }));
  const targetPayload = { items: {}, containers: {}, layouts: {} };
  for (const owner of ownerTargets) targetPayload[owner.entityType === "item" ? "items" : "containers"][owner.targetId] = { id: owner.targetId };
  return { sourcePayload, targetPayload, sourceId: "guest", targetId: "private-layout", name: "Chosen destination", ownerTargets,
    editMeta: { createdAt: "2026-09-09T00:00:00Z" } };
}

test("guest layout remaps the frozen tree, quantities, order and packed values exactly like the existing personal import", () => {
  const input = fixture(), before = structuredClone(input), result = personalGuestImportLayout(input), source = input.sourcePayload.layouts.guest;
  const map = type => new Map(input.ownerTargets.filter(owner => owner.entityType === type).map(owner => [owner.sourceId, owner.targetId]));
  assert.deepEqual(result.layout.arrangement, remapGuestLayoutArrangement(source, input.targetPayload, { containerIdMap: map("container"), itemIdMap: map("item") }));
  assert.deepEqual(input, before); assert.deepEqual(result.layout.guestSharedLinkDetachedItemIds, ["private-detached"]);
  assert.equal(result.layout.id, "private-layout"); assert.equal(result.layout.name, "Chosen destination");
  assert.equal(result.layout.notes, "Frozen notes"); assert.equal(result.layout.locked, true);
  assert.equal(result.layout._publicCopySourceId, "shared-template"); assert.equal(result.layout.demoSourceListId, "public-demo");
  assert.equal(result.layout.guestDemoCopy, undefined); assert.equal(result.layout.guestSharedLinkCopyTarget, undefined);
  input.sourcePayload.layouts.guest.notes = "Late"; assert.equal(result.layout.notes, "Frozen notes");
});

test("guest layout retains visible and custom dictionaries without promoting detached-only values", () => {
  const input = fixture(), result = personalGuestImportLayout(input);
  assert.deepEqual(result.layout.locations, ["Bike", "Custom shelf"]);
  assert.deepEqual(result.layout.categories, ["Repair", "Custom category", "Camp"]);
  assert.deepEqual(result.dictionaries, { locations: ["Bike", "Custom shelf"], customLocations: ["Custom shelf"],
    categories: ["Repair", "Custom category", "Camp"], customCategories: ["Custom category"] });
  input.sourcePayload.layouts.guest.customCategories = [" Custom category ", "Explicit unused"];
  assert.deepEqual(personalGuestImportLayout(input).dictionaries.customCategories, ["Custom category", "Explicit unused"]);
});

test("legacy guest placement defaults preserve existing meaning without editing the frozen source", () => {
  const input = fixture(), a = input.sourcePayload.layouts.guest.arrangement;
  delete a.itemQuantities; delete a.items; delete a.packedItems; delete a.containers.root.parentId;
  const before = structuredClone(input), result = personalGuestImportLayout(input);
  assert.deepEqual(result.layout.arrangement.items, { "private-a": "private-root", "private-b": "private-child" });
  assert.deepEqual(result.layout.arrangement.itemQuantities, { "private-a": 1, "private-b": 1 });
  assert.deepEqual(result.layout.arrangement.packedItems, {}); assert.deepEqual(input, before);
});

test("guest layout refuses broken graph and target bindings instead of silently dropping or repairing records", () => {
  for (const mutate of [f => f.sourcePayload.layouts.guest.arrangement.containers.root.order.pop(),
    f => f.sourcePayload.layouts.guest.arrangement.containers.child.parentId = "child",
    f => f.ownerTargets.find(owner => owner.sourceId === "b").targetId = "private-a",
    f => f.sourcePayload.layouts.guest.arrangement.itemQuantities.a = 1.5,
    f => f.sourcePayload.layouts.guest.arrangement.packedItems.detached = true,
    f => f.sourcePayload.layouts.guest.arrangement.items.orphan = "root",
    f => f.editMeta.id = "injected", f => f.sourcePayload.layouts.guest.adminDemo = true,
    f => delete f.targetPayload.items["private-detached"]]) {
    const input = fixture(); mutate(input); const before = structuredClone(input);
    assert.throws(() => personalGuestImportLayout(input)); assert.deepEqual(input, before);
  }
});
