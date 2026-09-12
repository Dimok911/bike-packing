import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { createAdminTemplatePhotoTreeCopyActionStore } from "../../src/sync/admin-template-photo-tree-copy-action-store.js";
import { encodeAdminTemplatePhotoTreeCopyRecord } from "../../src/sync/admin-template-photo-tree-copy-record.js";
import { createAdminTemplatePhotoCopyActionStore } from "../../src/sync/admin-template-photo-copy-action-store.js";
import { refreshTreeRecordDigests } from "../fixtures/admin-template-photo-tree-copy-record-fixture.js";
import { treeActionStoreFixture as fixture, treeStoreInput } from "../fixtures/admin-template-photo-tree-copy-action-store-fixture.js";

const error = code => ({ code: `admin-template-photo-tree-copy-storage-${code}`, isAdminTemplateBlocked: true });
const clone = value => structuredClone(value), value = input => ({ action: input.action, snapshot: input.snapshot });
const saveId = f => f.input.action.operationId, stageIds = f => f.input.action.body.photoCopy.owners.flatMap(owner => owner.photos.map(photo => photo.assetId));
const rawRows = (f, name = "actions") => clone([...f.idb.rows(name).values()]);
const adds = (f, name) => f.idb.requests.filter(row => row.operation === "add" && row.storeName === name).length;

test("typed tree transaction persists the exact complete record, all owners and stage IDs in its own database", async () => {
  const f = await fixture(), saved = await f.store.capture(f.value);
  assert.deepEqual(saved, f.prepared); assert.deepEqual([...f.idb.databases.keys()], ["bike-packing-admin-template-photo-tree-copy-actions-v1"]);
  assert.equal(f.idb.transactions.find(tx => tx.mode === "readwrite").options.durability, "strict");
  assert.equal(f.idb.rows().size, 1); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  assert.equal(saved.snapshot.copiedOwners.length, 5); assert.equal(saved.stages.length, 4);
  assert.equal(rawRows(f)[0].kind, "admin-template-photo-tree-copy");
  assert.deepEqual(Object.keys(rawRows(f)[0]).sort(), ["bindingKey", "intentHash", "intentJson", "key", "kind", "version"]);
  assert.equal(Object.hasOwn(JSON.parse(rawRows(f)[0].intentJson), "files"), false);
  saved.snapshot.target.metadata.title = "caller mutation";
  assert.deepEqual(await f.create().read(saveId(f)), f.prepared); assert.deepEqual(await f.store.ids(), [saveId(f)]);
  for (const id of stageIds(f)) {
    const stage = await f.create().readStage(saveId(f), id), expected = f.prepared.stages.find(row => row.operationId === id);
    assert.deepEqual(stage.stage, expected); assert.equal(stage.intentHash, f.prepared.intentHash);
    assert.equal(stage.assetDigest, f.input.action.body.photoCopy.owners.flatMap(owner => owner.photos).find(row => row.assetId === id).assetDigest);
    assert.equal(Object.hasOwn(stage, "file"), false); assert.equal(Object.hasOwn(stage, "stored"), false);
  }
  assert.equal(await f.store.readStage(saveId(f), randomUUID()), null); assert.equal(await f.store.read(randomUUID()), null);
});

test("the default OFF gate blocks capture and claims but leaves full actor-bound cold proof reads available", async () => {
  const f = await fixture(), off = f.create({ enabled: false });
  const defaults = createAdminTemplatePhotoTreeCopyActionStore({ binding: f.input.binding, indexedDB: f.idb.indexedDB, getContext: () => f.context });
  await assert.rejects(defaults.capture(f.value), error("disabled")); await assert.rejects(off.capture(f.value), error("disabled"));
  assert.equal(f.idb.databases.size, 0);
  await f.store.capture(f.value); const original = rawRows(f);
  assert.deepEqual(await off.read(saveId(f)), f.prepared); assert.deepEqual(await off.ids(), [saveId(f)]);
  assert.deepEqual((await off.readStage(saveId(f), stageIds(f)[0])).stage, f.prepared.stages[0]);
  await assert.rejects(off.claimStage(saveId(f), stageIds(f)[0]), error("disabled"));
  assert.deepEqual(rawRows(f), original); assert.equal(f.idb.rows("stage-dispatches").size, 0);
});

test("quota preserves the original detached selection and fixed IDs; one explicit retry inserts it unchanged", async () => {
  const f = await fixture(), original = clone(f.value); f.idb.controls.quota = true;
  const capture = f.store.capture(f.value);
  f.value.action.body.photoCopy.fields.name = "late edited selection";
  f.value.snapshot.copiedOwners[0].localId = "late-local-id";
  let retained;
  await assert.rejects(capture, cause => { retained = cause.unconfirmedAdminPhotoTreeCopy;
    assert.equal(cause.isAdminTemplateBlocked, true); assert.deepEqual(retained, original); assert.notEqual(retained, f.value); return true; });
  assert.equal(f.idb.rows().size, 0); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  f.idb.controls.quota = false;
  const saved = await f.create().capture(retained);
  assert.deepEqual(saved, f.prepared); assert.equal(f.idb.rows().size, 1); assert.equal(saved.action.operationId, original.action.operationId);
});

test("asynchronous write abort inserts nothing; lost readback after commit retains bytes and retry never inserts twice", async () => {
  const f = await fixture(); f.idb.controls.abortWrite = true;
  await assert.rejects(f.store.capture(f.value), error("transaction-aborted")); assert.equal(f.idb.rows().size, 0);
  f.idb.controls.abortWrite = false; let committed = false;
  f.idb.controls.onCommit = ({ mode }) => { if (mode === "readwrite") committed = true; };
  f.idb.controls.onGet = ({ mode }) => { if (mode === "readonly" && committed) throw Error("post-commit readback lost"); };
  await assert.rejects(f.store.capture(f.value)); assert.equal(f.idb.rows().size, 1);
  const before = rawRows(f), attemptedAdds = adds(f, "actions");
  f.idb.controls.onGet = () => {};
  assert.deepEqual(await f.create().capture(f.value), f.prepared);
  assert.equal(adds(f, "actions"), attemptedAdds); assert.deepEqual(rawRows(f), before);
});

test("failed or unavailable IDB open exposes only this actor's frozen intent and makes no business record", async () => {
  const f = await fixture(); f.idb.controls.failOpen = true;
  for (const store of [f.store, f.create({ indexedDB: null })]) await assert.rejects(store.capture(f.value), cause => {
    assert.equal(cause.isAdminTemplateBlocked, true); assert.deepEqual(cause.unconfirmedAdminPhotoTreeCopy, f.value); return true;
  });
  assert.equal(f.idb.databases.size, 0);
  f.idb.controls.failOpen = false; assert.deepEqual(await f.store.capture(f.value), f.prepared);
});

test("two tabs capture at most one new UUID on a target base while exact same-UUID capture remains idempotent", async () => {
  const f = await fixture(), other = await treeStoreInput();
  const results = await Promise.allSettled([f.store.capture(f.value), f.create().capture(value(other))]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.code, error("base-already-captured").code);
  const winner = results.find(result => result.status === "fulfilled").value, original = rawRows(f);
  const retries = await Promise.all([f.store.capture(value(winner)), f.create().capture(value(winner))]);
  assert.equal(retries.every(result => result.intentHash === winner.intentHash), true);
  assert.equal(adds(f, "actions"), 1); assert.deepEqual(rawRows(f), original);
});

test("same UUID cannot be reinterpreted even when a changed valid action has all stage digests recomputed", async () => {
  const f = await fixture(); await f.store.capture(f.value);
  const changed = clone(f.input); changed.action.body.photoCopy.fields.name = "Different tree"; await refreshTreeRecordDigests(changed);
  await assert.rejects(f.store.capture(value(changed)), error("operation-id-reused"));
  const changedSnapshot = clone(f.value); changedSnapshot.snapshot.copiedOwners[0].localId = "another-valid-local-id";
  await assert.rejects(f.store.capture(changedSnapshot), error("operation-id-reused"));
  assert.deepEqual(await f.store.read(saveId(f)), f.prepared); assert.equal(adds(f, "actions"), 1);
});

test("another base never retires retained actions or claims and no local stop/exclusion shortcut is exposed", async () => {
  const f = await fixture(), next = await treeStoreInput({ targetRevision: 12 });
  await f.store.capture(f.value); await f.store.claimStage(saveId(f), stageIds(f)[0]);
  const old = rawRows(f)[0], claims = rawRows(f, "stage-dispatches");
  assert.equal((await f.store.capture(value(next))).action.body.base.stateRevision, 12);
  assert.deepEqual(f.idb.rows().get(old.key), old); assert.deepEqual(rawRows(f, "stage-dispatches"), claims);
  assert.equal(f.idb.rows().size, 2); assert.deepEqual((await f.store.ids()).sort(), [saveId(f), next.action.operationId].sort());
  const sameBase = await treeStoreInput();
  await assert.rejects(f.create({ getExcludedOperations: () => [saveId(f)] }).capture(value(sameBase)), error("base-already-captured"));
  assert.equal(Object.hasOwn(f.store, "delete"), false); assert.equal(Object.hasOwn(f.store, "cancel"), false);
});

test("prior record removal or valid replacement across decode awaits blocks the write transaction", async () => {
  for (const fault of ["remove", "replace"]) {
    const f = await fixture(), next = await treeStoreInput({ targetRevision: 12 }); await f.store.capture(f.value);
    const replacementInput = clone(f.input); replacementInput.action.body.photoCopy.fields.name = "Different retained action";
    await refreshTreeRecordDigests(replacementInput); const replacement = await encodeAdminTemplatePhotoTreeCopyRecord(replacementInput);
    const key = rawRows(f)[0].key; let changed = false;
    f.idb.controls.onCommit = ({ mode }) => { if (mode === "readonly" && !changed) {
      changed = true; if (fault === "remove") f.idb.rows().delete(key); else f.idb.rows().set(key, replacement);
    } };
    await assert.rejects(f.store.capture(value(next)), error("inventory-changed"));
    assert.equal(adds(f, "actions"), 1);
  }
});

test("corrupt bound records block cold lists, stages and new captures rather than disappearing behind a type filter", async () => {
  for (const fault of ["hash", "kind", "json", "key", "action-binding"]) {
    const f = await fixture(); await f.store.capture(f.value); const raw = [...f.idb.rows().values()][0];
    if (fault === "hash") raw.intentHash = "0".repeat(64);
    if (fault === "kind") raw.kind = "admin-template-photo-copy";
    if (fault === "json") raw.intentJson = "{";
    if (fault === "key") raw.key = canonical([canonical(f.input.binding), randomUUID()]);
    if (fault === "action-binding") { const body = JSON.parse(raw.intentJson); body.binding.actorId = "foreign"; raw.intentJson = canonical(body); }
    const bytes = rawRows(f);
    for (const run of [() => f.store.read(saveId(f)), () => f.store.ids(), () => f.store.readStage(saveId(f), stageIds(f)[0]),
      () => f.store.claimStage(saveId(f), stageIds(f)[0]), () => f.store.capture(f.value)]) await assert.rejects(run(), { isAdminTemplateBlocked: true });
    assert.deepEqual(rawRows(f), bytes); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  }
});

test("bound inventory neither returns nor interprets another actor's corrupt private record", async () => {
  const f = await fixture(); await f.store.capture(f.value);
  const foreignBinding = { ...f.input.binding, actorId: "other-admin" }, foreignKey = canonical(foreignBinding), foreignId = randomUUID();
  const foreign = { ...rawRows(f)[0], key: canonical([foreignKey, foreignId]), bindingKey: foreignKey, intentJson: "CORRUPT PRIVATE CONTENT" };
  f.idb.rows().set(foreign.key, foreign);
  assert.deepEqual(await f.store.ids(), [saveId(f)]); assert.equal(await f.store.read(foreignId), null);
  assert.deepEqual(await f.store.capture(f.value), f.prepared); assert.deepEqual(f.idb.rows().get(foreign.key), foreign);
  const other = f.create({ binding: foreignBinding, getContext: () => ({ ...f.context, ...foreignBinding }) });
  assert.equal(await other.read(saveId(f)), null); await assert.rejects(other.ids(), { isAdminTemplateBlocked: true });
});

test("scope or generation change before commit aborts without exposing a stale snapshot or creating rows", async () => {
  const f = await fixture(), before = clone(f.context);
  f.idb.controls.onGet = () => { f.context.scope = "personal"; f.context.generation = "new-personal-view"; };
  await assert.rejects(f.store.capture(f.value), cause => {
    assert.equal(cause.code, error("context-changed").code); assert.equal(Object.hasOwn(cause, "unconfirmedAdminPhotoTreeCopy"), false); return true;
  });
  assert.equal(f.idb.rows().size, 0); Object.assign(f.context, before); f.idb.controls.onGet = () => {};
  assert.deepEqual(await f.create().capture(f.value), f.prepared);
});

test("actor switch after commit discloses no original private contents; original actor cold-recovers exact bytes", async () => {
  const f = await fixture(), before = clone(f.context);
  f.idb.controls.onCommit = ({ mode }) => { if (mode === "readwrite") f.context.actorId = "new-account"; };
  await assert.rejects(f.store.capture(f.value), cause => {
    assert.equal(cause.code, error("context-changed").code); assert.equal(Object.hasOwn(cause, "unconfirmedAdminPhotoTreeCopy"), false); return true;
  });
  assert.equal(f.idb.rows().size, 1); const bytes = rawRows(f);
  Object.assign(f.context, before); f.idb.controls.onCommit = () => {};
  assert.deepEqual(await f.create().read(saveId(f)), f.prepared); assert.deepEqual(rawRows(f), bytes);
  f.idb.controls.onGet = () => { f.context.generation = "changed-during-cold-read"; };
  await assert.rejects(f.store.read(saveId(f)), error("context-changed")); assert.deepEqual(rawRows(f), bytes);
});

test("each owner stage gets one immutable monotonic claim across concurrent tabs and cold reopen", async () => {
  const f = await fixture(); await f.store.capture(f.value);
  for (const stageId of stageIds(f)) {
    const pair = await Promise.all([f.store.claimStage(saveId(f), stageId), f.create().claimStage(saveId(f), stageId)]);
    assert.deepEqual(pair.map(claim => claim.fresh).sort(), [false, true]);
    const known = await f.create().claimStage(saveId(f), stageId); assert.equal(known.fresh, false);
    assert.equal(known.intentHash, f.prepared.intentHash); assert.equal(known.actionOperationId, saveId(f)); assert.equal(known.stageOperationId, stageId);
    assert.equal(known.assetDigest, f.input.action.body.photoCopy.owners.flatMap(owner => owner.photos).find(row => row.assetId === stageId).assetDigest);
  }
  assert.equal(f.idb.rows("stage-dispatches").size, 4); assert.equal(adds(f, "stage-dispatches"), 4);
  await assert.rejects(f.store.claimStage(saveId(f), randomUUID()), error("stage-missing"));
  await assert.rejects(f.store.claimStage(randomUUID(), stageIds(f)[0]), error("stage-missing"));
});

test("quota or async abort before stage commit keeps it unclaimed; lost committed claim readback never authorizes a fresh claim", async () => {
  const f = await fixture(); await f.store.capture(f.value); const before = rawRows(f), stageId = stageIds(f)[0];
  f.idb.controls.quota = true; await assert.rejects(f.store.claimStage(saveId(f), stageId)); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  f.idb.controls.quota = false; f.idb.controls.abortWrite = true;
  await assert.rejects(f.store.claimStage(saveId(f), stageId)); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  f.idb.controls.abortWrite = false;
  f.idb.controls.onGet = ({ mode, storeName }) => { if (mode === "readonly" && storeName === "stage-dispatches") throw Error("claim readback unknown"); };
  await assert.rejects(f.store.claimStage(saveId(f), stageId)); assert.equal(f.idb.rows("stage-dispatches").size, 1);
  const claims = rawRows(f, "stage-dispatches"), attemptedAdds = adds(f, "stage-dispatches"); f.idb.controls.onGet = () => {};
  assert.equal((await f.create().claimStage(saveId(f), stageId)).fresh, false);
  assert.equal(adds(f, "stage-dispatches"), attemptedAdds); assert.deepEqual(rawRows(f, "stage-dispatches"), claims); assert.deepEqual(rawRows(f), before);
});

test("stage claims retain exact action/hash/binding proof and are never overwritten after corruption or a changed action", async () => {
  for (const field of ["actionOperationId", "stageOperationId", "intentHash", "assetDigest", "bindingKey"]) {
    const f = await fixture(); await f.store.capture(f.value); const stageId = stageIds(f)[0]; await f.store.claimStage(saveId(f), stageId);
    const claim = [...f.idb.rows("stage-dispatches").values()][0]; claim[field] = "foreign";
    const bytes = rawRows(f, "stage-dispatches"); await assert.rejects(f.store.claimStage(saveId(f), stageId), error("claim-changed"));
    assert.deepEqual(rawRows(f, "stage-dispatches"), bytes);
  }
  const f = await fixture(); await f.store.capture(f.value);
  f.idb.controls.onCommit = ({ mode }) => { if (mode === "readonly") [...f.idb.rows().values()][0].intentHash = "0".repeat(64); };
  await assert.rejects(f.store.claimStage(saveId(f), stageIds(f)[0]), error("action-changed"));
  assert.equal(f.idb.rows("stage-dispatches").size, 0);
});

test("stage commit followed by actor change keeps no-repeat evidence for the original actor", async () => {
  const f = await fixture(); await f.store.capture(f.value); const before = clone(f.context), stageId = stageIds(f)[0];
  f.idb.controls.onCommit = ({ mode }) => { if (mode === "readwrite") f.context.actorId = "another-account"; };
  await assert.rejects(f.store.claimStage(saveId(f), stageId), error("context-changed"));
  assert.equal(f.idb.rows("stage-dispatches").size, 1);
  Object.assign(f.context, before); f.idb.controls.onCommit = () => {};
  assert.equal((await f.create().claimStage(saveId(f), stageId)).fresh, false); assert.equal(adds(f, "stage-dispatches"), 1);
});

test("tree storage never routes through the V1 copy store and refuses binary-shaped input before opening IDB", async () => {
  const f = await fixture(), old = createAdminTemplatePhotoCopyActionStore({ binding: f.input.binding, indexedDB: f.idb.indexedDB,
    getContext: () => f.context, enabled: true });
  await assert.rejects(f.store.capture({ ...f.value, files: [] }), error("capture-shape"));
  await assert.rejects(old.capture(f.value), { code: "admin-template-photo-copy-record" });
  assert.equal(f.idb.databases.size, 0);
});
