import test from "node:test";
import assert from "node:assert/strict";
import { createAdminTemplatePhotoActionStore } from "../../src/sync/admin-template-photo-action-store.js";
import { adminPhotoRecordFixture, adminPhotoIndexedDBFixture } from "../fixtures/admin-template-photo-record-fixture.js";
import { adminTemplatePhotoStageDigest } from "../../src/sync/admin-template-photo-append-protocol.js";

const storageError = code => ({ code: `admin-template-photo-storage-${code}`, isAdminTemplateBlocked: true });
async function fixture(options) {
  const input = await adminPhotoRecordFixture(options), idb = adminPhotoIndexedDBFixture();
  const context = { ...input.binding, scope: "admin-template", admin: true, generation: "editor-generation-one" };
  const create = (extra = {}) => createAdminTemplatePhotoActionStore({ binding: input.binding, indexedDB: idb.indexedDB,
    getContext: () => context, enabled: true, ...extra });
  return { input, idb, context, create, store: create() };
}

test("atomic admin capture commits all files once and returns a separate actual stored-record read", async () => {
  const f = await fixture(), result = await f.store.capture(f.input);
  assert.deepEqual(result.action, f.input.action); assert.deepEqual(result.snapshot, f.input.snapshot);
  assert.equal(f.idb.rows().size, 1); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  assert.deepEqual(f.idb.transactions.map(tx => tx.mode), ["readwrite", "readonly"]);
  assert.equal(f.idb.transactions[0].options.durability, "strict");
  assert.equal(f.idb.requests.filter(request => request.operation === "add").length, 1);
  assert.equal(f.idb.requests.some(request => request.operation === "get" && request.mode === "readonly"), true);
  assert.deepEqual(await f.store.ids(), [f.input.action.operationId]);
  for (const part of result.files) {
    const stage = await f.store.readStage(result.action.operationId, part.stage.operationId);
    assert.equal(stage.stage.operationId, part.stage.operationId); assert.equal(stage.intentHash, result.intentHash);
    assert.deepEqual(stage.fileMetadata, part.fileMetadata); assert.equal(await stage.file.text(), await part.file.text());
  }
  assert.equal(await f.store.readStage(result.action.operationId, crypto.randomUUID()), null);
  assert.equal(await f.store.read(crypto.randomUUID()), null);
});

test("capture is OFF by default while same-actor cold reads and ID inventory remain available", async () => {
  const f = await fixture(); await f.store.capture(f.input);
  const cold = createAdminTemplatePhotoActionStore({ binding: f.input.binding, getContext: () => f.context, indexedDB: f.idb.indexedDB });
  await assert.rejects(cold.capture(f.input), storageError("disabled"));
  await assert.rejects(cold.claimStage(f.input.action.operationId, f.input.files[0].stage.operationId), storageError("disabled"));
  assert.deepEqual(await cold.ids(), [f.input.action.operationId]);
  assert.deepEqual((await cold.read(f.input.action.operationId)).action, f.input.action);
  assert.equal(await (await cold.readStage(f.input.action.operationId, f.input.files[0].stage.operationId)).file.text(), await f.input.files[0].file.text());
  assert.equal(Object.hasOwn(cold, "delete"), false); assert.equal(Object.hasOwn(cold, "dispatch"), false);
});

test("an identical recapture is read-only for existing bytes and a conflicting same UUID cannot overwrite them", async () => {
  const f = await fixture(); await f.store.capture(f.input);
  const before = structuredClone([...f.idb.rows()]);
  await f.store.capture(f.input);
  assert.equal(f.idb.requests.filter(request => request.operation === "add").length, 1);
  const changed = structuredClone(f.input); changed.action.body.payload.items["server-item"].name = "Later business";
  changed.snapshot.state.items["local-item"].name = "Later business";
  await assert.rejects(f.store.capture(changed), storageError("operation-id-reused"));
  assert.deepEqual([...f.idb.rows()], before);
});

test("two independent tabs can durably capture only one action for the same template revision", async () => {
  const f = await fixture(), other = await adminPhotoRecordFixture();
  const results = await Promise.allSettled([f.store.capture(f.input), f.create().capture(other)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const failure = results.find(result => result.status === "rejected");
  assert.equal(failure.reason.code, "admin-template-photo-storage-base-already-captured");
  const saved = results.find(result => result.status === "fulfilled").value;
  assert.deepEqual(await f.store.ids(), [saved.action.operationId]);
  assert.equal(f.idb.rows().size, 1);
  const input = saved.action.operationId === f.input.action.operationId ? f.input : other;
  assert.deepEqual((await f.create().capture(input)).action, saved.action);
});

test("quota or aborted multi-file transactions preserve earlier actions without a partial new package", async () => {
  for (const fault of ["quota", "abortWrite"]) {
    const f = await fixture(); await f.store.capture(f.input);
    const before = structuredClone([...f.idb.rows()]), next = await adminPhotoRecordFixture();
    next.action.body.base.stateRevision++;
    next.snapshot.state.layouts[next.snapshot.layoutId].adminCausalSource.base.stateRevision++;
    next.snapshot.ownerMap = { ...next.snapshot.ownerMap, stateRevision: next.action.body.base.stateRevision };
    for (const [i, file] of next.files.entries()) {
      file.stage = { ...file.stage, baseStateRevision: next.action.body.base.stateRevision };
      next.action.body.photoAppend.assets[i].assetDigest = await adminTemplatePhotoStageDigest(file.stage);
    }
    f.idb.controls[fault] = true;
    await assert.rejects(f.store.capture(next), error => {
      assert.equal(error.isAdminTemplateBlocked, true);
      assert.equal(error.unconfirmedAdminPhotoDraft.files.length, next.files.length); return true;
    });
    assert.deepEqual([...f.idb.rows()], before);
    assert.deepEqual(await f.store.ids(), [f.input.action.operationId]);
  }
});

test("capture detects changed stored bytes at readback instead of returning its own in-memory encoding", async () => {
  const f = await fixture(); let damaged;
  f.idb.controls.onCommit = ({ mode }) => {
    if (mode !== "readwrite" || damaged) return;
    const saved = [...f.idb.rows().values()][0]; new Uint8Array(saved.files[0].file)[0] ^= 1; damaged = structuredClone(saved);
  };
  await assert.rejects(f.store.capture(f.input), storageError("readback"));
  assert.deepEqual([...f.idb.rows().values()][0], damaged);
  assert.deepEqual(await f.store.ids(), [f.input.action.operationId]);
  await assert.rejects(f.store.read(f.input.action.operationId), { code: "admin-template-photo-record" });
});

test("scope and account changes before hashing, during a transaction, or after commit cannot expose the old package", async () => {
  for (const when of ["before", "hash", "transaction", "committed"]) {
    const f = await fixture();
    if (when === "before") f.context.scope = "personal";
    if (when === "hash") {
      const file = f.input.files[0].file, read = file.arrayBuffer.bind(file);
      file.arrayBuffer = async () => { f.context.actorId = "other-admin"; return read(); };
    }
    if (when === "transaction") f.idb.controls.onGet = ({ mode }) => { if (mode === "readwrite") f.context.generation = "another-form"; };
    if (when === "committed") f.idb.controls.onCommit = ({ mode }) => { if (mode === "readwrite") f.context.actorId = "other-admin"; };
    await assert.rejects(f.store.capture(f.input), error => {
      assert.equal(error.code, "admin-template-photo-storage-context-changed");
      assert.equal(error.unconfirmedAdminPhotoDraft, undefined); return true;
    });
    assert.equal(f.idb.rows()?.size || 0, when === "committed" ? 1 : 0);
    Object.assign(f.context, f.input.binding, { scope: "admin-template", generation: "editor-generation-one" });
    f.idb.controls.onGet = () => {}; f.idb.controls.onCommit = () => {};
    if (when === "committed") assert.equal(await (await f.store.read(f.input.action.operationId)).files[0].file.text(), await f.input.files[0].file.text());
  }
});

test("guarded reads reject stale views or lost admin rights and another binding sees no original IDs", async () => {
  const f = await fixture(); await f.store.capture(f.input);
  f.context.admin = false;
  for (const read of [() => f.store.read(f.input.action.operationId), () => f.store.ids(),
    () => f.store.readStage(f.input.action.operationId, f.input.files[0].stage.operationId)]) await assert.rejects(read(), storageError("context-changed"));
  f.context.admin = true;
  f.idb.controls.onGet = () => { f.context.generation = "changed-during-read"; };
  await assert.rejects(f.store.read(f.input.action.operationId), storageError("context-changed"));
  f.idb.controls.onGet = () => {};
  const binding = { ...f.input.binding, actorId: "other-admin" }, context = { ...f.context, ...binding };
  const other = f.create({ binding, getContext: () => context, enabled: false });
  assert.deepEqual(await other.ids(), []); assert.equal(await other.read(f.input.action.operationId), null);
  assert.equal(f.idb.rows().size, 1);
});

test("first stage claim is durable and concurrent or cold claimers receive the identical non-fresh identity", async () => {
  const f = await fixture(), captured = await f.store.capture(f.input), actionId = f.input.action.operationId;
  const firstId = f.input.files[0].stage.operationId, secondId = f.input.files[1].stage.operationId;
  const first = await f.store.claimStage(actionId, firstId);
  assert.equal(first.fresh, true); assert.equal(first.intentHash, captured.intentHash);
  assert.equal(first.assetDigest, f.input.action.body.photoAppend.assets[0].assetDigest);
  assert.deepEqual(await f.create().claimStage(actionId, firstId), { ...first, fresh: false });
  const concurrent = await Promise.all([f.store.claimStage(actionId, secondId), f.create().claimStage(actionId, secondId)]);
  assert.deepEqual(concurrent.map(value => value.fresh).sort(), [false, true]);
  assert.equal(f.idb.rows("stage-dispatches").size, 2);
  assert.equal(f.idb.requests.filter(request => request.operation === "add" && request.storeName === "stage-dispatches").length, 2);
  assert.equal(f.idb.requests.some(request => request.operation === "get" && request.storeName === "stage-dispatches" && request.mode === "readonly"), true);
});

test("a stage cannot be claimed under a different action and a corrupted existing claim is retained without overwrite", async () => {
  const f = await fixture(); await f.store.capture(f.input);
  const actionId = f.input.action.operationId, stageId = f.input.files[0].stage.operationId;
  await assert.rejects(f.store.claimStage(crypto.randomUUID(), stageId), storageError("stage-missing"));
  await assert.rejects(f.store.claimStage(actionId, crypto.randomUUID()), storageError("stage-missing"));
  await f.store.claimStage(actionId, stageId);
  const claim = [...f.idb.rows("stage-dispatches").values()][0]; claim.assetDigest = "0".repeat(64);
  const before = structuredClone([...f.idb.rows("stage-dispatches")]);
  await assert.rejects(f.store.claimStage(actionId, stageId), storageError("claim-changed"));
  assert.deepEqual([...f.idb.rows("stage-dispatches")], before);
});

test("claim compares the currently stored action bytes after async validation and cannot claim changed data", async () => {
  const f = await fixture(); await f.store.capture(f.input); let changed = false;
  f.idb.controls.onCommit = ({ mode }) => {
    if (mode !== "readonly" || changed) return; changed = true;
    new Uint8Array([...f.idb.rows().values()][0].files[0].file)[0] ^= 1;
  };
  await assert.rejects(f.store.claimStage(f.input.action.operationId, f.input.files[0].stage.operationId), storageError("action-changed"));
  assert.equal(f.idb.rows("stage-dispatches").size, 0); assert.equal(f.idb.rows().size, 1);
});

test("quota and abort cannot leave a partial claim while a committed claim survives account change for status-only continuation", async () => {
  for (const mode of ["quota", "abortWrite", "account"]) {
    const f = await fixture(); await f.store.capture(f.input);
    const actionId = f.input.action.operationId, stageId = f.input.files[0].stage.operationId;
    if (mode === "account") f.idb.controls.onCommit = ({ mode }) => { if (mode === "readwrite") f.context.actorId = "other-admin"; };
    else f.idb.controls[mode] = true;
    await assert.rejects(f.store.claimStage(actionId, stageId), error => error.isAdminTemplateBlocked === true);
    assert.equal(f.idb.rows().size, 1); assert.equal(f.idb.rows("stage-dispatches").size, mode === "account" ? 1 : 0);
    f.idb.controls.quota = false; f.idb.controls.abortWrite = false; f.idb.controls.onCommit = () => {}; f.context.actorId = f.input.binding.actorId;
    assert.equal((await f.store.claimStage(actionId, stageId)).fresh, mode !== "account");
  }
});

test("claim readback verifies the actual committed claim and preserves a corrupted result for recovery", async () => {
  const f = await fixture(); await f.store.capture(f.input);
  f.idb.controls.onCommit = ({ mode, names }) => {
    if (mode === "readwrite" && names.includes("stage-dispatches")) [...f.idb.rows("stage-dispatches").values()][0].intentHash = "0".repeat(64);
  };
  await assert.rejects(f.store.claimStage(f.input.action.operationId, f.input.files[0].stage.operationId), storageError("claim-readback"));
  assert.equal(f.idb.rows("stage-dispatches").size, 1);
  assert.equal([...f.idb.rows("stage-dispatches").values()][0].intentHash, "0".repeat(64));
});
