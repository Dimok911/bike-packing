import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalPhotoFormSession } from "../../src/sync/personal-photo-form-session.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture(created = false) {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list" };
  const context = { ...binding, scope: "personal", generation: "base", form: "opened" }, values = new Map(), files = new Map(), events = [], scan = deferred();
  const base = { items: created ? {} : { item: { id: "item", name: "Before", photos: [] } }, containers: {}, layouts: {} };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const outbox = createPersonalSaveOutbox({ ...binding, storage, photoEnabled: true, photoBatchEnabled: true, photoFormEnabled: true });
  outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 5 });
  const store = { binding, ids: async () => { await scan.promise; return [...files.keys()]; },
    read: id => decodePersonalPhotoFormRecord(files.get(id), binding, id),
    async captureForm(value) { events.push("file"); files.set(value.action.operationId, await encodePersonalPhotoFormRecord({ binding, ...value })); } };
  const request = { binding, snapshot: structuredClone(base), basePayload: base, baseStateRevision: 5, created, entityType: "item", entityId: "item",
    fields: { name: "Chosen", note: "Chosen note" }, files: [1, 2].map(i => ({ file: new Blob([`selected ${i}`], { type: "image/png" }), fileName: `${i}.png` })) };
  const response = { ok: true, listId: "list", stateRevision: 5, items: [{ id: "item", listId: "list", ownerId: "actor", deleted: false,
    deletedAt: null, stateRevision: 3, payload: structuredClone(base.items.item || {}) }] };
  const options = { enabled: true, outbox, store, getContext: () => context,
    readEntities: async () => { events.push("GET"); return response; }, onDurable: () => { events.push("view"); } };
  return { binding, context, outbox, store, files, events, scan, request, response, options };
}

for (const created of [false, true]) test(`whole ${created ? "new" : "existing"} form freezes before storage scan and owner lookup, then links once`, async () => {
  const f = fixture(created), session = createPersonalPhotoFormSession(f.options), promise = session.submit(f.request);
  const id = session.state().operationId, copy = session.recoveryCopy();
  assert.equal(copy.ids.length, 5); assert.equal(copy.captured, null);
  assert.equal(copy.preview.items.item.name, "Chosen"); assert.equal(copy.preview.items.item.photos.length, 2);
  f.request.fields.name = "Late typing"; f.request.files.reverse();
  assert.equal(session.submit(f.request), promise); f.scan.resolve();
  const result = await promise;
  assert.equal(result.record.action.operationId, id); assert.equal(result.record.action.body.fields.name, "Chosen");
  assert.equal(result.record.action.body.baseEntityRevision, created ? 0 : 3);
  assert.deepEqual(f.events, created ? ["file", "view"] : ["GET", "file", "view"]);
  assert.equal(f.outbox.list().length, 1); assert.equal(session.submit(f.request), promise);
  assert.deepEqual(await Promise.all(session.recoveryCopy().files.map(part => part.file.text())), ["selected 1", "selected 2"]);
});

test("newer owner read cannot change the frozen base or allocate fresh action IDs", async () => {
  const f = fixture(), session = createPersonalPhotoFormSession(f.options), promise = session.submit(f.request);
  const ids = session.recoveryCopy().ids; f.response.stateRevision = 6; f.scan.resolve();
  await assert.rejects(promise, error => error.code === "photo-form-base" && error.unconfirmedMemoryDraft.items.item.name === "Chosen"
    && error.unconfirmedMemoryDraft.items.item.photos.length === 2 && error.unconfirmedPhotoFormFields.note === "Chosen note");
  assert.deepEqual(f.events, ["GET"]); assert.equal(f.outbox.list().length, 0);
  assert.equal(session.submit(f.request), promise); assert.deepEqual(session.recoveryCopy().ids, ids);
});

test("a retained unlinked file blocks the next form before owner GET or a second native capture", async () => {
  const f = fixture(), other = fixture(true), old = createPersonalPhotoFormSession(other.options);
  other.scan.resolve(); const retained = await old.submit(other.request);
  f.files.set(retained.record.action.operationId, other.files.get(retained.record.action.operationId));
  const session = createPersonalPhotoFormSession(f.options), promise = session.submit(f.request); f.scan.resolve();
  await assert.rejects(promise, { code: "photo-form-session" });
  assert.deepEqual(f.events, []); assert.equal(f.files.size, 1); assert.equal(f.outbox.list().length, 0);
});

for (const field of ["actorId", "scopeKey", "listId", "scope", "generation", "form"]) test(`scope check rejects changed ${field} during retained-file scanning`, async () => {
  const f = fixture(), session = createPersonalPhotoFormSession(f.options), promise = session.submit(f.request);
  f.context[field] = "changed"; f.scan.resolve(); await assert.rejects(promise);
  assert.deepEqual(f.events, []); assert.equal(f.outbox.list().length, 0);
});

test("pending DB work, disabled gate and non-JSON fields never turn into a photo upload", async () => {
  const f = fixture();
  const disabled = createPersonalPhotoFormSession({ ...f.options, enabled: false });
  await assert.rejects(disabled.submit(f.request));
  f.outbox.capture({ snapshot: f.request.snapshot, body: { payload: f.request.basePayload, baseStateRevision: 5 } });
  await assert.rejects(createPersonalPhotoFormSession(f.options).submit(f.request));
  f.request.fields.weight = NaN;
  await assert.rejects(createPersonalPhotoFormSession(f.options).submit(f.request));
  assert.deepEqual(f.events, []); assert.equal(f.files.size, 0);
});
