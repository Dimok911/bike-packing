import test from "node:test";
import assert from "node:assert/strict";
import { createAdminTemplatePhotoActionStore } from "../../src/sync/admin-template-photo-action-store.js";
import { prepareAdminTemplatePhotoCreateRecord } from "../../src/public/admin-template-photo-create-state.js";
import { adminPhotoCreateRecordInput } from "../fixtures/admin-template-photo-create-record-fixture.js";
import { adminPhotoRecordFixture, adminPhotoIndexedDBFixture } from "../fixtures/admin-template-photo-record-fixture.js";

const error = code => ({ code: `admin-template-photo-storage-${code}`, isAdminTemplateBlocked: true });
const captureInput = record => ({ action: record.action, snapshot: record.snapshot,
  files: record.files.map(({ stage, file, thumb }) => ({ stage, file, thumb })) });
async function fixture(options) {
  const input = await adminPhotoCreateRecordInput(options), prepared = await prepareAdminTemplatePhotoCreateRecord(input), idb = adminPhotoIndexedDBFixture();
  const context = { ...input.binding, scope: "admin-template", admin: true, generation: "create-form-one" };
  const create = extra => createAdminTemplatePhotoActionStore({ binding: input.binding, indexedDB: idb.indexedDB,
    getContext: () => context, enabled: true, createEnabled: true, ...extra });
  return { input, prepared, idb, context, create, store: create(), value: captureInput(prepared) };
}

test("create IDB transaction stores exact source, one new identity and all bytes; returned data comes from actual readback", async () => {
  const f = await fixture(), result = await f.store.capture(f.value);
  assert.deepEqual(result.action, f.prepared.action); assert.deepEqual(result.snapshot, f.prepared.snapshot);
  assert.equal(result.intentHash, f.prepared.intentHash); assert.equal(f.idb.rows().size, 1);
  assert.deepEqual(f.idb.transactions.map(tx => tx.mode), ["readwrite", "readonly"]);
  assert.equal(f.idb.transactions[0].options.durability, "strict");
  assert.equal(f.idb.requests.filter(row => row.operation === "add").length, 1);
  assert.equal(await result.files[0].file.text(), await f.input.files[0].blob.text());
  result.snapshot.state.items[f.input.snapshot.createdOwner.localId].name = "caller changed copy";
  const cold = await f.create().read(f.input.operationId);
  assert.equal(cold.snapshot.state.items[f.input.snapshot.createdOwner.localId].name, f.input.fields.name);
  assert.deepEqual(await f.store.ids(), [f.input.operationId]);
});

test("new capture needs both create and append gates; OFF permits validated cold read, never a new stage claim", async () => {
  const f = await fixture();
  const defaultCreateOff = createAdminTemplatePhotoActionStore({ binding: f.input.binding, indexedDB: f.idb.indexedDB, getContext: () => f.context, enabled: true });
  await assert.rejects(defaultCreateOff.capture(f.value), error("disabled"));
  await assert.rejects(f.create({ enabled: false }).capture(f.value), error("disabled"));
  await f.store.capture(f.value);
  const off = f.create({ enabled: false, createEnabled: false });
  assert.deepEqual((await off.read(f.input.operationId)).action, f.prepared.action);
  const first = f.prepared.files[0].stage.operationId;
  const stage = await off.readStage(f.input.operationId, first);
  assert.equal(stage.stage.version, 2); assert.equal(stage.stage.templateOperationId, f.input.operationId);
  assert.equal(await stage.file.text(), await f.input.files[0].blob.text());
  await assert.rejects(off.claimStage(f.input.operationId, first), error("disabled"));
  await assert.rejects(defaultCreateOff.claimStage(f.input.operationId, first), error("disabled"));
  assert.equal(f.idb.rows("stage-dispatches").size, 0);
});

test("quota before commit preserves caller files; retry reuses all IDs, bytes and intent hash with one final record", async () => {
  const f = await fixture(); f.idb.controls.quota = true;
  await assert.rejects(f.store.capture(f.value), cause => {
    assert.equal(cause.isAdminTemplateBlocked, true);
    assert.deepEqual(cause.unconfirmedAdminPhotoDraft.action, f.prepared.action);
    assert.equal(cause.unconfirmedAdminPhotoDraft.files[0].file, f.value.files[0].file); return true;
  });
  assert.equal(f.idb.rows().size, 0); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  f.idb.controls.quota = false;
  const again = await prepareAdminTemplatePhotoCreateRecord(f.input), saved = await f.create().capture(captureInput(again));
  assert.equal(saved.intentHash, f.prepared.intentHash); assert.deepEqual(saved.action, f.prepared.action);
  assert.equal(f.idb.rows().size, 1);
  assert.deepEqual(saved.files.map(row => row.stage.operationId), f.prepared.files.map(row => row.stage.operationId));
});

test("committed bytes survive failed readback and same-ID retry does not insert another record", async () => {
  const f = await fixture(); let failRead = true;
  f.idb.controls.onGet = ({ mode }) => { if (mode === "readonly" && failRead) throw Error("readback unavailable"); };
  await assert.rejects(f.store.capture(f.value)); assert.equal(f.idb.rows().size, 1);
  failRead = false;
  const saved = await f.create().capture(f.value);
  assert.equal(saved.intentHash, f.prepared.intentHash); assert.equal(f.idb.requests.filter(row => row.operation === "add").length, 1);
});

test("two tabs cannot persist distinct create actions at one confirmed base; same UUID remains idempotent", async () => {
  const f = await fixture(), other = await prepareAdminTemplatePhotoCreateRecord(await adminPhotoCreateRecordInput());
  const results = await Promise.allSettled([f.store.capture(f.value), f.create().capture(captureInput(other))]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(results.find(row => row.status === "rejected").reason.code, "admin-template-photo-storage-base-already-captured");
  assert.equal(f.idb.rows().size, 1);
  const winner = results.find(row => row.status === "fulfilled").value;
  assert.equal((await f.create().capture(captureInput(winner))).intentHash, winner.intentHash);
});

test("create and existing append share the same base exclusion in both capture orders", async () => {
  for (const createFirst of [true, false]) {
    const f = await fixture(), append = await adminPhotoRecordFixture();
    const first = createFirst ? f.value : append, second = createFirst ? append : f.value;
    await f.store.capture(first);
    await assert.rejects(f.create().capture(second), error("base-already-captured"));
    assert.equal(f.idb.rows().size, 1);
  }
});

test("same action UUID cannot change the frozen selection, fields or new owner identity", async () => {
  const f = await fixture(); await f.store.capture(f.value);
  const modified = structuredClone(f.input); modified.fields.name = "different new owner";
  const different = await prepareAdminTemplatePhotoCreateRecord(modified);
  await assert.rejects(f.create().capture(captureInput(different)), error("operation-id-reused"));
  assert.equal((await f.store.read(f.input.operationId)).intentHash, f.prepared.intentHash);
});

test("account and context changes expose no previous account files and preserve committed records", async () => {
  const f = await fixture(); await f.store.capture(f.value);
  f.context.scope = "personal";
  await assert.rejects(f.store.read(f.input.operationId), error("context-changed"));
  f.context.scope = "admin-template";
  const foreignBinding = { ...f.input.binding, actorId: "other-admin" }, other = f.create({ binding: foreignBinding,
    getContext: () => ({ ...f.context, ...foreignBinding }) });
  assert.equal(await other.read(f.input.operationId), null); assert.deepEqual(await other.ids(), []);
  f.idb.controls.onGet = () => { f.context.generation = "switched"; };
  await assert.rejects(f.store.read(f.input.operationId), error("context-changed"));
  assert.equal(f.idb.rows().size, 1);
});

test("known create stage claim is immutable across cold readers and parallel claimers; corrupt bytes remain blocked", async () => {
  const f = await fixture(); await f.store.capture(f.value); const stageId = f.prepared.files[0].stage.operationId;
  const results = await Promise.all([f.store.claimStage(f.input.operationId, stageId), f.create().claimStage(f.input.operationId, stageId)]);
  assert.deepEqual(results.map(row => row.fresh).sort(), [false, true]);
  assert.equal(results[0].assetDigest, f.prepared.action.body.photoCreate.assets[0].assetDigest);
  assert.deepEqual(await f.create().claimStage(f.input.operationId, stageId), { ...results[0], fresh: false });
  assert.equal(f.idb.rows("stage-dispatches").size, 1);
  const raw = [...f.idb.rows().values()][0]; new Uint8Array(raw.files[0].file)[0] ^= 1;
  await assert.rejects(f.store.read(f.input.operationId), { code: "admin-template-photo-create-record" });
  await assert.rejects(f.store.claimStage(f.input.operationId, stageId), { code: "admin-template-photo-create-record" });
  assert.equal(f.idb.rows().size, 1);
});
