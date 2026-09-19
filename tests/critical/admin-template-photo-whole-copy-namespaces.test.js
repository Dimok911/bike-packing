import test from "node:test";
import assert from "node:assert/strict";
import { wholeStoreFixture } from "../fixtures/admin-template-photo-whole-copy-record-fixture.js";
import { adminTemplatePhotoWholeCopySavePlan, adminTemplatePhotoWholeCopySourceEditorSnapshot } from "../../src/sync/admin-template-photo-whole-copy-save-plan.js";
import { prepareAdminTemplatePhotoWholeCopyNamespaces as prepare } from "../../src/public/admin-template-photo-whole-copy-namespaces.js";
import { ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED } from "../../src/sync/admin-template-photo-whole-copy-protocol.js";

const copy = structuredClone;
const guard = () => {};
async function fixture() {
  const f = await wholeStoreFixture(), record = await f.store.capture(f.value), state = copy(record.snapshot.source.beforeState);
  state.items.private = { id: "private", name: "Private item", containerId: "private-bag", photos: [] };
  state.containers["private-bag"] = { id: "private-bag", parentId: "", childIds: [], itemIds: ["private"], order: [{ type: "item", id: "private" }] };
  state.layouts.other = { id: "other", rootContainerIds: ["private-bag"], arrangement: { rootContainerIds: ["private-bag"], containers: {},
    items: { private: "private-bag" }, itemQuantities: { private: 1 }, packedItems: { private: false } } };
  state.opaqueTop = { untouched: true }; state.packedItems = { private: false };
  const plan = adminTemplatePhotoWholeCopySavePlan({ binding: record.binding, operationId: record.action.operationId, body: record.action.body,
    sourceEditorSnapshot: adminTemplatePhotoWholeCopySourceEditorSnapshot(record), recordIntentHash: record.intentHash });
  f.idb.transactions.length = 0; f.idb.requests.length = 0;
  return { ...f, record, plan, state, current: f.context };
}
const args = (f, extra = {}) => ({ plan: f.plan, store: f.store, getState: () => f.state, getContext: () => f.current, ...extra });
const noWrites = f => {
  assert.ok(f.idb.transactions.every(tx => tx.mode === "readonly"));
  assert.ok(f.idb.requests.every(request => !["add", "put", "delete"].includes(request.operation)));
  assert.equal(f.idb.rows("stage-dispatches").size, 0);
};

test("OFF whole copy proves exact raw source and absent target without fabricating target state", async () => {
  const f = await fixture(), before = copy(f.state), result = await prepare(args(f, { store: f.create({ enabled: false }) }), guard);
  assert.equal(ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED, false);
  assert.deepEqual(Object.keys(result).sort(), ["assertCurrent", "cleanState", "recordIntentHash", "sourceLayoutId", "sourceNamespace", "targetLayoutId"]);
  assert.deepEqual(result.sourceNamespace, f.record.snapshot.source.beforeState);
  assert.deepEqual(result.cleanState, before); assert.equal(result.recordIntentHash, f.record.intentHash);
  assert.equal(Object.hasOwn(result.cleanState.layouts, result.targetLayoutId), false);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.cleanState.items));
  result.assertCurrent(); assert.deepEqual(f.state, before); noWrites(f);
});

test("all new local/server owner/layout/photo/asset identities are absent across every global collection", async () => {
  const f = await fixture(), before = copy(f.state), owner = f.record.snapshot.copiedOwners[0];
  const photo = f.plan.operations[0].body.photoCopy.owners.flatMap(value => value.photos)[0];
  for (const id of [f.record.snapshot.target.layoutId, f.record.snapshot.target.serverLayoutId, owner.localId, owner.serverId, photo.photoId, photo.assetId]) {
    for (const type of ["layouts", "items", "containers"]) {
      f.state = copy(before); f.state[type][id] = { id };
      await assert.rejects(prepare(args(f), guard), { code: "admin-template-photo-whole-copy-namespaces-identity-collision" });
    }
  }
  noWrites(f);
});

test("target binding aliases, raw server namespace mappings and derived photo URL references reserve IDs", async () => {
  const f = await fixture(), before = copy(f.state), id = f.plan.binding.itemKey.split(":")[1];
  const photo = f.plan.operations[0].body.photoCopy.owners.flatMap(value => value.photos)[0];
  const cases = [
    state => { state.layouts.other.adminDemoListId = `public-demo-state-${id}`; },
    state => { state.layouts.other.adminSharedSourceId = id; },
    state => { state.layouts.other.adminCausalSource = { binding: { listId: f.plan.binding.listId, itemKey: f.plan.binding.itemKey } }; },
    state => { state.layouts.other.adminCausalSource = { photoOwnerMap: { owners: [{ serverId: f.record.snapshot.copiedOwners[0].serverId }] } }; },
    state => { state.layouts.other.adminCausalSource = { canonicalPayload: { activeLayoutId: f.record.snapshot.target.serverLayoutId } }; },
    state => { state.items.private.photos = [{ photoId: photo.photoId }]; },
    state => { state.items.private.photos = [{ assetId: photo.assetId }]; },
    state => { state.items.private.photos = [{ urls: { original: `/lists/${f.plan.binding.listId}/photos/unrelated/file` } }]; },
    state => { state.layouts.other.adminCausalSource = { photoView: { owners: [{ rawPhotos: [{ id: photo.photoId }] }] } }; }
  ];
  for (const change of cases) { f.state = copy(before); change(f.state); await assert.rejects(prepare(args(f), guard)); }
  noWrites(f);
});

test("dangling arrangement/packed/catalog references reject reuse while opaque business strings remain unchanged", async () => {
  const f = await fixture(), before = copy(f.state), id = f.record.snapshot.copiedOwners[0].localId;
  const cases = [
    state => { state.layouts.other.arrangement.items[id] = "private-bag"; },
    state => { state.layouts.other.arrangement.containers.dangling = { parentId: id }; },
    state => { state.layouts.other.arrangement.itemQuantities[id] = 3; },
    state => { state.packedItems[id] = false; },
    state => { state.containers["private-bag"].order.push({ type: "item", id }); },
    state => { state.items.private.containerId = id; },
    state => { state.items.private.publicCatalogLayoutId = f.record.snapshot.target.layoutId; }
  ];
  for (const change of cases) { f.state = copy(before); change(f.state); await assert.rejects(prepare(args(f), guard)); }
  f.state = copy(before); f.state.items.private.note = id; f.state.opaqueTop = { id, nested: { listId: f.plan.binding.listId } };
  const result = await prepare(args(f), guard); assert.equal(result.cleanState.items.private.note, id); noWrites(f);
});

test("raw source dirt, missing dictionary/packed keys and own-looking pending target never normalize away", async () => {
  const f = await fixture(), before = copy(f.state), sourceId = f.record.snapshot.source.layoutId;
  const sourceItem = Object.keys(f.record.snapshot.source.beforeState.items)[0];
  const cases = [
    state => { state.items[sourceItem].name = "Unsaved rename"; },
    state => { state.layouts[sourceId].adminCausalSource.photoView.owners[0].rawPhotos[0].fileName = "changed"; },
    state => { delete state.layouts[sourceId].categories; },
    state => { delete state.layouts[sourceId].arrangement.packedItems; },
    state => { state.layouts[sourceId].adminCausalSource.photoWholeCopyPending = f.plan.id; },
    state => { state.layouts[f.record.snapshot.target.layoutId] = { id: f.record.snapshot.target.layoutId, photoWholeCopyPending: f.plan.id }; }
  ];
  for (const change of cases) { f.state = copy(before); change(f.state); await assert.rejects(prepare(args(f), guard)); }
  noWrites(f);
});

test("source/state/collection/context same-byte replacements during typed awaits are not adopted", async () => {
  for (const kind of ["state", "collection", "layout", "owner", "photo", "context"]) {
    const f = await fixture(); let reads = 0;
    const store = { binding: f.store.binding, async read(id) {
      const result = await f.store.read(id);
      if (++reads === 1) {
        const sourceId = f.record.snapshot.source.layoutId, itemId = Object.keys(f.record.snapshot.source.beforeState.items)[0];
        if (kind === "state") f.state = copy(f.state);
        if (kind === "collection") f.state.items = { ...f.state.items };
        if (kind === "layout") f.state.layouts[sourceId] = copy(f.state.layouts[sourceId]);
        if (kind === "owner") f.state.items[itemId] = copy(f.state.items[itemId]);
        if (kind === "photo") f.state.layouts[sourceId].adminCausalSource.photoView = copy(f.state.layouts[sourceId].adminCausalSource.photoView);
        if (kind === "context") f.current.generation = "another-generation";
      }
      return result;
    } };
    await assert.rejects(prepare(args(f, { store }), guard)); noWrites(f);
  }
});

test("initial and later collisions/source changes remain rejected but unrelated edits are preserved", async () => {
  const f = await fixture(), before = copy(f.state), target = f.record.snapshot.target.layoutId;
  f.state.layouts[target] = { id: target };
  const remove = { binding: f.store.binding, async read(id) { const row = await f.store.read(id); delete f.state.layouts[target]; return row; } };
  await assert.rejects(prepare(args(f, { store: remove }), guard));
  f.state = copy(before);
  const change = { binding: f.store.binding, async read(id) { const row = await f.store.read(id); f.state.items.private.name = "Later edit"; return row; } };
  const result = await prepare(args(f, { store: change }), guard);
  assert.equal(result.cleanState.items.private.name, "Private item"); assert.equal(f.state.items.private.name, "Later edit"); result.assertCurrent();
  f.state.layouts[target] = { id: target }; assert.throws(result.assertCurrent); delete f.state.layouts[target];
  f.state.layouts[f.record.snapshot.source.layoutId].note = "new source edit"; assert.throws(result.assertCurrent); noWrites(f);
});

test("missing or changing native record, forged snapshot and non-synchronous guards never establish authority", async () => {
  const f = await fixture();
  for (const guard of [undefined, () => false, async () => true, async () => { throw Error("No async authority"); }]) await assert.rejects(prepare(args(f), guard));
  await assert.rejects(prepare(args(f, { getState: async () => f.state }), guard));
  await assert.rejects(prepare(args(f, { getContext: async () => f.current }), guard));
  const store = { binding: f.store.binding, read: async () => null }; await assert.rejects(prepare(args(f, { store }), guard));
  let reads = 0; store.read = async id => ++reads < 3 ? f.store.read(id) : null;
  await assert.rejects(prepare(args(f, { store }), guard));
  const plan = copy(f.plan); plan.sourceEditorSnapshot.metadata.title = "forged";
  await assert.rejects(prepare(args(f, { plan }), guard)); noWrites(f);
});

test("repeated namespace guards avoid source serialization but still detect nested add/change/delete", async () => {
  const f = await fixture(), result = await prepare(args(f), guard);
  const item = f.state.items[Object.keys(f.record.snapshot.source.beforeState.items)[0]], name = item.name;
  const stringify = JSON.stringify; let sourceSerializations = 0;
  JSON.stringify = (value, ...rest) => { if (value === name) sourceSerializations++; return stringify(value, ...rest); };
  try { for (let i = 0; i < 20; i++) result.assertCurrent(); }
  finally { JSON.stringify = stringify; }
  assert.equal(sourceSerializations, 0);
  await Promise.resolve(); item.name = name + " changed"; assert.throws(result.assertCurrent); item.name = name; result.assertCurrent();
  item.extra = { nested: true }; assert.throws(result.assertCurrent); delete item.extra; result.assertCurrent();
  delete item.name; assert.throws(result.assertCurrent); item.name = name; result.assertCurrent(); noWrites(f);
});
