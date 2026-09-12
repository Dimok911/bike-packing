import test from "node:test";
import assert from "node:assert/strict";
import { treeCopyProjectionFixture as fixture } from "../fixtures/admin-template-photo-tree-copy-projection-fixture.js";
import { prepareAdminTemplatePhotoTreeCopyProjection as prepare } from "../../src/public/admin-template-photo-tree-copy-projection.js";
import { assertAdminTemplatePhotoCopyEditor as assertEditor } from "../../src/sync/admin-template-photo-copy-record.js";
import { assertAdminTemplatePhotoOwnerMap } from "../../src/sync/admin-template-photo-owner-map.js";
import { assertAdminTemplatePhotoView } from "../../src/sync/admin-template-photo-view.js";
import { ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED } from "../../src/sync/admin-template-photo-tree-copy-protocol.js";

const copy = value => structuredClone(value);
const local = (map, serverId) => map.owners.find(owner => owner.serverId === serverId).localId;
const noEffects = f => { assert.deepEqual(f.server.calls, []); assert.equal(f.values.size, 0); assert.equal(f.idb.rows("stage-dispatches").size, 0); };

test("real projector retains old target IDs and all nested/photo-free allocations with exact root insertion and known links", async () => {
  const f = await fixture(), before = copy(f.state), output = await prepare(f.args), { projection, targetSnapshot, nextState } = output;
  const c = f.intent.body.photoCopy, map = targetSnapshot.ownerMap, target = f.record.snapshot.target;
  assert.equal(ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED, false);
  assert.deepEqual(Object.keys(output).sort(), ["nextState", "projection", "proof", "targetSnapshot"]);
  assert.equal(map.owners.length, target.ownerMap.owners.length + c.owners.length);
  for (const old of target.ownerMap.owners) {
    assert.ok(map.owners.some(row => row.type === old.type && row.localId === old.localId && row.serverId === old.serverId));
    assert.deepEqual(projection[old.type][old.localId], target.beforeState[old.type][old.localId]);
  }
  const selected = new Map(f.record.snapshot.copiedOwners.map(row => [row.serverId, row.localId]));
  const sourceToLocal = new Map(c.owners.map(row => [row.sourceEntityId, selected.get(row.entityId)]));
  const oldRoot = local(target.ownerMap, "target-bag"), root = sourceToLocal.get(c.source.rootId);
  assert.deepEqual(projection.layout.rootContainerIds, [oldRoot, root]);
  assert.deepEqual(projection.layout.arrangement.rootContainerIds, [oldRoot, root]);
  for (const owner of c.owners) {
    const type = owner.entityType === "item" ? "items" : "containers", id = selected.get(owner.entityId), row = projection[type][id];
    assert.equal(local(map, owner.entityId), id); assert.equal(row.id, id); assert.equal(row.publicCatalogLayoutId, target.layoutId);
    assert.equal(row.sharedSourceId, owner.entityId); assert.equal(row.photos.length, owner.photos.length);
    const raw = c.source.payload[type][owner.sourceEntityId]; assert.deepEqual(row.opaque, raw.opaque);
    if (type === "containers") {
      const placement = c.source.payload.layouts[c.source.layoutId].arrangement.containers[owner.sourceEntityId];
      assert.equal(row.parentId, placement.parentId ? sourceToLocal.get(placement.parentId) : "");
      assert.deepEqual(row.childIds, placement.childIds.map(key => sourceToLocal.get(key)));
      assert.deepEqual(row.itemIds, placement.itemIds.map(key => sourceToLocal.get(key)));
      assert.deepEqual(row.order, placement.order.map(entry => ({ type: entry.type, id: sourceToLocal.get(entry.id) })));
      assert.deepEqual(projection.layout.arrangement.containers[id].opaque, placement.opaque);
    } else {
      assert.equal(row.containerId, sourceToLocal.get(raw.containerId)); assert.equal(row.quantity, raw.quantity);
      assert.equal(projection.layout.arrangement.itemQuantities[id], c.source.payload.layouts[c.source.layoutId].arrangement.itemQuantities[owner.sourceEntityId]);
      assert.equal(Object.hasOwn(projection.layout.arrangement.packedItems, id), false);
    }
  }
  assert.deepEqual(f.state, before); assert.deepEqual(nextState.layouts[target.layoutId], projection.layout);
  assertEditor({ binding: f.binding, revision: 12, payload: output.proof.confirmedPayload, side: targetSnapshot }); noEffects(f);
});

test("target-only detached replacement leaves source, other editor, private records and every top-level global byte-exact", async () => {
  const f = await fixture(), before = copy(f.state), { nextState, targetSnapshot } = await prepare(f.args), targetId = f.record.snapshot.target.layoutId;
  for (const [key, value] of Object.entries(before)) if (!["layouts", "items", "containers"].includes(key)) assert.deepEqual(nextState[key], value);
  for (const [id, row] of Object.entries(before.layouts)) if (id !== targetId) assert.deepEqual(nextState.layouts[id], row);
  for (const type of ["items", "containers"]) for (const [id, row] of Object.entries(before[type])) if (row.publicCatalogLayoutId !== targetId) assert.deepEqual(nextState[type][id], row);
  assert.deepEqual(targetSnapshot.beforeState.packedItems, targetSnapshot.beforeState.layouts[targetId].arrangement.packedItems);
  assert.notDeepEqual(targetSnapshot.beforeState.packedItems, nextState.packedItems);
  assert.deepEqual(f.state, before); noEffects(f);
});

test("photo-free nested bags and items are all materialized even when the root owns the only file", async () => {
  const f = await fixture({ photos: 1 }), output = await prepare(f.args), c = f.intent.body.photoCopy;
  const empty = c.owners.filter(owner => owner.photos.length === 0);
  assert.ok(empty.some(owner => owner.entityType === "container")); assert.ok(empty.some(owner => owner.entityType === "item"));
  assert.equal(output.targetSnapshot.ownerMap.owners.length, f.record.snapshot.target.ownerMap.owners.length + c.owners.length);
  for (const owner of empty) {
    const id = local(output.targetSnapshot.ownerMap, owner.entityId), type = owner.entityType === "item" ? "items" : "containers";
    assert.deepEqual(output.projection[type][id].photos, []);
    assert.equal(Object.hasOwn(output.projection.layout.arrangement[type], id), true);
    assert.equal(output.projection.layout.adminCausalSource.photoView.owners.some(row => row.localId === id), false);
  }
  noEffects(f);
});

test("normalized photo view preserves routes while full raw timestamps and unknown metadata remain in canonical payload", async () => {
  const f = await fixture(), output = await prepare(f.args), { projection, targetSnapshot } = output;
  const raw = f.receipt.result.payload.photoCopy.confirmedPayload, source = projection.layout.adminCausalSource;
  assert.deepEqual(source.canonicalPayload, raw); assert.deepEqual(source.base, { stateRevision: 12 }); assert.equal(source.planId, null);
  assert.equal(source.visibility, "private"); assert.equal(source.deleted, false);
  assert.deepEqual(source.canonicalPayload.items["target-item"].photos[0].futureMetadata, 8);
  for (const owner of f.intent.body.photoCopy.owners) for (const [i, asset] of owner.photos.entries()) {
    const type = owner.entityType === "item" ? "items" : "containers", localId = local(targetSnapshot.ownerMap, owner.entityId), photo = projection[type][localId].photos[i];
    assert.equal(photo.id, asset.photoId); assert.equal(photo.assetId, asset.assetId);
    assert.equal(photo.url, raw[type][owner.entityId].photos[i].url); assert.equal(photo.thumbUrl, raw[type][owner.entityId].photos[i].thumbUrl);
    const view = source.photoView.owners.find(row => row.localId === localId);
    assert.deepEqual(view.rawPhotos, raw[type][owner.entityId].photos); assert.deepEqual(view.viewPhotos, projection[type][localId].photos);
  }
  assertAdminTemplatePhotoOwnerMap({ binding: f.binding, layoutId: targetSnapshot.layoutId, stateRevision: 12,
    map: targetSnapshot.ownerMap, state: output.nextState, sourcePayload: raw });
  assertAdminTemplatePhotoView({ binding: f.binding, layoutId: targetSnapshot.layoutId, baseline: source.photoView, state: output.nextState }); noEffects(f);
});

test("repeat and cold OFF preparation use the same allocation IDs and do not refresh old legacy display dates", async () => {
  const f = await fixture(), first = await prepare(f.args), second = await prepare({ ...f.args, store: f.makeStore({ enabled: false }) });
  assert.deepEqual(second, first);
  for (const owner of f.record.snapshot.target.ownerMap.owners) assert.deepEqual(first.projection[owner.type][owner.localId], f.record.snapshot.target.beforeState[owner.type][owner.localId]);
  assert.equal(Object.values(first.projection.items).some(row => row.id.startsWith("admin-server-item-") && !f.record.snapshot.target.beforeState.items[row.id]), false);
  noEffects(f);
});

test("active target still returns separate contextual hydration instead of changing global packed/quantity state implicitly", async () => {
  const f = await fixture(); f.state.activeLayoutId = f.record.snapshot.target.layoutId;
  const before = copy(f.state), { nextState, targetSnapshot } = await prepare(f.args);
  assert.equal(nextState.activeLayoutId, before.activeLayoutId); assert.deepEqual(nextState.packedItems, before.packedItems);
  assert.deepEqual(nextState.locations, before.locations); assert.deepEqual(nextState.categories, before.categories);
  assert.notDeepEqual(targetSnapshot.beforeState.packedItems, nextState.packedItems); noEffects(f);
});

test("dirty source/target, extra selected owner and pending markers cannot be normalized away before proof", async () => {
  const f = await fixture();
  for (const sideName of ["source", "target"]) for (const mutate of [
    (state, side) => { state.layouts[side.layoutId].name = "unsaved"; },
    (state, side) => { state.layouts[side.layoutId].arrangement.opaque.keep = "unsaved"; },
    (state, side) => { state.layouts[side.layoutId].adminCausalSource.treePending = f.id; },
    (state, side) => { state.layouts[side.layoutId].adminCausalSource.planId = f.id; },
    (state, side) => { state.items.extra = { id: "extra", publicCatalogLayoutId: side.layoutId }; }
  ]) {
    const state = copy(f.state); mutate(state, f.record.snapshot[sideName]);
    await assert.rejects(prepare({ ...f.args, state }));
  }
  noEffects(f);
});

test("new local allocations cannot overwrite any type of unrelated identity or a source row", async () => {
  const f = await fixture(), id = f.record.snapshot.copiedOwners[0].localId;
  for (const type of ["layouts", "items", "containers"]) {
    const state = copy(f.state); state[type][id] = { id, opaque: { keep: true } };
    await assert.rejects(prepare({ ...f.args, state }));
  }
  const args = { ...f.args, plan: copy(f.plan) }; args.plan.recordIntentHash = "f".repeat(64);
  await assert.rejects(prepare(args)); noEffects(f);
});

test("foreign schema links to target or future allocations block collateral changes while opaque ID strings stay exact", async () => {
  const f = await fixture(), old = f.record.snapshot.target.ownerMap.owners[0].localId, added = f.record.snapshot.copiedOwners[0].localId;
  for (const id of [old, added]) for (const mutate of [
    state => { state.layouts["private-layout"].rootContainerIds.push(id); },
    state => { state.layouts["private-layout"].arrangement.itemQuantities[id] = 1; },
    state => { state.containers["other-bag"].childIds.push(id); },
    state => { state.items["private-item"].containerId = id; }
  ]) { const state = copy(f.state); mutate(state); await assert.rejects(prepare({ ...f.args, state })); }
  const state = copy(f.state);
  state.layouts["private-layout"].opaque = { old, added }; state.items["private-item"].opaque = { [added]: { literalId: old } };
  const output = await prepare({ ...f.args, state });
  assert.deepEqual(output.nextState.layouts["private-layout"], state.layouts["private-layout"]);
  assert.deepEqual(output.nextState.items["private-item"], state.items["private-item"]); noEffects(f);
});

test("a forged proof package, missing record or incomplete stages cannot bypass full V9 validation", async () => {
  const f = await fixture(), valid = await prepare(f.args);
  await assert.rejects(prepare({ state: f.state, proof: valid.proof }));
  await assert.rejects(prepare({ ...f.args, proof: valid.proof }));
  await assert.rejects(prepare({ ...f.args, stageReceipts: f.stages.slice(1) }));
  await assert.rejects(prepare({ ...f.args, store: { binding: f.binding, read: async () => null } })); noEffects(f);
});

test("all caller JSON detaches before await and the returned editor cannot mutate retained data", async () => {
  const f = await fixture(), before = copy(f.state), pending = prepare(f.args);
  f.state.layouts[f.record.snapshot.source.layoutId].name = "later caller edit"; f.args.plan.operations[0].body.photoCopy.fields.name = "later";
  f.args.receipt.result.payload.photoCopy.confirmedPayload.items = {}; f.args.stageReceipts.length = 0;
  const output = await pending;
  assert.deepEqual(output.nextState.layouts[f.record.snapshot.source.layoutId], before.layouts[f.record.snapshot.source.layoutId]);
  assert.equal(output.projection.layout.adminCausalSource.canonicalPayload.items["target-item"].name, "Target original");
  output.nextState.items = {}; output.targetSnapshot.ownerMap.owners[0].localId = "mutated";
  assert.deepEqual((await f.store.read(f.id)).snapshot, f.record.snapshot); noEffects(f);
});

test("scope change while awaiting retained record stops without modifying any namespace", async () => {
  const f = await fixture(), before = copy(f.state); let current = true;
  const store = { binding: f.binding, async read() { current = false; return f.record; } };
  await assert.rejects(prepare({ ...f.args, store }, () => { if (!current) throw Error("Changed scope"); }), /Changed scope/);
  assert.deepEqual(f.state, before); noEffects(f);
});
