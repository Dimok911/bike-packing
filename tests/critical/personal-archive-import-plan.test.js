import test from "node:test";
import assert from "node:assert/strict";
import { personalArchiveImportPlan } from "../../src/sync/personal-archive-import-plan.js";

const source = () => ({ items: { item: { id: "item", name: "Archive item", weight: 5 } },
  containers: { bag: { id: "bag", name: "Archive bag" } }, locations: ["Outside"], categories: ["Tools"],
  layouts: { old: { id: "old", name: "Chosen layout", rootContainerIds: ["bag"], locked: false,
    arrangement: { rootContainerIds: ["bag"], containers: { bag: { parentId: "", childIds: [], itemIds: ["item"], order: [{ type: "item", id: "item" }] } },
      items: { item: "bag" }, itemQuantities: { item: 7 }, packedItems: { item: true } }, extra: { preserved: true } } }, extra: { archiveField: 12 } });
function fixture(mode = "replace") {
  const archive = source(), current = source(); current.items.item.name = "Current item"; current.items.item.weight = 9;
  current.items.unrelated = { id: "unrelated", name: "Unrelated" }; current.locations = ["Inside"];
  current.layouts = { chosen: { ...structuredClone(archive.layouts.old), id: "chosen", locked: true, notes: " Keep these notes " } };
  return { currentPayload: current, sourcePayload: archive, mode,
    layoutTargets: mode === "full" ? [] : [{ sourceId: "old", targetId: mode === "copy" ? "new-layout" : "chosen", name: mode === "copy" ? "Fixed copy name" : "Chosen layout" }],
    sourceActiveLayoutId: "old", editMeta: { updatedAt: "2026-09-09T01:00:00Z" } };
}

test("selected archive replacement keeps shared catalogue fields, quantities, packed state, lock and notes without mutating either input", () => {
  const input = fixture(), before = structuredClone(input), result = personalArchiveImportPlan(input);
  assert.deepEqual(input, before); assert.deepEqual(result.payload.items, input.currentPayload.items);
  assert.equal(result.payload.layouts.chosen.locked, true); assert.equal(result.payload.layouts.chosen.notes, "Keep these notes");
  assert.deepEqual(result.payload.layouts.chosen.arrangement, input.sourcePayload.layouts.old.arrangement);
  assert.deepEqual(result.payload.locations, ["Inside", "Outside"]); assert.deepEqual(result.payload.layouts.chosen.extra, { preserved: true });
});

test("copy fixes destination ID/name and creates only missing catalogue records; full restore retains the complete chosen archive", () => {
  const input = fixture("copy"); delete input.currentPayload.items.item; delete input.currentPayload.containers.bag;
  const result = personalArchiveImportPlan(input);
  assert.deepEqual(result.restoredLayoutIds, ["new-layout"]); assert.equal(result.activeLayoutId, "new-layout");
  assert.deepEqual(result.createdOwners, { items: ["item"], containers: ["bag"] });
  assert.equal(result.payload.layouts["new-layout"].name, "Fixed copy name"); assert.ok(result.payload.layouts.chosen);
  const whole = fixture("full"), restored = personalArchiveImportPlan(whole);
  assert.deepEqual(restored.payload, whole.sourcePayload); assert.equal(restored.activeLayoutId, "old");
  whole.sourcePayload.items.item.name = "Too late"; assert.equal(restored.payload.items.item.name, "Archive item");
});

test("ambiguous targets, public records, incomplete graphs and photos never become DB-only archive authority", () => {
  for (const change of [value => value.layoutTargets.push(structuredClone(value.layoutTargets[0])),
    value => value.layoutTargets[0].name = "Different target", value => value.sourcePayload.items.item.adminDemo = true,
    value => delete value.sourcePayload.items.item, value => value.sourcePayload.layouts.old.arrangement.containers.bag.childIds.push("bag"),
    value => value.sourcePayload.layouts.old.arrangement.containers.bag.order = [], value => value.sourcePayload.layouts.old.arrangement.itemQuantities.item = 0,
    value => value.sourcePayload.items.item.photos = [{ id: "old-photo" }], value => value.currentPayload.items.item.photos = [{ id: "live-photo" }]]) {
    const input = fixture(); change(input); assert.throws(() => personalArchiveImportPlan(input), { code: "archive-import-plan" });
  }
});
