import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { encodeAdminTemplatePhotoWholeCopyRecord as encode, decodeAdminTemplatePhotoWholeCopyRecord as decode,
  prepareAdminTemplatePhotoWholeCopyRecord as prepare } from "../../src/sync/admin-template-photo-whole-copy-record.js";
import { encodeAdminTemplatePhotoTreeCopyRecord } from "../../src/sync/admin-template-photo-tree-copy-record.js";
import { wholeRecordInput, refreshWholeRecordDigests } from "../fixtures/admin-template-photo-whole-copy-record-fixture.js";

const blocked = { code: "admin-template-photo-whole-copy-record", isAdminTemplateBlocked: true };
const clone = structuredClone, hash = text => createHash("sha256").update(text).digest("hex");
const sourceMeta = f => f.snapshot.source.beforeState.layouts[f.snapshot.source.layoutId].adminCausalSource;
const rehash = (raw, change) => { const body = JSON.parse(raw.intentJson); change(body); raw.intentJson = canonical(body); raw.intentHash = hash(raw.intentJson); return raw; };

test("whole JSON codec proves the entire source catalog and retains only an absent target declaration", async () => {
  const f = await wholeRecordInput(), raw = await encode(f), result = await decode(raw, f.binding, f.action.operationId);
  assert.deepEqual(result, await prepare(f)); assert.equal(result.action.kind, "template.copy");
  assert.equal(result.action.body.base, null); assert.equal(result.stages.length, 5);
  assert.equal(result.snapshot.copiedOwners.length, 11);
  const source = result.snapshot.source;
  assert.deepEqual(source.beforeState, f.snapshot.source.beforeState);
  assert.equal(source.ownerMap.owners.length, 11);
  assert.deepEqual(Object.keys(result.snapshot.target).sort(), ["layoutId", "metadata", "serverLayoutId"]);
  assert.equal(Object.hasOwn(result.snapshot.target, "beforeState"), false);
  const owners = result.action.body.photoCopy.owners;
  assert.ok(owners.find(owner => owner.sourceEntityId === "detached-root").photos.length);
  assert.ok(owners.find(owner => owner.sourceEntityId === "item-unplaced").photos.length);
  assert.equal(owners.find(owner => owner.sourceEntityId === "z-free").photos.length, 0);
  assert.deepEqual(result.action.body.photoCopy.sourcePayload.layouts["source-layout"].arrangement,
    f.action.body.photoCopy.sourcePayload.layouts["source-layout"].arrangement);
  assert.equal(raw.intentHash, hash(raw.intentJson));
  assert.deepEqual(Object.keys(JSON.parse(raw.intentJson)).sort(), ["action", "binding", "kind", "snapshot", "stages", "version"]);
  assert.equal(Object.hasOwn(result, "files"), false); assert.equal(Object.hasOwn(result, "receipt"), false);
  await assert.rejects(encodeAdminTemplatePhotoTreeCopyRecord(f));
});

test("preparation and decode detach nested source, target and raw envelope before their first await", async () => {
  const f = await wholeRecordInput(), original = clone(f), promise = prepare(f);
  f.action.body.photoCopy.sourcePayload.items["item-a"].name = "late edit";
  f.snapshot.source.metadata.title = "late source"; f.snapshot.target.layoutId = "late-target";
  assert.deepEqual(await promise, await prepare(original));
  const raw = await encode(original), before = clone(raw), decodeBinding = clone(original.binding);
  const pending = decode(raw, decodeBinding, original.action.operationId);
  raw.intentJson = "{}"; raw.intentHash = "0".repeat(64); decodeBinding.actorId = "changed-after-await";
  assert.deepEqual(await pending, await decode(before, original.binding, original.action.operationId));
});

test("source actor, exact numeric revision, owner map and all pending/private guards are mandatory", async () => {
  const base = await wholeRecordInput();
  for (const mutate of [
    f => { sourceMeta(f).binding.actorId = "foreign"; },
    f => { sourceMeta(f).binding.environment = "production"; },
    f => { sourceMeta(f).base.stateRevision++; },
    f => { sourceMeta(f).visibility = "published"; },
    f => { sourceMeta(f).exists = false; },
    f => { sourceMeta(f).deleted = true; },
    f => { sourceMeta(f).planId = randomUUID(); },
    f => { sourceMeta(f).photoTreeCopyPending = false; },
    f => { sourceMeta(f).photoWholeCopyPending = {}; },
    f => { f.snapshot.source.ownerMap.owners[0].serverId = "unmapped-owner"; },
    f => { f.action.body.source.itemKey = "demo-state:foreign"; }
  ]) { const f = clone(base); mutate(f); await assert.rejects(prepare(f), blocked); }
});

test("opaque and unplaced source edits cannot be normalized away even after attacker recomputes raw digests", async () => {
  const base = await wholeRecordInput();
  for (const mutate of [
    f => { f.snapshot.source.beforeState.items[f.snapshot.copiedOwners.find(o => o.entityType === "item").sourceLocalId].opaque.untouched = "lost"; },
    f => { f.action.body.photoCopy.sourcePayload.items["item-unplaced"].quantity++; },
    f => { delete f.action.body.photoCopy.sourcePayload.containers["detached-root"].opaque; },
    f => { f.snapshot.source.beforeState.layouts[f.snapshot.source.layoutId].arrangement.opaqueArrangement.order.reverse(); }
  ]) { const f = clone(base); mutate(f); await refreshWholeRecordDigests(f); await assert.rejects(prepare(f), blocked); }
});

test("every local allocation is disjoint across types, raw IDs, stages and deterministic server IDs", async () => {
  const base = await wholeRecordInput();
  for (const collision of [base.snapshot.source.layoutId, "item-unplaced", "detached-root", base.snapshot.target.layoutId,
    base.action.operationId, base.action.body.photoCopy.owners[0].entityId,
    base.action.body.photoCopy.owners.flatMap(o => o.photos)[0].assetId]) {
    const f = clone(base); f.snapshot.copiedOwners[0].localId = collision; await assert.rejects(prepare(f), blocked);
  }
  for (const mutate of [
    f => { f.snapshot.target.layoutId = f.snapshot.source.layoutId; },
    f => { f.snapshot.target.serverLayoutId = "layout-wrong"; },
    f => { f.snapshot.target.beforeState = {}; },
    f => { f.snapshot.target.metadata.title = "other"; },
    f => { f.snapshot.copiedOwners[1].localId = f.snapshot.copiedOwners[0].localId; },
    f => { f.snapshot.copiedOwners.reverse(); },
    f => { f.snapshot.copiedOwners.pop(); },
    f => { f.snapshot.copiedOwners[0].sourceLocalId = f.snapshot.copiedOwners[1].sourceLocalId; }
  ]) { const f = clone(base); mutate(f); await assert.rejects(prepare(f), blocked); }
});

test("cold decoder rejects forged hashes, substituted stages and rehashed semantic corruption", async () => {
  const f = await wholeRecordInput(), raw = await encode(f);
  for (const changed of [
    { ...raw, intentHash: "0".repeat(64) }, { ...raw, kind: "admin-template-photo-tree-copy" },
    { ...raw, key: canonical([raw.bindingKey, randomUUID()]) }, { ...raw, intentJson: raw.intentJson + " " },
    rehash(clone(raw), value => { value.stages.reverse(); }),
    rehash(clone(raw), value => { value.stages[0].source.entityId = "item-a"; }),
    rehash(clone(raw), value => { value.action.body.photoCopy.owners.flatMap(owner => owner.photos)[0].assetDigest = "0".repeat(64); }),
    rehash(clone(raw), value => { value.snapshot.source.beforeState.containers[value.snapshot.copiedOwners[0].sourceLocalId].name = "forged"; }),
    rehash(clone(raw), value => { value.snapshot.target.base = { stateRevision: 0 }; })
  ]) await assert.rejects(decode(changed, f.binding, f.action.operationId), blocked);
  await assert.rejects(decode(raw, { ...f.binding, actorId: "foreign" }, f.action.operationId), blocked);
  await assert.rejects(decode(raw, f.binding, randomUUID()), blocked);
});

test("JSON-only exact envelope has a bounded 12 MiB limit and never accepts upload authority", async () => {
  const f = await wholeRecordInput(), raw = await encode(f);
  for (const change of [f => { f.files = [new Blob(["fake file"])]; }, f => { f.snapshot.source.extra = undefined; },
    f => { f.snapshot.target.stored = { fullBlobVerified: true }; }, f => { f.action.body.metadata.title = "x".repeat(13 * 1024 * 1024); }]) {
    const changed = clone(f); change(changed); await assert.rejects(prepare(changed), blocked);
  }
  const huge = " ".repeat(12 * 1024 * 1024 + 1);
  await assert.rejects(decode({ ...raw, intentJson: huge, intentHash: hash(huge) }, f.binding, f.action.operationId), blocked);
});

test("identical historical record reuses derivation but changed content is fully checked", async t => {
  const f = await wholeRecordInput();
  const other = await wholeRecordInput(); // Evict any fixture preparation.
  await prepare(other);
  const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  t.mock.method(crypto.subtle, "digest", (...args) => { calls++; return originalDigest(...args); });
  const first = await prepare(f), coldCalls = calls;
  calls = 0;
  const second = await prepare(structuredClone(f));
  assert.deepEqual(second, first);
  assert.ok(coldCalls > first.stages.length * 2, "cold proof checks every source reference and stage digest");
  assert.equal(calls, 1, "repeat exact content hashes only its completed envelope, not every historical photo again");
  second.snapshot.target.layoutId = "caller-mutation";
  second.stages[0].copyDigest = "0".repeat(64);
  assert.deepEqual(await prepare(f), first, "returned decoded objects cannot poison the private proof");
  const changed = structuredClone(f);
  changed.snapshot.target.layoutId = "valid-new-allocation";
  calls = 0;
  const updated = await prepare(changed);
  assert.ok(calls > first.stages.length * 2, "same UUID and binding with changed bytes must derive again");
  assert.notEqual(updated.intentHash, first.intentHash);
  assert.equal(updated.snapshot.target.layoutId, "valid-new-allocation");
  const corrupted = structuredClone(changed);
  corrupted.action.body.photoCopy.owners.find(o => o.photos.length).photos[0].assetDigest = "0".repeat(64);
  await assert.rejects(prepare(corrupted), blocked);
  delete corrupted.snapshot.source.beforeState;
  await assert.rejects(prepare(corrupted), blocked);
  assert.deepEqual(await prepare(f), first);
});
