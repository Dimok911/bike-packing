import test from "node:test";
import assert from "node:assert/strict";
import { preparePersonalArchivePhotoImport } from "../../src/sync/personal-archive-photo-import.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalArchivePhotoRecord, decodePersonalArchivePhotoRecord } from "../../src/sync/personal-archive-photo-record.js";
import { inspectPersonalPhotoRecovery } from "../../src/sync/personal-photo-recovery-inventory.js";

async function fixture() {
  const context = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor", scope: "personal", generation: "archive" };
  const values = new Map(), records = new Map(), events = [];
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = () => createPersonalSaveOutbox({ ...context, storage, photoEnabled: true, photoBatchEnabled: true, archiveImportEnabled: true, archivePhotoImportEnabled: true });
  const outbox = make(), current = { items: {}, containers: {}, layouts: {}, locations: [], categories: [] };
  outbox.adoptRemoteBaseline({ snapshot: current, payload: current, stateRevision: 1 });
  const source = { ...structuredClone(current), items: { archived: { id: "archived", name: "Chosen owner", photos: [{ id: "old" }] } } };
  const blob = new Blob(["archive original"], { type: "image/png" });
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const photoFiles = new Map([["old", { blob, thumbBlob: null, meta: { id: "old", sha256, size: blob.size, type: blob.type, fileName: "archived.png", width: 1, height: 1 } }]]);
  const store = { binding: outbox.binding, ids: async () => [...records.keys()],
    read: async id => records.has(id) ? decodePersonalArchivePhotoRecord(records.get(id), outbox.binding, id) : null,
    async captureArchive(input) {
      events.push("file-start"); const record = await encodePersonalArchivePhotoRecord({ binding: outbox.binding, ...input });
      records.set(input.action.operationId, record); events.push("file-commit"); return store.read(input.action.operationId);
    } };
  const options = { enabled: true, source, photoFiles, mode: "full", outbox, store,
    getContext: () => context, getState: () => current, getRevision: () => 1, makeSnapshot: value => value,
    onCaptured: saved => { assert.deepEqual(make().recover(), saved); events.push("view"); } };
  return { context, current, source, photoFiles, storage, values, records, events, store, outbox, make, options };
}

test("archive files and queue commit before view, preserve frozen choice during hashing and survive reload with the same action", async () => {
  const f = await fixture(), preparing = preparePersonalArchivePhotoImport(f.options);
  f.source.items.archived.name = "Late source"; f.photoFiles.clear();
  const commit = await preparing; assert.equal(f.records.size, 0); assert.deepEqual(f.events, []);
  const pending = commit(); assert.equal(commit(), pending); const saved = await pending;
  assert.deepEqual(f.events, ["file-start", "file-commit", "view"]); assert.equal(saved.snapshot.items.archived.name, "Chosen owner");
  assert.equal(saved.action.kind, "list.import"); assert.equal(saved.action.body.archiveImport.version, 2);
  assert.deepEqual(f.make().recover(), saved); assert.equal((await inspectPersonalPhotoRecovery({ ...f.options, outbox: f.make() })).entries[0].state, "linked");
  assert.throws(() => f.outbox.markApplied({ operationId: saved.action.operationId, stateRevision: 2 }), /вместе/);
  const newer = structuredClone(saved.snapshot); newer.items.archived.name = "Waiting edit";
  assert.throws(() => f.outbox.capture({ snapshot: newer, body: { payload: newer, baseStateRevision: 1 } }), /фото|карточк/);
  assert.equal(await commit.recoveryCopy().files[0].file.text(), "archive original");
});

for (const phase of ["files", "link", "account"]) test(`photo archive ${phase} failure retains complete bytes and never adopts a partial result`, async () => {
  const f = await fixture(), commit = await preparePersonalArchivePhotoImport(f.options), original = f.store.captureArchive;
  f.store.captureArchive = async input => {
    if (phase === "files") throw Error("disk full");
    const saved = await original(input);
    if (phase === "link") f.storage.setItem = () => { throw Error("quota"); };
    if (phase === "account") f.context.actorId = "other";
    return saved;
  };
  const first = commit(); assert.equal(commit(), first); await assert.rejects(first);
  assert.equal(f.outbox.list().length, 0); assert.equal(f.events.includes("view"), false);
  if (phase === "account") assert.equal(commit.recoveryCopy(), null);
  else assert.equal(await commit.recoveryCopy().files[0].file.text(), "archive original");
  if (phase !== "files") assert.equal(f.records.size, 1);
});

test("photo archive refuses abandoned earlier files and changed editor before capturing new bytes", async () => {
  const f = await fixture(), commit = await preparePersonalArchivePhotoImport(f.options);
  f.context.generation = "later"; await assert.rejects(commit()); assert.equal(f.records.size, 0);
  const blocked = await fixture(); blocked.store.ids = async () => ["unlinked-id"];
  blocked.store.read = async id => ({ binding: blocked.store.binding, action: { operationId: id }, files: [{ stage: {} }] });
  await assert.rejects(preparePersonalArchivePhotoImport(blocked.options), /Прежние файлы/); assert.deepEqual(blocked.events, []);
});
