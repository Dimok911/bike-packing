import test from "node:test";
import assert from "node:assert/strict";
import { preparePersonalPhotoFormAttachments } from "../../src/sync/personal-photo-form-plan.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";
import { assertPersonalPhotoFormRecord, assertPersonalPhotoFormFile } from "../../src/sync/personal-photo-form-outbox-record.js";

async function fixture(created) {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const base = { items: created ? {} : { owner: { id: "owner", name: "Original", photos: [] } }, containers: {}, layouts: {} };
  const plan = preparePersonalPhotoFormAttachments({ binding, snapshot: base, basePayload: base, baseStateRevision: 4,
    entityType: "item", entityId: "owner", baseEntityRevision: created ? 0 : 3, fields: { name: "Card with two photos" },
    files: [1, 2].map(n => ({ file: new Blob([`full ${n}`], { type: "image/png" }), thumb: new Blob([`thumb ${n}`], { type: "image/png" }) })) }, { enabled: true });
  const action = { ...binding, operationId: plan.operationId, kind: "photos.mutate", body: plan.body };
  const encoded = await encodePersonalPhotoFormRecord({ binding, action, snapshot: plan.snapshot, files: plan.files });
  const saved = await decodePersonalPhotoFormRecord(encoded, binding, action.operationId);
  const record = { action, snapshot: plan.snapshot, mergeBase: { payload: base, stateRevision: 4 },
    photoState: { version: 1, payload: plan.payload, fileInventoryVersion: 2, fileIntentHash: saved.intentHash } };
  return { binding, record, saved };
}

test("form outbox verification binds business fields, exact baseline and all files to the original action", async () => {
  for (const created of [true, false]) {
    const f = await fixture(created);
    assert.equal(assertPersonalPhotoFormRecord(f.record).created, created);
    assert.equal(assertPersonalPhotoFormFile(f.record, f.saved, f.binding).photos.length, 2);
    for (const change of [r => { r.mergeBase.stateRevision++; }, r => { r.photoState.payload.items.owner.name = "Not in form"; },
      r => { r.photoState.payload.layouts.other = { id: "other" }; }, r => { r.photoState.fileInventoryVersion = 1; },
      r => { r.photoState.fileIntentHash = null; }, r => { r.reconciliation = {}; }]) {
      const record = structuredClone(f.record); change(record); assert.throws(() => assertPersonalPhotoFormRecord(record));
    }
  }
});

test("a matching first file or action ID alone cannot confirm a form inventory", async () => {
  const f = await fixture(true);
  for (const change of [s => { s.files.pop(); }, s => { s.files.reverse(); }, s => { s.intentHash = "0".repeat(64); },
    s => { s.binding.actorId = "other"; }, s => { s.snapshot.items.owner.name = "Later edit"; },
    s => { s.action.body.fields.name = "Other intent"; }, s => { s.files[1].fileMetadata.hash = "unknown"; },
    s => { s.files[1].thumb = null; }, s => { s.files[1].file = new Blob(["different size"], { type: "image/png" }); }]) {
    const saved = structuredClone(f.saved); change(saved);
    assert.throws(() => assertPersonalPhotoFormFile(f.record, saved, f.binding));
  }
});
