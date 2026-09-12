import test from "node:test";
import assert from "node:assert/strict";
import { treeAcceptanceAppFixture, addTreeRoutingLegacyLayout } from "../fixtures/admin-template-photo-tree-copy-form-fixture.js";
import { adminTemplatePhotoNamespace } from "../../src/public/admin-template-photo-state.js";
import { adminTemplatePhotoTreeCopyAcceptanceKey, ADMIN_TEMPLATE_PHOTO_TREE_COPY_ACCEPTANCE_PREFIX } from "../../src/public/admin-template-photo-tree-copy-acceptance.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { AMBIGUOUS_WRITE_KEY } from "../../src/sync/experiment-transport.js";
import { addRootContainerToLayoutInState } from "../../src/state/layout-ops.js";
import { layoutItemQuantityMigrationRecovered } from "../../src/state/layout-normalize.js";

const copy = structuredClone;
const retained = f => ({ values: [...f.values].filter(([key]) => key !== "mirror"), records: copy([...f.idb.rows()]) });
const assertRetained = (f, before) => {
  for (const [key, value] of before.values) assert.equal(f.values.get(key), value, `retained ${key}`);
  for (const [key, value] of before.records) assert.deepEqual(f.idb.rows().get(key), value, `retained IDB ${key}`);
};
const accepted = async (f, record = f.notifications.at(-1)) => {
  const value = await f.api().readAdminTemplatePhotoTreeCopyAccepted(record.binding, record.snapshot.target.layoutId, record.action.operationId, () => {}, true);
  assert.ok(value); value.assertCurrent(); assert.deepEqual(value.record, record);
  assert.equal(value.receipt.operation.state, "committed"); return value;
};

test("actual accepted tree permits ordinary save, cold reload and a new exact V9 while retaining all previous proofs", async () => {
  const f = await treeAcceptanceAppFixture(), originalSource = copy(adminTemplatePhotoNamespace(f.state, f.input.sourceLayoutId)), privateItem = copy(f.state.items.privateItem);
  const first = await f.submit(); assert.equal(first.applied, true); const firstRecord = f.notifications[0]; await accepted(f, firstRecord);
  const history = retained(f), oldRaw = copy(f.state.layouts[f.layoutId].adminCausalSource.canonicalPayload);
  const ordinary = await f.editAndSave(); assert.equal(ordinary.result.applied, true);
  const expectedRaw = copy(oldRaw); expectedRaw.items[ordinary.owner.serverId].name += " ordinary accepted edit";
  assert.deepEqual(f.http.ordinaryPosts[0].body.payload, expectedRaw, "ordinary save preserves every untouched raw field/photo/arrangement/dictionary");
  assert.equal(f.http.ordinaryPosts[0].body.base.stateRevision, firstRecord.action.body.base.stateRevision + 1);
  assert.deepEqual(f.state.layouts[f.layoutId].adminCausalSource.canonicalPayload, expectedRaw);
  assert.equal(f.state.layouts[f.layoutId].adminCausalSource.photoOwnerMap.stateRevision, firstRecord.action.body.base.stateRevision + 2);
  assertRetained(f, history); f.cold(); await accepted(f, firstRecord);
  assert.equal(await f.api().findAdminTemplatePhotoTreeCopyFormRecord(f.layoutId), null);
  const next = { ...copy(f.input), placementIndex: 0, formSnapshot: { saved: "next" } };
  assert.equal((await f.submit(next)).applied, true); const second = f.notifications.at(-1); await accepted(f, second);
  assert.notEqual(second.action.operationId, firstRecord.action.operationId);
  assert.equal(second.action.body.base.stateRevision, firstRecord.action.body.base.stateRevision + 2);
  assert.deepEqual(second.action.body.payload, expectedRaw);
  assert.equal(f.http.treePosts.length, 2); assert.equal(f.http.ordinaryPosts.length, 1); assert.equal(f.http.stagePosts.length, 8);
  assert.equal(new Set(f.http.stagePosts.map(row => row.manifest.operationId)).size, 8); assertRetained(f, history);
  assert.deepEqual(adminTemplatePhotoNamespace(f.state, f.input.sourceLayoutId), originalSource); assert.deepEqual(f.state.items.privateItem, privateItem);
  assert.equal(f.idb.rows().size, 2); assert.equal(f.held.size, 0);
});

test("the accepted target can become an inactive source for a second actual tree copy", async () => {
  const f = await treeAcceptanceAppFixture(); await f.submit(); const first = f.notifications[0], history = retained(f);
  const root = first.snapshot.copiedOwners.find(owner => owner.entityType === "container" && owner.sourceLocalId === f.input.sourceId);
  assert.ok(root); const source = copy(adminTemplatePhotoNamespace(f.state, f.layoutId));
  const next = { entityType: "container", includeContents: true, sourceId: root.localId,
    sourceLayoutId: f.layoutId, targetLayoutId: f.input.sourceLayoutId, placementIndex: 1, formSnapshot: { saved: "reverse" } };
  assert.equal((await f.submit(next)).applied, true); const second = f.notifications[1];
  assert.equal(second.action.body.photoCopy.source.base.stateRevision, first.action.body.base.stateRevision + 1);
  assert.deepEqual(second.action.body.photoCopy.source.payload, source.layouts[f.layoutId].adminCausalSource.canonicalPayload);
  assert.deepEqual(adminTemplatePhotoNamespace(f.state, f.layoutId), source); assertRetained(f, history);
  assert.equal(f.http.treePosts.length, 2); assert.equal(f.http.ordinaryPosts.length, 0); assert.equal(f.held.size, 0);
});

test("actual order opens accepted retained V9 through typed history without changing or resending it", async () => {
  const f = await treeAcceptanceAppFixture(); await f.submit(); const history = retained(f), writes = f.http.treePosts.length;
  const layout = f.state.layouts[f.layoutId], result = await f.api().openCausalAdminTemplateOrder([
    { id: "demo", layouts: [] }, { id: "shared", layouts: [layout] }, { id: "personal", layouts: [] }]);
  assert.equal(result.session.rows.length, 1); assert.equal(result.session.rows[0].base.stateRevision, layout.adminCausalSource.base.stateRevision);
  assertRetained(f, history); assert.equal(f.http.treePosts.length, writes); assert.equal(f.http.ordinaryPosts.length, 0); assert.equal(f.held.size, 0);
});

test("acceptance quota after the confirmed mirror recovers cold with own gate OFF and no second copy", async () => {
  const f = await treeAcceptanceAppFixture();
  f.controls.rejectWrite = key => key.startsWith(ADMIN_TEMPLATE_PHOTO_TREE_COPY_ACCEPTANCE_PREFIX);
  await assert.rejects(f.submit(), /Quota/); const record = f.notifications[0], key = adminTemplatePhotoTreeCopyAcceptanceKey(record.binding, record.action.operationId);
  assert.equal(f.values.has(key), false); assert.equal(f.http.treePosts.length, 1);
  assert.equal(f.state.layouts[f.layoutId].adminCausalSource.photoTreeCopyPending, record.action.operationId);
  assert.equal(JSON.parse(f.values.get("mirror")).layouts[f.layoutId].adminCausalSource.base.stateRevision, record.action.body.base.stateRevision + 1);
  const history = retained(f); f.controls.rejectWrite = null; f.flags.tree = false; f.cold();
  const found = await f.api().findAdminTemplatePhotoTreeCopyFormRecord(f.layoutId); assert.equal(found.action.operationId, record.action.operationId);
  const calls = f.http.calls.length, result = await f.api().resumeAdminTemplatePhotoTreeCopyForm(f.layoutId);
  assert.equal(result.applied, true); await accepted(f, record); assertRetained(f, history);
  assert.ok(f.http.calls.slice(calls).every(row => row.method === "GET")); assert.equal(f.http.treePosts.length, 1); assert.equal(f.http.stagePosts.length, 4);
  assert.equal(await f.api().findAdminTemplatePhotoTreeCopyFormRecord(f.layoutId), null); assert.equal(f.held.size, 0);
});

test("corrupt or missing acceptance refuses a new ordinary capture and leaves its unsaved edit and historical evidence", async () => {
  for (const fault of ["corrupt", "missing"]) {
    const f = await treeAcceptanceAppFixture(); await f.submit(); const record = f.notifications[0], key = adminTemplatePhotoTreeCopyAcceptanceKey(record.binding, record.action.operationId);
    if (fault === "corrupt") f.values.set(key, "{"); else f.values.delete(key);
    const history = retained(f), count = f.http.calls.length;
    await assert.rejects(f.editAndSave());
    assert.ok(Object.values(f.state.items).some(item => item.name?.endsWith(" ordinary accepted edit")));
    assert.equal(f.http.ordinaryPosts.length, 0); assert.equal(f.http.calls.length, count); assertRetained(f, history);
    assert.equal(f.idb.rows().size, 1); assert.equal(f.held.size, 0);
  }
});

test("acceptance deleted after actual beginWrite blocks the second V9 before its first POST", async () => {
  const f = await treeAcceptanceAppFixture(); await f.submit(); const record = f.notifications[0], key = adminTemplatePhotoTreeCopyAcceptanceKey(record.binding, record.action.operationId);
  const stages = f.http.stagePosts.length, saves = f.http.treePosts.length; let triggered = false;
  f.controls.afterBegin = () => { triggered = true; f.values.delete(key); };
  await assert.rejects(f.submit({ ...copy(f.input), formSnapshot: { saved: "late-proof-loss" } }));
  assert.equal(triggered, true); assert.equal(f.http.stagePosts.length, stages); assert.equal(f.http.treePosts.length, saves);
  assert.equal(f.idb.rows().size, 2, "the new immutable record is retained for recovery"); assert.equal(f.held.size, 0);
});

test("acknowledgement quota requires exact original GET settlement before acceptance and a subsequent ordinary save", async () => {
  const f = await treeAcceptanceAppFixture();
  f.controls.rejectWrite = (key, value) => key.startsWith(AMBIGUOUS_WRITE_KEY + ":") && JSON.parse(value).confirmed === true
    && JSON.parse(value).recovery?.type === "admin-template";
  await assert.rejects(f.submit()); const record = f.notifications[0], transportKey = `${AMBIGUOUS_WRITE_KEY}:${record.action.operationId}`;
  const raw = f.values.get(transportKey); assert.equal(JSON.parse(raw).confirmed, undefined);
  const key = adminTemplatePhotoTreeCopyAcceptanceKey(record.binding, record.action.operationId); assert.equal(f.values.has(key), false);
  f.flags.tree = false; f.cold(); await assert.rejects(f.api().resumeAdminTemplatePhotoTreeCopyForm(f.layoutId));
  assert.equal(f.values.has(key), false); assert.equal(f.values.get(transportKey), raw);
  f.controls.rejectWrite = null; f.cold(); const calls = f.http.calls.length;
  assert.equal((await f.api().resumeAdminTemplatePhotoTreeCopyForm(f.layoutId)).applied, true); await accepted(f, record);
  assert.ok(f.http.calls.slice(calls).every(row => row.method === "GET"));
  assert.ok(f.http.calls.slice(calls).some(row => row.path.endsWith(`/template-operations/${record.action.operationId}`)));
  const confirmed = JSON.parse(f.values.get(transportKey)); assert.equal(confirmed.confirmed, true);
  assert.deepEqual(confirmed.receipt, httpReceipt(f, record)); assert.equal(f.transport.writes.find(row => row.id === record.action.operationId).blocksWrites, false);
  assert.equal((await f.editAndSave()).result.applied, true); assert.equal(f.http.ordinaryPosts.length, 1);
  assert.equal(f.http.treePosts.length, 1); assert.equal(f.idb.rows().size, 1); assert.equal(f.held.size, 0);
});

const httpReceipt = (f, record) => f.http.receipts.get(record.action.operationId);

test("cold mirror-only acceptance completion preserves a later unsaved source and does not rewrite either namespace", async () => {
  const f = await treeAcceptanceAppFixture(); f.controls.rejectWrite = key => key.startsWith(ADMIN_TEMPLATE_PHOTO_TREE_COPY_ACCEPTANCE_PREFIX);
  await assert.rejects(f.submit(), /Quota/); const record = f.notifications[0]; f.controls.rejectWrite = null; f.flags.tree = false; f.cold();
  f.state.layouts[f.input.sourceLayoutId].note = "Later source draft must survive acceptance-only completion";
  f.values.set("mirror", JSON.stringify(f.state)); const before = copy(f.state), mirror = f.values.get("mirror"), calls = f.http.calls.length;
  const result = await f.api().resumeAdminTemplatePhotoTreeCopyForm(f.layoutId);
  assert.equal(result.applied, true); await accepted(f, record); assert.deepEqual(f.state, before); assert.equal(f.values.get("mirror"), mirror);
  assert.ok(f.http.calls.slice(calls).every(row => row.method === "GET")); assert.equal(f.http.treePosts.length, 1); assert.equal(f.http.ordinaryPosts.length, 0);
  assert.equal(f.held.size, 0);
});


// These entrypoint cases intentionally have no planId or pending marker after
// cold readback. Calling resume directly would bypass the discovery regression.
test("actual mapped arrangement preserves a confirmed cold V9 through opening with tree-only or all photo writers OFF", async () => {
  for (const offMode of ["tree-only", "all-photos"]) {
    const f = await treeAcceptanceAppFixture({ routing: true, arrangement: true });
    f.controls.rejectWrite = key => key.startsWith(ADMIN_TEMPLATE_PHOTO_TREE_COPY_ACCEPTANCE_PREFIX);
    await assert.rejects(f.submit(), /Quota/); const record = f.notifications[0];
    const root = record.snapshot.copiedOwners.find(row => row.entityType === "container" && row.sourceLocalId === f.input.sourceId);
    const key = adminTemplatePhotoTreeCopyAcceptanceKey(record.binding, record.action.operationId);
    assert.equal(f.values.has(key), false); f.controls.rejectWrite = null;
    if (offMode === "tree-only") f.flags.tree = false; else turnTreeWritesOff(f);
    f.cold(); assertNoColdPointer(f);
    assert.equal(f.state.containers[root.localId].parentId, "", "the actual committed projection keeps this exact root representation");
    const stateRef = f.state, layoutRef = f.state.layouts[f.layoutId], before = copy(f.state), mirror = f.values.get("mirror");
    const history = retained(f), requests = f.http.calls.length;
    const result = await f.api().openCausalAdminTemplate(routeTarget(f), { remember: false });
    assert.equal(f.routes.errors.length, 0, f.routes.errors[0]?.stack);
    assert.equal(result, layoutRef); assert.equal(f.state, stateRef); assert.equal(f.state.layouts[f.layoutId], layoutRef);
    assert.deepEqual(f.routes.errors, []); await accepted(f, record);
    assert.deepEqual(f.state, before, "real context restoration and arrangement application preserve both namespaces and private data");
    assert.equal(f.values.get("mirror"), mirror); assertRetained(f, history);
    assert.equal(f.state.containers[root.localId].parentId, "");
    assert.equal(f.routes.capture, 0); assert.equal(f.routes.flush, 0); assert.deepEqual(f.routes.fallback, []);
    assert.ok(f.http.calls.slice(requests).every(row => row.method === "GET"));
    assert.equal(f.http.treePosts.length, 1); assert.equal(f.http.stagePosts.length, 4); assert.equal(f.http.ordinaryPosts.length, 0);
    assert.equal(f.held.size, 0);
  }
});

test("actual mapped arrangement retains both root representations but applies a genuine nested-to-root move with all photo writers OFF", async () => {
  const f = await treeAcceptanceAppFixture({ routing: true, arrangement: true }); await f.submit();
  const record = f.notifications[0], root = record.snapshot.copiedOwners.find(row => row.entityType === "container" && row.sourceLocalId === f.input.sourceId);
  await accepted(f, record); const confirmed = JSON.parse(f.values.get("mirror")), history = retained(f), requests = f.http.calls.length;
  for (const createEnabled of [true, false]) for (const rootParent of ["", null]) {
    f.flags.tree = false; f.flags.create = createEnabled; f.flags.copy = createEnabled; f.flags.append = createEnabled; f.reset();
    const sample = copy(confirmed), layout = sample.layouts[f.layoutId];
    // These representation variants exercise the display adapter only. They
    // are never passed off as a different committed receipt/acceptance proof.
    sample.containers[root.localId].parentId = rootParent;
    const before = copy(sample), layoutRef = layout;
    assert.equal(f.api().ensureLayoutDictionaries(layout, sample), layout);
    f.api().captureActiveLayoutArrangement(sample);
    assert.equal(f.api().applyLayoutArrangement(f.layoutId, sample), true);
    assert.equal(f.api().applyLayoutArrangement(f.layoutId, sample), true);
    assert.equal(sample.layouts[f.layoutId], layoutRef); assert.deepEqual(sample, before);
    assert.equal(sample.containers[root.localId].parentId, rootParent);

    const [childId, child] = Object.entries(sample.containers).find(([, row]) => row.publicCatalogLayoutId === f.layoutId && row.parentId);
    const parentId = child.parentId, businessBefore = copy(sample.containers);
    assert.equal(addRootContainerToLayoutInState(sample, f.layoutId, childId, 0), true);
    assert.equal(layout.arrangement.containers[childId].parentId, "");
    assert.equal(child.parentId, parentId, "real placement intent precedes display-link application");
    const arrangementBefore = copy(layout.arrangement);
    f.api().applyLayoutArrangement(f.layoutId, sample);
    assert.equal(child.parentId, null, "a nonempty old parent is cleared on the actual nested-to-root transition");
    assert.equal(layout.rootContainerIds[0], childId);
    assert.ok(!sample.containers[parentId].childIds.includes(childId));
    assert.ok(!sample.containers[parentId].order.some(row => row.type === "container" && row.id === childId));
    assert.deepEqual(layout.arrangement, arrangementBefore);
    assert.deepEqual(adminTemplatePhotoNamespace(sample, f.input.sourceLayoutId), adminTemplatePhotoNamespace(before, f.input.sourceLayoutId));
    assert.deepEqual(sample.layouts.private, before.layouts.private); assert.deepEqual(sample.items.privateItem, before.items.privateItem);
    for (const [id, prior] of Object.entries(businessBefore)) {
      const business = row => Object.fromEntries(Object.entries(row).filter(([key]) => !["parentId", "childIds", "itemIds", "order"].includes(key)));
      assert.deepEqual(business(sample.containers[id]), business(prior), "placement must retain photos and every opaque owner field");
    }
    const after = copy(sample); f.api().applyLayoutArrangement(f.layoutId, sample); assert.deepEqual(sample, after);
  }
  assert.equal(f.http.calls.length, requests); assertRetained(f, history); assert.equal(f.held.size, 0);
});

const collectionRefs = state => Object.fromEntries(["layouts", "items", "containers"].map(type =>
  [type, { map: state[type], rows: Object.entries(state[type]) }]));
const assertCollectionRefs = (state, refs) => {
  for (const [type, prior] of Object.entries(refs)) {
    assert.equal(state[type], prior.map, `${type}: original collection restored`);
    for (const [id, row] of prior.rows) assert.equal(state[type][id], row, `${type}/${id}: original row retained`);
  }
};
const protectedBytes = (f, state = f.state) => [f.input.sourceLayoutId, f.layoutId]
  .map(id => canonicalTemplateJson(adminTemplatePhotoNamespace(state, id)));
const privateBytes = state => canonicalTemplateJson({ layout: state.layouts.private, item: state.items.privateItem,
  marker: state.privateMarker, locations: state.locations, categories: state.categories });

test("actual legacy activation between cold mirror read and target opening preserves exact V9 acceptance with all photo writers OFF", async () => {
  const f = await treeAcceptanceAppFixture({ routing: true, arrangement: true });
  // The personal item is already a normal detached catalog item at startup.
  f.state.items.privateItem.containerId = "";
  f.values.set("mirror", JSON.stringify(f.state));
  f.controls.rejectWrite = key => key.startsWith(ADMIN_TEMPLATE_PHOTO_TREE_COPY_ACCEPTANCE_PREFIX);
  await assert.rejects(f.submit(), /Quota/); const record = f.notifications[0];
  const key = adminTemplatePhotoTreeCopyAcceptanceKey(record.binding, record.action.operationId);
  assert.equal(f.values.has(key), false); f.controls.rejectWrite = null; turnTreeWritesOff(f); f.cold(); assertNoColdPointer(f);
  const legacy = addTreeRoutingLegacyLayout(f.state, f.binding), refs = collectionRefs(f.state);
  const namespaces = protectedBytes(f), privateBefore = privateBytes(f.state), history = retained(f), calls = f.http.calls.length;
  const root = record.snapshot.copiedOwners.find(row => row.entityType === "container" && row.sourceLocalId === f.input.sourceId);
  assert.equal(f.state.containers[root.localId].parentId, "");
  assert.equal(f.api().activateAdminPublishedLayout(legacy.layoutId, { remember: false }), true);
  assert.equal(f.state.activeLayoutId, legacy.layoutId); assertCollectionRefs(f.state, refs);
  assert.deepEqual(protectedBytes(f), namespaces); assert.equal(privateBytes(f.state), privateBefore);
  assert.deepEqual(f.state.packedItems, { [legacy.itemId]: true }, "ordinary active layout keeps its own packed display");
  assert.equal(f.values.has(key), false); assertNoColdPointer(f);
  assert.equal(await f.api().openCausalAdminTemplate(routeTarget(f), { remember: false }), refs.layouts.map[f.layoutId], f.routes.errors[0]?.stack);
  assert.deepEqual(f.routes.errors, []); await accepted(f, record); assertCollectionRefs(f.state, refs);
  assert.deepEqual(protectedBytes(f), namespaces); assert.equal(privateBytes(f.state), privateBefore);
  assert.deepEqual(protectedBytes(f, JSON.parse(f.values.get("mirror"))), namespaces);
  assert.equal(f.state.containers[root.localId].parentId, ""); assertNoColdPointer(f); assertRetained(f, history);
  assert.deepEqual(f.state.packedItems, f.state.layouts[f.layoutId].arrangement.packedItems);
  assert.equal(f.routes.capture, 0); assert.equal(f.routes.flush, 0);
  assert.ok(f.http.calls.slice(calls).every(row => row.method === "GET"));
  assert.equal(f.http.treePosts.length, 1); assert.equal(f.http.stagePosts.length, 4); assert.equal(f.http.ordinaryPosts.length, 0);
  assert.equal(f.held.size, 0);
});

test("actual legacy activation retains original-state quantity repair and packed data while missing-arrangement fallback excludes protected roots", async () => {
  const f = await treeAcceptanceAppFixture({ routing: true, arrangement: true }); turnTreeWritesOff(f); f.reset();
  for (const storedArrangement of [true, false]) {
    const state = copy(f.state); state.items.privateItem.containerId = "";
    const legacy = addTreeRoutingLegacyLayout(state, f.binding, { causal: false, storedArrangement });
    state.activeLayoutId = legacy.layoutId; state.packedItems = { [legacy.itemId]: true };
    const refs = collectionRefs(state), namespaces = protectedBytes(f, state), privateBefore = privateBytes(state);
    assert.equal(layoutItemQuantityMigrationRecovered(state), false);
    f.api().applyLayoutArrangement(legacy.layoutId, state);
    assertCollectionRefs(state, refs); assert.deepEqual(protectedBytes(f, state), namespaces); assert.equal(privateBytes(state), privateBefore);
    assert.deepEqual(legacy.layout.rootContainerIds, [legacy.rootId]);
    assert.deepEqual(Object.keys(legacy.layout.arrangement.containers), [legacy.rootId]);
    assert.deepEqual(legacy.layout.arrangement.items, { [legacy.itemId]: legacy.rootId });
    assert.equal(legacy.layout.arrangement.itemQuantities[legacy.itemId], 7);
    assert.equal(legacy.layout.arrangement.itemQuantityMigrationVersion, 3);
    assert.equal(layoutItemQuantityMigrationRecovered(state), storedArrangement,
      "the real migration marks the original state only for the old captured quantity of one");
    assert.equal(state.items[legacy.itemId].containerId, legacy.rootId);
    assert.deepEqual(state.packedItems, { [legacy.itemId]: true });
    const after = copy(state); f.api().applyLayoutArrangement(legacy.layoutId, state); assert.deepEqual(state, after);
  }
  assert.deepEqual(f.http.calls, []); assert.equal(f.held.size, 0);
});

test("actual legacy activation restores original maps after a real repair throw and rejects external protected links before effects", async () => {
  const f = await treeAcceptanceAppFixture({ routing: true, arrangement: true }); turnTreeWritesOff(f); f.reset();
  const state = f.state; state.items.privateItem.containerId = "";
  const legacy = addTreeRoutingLegacyLayout(state, f.binding, { causal: false }); state.activeLayoutId = legacy.layoutId;
  state.packedItems = { [legacy.itemId]: true };
  const refs = collectionRefs(state), namespaces = protectedBytes(f), privateBefore = privateBytes(state);
  Object.freeze(legacy.layout.arrangement.containers[legacy.rootId]);
  assert.throws(() => f.api().applyLayoutArrangement(legacy.layoutId, state), TypeError);
  assertCollectionRefs(state, refs); assert.deepEqual(protectedBytes(f), namespaces); assert.equal(privateBytes(state), privateBefore);
  // A genuine failed normalization must not leave the app's applying flag set.
  legacy.layout.arrangement.containers[legacy.rootId] = copy(legacy.layout.arrangement.containers[legacy.rootId]);
  const priorArrangement = legacy.layout.arrangement;
  f.api().captureActiveLayoutArrangement(state);
  assert.notEqual(legacy.layout.arrangement, priorArrangement); assert.deepEqual(legacy.layout.arrangement.packedItems, { [legacy.itemId]: true });
  const protectedRoot = state.layouts[f.layoutId].rootContainerIds[0];
  state.items.privateItem.containerId = protectedRoot;
  const beforeInvalidApply = copy(state);
  assert.throws(() => f.api().applyLayoutArrangement(legacy.layoutId, state), error => error.code === "admin-template-photo-tree-copy-projection-paused");
  assert.deepEqual(state, beforeInvalidApply, "an external link cannot be repaired away before the scope check");
  assertCollectionRefs(state, refs); assert.deepEqual(protectedBytes(f), namespaces);
  assert.deepEqual(f.http.calls, []); assert.equal(f.held.size, 0);
});

const routeTarget = f => ({ type: "shared", sharedId: f.binding.listId.slice("public-shared-layout-".length) });
const turnTreeWritesOff = f => { for (const name of ["tree", "copy", "create", "append"]) f.flags[name] = false; };
const assertNoColdPointer = f => {
  const layout = f.state.layouts[f.layoutId];
  assert.equal(layout.adminCausalSource.planId, null);
  assert.equal(Object.hasOwn(layout.adminCausalSource, "photoTreeCopyPending"), false);
  assert.equal(Object.hasOwn(layout, "templateDraftSyncPending"), false);
};
const routedColdQuota = async () => {
  const f = await treeAcceptanceAppFixture({ routing: true });
  f.controls.rejectWrite = key => key.startsWith(ADMIN_TEMPLATE_PHOTO_TREE_COPY_ACCEPTANCE_PREFIX);
  await assert.rejects(f.submit(), /Quota/); const record = f.notifications[0];
  const key = adminTemplatePhotoTreeCopyAcceptanceKey(record.binding, record.action.operationId);
  assert.equal(f.values.has(key), false); assert.equal(f.http.treePosts.length, 1);
  f.controls.rejectWrite = null; turnTreeWritesOff(f); f.cold(); assertNoColdPointer(f);
  assert.equal(f.state.layouts[f.layoutId].adminCausalSource.base.stateRevision, record.action.body.base.stateRevision + 1);
  return { f, record, key };
};
const enterColdRoute = async (f, entry) => entry === "open"
  ? f.api().openCausalAdminTemplate(routeTarget(f), { remember: false })
  : f.api().runSyncNow({ force: true });

test("actual cold open and forced Sync discover mirror-only acceptance at numeric base with all photo writers OFF", async () => {
  for (const entry of ["open", "sync"]) {
    const { f, record, key } = await routedColdQuota();
    const before = copy(f.state), mirror = f.values.get("mirror"), history = retained(f), calls = f.http.calls.length;
    let acceptanceWrites = 0;
    f.controls.rejectWrite = name => { if (name === key) acceptanceWrites++; return false; };
    const result = await enterColdRoute(f, entry);
    if (entry === "open") {
      assert.equal(result, f.state.layouts[f.layoutId]); assert.equal(f.routes.dialogs.length, 0);
    } else {
      assert.equal(f.routes.dialogs.length, 1);
      assert.equal(result.info.recoveryKind, "photo-tree-copy"); assert.equal(result.info.committedCount, 1);
      assert.equal(result.info.canResume, true); assert.equal(result.info.canCompare, false);
      assert.equal(f.values.has(key), false, "showing the existing recovery window is read-only");
      assert.equal((await result.work.resume()).applied, true);
    }
    await accepted(f, record); assert.equal(acceptanceWrites, 1);
    assert.deepEqual(f.state, before); assert.equal(f.values.get("mirror"), mirror); assertRetained(f, history);
    assert.equal(f.routes.capture, 0); assert.equal(f.routes.flush, 0); assert.deepEqual(f.routes.fallback, []);
    assert.deepEqual(f.routes.errors, []); assert.equal(f.http.treePosts.length, 1); assert.equal(f.http.stagePosts.length, 4);
    assert.equal(f.http.ordinaryPosts.length, 0); assert.ok(f.http.calls.slice(calls).every(row => row.method === "GET"));
    assert.equal(f.idb.rows().size, 1); assert.equal(f.held.size, 0);
  }
});

test("actual cold open without V9 performs no capture or flush and forced Sync retains its ordinary route", async () => {
  const f = await treeAcceptanceAppFixture({ routing: true }); turnTreeWritesOff(f); f.cold(); assertNoColdPointer(f);
  const before = copy(f.state), mirror = f.values.get("mirror");
  assert.equal(f.idb.rows().size, 0); assert.equal(f.api().adminTemplateSaveCoordinator().hasPendingCapture(f.layoutId), false);
  assert.equal(await enterColdRoute(f, "open"), f.state.layouts[f.layoutId]);
  assert.equal(await enterColdRoute(f, "sync"), "ordinary-sync-fallback");
  assert.equal(f.routes.capture, 0); assert.equal(f.routes.flush, 0); assert.equal(f.routes.recover, 1);
  assert.deepEqual(f.routes.fallback, [{ force: true }]); assert.deepEqual(f.routes.dialogs, []); assert.deepEqual(f.routes.errors, []);
  assert.deepEqual(f.http.calls, []); assert.deepEqual(f.state, before); assert.equal(f.values.get("mirror"), mirror);
  assert.equal(f.idb.rows().size, 0); assert.equal(f.held.size, 0);
});

test("actual cold open and forced Sync do not repeat an already accepted V9 or rewrite its retained proof", async () => {
  const f = await treeAcceptanceAppFixture({ routing: true }); await f.submit(); const record = f.notifications[0];
  await accepted(f, record); turnTreeWritesOff(f); f.cold(); assertNoColdPointer(f);
  const key = adminTemplatePhotoTreeCopyAcceptanceKey(record.binding, record.action.operationId), raw = f.values.get(key);
  const before = copy(f.state), mirror = f.values.get("mirror"), history = retained(f), calls = f.http.calls.length;
  f.controls.rejectWrite = name => { assert.notEqual(name, key, "an accepted UUID must not rewrite acceptance on discovery"); return false; };
  const captures = f.routes.capture, flushes = f.routes.flush;
  assert.equal(await enterColdRoute(f, "open"), f.state.layouts[f.layoutId]);
  assert.equal(await enterColdRoute(f, "sync"), "ordinary-sync-fallback");
  assert.equal(f.values.get(key), raw); assert.equal(f.routes.capture, captures); assert.equal(f.routes.flush, flushes);
  assert.deepEqual(f.routes.dialogs, []); assert.deepEqual(f.routes.errors, []); assert.equal(f.http.calls.length, calls);
  assert.deepEqual(f.state, before); assert.equal(f.values.get("mirror"), mirror); assertRetained(f, history);
  assert.equal(f.http.treePosts.length, 1); assert.equal(f.http.stagePosts.length, 4); assert.equal(f.http.ordinaryPosts.length, 0);
  assert.equal(f.held.size, 0);
});

test("actual cold routing rejects a new session after full discovery before showing or completing acceptance", async () => {
  for (const entry of ["open", "sync"]) {
    const { f, record, key } = await routedColdQuota();
    const before = copy(f.state), mirror = f.values.get("mirror"), history = retained(f), calls = f.http.calls.length;
    let switched = false;
    f.routes.afterDiscovery = found => {
      assert.equal(found.action.operationId, record.action.operationId);
      switched = true; f.current.generation += ":different-session-after-discovery";
    };
    if (entry === "open") {
      assert.equal(await enterColdRoute(f, entry), null);
      assert.equal(f.routes.errors.length, 1); assert.match(f.routes.errors[0].message, /Контекст/i);
    } else await assert.rejects(enterColdRoute(f, entry), /Контекст/i);
    assert.equal(switched, true); assert.equal(f.values.has(key), false);
    assert.deepEqual(f.routes.dialogs, []); assert.deepEqual(f.routes.fallback, []);
    assert.equal(f.routes.capture, 0); assert.equal(f.routes.flush, 0);
    assert.deepEqual(f.state, before); assert.equal(f.values.get("mirror"), mirror); assertRetained(f, history);
    assert.equal(f.http.calls.length, calls); assert.equal(f.http.treePosts.length, 1); assert.equal(f.http.stagePosts.length, 4);
    assert.equal(f.http.ordinaryPosts.length, 0); assert.equal(f.held.size, 0);
  }
});
