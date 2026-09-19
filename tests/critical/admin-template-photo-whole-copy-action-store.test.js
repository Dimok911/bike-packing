import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { createAdminTemplatePhotoWholeCopyActionStore, readAdminTemplatePhotoWholeCopyActorInventory } from "../../src/sync/admin-template-photo-whole-copy-action-store.js";
import { encodeAdminTemplatePhotoWholeCopyRecord } from "../../src/sync/admin-template-photo-whole-copy-record.js";
import { wholeStoreFixture as fixture, wholeRecordInput, refreshWholeRecordDigests } from "../fixtures/admin-template-photo-whole-copy-record-fixture.js";

const blocked = code => ({ code: `admin-template-photo-whole-copy-storage-${code}`, isAdminTemplateBlocked: true });
const values = input => ({ action: input.action, snapshot: input.snapshot });
const op = f => f.input.action.operationId, stage = f => f.prepared.stages[0].operationId;
const rows = (f, store = "actions") => structuredClone([...f.idb.rows(store).values()]);
const adds = (f, store) => f.idb.requests.filter(row => row.operation === "add" && row.storeName === store).length;
async function sameTarget(f) {
  const next = await wholeRecordInput();
  next.binding = structuredClone(f.input.binding); next.action.itemKey = next.binding.itemKey; next.action.listId = next.binding.listId;
  await refreshWholeRecordDigests(next); return next;
}

test("whole capture and actor discovery retain all typed owners, absent target and original IDs without a plan or layout", async () => {
  const f = await fixture(), saved = await f.store.capture(f.value);
  assert.deepEqual(saved, f.prepared); assert.equal(saved.action.body.base, null); assert.equal(saved.snapshot.copiedOwners.length, 11);
  assert.deepEqual([...f.idb.databases.keys()], ["bike-packing-admin-template-photo-whole-copy-actions-v1"]);
  assert.equal(f.idb.transactions.find(tx => tx.mode === "readwrite").options.durability, "strict");
  assert.deepEqual(await f.create().read(op(f)), f.prepared); assert.deepEqual(await f.store.ids(), [op(f)]);
  assert.deepEqual((await f.store.readStage(op(f), stage(f))).stage, f.prepared.stages[0]);
  const found = await f.inventory(); assert.deepEqual(found, { bindings: [f.input.binding], records: [f.prepared] });
  assert.equal(Object.isFrozen(found.records[0].snapshot.source.beforeState), true);
  assert.equal(f.idb.rows("stage-dispatches").size, 0);
  assert.equal(Object.hasOwn(f.store, "delete"), false); assert.equal(Object.hasOwn(f.store, "cancel"), false);
});

test("default OFF denies new capture and claim but cold actor inventory discovers multiple absent targets", async () => {
  const f = await fixture(), defaults = createAdminTemplatePhotoWholeCopyActionStore({ binding: f.input.binding, getContext: () => f.context, indexedDB: f.idb.indexedDB });
  await assert.rejects(defaults.capture(f.value), blocked("disabled")); assert.equal(f.idb.databases.size, 0);
  await f.store.capture(f.value);
  const next = await wholeRecordInput(), nextContext = { ...f.context, ...next.binding };
  await f.create({ binding: next.binding, getContext: () => nextContext }).capture(values(next));
  const before = rows(f), off = f.create({ enabled: false });
  assert.deepEqual(await off.read(op(f)), f.prepared); await assert.rejects(off.claimStage(op(f), stage(f)), blocked("disabled"));
  const inventory = await f.inventory();
  assert.deepEqual(new Set(inventory.bindings.map(row => row.listId)), new Set([f.input.binding.listId, next.binding.listId]));
  assert.equal(inventory.records.length, 2); assert.deepEqual(rows(f), before);
});

test("quota retains detached immutable selection for an explicit same-ID retry and inserts no partial claims", async () => {
  const f = await fixture(), original = structuredClone(f.value); f.idb.controls.quota = true;
  const pending = f.store.capture(f.value); f.value.snapshot.target.layoutId = "late-target"; f.value.action.body.metadata.title = "late";
  let retained;
  await assert.rejects(pending, cause => { retained = cause.unconfirmedAdminPhotoWholeCopy; assert.deepEqual(retained, original); return cause.isAdminTemplateBlocked; });
  assert.equal(f.idb.rows().size, 0); assert.equal(f.idb.rows("stage-dispatches").size, 0);
  f.idb.controls.quota = false;
  assert.deepEqual(await f.create().capture(retained), f.prepared); assert.equal(f.idb.rows().size, 1);
});

test("failed open and aborted transaction leave no record; lost readback retains committed bytes for idempotent retry", async () => {
  const f = await fixture(); f.idb.controls.failOpen = true;
  await assert.rejects(f.store.capture(f.value)); assert.equal(f.idb.databases.size, 0); f.idb.controls.failOpen = false;
  f.idb.controls.abortWrite = true; await assert.rejects(f.store.capture(f.value), blocked("transaction-aborted"));
  assert.equal(f.idb.rows().size, 0); f.idb.controls.abortWrite = false;
  let committed = false;
  f.idb.controls.onCommit = ({ mode }) => { if (mode === "readwrite") committed = true; };
  f.idb.controls.onGet = ({ mode }) => { if (mode === "readonly" && committed) throw Error("lost readback"); };
  await assert.rejects(f.store.capture(f.value)); const before = rows(f); assert.equal(before.length, 1);
  f.idb.controls.onGet = () => {};
  assert.deepEqual(await f.create().capture(f.value), f.prepared); assert.deepEqual(rows(f), before);
});

test("concurrent different UUID creations of one absent binding have one winner; same-ID concurrent retries add nothing", async () => {
  const f = await fixture(), next = await sameTarget(f);
  const results = await Promise.allSettled([f.store.capture(f.value), f.create().capture(values(next))]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.code, blocked("target-already-captured").code);
  const winner = results.find(r => r.status === "fulfilled").value, before = rows(f);
  const retried = await Promise.all([f.store.capture(values(winner)), f.create().capture(values(winner))]);
  assert.ok(retried.every(r => r.intentHash === winner.intentHash)); assert.equal(adds(f, "actions"), 1); assert.deepEqual(rows(f), before);
});

test("same UUID with changed valid body or local allocation is refused without altering original bytes", async () => {
  const f = await fixture(); await f.store.capture(f.value); const before = rows(f);
  const changed = structuredClone(f.input); changed.action.body.metadata.title = "Another valid copy"; changed.snapshot.target.metadata.title = changed.action.body.metadata.title;
  await refreshWholeRecordDigests(changed);
  await assert.rejects(f.store.capture(values(changed)), blocked("operation-id-reused"));
  const local = structuredClone(f.value); local.snapshot.target.layoutId = "other-local";
  await assert.rejects(f.store.capture(local), blocked("operation-id-reused"));
  assert.deepEqual(rows(f), before); assert.deepEqual(await f.store.read(op(f)), f.prepared);
});

test("claim is atomic with exact retained record and simultaneous cold callers receive only one fresh dispatch grant", async () => {
  const f = await fixture(); await f.store.capture(f.value);
  const claims = await Promise.all([f.store.claimStage(op(f), stage(f)), f.create().claimStage(op(f), stage(f))]);
  assert.deepEqual(claims.map(c => c.fresh).sort(), [false, true]);
  const expected = { key: canonical([canonical(f.input.binding), op(f), stage(f)]), bindingKey: canonical(f.input.binding),
    actionOperationId: op(f), stageOperationId: stage(f), intentHash: f.prepared.intentHash,
    assetDigest: f.input.action.body.photoCopy.owners.flatMap(o => o.photos)[0].assetDigest };
  for (const { fresh, ...claim } of claims) assert.deepEqual(claim, expected);
  assert.equal(adds(f, "stage-dispatches"), 1);
  const original = rows(f); assert.equal((await f.create().claimStage(op(f), stage(f))).fresh, false); assert.deepEqual(rows(f), original);
});

test("claim quota and lost final acknowledgment never erase the action or authorize an automatic repeated POST", async () => {
  const f = await fixture(); await f.store.capture(f.value); const before = rows(f);
  f.idb.controls.quota = true; await assert.rejects(f.store.claimStage(op(f), stage(f)));
  assert.equal(f.idb.rows("stage-dispatches").size, 0); assert.deepEqual(rows(f), before); f.idb.controls.quota = false;
  let committed = false;
  f.idb.controls.onCommit = ({ mode, names }) => { if (mode === "readwrite" && names.includes("stage-dispatches")) committed = true; };
  f.idb.controls.onGet = ({ mode, storeName }) => { if (committed && mode === "readonly" && storeName === "stage-dispatches") throw Error("claim acknowledgment lost"); };
  await assert.rejects(f.store.claimStage(op(f), stage(f)));
  assert.equal(f.idb.rows("stage-dispatches").size, 1); f.idb.controls.onGet = () => {};
  assert.equal((await f.create().claimStage(op(f), stage(f))).fresh, false); assert.deepEqual(rows(f), before);
});

test("tampered stage claims and foreign parent or stage IDs are barriers and remain retained", async () => {
  const f = await fixture(); await f.store.capture(f.value); await f.store.claimStage(op(f), stage(f));
  const claim = [...f.idb.rows("stage-dispatches").values()][0]; claim.intentHash = "0".repeat(64); const before = rows(f, "stage-dispatches");
  await assert.rejects(f.store.claimStage(op(f), stage(f)), blocked("claim-changed"));
  await assert.rejects(f.store.claimStage(randomUUID(), stage(f)), blocked("stage-missing"));
  await assert.rejects(f.store.claimStage(op(f), randomUUID()), blocked("stage-missing"));
  assert.deepEqual(rows(f, "stage-dispatches"), before);
});

test("cold malformed own record never disappears behind ID enumeration or an OFF actor scan", async () => {
  for (const fault of ["hash", "kind", "json", "key"]) {
    const f = await fixture(); await f.store.capture(f.value); const raw = [...f.idb.rows().values()][0];
    if (fault === "hash") raw.intentHash = "0".repeat(64);
    if (fault === "kind") raw.kind = "admin-template-photo-tree-copy";
    if (fault === "json") raw.intentJson = "{";
    if (fault === "key") raw.key = canonical([raw.bindingKey, randomUUID()]);
    const before = rows(f);
    for (const run of [() => f.store.read(op(f)), () => f.store.ids(), () => f.store.readStage(op(f), stage(f)),
      () => f.store.claimStage(op(f), stage(f)), () => f.store.capture(f.value), () => f.inventory()])
      await assert.rejects(run(), { isAdminTemplateBlocked: true });
    assert.deepEqual(rows(f), before);
  }
});

test("actor inventory skips consistently routed foreign private bytes but rejects an unclassifiable header", async () => {
  const f = await fixture(); await f.store.capture(f.value);
  const foreign = { ...rows(f)[0] }, binding = { ...f.input.binding, actorId: "different-actor" };
  foreign.bindingKey = canonical(binding); foreign.key = canonical([foreign.bindingKey, randomUUID()]); foreign.intentJson = "PRIVATE UNREADABLE BY THIS ACTOR";
  f.idb.rows().set(foreign.key, foreign);
  assert.deepEqual((await f.inventory()).records, [f.prepared]); assert.deepEqual(await f.store.ids(), [op(f)]);
  await assert.rejects(f.inventory({ actorId: binding.actorId, getContext: () => ({ ...f.context, actorId: binding.actorId }) }), { isAdminTemplateBlocked: true });
  foreign.bindingKey = "{";
  await assert.rejects(f.inventory(), blocked("record-key")); assert.equal(f.idb.rows().size, 2);
});

test("actor discovery rechecks exact selected key inventory and bytes after asynchronous full decode", async () => {
  for (const fault of ["delete", "replace", "add"]) {
    const f = await fixture(); await f.store.capture(f.value);
    const changed = structuredClone(f.input); changed.snapshot.target.layoutId = "replacement-local";
    const replacement = await encodeAdminTemplatePhotoWholeCopyRecord(changed), next = await wholeRecordInput();
    const addition = await encodeAdminTemplatePhotoWholeCopyRecord(next), oldKey = rows(f)[0].key;
    let altered = false;
    f.idb.controls.onCommit = ({ mode }) => { if (mode === "readonly" && !altered) {
      altered = true;
      if (fault === "delete") f.idb.rows().delete(oldKey);
      if (fault === "replace") f.idb.rows().set(oldKey, replacement);
      if (fault === "add") f.idb.rows().set(addition.key, addition);
    } };
    await assert.rejects(f.inventory(), blocked("inventory-changed"));
  }
});

test("bound read and enumeration reblock when a previously decoded action vanishes", async () => {
  for (const run of [f => f.store.read(op(f)), f => f.store.ids(), f => f.store.readStage(op(f), stage(f))]) {
    const f = await fixture(); await f.store.capture(f.value); const key = rows(f)[0].key;
    let removed = false; f.idb.controls.onCommit = ({ mode }) => { if (mode === "readonly" && !removed) { removed = true; f.idb.rows().delete(key); } };
    await assert.rejects(run(f), blocked("inventory-changed"));
  }
});

test("actor or generation loss fails after awaits, preserves committed storage and refuses asynchronous context grants", async () => {
  const f = await fixture(); f.idb.controls.onCommit = ({ mode }) => { if (mode === "readwrite") f.context.generation = "new-session"; };
  await assert.rejects(f.store.capture(f.value), blocked("context-changed"));
  assert.equal(f.idb.rows().size, 1); f.idb.controls.onCommit = () => {};
  assert.deepEqual(await f.create().read(op(f)), f.prepared);
  f.context.admin = false; await assert.rejects(f.inventory(), blocked("context-changed")); f.context.admin = true;
  let unhandled = false; const listener = () => { unhandled = true; }; process.on("unhandledRejection", listener);
  try {
    await assert.rejects(f.inventory({ getContext: () => Promise.reject(Error("async denied")) }), blocked("context-changed"));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(unhandled, false);
  } finally { process.off("unhandledRejection", listener); }
  assert.equal(f.idb.rows().size, 1);
});

test("reused connection keeps two fresh transactions per read and releases on version change or close", async () => {
  const f = await fixture(), native = f.idb.indexedDB.open.bind(f.idb.indexedDB), opened = [];
  f.idb.indexedDB.open = (...args) => { const request = native(...args); opened.push(request); return request; };
  await f.store.capture(f.value);
  const before = f.idb.transactions.length;
  for (let i = 0; i < 3; i++) assert.deepEqual(await f.create().read(op(f)), f.prepared);
  assert.equal(opened.length, 1);
  assert.equal(f.idb.transactions.length - before, 6, 'each read retains both current-value transactions');
  opened[0].result.onversionchange();
  assert.deepEqual(await f.store.read(op(f)), f.prepared); assert.equal(opened.length, 2);
  opened[1].result.onclose();
  assert.deepEqual(await f.store.read(op(f)), f.prepared); assert.equal(opened.length, 3);
  f.context.generation = 'new-context';
  let changed = false;
  f.idb.controls.onCommit = () => { if (!changed) { changed = true; f.context.generation = 'changed-during-read'; } };
  await assert.rejects(f.store.read(op(f)), blocked('context-changed'));
});

test("reused native connection never reuses a record or actor inventory observation", async () => {
  for (const change of ['remove', 'replace', 'add']) {
    const f = await fixture(); await f.store.capture(f.value); await f.store.read(op(f)); await f.inventory();
    const raw = rows(f)[0];
    if (change === 'remove') { f.idb.rows().delete(raw.key); assert.equal(await f.store.read(op(f)), null); }
    if (change === 'replace') { f.idb.rows().get(raw.key).intentHash = '0'.repeat(64); await assert.rejects(f.store.read(op(f))); }
    if (change === 'add') { f.idb.rows().set('added-invalid-record', { ...raw, key: 'added-invalid-record' }); await assert.rejects(f.inventory()); }
  }
});
