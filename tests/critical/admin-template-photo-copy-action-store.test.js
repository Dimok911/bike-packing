import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAdminTemplatePhotoCopyActionStore } from "../../src/sync/admin-template-photo-copy-action-store.js";
import { createAdminTemplatePhotoActionStore } from "../../src/sync/admin-template-photo-action-store.js";
import { prepareAdminTemplatePhotoCopyRecord, encodeAdminTemplatePhotoCopyRecord } from "../../src/sync/admin-template-photo-copy-record.js";
import { adminPhotoCopyRecordInput, adminPhotoCopyIndexedDBFixture } from "../fixtures/admin-template-photo-copy-record-fixture.js";

const error = code => ({ code: `admin-template-photo-copy-storage-${code}`, isAdminTemplateBlocked: true });
async function fixture(options) {
  const input = await adminPhotoCopyRecordInput(options), prepared = await prepareAdminTemplatePhotoCopyRecord(input), idb = adminPhotoCopyIndexedDBFixture();
  const context = { ...input.binding, scope: "admin-template", admin: true, generation: "copy-selection-one" };
  const create = extra => createAdminTemplatePhotoCopyActionStore({ binding: input.binding, indexedDB: idb.indexedDB,
    getContext: () => context, enabled: true, ...extra });
  return { input, prepared, idb, context, create, store: create(), value: { action: input.action, snapshot: input.snapshot } };
}
const stageId = f => f.input.action.body.photoCopy.assets[0].assetId;
const saveId = f => f.input.action.operationId;

test("JSON copy transaction persists frozen raw source, target and IDs; cold read returns actual durable record without invented files", async () => {
  const f = await fixture(), result = await f.store.capture(f.value);
  assert.deepEqual(result, f.prepared); assert.equal(f.idb.rows().size, 1);
  assert.equal(f.idb.transactions.find(tx => tx.mode === "readwrite").options.durability, "strict");
  assert.deepEqual([...f.idb.databases.keys()], ["bike-packing-admin-template-photo-copy-actions-v1"]);
  const raw = [...f.idb.rows().values()][0]; assert.deepEqual(Object.keys(raw).sort(), ["bindingKey", "intentHash", "intentJson", "key", "kind", "version"]);
  assert.equal(Object.hasOwn(JSON.parse(raw.intentJson), "files"), false);
  result.snapshot.target.metadata.title = "changed caller copy";
  assert.deepEqual(await f.create().read(saveId(f)), f.prepared); assert.deepEqual(await f.store.ids(), [saveId(f)]);
  const stage = await f.store.readStage(saveId(f), stageId(f));
  assert.equal(stage.intentHash, f.prepared.intentHash); assert.equal(stage.assetDigest, f.input.action.body.photoCopy.assets[0].assetDigest);
  assert.deepEqual(stage.stage, f.prepared.stages[0]); assert.equal(Object.hasOwn(stage, "file"), false);
  assert.equal(await f.store.readStage(saveId(f), randomUUID()), null);
});

test("default OFF blocks capture/claims while exact actor-bound cold reads remain available", async () => {
  const f = await fixture(), off = f.create({ enabled: false });
  const defaults = createAdminTemplatePhotoCopyActionStore({ binding: f.input.binding, indexedDB: f.idb.indexedDB, getContext: () => f.context });
  await assert.rejects(defaults.capture(f.value), error("disabled")); await assert.rejects(off.capture(f.value), error("disabled"));
  await f.store.capture(f.value);
  assert.deepEqual(await off.read(saveId(f)), f.prepared); assert.deepEqual(await off.ids(), [saveId(f)]);
  assert.equal((await off.readStage(saveId(f), stageId(f))).stage.operationId, stageId(f));
  await assert.rejects(off.claimStage(saveId(f), stageId(f)), error("disabled")); assert.equal(f.idb.rows("stage-dispatches").size, 0);
});

test("quota before commit retains the complete frozen selection, then retry uses identical action/stage IDs and one insertion", async () => {
  const f = await fixture(); f.idb.controls.quota = true;
  await assert.rejects(f.store.capture(f.value), cause => {
    assert.equal(cause.isAdminTemplateBlocked, true); assert.deepEqual(cause.unconfirmedAdminPhotoCopy, f.value);
    assert.notEqual(cause.unconfirmedAdminPhotoCopy, f.value); return true;
  });
  assert.equal(f.idb.rows().size, 0); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  f.idb.controls.quota = false;
  const saved = await f.create().capture(f.value);
  assert.equal(saved.intentHash, f.prepared.intentHash); assert.deepEqual(saved.action, f.prepared.action); assert.equal(f.idb.rows().size, 1);
});

test("an aborted write inserts no record; readback failure after commit preserves record and same-ID retry cannot duplicate it", async () => {
  const f = await fixture(); f.idb.controls.abortWrite = true;
  await assert.rejects(f.store.capture(f.value)); assert.equal(f.idb.rows().size, 0);
  f.idb.controls.abortWrite = false; let committed = false;
  f.idb.controls.onCommit = ({ mode }) => { if (mode === "readwrite") committed = true; };
  f.idb.controls.onGet = ({ mode }) => { if (mode === "readonly" && committed) throw Error("readback lost"); };
  await assert.rejects(f.store.capture(f.value)); assert.equal(f.idb.rows().size, 1);
  const attempts = f.idb.requests.filter(row => row.operation === "add").length;
  f.idb.controls.onGet = () => {};
  assert.equal((await f.create().capture(f.value)).intentHash, f.prepared.intentHash);
  assert.equal(f.idb.requests.filter(row => row.operation === "add").length, attempts);
});

test("concurrent tabs capture at most one distinct copy at the same target base; exact same-ID capture is idempotent", async () => {
  const f = await fixture(), other = await adminPhotoCopyRecordInput();
  const results = await Promise.allSettled([f.store.capture(f.value), f.create().capture({ action: other.action, snapshot: other.snapshot })]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(results.find(row => row.status === "rejected").reason.code, error("base-already-captured").code);
  const winner = results.find(row => row.status === "fulfilled").value;
  assert.equal(f.idb.rows().size, 1);
  const retry = await f.create().capture({ action: winner.action, snapshot: winner.snapshot });
  assert.equal(retry.intentHash, winner.intentHash); assert.equal(f.idb.requests.filter(row => row.operation === "add").length, 1);
});

test("same save UUID cannot retarget the selection, copy name, or owner ID", async () => {
  const f = await fixture(); await f.store.capture(f.value);
  const changed = structuredClone(f.value); changed.action.body.photoCopy.fields.name = "Different copy";
  await assert.rejects(f.store.capture(changed), error("operation-id-reused"));
  assert.deepEqual(await f.store.read(saveId(f)), f.prepared);
});

test("copy storage does not enter the V5/V7 upload codec and binary-shaped inputs cannot enter the derivative store", async () => {
  const f = await fixture(), upload = createAdminTemplatePhotoActionStore({ binding: f.input.binding, indexedDB: f.idb.indexedDB,
    getContext: () => f.context, enabled: true, createEnabled: true, replaceEnabled: true });
  await assert.rejects(f.store.capture({ ...f.value, files: [] }), error("capture-shape"));
  await assert.rejects(upload.capture({ ...f.value, files: [] }), { isAdminTemplateBlocked: true });
  assert.equal(f.idb.databases.size, 0);
});

test("account change after committed capture exposes no previous selection; original actor recovers the unchanged record", async () => {
  const f = await fixture(), before = { ...f.context };
  f.idb.controls.onCommit = ({ mode }) => { if (mode === "readwrite") f.context.actorId = "different-account"; };
  await assert.rejects(f.store.capture(f.value), cause => {
    assert.equal(cause.code, error("context-changed").code); assert.equal(Object.hasOwn(cause, "unconfirmedAdminPhotoCopy"), false); return true;
  });
  assert.equal(f.idb.rows().size, 1); Object.assign(f.context, before); f.idb.controls.onCommit = () => {};
  assert.deepEqual(await f.create().read(saveId(f)), f.prepared);
  const binding = { ...f.input.binding, actorId: "other-admin" }, foreign = f.create({ binding, getContext: () => ({ ...f.context, ...binding }) });
  assert.equal(await foreign.read(saveId(f)), null); assert.deepEqual(await foreign.ids(), []);
});

test("scope/generation changes during actual IDB reads block stale data without deleting it", async () => {
  const f = await fixture(); await f.store.capture(f.value);
  f.context.scope = "personal"; await assert.rejects(f.store.read(saveId(f)), error("context-changed"));
  f.context.scope = "admin-template";
  f.idb.controls.onGet = () => { f.context.generation = "changed-during-await"; };
  await assert.rejects(f.store.read(saveId(f)), error("context-changed")); assert.equal(f.idb.rows().size, 1);
});

test("corrupt stored hash blocks cold read, stage claiming and new capture while keeping the original bytes of the JSON record", async () => {
  const f = await fixture(); await f.store.capture(f.value);
  const raw = [...f.idb.rows().values()][0]; raw.intentHash = "f".repeat(64);
  await assert.rejects(f.store.read(saveId(f)), { code: "admin-template-photo-copy-record" });
  await assert.rejects(f.store.claimStage(saveId(f), stageId(f)), { code: "admin-template-photo-copy-record" });
  await assert.rejects(f.store.capture(f.value), { code: "admin-template-photo-copy-record" });
  assert.equal(f.idb.rows().size, 1); assert.equal(f.idb.rows("stage-dispatches").size, 0);
});

test("concurrent stage claims have one fresh result and durable exact hash/IDs, with no transport journal dependency", async () => {
  const f = await fixture(); await f.store.capture(f.value);
  const claims = await Promise.all([f.store.claimStage(saveId(f), stageId(f)), f.create().claimStage(saveId(f), stageId(f))]);
  assert.deepEqual(claims.map(value => value.fresh).sort(), [false, true]); assert.equal(f.idb.rows("stage-dispatches").size, 1);
  assert.equal(claims[0].intentHash, f.prepared.intentHash); assert.equal(claims[0].actionOperationId, saveId(f));
  assert.equal(claims[0].stageOperationId, stageId(f)); assert.equal(claims[0].assetDigest, f.input.action.body.photoCopy.assets[0].assetDigest);
  assert.deepEqual(await f.create().claimStage(saveId(f), stageId(f)), { ...claims[0], fresh: false });
  await assert.rejects(f.store.claimStage(saveId(f), randomUUID()), error("stage-missing"));
});

test("lost claim readback preserves no-rePOST evidence; quota/abort before claim leaves it eligible for one later claim", async () => {
  const f = await fixture(); await f.store.capture(f.value); f.idb.controls.quota = true;
  await assert.rejects(f.store.claimStage(saveId(f), stageId(f))); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  f.idb.controls.quota = false; f.idb.controls.abortWrite = true;
  await assert.rejects(f.store.claimStage(saveId(f), stageId(f))); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  f.idb.controls.abortWrite = false;
  f.idb.controls.onGet = ({ mode, storeName }) => { if (mode === "readonly" && storeName === "stage-dispatches") throw Error("claim ACK lost"); };
  await assert.rejects(f.store.claimStage(saveId(f), stageId(f))); assert.equal(f.idb.rows("stage-dispatches").size, 1);
  f.idb.controls.onGet = () => {};
  assert.equal((await f.create().claimStage(saveId(f), stageId(f))).fresh, false);
});

test("foreign/corrupt claims and an action changed between decode and claim transaction are never overwritten", async () => {
  const f = await fixture(); await f.store.capture(f.value); await f.store.claimStage(saveId(f), stageId(f));
  const claim = [...f.idb.rows("stage-dispatches").values()][0]; claim.actionOperationId = randomUUID();
  await assert.rejects(f.store.claimStage(saveId(f), stageId(f)), error("claim-changed"));
  assert.notEqual(claim.actionOperationId, saveId(f)); assert.equal(f.idb.rows("stage-dispatches").size, 1);
  const second = f.input.action.body.photoCopy.assets[1].assetId;
  f.idb.controls.onCommit = ({ mode }) => { if (mode === "readonly") [...f.idb.rows().values()][0].intentHash = "0".repeat(64); };
  await assert.rejects(f.store.claimStage(saveId(f), second), error("action-changed"));
  assert.equal(f.idb.rows("stage-dispatches").size, 1);
});

test("only the validated adoption callback releases an old base and retains its complete record and original stage claim", async () => {
  const f = await fixture(), next = await adminPhotoCopyRecordInput(), value = { action: next.action, snapshot: next.snapshot };
  await f.store.capture(f.value); const claim = await f.store.claimStage(saveId(f), stageId(f));
  const before = structuredClone([...f.idb.rows().values()]), claims = structuredClone([...f.idb.rows("stage-dispatches").values()]);
  await assert.rejects(f.create().capture(value), error("base-already-captured"));
  await assert.rejects(f.create({ getExcludedOperations: async () => [] }).capture(value), error("base-already-captured"));
  // The application supplies these IDs only after actual stop-choice proof.
  const adopted = f.create({ getExcludedOperations: async () => [saveId(f)] });
  const saved = await adopted.capture(value); assert.equal(saved.action.operationId, next.action.operationId);
  assert.equal(f.idb.rows().size, 2); assert.deepEqual([...f.idb.rows().values()].filter(row => row.key === before[0].key), before);
  assert.deepEqual([...f.idb.rows("stage-dispatches").values()], claims);
  assert.deepEqual(await adopted.read(saveId(f)), f.prepared);
  assert.deepEqual(await adopted.claimStage(saveId(f), stageId(f)), { ...claim, fresh: false });
});

test("exclusion IDs must be unique UUIDs and cannot bypass same-UUID immutable intent checks", async () => {
  const f = await fixture(), next = await adminPhotoCopyRecordInput(); await f.store.capture(f.value);
  for (const excluded of [null, {}, "all", ["bad-id"], [saveId(f), saveId(f)], [42]]) {
    await assert.rejects(f.create({ getExcludedOperations: async () => excluded }).capture({ action: next.action, snapshot: next.snapshot }), error("excluded-operations"));
  }
  const same = f.create({ getExcludedOperations: async () => [saveId(f)] });
  assert.deepEqual(await same.capture(f.value), f.prepared);
  const changed = structuredClone(f.value); changed.action.body.photoCopy.fields.name = "Cannot replace stopped action";
  await assert.rejects(same.capture(changed), error("operation-id-reused"));
  assert.equal(f.idb.rows().size, 1); assert.deepEqual(await f.store.read(saveId(f)), f.prepared);
});

test("excluded records still require full decode; corruption is not hidden by adoption authority", async () => {
  for (const fault of ["hash", "malformed-json"]) {
    const f = await fixture(), next = await adminPhotoCopyRecordInput(); await f.store.capture(f.value);
    const raw = [...f.idb.rows().values()][0];
    if (fault === "hash") raw.intentHash = "0".repeat(64); else raw.intentJson = "{";
    let callbacks = 0;
    await assert.rejects(f.create({ getExcludedOperations: async () => { callbacks++; return [saveId(f)]; } })
      .capture({ action: next.action, snapshot: next.snapshot }), { isAdminTemplateBlocked: true });
    assert.equal(callbacks, 0); assert.equal(f.idb.rows().size, 1);
  }
});

test("an excluded record changed or removed across the adoption await cannot become authority inside the write transaction", async () => {
  for (const fault of ["changed", "valid-replacement", "removed"]) {
    const f = await fixture(), next = await adminPhotoCopyRecordInput(); await f.store.capture(f.value);
    const key = [...f.idb.rows().keys()][0];
    const altered = structuredClone(f.value); altered.action.body.photoCopy.fields.name = "Valid but different retained action";
    const replacement = await encodeAdminTemplatePhotoCopyRecord({ binding: f.input.binding, ...altered });
    const store = f.create({ getExcludedOperations: async () => {
      await Promise.resolve();
      if (fault === "changed") f.idb.rows().get(key).intentHash = "0".repeat(64);
      else if (fault === "valid-replacement") f.idb.rows().set(key, replacement);
      else f.idb.rows().delete(key);
      return [saveId(f)];
    } });
    await assert.rejects(store.capture({ action: next.action, snapshot: next.snapshot }), error("excluded-record-changed"));
    assert.equal(f.idb.requests.filter(row => row.operation === "add").length, 1);
  }
});

test("scope changes during exclusion proof stop capture without exposing the earlier actor's selection", async () => {
  const f = await fixture(), next = await adminPhotoCopyRecordInput(); await f.store.capture(f.value);
  const store = f.create({ getExcludedOperations: async () => { await Promise.resolve(); f.context.actorId = "different"; return [saveId(f)]; } });
  await assert.rejects(store.capture({ action: next.action, snapshot: next.snapshot }), cause => {
    assert.equal(cause.code, error("context-changed").code); assert.equal(Object.hasOwn(cause, "unconfirmedAdminPhotoCopy"), false); return true;
  });
  assert.equal(f.idb.rows().size, 1);
});

test("two fresh attempts after adoption still capture at most one new copy and preserve the excluded claim", async () => {
  const f = await fixture(), first = await adminPhotoCopyRecordInput(), second = await adminPhotoCopyRecordInput();
  await f.store.capture(f.value); await f.store.claimStage(saveId(f), stageId(f));
  const claims = structuredClone([...f.idb.rows("stage-dispatches").values()]);
  const make = () => f.create({ getExcludedOperations: async () => [saveId(f)] });
  const attempts = await Promise.allSettled([make().capture({ action: first.action, snapshot: first.snapshot }), make().capture({ action: second.action, snapshot: second.snapshot })]);
  assert.equal(attempts.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(attempts.find(row => row.status === "rejected").reason.code, error("base-already-captured").code);
  assert.equal(f.idb.rows().size, 2); assert.deepEqual([...f.idb.rows("stage-dispatches").values()], claims);
});
