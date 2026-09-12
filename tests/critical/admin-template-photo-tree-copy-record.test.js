import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { encodeAdminTemplatePhotoTreeCopyRecord as encode, decodeAdminTemplatePhotoTreeCopyRecord as decode,
  prepareAdminTemplatePhotoTreeCopyRecord as prepare } from "../../src/sync/admin-template-photo-tree-copy-record.js";
import { encodeAdminTemplatePhotoCopyRecord as encodeV1, decodeAdminTemplatePhotoCopyRecord as decodeV1,
  assertAdminTemplatePhotoCopyEditor as assertEditor } from "../../src/sync/admin-template-photo-copy-record.js";
import { adminPhotoTreeCopyRecordInput as fixture, refreshTreeRecordDigests } from "../fixtures/admin-template-photo-tree-copy-record-fixture.js";
import { adminPhotoCopyRecordInput as v1Fixture } from "../fixtures/admin-template-photo-copy-record-fixture.js";

const blocked = { code: "admin-template-photo-tree-copy-record", isAdminTemplateBlocked: true };
const clone = value => structuredClone(value), byteHash = value => createHash("sha256").update(value).digest("hex");
const source = side => side.beforeState.layouts[side.layoutId].adminCausalSource;
const local = (side, type, serverId) => side.ownerMap.owners.find(row => row.type === type && row.serverId === serverId).localId;
const read = (record, input) => decode(record, input.binding, input.action.operationId);
const rehash = (record, mutate) => {
  const envelope = JSON.parse(record.intentJson); mutate(envelope);
  const intentJson = canonical(envelope); return { ...record, intentJson, intentHash: byteHash(intentJson) };
};

test("real projector tree record preserves every old namespace and ordered mapping, including photo-free owners", async () => {
  const input = await fixture(), before = clone(input), raw = await encode(input), result = await read(raw, input);
  assert.deepEqual(input, before); assert.deepEqual(result.action, input.action); assert.deepEqual(result.snapshot, input.snapshot);
  assert.equal(result.snapshot.copiedOwners.length, 5); assert.equal(result.stages.length, 4);
  assert.ok(input.action.body.photoCopy.owners.some(owner => owner.photos.length === 0));
  assert.equal(raw.kind, "admin-template-photo-tree-copy");
  assert.equal(result.stages.every(stage => stage.version === 2 && stage.kind === raw.kind && stage.templateOperationId === input.action.operationId), true);
  assert.deepEqual(result.stages.map(stage => stage.target.entityId), input.action.body.photoCopy.owners.flatMap(owner => owner.photos.map(() => owner.entityId)));
  assert.deepEqual(result.action.body.photoCopy.source.payload.layouts["source-layout"].locations, ["raw divergent mirror"]);
  assert.deepEqual(result.snapshot.source.beforeState.locations, ["source dictionary"]);
  assert.deepEqual(result.action.body.photoCopy.source.payload.containers.neighbor.photos[0].futureMetadata, { keep: true });
  assert.equal(result.action.body.payload.items["target-item"].photos[0].futureMetadata, 8);
  for (const side of [result.snapshot.source, result.snapshot.target]) for (const collection of ["layouts", "items", "containers"])
    for (const owner of result.snapshot.copiedOwners) assert.equal(Object.hasOwn(side.beforeState[collection], owner.localId), false);
  assert.equal(Object.hasOwn(result.snapshot, "state"), false); assert.equal(Object.hasOwn(result, "files"), false);
  assert.equal(Object.hasOwn(result.stages[0], "stored"), false);
  assert.deepEqual(await prepare(input), result);
  assert.equal(raw.intentJson, canonical(JSON.parse(raw.intentJson))); assert.equal(raw.intentHash, byteHash(raw.intentJson));
});

test("prepare, encode and cold decode detach both snapshots, body and binding before the first await", async () => {
  for (const run of [prepare, encode]) {
    const input = await fixture(), before = clone(input), pending = run(input);
    input.action.body.photoCopy.fields.name = "late caller edit";
    input.action.body.photoCopy.owners[0].photos[0].assetId = randomUUID();
    source(input.snapshot.source).binding.actorId = "late actor";
    input.snapshot.copiedOwners[0].localId = "late-local";
    const output = await pending, result = run === encode ? await read(output, before) : output;
    assert.deepEqual(result.action, before.action); assert.deepEqual(result.snapshot, before.snapshot);
  }
  const input = await fixture(), raw = await encode(input), original = clone(raw), binding = clone(input.binding), pending = decode(raw, binding, input.action.operationId);
  raw.intentJson = "{}"; raw.intentHash = "0".repeat(64); binding.actorId = "foreign";
  const result = await pending; assert.deepEqual(result.action, input.action); assert.deepEqual(result.binding, input.binding);
  result.snapshot.target.metadata.title = "caller changed result";
  assert.deepEqual((await read(original, input)).snapshot, input.snapshot);
  await assert.rejects(read(raw, input), blocked);
});

test("all old business, opaque, metadata, dictionary and arrangement fields remain exact on both sides", async () => {
  const original = await fixture();
  for (const sideName of ["source", "target"]) for (const mutate of [
    side => { Object.values(side.beforeState.items)[0].name = "dirty business"; },
    side => { delete Object.values(side.beforeState.containers)[0].opaque; },
    side => { side.beforeState.locations.push("unsaved"); },
    side => { side.beforeState.layouts[side.layoutId].arrangement.opaque.keep = "changed"; },
    side => { side.beforeState.layouts[side.layoutId].arrangement.rootContainerIds.reverse(); Object.values(side.beforeState.layouts[side.layoutId].arrangement.containers)[0].opaque = "changed"; },
    side => { side.beforeState.packedItems = {}; },
    side => { side.beforeState.layouts[side.layoutId].name = "different title"; }
  ]) {
    const input = clone(original); mutate(input.snapshot[sideName]); await assert.rejects(encode(input), blocked);
  }
  const input = clone(original); input.snapshot.target.metadata.title = "Different body metadata";
  input.snapshot.target.beforeState.layouts[input.snapshot.target.layoutId].name = input.snapshot.target.metadata.title;
  await assert.rejects(encode(input), blocked);
});

test("dirty live photos and a forged matching display baseline cannot bypass raw reference derivation", async () => {
  const original = await fixture();
  for (const sideName of ["source", "target"]) for (const field of ["fileName", "size", "unknownPhotoField"]) {
    const input = clone(original), side = input.snapshot[sideName], view = source(side).photoView.owners[0], value = field === "size" ? 777 : "edited";
    side.beforeState[view.type][view.localId].photos[0][field] = value;
    view.viewPhotos[0][field] = value;
    await assert.rejects(encode(input), blocked);
  }
  for (const sideName of ["source", "target"]) {
    const input = clone(original), side = input.snapshot[sideName]; source(side).photoView.owners[0].rawPhotos[0].createdAt = "forged";
    await assert.rejects(encode(input), blocked);
  }
});

test("re-digesting a changed raw source or target cannot bless stale editor business or photo proofs", async () => {
  const original = await fixture();
  for (const mutate of [
    input => { input.action.body.photoCopy.source.payload.items.detached.opaque.keep = "changed"; },
    input => { input.action.body.photoCopy.source.payload.containers["source-bag-0"].photos[0].createdAt = null; },
    input => { input.action.body.payload.items["target-item"].name = "new server text"; },
    input => { input.action.body.payload.layouts["target-layout"].arrangement.opaque = { changed: true }; }
  ]) { const input = clone(original); mutate(input); await refreshTreeRecordDigests(input); await assert.rejects(encode(input), blocked); }
});

test("copiedOwners is complete, ordered and proven against the actual source map for every owner", async () => {
  const original = await fixture();
  for (const mutate of [
    input => { input.snapshot.copiedOwners.pop(); },
    input => { input.snapshot.copiedOwners.reverse(); },
    input => { input.snapshot.copiedOwners[0].serverId = input.snapshot.copiedOwners[1].serverId; },
    input => { input.snapshot.copiedOwners[0].entityType = "item"; },
    input => { input.snapshot.copiedOwners[0].sourceLocalId = local(input.snapshot.source, "containers", "neighbor"); },
    input => { input.snapshot.copiedOwners[0].localId = input.snapshot.copiedOwners[1].localId; },
    input => { input.snapshot.copiedOwners[0].localId = "constructor"; },
    input => { input.snapshot.copiedOwners[0].proven = true; }
  ]) { const input = clone(original); mutate(input); await assert.rejects(encode(input), blocked); }
});

test("new local allocations cannot alias any layout, item or container in either complete namespace", async () => {
  const original = await fixture();
  for (const sideName of ["source", "target"]) for (const collection of ["layouts", "items", "containers"]) {
    const input = clone(original); input.snapshot.copiedOwners[0].localId = Object.keys(input.snapshot[sideName].beforeState[collection])[0];
    await assert.rejects(encode(input), blocked);
  }
});

test("individually valid real projections still cannot share local owner identities across namespaces", async () => {
  const input = await fixture({ sameProjectionId: true }), c = input.action.body.photoCopy;
  assertEditor({ binding: { ...input.binding, listId: c.source.listId, itemKey: c.source.itemKey }, revision: c.source.base.stateRevision, payload: c.source.payload, side: input.snapshot.source });
  assertEditor({ binding: input.binding, revision: input.action.body.base.stateRevision, payload: input.action.body.payload, side: input.snapshot.target });
  assert.ok(Object.keys(input.snapshot.target.beforeState.items).some(key => Object.hasOwn(input.snapshot.source.beforeState.items, key)));
  await assert.rejects(encode(input), blocked);
});

test("both editor sides require the exact actor, private confirmed revision and no existing pending operation", async () => {
  const original = await fixture();
  for (const sideName of ["source", "target"]) for (const mutate of [
    value => { value.binding.actorId = "foreign"; }, value => { value.binding.environment = "other"; },
    value => { value.base.stateRevision++; }, value => { value.base.operationId = randomUUID(); },
    value => { value.visibility = "public"; }, value => { value.deleted = true; }, value => { value.exists = false; },
    value => { value.planId = randomUUID(); }, value => { value.photoCopyPending = {}; }, value => { value.photoCreatePending = {}; }
  ]) { const input = clone(original); mutate(source(input.snapshot[sideName])); await assert.rejects(encode(input), blocked); }
});

test("tree pending markers are fenced by presence, including false and malformed values", async () => {
  const original = await fixture();
  for (const sideName of ["source", "target"]) for (const key of ["treePending", "photoTreeCopyPending"]) for (const value of [false, null, {}, "invalid"] ) {
    const input = clone(original); source(input.snapshot[sideName])[key] = value; await assert.rejects(encode(input), blocked);
  }
});

test("no optimistic candidate, Blob, receipt, server byte proof or unfinished stage digest can enter this JSON record", async () => {
  const original = await fixture();
  for (const mutate of [
    input => { input.files = []; }, input => { input.file = new Blob(["not a derivative"]); },
    input => { input.snapshot.state = clone(input.snapshot.target.beforeState); },
    input => { input.snapshot.receipt = { operationCannotApply: true }; },
    input => { input.action.body.photoCopy.owners[0].photos[0].assetDigest = "0".repeat(64); }
  ]) { const input = clone(original); mutate(input); await assert.rejects(encode(input), blocked); }
  const raw = await encode(original);
  await assert.rejects(read(rehash(raw, value => { value.stages[0].stored = { hash: "0".repeat(64) }; }), original), blocked);
});

test("every cold read rechecks full semantics even after a previous success and a newly computed outer hash", async () => {
  const input = await fixture(), raw = await encode(input), expected = await read(raw, input);
  for (const mutate of [
    value => { value.snapshot.source.beforeState.containers[value.snapshot.copiedOwners[0].sourceLocalId].weight = 999; },
    value => { value.snapshot.target.beforeState.packedItems = {}; },
    value => { value.snapshot.copiedOwners[0].sourceLocalId = value.snapshot.copiedOwners[1].sourceLocalId; },
    value => { value.action.body.photoCopy.source.payloadDigest = "f".repeat(64); },
    value => { value.action.body.photoCopy.owners[0].photos[0].assetDigest = "f".repeat(64); },
    value => { value.stages.reverse(); }, value => { value.stages[0].treeDigest = "0".repeat(64); },
    value => { value.stages[0].target.entityId = value.stages[1].target.entityId; },
    value => { value.receipt = { operationCannotApply: true }; }
  ]) {
    await assert.rejects(read(rehash(raw, mutate), input), blocked);
    assert.deepEqual(await read(raw, input), expected);
  }
});

test("actual byte hash, canonical JSON, exact record identity and immutable binding are independent guards", async () => {
  const input = await fixture(), raw = await encode(input);
  for (const mutate of [
    value => { value.intentHash = "0".repeat(64); }, value => { value.intentHash = value.intentHash.toUpperCase(); },
    value => { value.intentJson += " "; value.intentHash = byteHash(value.intentJson); },
    value => { value.intentJson = value.intentJson.replace('{', '{"version":9,'); value.intentHash = byteHash(value.intentJson); },
    value => { value.version = 2; }, value => { value.key += " "; }, value => { value.bindingKey += " "; },
    value => { value.receipt = {}; }
  ]) { const changed = clone(raw); mutate(changed); await assert.rejects(read(changed, input), blocked); }
  await assert.rejects(decode(raw, { ...input.binding, actorId: "foreign" }, input.action.operationId), blocked);
  await assert.rejects(decode(raw, { ...input.binding, environment: "other" }, input.action.operationId), blocked);
  await assert.rejects(decode(raw, input.binding, randomUUID()), blocked);
  await assert.rejects(decode(raw, input.binding, "invalid"), blocked);
});

test("the 12 MiB envelope bound measures actual UTF-8, accepts its exact boundary and rejects one byte more", async () => {
  const input = await fixture();
  // Opaque local source metadata is retained by the established editor proof.
  // It is not business data, a new runtime field, or a dispatch authority hint.
  source(input.snapshot.source).encodingProbe = "";
  const empty = await encode(input), remaining = 12 * 1024 * 1024 - Buffer.byteLength(empty.intentJson);
  source(input.snapshot.source).encodingProbe = "я".repeat(Math.floor(remaining / 2)) + (remaining % 2 ? "x" : "");
  const exact = await encode(input);
  assert.equal(Buffer.byteLength(exact.intentJson), 12 * 1024 * 1024); assert.ok(exact.intentJson.length < 12 * 1024 * 1024);
  assert.equal((await read(exact, input)).intentHash, exact.intentHash);
  source(input.snapshot.source).encodingProbe += "x";
  await assert.rejects(encode(input), blocked);
  const over = { ...exact, intentJson: exact.intentJson + "x" };
  over.intentHash = byteHash(over.intentJson); await assert.rejects(read(over, input), blocked);
});

test("single-owner V1 and tree records reject one another without expanding the old codec grammar", async () => {
  const treeInput = await fixture(), oldInput = await v1Fixture(), tree = await encode(treeInput), old = await encodeV1(oldInput);
  await assert.rejects(encode(oldInput), blocked);
  await assert.rejects(encodeV1(treeInput), { code: "admin-template-photo-copy-record" });
  await assert.rejects(decode(old, oldInput.binding, oldInput.action.operationId), blocked);
  await assert.rejects(decodeV1(tree, treeInput.binding, treeInput.action.operationId), { code: "admin-template-photo-copy-record" });
});
