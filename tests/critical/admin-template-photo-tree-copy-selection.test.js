import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { adminPhotoTreeCopyRecordInput } from "../fixtures/admin-template-photo-tree-copy-record-fixture.js";
import { allocateAdminTemplatePhotoTreeCopySelection as allocate } from "../../src/public/admin-template-photo-tree-copy-selection.js";
import { prepareAdminTemplatePhotoTreeCopyForm } from "../../src/public/admin-template-photo-tree-copy-flow.js";

const copy = value => structuredClone(value), uuid = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
function generator() { let calls = 0; return { newUuid: () => uuid(++calls), get calls() { return calls; } }; }
async function fixture(options) {
  // This fixture uses the real projectAdminTemplateServerVariant, including its
  // separate raw photo baselines and normalized local placement/photo mirrors.
  const record = await adminPhotoTreeCopyRecordInput(options), c = record.action.body.photoCopy;
  const input = copy({ binding: record.binding, source: record.snapshot.source, target: record.snapshot.target,
    sourceRootLocalId: record.snapshot.copiedOwners.find(owner => owner.serverId === c.owners.find(row => row.sourceEntityId === c.source.rootId).entityId).sourceLocalId,
    fields: c.fields, placementIndex: c.placement.index,
    occupiedIds: [...Object.keys(c.source.payload.layouts), ...Object.keys(record.action.body.payload.layouts), "unrelated-live-owner"] });
  return { record, input, sourcePayload: c.source.payload, targetPayload: record.action.body.payload };
}
const arrangement = value => value.source.beforeState.layouts[value.source.layoutId].arrangement;
const baseline = value => value.source.beforeState.layouts[value.source.layoutId].adminCausalSource.photoView;
const mapChanged = value => { value.source.beforeState.layouts[value.source.layoutId].adminCausalSource.photoOwnerMap = copy(value.source.ownerMap); };
const rejectsBeforeAllocation = value => {
  const g = generator(); assert.throws(() => allocate(value, g), { code: "admin-template-photo-tree-copy-selection" }); assert.equal(g.calls, 0);
};

for (const options of [{}, { depth: 1, owners: 1, photos: 2 }, { depth: 32, owners: 100, photos: 50 }])
  test(`sync tree allocation feeds actual full form proof without altering either snapshot ${JSON.stringify(options)}`, async () => {
    const f = await fixture(options), before = copy(f.input), g = generator(), selected = allocate(f.input, g);
    assert.equal(selected?.then, undefined); assert.equal(g.calls, 1 + 2 * (options.owners || 5) + 2 * (options.photos || 4));
    assert.equal(Object.hasOwn(selected, "sourcePayload"), false); assert.equal(Object.hasOwn(selected, "targetPayload"), false);
    assert.deepEqual(f.input, before); assert.deepEqual(selected.snapshot.source, before.source); assert.deepEqual(selected.snapshot.target, before.target);
    assert.ok(Object.isFrozen(selected) && Object.isFrozen(selected.photos[0]) && Object.isFrozen(selected.snapshot.source.beforeState));
    const prepared = await prepareAdminTemplatePhotoTreeCopyForm({ ...selected, sourcePayload: f.sourcePayload, targetPayload: f.targetPayload });
    const expectedOwners = f.record.action.body.photoCopy.owners;
    assert.deepEqual(prepared.action.body.photoCopy.owners.map(owner => [owner.entityType, owner.sourceEntityId]), expectedOwners.map(owner => [owner.entityType, owner.sourceEntityId]));
    assert.deepEqual(prepared.action.body.photoCopy.owners.map(owner => owner.photos.map(photo => photo.sourcePhotoId)), expectedOwners.map(owner => owner.photos.map(photo => photo.sourcePhotoId)));
    assert.deepEqual(prepared.action.body.payload, f.targetPayload); assert.deepEqual(prepared.action.body.photoCopy.source.payload, f.sourcePayload);
    assert.deepEqual(prepared.snapshot, selected.snapshot);
    assert.deepEqual(allocate(before, generator()), selected);
  });

test("selection orders by server identity, preserves legacy photoId and includes photo-free owners", async () => {
  const f = await fixture({ depth: 3, owners: 12, photos: 9 });
  f.input.source.ownerMap.owners.reverse(); mapChanged(f.input);
  const selected = allocate(f.input, generator()), source = selected.snapshot.source;
  const serverIds = selected.snapshot.copiedOwners.map(owner => source.ownerMap.owners.find(row => row.localId === owner.sourceLocalId).serverId);
  assert.deepEqual(serverIds, f.record.action.body.photoCopy.owners.map(owner => owner.sourceEntityId));
  const oldPhotos = baseline(f.input).owners.flatMap(owner => owner.rawPhotos), legacy = oldPhotos.find(photo => !Object.hasOwn(photo, "id") && photo.photoId);
  assert.ok(legacy); assert.ok(selected.photos.flat().some(photo => photo.sourcePhotoId === legacy.photoId));
  assert.ok(selected.photos.some(photos => photos.length === 0));
  const all = [selected.operationId, ...selected.snapshot.copiedOwners.flatMap(owner => [owner.serverId, owner.localId]), ...selected.photos.flatMap(photos => photos.flatMap(photo => [photo.photoId, photo.assetId]))];
  assert.equal(new Set(all).size, all.length);
});

test("the generator cannot mutate captured snapshots or fields through the caller's input", async () => {
  const f = await fixture(), original = copy(f.input), g = generator();
  const selected = allocate(f.input, { newUuid() {
    f.input.fields.name = "Changed after allocation began"; f.input.source.ownerMap.owners.length = 0;
    f.input.occupiedIds.push(uuid(2)); return g.newUuid();
  } });
  assert.deepEqual(selected.snapshot.source, original.source); assert.deepEqual(selected.fields, original.fields);
  assert.deepEqual(selected, allocate(original, generator()));
});

test("unplaced/nested roots, cycles, omitted members and outside aliases fail before any ID is consumed", async () => {
  const f = await fixture(), root = f.input.sourceRootLocalId, a = arrangement(f.input), child = a.containers[root].childIds[0], item = a.containers[root].itemIds[0];
  const neighbor = a.rootContainerIds.find(key => key !== root), detached = Object.keys(f.input.source.beforeState.items).find(key => !Object.hasOwn(a.items, key));
  const faults = [
    value => { value.sourceRootLocalId = child; }, value => { arrangement(value).rootContainerIds = [neighbor]; },
    value => { arrangement(value).containers[child].parentId = neighbor; },
    value => { arrangement(value).containers[root].order.pop(); },
    value => { arrangement(value).containers[root].childIds.push(root); arrangement(value).containers[root].order.push({ type: "container", id: root }); },
    value => { arrangement(value).rootContainerIds.push(child); },
    value => { arrangement(value).items[item] = neighbor; }, value => { arrangement(value).itemQuantities[item] = 0; },
    value => { arrangement(value).containers[neighbor].itemIds.push(item); },
    value => { arrangement(value).items[detached] = root; },
    value => { arrangement(value).containers[neighbor].parentId = root; },
    value => { value.source.beforeState.items[item].availabilityStatus = "unavailable"; }
  ];
  for (const fault of faults) { const input = copy(f.input); fault(input); rejectsBeforeAllocation(input); }
});

test("foreign/missing owner maps, changed photo views, pending bases and target placement cannot allocate", async () => {
  const f = await fixture();
  const faults = [
    value => { value.binding.actorId = "foreign"; },
    value => { value.source.ownerMap.owners.pop(); mapChanged(value); },
    value => { value.source.ownerMap.owners.push(copy(value.source.ownerMap.owners[0])); mapChanged(value); },
    value => { value.source.ownerMap.owners[0].serverId = value.source.ownerMap.owners[1].serverId; mapChanged(value); },
    value => { value.source.ownerMap.stateRevision++; mapChanged(value); },
    value => { value.source.beforeState.layouts[value.source.layoutId].adminCausalSource.base = { operationId: randomUUID() }; },
    value => { value.source.beforeState.layouts[value.source.layoutId].adminCausalSource.photoTreeCopyPending = false; },
    value => { value.target.beforeState.layouts[value.target.layoutId].adminCausalSource.visibility = "public"; },
    value => { value.target.beforeState.layouts[value.target.layoutId].templateDraftSyncPending = true; },
    value => { value.target.beforeState.layouts[value.target.layoutId].locked = true; },
    value => { value.placementIndex = -1; }, value => { value.placementIndex = 2; },
    value => { const owner = baseline(value).owners[0]; value.source.beforeState[owner.type][owner.localId].photos.reverse(); value.source.beforeState[owner.type][owner.localId].photos[0].url = "https://changed.example/"; },
    value => { baseline(value).owners[0].serverId = "wrong-photo-owner"; },
    value => { value.occupiedIds = ["same", "same"]; }, value => { value.occupiedIds = ["bad/id"]; },
    value => { value.fields.createdAt = "invalid"; }, value => { value.fields.name = " Unsaved "; }
  ];
  for (const fault of faults) { const input = copy(f.input); fault(input); rejectsBeforeAllocation(input); }
});

test("selected unsupported raw photo metadata is rejected while unrelated raw/opaque fields remain unchanged", async () => {
  const f = await fixture(), value = copy(f.input), owner = baseline(value).owners.find(row => row.localId === value.sourceRootLocalId);
  assert.ok(owner); owner.rawPhotos[0].unsupportedFutureField = { keep: true };
  // Changing raw-only metadata cannot be sanitized by the otherwise exact view.
  rejectsBeforeAllocation(value);
  const original = copy(f.input), result = allocate(f.input, generator());
  assert.deepEqual(result.snapshot.source, original.source); assert.deepEqual(result.snapshot.target, original.target);
  assert.deepEqual(f.input, original);
});

test("0/51 photos, 101 selected owners and depth33 are rejected synchronously", async () => {
  const f = await fixture({ depth: 32, owners: 100, photos: 50 });
  const noPhotos = copy(f.input); for (const type of ["items", "containers"]) for (const row of Object.values(noPhotos.source.beforeState[type])) row.photos = [];
  baseline(noPhotos).owners = []; rejectsBeforeAllocation(noPhotos);
  const tooManyPhotos = copy(f.input), owner = baseline(tooManyPhotos).owners[0], raw = copy(owner.rawPhotos[0]), view = copy(owner.viewPhotos[0]);
  for (const photo of [raw, view]) { photo.id = "extra-photo"; if (Object.hasOwn(photo, "photoId")) photo.photoId = "extra-photo"; if (photo.assetId) photo.assetId = uuid(991); }
  owner.rawPhotos.push(raw); owner.viewPhotos.push(view); tooManyPhotos.source.beforeState[owner.type][owner.localId].photos.push(copy(view)); rejectsBeforeAllocation(tooManyPhotos);
  const tooManyOwners = copy(f.input), a = arrangement(tooManyOwners), root = tooManyOwners.sourceRootLocalId, template = Object.values(tooManyOwners.source.beforeState.items)[0];
  tooManyOwners.source.beforeState.items["extra-local-item"] = { ...copy(template), id: "extra-local-item", photos: [] };
  tooManyOwners.source.ownerMap.owners.push({ type: "items", localId: "extra-local-item", serverId: "extra-server-item" }); mapChanged(tooManyOwners);
  a.containers[root].itemIds.push("extra-local-item"); a.containers[root].order.push({ type: "item", id: "extra-local-item" });
  a.items["extra-local-item"] = root; a.itemQuantities["extra-local-item"] = 1; rejectsBeforeAllocation(tooManyOwners);
  const deep = copy(f.input), da = arrangement(deep), last = Object.keys(da.containers).find(key => da.containers[key].parentId && !da.containers[key].childIds.length);
  deep.source.beforeState.containers["extra-local-bag"] = { ...copy(deep.source.beforeState.containers[last]), id: "extra-local-bag", photos: [] };
  deep.source.ownerMap.owners.push({ type: "containers", localId: "extra-local-bag", serverId: "extra-server-bag" }); mapChanged(deep);
  da.containers[last].childIds.push("extra-local-bag"); da.containers[last].order.push({ type: "container", id: "extra-local-bag" });
  da.containers["extra-local-bag"] = { parentId: last, childIds: [], itemIds: [], order: [] }; rejectsBeforeAllocation(deep);
});

test("UUID allocation rejects invalid, asynchronous and colliding generators without retries or partial results", async () => {
  const f = await fixture();
  for (const generated of ["invalid", "00000000-0000-1000-8000-000000000001", null, Promise.resolve(uuid(1))]) {
    let calls = 0; assert.throws(() => allocate(f.input, { newUuid() { calls++; return generated; } })); assert.equal(calls, 1);
  }
  let calls = 0; assert.throws(() => allocate(f.input, { newUuid() { calls++; return uuid(1); } })); assert.equal(calls, 2);
  const original = copy(f.input); let asyncCalls = 0;
  assert.throws(() => allocate(f.input, { async newUuid() { asyncCalls++; throw Error("rejected UUID generator"); } }));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(asyncCalls, 1); assert.deepEqual(f.input, original);
  assert.deepEqual(allocate(f.input, generator()), allocate(original, generator()));
});

test("all newly allocated kinds share one collision set covering global IDs and existing photo assets", async () => {
  const f = await fixture(), total = 1 + f.record.snapshot.copiedOwners.length * 2 + f.record.action.body.photoCopy.owners.reduce((n, owner) => n + owner.photos.length * 2, 0);
  for (const slot of [1, 2, 3, 4, 5, total]) {
    const input = copy(f.input); input.occupiedIds.push(uuid(slot)); const g = generator();
    assert.throws(() => allocate(input, g)); assert.equal(g.calls, slot);
  }
  const oldAsset = baseline(f.input).owners.flatMap(owner => owner.rawPhotos).find(photo => photo.assetId).assetId;
  let calls = 0; assert.throws(() => allocate(f.input, { newUuid() { calls++; return oldAsset; } })); assert.equal(calls, 1);
  const value = copy(f.input), key = uuid(1), row = Object.values(value.target.beforeState.items)[0];
  value.target.beforeState.items[key] = { ...copy(row), id: key, photos: [] };
  value.target.ownerMap.owners.push({ type: "items", localId: key, serverId: "existing-server-extra" });
  value.target.beforeState.layouts[value.target.layoutId].adminCausalSource.photoOwnerMap = copy(value.target.ownerMap);
  const g = generator(); assert.throws(() => allocate(value, g)); assert.equal(g.calls, 1);
  const serverCollision = copy(value), targetMap = serverCollision.target.ownerMap;
  targetMap.owners.find(owner => owner.localId === key).serverId = uuid(2);
  serverCollision.target.beforeState.layouts[serverCollision.target.layoutId].adminCausalSource.photoOwnerMap = copy(targetMap);
  let serverCalls = 0;
  assert.throws(() => allocate(serverCollision, { newUuid() { serverCalls++; return serverCalls === 1 ? uuid(500) : uuid(2); } }));
  assert.equal(serverCalls, 2);
  const photoCollision = copy(f.input), photoOwner = baseline(photoCollision).owners.find(owner => owner.rawPhotos.some(photo => !Object.hasOwn(photo, "id")));
  const index = photoOwner.rawPhotos.findIndex(photo => !Object.hasOwn(photo, "id"));
  photoOwner.rawPhotos[index].photoId = uuid(1);
  for (const photo of [photoOwner.viewPhotos[index], photoCollision.source.beforeState[photoOwner.type][photoOwner.localId].photos[index]]) {
    photo.id = uuid(1); if (Object.hasOwn(photo, "photoId")) photo.photoId = uuid(1);
  }
  const pg = generator(); assert.throws(() => allocate(photoCollision, pg)); assert.equal(pg.calls, 1);
});
