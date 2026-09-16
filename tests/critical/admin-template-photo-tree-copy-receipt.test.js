import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { adminPhotoCopyFixture } from "../fixtures/admin-template-photo-copy-fixture.js";
import { adminPhotoCreateFixture } from "../fixtures/admin-template-photo-create-fixture.js";
import { treeReceiptFixture, cancellationFor, projectReceipt, copy, hash } from "../fixtures/admin-template-photo-tree-copy-receipt-fixture.js";
import { adminTemplatePhotoTreeCopyIntent, adminTemplatePhotoTreeCopyStageDigest } from "../../src/sync/admin-template-photo-tree-copy-protocol.js";
import { validateAdminTemplatePhotoCopyStageReceipt, validateAdminTemplatePhotoCopyResult } from "../../src/sync/admin-template-photo-copy-protocol.js";
import { validateAdminTemplatePhotoTreeCopyStageReceipt as stageValid, validateAdminTemplatePhotoTreeCopyStages as stagesValid,
  validateAdminTemplatePhotoTreeCopyResultStructure as structureValid, validateAdminTemplatePhotoTreeCopyResult as resultValid,
  validateAdminTemplatePhotoTreeCopyReceipt as receiptValid } from "../../src/sync/admin-template-photo-tree-copy-receipt.js";

const stageExpected = (f, index = 0) => ({ manifest: f.manifests[index], assetDigest: f.stages[index].receipt.assetDigest });
const triplet = file => ({ hash: file.hash, size: file.size, type: file.type });

test("exact tree stages and full terminal proof accept all owners, raw projection and actual BE relative routes", async () => {
  const f = await treeReceiptFixture();
  assert.equal(await stageValid(f.stages[0], stageExpected(f)), true); assert.equal(await stagesValid(f.intent, f.stages), true);
  assert.equal(structureValid(f.result, f.intent), true); assert.equal(await resultValid(f.result, f.expected), true);
  assert.equal(await receiptValid(f.receipt, f.expected), true); assert.equal(await receiptValid({ ok: true, ...f.receipt }, f.expected), false);
  assert.ok(f.result.owners.some(owner => owner.added.length === 0)); assert.equal(new Set([f.intent.actorId, f.result.sourceOwnerId, f.result.ownerId]).size, 3);
  const before = copy(f); await receiptValid(f.receipt, f.expected); assert.deepEqual(f, before);
  const stages = copy(f.stages), result = copy(f.result);
  result.sourceOwnerId = result.ownerId = f.intent.actorId;
  for (const stage of stages) stage.receipt.sourceOwnerId = stage.receipt.ownerId = f.intent.actorId;
  assert.equal(await receiptValid(projectReceipt(f, result), { ...f.expected, stageReceipts: stages }), true);
});

test("stage receipt grammar is exact, mode-specific and does not accept claimed sourceOwnedBytes authority", async () => {
  const f = await treeReceiptFixture();
  for (const mutate of [s => { s.ok = false; }, s => { s.assetState = "pending"; }, s => { s.extra = true; },
    s => { s.receipt.version = 1; }, s => { s.receipt.kind = "admin-template-photo-copy"; }, s => { s.receipt.baseEntityRevision = 1; },
    s => { s.receipt.sourceOwnedBytes = true; }, s => { s.receipt.ownerId = " owner "; }, s => { s.receipt.sourceOwnerId = ""; },
    s => { s.receipt.stored.file.hash = "F".repeat(64); }, s => { s.receipt.stored.file.size = 0; },
    s => { s.receipt.sourceStored.file.fileName = "../source.jpg"; }, s => { s.receipt.sourceStored.file.width = 0; },
    s => { s.receipt.materialization.version = 2; }, s => { s.receipt.materialization.source.filePath = "legacy/file.jpg"; }]) {
    const stage = copy(f.stages[0]); mutate(stage); assert.equal(await stageValid(stage, stageExpected(f)), false);
  }
  assert.equal(await stageValid({ ok: true, operation: { id: f.manifests[0].operationId, actorId: f.intent.actorId, environment: f.intent.environment, state: "unknown" } }, stageExpected(f)), false);
});

test("source and copied physical facts must match, including legal size/dimensions and exact counterpart metadata", async () => {
  const f = await treeReceiptFixture();
  for (const mutate of [r => { r.stored.file.hash = "f".repeat(64); }, r => { r.stored.thumb.size++; }, r => { r.stored.file.fileName = "different.jpg"; },
    r => { r.stored.file.width = 1; }, r => { r.sourceStored.file.size = r.stored.file.size = 10 * 1024 * 1024 + 1; },
    r => { r.sourceStored.thumb.type = r.stored.thumb.type = "text/plain"; },
    r => { r.materialization.source.thumbPathDigest = r.materialization.source.filePathDigest; },
    r => { r.materialization.target.thumbPathDigest = r.materialization.target.filePathDigest; }]) {
    const stage = copy(f.stages[0]); mutate(stage.receipt); assert.equal(await stageValid(stage, stageExpected(f)), false);
  }
  const stage = copy(f.stages[0]);
  for (const key of ["sourceStored", "stored"]) { stage.receipt[key].file.size = 10 * 1024 * 1024; stage.receipt[key].file.width = null; stage.receipt[key].file.height = null;
    stage.receipt[key].thumb = triplet(stage.receipt[key].file); }
  for (const side of ["source", "target"]) stage.receipt.materialization[side].thumbPathDigest = stage.receipt.materialization[side].filePathDigest;
  assert.equal(await stageValid(stage, stageExpected(f)), true);
});

test("every ordered stage binds to the entire intent: wrong source/target/tree/actor/action or asset cannot be substituted", async () => {
  const f = await treeReceiptFixture();
  for (const mutate of [m => { m.actorId = "other-admin"; }, m => { m.operationId = randomUUID(); }, m => { m.templateOperationId = randomUUID(); },
    m => { m.source.baseStateRevision++; }, m => { m.target.baseStateRevision++; }, m => { m.source.entityId = "other-owner"; },
    m => { m.target.photoId = "other-photo"; }, m => { m.source.referenceDigest = "f".repeat(64); }, m => { m.treeDigest = "f".repeat(64); }]) {
    const stages = copy(f.stages); mutate(stages[0].receipt.manifest);
    stages[0].receipt.assetDigest = await adminTemplatePhotoTreeCopyStageDigest(stages[0].receipt.manifest);
    assert.equal(await stagesValid(f.intent, stages), false);
  }
  for (const mutate of [s => s.reverse(), s => s.pop(), s => s.push(copy(s[0])), s => { s[1] = copy(s[0]); },
    s => { s[1].receipt.ownerId = "other-owner"; }, s => { s[1].receipt.sourceOwnerId = "other-source-owner"; }]) {
    const stages = copy(f.stages); mutate(stages); assert.equal(await stagesValid(f.intent, stages), false);
  }
});

test("global independence detects a target path reused across owners or aliasing any other source", async () => {
  const f = await treeReceiptFixture();
  for (const mutate of [s => { s[1].receipt.materialization.target.filePathDigest = s[0].receipt.materialization.target.thumbPathDigest; },
    s => { s[0].receipt.materialization.target.filePathDigest = s[1].receipt.materialization.source.thumbPathDigest; },
    s => { s[1].receipt.materialization.target = copy(s[0].receipt.materialization.target); }]) {
    const stages = copy(f.stages); mutate(stages);
    assert.equal(await stageValid(stages[0], stageExpected(f, 0)), true);
    assert.equal(await stageValid(stages[1], stageExpected(f, 1)), true);
    assert.equal(await stagesValid(f.intent, stages), false);
  }
});

test("source aliases require globally consistent byte metadata; equal bytes in independent new paths remain valid", async () => {
  const f = await treeReceiptFixture(), stages = copy(f.stages);
  stages[1].receipt.materialization.source = copy(stages[0].receipt.materialization.source);
  assert.equal(await stageValid(stages[1], stageExpected(f, 1)), true); assert.equal(await stagesValid(f.intent, stages), false);
  stages[1].receipt.sourceStored = copy(stages[0].receipt.sourceStored); stages[1].receipt.stored = copy(stages[0].receipt.stored);
  assert.equal(await stagesValid(f.intent, stages), true);
  // A shared source path does not require the logical filename of two raw rows
  // to be identical, but it must identify the same physical byte facts.
  stages[1].receipt.sourceStored.file.fileName = stages[1].receipt.stored.file.fileName = "Second logical name.jpg";
  assert.equal(await stagesValid(f.intent, stages), true);
  stages[1].receipt.sourceStored.thumb.type = stages[1].receipt.stored.thumb.type = "image/png";
  assert.equal(await stagesValid(f.intent, stages), false);
});

test("mixed historical unavailable stages remain proof but unknown/missing stages cannot confirm a commit", async () => {
  const f = await treeReceiptFixture(), stages = copy(f.stages); stages[1].assetState = "unavailable";
  assert.equal(await stageValid(stages[1], stageExpected(f, 1)), true); assert.equal(await stagesValid(f.intent, stages), true);
  assert.equal(await receiptValid(f.receipt, { ...f.expected, stageReceipts: stages }), true);
  assert.equal(stages[1].assetState, "unavailable"); // Validation does not convert readiness or authorize dispatch.
  for (const values of [undefined, [], [null, ...f.stages.slice(1)], f.stages.slice(1)])
    assert.equal(await receiptValid(f.receipt, { ...f.expected, stageReceipts: values }), false);
});

test("v1 copy and create receipts cannot cross tree boundaries in either direction", async () => {
  const tree = await treeReceiptFixture(), old = await adminPhotoCopyFixture(), create = await adminPhotoCreateFixture();
  for (const other of [old, create]) {
    assert.equal(await stageValid(other.stages[0], stageExpected(tree)), false);
    assert.equal(await stageValid(other.stages[0], { manifest: other.stages[0].receipt.manifest, assetDigest: other.stages[0].receipt.assetDigest }), false);
    assert.equal(await resultValid(other.result, tree.expected), false);
  }
  assert.equal(await validateAdminTemplatePhotoCopyStageReceipt(tree.stages[0], stageExpected(tree)), false);
  assert.equal(await validateAdminTemplatePhotoCopyResult(tree.result, old.expected), false);
  assert.equal(await resultValid(tree.result, old.expected), false);
});

test("only actual relative route and fixed existing origins are accepted without URL rewriting", async () => {
  const f = await treeReceiptFixture(), original = copy(f.result);
  const bases = ["/letters-vniipo/api", "https://api.vniipo-help.ru/experiment/letters-vniipo/api", "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api",
    "https://experiment.vniipo-help.ru/letters-vniipo/api", "https://api.vniipo-help.ru/letters-vniipo/api"];
  for (const base of bases) {
    const result = copy(original);
    for (const { photo } of result.owners.flatMap(owner => owner.added)) for (const [field, variant] of [["url", "file"], ["thumbUrl", "thumb"]])
      photo[field] = `${base}/bike-packing/lists/${encodeURIComponent(f.intent.listId)}/photos/${encodeURIComponent(photo.id)}/${variant}`;
    const receipt = projectReceipt(f, result), before = copy(receipt);
    assert.equal(await receiptValid(receipt, f.expected), true); assert.deepEqual(receipt, before);
  }
  for (const prefix of ["", "https://evil.example/letters-vniipo/api", "//api.vniipo-help.ru/experiment/letters-vniipo/api", "../letters-vniipo/api", "/other/letters-vniipo/api",
    "https://api-eu.vniipo-help.ru/other", "https://api.vniipo-help.ru:444/experiment/letters-vniipo/api"]) {
    const result = copy(original), photo = result.owners[0].added[0].photo;
    photo.url = `${prefix}/bike-packing/lists/${f.intent.listId}/photos/${photo.id}/file`;
    const receipt = projectReceipt(f, result); assert.equal(await receiptValid(receipt, f.expected), false);
  }
  for (const suffix of ["?next=other", "#file"]) {
    const receipt = copy(f.receipt), result = receipt.result.payload.photoCopy, photo = result.owners[0].added[0].photo;
    photo.url += suffix;
    result.confirmedPayload.containers[result.owners[0].entityId].photos[0].url = photo.url;
    result.confirmedPayloadDigest = hash(result.confirmedPayload);
    assert.equal(await receiptValid(receipt, f.expected), false);
  }
});

test("terminal proof rejects partial/photo-free owner loss, wrong root and collateral raw changes despite recomputed result hash", async () => {
  const f = await treeReceiptFixture();
  for (const mutate of [r => { r.rootId = r.owners[1].entityId; }, r => { r.owners = r.owners.filter(owner => owner.added.length); },
    r => r.owners.reverse(), r => { r.owners[0].added.pop(); }, r => { r.confirmedPayload.locations = []; },
    r => { r.confirmedPayload.layouts["target-layout"].arrangement.packedItems = {}; }, r => { r.confirmedPayload.items["target-item"].quantity = 1; },
    r => { delete r.confirmedPayload.containers[r.rootId].opaque; }, r => { r.confirmedPayload.layouts["target-layout"].rootContainerIds.reverse(); }]) {
    const result = copy(f.result); mutate(result); result.confirmedPayloadDigest = hash(result.confirmedPayload);
    assert.equal(await resultValid(result, f.expected), false);
  }
});

test("added refs must preserve exact source timestamps and match the corresponding stage stored metadata", async () => {
  const f = await treeReceiptFixture();
  for (const mutate of [p => { delete p.createdAt; }, p => { p.createdAt = null; }, p => { p.photoId = "other"; }, p => { p.assetId = randomUUID(); }, p => { p.listId = "other-list"; }, p => { p.sourceOwnedBytes = true; }]) {
    const result = copy(f.result); mutate(result.owners[0].added[0].photo); assert.equal(await resultValid(result, f.expected), false);
  }
  for (const field of ["fileName", "type", "size", "width", "height"]) {
    const result = copy(f.result), photo = result.owners[0].added[0].photo;
    photo[field] = field === "fileName" ? "different.jpg" : field === "type" ? "image/png" : photo[field] + 1;
    assert.equal(await receiptValid(projectReceipt(f, result), f.expected), false);
  }
  const result = copy(f.result); result.ownerId = f.intent.actorId;
  assert.equal(await resultValid(result, f.expected), false);
});

test("outer receipt has exact identity, original operation digest, target base+1, private visibility and no indexes", async () => {
  const f = await treeReceiptFixture();
  for (const mutate of [r => { r.operation.id = randomUUID(); }, r => { r.operation.actorId = "other"; }, r => { r.operation.environment = "production"; },
    r => { r.operation.listId = f.body.photoCopy.source.listId; }, r => { r.operation.itemKey = "demo-state"; }, r => { r.operation.kind = "template.copy"; },
    r => { r.operation.payloadDigest = r.result.payload.photoCopy.confirmedPayloadDigest; }, r => { r.result.status = 201; },
    r => { r.result.payload.stateRevision++; }, r => { r.result.payload.stateRevision = String(r.result.payload.stateRevision); },
    r => { r.result.payload.visibility = "public"; }, r => { r.result.payload.indexes = [{ listId: "other", stateRevision: 1 }]; },
    r => { r.result.payload.photoAppend = {}; }, r => { r.operation.extra = true; }, r => { r.result.payload.ok = false; },
    r => { r.result.payload.photoCopy.confirmedPayloadDigest = "f".repeat(64); }]) {
    const receipt = copy(f.receipt); mutate(receipt); assert.equal(await receiptValid(receipt, f.expected), false);
  }
  const wrong = copy(f.expected); wrong.payloadDigest = "f".repeat(64); assert.equal(await receiptValid(f.receipt, wrong), false);
});

test("strong cancellation and terminal rejection facts validate without completing partial stages; weak/unknown outcomes do not", async () => {
  const f = await treeReceiptFixture(), cancelled = cancellationFor(f), partial = { intent: f.intent, payloadDigest: f.payloadDigest };
  assert.equal(await receiptValid(cancelled, partial), true);
  assert.equal(await receiptValid(cancelled, { ...partial, stageReceipts: [null, ...f.stages.slice(1)] }), true);
  for (const [status, code] of [[403, "template_admin_required"], [404, "template_source_missing"], [409, "template_photo_copy_source_changed"]]) {
    const rejected = copy(cancelled); rejected.result = { status, payload: { ok: false, code } };
    assert.equal(await receiptValid(rejected, partial), true); assert.equal(await resultValid(rejected, f.expected), false);
  }
  for (const mutate of [r => { delete r.result.payload.cancellation; }, r => { r.result.payload.cancellation.noBusinessEffects = false; },
    r => { r.result.payload.cancellation.operationCannotApply = false; }, r => { r.result.payload.cancellation.operationId = randomUUID(); },
    r => { r.result.payload.cancellation.version = 2; }, r => { r.result.status = 403; }, r => { r.result.payload.cancellation.stageReady = true; },
    r => { r.result.payload.code = "unknown-error"; }, r => { r.operation.state = "waiting"; }, r => { r.operation.state = "unknown"; }]) {
    const rejected = copy(cancelled); mutate(rejected); assert.equal(await receiptValid(rejected, partial), false);
  }
  assert.equal(await receiptValid({ operation: { id: f.intent.id, state: "unknown" } }, partial), false);
  assert.equal(await receiptValid(f.receipt, partial), false); // Late committed requires the full historical stage proof.
});

test("receipt validation always checks complete immutable source and final asset commitments, even for cancellation", async () => {
  const f = await treeReceiptFixture();
  for (const mutate of [intent => { intent.body.photoCopy.source.payload.opaque.later = true; },
    intent => { intent.body.payload.opaque.later = true; }, intent => { intent.body.photoCopy.owners.at(-1).entityId = "other-new-owner"; },
    intent => { intent.body.photoCopy.owners[0].photos[0].assetDigest = "0".repeat(64); }]) {
    const input = copy(f.intent); mutate(input); const intent = adminTemplatePhotoTreeCopyIntent(input), { id: _id, ...encoded } = intent, payloadDigest = hash(encoded);
    const cancelled = cancellationFor(f); cancelled.operation.payloadDigest = payloadDigest;
    assert.equal(await receiptValid(cancelled, { intent, payloadDigest }), false);
  }
});

test("all async receipt inputs are detached before the first await, including expected stage and intent bindings", async () => {
  const f = await treeReceiptFixture(), stage = copy(f.stages[0]), stageOptions = copy(stageExpected(f));
  const one = stageValid(stage, stageOptions); stage.receipt.sourceStored.file.hash = "f".repeat(64); stageOptions.manifest.actorId = "later";
  assert.equal(await one, true);
  const input = copy(f.receipt), expected = copy(f.expected), task = receiptValid(input, expected);
  input.result.payload.photoCopy.confirmedPayload.opaque = null; expected.intent.actorId = "later"; expected.stageReceipts[0].receipt.ownerId = "later";
  assert.equal(await task, true);
  const result = copy(f.result), resultOptions = copy(f.expected), projected = resultValid(result, resultOptions);
  result.owners.reverse(); resultOptions.stageReceipts.pop(); assert.equal(await projected, true);
});

test("maximum tree package remains valid and oversized full terminal receipt is refused", async () => {
  const f = await treeReceiptFixture({ owners: 100, depth: 32, photos: 50 });
  assert.equal(await receiptValid(f.receipt, f.expected), true);
  const oversized = copy(f.receipt); oversized.result.payload.photoCopy.confirmedPayload.opaque.large = "x".repeat(4 * 1024 * 1024);
  oversized.result.payload.photoCopy.confirmedPayloadDigest = hash(oversized.result.payload.photoCopy.confirmedPayload);
  assert.equal(await receiptValid(oversized, f.expected), false);
});
