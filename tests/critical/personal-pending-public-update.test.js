import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { createPersonalPendingPublicFormSession } from "../../src/sync/personal-pending-public-form.js";
import { preparePersonalPublicImport } from "../../src/sync/personal-public-import.js";
import { createPersonalPublicImportSelectionStore } from "../../src/sync/personal-public-import-selection-store.js";
import { encodePersonalPublicImportRecord, decodePersonalPublicImportRecord } from "../../src/sync/personal-public-import-record.js";
import { inspectPersonalPhotoRecovery } from "../../src/sync/personal-photo-recovery-inventory.js";
import { publicImportFixture } from "./personal-public-import-fixture.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";
import { personalPublicPhotoResultReference, isPersonalPendingPublicUpdate, personalPendingPublicUpdateSource } from "../../src/sync/personal-pending-public-update.js";

async function fixture(fileless = false) {
  const f = await publicImportFixture(fileless);
  const source = { version: 1, snapshot: structuredClone(f.plan.payload),
    mergeBase: { payload: f.selection.basePayload, stateRevision: f.selection.baseStateRevision },
    action: { ...f.action, generation: 1 },
    photoState: { version: 1, payload: f.plan.payload, fileIntentHash: fileless ? null : "a".repeat(64), ...(fileless ? {} : { fileInventoryVersion: 2 }) } };
  return { source, item: f.plan.createdOwners.items[0], bag: f.plan.createdOwners.containers[0], layout: f.plan.importedLayoutIds[0] };
}
const allowed = (source, basePayload, payload, userDeletion = null) => isPersonalPendingPublicUpdate({ source, basePayload, payload, userDeletion, listId: "list" });
const child = (source, parent, payload, userDeletion) => ({ version: 1, snapshot: structuredClone(payload), action: { ...parent.action,
  kind: "list.update", operationId: randomUUID(), generation: parent.action.generation + 1,
  body: { baseStateRevision: 7, payload, ...(userDeletion ? { userDeletion } : {}), photoResults: personalPublicPhotoResultReference(source),
    causal: { baseOperationId: parent.action.operationId, reads: [], dependsOn: [...new Set([parent.action.operationId, source.action.operationId])].map(operationId => ({ operationId, listId: "list" })) } } } });

for (const fileless of [false, true]) test(`pending public ${fileless ? "fileless" : "photo"} fields and explicit deletion follow both exact parents without reviving owners`, async () => {
  const { source, item, bag } = await fixture(fileless), frozen = structuredClone(source), base = source.action.body.payload, edited = structuredClone(base);
  edited.items[item].weight = 99; edited.containers[bag].note = "Later public bag";
  assert.equal(allowed(source, base, edited), true);
  const first = child(source, source, edited), deletion = preparePersonalDeletionBatch(edited, { type: "item", id: item });
  assert.equal(allowed(source, edited, deletion.snapshot, deletion.intent), true);
  const second = child(source, first, deletion.snapshot, deletion.intent), final = structuredClone(deletion.snapshot); final.containers[bag].weight = 53;
  const third = child(source, second, final);
  assert.equal(personalPendingPublicUpdateSource({ records: [third, source, second, first], operationId: third.action.operationId, listId: "list" }), source);
  assert.equal(personalPublicPhotoResultReference(source).version, 7);
  assert.equal(allowed(source, deletion.snapshot, edited), false);
  assert.deepEqual(source, frozen);
});

test("pending public refuses missing/rebound/reordered files, unproved owner deletion and archive substitution", async () => {
  const { source, item, bag } = await fixture(), base = source.action.body.payload;
  for (const mutate of [p => p.items[item].photos.push(structuredClone(p.items[item].photos[0])), p => p.items[item].photos.pop(), p => delete p.items[item],
    p => p.containers[bag].photos = p.items[item].photos, p => p.items[item].photos[0].assetId = randomUUID(),
    p => p.items[item].photos[0].url = "https://guessed.test/file"]) {
    const actual = structuredClone(base); mutate(actual); assert.equal(allowed(source, base, actual), false);
  }
  const archive = structuredClone(source); archive.action.body.archiveImport = archive.action.body.publicImport; delete archive.action.body.publicImport;
  assert.equal(allowed(archive, base, base), false);
});

test("pending public layout removal keeps owners and all selected photos", async () => {
  const { source, item, layout } = await fixture(), base = source.action.body.payload, actual = structuredClone(base), deletion = { type: "layout", id: layout };
  delete actual.layouts[layout];
  assert.equal(allowed(source, base, actual, deletion), true); assert.equal(allowed(source, base, base, deletion), false);
  delete actual.items[item]; assert.equal(allowed(source, base, actual, deletion), false);
});

test("pending public ancestry rejects wrong source versions, omitted parents, cycles and foreign actors", async () => {
  const { source, item } = await fixture(), payload = structuredClone(source.action.body.payload); payload.items[item].weight = 50;
  const first = child(source, source, payload), second = child(source, first, payload);
  assert.equal(personalPendingPublicUpdateSource({ records: [source], operationId: source.action.operationId, listId: "list", includeSource: true }), source);
  for (const mutate of [r => r.action.body.photoResults.version = 3, r => r.action.body.causal.dependsOn.pop(), r => r.action.actorId = "foreign",
    r => r.action.body.causal.baseOperationId = r.action.operationId, r => r.action.body.photoResults.operationId = randomUUID(),
    r => r.action.generation++, r => r.action.body.payload.items[item].photos[0].assetId = randomUUID()]) {
    const changed = structuredClone(second); mutate(changed);
    assert.equal(personalPendingPublicUpdateSource({ records: [source, first, changed], operationId: changed.action.operationId, listId: "list" }), null);
  }
});

for (const fileless of [false, true]) for (const quota of [false, true]) test(`public pending form captures before view and cold restart, fileless=${fileless}, quota=${quota}`, async () => {
  const f = await publicImportFixture(fileless), values = new Map(), native = new Map(); let failWrites = false, views = 0;
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (failWrites) throw Error("quota"); values.set(key, value); }, removeItem: key => values.delete(key) };
  const getContext = () => ({ ...f.binding, scope: "personal", generation: "editor" }), locks = { request: async (_name, run) => run() };
  const make = (enabled = true) => createPersonalSaveOutbox({ ...f.binding, storage, photoEnabled: enabled, photoBatchEnabled: enabled,
    publicImportEnabled: enabled, pendingPublicUpdateEnabled: enabled });
  const outbox = make(); outbox.adoptRemoteBaseline({ snapshot: f.selection.basePayload, payload: f.selection.basePayload, stateRevision: 7 });
  const store = { binding: f.binding, ids: async () => [...native.keys()], read: id => decodePersonalPublicImportRecord(native.get(id), f.binding, id),
    capturePublic: async value => native.set(value.action.operationId, await encodePersonalPublicImportRecord({ binding: f.binding, ...value })) };
  const prepared = await preparePersonalPublicImport({ selection: f.selection, enabled: true, outbox, store, getContext,
    selectionStore: createPersonalPublicImportSelectionStore({ binding: f.binding, storage, locks, getContext, enabled: true }),
    getState: () => f.selection.basePayload, getRevision: () => 7, makeSnapshot: value => value,
    loadFile: async () => ({ file: f.file, fileName: "Selected.png", thumb: null }), onCaptured: () => {} });
  await prepared();
  const source = outbox.recover(), item = f.plan.createdOwners.items[0], before = [...values], frozen = structuredClone(source);
  const session = createPersonalPendingPublicFormSession({ enabled: true, outbox, getContext, onDurable: record => {
    assert.deepEqual(make(false).recover(), record); views++;
  } });
  const input = { binding: f.binding, created: false, entityType: "item", entityId: item,
    parentOperationId: source.action.operationId, snapshot: source.snapshot, basePayload: source.action.body.payload,
    baseStateRevision: 7, fields: { name: "Changed before public copy receipt", weight: 99 } };
  failWrites = quota;
  const result = session.submit(input); input.fields.name = "Caller changed after submit";
  if (quota) {
    await assert.rejects(result); assert.equal(views, 0); assert.deepEqual([...values], before);
    assert.equal(session.recoveryCopy().preview.items[item].weight, 99);
  } else {
    const saved = await result; assert.equal(session.submit(input), result); assert.equal(views, 1);
    assert.equal(saved.action.body.photoResults.version, 7); assert.equal(saved.action.body.photoResults.operationId, source.action.operationId);
    assert.equal(saved.action.body.payload.items[item].name, "Changed before public copy receipt");
    assert.deepEqual(saved.action.body.payload.items[item].photos, source.action.body.payload.items[item].photos);
    assert.deepEqual(make(false).list().find(row => row.action.operationId === source.action.operationId), frozen);
    const cold = make(false), unchanged = [...values];
    assert.deepEqual(cold.capture({ snapshot: saved.snapshot, body: { payload: saved.action.body.payload, baseStateRevision: 7 } }), saved);
    assert.deepEqual([...values], unchanged);
    const changed = structuredClone(saved.snapshot); changed.items[item].weight++;
    assert.throws(() => cold.capture({ snapshot: changed, body: { payload: changed, baseStateRevision: 7 } }));
    assert.deepEqual([...values], unchanged);
  }
  if (!fileless) {
    native.clear();
    const inventory = await inspectPersonalPhotoRecovery({ outbox: make(false), store, getContext });
    assert.equal(inventory.needsRecovery, true);
    assert.equal(inventory.entries[0].state, "missing-file");
    assert.deepEqual(inventory.entries[0].stageOperationIds, f.action.body.publicImport.files.map(file => file.assetId));
  }
});
