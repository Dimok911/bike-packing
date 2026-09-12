import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { encodeAdminTemplatePhotoCopyRecord, decodeAdminTemplatePhotoCopyRecord, prepareAdminTemplatePhotoCopyRecord } from "../../src/sync/admin-template-photo-copy-record.js";
import { adminTemplatePhotoCopyIntent, adminTemplatePhotoCopyStageManifests, adminTemplatePhotoCopyStageDigest } from "../../src/sync/admin-template-photo-copy-protocol.js";
import { adminPhotoCopyRecordInput } from "../fixtures/admin-template-photo-copy-record-fixture.js";
import { hash } from "../fixtures/admin-template-photo-copy-fixture.js";

const blocked = { code: "admin-template-photo-copy-record", isAdminTemplateBlocked: true };
const encode = input => encodeAdminTemplatePhotoCopyRecord(input);
const source = input => input.snapshot.source.beforeState.layouts[input.snapshot.source.layoutId].adminCausalSource;
async function observeDigests(run) {
  const subtle = crypto.subtle, own = Object.getOwnPropertyDescriptor(subtle, "digest"), original = subtle.digest, inputs = [];
  Object.defineProperty(subtle, "digest", { configurable: true, value(algorithm, data) {
    assert.equal(algorithm, "SHA-256");
    inputs.push(createHash("sha256").update(Buffer.from(data)).digest("hex"));
    return original.call(this, algorithm, data);
  } });
  try { return { value: await run(), inputs }; }
  finally { if (own) Object.defineProperty(subtle, "digest", own); else delete subtle.digest; }
}
async function redigest(input) {
  input.action.body.photoCopy.source.payloadDigest = hash(input.action.body.photoCopy.source.payload);
  const manifests = await adminTemplatePhotoCopyStageManifests(adminTemplatePhotoCopyIntent({ ...input.binding, ...input.action }));
  for (const [index, manifest] of manifests.entries()) input.action.body.photoCopy.assets[index].assetDigest = await adminTemplatePhotoCopyStageDigest(manifest);
}

for (const entityType of ["item", "container"]) test(`${entityType} copy records use real projector maps, preserve both exact sources, and create no optimistic owner or file proof`, async () => {
  const input = await adminPhotoCopyRecordInput({ entityType }), before = structuredClone(input), raw = await encode(input);
  const result = await decodeAdminTemplatePhotoCopyRecord(raw, input.binding, input.action.operationId);
  assert.deepEqual(input, before); assert.deepEqual(result.action, input.action); assert.deepEqual(result.snapshot, input.snapshot);
  assert.equal(result.stages.length, 2); assert.equal(result.stages[0].kind, "admin-template-photo-copy");
  assert.equal(result.stages[0].templateOperationId, input.action.operationId);
  assert.equal(result.stages[0].source.entityId, input.action.body.photoCopy.source.entityId);
  assert.equal(result.stages[0].target.entityId, input.snapshot.copiedOwner.serverId);
  assert.equal(Object.hasOwn(result, "files"), false); assert.equal(Object.hasOwn(result.stages[0], "stored"), false);
  assert.equal(Object.hasOwn(result.snapshot, "state"), false);
  for (const type of ["layouts", "items", "containers"]) assert.equal(Object.hasOwn(result.snapshot.target.beforeState[type], input.snapshot.copiedOwner.localId), false);
  assert.deepEqual(result.action.body.photoCopy.source.payload.layouts.source.locations, ["raw layout mirror"]);
  assert.deepEqual(result.snapshot.source.beforeState.locations, ["different source dictionary"]);
  result.snapshot.target.metadata.title = "caller mutation";
  assert.deepEqual((await decodeAdminTemplatePhotoCopyRecord(raw, input.binding, input.action.operationId)).snapshot, before.snapshot);
});

test("prepare freezes both namespaces and final IDs before the first digest await", async () => {
  const input = await adminPhotoCopyRecordInput(), before = structuredClone(input), pending = prepareAdminTemplatePhotoCopyRecord(input);
  input.action.body.photoCopy.fields.name = "late edit"; input.snapshot.source.metadata.title = "changed during await";
  const result = await pending;
  assert.deepEqual(result.action, before.action); assert.deepEqual(result.snapshot, before.snapshot);
});

test("each codec operation hashes every required proof once without repeated derivation or retained authority", async () => {
  for (const entityType of ["item", "container"]) {
    const input = await adminPhotoCopyRecordInput({ entityType }), raw = await encode(input), envelope = JSON.parse(raw.intentJson);
    const intent = adminTemplatePhotoCopyIntent({ ...input.binding, ...input.action }), selected = intent.body.photoCopy.source;
    const photos = selected.payload[entityType === "item" ? "items" : "containers"][selected.entityId].photos;
    const required = [selected.payload, intent.body.payload, ...photos, ...envelope.stages, envelope].map(hash).sort();
    const expected = await decodeAdminTemplatePhotoCopyRecord(raw, input.binding, input.action.operationId);
    for (const [name, run, result] of [
      ["encode", () => encode(input), raw],
      ["decode", () => decodeAdminTemplatePhotoCopyRecord(raw, input.binding, input.action.operationId), expected],
      ["prepare", () => prepareAdminTemplatePhotoCopyRecord(input), expected]
    ]) {
      // Repeat the same UUID and bytes: every invocation still reads and hashes
      // all its own proof inputs, rather than consulting a prior-ID cache.
      for (let repeat = 0; repeat < 2; repeat++) {
        const measured = await observeDigests(run);
        assert.deepEqual(measured.value, result, `${entityType} ${name} representation`);
        assert.deepEqual(measured.inputs.sort(), required, `${entityType} ${name} proof inputs`);
        assert.equal(measured.inputs.length, 2 * photos.length + 3);
      }
    }
  }
});

test("encode and cold decode detach nested input, raw bytes and binding before their first await", async () => {
  const input = await adminPhotoCopyRecordInput(), original = structuredClone(input), preparing = encode(input);
  input.action.body.photoCopy.assets[0].assetId = randomUUID();
  input.snapshot.target.beforeState.layouts[input.snapshot.target.layoutId].name = "Late target edit";
  const raw = await preparing, binding = structuredClone(original.binding), reading = decodeAdminTemplatePhotoCopyRecord(raw, binding, original.action.operationId);
  raw.intentJson = "{\"late\":true}"; raw.intentHash = "0".repeat(64); binding.actorId = "late actor";
  const value = await reading;
  assert.deepEqual(value.action, original.action); assert.deepEqual(value.snapshot, original.snapshot); assert.deepEqual(value.binding, original.binding);
  await assert.rejects(decodeAdminTemplatePhotoCopyRecord(raw, original.binding, original.action.operationId), blocked);
  await assert.rejects(encode(input), blocked);
});

test("a prior valid decode cannot bless a rehashed wrong source, asset digest, stage order or envelope field", async () => {
  const input = await adminPhotoCopyRecordInput(), raw = await encode(input);
  const expected = await decodeAdminTemplatePhotoCopyRecord(raw, input.binding, input.action.operationId);
  for (const mutate of [
    value => { value.action.body.photoCopy.source.payloadDigest = "0".repeat(64); },
    value => { value.action.body.photoCopy.assets[0].assetDigest = "0".repeat(64); },
    value => { value.stages.reverse(); },
    value => { value.stages[0].target.photoId = value.stages[1].target.photoId; },
    value => { value.version = 2; },
    value => { value.receipt = { operationCannotApply: true }; }
  ]) {
    const value = JSON.parse(raw.intentJson); mutate(value);
    const changed = { ...raw, intentJson: canonicalTemplateJson(value), intentHash: hash(value) };
    await assert.rejects(decodeAdminTemplatePhotoCopyRecord(changed, input.binding, input.action.operationId), blocked);
    assert.deepEqual(await decodeAdminTemplatePhotoCopyRecord(raw, input.binding, input.action.operationId), expected);
  }
});

test("cold byte and canonical-envelope limits stay strict and oversized UTF-8 is rejected before hashing", async () => {
  const input = await adminPhotoCopyRecordInput(), raw = await encode(input);
  for (const mutate of [
    value => { value.intentJson += " "; value.intentHash = createHash("sha256").update(value.intentJson).digest("hex"); },
    value => { value.intentHash = value.intentHash.toUpperCase(); },
    value => { value.version = 2; },
    value => { value.key += " "; },
    value => { value.bindingKey += " "; }
  ]) {
    const changed = structuredClone(raw); mutate(changed);
    await assert.rejects(decodeAdminTemplatePhotoCopyRecord(changed, input.binding, input.action.operationId), blocked);
  }
  const oversized = { ...raw, intentJson: "я".repeat(6 * 1024 * 1024) + "x" };
  assert.ok(oversized.intentJson.length < 12 * 1024 * 1024);
  const measured = await observeDigests(() => assert.rejects(decodeAdminTemplatePhotoCopyRecord(oversized, input.binding, input.action.operationId), blocked));
  assert.equal(measured.inputs.length, 0);
});

test("unsaved source and target owner business edits, missing opaque fields and dictionary/packed changes cannot normalize away", async () => {
  const original = await adminPhotoCopyRecordInput();
  for (const sideName of ["source", "target"]) for (const mutate of [
    side => { side.beforeState.items[side.ownerMap.owners.find(row => row.type === "items").localId].name = "UNSAVED"; },
    side => { delete side.beforeState.items[side.ownerMap.owners.find(row => row.serverId === "old-item").localId].opaque; },
    side => { side.beforeState.locations.push("unsaved dictionary"); },
    side => { side.beforeState.layouts[side.layoutId].arrangement.unknown = ["changed"]; },
    side => { side.beforeState.packedItems = {}; },
    side => { side.beforeState.layouts[side.layoutId].name = "unsaved metadata"; }
  ]) {
    const input = structuredClone(original); mutate(input.snapshot[sideName]); await assert.rejects(encode(input), blocked);
  }
});

test("photo baseline/raw references and complete live photo views stay exact", async () => {
  const original = await adminPhotoCopyRecordInput();
  const selected = original.snapshot.copiedOwner.sourceLocalId;
  for (const mutate of [
    input => { input.snapshot.source.beforeState.items[selected].photos.reverse(); },
    input => { input.snapshot.source.beforeState.items[selected].photos[0].fileName = "edited.jpg"; },
    input => { input.snapshot.source.beforeState.items[selected].photos[0].unexpected = true; },
    input => { source(input).photoView.owners.find(row => row.localId === selected).rawPhotos[0].createdAt = null; },
    input => { input.action.body.photoCopy.source.payload.items["old-item"].opaque = "different server source"; }
  ]) { const input = structuredClone(original); mutate(input); await redigest(input); await assert.rejects(encode(input), blocked); }
});

test("a forged view baseline cannot bless a changed filename/unknown field even when the live photo matches it", async () => {
  const original = await adminPhotoCopyRecordInput(), localId = original.snapshot.copiedOwner.sourceLocalId;
  for (const [key, value] of [["fileName", "unsaved-name.jpg"], ["unexpected", { hidden: true }], ["size", 999]]) {
    const input = structuredClone(original), baseline = source(input).photoView.owners.find(row => row.localId === localId);
    baseline.viewPhotos[0][key] = value; input.snapshot.source.beforeState.items[localId].photos[0][key] = value;
    await assert.rejects(encode(input), blocked);
  }
});

test("private confirmed actor, numeric base and pending source fences apply to both complete namespaces", async () => {
  const original = await adminPhotoCopyRecordInput();
  for (const sideName of ["source", "target"]) for (const mutate of [
    value => { value.binding.actorId = "foreign-actor"; }, value => { value.binding.environment = "other"; },
    value => { value.binding.listId = "public-demo-state-other"; }, value => { value.base.stateRevision++; },
    value => { value.base.operationId = randomUUID(); }, value => { value.planId = randomUUID(); },
    value => { value.visibility = "public"; }, value => { value.deleted = true; },
    value => { value.photoCreatePending = {}; }, value => { value.photoCopyPending = {}; }
  ]) {
    const input = structuredClone(original), side = input.snapshot[sideName]; mutate(side.beforeState.layouts[side.layoutId].adminCausalSource);
    await assert.rejects(encode(input), blocked);
  }
});

test("source mapping must select the exact owner and cannot infer identity from sharedSourceId", async () => {
  const input = await adminPhotoCopyRecordInput(), other = input.snapshot.source.ownerMap.owners.find(row => row.serverId === "detached");
  input.snapshot.copiedOwner.sourceLocalId = other.localId;
  input.snapshot.source.beforeState.items[other.localId].sharedSourceId = input.action.body.photoCopy.source.entityId;
  await assert.rejects(encode(input), blocked);
});

test("new local ID collisions in either namespace and foreign/detached owner injection are rejected", async () => {
  const original = await adminPhotoCopyRecordInput();
  for (const sideName of ["source", "target"]) {
    for (const type of ["layouts", "items", "containers"]) {
      const input = structuredClone(original); input.snapshot.copiedOwner.localId = Object.keys(input.snapshot[sideName].beforeState[type])[0];
      await assert.rejects(encode(input), blocked);
    }
    const input = structuredClone(original), side = input.snapshot[sideName];
    side.beforeState.items.foreign = { id: "foreign", publicCatalogLayoutId: "other-editor", photos: [] };
    await assert.rejects(encode(input), blocked);
  }
});

test("JSON derivative discriminator rejects binary/receipt/candidate fields and unfinalized manifest digests", async () => {
  const original = await adminPhotoCopyRecordInput();
  for (const mutate of [
    input => { input.files = []; }, input => { input.snapshot.state = structuredClone(input.snapshot.target.beforeState); },
    input => { input.snapshot.receipt = { stored: { hash: "0".repeat(64) } }; },
    input => { input.action.body.photoCopy.assets[0].assetDigest = "0".repeat(64); }
  ]) { const input = structuredClone(original); mutate(input); await assert.rejects(encode(input), blocked); }
});

test("cold decode verifies canonical envelope hash plus source/mapping semantics even after a tamperer recomputes the outer hash", async () => {
  const input = await adminPhotoCopyRecordInput(), raw = await encode(input);
  const damaged = structuredClone(raw); damaged.intentHash = "f".repeat(64);
  await assert.rejects(decodeAdminTemplatePhotoCopyRecord(damaged, input.binding, input.action.operationId), blocked);
  const value = JSON.parse(raw.intentJson); value.snapshot.source.beforeState.items[input.snapshot.copiedOwner.sourceLocalId].weight = 1000;
  const { canonicalTemplateJson } = await import("../../src/sync/admin-template-protocol.js");
  damaged.intentJson = canonicalTemplateJson(value); damaged.intentHash = hash(value);
  await assert.rejects(decodeAdminTemplatePhotoCopyRecord(damaged, input.binding, input.action.operationId), blocked);
  const forgedStage = JSON.parse(raw.intentJson); forgedStage.stages[0].stored = { hash: "0".repeat(64) };
  damaged.intentJson = canonicalTemplateJson(forgedStage); damaged.intentHash = hash(forgedStage);
  await assert.rejects(decodeAdminTemplatePhotoCopyRecord(damaged, input.binding, input.action.operationId), blocked);
  await assert.rejects(decodeAdminTemplatePhotoCopyRecord(raw, { ...input.binding, actorId: "foreign" }, input.action.operationId), blocked);
  await assert.rejects(decodeAdminTemplatePhotoCopyRecord(raw, input.binding, randomUUID()), blocked);
});
