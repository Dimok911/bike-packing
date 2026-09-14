import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { canonicalListOperationJson as canonical } from "../../src/sync/list-operation-queue.js";
import { personalBusinessPayloadMatchesConfirmed } from "../../src/sync/personal-confirmed-business-equality.js";

const clone = structuredClone;
function fixture({ enabled = true, savedBase = true, edit = p => { p.items.item.weight = 120; } } = {}) {
  const values = new Map(), storage = { get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const binding = { actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a", environment: "bike-packing-experiment" };
  const context = { ...binding, scope: "personal", generation: "editor-1" };
  const photo = { id: "photo-old", listId: "", status: "synced", width: 640, height: 480, updatedAt: "2026-09-14T10:00:00.000Z",
    url: "https://api.vniipo-help.ru/letters-vniipo/api/bike-packing/lists/list-a/photos/photo-old/file?v=1",
    thumbUrl: "https://api.vniipo-help.ru/letters-vniipo/api/bike-packing/lists/list-a/photos/photo-old/thumb?v=1" };
  const payload = { items: { item: { id: "item", name: "Bottle", weight: 100 } },
    containers: { bag: { id: "bag", name: "Bag", photos: [photo] } },
    layouts: { layout: { id: "layout", name: "Trip", arrangement: { rootContainerIds: ["bag"],
      containers: { bag: { parentId: "", itemIds: ["item"], childIds: [], order: [] } }, items: { item: "bag" }, packedItems: {} } } } };
  const make = () => createPersonalSaveOutbox({ storage, ...binding, ordinaryRecoveryEnabled: enabled });
  const outbox = make(), local = clone(payload);
  if (savedBase) outbox.adoptRemoteBaseline({ snapshot: payload, payload, stateRevision: 1582 });
  edit(local);
  const first = outbox.capture({ snapshot: { ...local, localUi: "packing" }, body: { baseStateRevision: 1582, payload: local } });
  assert.equal(outbox.ordinaryRecoveryState().eligible, enabled, "the fixture has a valid ordinary photo inventory");
  const remote = { id: binding.listId, ownerId: binding.actorId, stateRevision: 1585, payload: clone(payload) };
  remote.payload.containers.newBag = { id: "newBag", name: "Server bag", photos: [] };
  for (const p of remote.payload.containers.bag.photos) for (const key of ["url", "thumbUrl"]) {
    p[key] = p[key].replace("https://api.vniipo-help.ru/letters-vniipo/api", "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api");
  }
  const proof = record => ({ historicalOnly: true, resultStatus: 409, stateRevision: 1585, rejectionCode: "stale_state_revision",
    operation: { environment: binding.environment, actorId: binding.actorId, listId: binding.listId,
      id: record.action.operationId, kind: "list.update", state: "rejected",
      payloadDigest: createHash("sha256").update(canonical({ environment: binding.environment,
        actorId: binding.actorId, listId: binding.listId, kind: "list.update", body: record.action.body })).digest("hex") } });
  const receipts = new Map([[first.action.operationId, proof(first)]]), sends = [];
  const queue = { inspect: async request => clone(receipts.get(request.operationId)),
    run: async request => { sends.push(clone(request)); return { list: { stateRevision: 1586 } }; } };
  const options = { queue, getContext: () => context, readRemote: async () => clone(remote),
    makeSnapshot: (p, previous) => ({ ...p, localUi: previous.localUi }) };
  return { values, storage, binding, context, make, outbox, first, remote, receipts, sends, options };
}

test("verified saved base creates one new CAS root retaining local edit, fresh server addition and raw photo aliases", async () => {
  const f = fixture(), originals = [...f.values];
  const next = await f.outbox.reconcile(f.options);
  assert.notEqual(next.action.operationId, f.first.action.operationId);
  assert.equal(next.action.body.baseStateRevision, 1585);
  assert.deepEqual(next.action.body.causal, { dependsOn: [], reads: [] });
  assert.equal(next.action.body.payload.items.item.weight, 120);
  assert.deepEqual(next.action.body.payload.containers.newBag, f.remote.payload.containers.newBag);
  assert.deepEqual(next.action.body.payload.containers.bag.photos, f.remote.payload.containers.bag.photos);
  assert.deepEqual(next.mergeBase, { payload: f.remote.payload, stateRevision: 1585 });
  assert.equal(next.snapshot.localUi, "packing");
  assert.deepEqual([...f.values].slice(0, originals.length), originals);
  assert.equal(f.sends.length, 0, "comparison does not send or claim a confirmation");
  const cold = f.make(); assert.deepEqual(cold.recover(), next);
  const confirmed = [];
  await cold.drain({ ...f.options, onConfirmed: record => confirmed.push(record) });
  // The adapter requests receipt-only settlement and then a fresh read of the
  // same successor. The real queue's physical POST dedup is tested separately.
  assert.equal(f.sends.length, 2); assert.equal(f.sends[0].receiptOnly, true);
  assert.equal(f.sends.every(s => s.operationId === next.action.operationId), true);
  assert.equal(confirmed.length, 1); assert.equal(f.sends.some(s => s.operationId === f.first.action.operationId), false);
});

test("same-field conflict waits; explicit local choice retains unrelated current server fields", async () => {
  const f = fixture(); f.remote.payload.items.item.weight = 140;
  const original = [...f.values];
  await assert.rejects(f.outbox.reconcile(f.options), { code: "reconciliation-conflict" });
  assert.deepEqual([...f.values], original);
  const next = await f.outbox.reconcile({ ...f.options, resolveConflicts: async conflicts => {
    assert.equal(conflicts[0].localValue.weight, 120); assert.equal(conflicts[0].remoteValue.weight, 140);
    return { 0: "local" };
  } });
  assert.equal(next.action.body.payload.items.item.weight, 120);
  assert.ok(next.action.body.payload.containers.newBag);
});

test("whole-server conflict choice is a new ordinary root with current baseline, never an old action rewrite", async () => {
  const f = fixture(); f.remote.payload.items.item.weight = 140;
  const next = await f.outbox.reconcile({ ...f.options, resolveConflicts: async () => "server" });
  assert.deepEqual(next.action.body.payload, f.remote.payload);
  assert.equal(personalBusinessPayloadMatchesConfirmed({ confirmedPayload: f.remote.payload,
    candidatePayload: next.action.body.payload, listId: f.binding.listId, allowLegacy: true }), true);
});

for (const [name, options, change] of [
  ["missing saved base", { savedBase: false }, () => {}],
  ["gate disabled", { enabled: false }, () => {}],
  ["unknown original outcome", {}, f => f.receipts.clear()],
  ["changed server photo metadata", {}, f => { f.remote.payload.containers.bag.photos[0].width++; }],
  ["changed server owner", {}, f => { f.remote.ownerId = "other"; }],
  ["server revision behind its receipt", {}, f => { f.remote.stateRevision = 1584; }],
  ["local entity deletion", { edit: p => { delete p.items.item; } }, () => {}],
  ["local placement loss", { edit: p => { delete p.layouts.layout.arrangement.items.item; } }, () => {}]
]) test(`ordinary rebase retains originals and publishes nothing for ${name}`, async () => {
  const f = fixture(options); change(f); const before = [...f.values];
  await assert.rejects(f.outbox.reconcile(f.options));
  assert.deepEqual([...f.values], before); assert.equal(f.sends.length, 0);
});

test("context change during conflict choice leaves immutable old intent and no new root", async () => {
  const f = fixture(); f.remote.payload.items.item.weight = 140; const before = [...f.values];
  await assert.rejects(f.outbox.reconcile({ ...f.options, resolveConflicts: async () => {
    f.context.generation = "editor-2"; return { 0: "local" };
  } }));
  assert.deepEqual([...f.values], before); assert.equal(f.sends.length, 0);
});

test("quota failure retains the combined draft and original exact bytes without publishing", async () => {
  const f = fixture(), before = [...f.values]; f.storage.setItem = () => { throw Error("quota"); };
  await assert.rejects(f.outbox.reconcile(f.options), error => error.code === "quota"
    && error.unconfirmedMemoryDraft.items.item.weight === 120 && !!error.unconfirmedMemoryDraft.containers.newBag);
  assert.deepEqual([...f.values], before); assert.equal(f.sends.length, 0);
});
