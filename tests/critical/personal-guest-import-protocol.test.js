import test from "node:test";
import assert from "node:assert/strict";
import { guestSelectionFixture } from "./personal-guest-import-fixture.js";
import { preparePersonalGuestImportSelection } from "../../src/sync/personal-guest-import-selection.js";
import { personalGuestImportPlan } from "../../src/sync/personal-guest-import-plan.js";
import { assertPersonalGuestImportBody, assertPersonalGuestImportHashes, personalGuestImportReceipt, validatePersonalGuestImportResult } from "../../src/sync/personal-guest-import-protocol.js";
import { encodePersonalGuestImportRecord, decodePersonalGuestImportRecord } from "../../src/sync/personal-guest-import-record.js";
import { personalArchiveHash } from "../../src/sync/personal-archive-import-protocol.js";

async function fixture({ fileless = false } = {}) {
  const input = guestSelectionFixture();
  if (fileless) {
    delete input.candidate.sourceState.items.item.photos;
    const { createGuestLoginHandoff } = await import("../../src/public/guest-login-handoff.js");
    input.handoff = createGuestLoginHandoff({ candidate: input.candidate, eligibleLayoutIds: ["a", "b"], email: input.user.email,
      guestSessionId: input.handoff.guestSessionId, nowMs: input.nowMs });
  }
  const selection = preparePersonalGuestImportSelection(input, { enabled: true }), file = new Blob(["native guest original"], { type: "image/png" });
  const fileHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(value => value.toString(16).padStart(2, "0")).join("");
  const files = selection.photoTargets.map(({ sourceEntityId, ...target }) => ({ ...target,
    file: { hash: fileHash, size: file.size, type: file.type, fileName: "Гостевое фото.png" }, thumb: null }));
  const manifest = { version: 1, operationId: selection.operationId, sourcePayload: selection.candidate.sourceState,
    sourceHash: await personalArchiveHash(selection.candidate.sourceState), layoutTargets: selection.layoutTargets,
    ownerTargets: selection.ownerTargets, photoTargets: selection.photoTargets, editMeta: selection.editMeta, targetStateRevision: selection.baseStateRevision, files };
  const plan = personalGuestImportPlan({ ...manifest, currentPayload: selection.basePayload, listId: selection.binding.listId }, files);
  manifest.payloadHash = await personalArchiveHash(plan.payload);
  const action = { ...selection.binding, operationId: selection.operationId, kind: "list.import", body: {
    baseStateRevision: selection.baseStateRevision, payload: plan.payload, guestImport: manifest, causal: { dependsOn: [], reads: [] } } };
  const capture = { binding: selection.binding, action, snapshot: structuredClone(plan.payload), files: files.map(part => ({ file, thumb: null,
    stage: { operationId: part.assetId, photoId: part.photoId, entityType: part.entityType, entityId: part.entityId, fileName: part.file.fileName } })) };
  return { selection, plan, capture, options: { base: selection.basePayload, listId: action.listId, operationId: action.operationId, causal: true } };
}

test("guest body binds the full source, original operation, selected mappings, base and file manifest", async () => {
  for (const fileless of [false, true]) {
    const f = await fixture({ fileless }), body = f.capture.action.body;
    assert.deepEqual(assertPersonalGuestImportBody(body, f.options), f.plan); await assertPersonalGuestImportHashes(body);
    const changed = structuredClone(body); changed.guestImport.sourcePayload.items.item.name = "Late source";
    await assert.rejects(assertPersonalGuestImportHashes(changed)); assert.throws(() => assertPersonalGuestImportBody(changed, f.options));
    assert.throws(() => assertPersonalGuestImportBody(body, { ...f.options, operationId: crypto.randomUUID() }));
    assert.throws(() => assertPersonalGuestImportBody({ ...body, archiveImport: body.guestImport }, f.options));
  }
});

test("guest native codec retains the true import and exact bytes through caller changes and rejects corruption", async () => {
  const f = await fixture(), operationId = f.capture.action.operationId, expected = structuredClone(f.capture.action);
  const writing = encodePersonalGuestImportRecord(f.capture);
  f.capture.action.body.guestImport.sourcePayload.items.item.name = "Late source";
  f.capture.files[0].file = new Blob(["wrong bytes"], { type: "image/png" });
  const record = await writing, saved = await decodePersonalGuestImportRecord(record, f.selection.binding, operationId);
  assert.deepEqual(saved.action, expected); assert.equal(await saved.files[0].file.text(), "native guest original");
  const corrupt = structuredClone(record); new Uint8Array(corrupt.files[0].file)[0] ^= 255;
  await assert.rejects(decodePersonalGuestImportRecord(corrupt, f.selection.binding, operationId));
  await assert.rejects(decodePersonalGuestImportRecord(record, { ...f.selection.binding, actorId: "other" }, operationId));
});

test("guest receipt accepts only the complete exact import outcome, including fileless results", async () => {
  for (const fileless of [false, true]) {
    const f = await fixture({ fileless }), expected = f.capture.action, manifest = expected.body.guestImport, payload = structuredClone(expected.body.payload);
    const guestPhotos = manifest.files.map(file => {
      const photo = { id: file.photoId, photoId: file.photoId, assetId: file.assetId, listId: expected.listId, status: "synced",
        url: "https://example.test/full.png", thumbUrl: "https://example.test/thumb.png", fileName: file.file.fileName, type: file.file.type, size: file.file.size, width: 1, height: 1 };
      payload[file.entityType === "item" ? "items" : "containers"][file.entityId].photos = [photo];
      return { entityType: file.entityType, entityId: file.entityId, photoId: file.photoId, assetId: file.assetId, fileHash: file.file.hash, thumbHash: file.file.hash, photo };
    });
    const revision = manifest.targetStateRevision + 1;
    const result = { ok: true, stateRevision: revision, list: { id: expected.listId, payload, stateRevision: revision }, guestImport: personalGuestImportReceipt(manifest), guestPhotos };
    assert.equal(validatePersonalGuestImportResult(result, expected), true);
    for (const change of [value => value.stateRevision++, value => value.guestImport.operationId = crypto.randomUUID(),
      value => delete value.list.payload.layouts[f.plan.activeLayoutId], value => value.list.payload.items[f.plan.createdOwners.items[0]].weight++]) {
      const changed = structuredClone(result); change(changed); assert.equal(validatePersonalGuestImportResult(changed, expected), false);
    }
    if (!fileless) {
      const changed = structuredClone(result); changed.guestPhotos[0].fileHash = "f".repeat(64);
      assert.equal(validatePersonalGuestImportResult(changed, expected), false);
    }
  }
});
