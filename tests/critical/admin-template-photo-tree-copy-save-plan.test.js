import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { treeCopyClientFixture as fixture, copy, hash } from "../fixtures/admin-template-photo-tree-copy-client-fixture.js";
import { canonicalTemplateJson as canonical, adminTemplateIntent } from "../../src/sync/admin-template-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED } from "../../src/sync/admin-template-photo-tree-copy-protocol.js";
import { adminTemplatePhotoCopySavePlan as v1Plan } from "../../src/sync/admin-template-photo-copy-save-plan.js";
import { adminTemplatePhotoCopyIntent as v1Intent } from "../../src/sync/admin-template-photo-copy-protocol.js";
import { adminTemplateDataSourceSnapshot } from "../../src/sync/admin-template-save-plan.js";
import { adminTemplatePhotoTreeCopyEditorSnapshot as editor, adminTemplatePhotoTreeCopySavePlan as makePlan,
  readAdminTemplatePhotoTreeCopyRecord as readRecord, assertAdminTemplatePhotoTreeCopyPlanRecord as assertRecord,
  projectAdminTemplatePhotoTreeCopyPlanResult as project } from "../../src/sync/admin-template-photo-tree-copy-save-plan.js";

const request = f => ({ binding: copy(f.binding), operationId: f.id, body: copy(f.record.action.body),
  editorSnapshot: editor(f.record), recordIntentHash: f.record.intentHash });
const proof = (f, plan = makePlan(request(f))) => ({ plan, store: f.store, receipt: copy(f.receipt), stageReceipts: copy(f.stages) });
const noEffects = f => {
  assert.deepEqual(f.server.calls, []); assert.equal(f.values.size, 0);
  assert.equal(f.idb.rows("stage-dispatches").size, 0); assert.equal(f.idb.rows().size, 1);
};
const changed = value => { throw Object.assign(Error("Context changed"), { code: value }); };

test("V9 preserves exact target-before and all allocations without creating optimistic owners or enabling any gate", async () => {
  const f = await fixture(), original = copy(f.record), input = request(f), plan = makePlan(input);
  assert.equal(ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED, false); assert.equal(plan.version, 9);
  assert.deepEqual(Object.keys(plan).sort(), ["binding", "editorSnapshot", "id", "operations", "recordIntentHash", "version"]);
  assert.deepEqual(plan.operations, [f.intent]); assert.deepEqual(await assertRecord(plan, f.store), original);
  assert.deepEqual(plan.editorSnapshot, editor(original));
  for (const owner of original.snapshot.copiedOwners) for (const type of ["layouts", "items", "containers"])
    assert.equal(Object.hasOwn(plan.editorSnapshot.payload[type], owner.localId), false);
  input.body.photoCopy.fields.name = "later"; input.editorSnapshot.payload.items = {}; input.binding.actorId = "changed";
  assert.deepEqual(plan.operations, [f.intent]); assert.deepEqual(await assertRecord(plan, f.store), original); noEffects(f);
});

test("raw full projection preserves source, target originals, opaque data, root insertion and mappings including photo-free owners", async () => {
  const f = await fixture(), args = proof(f), before = copy({ plan: args.plan, record: f.record, receipt: args.receipt, stages: args.stageReceipts });
  const result = await project(args), c = f.intent.body.photoCopy, payload = result.confirmedPayload;
  assert.deepEqual(result, { recordIntentHash: f.record.intentHash, source: f.record.snapshot.source, target: f.record.snapshot.target,
    copiedOwners: f.record.snapshot.copiedOwners, confirmedPayload: f.receipt.result.payload.photoCopy.confirmedPayload,
    stateRevision: 12, metadata: f.record.snapshot.target.metadata });
  assert.equal(result.copiedOwners.length, 5); assert.ok(c.owners.some(owner => owner.photos.length === 0));
  for (const owner of c.owners) {
    const type = owner.entityType === "item" ? "items" : "containers", raw = c.source.payload[type][owner.sourceEntityId], row = payload[type][owner.entityId];
    assert.deepEqual(row.opaque, raw.opaque); assert.equal(row.photos?.length || 0, owner.photos.length);
    assert.ok(result.copiedOwners.some(selected => selected.serverId === owner.entityId));
  }
  for (const type of ["items", "containers"]) for (const [id, row] of Object.entries(f.intent.body.payload[type])) assert.deepEqual(payload[type][id], row);
  const root = c.owners.find(owner => owner.sourceEntityId === c.source.rootId).entityId;
  assert.deepEqual(payload.layouts[c.placement.layoutId].rootContainerIds, ["target-bag", root]);
  assert.deepEqual(payload.layouts[c.placement.layoutId].arrangement.rootContainerIds, ["target-bag", root]);
  assert.deepEqual(payload.layouts[c.placement.layoutId].arrangement.packedItems, { "target-item": true });
  assert.deepEqual(payload.layouts[c.placement.layoutId].arrangement.opaque, f.intent.body.payload.layouts[c.placement.layoutId].arrangement.opaque);
  assert.deepEqual(payload.layouts[c.placement.layoutId].locations, ["raw divergent mirror"]);
  assert.deepEqual(payload.locations, ["target dictionary"]);
  assert.deepEqual(args.plan, before.plan); assert.deepEqual(f.record, before.record); assert.deepEqual(args.receipt, before.receipt); assert.deepEqual(args.stageReceipts, before.stages);
  result.source.beforeState.items = {}; result.copiedOwners[0].localId = "mutated-output"; result.confirmedPayload.items = {};
  assert.deepEqual((await project(args)).confirmedPayload, before.receipt.result.payload.photoCopy.confirmedPayload); noEffects(f);
});

test("OFF cold typed read and historical unavailable stages can prove only an already committed result", async () => {
  const f = await fixture(), plan = makePlan(request(f)), offStore = f.makeStore({ enabled: false }), stages = copy(f.stages);
  stages.forEach(stage => { stage.assetState = "unavailable"; });
  assert.deepEqual(await readRecord(offStore, plan.operations[0], plan.recordIntentHash), f.record);
  assert.deepEqual((await project({ plan, store: offStore, receipt: f.receipt, stageReceipts: stages })).confirmedPayload,
    f.receipt.result.payload.photoCopy.confirmedPayload);
  noEffects(f);
});

test("a read re-prepares every decoded byte instead of trusting a record hash, optimistic snapshot or allocation list", async () => {
  const f = await fixture(), plan = makePlan(request(f));
  for (const mutate of [
    record => { Object.values(record.snapshot.source.beforeState.items)[0].name = "dirty source"; },
    record => { record.snapshot.target.beforeState.packedItems = {}; },
    record => { record.snapshot.copiedOwners.pop(); },
    record => { record.snapshot.copiedOwners.reverse(); },
    record => { record.snapshot.copiedOwners[0].localId = record.snapshot.target.layoutId; },
    record => { record.snapshot.target.beforeState.containers[record.snapshot.copiedOwners[0].localId] = { id: record.snapshot.copiedOwners[0].localId }; },
    record => { record.stages[0].target.entityId = "foreign"; },
    record => { record.receipt = f.receipt; }
  ]) {
    const record = copy(f.record); mutate(record);
    await assert.rejects(assertRecord(plan, { binding: f.binding, read: async () => record }));
  }
  noEffects(f);
});

test("cold native-format corruption remains rejected even with a recomputed full record hash and matching plan pointer", async () => {
  const f = await fixture(), plan = makePlan(request(f)), [key, raw] = [...f.idb.rows()][0], envelope = JSON.parse(raw.intentJson);
  Object.values(envelope.snapshot.source.beforeState.items)[0].name = "unsent source change";
  const intentJson = canonical(envelope), intentHash = createHash("sha256").update(intentJson).digest("hex");
  f.idb.rows().set(key, { ...raw, intentJson, intentHash }); plan.recordIntentHash = intentHash;
  await assert.rejects(assertRecord(plan, f.store)); await assert.rejects(project(proof(f, plan))); noEffects(f);
});

test("missing or mismatched tree store binding cannot disclose or accept a foreign decoded record", async () => {
  const f = await fixture(), plan = makePlan(request(f)); let calls = 0;
  for (const binding of [undefined, { ...f.binding, actorId: "foreign" }, { ...f.binding, listId: "public-shared-layout-other", itemKey: "shared-layout:other" }]) {
    await assert.rejects(assertRecord(plan, { binding, read: async () => { calls++; return f.record; } }));
  }
  assert.equal(calls, 0); await assert.rejects(assertRecord(plan, { binding: f.binding, read: async () => null })); noEffects(f);
});

test("V9 exact grammar rejects changed IDs, body, pointer, before-view, extra operations and cross-kind versions", async () => {
  const f = await fixture(), plan = makePlan(request(f));
  for (const mutate of [
    value => { value.id = randomUUID(); }, value => { value.operations[0].actorId = "foreign"; },
    value => { value.operations[0].body.photoCopy.fields.name = "different tree"; },
    value => { value.recordIntentHash = "f".repeat(64); },
    value => { value.editorSnapshot.payload.locations.push("unsaved"); },
    value => { value.editorSnapshot.metadata.title = "different"; },
    value => { value.operations.push(copy(value.operations[0])); }, value => { value.version = 8; },
    value => { value.version = 7; }, value => { value.optimistic = true; }
  ]) { const value = copy(plan); mutate(value); await assert.rejects(assertRecord(value, f.store)); }
  assert.throws(() => makePlan({ ...request(f), enabled: true }));
  assert.throws(() => adminTemplateIntent({ ...f.binding, ...f.record.action }));
  assert.throws(() => v1Intent(f.intent)); assert.throws(() => v1Plan(request(f)));
  assert.throws(() => adminTemplateDataSourceSnapshot(plan)); noEffects(f);
});

test("wrong terminal identity, revision, visibility or a partial raw projection never becomes an adoptable package", async () => {
  const f = await fixture();
  for (const mutate of [
    receipt => { receipt.operation.id = randomUUID(); }, receipt => { receipt.operation.actorId = "foreign"; },
    receipt => { receipt.operation.payloadDigest = "0".repeat(64); }, receipt => { receipt.result.payload.stateRevision++; },
    receipt => { receipt.result.payload.visibility = "public"; }, receipt => { receipt.result.payload.photoCopy.owners.pop(); },
    receipt => { delete receipt.result.payload.photoCopy.confirmedPayload.opaque; receipt.result.payload.photoCopy.confirmedPayloadDigest = hash(receipt.result.payload.photoCopy.confirmedPayload); },
    receipt => { const payload = receipt.result.payload.photoCopy.confirmedPayload; payload.layouts["target-layout"].rootContainerIds.reverse(); receipt.result.payload.photoCopy.confirmedPayloadDigest = hash(payload); },
    receipt => { receipt.result.payload.photoCopy.confirmedPayloadDigest = "f".repeat(64); }
  ]) { const args = proof(f); mutate(args.receipt); await assert.rejects(project(args)); }
  noEffects(f);
});

test("all stage proofs are required in exact order and cannot be replaced by booleans or a V1 receipt", async () => {
  const f = await fixture();
  for (const mutate of [
    args => { args.stageReceipts.pop(); }, args => { args.stageReceipts.reverse(); }, args => { args.stageReceipts = true; },
    args => { args.stageReceipts[0].receipt.version = 1; args.stageReceipts[0].receipt.kind = "admin-template-photo-copy"; },
    args => { args.stageReceipts[0].receipt.sourceOwnedBytes = true; },
    args => { args.stageReceipts[0].receipt.manifest.source.baseStateRevision++; },
    args => { args.stageReceipts[0].receipt.manifest.target.entityId = "foreign"; },
    args => { args.stageReceipts[0].receipt.stored.file.hash = "f".repeat(64); }
  ]) { const args = proof(f); mutate(args); await assert.rejects(project(args)); }
  noEffects(f);
});

test("cross-owner source/target and target/target path aliases fail despite each independently valid local stage", async () => {
  const f = await fixture();
  for (const other of ["source", "target"]) {
    const args = proof(f);
    args.stageReceipts[1].receipt.materialization.target.filePathDigest = args.stageReceipts[0].receipt.materialization[other].filePathDigest;
    await assert.rejects(project(args));
  }
  const args = proof(f), extension = args.receipt.result.payload.photoCopy, added = extension.owners.flatMap(owner => owner.added);
  added[0].photo.url = "https://attacker.example/file";
  extension.confirmedPayload.containers[extension.owners[0].entityId].photos[0].url = added[0].photo.url;
  extension.confirmedPayloadDigest = hash(extension.confirmedPayload);
  await assert.rejects(project(args)); noEffects(f);
});

test("unknown, rejected and strong cancelled receipts do not project or grant retirement authority", async () => {
  const f = await fixture();
  for (const code of ["source_changed", "operation_cancelled"]) {
    const args = proof(f); args.receipt.operation.state = "rejected";
    args.receipt.result = { status: 409, payload: { ok: false, code, ...(code === "operation_cancelled" ? { cancellation: {
      version: 1, operationId: f.id, noBusinessEffects: true, operationCannotApply: true } } : {}) } };
    await assert.rejects(project(args));
  }
  const args = proof(f); args.receipt = { operation: { id: f.id, state: "unknown" } }; await assert.rejects(project(args)); noEffects(f);
});

test("caller mutations after the first await cannot reinterpret a plan, receipt, paths or all-owner mappings", async () => {
  const f = await fixture(), args = proof(f), original = copy({ plan: args.plan, receipt: args.receipt, stages: args.stageReceipts });
  const pending = project(args);
  args.plan.operations[0].body.photoCopy.fields.name = "later"; args.plan.binding.actorId = "changed";
  args.receipt.result.payload.photoCopy.confirmedPayload.items = {}; args.stageReceipts[0].receipt.materialization.target.filePathDigest = "0".repeat(64);
  const result = await pending;
  assert.deepEqual(result.confirmedPayload, original.receipt.result.payload.photoCopy.confirmedPayload);
  assert.deepEqual(result.copiedOwners, f.record.snapshot.copiedOwners);
  const plan = copy(original.plan), reading = assertRecord(plan, f.store); plan.editorSnapshot.payload.items = {};
  assert.deepEqual(await reading, f.record); noEffects(f);
});

test("context and store-binding changes across record awaits stop before exposing a confirmation", async () => {
  const f = await fixture(), plan = makePlan(request(f)); let current = true;
  const guard = () => { if (!current) changed("changed-scope"); };
  const store = { binding: copy(f.binding), async read() { current = false; return f.record; } };
  await assert.rejects(project({ ...proof(f, plan), store }, guard), { code: "changed-scope" });
  store.read = async () => { store.binding.actorId = "foreign"; return f.record; };
  await assert.rejects(assertRecord(plan, store)); noEffects(f);
});

test("retained record must still exist byte-exact after asynchronous receipt proof", async () => {
  const f = await fixture(), plan = makePlan(request(f));
  for (const fault of ["missing", "changed"]) {
    let reads = 0;
    const store = { binding: f.binding, async read() {
      reads++;
      if (reads === 1) return f.record;
      if (fault === "missing") return null;
      const row = copy(f.record); row.snapshot.copiedOwners[0].localId = "replaced-after-await"; return row;
    } };
    await assert.rejects(project({ ...proof(f, plan), store })); assert.equal(reads, 2);
  }
  noEffects(f);
});
