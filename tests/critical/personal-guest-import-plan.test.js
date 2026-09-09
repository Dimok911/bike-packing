import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { guestSelectionFixture } from "./personal-guest-import-fixture.js";
import { preparePersonalGuestImportSelection } from "../../src/sync/personal-guest-import-selection.js";
import { personalGuestImportPlan } from "../../src/sync/personal-guest-import-plan.js";
import { createGuestLoginHandoff } from "../../src/public/guest-login-handoff.js";

function prepare(input = guestSelectionFixture()) {
  input.handoff = createGuestLoginHandoff({ candidate: input.candidate, eligibleLayoutIds: input.candidate.layouts.map(layout => layout.layoutId),
    email: input.user.email, guestSessionId: input.handoff.guestSessionId, nowMs: input.nowMs });
  const selection = preparePersonalGuestImportSelection(input, { enabled: true });
  const plan = { currentPayload: selection.basePayload, sourcePayload: selection.candidate.sourceState, layoutTargets: selection.layoutTargets,
    ownerTargets: selection.ownerTargets, photoTargets: selection.photoTargets, editMeta: selection.editMeta,
    operationId: selection.operationId, listId: selection.binding.listId };
  const files = selection.photoTargets.map(({ sourceEntityId, ...target }) => ({ ...target,
    file: { hash: "a".repeat(64), size: 20, type: "image/png", fileName: "Гостевое фото.png" }, thumb: null }));
  return { selection, plan, files };
}

test("complete guest plan imports shared owners once and preserves the full frozen source and existing private list", () => {
  const input = guestSelectionFixture(); input.basePayload.items.saved = { id: "saved", name: "Unplaced private", custom: { keep: true } };
  input.basePayload.customPolicy = { retain: true };
  const { plan, files } = prepare(input), before = structuredClone({ plan, files }), result = personalGuestImportPlan(plan, files);
  assert.deepEqual({ plan, files }, before); assert.deepEqual(result.payload.items.saved, input.basePayload.items.saved);
  assert.deepEqual(result.payload.customPolicy, { retain: true });
  assert.equal(result.createdOwners.items.length, 1); assert.equal(result.createdOwners.containers.length, 1);
  assert.equal(result.importedLayoutIds.length, 2); assert.equal(result.attachments.length, 1); assert.deepEqual(result.deletions, []);
  const itemId = result.createdOwners.items[0], bagId = result.createdOwners.containers[0];
  for (const layoutId of result.importedLayoutIds) {
    const a = result.payload.layouts[layoutId].arrangement;
    assert.equal(a.items[itemId], bagId); assert.equal(a.itemQuantities[itemId], 3); assert.equal(a.packedItems[itemId], true);
  }
  assert.equal(result.activeLayoutId, result.importedLayoutIds[0]);
  assert.equal(result.payload.items[itemId]._publicCopySourceId, "template-tool");
  assert.deepEqual(result.payload.items[itemId].photos, [{ id: files[0].photoId, photoId: files[0].photoId, assetId: files[0].assetId, listId: "list", status: "pending" }]);
  plan.sourcePayload.items.item.name = "Late edit"; assert.equal(result.payload.items[itemId].name, "Guest tool");
});

test("guest sources with different IDs in successive layouts reuse the same newly imported template owner and one file inventory", () => {
  const input = guestSelectionFixture(), source = input.candidate.sourceState;
  source.items.secondItem = { ...structuredClone(source.items.item), id: "secondItem", containerId: "secondBag" };
  source.containers.secondBag = { ...structuredClone(source.containers.bag), id: "secondBag", itemIds: ["secondItem"], order: [{ type: "item", id: "secondItem" }] };
  source.layouts.b = JSON.parse(JSON.stringify(source.layouts.b).replaceAll('"bag"', '"secondBag"').replaceAll('"item"', '"secondItem"'));
  source.layouts.b.arrangement.containers.secondBag.order[0].type = "item";
  const { plan, files, selection } = prepare(input), result = personalGuestImportPlan(plan, files);
  assert.equal(selection.ownerTargets.filter(owner => owner.reuse).length, 2);
  assert.equal(result.createdOwners.items.length, 1); assert.equal(result.createdOwners.containers.length, 1); assert.equal(files.length, 1);
  assert.deepEqual(result.payload.layouts[result.importedLayoutIds[0]].arrangement, result.payload.layouts[result.importedLayoutIds[1]].arrangement);
});

test("reused private template records keep their existing photos and unknown fields in a fileless guest import", () => {
  const input = guestSelectionFixture({ existing: true }), item = input.basePayload.items.privateItem;
  item.personal = { saved: true }; item.photos = [{ id: "already-private", photoId: "already-private", assetId: randomUUID(), listId: "list", status: "synced",
    url: "https://example.test/original.png", thumbUrl: "https://example.test/thumb.png", fileName: "private.png", type: "image/png", size: 20, width: 1, height: 1 }];
  const { plan, files } = prepare(input), result = personalGuestImportPlan(plan, files);
  const expected = structuredClone(item); delete expected.containerId;
  assert.deepEqual(result.payload.items.privateItem, expected); assert.deepEqual(files, []); assert.deepEqual(result.createdOwners, { items: [], containers: [] });
  assert.deepEqual(result.payload.layouts.private, input.basePayload.layouts.private);
});

test("legacy guest tree is frozen before projection and retains its quantities and packing marks", () => {
  const input = guestSelectionFixture(), source = input.candidate.sourceState;
  delete source.layouts.a.arrangement; delete source.layouts.b.arrangement; source.items.item.quantity = 4; source.packedItems = { item: true };
  const { plan, files } = prepare(input), result = personalGuestImportPlan(plan, files), itemId = result.createdOwners.items[0];
  assert.equal(plan.sourcePayload.layouts.a.arrangement, undefined);
  for (const layoutId of result.importedLayoutIds) {
    assert.equal(result.payload.layouts[layoutId].arrangement.itemQuantities[itemId], 4);
    assert.equal(result.payload.layouts[layoutId].arrangement.packedItems[itemId], true);
  }
  source.containers.bag.childIds = ["bag"];
  assert.throws(() => prepare(input));
});

test("guest import removes only the sole generated empty destination placeholder", () => {
  for (const preserve of [false, true]) {
    const input = guestSelectionFixture();
    input.basePayload.layouts["layout-main"] = { id: "layout-main", name: "Текущая укладка", rootContainerIds: [],
      arrangement: { rootContainerIds: [], containers: {}, items: {}, packedItems: {} }, ...(preserve ? { updatedAt: "2026-09-01T00:00:00Z" } : {}) };
    const { plan, files } = prepare(input), result = personalGuestImportPlan(plan, files);
    assert.equal(Boolean(result.payload.layouts["layout-main"]), preserve);
    assert.deepEqual(result.removedLayoutIds, preserve ? [] : ["layout-main"]);
  }
});

test("complete guest plan rejects omitted owners, changed mappings, public targets and incomplete file inventories without mutating inputs", () => {
  for (const mutate of [p => p.plan.ownerTargets.pop(), p => p.plan.ownerTargets[0].targetId = "bag",
    p => p.plan.ownerTargets[0].sourceLayoutId = "other", p => p.plan.layoutTargets[0].targetId = "layout-main",
    p => p.plan.layoutTargets[0].name = p.plan.layoutTargets[1].name, p => p.plan.ownerTargets[0].reuse = true,
    p => p.plan.currentPayload.items.injected = { id: "injected", scope: "public" }, p => p.files.pop(),
    p => p.files[0].entityId = "item", p => p.files[0].file.hash = "bad", p => p.files[0].file.size = 11 * 1024 * 1024,
    p => p.plan.photoTargets[0].assetId = p.plan.photoTargets[0].photoId,
    p => p.plan.sourcePayload.layouts.a.arrangement.containers.bag.order = []]) {
    const prepared = prepare(); mutate(prepared); const before = structuredClone(prepared);
    assert.throws(() => personalGuestImportPlan(prepared.plan, prepared.files)); assert.deepEqual(prepared, before);
  }
});
