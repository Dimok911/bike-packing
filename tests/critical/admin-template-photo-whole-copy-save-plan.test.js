import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { wholeCopyReceiptFixture, cancelWholeReceipt, copy, hash } from "../fixtures/admin-template-photo-whole-copy-receipt-fixture.js";
import { wholeRecordInput, wholeStoreFixture } from "../fixtures/admin-template-photo-whole-copy-record-fixture.js";
import { canonicalTemplateJson as canonical, adminTemplateIntent, ADMIN_TEMPLATE_OPERATIONS_ENABLED } from "../../src/sync/admin-template-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED } from "../../src/sync/admin-template-photo-whole-copy-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED } from "../../src/sync/admin-template-photo-append-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED } from "../../src/sync/admin-template-photo-create-protocol.js";
import { ADMIN_TEMPLATE_PHOTO_COPY_ENABLED } from "../../src/sync/admin-template-photo-copy-protocol.js";
import { adminTemplatePhotoTreeCopySavePlan } from "../../src/sync/admin-template-photo-tree-copy-save-plan.js";
import { adminTemplateDataSourceSnapshot } from "../../src/sync/admin-template-save-plan.js";
import { validateAdminTemplatePhotoWholeCopyReceipt } from "../../src/sync/admin-template-photo-whole-copy-receipt.js";
import { adminTemplatePhotoWholeCopySourceEditorSnapshot as editor, adminTemplatePhotoWholeCopySavePlan as makePlan,
  readAdminTemplatePhotoWholeCopyRecord as readRecord, assertAdminTemplatePhotoWholeCopyPlanRecord as assertRecord,
  projectAdminTemplatePhotoWholeCopyPlanResult as project } from "../../src/sync/admin-template-photo-whole-copy-save-plan.js";

async function fixture() {
  const f = await wholeCopyReceiptFixture(), stored = await wholeStoreFixture({ recordInput: await wholeRecordInput({ protocolInput: f.input }) });
  await stored.store.capture(stored.value);
  stored.idb.transactions.length = 0; stored.idb.requests.length = 0;
  return { ...f, ...stored, binding: stored.input.binding, id: f.intent.id, record: stored.prepared };
}
const request = f => ({ binding: copy(f.binding), operationId: f.id, body: copy(f.record.action.body),
  sourceEditorSnapshot: editor(f.record), recordIntentHash: f.record.intentHash });
const proof = (f, plan = makePlan(request(f))) => ({ plan, store: f.store, receipt: copy(f.receipt), stageReceipts: copy(f.stages) });
const readOnly = f => {
  assert.ok(f.idb.transactions.every(tx => tx.mode === "readonly"));
  assert.ok(f.idb.requests.every(row => !["add", "put", "delete"].includes(row.operation)));
  assert.equal(f.idb.rows("stage-dispatches").size, 0);
};

test("V10 keeps source metadata separate from renamed target and never fabricates a target before-state", async () => {
  const f = await fixture(), original = copy(f.record), input = request(f), plan = makePlan(input);
  assert.deepEqual([ADMIN_TEMPLATE_OPERATIONS_ENABLED, ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED, ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED,
    ADMIN_TEMPLATE_PHOTO_COPY_ENABLED, ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED], [false, false, false, false, false]);
  assert.equal(plan.version, 10);
  assert.deepEqual(Object.keys(plan).sort(), ["binding", "id", "operations", "recordIntentHash", "sourceEditorSnapshot", "version"]);
  assert.deepEqual(plan.operations, [f.intent]); assert.equal(plan.operations[0].kind, "template.copy");
  assert.equal(plan.operations[0].body.base, null); assert.equal(plan.operations[0].body.source.base.stateRevision, 7);
  assert.equal(plan.sourceEditorSnapshot.metadata.title, "Whole source"); assert.equal(plan.operations[0].body.metadata.title, "Whole copy");
  assert.equal(plan.sourceEditorSnapshot.metadata.language, "en"); assert.equal(plan.operations[0].body.metadata.language, "ru");
  assert.deepEqual(Object.keys(original.snapshot.target).sort(), ["layoutId", "metadata", "serverLayoutId"]);
  assert.equal(Object.hasOwn(plan.sourceEditorSnapshot.payload.layouts, original.snapshot.target.layoutId), false);
  for (const owner of original.snapshot.copiedOwners) for (const type of ["layouts", "items", "containers"])
    assert.equal(Object.hasOwn(plan.sourceEditorSnapshot.payload[type], owner.localId), false);
  input.body.metadata.title = "later"; input.sourceEditorSnapshot.payload.items = {}; input.binding.actorId = "changed";
  assert.deepEqual(await assertRecord(plan, f.store), original); assert.deepEqual(plan.operations, [f.intent]); readOnly(f);
});

test("raw result contains the complete new catalog, original status/packed/opaque data and all local mappings", async () => {
  const f = await fixture(), args = proof(f), before = copy({ record: f.record, args: { plan: args.plan, receipt: args.receipt, stageReceipts: args.stageReceipts } });
  const result = await project(args), owners = f.intent.body.photoCopy.owners, payload = result.confirmedPayload;
  assert.deepEqual(result, { recordIntentHash: f.record.intentHash, source: f.record.snapshot.source, target: f.record.snapshot.target,
    copiedOwners: f.record.snapshot.copiedOwners, confirmedPayload: f.receipt.result.payload.photoCopy.confirmedPayload,
    stateRevision: 1, metadata: f.record.snapshot.target.metadata });
  assert.equal(owners.length, 11); assert.equal(result.copiedOwners.length, 11); assert.ok(owners.some(owner => owner.photos.length === 0));
  assert.equal(f.receipt.result.payload.photoCopy.ownerId, f.binding.actorId);
  assert.notEqual(f.receipt.result.payload.photoCopy.sourceOwnerId, f.binding.actorId);
  for (const owner of owners) {
    const type = owner.entityType === "item" ? "items" : "containers";
    const source = f.sourcePayload[type][owner.sourceEntityId], row = payload[type][owner.entityId];
    assert.deepEqual(row.opaque, source.opaque); assert.equal(row.photos?.length || 0, owner.photos.length);
    if (type === "items") assert.equal(row.availabilityStatus, source.availabilityStatus);
    assert.ok(result.copiedOwners.some(selected => selected.serverId === owner.entityId));
  }
  assert.deepEqual(Object.keys(payload.layouts), [`layout-${f.id}`]);
  assert.deepEqual(payload.opaqueTop, f.sourcePayload.opaqueTop);
  assert.deepEqual(payload.layouts[`layout-${f.id}`].arrangement.opaqueArrangement, f.sourcePayload.layouts["source-layout"].arrangement.opaqueArrangement);
  const itemB = owners.find(owner => owner.sourceEntityId === "item-b").entityId;
  assert.equal(payload.layouts[`layout-${f.id}`].arrangement.packedItems[itemB], true);
  assert.deepEqual(payload.layouts[`layout-${f.id}`].locations, ["Distinct layout mirror"]);
  assert.deepEqual(payload.locations, ["Raw place"]);
  assert.deepEqual(f.record, before.record); assert.deepEqual({ plan: args.plan, receipt: args.receipt, stageReceipts: args.stageReceipts }, before.args);
  result.source.beforeState.items = {}; result.target.metadata.title = "later"; result.confirmedPayload.items = {};
  assert.deepEqual((await project(args)).confirmedPayload, before.args.receipt.result.payload.photoCopy.confirmedPayload); readOnly(f);
});

test("cold OFF typed reads and historical unavailable stages prove a committed result without capture or dispatch", async () => {
  const f = await fixture(), plan = makePlan(request(f)), offStore = f.create({ enabled: false }), stages = copy(f.stages);
  stages.forEach(stage => { stage.assetState = "unavailable"; });
  assert.deepEqual(await readRecord(offStore, plan.operations[0], plan.recordIntentHash), f.record);
  assert.deepEqual((await project({ plan, store: offStore, receipt: f.receipt, stageReceipts: stages })).confirmedPayload,
    f.receipt.result.payload.photoCopy.confirmedPayload);
  assert.equal(f.idb.rows().size, 1); readOnly(f);
});

test("full typed record is rederived instead of trusting its hash, source proof or target allocations", async () => {
  const f = await fixture(), plan = makePlan(request(f));
  for (const mutate of [
    record => { Object.values(record.snapshot.source.beforeState.items)[0].name = "dirty source"; },
    record => { record.snapshot.source.ownerMap.owners.reverse(); },
    record => { record.snapshot.source.beforeState.layouts[record.snapshot.source.layoutId].adminCausalSource.wholePending = {}; },
    record => { record.snapshot.target.beforeState = { layouts: {}, items: {}, containers: {} }; },
    record => { record.snapshot.target.serverLayoutId = "wrong-layout"; },
    record => { record.snapshot.target.metadata.title = "wrong target"; },
    record => { record.snapshot.copiedOwners.pop(); }, record => { record.snapshot.copiedOwners.reverse(); },
    record => { record.snapshot.copiedOwners[0].localId = record.snapshot.target.layoutId; },
    record => { record.stages[0].target.entityId = "foreign"; },
    record => { record.action.body.source.payloadDigest = "f".repeat(64); },
    record => { record.action.body.photoCopy.owners.find(owner => owner.photos.length).photos[0].assetDigest = "f".repeat(64); },
    record => { record.receipt = f.receipt; }
  ]) {
    const record = copy(f.record); mutate(record);
    await assert.rejects(assertRecord(plan, { binding: f.binding, read: async () => record }));
  }
  readOnly(f);
});

test("cold native record corruption stays rejected with a recomputed envelope hash and matching plan pointer", async () => {
  const f = await fixture(), plan = makePlan(request(f)), [key, raw] = [...f.idb.rows()][0], envelope = JSON.parse(raw.intentJson);
  Object.values(envelope.snapshot.source.beforeState.items)[0].name = "unsent source";
  const intentJson = canonical(envelope), intentHash = createHash("sha256").update(intentJson).digest("hex");
  f.idb.rows().set(key, { ...raw, intentJson, intentHash }); plan.recordIntentHash = intentHash;
  await assert.rejects(assertRecord(plan, f.store)); await assert.rejects(project(proof(f, plan))); readOnly(f);
});

test("foreign/missing store binding blocks before reads and a missing record cannot be reconstructed from a receipt", async () => {
  const f = await fixture(), plan = makePlan(request(f)); let reads = 0;
  for (const binding of [undefined, { ...f.binding, actorId: "other" }, { ...f.binding, listId: f.intent.body.source.listId, itemKey: f.intent.body.source.itemKey }])
    await assert.rejects(assertRecord(plan, { binding, read: async () => { reads++; return f.record; } }));
  assert.equal(reads, 0);
  await assert.rejects(project({ ...proof(f), store: { binding: f.binding, read: async () => null } })); readOnly(f);
});

test("V10 exact grammar does not admit V3/V9, save/base-zero, extra fields or changed source comparison", async () => {
  const f = await fixture(), plan = makePlan(request(f));
  for (const mutate of [
    value => { value.id = randomUUID(); }, value => { value.operations[0].actorId = "foreign"; },
    value => { value.operations[0].kind = "template.save"; }, value => { value.operations[0].body.base = { stateRevision: 0 }; },
    value => { value.operations[0].body.base = { stateRevision: 1 }; }, value => { value.recordIntentHash = "f".repeat(64); },
    value => { value.sourceEditorSnapshot.metadata = copy(value.operations[0].body.metadata); },
    value => { value.sourceEditorSnapshot.payload.locations.push("unsaved"); },
    value => { value.editorSnapshot = value.sourceEditorSnapshot; delete value.sourceEditorSnapshot; },
    value => { value.operations.push(copy(value.operations[0])); }, value => { value.version = 9; },
    value => { value.version = 3; }, value => { value.optimistic = true; }
  ]) { const value = copy(plan); mutate(value); await assert.rejects(assertRecord(value, f.store)); }
  assert.throws(() => makePlan({ ...request(f), enabled: true }));
  assert.throws(() => adminTemplateIntent({ ...f.binding, ...f.record.action }));
  assert.throws(() => adminTemplatePhotoTreeCopySavePlan(request(f)));
  assert.throws(() => adminTemplateDataSourceSnapshot(plan)); readOnly(f);
});

test("forged terminal identity, target owner/revision or recomputed partial raw projection is not adoptable", async () => {
  const f = await fixture();
  for (const mutate of [
    receipt => { receipt.operation.id = randomUUID(); }, receipt => { receipt.operation.actorId = "foreign"; },
    receipt => { receipt.operation.kind = "template.save"; }, receipt => { receipt.operation.payloadDigest = "0".repeat(64); },
    receipt => { receipt.result.payload.stateRevision = 2; }, receipt => { receipt.result.payload.visibility = "public"; },
    receipt => { receipt.result.payload.photoCopy.ownerId = receipt.result.payload.photoCopy.sourceOwnerId; },
    receipt => { receipt.result.payload.photoCopy.layoutId = f.record.snapshot.target.layoutId; },
    receipt => { receipt.result.payload.photoCopy.owners.reverse(); }, receipt => { receipt.result.payload.photoCopy.owners.pop(); },
    receipt => { const result = receipt.result.payload.photoCopy; delete result.confirmedPayload.opaqueTop; result.confirmedPayloadDigest = hash(result.confirmedPayload); },
    receipt => { const result = receipt.result.payload.photoCopy; result.confirmedPayload.layouts[`layout-${f.id}`].arrangement.packedItems = {}; result.confirmedPayloadDigest = hash(result.confirmedPayload); },
    receipt => { receipt.result.payload.photoCopy.confirmedPayloadDigest = "f".repeat(64); }
  ]) { const args = proof(f); mutate(args.receipt); await assert.rejects(project(args)); }
  readOnly(f);
});

test("ordered complete V3 stage receipts are mandatory and V1/V2 or boolean assertions cannot replace them", async () => {
  const f = await fixture();
  for (const mutate of [
    args => { args.stageReceipts.pop(); }, args => { args.stageReceipts.reverse(); }, args => { args.stageReceipts = true; },
    args => { args.stageReceipts[0].receipt.version = 2; args.stageReceipts[0].receipt.kind = "admin-template-photo-tree-copy"; },
    args => { args.stageReceipts[0].receipt.version = 1; args.stageReceipts[0].receipt.kind = "admin-template-photo-copy"; },
    args => { args.stageReceipts[0].receipt.sourceOwnedBytes = true; },
    args => { args.stageReceipts[0].receipt.manifest.target.base = { stateRevision: 0 }; },
    args => { args.stageReceipts[0].receipt.manifest.source.baseStateRevision++; },
    args => { args.stageReceipts[0].receipt.stored.file.hash = "f".repeat(64); }
  ]) { const args = proof(f); mutate(args); await assert.rejects(project(args)); }
  readOnly(f);
});

test("cross-owner file aliases and a forged URL fail even when the final payload digest is recomputed", async () => {
  const f = await fixture();
  for (const side of ["source", "target"]) {
    const args = proof(f);
    args.stageReceipts[1].receipt.materialization.target.filePathDigest = args.stageReceipts[0].receipt.materialization[side].filePathDigest;
    await assert.rejects(project(args));
  }
  const args = proof(f), result = args.receipt.result.payload.photoCopy, owner = result.owners.find(value => value.added.length);
  owner.added[0].photo.url = "https://attacker.example/file";
  result.confirmedPayload[owner.entityType === "item" ? "items" : "containers"][owner.entityId].photos[0].url = owner.added[0].photo.url;
  result.confirmedPayloadDigest = hash(result.confirmedPayload);
  await assert.rejects(project(args)); readOnly(f);
});

test("valid rejected and strong-cancelled terminal facts never project, even with all stage proofs", async () => {
  const f = await fixture(), rejection = copy(f.receipt);
  rejection.operation.state = "rejected"; rejection.result = { status: 409, payload: { ok: false, code: "source_changed" } };
  for (const receipt of [rejection, cancelWholeReceipt(f)]) {
    assert.equal(await validateAdminTemplatePhotoWholeCopyReceipt(receipt, f.expected), true);
    await assert.rejects(project({ ...proof(f), receipt }));
  }
  await assert.rejects(project({ ...proof(f), receipt: { operation: { id: f.id, state: "unknown" } } })); readOnly(f);
});

test("caller mutations after first await cannot rewrite the source, target allocation or receipt being proved", async () => {
  const f = await fixture(), args = proof(f), original = copy({ plan: args.plan, receipt: args.receipt });
  const pending = project(args);
  args.plan.operations[0].body.metadata.title = "late target"; args.plan.sourceEditorSnapshot.payload.items = {};
  args.plan.binding.actorId = "foreign"; args.receipt.result.payload.photoCopy.confirmedPayload.items = {};
  args.stageReceipts[0].receipt.materialization.target.filePathDigest = "0".repeat(64);
  const result = await pending;
  assert.deepEqual(result.confirmedPayload, original.receipt.result.payload.photoCopy.confirmedPayload);
  assert.deepEqual(result.copiedOwners, f.record.snapshot.copiedOwners);
  const plan = copy(original.plan), reading = assertRecord(plan, f.store); plan.sourceEditorSnapshot.metadata.title = "late source";
  assert.deepEqual(await reading, f.record); readOnly(f);
});

test("context and store-binding changes across awaits stop before exposing any confirmation", async () => {
  const f = await fixture(), plan = makePlan(request(f)); let current = true;
  const guard = () => { if (!current) throw Object.assign(Error("Changed scope"), { code: "changed-scope" }); };
  const store = { binding: copy(f.binding), async read() { current = false; return f.record; } };
  await assert.rejects(project({ ...proof(f, plan), store }, guard), { code: "changed-scope" });
  store.read = async () => { store.binding.actorId = "foreign"; return f.record; };
  await assert.rejects(assertRecord(plan, store)); readOnly(f);
});

test("false and asynchronous guards cannot grant a record read or confirmation", async () => {
  const f = await fixture(), plan = makePlan(request(f)); let reads = 0;
  const store = { binding: f.binding, read: async () => { reads++; return f.record; } };
  for (const guard of [() => false, async () => true, async () => { throw Error("Invalid async scope"); }]) {
    await assert.rejects(assertRecord(plan, store, guard), { code: "admin-template-photo-whole-copy-plan-paused" });
    await assert.rejects(project({ ...proof(f), store }, guard), { code: "admin-template-photo-whole-copy-plan-paused" });
  }
  assert.equal(reads, 0); readOnly(f);
});

test("a disappearing or replaced record blocks both manifest readback and later receipt readback", async () => {
  const f = await fixture(), plan = makePlan(request(f));
  for (const atRead of [2, 3]) for (const fault of ["missing", "changed"]) {
    let reads = 0;
    const store = { binding: f.binding, async read() {
      reads++;
      if (reads < atRead) return f.record;
      if (fault === "missing") return null;
      const row = copy(f.record); row.snapshot.target.layoutId = "replaced-after-await"; return row;
    } };
    await assert.rejects(project({ ...proof(f, plan), store })); assert.equal(reads, atRead);
  }
  readOnly(f);
});


test("native proof uses full fresh row readback instead of decoding identical bytes again", async () => {
  const f = await fixture(), args = proof(f);
  assert.deepEqual(await assertRecord(args.plan, f.store), f.record);
  assert.equal(f.idb.transactions.length, 3, 'initial read, post-decode readback, post-derivation readback');
  f.idb.transactions.length = 0; f.idb.requests.length = 0;
  assert.deepEqual((await project(args)).confirmedPayload, f.receipt.result.payload.photoCopy.confirmedPayload);
  assert.equal(f.idb.transactions.length, 4, 'receipt verification ends with another fresh full-row transaction');
  assert.equal(f.idb.requests.filter(row => row.operation === 'get').length, 4);
  readOnly(f);
});

test("full raw readback catches deletion or any envelope-field change between derivation boundaries", async () => {
  for (const boundary of [1, 2, 3]) for (const field of ['delete', 'version', 'kind', 'key', 'bindingKey', 'intentJson', 'intentHash', 'extra']) {
    const f = await fixture(), args = proof(f), [key, raw] = [...f.idb.rows()][0];
    let commits = 0;
    f.idb.controls.onCommit = ({ mode }) => {
      if (mode !== 'readonly' || ++commits !== boundary) return;
      if (field === 'delete') f.idb.rows().delete(key);
      else f.idb.rows().set(key, { ...raw, [field]: field === 'version' ? 2 : String(raw[field] ?? '') + 'changed' });
    };
    await assert.rejects(project(args), undefined, field + ' at boundary ' + boundary);
    readOnly(f);
  }
});

test("raw readback rejects a different valid record under the same UUID and a context change", async () => {
  const { encodeAdminTemplatePhotoWholeCopyRecord } = await import('../../src/sync/admin-template-photo-whole-copy-record.js');
  for (const change of ['valid-replacement', 'context']) {
    const f = await fixture(), args = proof(f), [key] = [...f.idb.rows()][0];
    const input = copy(f.input); input.snapshot.target.layoutId += '-changed';
    const replacement = await encodeAdminTemplatePhotoWholeCopyRecord(input);
    let commits = 0;
    f.idb.controls.onCommit = ({ mode }) => { if (mode === 'readonly' && ++commits === 3) {
      if (change === 'context') f.context.generation = 'another-session';
      else f.idb.rows().set(key, replacement);
    } };
    await assert.rejects(project(args));
    readOnly(f);
  }
});

test("unbranded stores cannot provide their own unchanged-row authority", async () => {
  const { readWholeCopyActionSnapshot } = await import('../../src/sync/admin-template-photo-whole-copy-action-store.js');
  const f = await fixture(), args = proof(f); let reads = 0, forgedCalls = 0;
  const store = { binding: f.binding,
    async read() { reads++; return reads === 4 ? { ...f.record, intentHash: '0'.repeat(64) } : copy(f.record); },
    async readSnapshot() { forgedCalls++; return { record: f.record, assertUnchanged: async () => true }; } };
  assert.equal(readWholeCopyActionSnapshot(store, f.id), null);
  await assert.rejects(project({ ...args, store }));
  assert.equal(reads, 4); assert.equal(forgedCalls, 0);
});
