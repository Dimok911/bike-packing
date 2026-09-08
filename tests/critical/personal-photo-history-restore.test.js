import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { preparePersonalHistoryRestore } from "../../src/sync/personal-history-restore.js";
import { personalPhotoHistoryPlan } from "../../src/sync/personal-photo-history-plan.js";
import { PERSONAL_PHOTO_HISTORY_RESTORE_ENABLED, validatePersonalPhotoHistoryResult } from "../../src/sync/personal-photo-history-protocol.js";
import { preservesConfirmedPersonalPhotoChain } from "../../src/sync/personal-confirmed-photos.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";

function fixture() {
  const context = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor", scope: "personal", generation: "history" };
  const photo = () => { const id = randomUUID(); return { id, photoId: id, assetId: randomUUID(), listId: "list", status: "synced",
    url: `/photo/${id}`, thumbUrl: `/thumb/${id}`, fileName: "chosen.png", type: "image/png", size: 30, width: 2, height: 3 }; };
  const old = photo(), fresh = photo(), base = { items: { item: { id: "item", photos: [fresh] } }, containers: {}, layouts: {} };
  const payload = structuredClone(base); payload.items.item.photos = [old];
  const heads = [old, fresh].map(reference => ({ photoId: reference.id, assetId: reference.assetId, entityType: "item", entityId: "item",
    revision: 4, deleted: reference === old, reference }));
  const manifest = { version: 2, historyId: 12, historyPayloadHash: "a".repeat(64), layoutIds: [], targetStateRevision: 5,
    payloadHash: createHash("sha256").update(canonicalListOperationJson(payload)).digest("hex"),
    photoRestore: personalPhotoHistoryPlan({ listId: "list", baseStateRevision: 5, currentPayload: base, payload, heads }).manifest };
  const preview = { ok: true, ...context, restore: { baseStateRevision: 5, payload, historyRestore: manifest } }, values = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = (photoRestoreEnabled = true) => createPersonalSaveOutbox({ ...context, storage, photoRestoreEnabled });
  const outbox = make(); outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 5 });
  const adopted = [], options = { historyId: 12, outbox, getContext: () => context, getState: () => base, getRevision: () => 5,
    readPreview: async () => preview, makeSnapshot: value => value, onCaptured: record => adopted.push(record), photoRestoreEnabled: true };
  return { old, fresh, base, payload, manifest, preview, values, storage, make, outbox, options, context, adopted };
}

test("photo history freezes a complete restorable outbox entry before UI, survives reload and allows exact dependent edits", async () => {
  assert.equal(PERSONAL_PHOTO_HISTORY_RESTORE_ENABLED, false);
  const f = fixture(), before = structuredClone(f.base), commit = await preparePersonalHistoryRestore(f.options);
  assert.deepEqual(f.base, before); assert.equal(f.adopted.length, 0);
  f.preview.restore.payload.items.item.name = "changed after preview";
  const record = commit(); assert.equal(commit(), null); assert.deepEqual(f.make().recover(), record);
  assert.equal(record.action.body.payload.items.item.name, undefined);
  const guard = outbox => preservesConfirmedPersonalPhotoChain({ records: outbox.list(), operationId: outbox.recover().action.operationId,
    listId: "list", allowHistoryRestore: true, confirmedBoundary: outbox.confirmedBoundary() });
  assert.equal(guard(f.make()), true);
  const current = f.make(), next = structuredClone(record.snapshot); next.items.item.name = "Later edit";
  current.capture({ snapshot: next, body: { payload: next, baseStateRevision: 5 } });
  assert.equal(guard(f.make()), true);
  const requests = [];
  await assert.rejects(f.make().drain({ getContext: () => f.context, queue: { run: async input => { requests.push(input); throw Error("lost ACK"); } } }), /lost ACK/);
  assert.equal(requests[0].operationId, record.action.operationId);
  await assert.rejects(f.make(false).drain({ getContext: () => f.context, queue: { run: () => assert.fail("disabled must not send") } }), /ещё не включено/);
  const damaged = f.make().list(); damaged.at(-1).action.body.payload.items.item.photos = [];
  assert.equal(preservesConfirmedPersonalPhotoChain({ records: damaged, operationId: damaged.at(-1).action.operationId, listId: "list", allowHistoryRestore: true }), false);
});

test("history rejects mismatched manifests, altered snapshot references, disabled gates and quota without adopting data", async () => {
  for (const change of [f => f.options.photoRestoreEnabled = false,
    f => f.preview.restore.historyRestore.photoRestore.owners[0].photoIds.reverse().push(randomUUID()),
    f => f.preview.restore.historyRestore.photoRestore.heads[0].revision++,
    f => f.preview.restore.historyRestore.photoRestore.extra = true,
    f => f.options.makeSnapshot = value => { value.items.item.photos[0].width++; return value; }]) {
    const f = fixture(); change(f);
    // A numerically plausible but changed version is server-verified again;
    // only corrupt its future revision here, which the client can prove wrong.
    if (f.preview.restore.historyRestore.photoRestore.heads[0].revision === 5) f.preview.restore.historyRestore.photoRestore.heads[0].revision = 6;
    await assert.rejects(preparePersonalHistoryRestore(f.options)); assert.equal(f.adopted.length, 0);
  }
  const f = fixture(), before = structuredClone(f.base), commit = await preparePersonalHistoryRestore(f.options);
  f.storage.setItem = () => { throw Error("quota"); };
  assert.throws(commit, /места/); assert.deepEqual(f.base, before); assert.equal(f.adopted.length, 0);
});

test("history receipt proves exact provenance and photo inventory including order and metadata", () => {
  const f = fixture(), expected = { listId: "list", body: f.preview.restore };
  const result = { ok: true, restoreHistoryId: 12, restoredLayoutIds: [], stateRevision: 6,
    photoHistoryRestore: structuredClone(f.manifest.photoRestore), list: { id: "list", stateRevision: 6, payload: structuredClone(f.payload) } };
  assert.equal(validatePersonalPhotoHistoryResult(result, expected), true);
  for (const change of [value => value.restoreHistoryId++, value => value.list.stateRevision++,
    value => value.photoHistoryRestore.heads.pop(), value => value.list.payload.items.item.photos = [],
    value => value.list.payload.items.item.photos[0].url += "changed"]) {
    const altered = structuredClone(result); change(altered); assert.equal(validatePersonalPhotoHistoryResult(altered, expected), false);
  }
});

test("rejected photo history keeps both frozen versions until explicit keep-server and retains that decision through reload", async () => {
  const f = fixture(), restored = (await preparePersonalHistoryRestore(f.options))();
  const remote = { id: "list", ownerId: "actor", stateRevision: 6, payload: structuredClone(f.base) };
  remote.payload.items.item.weight = 987;
  const historical = { historicalOnly: true, resultStatus: 409, rejectionCode: "stale_state_revision", stateRevision: 6,
    operation: { ...f.outbox.binding, id: restored.action.operationId, kind: "list.restore", state: "rejected", payloadDigest: "1".repeat(64) } };
  const queue = { inspect: async () => structuredClone(historical) };
  const options = { queue, getContext: () => f.context, readRemote: async () => remote, makeSnapshot: value => value };
  const before = [...f.values];
  await assert.rejects(f.outbox.reconcile({ ...options, resolveRejectedRestore: async () => "cancel" }), { code: "reconciliation-cancelled" });
  assert.deepEqual([...f.values], before);
  const kept = await f.outbox.reconcile({ ...options, resolveRejectedRestore: async () => "keep-server" });
  assert.equal(kept.action.kind, "list.update"); assert.equal(kept.action.body.historyRestore, undefined);
  assert.deepEqual(kept.action.body.payload, remote.payload); assert.deepEqual(f.make().recover(), kept);
  assert.deepEqual([...f.values].slice(0, before.length), before);
  assert.equal(preservesConfirmedPersonalPhotoChain({ records: f.make().list(), operationId: kept.action.operationId,
    listId: "list", allowHistoryRestore: true }), true);
});

test("confirmed photo restoration compacts without losing its exact pre-restore proof or permitting altered recovered photos", async () => {
  const f = fixture(), restored = (await preparePersonalHistoryRestore(f.options))();
  f.outbox.markApplied({ operationId: restored.action.operationId, stateRevision: 6 });
  f.outbox.compact();
  const reloaded = f.make(); assert.equal(reloaded.hasPending(), false); assert.deepEqual(reloaded.recover().action, restored.action);
  assert.equal(preservesConfirmedPersonalPhotoChain({ records: reloaded.list(), operationId: restored.action.operationId,
    listId: "list", allowHistoryRestore: true, confirmedBoundary: reloaded.confirmedBoundary() }), true);
  const current = fixture(), pending = (await preparePersonalHistoryRestore(current.options))();
  const entry = [...current.values].find(([key]) => key.endsWith(pending.action.operationId));
  const damaged = JSON.parse(entry[1]); damaged.action.body.payload.items.item.photos[0].width++;
  current.storage.setItem(entry[0], JSON.stringify(damaged));
  assert.throws(() => current.make().recover());
});

test("a newer confirmed edit is the restore base even while a previous compacted baseline remains", async () => {
  const f = fixture(), first = structuredClone(f.base); first.items.item.weight = 11;
  const saved = f.outbox.capture({ snapshot: first, body: { payload: first, baseStateRevision: 5 } });
  f.outbox.markApplied({ operationId: saved.action.operationId, stateRevision: 6 });
  f.outbox.adoptRemoteBaseline({ snapshot: first, payload: first, stateRevision: 6 });
  f.outbox.compact();
  const newer = structuredClone(first); newer.items.item.weight = 12;
  const second = f.outbox.capture({ snapshot: newer, body: { payload: newer, baseStateRevision: 6 } });
  f.outbox.markApplied({ operationId: second.action.operationId, stateRevision: 7 });
  f.preview.restore.baseStateRevision = 7; f.preview.restore.historyRestore.targetStateRevision = 7;
  const commit = await preparePersonalHistoryRestore({ ...f.options, getState: () => newer, getRevision: () => 7 });
  const restored = commit(); assert.equal(restored.action.body.baseStateRevision, 7);
  assert.deepEqual(restored.mergeBase, { stateRevision: 7, payload: newer });
});
