import test from "node:test";
import assert from "node:assert/strict";
import { adminPhotoTreeCopyRecordInput } from "../fixtures/admin-template-photo-tree-copy-record-fixture.js";
import { prepareAdminTemplatePhotoTreeCopyRecord } from "../../src/sync/admin-template-photo-tree-copy-record.js";
import { prepareAdminTemplatePhotoTreeCopyForm } from "../../src/public/admin-template-photo-tree-copy-flow.js";

function inputFor(record) {
  const copy = record.action.body.photoCopy;
  return structuredClone({ binding: record.binding, operationId: record.action.operationId,
    sourcePayload: copy.source.payload, targetPayload: record.action.body.payload, snapshot: record.snapshot,
    sourceRootLocalId: record.snapshot.source.ownerMap.owners.find(owner => owner.type === "containers" && owner.serverId === copy.source.rootId).localId,
    placementIndex: copy.placement.index, fields: copy.fields,
    photos: copy.owners.map(owner => owner.photos.map(({ assetDigest, ...photo }) => photo)) });
}

for (const options of [{}, { depth: 1, owners: 1, photos: 2 }, { depth: 5, owners: 12, photos: 1 }])
  test(`tree form reproduces the full typed record with frozen IDs, including photo-free owners ${JSON.stringify(options)}`, async () => {
    const captured = await adminPhotoTreeCopyRecordInput(options), expected = await prepareAdminTemplatePhotoTreeCopyRecord(captured);
    const input = inputFor(captured), before = structuredClone(input), pending = prepareAdminTemplatePhotoTreeCopyForm(input);
    input.fields.name = "Later selection"; input.sourcePayload.locations.push("Later source");
    input.snapshot.copiedOwners[0].localId = "Later ID"; input.photos.flat()[0].photoId = "Later photo ID";
    const actual = await pending;
    assert.deepEqual(actual, expected);
    assert.deepEqual(await prepareAdminTemplatePhotoTreeCopyForm(before), actual);
    assert.equal(actual.snapshot.copiedOwners.length, options.owners || 5);
  });

test("tree form refuses edited editors, unknown roots and mismatched source/target mapping", async () => {
  const record = await adminPhotoTreeCopyRecordInput();
  const faults = [
    value => { Object.values(value.snapshot.source.beforeState.items)[0].name = "Unsaved source"; },
    value => { Object.values(value.snapshot.target.beforeState.items)[0].note = "Unsaved target"; },
    value => { value.sourceRootLocalId = "unknown-root"; },
    value => { value.sourceRootLocalId = value.snapshot.source.ownerMap.owners.find(owner => owner.type === "items").localId; },
    value => { value.snapshot.copiedOwners[0].sourceLocalId = "unknown-owner"; },
    value => { value.sourcePayload.activeLayoutId = "unknown-layout"; },
    value => { value.placementIndex = 9; },
    value => { value.targetPayload.locations.push("Different target payload"); }
  ];
  for (const fault of faults) {
    const input = inputFor(record); fault(input);
    await assert.rejects(prepareAdminTemplatePhotoTreeCopyForm(input), { code: "admin-template-photo-tree-copy-form" });
  }
});

test("tree form refuses partial/reordered owners and photographs, duplicates and supplied digests", async () => {
  const record = await adminPhotoTreeCopyRecordInput({ photos: 9 });
  const faults = [
    value => { value.snapshot.copiedOwners.pop(); value.photos.pop(); },
    value => { value.snapshot.copiedOwners.reverse(); value.photos.reverse(); },
    value => { value.photos[0].reverse(); },
    value => { value.photos[0].pop(); },
    value => { value.photos.push([]); },
    value => { value.photos.flat()[0].assetDigest = "0".repeat(64); },
    value => { value.photos.flat()[1].assetId = value.photos.flat()[0].assetId; },
    value => { value.snapshot.copiedOwners[0].localId = value.snapshot.target.layoutId; },
    value => { value.snapshot.copiedOwners[0].serverId = "target-bag"; }
  ];
  for (const fault of faults) {
    const input = inputFor(record); fault(input);
    await assert.rejects(prepareAdminTemplatePhotoTreeCopyForm(input));
  }
});

test("form failure leaves the captured selection intact for a same-ID retry", async () => {
  const record = await adminPhotoTreeCopyRecordInput(), input = inputFor(record);
  const bad = structuredClone(input); bad.photos[0][0].sourcePhotoId = "missing-photo";
  const before = structuredClone(bad);
  await assert.rejects(prepareAdminTemplatePhotoTreeCopyForm(bad));
  assert.deepEqual(bad, before);
  const first = await prepareAdminTemplatePhotoTreeCopyForm(input), second = await prepareAdminTemplatePhotoTreeCopyForm(input);
  assert.deepEqual(first, second); assert.equal(first.action.operationId, record.action.operationId);
});
