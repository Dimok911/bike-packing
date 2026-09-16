import test from "node:test";
import assert from "node:assert/strict";
import { wholeRecordInput } from "../fixtures/admin-template-photo-whole-copy-record-fixture.js";
import { allocateAdminTemplatePhotoWholeCopySelection as allocate } from "../../src/public/admin-template-photo-whole-copy-selection.js";
import { prepareAdminTemplatePhotoWholeCopyForm as prepare } from "../../src/public/admin-template-photo-whole-copy-flow.js";
import { assertAdminTemplatePhotoWholeCopyIntentDigests } from "../../src/sync/admin-template-photo-whole-copy-protocol.js";

const copy = structuredClone, uuid = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
function generator() { let calls = 0; return { newUuid: () => uuid(++calls), get calls() { return calls; } }; }
async function fixture() {
  const record = await wholeRecordInput();
  return { record, input: copy({ source: record.snapshot.source, sourcePayload: record.action.body.photoCopy.sourcePayload,
    metadata: record.action.body.metadata, targetKind: "shared", occupiedIds: ["other-editor"] }) };
}
const meta = value => value.source.beforeState.layouts[value.source.layoutId].adminCausalSource;

for (const targetKind of ["demo", "shared"]) test(`whole ${targetKind} selection feeds typed form and preserves every catalog owner`, async () => {
  const f = await fixture(); f.input.targetKind = targetKind;
  const before = copy(f.input), g = generator(), selected = allocate(f.input, g);
  assert.equal(selected?.then, undefined); assert.deepEqual(f.input, before);
  assert.ok(Object.isFrozen(selected.snapshot.source.beforeState) && Object.isFrozen(selected.photos[0]));
  assert.equal(g.calls, 3 + f.record.snapshot.copiedOwners.length + 2 * f.record.action.body.photoCopy.owners.reduce((n, row) => n + row.photos.length, 0));
  const result = await prepare(selected);
  assert.equal(result.action.kind, "template.copy"); assert.equal(result.action.body.base, null);
  assert.equal(result.binding.listId.startsWith(targetKind === "demo" ? "public-demo-state-" : "public-shared-layout-"), true);
  assert.deepEqual(result.snapshot, selected.snapshot);
  assert.deepEqual(result.action.body.photoCopy.sourcePayload, before.sourcePayload);
  assert.deepEqual(result.action.body.metadata, before.metadata);
  assert.deepEqual(result.action.body.photoCopy.owners.map(row => [row.entityType, row.sourceEntityId]),
    f.record.action.body.photoCopy.owners.map(row => [row.entityType, row.sourceEntityId]));
  assert.ok(result.action.body.photoCopy.owners.some(row => row.sourceEntityId === "item-unplaced"));
  assert.ok(result.action.body.photoCopy.owners.some(row => row.sourceEntityId === "detached-root"));
  assert.ok(result.action.body.photoCopy.owners.some(row => row.photos.length === 0));
  assert.equal(await assertAdminTemplatePhotoWholeCopyIntentDigests({ ...result.binding, ...result.action }), true);
  assert.deepEqual(allocate(before, generator()), selected);
});

test("private confirmed source and every editor field are checked before UUID allocation", async () => {
  const f = await fixture();
  for (const change of [
    input => { meta(input).visibility = "public"; },
    input => { meta(input).base.stateRevision++; },
    input => { meta(input).planId = uuid(90); },
    input => { meta(input).wholePending = false; },
    input => { meta(input).photoTreeCopyPending = null; },
    input => { input.source.beforeState.items[Object.keys(input.source.beforeState.items)[0]].name += " changed"; },
    input => { input.source.beforeState.layouts[input.source.layoutId].note += " changed"; },
    input => { meta(input).photoView.owners[0].rawPhotos[0].createdAt = "2026-01-01"; },
    input => { input.source.ownerMap.owners.pop(); },
    input => { input.sourcePayload.items["item-unplaced"].quantity++; },
    input => { input.metadata.title = " invalid whitespace "; },
    input => { input.targetKind = "public"; }
  ]) {
    const input = copy(f.input); change(input); const g = generator();
    assert.throws(() => allocate(input, g), { code: "admin-template-photo-whole-copy-selection" }); assert.equal(g.calls, 0);
  }
});

test("allocated identities reject source, global, derived and repeated collisions without retrying", async () => {
  const f = await fixture();
  for (const occupiedId of [uuid(1), uuid(2), uuid(3), `layout-${uuid(1)}`, `template-copy-${uuid(1)}-c-0`, `public-shared-layout-${uuid(2)}`, `shared-layout:${uuid(2)}`]) {
    const input = copy(f.input); input.occupiedIds.push(occupiedId); const g = generator();
    assert.throws(() => allocate(input, g), { code: "admin-template-photo-whole-copy-selection" });
    assert.ok(g.calls <= 3);
  }
  for (const value of ["invalid", Promise.resolve(uuid(1)), f.input.source.layoutId])
    assert.throws(() => allocate(f.input, { newUuid: () => value }), { code: "admin-template-photo-whole-copy-selection" });
  let calls = 0;
  assert.throws(() => allocate(f.input, { newUuid: () => { calls++; return uuid(1); } }), { code: "admin-template-photo-whole-copy-selection" });
  assert.equal(calls, 2);
});

test("caller mutations during synchronous allocation or asynchronous digest cannot change frozen intent", async () => {
  const f = await fixture(), before = copy(f.input), g = generator();
  const selected = allocate(f.input, { newUuid() {
    f.input.metadata.title = "Changed"; f.input.source.ownerMap.owners.length = 0; return g.newUuid();
  } });
  assert.deepEqual(selected, allocate(before, generator()));
  const input = copy(selected), pending = prepare(input);
  input.sourcePayload.items["item-unplaced"].name = "Changed after first await";
  input.snapshot.target.metadata.title = "Changed";
  input.photos[0].push({ sourcePhotoId: "foreign", photoId: uuid(99), assetId: uuid(98) });
  const result = await pending;
  assert.deepEqual(result.snapshot, selected.snapshot);
  assert.deepEqual(result.action.body.photoCopy.sourcePayload, before.sourcePayload);
});

test("form independently rejects altered source snapshots, allocations and photo mappings", async () => {
  const f = await fixture(), selected = allocate(f.input, generator());
  for (const change of [
    input => { input.binding.actorId = "other-actor"; },
    input => { input.snapshot.source.beforeState.layouts[input.snapshot.source.layoutId].note += " changed"; },
    input => { input.snapshot.target.serverLayoutId = "forged-layout"; },
    input => { input.snapshot.target.beforeState = {}; },
    input => { input.snapshot.copiedOwners[0].localId = input.snapshot.source.layoutId; },
    input => { input.snapshot.copiedOwners.pop(); input.photos.pop(); },
    input => { input.photos.find(row => row.length)[0].sourcePhotoId = "missing"; },
    input => { input.photos.find(row => row.length)[0].photoId = input.operationId; },
    input => { input.sourcePayload.items["item-unplaced"].quantity++; }
  ]) {
    const input = copy(selected); change(input);
    await assert.rejects(prepare(input), { code: "admin-template-photo-whole-copy-form" });
  }
});
