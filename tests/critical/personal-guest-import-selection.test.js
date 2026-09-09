import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { preparePersonalGuestImportSelection } from "../../src/sync/personal-guest-import-selection.js";
import { guestSelectionFixture as fixture } from "./personal-guest-import-fixture.js";


test("guest selection fixes all source, target and operation identities before any asynchronous preparation", () => {
  const input = fixture(), before = structuredClone(input), issued = [];
  const selected = preparePersonalGuestImportSelection(input, { enabled: true, createUuid: () => { const id = randomUUID(); issued.push(id); return id; } });
  assert.deepEqual(input, before); assert.equal(issued.length, 7);
  assert.equal(selected.ownerTargets.length, 2); assert.equal(selected.layoutTargets.length, 2);
  assert.equal(selected.operationId, issued[0]); assert.equal(new Set(selected.ownerTargets.map(owner => owner.targetId)).size, 2);
  input.candidate.sourceState.items.item.name = "Late source"; input.basePayload.items.late = { id: "late" }; input.layoutNames.reverse();
  assert.equal(selected.candidate.sourceState.items.item.name, "Guest tool"); assert.deepEqual(selected.basePayload.items, {});
  assert.deepEqual(selected.layoutTargets.map(layout => layout.name), ["Imported A", "Imported B"]);
  assert.equal(selected.candidate.sourceState.layouts.b.arrangement.itemQuantities.item, 3);
  assert.equal(selected.candidate.layoutId, "b"); assert.equal(selected.handoff.guestSessionId, "chosen-session");
  assert.equal(selected.photoTargets.length, 1); assert.equal(selected.photoTargets[0].sourcePhotoId, "guest-original");
  assert.equal(selected.photoTargets[0].entityId, selected.ownerTargets.find(owner => owner.entityType === "item").targetId);
});

test("guest selection preserves existing private reuse rules and one shared mapping across selected layouts", () => {
  const input = fixture({ existing: true }), before = structuredClone(input), selected = preparePersonalGuestImportSelection(input, { enabled: true });
  assert.deepEqual(selected.ownerTargets, [{ entityType: "container", sourceId: "bag", targetId: "privateBag", reuse: true },
    { entityType: "item", sourceId: "item", targetId: "privateItem", reuse: true }]);
  assert.deepEqual(input, before); assert.deepEqual(selected.basePayload.items.privateItem.photos, [{ id: "already-private" }]);
  assert.deepEqual(selected.candidate.sourceState.items.item.photos, [{ id: "guest-original" }]);
  assert.deepEqual(selected.photoTargets, []);
});

test("guest selection stops a changed source, wrong account, expired handoff and invalid names before allocating any identities", () => {
  for (const mutate of [f => f.candidate.sourceState.items.item.weight++, f => f.user.id = "other", f => f.user.email = "other@example.test",
    f => f.nowMs += 25 * 60 * 60 * 1000, f => f.layoutNames = ["same", "same"], f => f.baseStateRevision = 0,
    f => f.candidate.sourceState.items.item.weight = NaN]) {
    const input = fixture(); mutate(input);
    assert.throws(() => preparePersonalGuestImportSelection(input, { enabled: true, createUuid: () => assert.fail("Must validate first") }));
  }
  assert.throws(() => preparePersonalGuestImportSelection(fixture(), { createUuid: () => assert.fail("Gate is off") }));
  assert.throws(() => preparePersonalGuestImportSelection(fixture(), { enabled: true, createUuid: () => "11111111-1111-4111-8111-111111111111" }));
});
