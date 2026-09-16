import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { wholeCopyReceiptFixture, projectWholeReceipt, cancelWholeReceipt, copy, hash } from "../fixtures/admin-template-photo-whole-copy-receipt-fixture.js";
import { treeReceiptFixture } from "../fixtures/admin-template-photo-tree-copy-receipt-fixture.js";
import { validateAdminTemplatePhotoTreeCopyStageReceipt, validateAdminTemplatePhotoTreeCopyReceipt } from "../../src/sync/admin-template-photo-tree-copy-receipt.js";
import { validateAdminTemplatePhotoWholeCopyStageReceipt as stageValid, validateAdminTemplatePhotoWholeCopyStages as stagesValid,
  validateAdminTemplatePhotoWholeCopyResultStructure as structureValid, validateAdminTemplatePhotoWholeCopyResult as resultValid,
  validateAdminTemplatePhotoWholeCopyReceipt as receiptValid } from "../../src/sync/admin-template-photo-whole-copy-receipt.js";

const stageExpected = (f, index = 0) => ({ manifest: f.manifests[index], assetDigest: hash(f.manifests[index]) });

test("whole copy proves the complete new catalog at revision one with actor ownership and immutable input", async () => {
  const f = await wholeCopyReceiptFixture(), before = copy(f);
  assert.notEqual(f.result.sourceOwnerId, f.intent.actorId);
  assert.equal(f.result.ownerId, f.intent.actorId);
  assert.equal(await stageValid(f.stages[0], stageExpected(f)), true);
  assert.equal(await stagesValid(f.intent, f.stages), true);
  assert.equal(structureValid(f.result, f.intent), true);
  assert.equal(await resultValid(f.result, f.expected), true);
  assert.equal(await receiptValid(f.receipt, f.expected), true);
  assert.ok(f.result.owners.some(owner => owner.added.length === 0));
  assert.equal(f.result.owners.length, 11);
  assert.deepEqual(f, before);
});

test("new template cannot inherit an existing target revision, visibility, owner or layout", async () => {
  const f = await wholeCopyReceiptFixture();
  for (const mutate of [r => { r.result.payload.stateRevision = 2; }, r => { r.result.payload.stateRevision = 0; },
    r => { r.result.payload.visibility = "public"; }, r => { r.result.payload.indexes.push({ listId: "public-demo-state" }); },
    r => { r.result.payload.photoCopy.ownerId = "other-admin"; }, r => { r.result.payload.photoCopy.layoutId = "source-layout"; },
    r => { r.operation.kind = "template.save"; }, r => { r.operation.actorId = "other-admin"; }, r => { r.operation.id = randomUUID(); }]) {
    const receipt = copy(f.receipt); mutate(receipt); assert.equal(await receiptValid(receipt, f.expected), false);
  }
  const stages = copy(f.stages); stages[0].receipt.ownerId = f.result.sourceOwnerId;
  assert.equal(await stageValid(stages[0], stageExpected(f)), false);
});

test("stage grammar and copy version cannot accept legacy/tree packages or claimed file authority", async () => {
  const f = await wholeCopyReceiptFixture(), tree = await treeReceiptFixture();
  for (const mutate of [s => { s.extra = true; }, s => { s.assetState = "pending"; }, s => { s.receipt.version = 2; },
    s => { s.receipt.kind = "admin-template-photo-tree-copy"; }, s => { s.receipt.sourceOwnedBytes = true; },
    s => { s.receipt.baseEntityRevision = 1; }, s => { s.receipt.sourceOwnerId = ""; }, s => { s.receipt.ownerId += " "; },
    s => { s.receipt.materialization.target.filePath = "private/file.png"; }]) {
    const stage = copy(f.stages[0]); mutate(stage); assert.equal(await stageValid(stage, stageExpected(f)), false);
  }
  assert.equal(await stageValid(tree.stages[0], stageExpected(f)), false);
  assert.equal(await validateAdminTemplatePhotoTreeCopyStageReceipt(f.stages[0], stageExpected(f)), false);
  assert.equal(await receiptValid(tree.receipt, f.expected), false);
  assert.equal(await validateAdminTemplatePhotoTreeCopyReceipt(f.receipt, tree.expected), false);
});

test("every immutable stage binds the exact actor, absent target, source revision and full copy", async () => {
  const f = await wholeCopyReceiptFixture();
  for (const mutate of [m => { m.actorId = "other"; }, m => { m.source.baseStateRevision++; },
    m => { m.target.base = { stateRevision: 0 }; }, m => { m.target.listId = m.source.listId; },
    m => { m.source.referenceDigest = "f".repeat(64); }, m => { m.copyDigest = "e".repeat(64); },
    m => { m.operationId = randomUUID(); }, m => { m.templateOperationId = randomUUID(); }]) {
    const stages = copy(f.stages); mutate(stages[0].receipt.manifest); stages[0].receipt.assetDigest = hash(stages[0].receipt.manifest);
    assert.equal(await stagesValid(f.intent, stages), false);
  }
  for (const mutate of [s => s.reverse(), s => s.pop(), s => { s[1] = copy(s[0]); },
    s => { s[1].receipt.sourceOwnerId = "another-source-admin"; }]) {
    const stages = copy(f.stages); mutate(stages); assert.equal(await stagesValid(f.intent, stages), false);
  }
});

test("independent target paths and exact original bytes are mandatory across every owner", async () => {
  const f = await wholeCopyReceiptFixture();
  for (const mutate of [s => { s[1].receipt.materialization.target = copy(s[0].receipt.materialization.target); },
    s => { s[0].receipt.materialization.target.filePathDigest = s[1].receipt.materialization.source.thumbPathDigest; },
    s => { s[0].receipt.stored.file.hash = "e".repeat(64); }, s => { s[0].receipt.stored.thumb.size++; },
    s => { s[0].receipt.stored.file.fileName = "changed.png"; },
    s => { s[0].receipt.stored.file.size = s[0].receipt.sourceStored.file.size = 10 * 1024 * 1024 + 1; },
    s => { s[0].receipt.stored.file.fileName = s[0].receipt.sourceStored.file.fileName = "../file.png"; }]) {
    const stages = copy(f.stages); mutate(stages); assert.equal(await stagesValid(f.intent, stages), false);
  }
});

test("a file and its own byte-identical thumbnail may share a path but another target stage may not", async () => {
  const f = await wholeCopyReceiptFixture(), stages = copy(f.stages), r = stages[0].receipt;
  for (const part of ["sourceStored", "stored"]) r[part].thumb = Object.fromEntries(["hash", "size", "type"].map(key => [key, r[part].file[key]]));
  for (const part of ["source", "target"]) r.materialization[part].thumbPathDigest = r.materialization[part].filePathDigest;
  assert.equal(await stagesValid(f.intent, stages), true);
  stages[1].receipt.materialization.target = copy(r.materialization.target);
  stages[1].receipt.stored = copy(r.stored); stages[1].receipt.sourceStored = copy(r.sourceStored);
  assert.equal(await stagesValid(f.intent, stages), false);
});

test("all raw roots, detached owners, statuses, quantities and packing must survive a committed receipt", async () => {
  const f = await wholeCopyReceiptFixture(), layout = `layout-${f.intent.id}`;
  const unavailable = f.result.owners.find(owner => owner.sourceEntityId === "item-a").entityId;
  for (const mutate of [r => { r.owners = r.owners.filter(owner => owner.added.length); }, r => r.owners.reverse(),
    r => { r.confirmedPayload.layouts[layout].rootContainerIds.reverse(); },
    r => { r.confirmedPayload.layouts[layout].arrangement.packedItems = {}; },
    r => { r.confirmedPayload.items[unavailable].availabilityStatus = "available"; },
    r => { r.confirmedPayload.items[unavailable].quantity = 1; },
    r => { delete r.confirmedPayload.opaqueTop; }, r => { r.confirmedPayload.categories = []; }]) {
    const result = copy(f.result); mutate(result); result.confirmedPayloadDigest = hash(result.confirmedPayload);
    assert.equal(await resultValid(result, f.expected), false);
  }
});

test("added references must preserve old timestamps and exact stage metadata", async () => {
  const f = await wholeCopyReceiptFixture();
  for (const mutate of [p => { delete p.createdAt; }, p => { p.updatedAt = "2026-09-14T00:00:00Z"; },
    p => { p.photoId = "other"; }, p => { p.assetId = randomUUID(); }, p => { p.fileName = "changed.png"; },
    p => { p.size++; }, p => { p.width++; }, p => { p.sourceOwnedBytes = true; }]) {
    const result = copy(f.result); mutate(result.owners.flatMap(owner => owner.added)[0].photo);
    assert.equal(await resultValid(result, f.expected), false);
  }
});

test("known routes are validated exactly without normalizing forged receipt URLs", async () => {
  const f = await wholeCopyReceiptFixture();
  for (const base of ["/letters-vniipo/api", "https://api.vniipo-help.ru/experiment/letters-vniipo/api",
    "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api", "https://experiment.vniipo-help.ru/letters-vniipo/api",
    "https://api.vniipo-help.ru/letters-vniipo/api"]) {
    const result = copy(f.result);
    for (const { photo } of result.owners.flatMap(owner => owner.added)) for (const [key, suffix] of [["url", "file"], ["thumbUrl", "thumb"]])
      photo[key] = `${base}/bike-packing/lists/${f.intent.listId}/photos/${photo.id}/${suffix}`;
    assert.equal(await receiptValid(projectWholeReceipt(f, result), f.expected), true);
  }
  for (const base of ["https://evil.example/letters-vniipo/api", "//api.vniipo-help.ru/letters-vniipo/api", "/other/letters-vniipo/api"]) {
    const result = copy(f.result), photo = result.owners.flatMap(owner => owner.added)[0].photo;
    photo.url = `${base}/bike-packing/lists/${f.intent.listId}/photos/${photo.id}/file`;
    let receipt; try { receipt = projectWholeReceipt(f, result); } catch { continue; }
    assert.equal(await receiptValid(receipt, f.expected), false);
  }
});

test("historical unavailable stages remain readable; unknown stages never prove completion", async () => {
  const f = await wholeCopyReceiptFixture(), stages = copy(f.stages); stages[2].assetState = "unavailable";
  assert.equal(await receiptValid(f.receipt, { ...f.expected, stageReceipts: stages }), true);
  for (const stageReceipts of [undefined, [], [null, ...stages.slice(1)], stages.slice(1)])
    assert.equal(await receiptValid(f.receipt, { ...f.expected, stageReceipts }), false);
});

test("cancellation is an exact irreversible operation fact, not a created template or file cleanup", async () => {
  const f = await wholeCopyReceiptFixture(), receipt = cancelWholeReceipt(f), expected = { ...f.expected, stageReceipts: undefined };
  assert.equal(await receiptValid(receipt, expected), true);
  for (const mutate of [r => { r.result.status = 403; }, r => { r.result.payload.cancellation.operationId = randomUUID(); },
    r => { r.result.payload.cancellation.noBusinessEffects = false; }, r => { r.result.payload.cancellation.operationCannotApply = false; },
    r => { r.result.payload.stateRevision = 1; }, r => { r.operation.state = "committed"; }]) {
    const value = copy(receipt); mutate(value); assert.equal(await receiptValid(value, expected), false);
  }
  for (const status of [403, 404, 409]) {
    const value = copy(receipt); value.result = { status, payload: { ok: false, code: "source_changed" } };
    assert.equal(await receiptValid(value, expected), true);
  }
});

test("result and complete parent receipt have independent byte limits and exact identity binding", async () => {
  const f = await wholeCopyReceiptFixture();
  assert.equal(await receiptValid({ ok: true, ...f.receipt }, f.expected), false);
  assert.equal(await receiptValid(f.receipt, { ...f.expected, payloadDigest: "f".repeat(64) }), false);
  const result = copy(f.result); result.confirmedPayload.opaqueTop.padding = "x".repeat(4 * 1024 * 1024);
  result.confirmedPayloadDigest = hash(result.confirmedPayload);
  assert.equal(structureValid(result, f.intent), false);
  const receipt = copy(f.receipt); receipt.result.payload.extra = "x".repeat(4 * 1024 * 1024);
  assert.equal(await receiptValid(receipt, f.expected), false);
});

test("receipt validation captures all mutable caller evidence before its first asynchronous digest", async () => {
  const f = await wholeCopyReceiptFixture(), receipt = copy(f.receipt), expected = copy(f.expected);
  const checking = receiptValid(receipt, expected);
  receipt.operation.id = randomUUID(); receipt.result.payload.photoCopy.owners = [];
  expected.intent.body.metadata.title = "Changed during validation";
  expected.stageReceipts[0].receipt.materialization.target.filePathDigest = "f".repeat(64);
  expected.payloadDigest = "e".repeat(64);
  assert.equal(await checking, true);
  assert.equal(await receiptValid(receipt, expected), false);
});

test("rehashed edited intent cannot borrow old stage commitments, even for terminal cancellation", async () => {
  const f = await wholeCopyReceiptFixture(), intent = copy(f.intent);
  intent.body.metadata.title = "Different immutable request";
  const { id: _id, ...encoded } = intent, payloadDigest = hash(encoded);
  const receipt = cancelWholeReceipt(f); receipt.operation.payloadDigest = payloadDigest;
  assert.equal(await receiptValid(receipt, { intent, payloadDigest }), false);
});
