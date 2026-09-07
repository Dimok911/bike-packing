import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalPhotoFormSubmitter } from "../../src/sync/personal-photo-form-submit.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture({ failStore = false, failLink = false, onDurable = () => {} } = {}) {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list" };
  const context = { ...binding, scope: "personal", generation: "unchanged", form: "opened-form-1" }, values = new Map(), events = [], gate = deferred();
  const base = { items: {}, containers: {}, layouts: {} };
  const input = { binding, snapshot: structuredClone(base), basePayload: base, baseStateRevision: 1, baseEntityRevision: 0,
    entityType: "item", entityId: "item", fields: { name: "Click-time name", note: "Click-time note" },
    files: [1, 2].map(index => ({ fileName: `${index}.png`, file: new Blob([`file ${index}`], { type: "image/png" }) })) };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null,
    setItem(k, v) { if (failLink && k.endsWith(saved?.action.operationId)) throw Error("quota"); values.set(k, v); }, removeItem: k => values.delete(k) };
  let encoded, saved;
  const outbox = createPersonalSaveOutbox({ ...binding, storage, photoEnabled: true, photoBatchEnabled: true, photoFormEnabled: true });
  outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 1 });
  const store = { async captureForm(value) {
    events.push("file-start"); await gate.promise;
    if (failStore) throw Error("disk full");
    encoded = await encodePersonalPhotoFormRecord({ binding, ...value });
    saved = await decodePersonalPhotoFormRecord(encoded, binding, value.action.operationId);
    events.push("file-commit"); return saved;
  }, read: id => decodePersonalPhotoFormRecord(encoded, binding, id) };
  const options = { enabled: true, store, outbox, getContext: () => context, onDurable(record) { events.push("view"); return onDurable(record); } };
  return { context, input, values, events, gate, options, store, outbox };
}

test("repeated form submit freezes one complete action before await and applies the view only after files and queue are durable", async () => {
  const f = fixture(), submitter = createPersonalPhotoFormSubmitter(f.options);
  const promise = submitter.submit(f.input), id = submitter.state().operationId;
  f.input.fields.name = "After click"; f.input.files.reverse(); f.input.files[0].fileName = "changed";
  assert.equal(submitter.submit(f.input), promise); assert.equal(f.outbox.list().length, 0);
  assert.deepEqual(f.events, ["file-start"]); f.gate.resolve();
  const result = await promise;
  assert.equal(result.record.action.operationId, id); assert.equal(result.record.action.body.fields.name, "Click-time name");
  assert.deepEqual(f.events, ["file-start", "file-commit", "view"]);
  assert.equal(f.outbox.list().length, 1); assert.equal(submitter.submit(f.input), promise);
  const recovery = submitter.recoveryCopy(); assert.equal(recovery.automaticImportAllowed, false);
  assert.deepEqual(await Promise.all(recovery.files.map(part => part.file.text())), ["file 1", "file 2"]);
  assert.deepEqual(recovery.files.map(part => part.stage.fileName), ["1.png", "2.png"]);
});

for (const mode of ["store", "link", "view"]) test(`failure during ${mode} keeps the original whole form and cannot create a second operation`, async () => {
  const f = fixture({ failStore: mode === "store", failLink: mode === "link", onDurable() { if (mode === "view") throw Error("render failed"); } });
  const submitter = createPersonalPhotoFormSubmitter(f.options), promise = submitter.submit(f.input);
  const id = submitter.state().operationId; f.gate.resolve();
  await assert.rejects(promise, error => error.photoFormSubmission.operationId === id && error.unconfirmedMemoryDraft.items.item.name === "Click-time name");
  assert.equal(submitter.submit({ ...f.input, fields: { name: "Retry must not replace" } }), promise);
  assert.equal(submitter.state().phase, "blocked");
  assert.equal(f.outbox.list().length, mode === "view" ? 1 : 0);
  assert.equal(submitter.recoveryCopy().plan.action.operationId, id);
  assert.equal(await submitter.recoveryCopy().files[1].file.text(), "file 2");
});

for (const field of ["actorId", "listId", "scopeKey", "scope", "generation", "form"]) test(`changed ${field} after file commit never links or closes the old form`, async () => {
  const f = fixture(), submitter = createPersonalPhotoFormSubmitter(f.options), promise = submitter.submit(f.input);
  f.context[field] = "changed"; f.gate.resolve();
  await assert.rejects(promise, { code: "photo-form-submit" });
  assert.equal(f.outbox.list().length, 0); assert.deepEqual(f.events, ["file-start", "file-commit"]);
  if (!["generation", "form"].includes(field)) assert.equal(submitter.recoveryCopy(), null);
  else assert.ok(submitter.recoveryCopy());
});

test("form submit gate and synchronous preflight fail before any storage or UI callback", async () => {
  const f = fixture(), submitter = createPersonalPhotoFormSubmitter({ ...f.options, enabled: false });
  await assert.rejects(submitter.submit(f.input));
  assert.deepEqual(f.events, []); assert.equal(f.outbox.list().length, 0);
  const invalid = createPersonalPhotoFormSubmitter(f.options); f.input.fields.weight = NaN;
  await assert.rejects(invalid.submit(f.input)); assert.deepEqual(f.events, []);
});

test("reentrant callbacks see the same latched submission rather than minting a second ID", async () => {
  const f = fixture(); let reentered, submitter;
  submitter = createPersonalPhotoFormSubmitter({ ...f.options, createUuid() {
    reentered = submitter.submit(f.input); return crypto.randomUUID();
  } });
  const promise = submitter.submit(f.input); assert.equal(reentered, promise); f.gate.resolve();
  await promise; assert.equal(f.outbox.list().length, 1); assert.equal(f.events.filter(e => e === "view").length, 1);
});
