import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { treeCopyProjectionFixture as fixture } from "../fixtures/admin-template-photo-tree-copy-projection-fixture.js";
import { prepareAdminTemplatePhotoTreeCopyNamespaces as prepare } from "../../src/public/admin-template-photo-tree-copy-namespaces.js";
import { prepareAdminTemplatePhotoTreeCopyProjection as project } from "../../src/public/admin-template-photo-tree-copy-projection.js";
import { prepareAdminTemplatePhotoTreeCopyRecord } from "../../src/sync/admin-template-photo-tree-copy-record.js";
import { adminTemplatePhotoTreeCopySavePlan, adminTemplatePhotoTreeCopyEditorSnapshot } from "../../src/sync/admin-template-photo-tree-copy-save-plan.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED } from "../../src/sync/admin-template-photo-tree-copy-protocol.js";

const copy = value => structuredClone(value), guard = () => {};
const args = (f, extra = {}) => ({ plan: f.plan, store: f.store, getState: () => f.state, getContext: () => f.current, ...extra });
const noEffects = f => { assert.deepEqual(f.server.calls, []); assert.equal(f.values.size, 0); assert.equal(f.idb.rows("stage-dispatches").size, 0); };
function pending(f) {
  const side = f.record.snapshot.target, layout = f.state.layouts[side.layoutId];
  layout.adminCausalSource.planId = f.id;
  layout.adminCausalSource.base = { operationId: f.id };
  layout.adminCausalSource.photoTreeCopyPending = f.id;
  layout.templateDraftSyncPending = true;
}
function planFor(record) {
  return adminTemplatePhotoTreeCopySavePlan({ binding: record.binding, operationId: record.action.operationId, body: record.action.body,
    editorSnapshot: adminTemplatePhotoTreeCopyEditorSnapshot(record), recordIntentHash: record.intentHash });
}

test("clean OFF namespaces prove the real retained record and derive only the four own pending fields", async () => {
  const f = await fixture(), before = copy(f.state), output = await prepare(args(f, { store: f.makeStore({ enabled: false }) }), guard);
  assert.equal(ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED, false); assert.equal(output.targetMode, "before");
  assert.deepEqual(output.cleanState, before); assert.equal(output.recordIntentHash, f.record.intentHash);
  assert.deepEqual(output.sourceNamespace, f.record.snapshot.source.beforeState);
  assert.deepEqual(output.targetNamespace, f.record.snapshot.target.beforeState);
  const expected = copy(f.record.snapshot.target.beforeState), layout = expected.layouts[output.targetLayoutId];
  layout.adminCausalSource = { ...layout.adminCausalSource, planId: f.id, base: { operationId: f.id }, photoTreeCopyPending: f.id };
  layout.templateDraftSyncPending = true;
  assert.deepEqual(output.pendingTargetNamespace, expected); output.assertCurrent();
  assert.deepEqual(f.state, before); assert.equal(Object.keys(f.state.items).length, Object.keys(before.items).length); noEffects(f);
});

test("exact pending cleans only detached target metadata and feeds the actual full receipt projector", async () => {
  const f = await fixture(), before = copy(f.state); pending(f); const captured = copy(f.state);
  const output = await prepare(args(f), guard); assert.equal(output.targetMode, "pending");
  assert.deepEqual(output.cleanState, before); assert.deepEqual(f.state, captured);
  const result = await project({ ...f.args, state: output.cleanState }, output.assertCurrent);
  assert.equal(result.projection.layout.adminCausalSource.base.stateRevision, 12);
  assert.equal(result.targetSnapshot.ownerMap.owners.length, f.record.snapshot.target.ownerMap.owners.length + f.record.snapshot.copiedOwners.length);
  assert.ok(f.record.snapshot.copiedOwners.some(owner => !f.intent.body.photoCopy.owners.find(row => row.entityId === owner.serverId).photos.length));
  assert.deepEqual(result.nextState.layouts[f.record.snapshot.source.layoutId], before.layouts[f.record.snapshot.source.layoutId]);
  assert.deepEqual(result.nextState.packedItems, before.packedItems); assert.deepEqual(result.nextState.items["private-item"], before.items["private-item"]);
  assert.deepEqual(f.state, captured); noEffects(f);
});

test("cold pending preparation restores absent versus false/null keys and preserves captured similar metadata", async () => {
  const f = await fixture(), input = { binding: f.binding, action: copy(f.record.action), snapshot: copy(f.record.snapshot) };
  for (const side of [input.snapshot.source, input.snapshot.target]) {
    const layout = side.beforeState.layouts[side.layoutId];
    delete layout.templateDraftSyncPending; delete layout.adminCausalSource.planId;
    layout.adminCausalSource.photoCopyPending = false;
    layout.adminCausalSource.opaque = { photoTreeCopyPending: "business metadata", nested: [null, false] };
  }
  const record = await prepareAdminTemplatePhotoTreeCopyRecord(input), store = { binding: f.binding, read: async () => copy(record) };
  for (const side of [record.snapshot.source, record.snapshot.target]) f.state.layouts[side.layoutId] = copy(side.beforeState.layouts[side.layoutId]);
  const before = copy(f.state); f.record = record; f.plan = planFor(record); pending(f);
  const output = await prepare(args(f, { store }), guard), cleaned = output.cleanState.layouts[record.snapshot.target.layoutId];
  assert.deepEqual(output.cleanState, before); assert.equal(Object.hasOwn(cleaned, "templateDraftSyncPending"), false);
  assert.equal(Object.hasOwn(cleaned.adminCausalSource, "planId"), false); assert.equal(cleaned.adminCausalSource.photoCopyPending, false);
  assert.equal(cleaned.adminCausalSource.opaque.photoTreeCopyPending, "business metadata"); noEffects(f);
});

test("partial, foreign, false and mixed pending markers cannot be stripped into a confirmed namespace", async () => {
  const f = await fixture(), before = copy(f.state), id = f.record.snapshot.target.layoutId;
  for (const mutate of [
    layout => { delete layout.adminCausalSource.photoTreeCopyPending; },
    layout => { layout.adminCausalSource.photoTreeCopyPending = false; },
    layout => { layout.adminCausalSource.photoTreeCopyPending = "ffffffff-ffff-4fff-8fff-ffffffffffff"; },
    layout => { layout.adminCausalSource.planId = null; },
    layout => { layout.adminCausalSource.base = { stateRevision: 11 }; },
    layout => { layout.adminCausalSource.base.stateRevision = 11; },
    layout => { layout.templateDraftSyncPending = false; },
    layout => { delete layout.templateDraftSyncPending; },
    layout => { layout.adminCausalSource.treePending = f.id; },
    layout => { layout.adminCausalSource.photoCopyPending = f.id; },
    layout => { layout.adminCausalSource.photoTreeCopyPendingExtra = f.id; },
    layout => { layout.photoTreeCopyPending = f.id; }
  ]) {
    f.state = copy(before); pending(f); mutate(f.state.layouts[id]); const changed = copy(f.state);
    await assert.rejects(prepare(args(f), guard)); assert.deepEqual(f.state, changed);
  }
  noEffects(f);
});

test("source is always exact confirmed before even if its pending UUID matches our own operation", async () => {
  const f = await fixture(), before = copy(f.state), side = f.record.snapshot.source;
  for (const mutate of [
    layout => { layout.adminCausalSource.photoTreeCopyPending = f.id; },
    layout => { layout.adminCausalSource = { ...layout.adminCausalSource, planId: f.id, base: { operationId: f.id }, photoTreeCopyPending: f.id }; layout.templateDraftSyncPending = true; },
    layout => { layout.arrangement.opaque.keep = "unsaved"; }
  ]) {
    f.state = copy(before); mutate(f.state.layouts[side.layoutId]);
    await assert.rejects(prepare(args(f), guard));
  }
  noEffects(f);
});

test("dirty fields, raw photo views, placement, dictionaries and detached owned rows fail on either side", async () => {
  const f = await fixture(), before = copy(f.state);
  for (const sideName of ["source", "target"]) for (const mutate of [
    (state, side) => { state.items[Object.keys(side.beforeState.items)[0]].name = "unsaved"; },
    (state, side) => { state.layouts[side.layoutId].adminCausalSource.photoView.owners[0].rawPhotos[0].fileName = "changed"; },
    (state, side) => { state.layouts[side.layoutId].arrangement.rootContainerIds.reverse(); state.layouts[side.layoutId].arrangement.opaque.extra = true; },
    (state, side) => { state.layouts[side.layoutId].locations.push("new"); },
    (state, side) => { delete state.layouts[side.layoutId].categories; state.categories = copy(side.beforeState.categories); },
    (state, side) => { delete state.layouts[side.layoutId].arrangement.packedItems; },
    (state, side) => { state.items["new-detached-owner"] = { id: "new-detached-owner", publicCatalogLayoutId: side.layoutId, photos: [] }; },
    (state, side) => { delete state.items[Object.keys(side.beforeState.items)[0]]; }
  ]) {
    f.state = copy(before); pending(f); mutate(f.state, f.record.snapshot[sideName]);
    await assert.rejects(prepare(args(f), guard));
  }
  noEffects(f);
});

test("new local allocations cannot collide with any current collection, even unrelated or added after proof", async () => {
  const f = await fixture(), before = copy(f.state), id = f.record.snapshot.copiedOwners[0].localId;
  for (const collection of ["layouts", "items", "containers"]) {
    f.state = copy(before); f.state[collection][id] = { id, opaque: "outside" };
    await assert.rejects(prepare(args(f), guard));
    f.state = copy(before); const output = await prepare(args(f), guard);
    f.state[collection][id] = { id, opaque: "arrived later" };
    assert.throws(output.assertCurrent, /сверки/);
    f.state = copy(before); f.state[collection][id] = { id, opaque: "captured collision" };
    const store = { binding: f.binding, async read(key) { const row = await f.store.read(key); delete f.state[collection][id]; return row; } };
    // Removing a collision while awaiting does not repair the already detached
    // snapshot: that snapshot must never reintroduce the obsolete owner.
    await assert.rejects(prepare(args(f, { store }), guard));
  }
  noEffects(f);
});

test("other namespaces and global fields may change during awaits and are never reset by this adapter", async () => {
  const f = await fixture(), before = copy(f.state); let reads = 0;
  const store = { binding: f.binding, async read(id) {
    const value = await f.store.read(id);
    if (++reads === 1) {
      f.state.items["private-item"].name = "new private edit";
      f.state.layouts["other-admin-layout"].opaque.keep = "later other editor";
      f.state.packedItems["private-item"] = false; f.state.unrelatedTopLevel.later = true;
    }
    return value;
  } };
  const output = await prepare(args(f, { store }), guard); output.assertCurrent();
  assert.equal(reads, 2); assert.deepEqual(output.cleanState, before);
  assert.equal(f.state.items["private-item"].name, "new private edit"); assert.equal(f.state.packedItems["private-item"], false);
  f.state.categories.push("later private category"); output.assertCurrent(); noEffects(f);
});

test("own pointer or selected namespace changes during either record await are rejected", async () => {
  const f = await fixture(), before = copy(f.state);
  for (const when of [1, 2]) for (const sideName of ["source", "target"]) {
    f.state = copy(before); pending(f); let reads = 0;
    const store = { binding: f.binding, async read(id) {
      const value = await f.store.read(id);
      if (++reads === when) f.state.layouts[f.record.snapshot[sideName].layoutId].adminCausalSource.planId = "changed";
      return value;
    } };
    await assert.rejects(prepare(args(f, { store }), guard));
  }
  noEffects(f);
});

test("same-byte layout replacement and global state replacement cannot cross the asynchronous context boundary", async () => {
  for (const kind of ["state", "source", "target"]) {
    const f = await fixture(); let reads = 0;
    const store = { binding: f.binding, async read(id) {
      const value = await f.store.read(id);
      if (++reads === 1) {
        if (kind === "state") f.state = copy(f.state);
        else { const id = f.record.snapshot[kind].layoutId; f.state.layouts[id] = copy(f.state.layouts[id]); }
      }
      return value;
    } };
    await assert.rejects(prepare(args(f, { store }), guard)); noEffects(f);
  }
});

test("actor, binding, scope, rights or generation changes during read pause before exposing cleaned snapshots", async () => {
  const f = await fixture(), context = copy(f.current);
  for (const [field, value] of [["actorId", "other"], ["listId", "public-shared-layout-other"], ["environment", "production"],
    ["scope", "personal"], ["admin", false], ["generation", "later"]]) {
    Object.assign(f.current, context);
    const store = { binding: f.binding, async read(id) { const row = await f.store.read(id); f.current[field] = value; return row; } };
    await assert.rejects(prepare(args(f, { store }), guard));
  }
  Object.assign(f.current, context); noEffects(f);
});

test("missing, swapped or rehashed dirty records and forged plan/proof packages never grant clean-state authority", async () => {
  const f = await fixture();
  await assert.rejects(prepare({ ...args(f), proof: { recordIntentHash: f.record.intentHash } }, guard));
  await assert.rejects(prepare(args(f, { plan: { ...f.plan, version: 8 } }), guard));
  await assert.rejects(prepare(args(f, { store: { binding: f.binding, read: async () => null } }), guard));
  await assert.rejects(prepare(args(f, { store: { binding: { ...f.binding, actorId: "other" }, read: async () => f.record } }), guard));
  for (const replacement of [null, { ...copy(f.record), stages: [] }]) {
    let reads = 0; const store = { binding: f.binding, read: async () => ++reads === 1 ? copy(f.record) : replacement };
    await assert.rejects(prepare(args(f, { store }), guard)); assert.equal(reads, 2);
  }
  const dirty = copy(f.record), target = dirty.snapshot.target;
  target.beforeState.items[Object.keys(target.beforeState.items)[0]].name = "forged unsaved old owner";
  dirty.intentHash = createHash("sha256").update(canonical({ version: 1, kind: "admin-template-photo-tree-copy", binding: dirty.binding,
    action: dirty.action, snapshot: dirty.snapshot, stages: dirty.stages })).digest("hex");
  await assert.rejects(prepare(args(f, { plan: planFor(dirty), store: { binding: f.binding, read: async () => copy(dirty) } }), guard)); noEffects(f);
});

test("caller JSON detaches and returned immutable snapshots cannot mutate either retained record or live state", async () => {
  const f = await fixture(), before = copy(f.state), plan = copy(f.plan), running = prepare(args(f, { plan }), guard);
  plan.operations[0].body.photoCopy.fields.name = "later caller input"; plan.recordIntentHash = "f".repeat(64);
  const output = await running; assert.deepEqual(output.cleanState, before);
  assert.throws(() => { output.cleanState.items = {}; }, TypeError);
  assert.throws(() => { output.pendingTargetNamespace.layouts[output.targetLayoutId].adminCausalSource.planId = "other"; }, TypeError);
  assert.deepEqual((await f.store.read(f.id)).snapshot, f.record.snapshot); assert.deepEqual(f.state, before); noEffects(f);
});

test("external raw-pointer/lifetime guard remains mandatory and is checked after awaits and on every returned guard call", async () => {
  const f = await fixture(); await assert.rejects(prepare(args(f)));
  let active = true, reads = 0;
  const check = () => { if (!active) throw Error("Outer scope or raw plan changed"); };
  const store = { binding: f.binding, async read(id) { const value = await f.store.read(id); if (++reads === 2) active = false; return value; } };
  await assert.rejects(prepare(args(f, { store }), check), /Outer scope/);
  active = true; const output = await prepare(args(f), check); active = false;
  assert.throws(output.assertCurrent, /Outer scope/); noEffects(f);
});

test("async state/context getters and async guards fail closed, including rejected promises", async () => {
  const f = await fixture();
  for (const extra of [{ getState: async () => f.state }, { getContext: async () => f.current },
    { getState: () => Promise.reject(Error("async state rejected")) }, { getContext: () => Promise.reject(Error("async context rejected")) }]) {
    await assert.rejects(prepare(args(f, extra), guard), error => error.code === "admin-template-photo-tree-copy-namespaces-async-guard");
  }
  for (const check of [async () => {}, () => Promise.reject(Error("async guard rejected"))])
    await assert.rejects(prepare(args(f), check), error => error.code === "admin-template-photo-tree-copy-namespaces-async-guard");
  noEffects(f);
});
