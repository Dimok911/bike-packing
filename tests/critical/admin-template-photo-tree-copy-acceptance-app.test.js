import test from "node:test";
import assert from "node:assert/strict";
import { treeAcceptanceAppFixture } from "../fixtures/admin-template-photo-tree-copy-form-fixture.js";
import { adminTemplatePhotoNamespace } from "../../src/public/admin-template-photo-state.js";
import { adminTemplatePhotoTreeCopyAcceptanceKey, ADMIN_TEMPLATE_PHOTO_TREE_COPY_ACCEPTANCE_PREFIX } from "../../src/public/admin-template-photo-tree-copy-acceptance.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { AMBIGUOUS_WRITE_KEY } from "../../src/sync/experiment-transport.js";

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
