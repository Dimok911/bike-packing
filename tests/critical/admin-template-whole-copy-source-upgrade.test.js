import test from "node:test";
import assert from "node:assert/strict";
import { wholeRecordInput } from "../fixtures/admin-template-photo-whole-copy-record-fixture.js";
import { prepareAdminTemplateWholeCopySourceUpgrade as upgrade } from "../../src/public/admin-template-whole-copy-source-upgrade.js";
import { LAYOUT_ITEM_QUANTITY_MIGRATION_VERSION } from "../../src/state/layout-arrangement.js";
import { prepareAdminTemplatePhotoWholeCopyRecord } from "../../src/sync/admin-template-photo-whole-copy-record.js";

async function fixture() {
  const record = await wholeRecordInput(), side = record.snapshot.source, layout = side.beforeState.layouts[side.layoutId];
  layout.templatePublished = true; layout.adminCausalSource.visibility = "public";
  delete layout.adminCausalSource.photoOwnerMap;
  const binding = layout.adminCausalSource.binding;
  return { layoutId: side.layoutId, beforeState: side.beforeState, prepared: { ok: true, ...binding, indexes: [],
    exists: true, visibility: "public", stateRevision: layout.adminCausalSource.base.stateRevision,
    payload: record.action.body.photoCopy.sourcePayload, metadata: side.metadata } };
}

test("old public editor gains whole-copy proof without replacing its rows or raw source", async () => {
  const input = await fixture(), before = structuredClone(input), result = upgrade(input);
  assert.deepEqual(input, before);
  assert.equal(result.visibility, "public");
  assert.deepEqual(result.canonicalPayload, input.prepared.payload);
  assert.equal(result.photoOwnerMap.owners.length,
    Object.keys(input.prepared.payload.items).length + Object.keys(input.prepared.payload.containers).length);
  assert.deepEqual(result.photoView, input.beforeState.layouts[input.layoutId].adminCausalSource.photoView);
});

test("legacy public editor quantity migration marker is not a business conflict during upgrade or cold copy validation", async () => {
  const input = await fixture();
  const arrangement = input.beforeState.layouts[input.layoutId].arrangement;
  assert.equal(Object.hasOwn(Object.values(input.prepared.payload.layouts)[0].arrangement, "itemQuantityMigrationVersion"), false);
  arrangement.itemQuantityMigrationVersion = LAYOUT_ITEM_QUANTITY_MIGRATION_VERSION;
  const before = structuredClone(input);
  const result = upgrade(input);
  assert.deepEqual(input, before);
  assert.deepEqual(result.canonicalPayload, input.prepared.payload);
  for (const mutate of [a => { a.itemQuantityMigrationVersion = 999; },
    a => { a.itemQuantities[Object.keys(a.itemQuantities)[0]]++; },
    a => { a.rootContainerIds.reverse(); },
    a => { a.unknownMigrationMarker = true; }]) {
    const changed = structuredClone(input); mutate(changed.beforeState.layouts[input.layoutId].arrangement);
    assert.throws(() => upgrade(changed));
  }
  const record = await wholeRecordInput({ sourceVisibility: "public" });
  const local = record.snapshot.source.beforeState.layouts[record.snapshot.source.layoutId];
  local.arrangement.itemQuantityMigrationVersion = LAYOUT_ITEM_QUANTITY_MIGRATION_VERSION;
  const raw = structuredClone(record.action.body.photoCopy.sourcePayload);
  const prepared = await prepareAdminTemplatePhotoWholeCopyRecord(record);
  assert.deepEqual(prepared.action.body.photoCopy.sourcePayload, raw);
  assert.equal(prepared.snapshot.source.beforeState.layouts[local.id].arrangement.itemQuantityMigrationVersion,
    LAYOUT_ITEM_QUANTITY_MIGRATION_VERSION);
});

test("old public editor upgrade refuses unsaved fields, ambiguous IDs, stale source and pending work", async () => {
  const input = await fixture();
  for (const mutate of [
    value => { Object.values(value.beforeState.items)[0].name += " local edit"; },
    value => { value.prepared.stateRevision++; },
    value => { value.prepared.visibility = "private"; },
    value => { value.prepared.actorId = "different-actor"; },
    value => { value.beforeState.layouts[value.layoutId].name += " local edit"; },
    value => { value.beforeState.layouts[value.layoutId].templateDraftSyncPending = true; },
    value => { Object.values(value.beforeState.items)[1].sharedSourceId = Object.values(value.beforeState.items)[0].sharedSourceId; },
    value => { [...Object.values(value.beforeState.items), ...Object.values(value.beforeState.containers)]
      .find(row => row.photos?.length).photos[0].url = "/different-photo.jpg"; }
  ]) {
    const changed = structuredClone(input); mutate(changed); const before = structuredClone(changed);
    assert.throws(() => upgrade(changed)); assert.deepEqual(changed, before);
  }
});
