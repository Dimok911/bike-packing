import test from "node:test";
import assert from "node:assert/strict";
import { preparePersonalPhotoFormAttachments } from "../../src/sync/personal-photo-form-plan.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";

function fixture() {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const base = { items: {}, containers: {}, layouts: {} };
  const plan = preparePersonalPhotoFormAttachments({ binding, snapshot: base, basePayload: base, baseStateRevision: 1,
    entityType: "container", entityId: "new-owner", baseEntityRevision: 0, fields: { name: "Новая сумка" },
    files: [1, 2].map(n => ({ fileName: `file${n}.png`, file: new Blob([`original ${n}`], { type: "image/png" }), thumb: new Blob([`thumb ${n}`], { type: "image/png" }) })) }, { enabled: true });
  return { binding, snapshot: plan.snapshot, files: plan.files, action: { ...binding, operationId: plan.operationId,
    kind: "photos.mutate", generation: 1, body: { ...plan.body, causal: { dependsOn: [], reads: [] } } } };
}

test("form inventory preserves the real action fields and zero revision with every original and thumb", async () => {
  const f = fixture(), before = structuredClone({ binding: f.binding, action: f.action, snapshot: f.snapshot });
  const encoding = encodePersonalPhotoFormRecord(f);
  f.action.body.fields.name = "Too late"; f.action.body.changes.reverse(); f.binding.actorId = "other"; f.files[0].file = new Blob(["late"]);
  const record = await encoding, reading = decodePersonalPhotoFormRecord(record, before.binding, before.action.operationId);
  new Uint8Array(record.files[0].file).fill(0); record.intentHash = "changed after verification started";
  const saved = await reading;
  assert.deepEqual(saved.action, before.action); assert.deepEqual(saved.snapshot, before.snapshot);
  assert.equal(saved.action.body.action, "form"); assert.equal(saved.action.body.changes[0].baseEntityRevision, 0);
  assert.equal(saved.files.length, 2); assert.equal(await saved.files[0].file.text(), "original 1");
  assert.equal(await saved.files[1].thumb.text(), "thumb 2"); assert.match(saved.intentHash, /^[0-9a-f]{64}$/);
});

test("form inventory rejects partial parts, changed fields, invalid scopes and corruption without a partial return", async () => {
  const f = fixture(), record = await encodePersonalPhotoFormRecord(f);
  for (const mutate of [r => r.files.pop(), r => r.files.reverse(), r => { new Uint8Array(r.files[1].file)[0] ^= 1; },
    r => { r.files[0].thumb = null; }, r => { r.intentJson = r.intentJson.replace("Новая сумка", "Другая сумка"); }]) {
    const next = structuredClone(record); mutate(next);
    await assert.rejects(decodePersonalPhotoFormRecord(next, f.binding, f.action.operationId));
  }
  await assert.rejects(decodePersonalPhotoFormRecord(record, { ...f.binding, listId: "other" }, f.action.operationId));
  for (const mutate of [f => { f.action.body.fields.name = "Not in snapshot"; }, f => { f.snapshot.containers["new-owner"].name = "Not in form"; },
    f => { f.files.pop(); }, f => { f.files[0].stage.entityId = "another"; }, f => { f.action.environment = "production"; },
    f => { f.snapshot.containers["new-owner"].photos[0].url = "unverified"; }, f => { f.action.body.fields.dimensions = NaN; }]) {
    const changed = fixture(); mutate(changed); await assert.rejects(encodePersonalPhotoFormRecord(changed));
  }
});
