import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { drainPersonalSaveWithReconciliation } from "../../src/sync/personal-save-drain.js";
import { canonicalListOperationJson as canonical } from "../../src/sync/list-operation-queue.js";
import { preservesConfirmedPersonalPhotoChain } from "../../src/sync/personal-confirmed-photos.js";
import { preparePersonalLegacyPhotoPreservation } from "../../src/sync/personal-legacy-photo-preservation.js";

function fixture() {
  const values = new Map(), storage = { get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const context = { ...binding, scope: "personal", generation: "one" };
  const make = () => createPersonalSaveOutbox({ storage, ...binding, compactCaptureEnabled: true, compactDeliveryEnabled: true, ordinaryRecoveryEnabled: true });
  const photo = { id: "old-photo", listId: "", status: "synced", width: 640, height: 480, updatedAt: "2026-09-16T08:00:00.000Z",
    url: "https://api.vniipo-help.ru/letters-vniipo/api/bike-packing/lists/list/photos/old-photo/file?v=1",
    thumbUrl: "https://api.vniipo-help.ru/letters-vniipo/api/bike-packing/lists/list/photos/old-photo/thumb?v=1" };
  const base = { items: { item: { id: "item", name: "Bottle", weight: 100, photos: [photo] },
    other: { id: "other", name: "Pump", weight: 200, photos: [] } }, containers: {}, layouts: {} };
  const outbox = make(); outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 5 });
  let local = structuredClone(base);
  const capture = (name, extra = () => {}) => {
    const payload = structuredClone(local); payload.items.item.name = name;
    Object.assign(payload.items.item, { updatedAt: "2026-09-16T08:00:00.000Z", updatedByDeviceId: "phone", updatedByDeviceName: "Phone" });
    extra(payload);
    const record = outbox.capture({ snapshot: { ...payload, localUi: "packing" },
      body: { payload, baseStateRevision: 5, clientDeviceId: "phone", clientUpdatedAt: "2026-09-16T08:00:00.000Z" } });
    local = payload; return record;
  };
  const receipts = new Map();
  const proof = (record, revision) => ({ historicalOnly: true, resultStatus: 200, stateRevision: revision,
    operation: { environment: binding.environment, actorId: binding.actorId, listId: binding.listId,
      id: record.action.operationId, kind: record.action.kind, state: "committed", payloadDigest: createHash("sha256").update(canonical({
        environment: binding.environment, actorId: binding.actorId, listId: binding.listId, kind: record.action.kind, body: record.action.body })).digest("hex") } });
  const queue = { run: async request => {
    const record = outbox.list().find(r => r.action.operationId === request.operationId);
    receipts.set(request.operationId, proof(record, 5 + record.action.generation));
    return { stateRevision: 5 + record.action.generation };
  }, inspect: async request => structuredClone(receipts.get(request.operationId)) };
  return { binding, context, values, make, outbox, base, capture, queue, receipts, proof, local: () => structuredClone(local) };
}

test("ordinary form capture records name/meta only, retains UI and unchanged legacy photos across restart", async () => {
  const f = fixture(), first = f.capture("Bottle one"), second = f.capture("Bottle two");
  assert.equal(first.action.kind, "item.rename"); assert.equal(second.action.kind, "item.rename");
  assert.equal(second.action.body.expectedName, "Bottle one");
  assert.equal(second.action.body.causal.baseOperationId, first.action.operationId);
  assert.equal(second.action.body.itemMeta.updatedByDeviceName, "Phone");
  assert.ok(!Object.hasOwn(second.action.body, "payload"));
  assert.ok(Buffer.byteLength(JSON.stringify(second.action.body)) < 1000);
  assert.deepEqual(f.make().recoverSnapshot(), { ...f.local(), localUi: "packing" });
  assert.equal(preservesConfirmedPersonalPhotoChain({ records: f.outbox.list(), operationId: second.action.operationId, listId: "list", allowLegacy: true }), true);
  const prepared = await preparePersonalLegacyPhotoPreservation({ records: f.outbox.list(), operationId: second.action.operationId,
    listId: "list", getRecords: () => f.outbox.list(), getContext: () => f.context, enabled: true,
    capabilities: ["personalLegacyPhotoPreservationV1"], readRemote: async () => { throw Error("saved base is sufficient"); } });
  assert.equal(prepared.check(), true);
});

test("non-rename edits stay full actions; another business field cannot be hidden by compact capture", () => {
  for (const change of [p => p.items.item.weight++, p => p.items.other.name = "Other name", p => p.items.item.photos = []]) {
    const f = fixture(); assert.equal(f.capture("Bottle changed", change).action.kind, "list.update");
  }
});

test("oversized metadata falls back to a full action before publishing any compact command", () => {
  const f = fixture(), payload = structuredClone(f.base); payload.items.item.name = "Rename";
  const record = f.outbox.capture({ snapshot: payload, body: { payload, baseStateRevision: 5,
    affectedLayoutIds: Array.from({ length: 700 }, (_, i) => `layout-${i}`) } });
  assert.equal(record.action.kind, "list.update");
  assert.equal(f.outbox.list().length, 1);
});

test("compact receipt adopts fresh owned state atomically, including independent edits absent from local projection", async () => {
  const f = fixture(), head = f.capture("Bottle renamed"), remote = f.local();
  remote.items.other.weight = 300;
  let adopted = null;
  await drainPersonalSaveWithReconciliation({ outbox: f.outbox, queue: f.queue, getContext: () => f.context,
    readRemote: async () => ({ id: "list", ownerId: "actor", stateRevision: 8, payload: remote }),
    makeSnapshot: (payload, old) => ({ ...payload, localUi: old.localUi }),
    onConfirmed: () => assert.fail("single-item ACK is not a full catalog confirmation"),
    onAdopted: value => { adopted = value; } });
  assert.equal(adopted.action.operationId, head.action.operationId);
  assert.equal(adopted.snapshot.items.other.weight, 300);
  assert.equal(f.make().hasPending(), false);
  assert.equal(f.make().recoverSnapshot().items.other.weight, 300);
  assert.equal(f.make().list()[0].compactState.payload.items.other.weight, 200, "historical intent stays unchanged");
});

test("second rename during first ACK keeps both commands and requests a new ordered drain without applying old UI", async () => {
  const f = fixture(), first = f.capture("first"); let injected = false, applied = 0;
  const run = f.queue.run;
  f.queue.run = async request => { const result = await run(request);
    if (!injected) { injected = true; f.capture("second"); f.context.generation = "two"; }
    return result;
  };
  const options = { outbox: f.outbox, queue: f.queue, getContext: () => f.context,
    readRemote: async () => ({ id: "list", ownerId: "actor", stateRevision: 7, payload: f.local() }),
    onConfirmed: () => applied++, onAdopted: () => applied++ };
  await assert.rejects(drainPersonalSaveWithReconciliation(options), { code: "personal-save-superseded" });
  assert.equal(applied, 0); assert.equal(f.outbox.hasPending(), true);
  assert.equal(f.outbox.list().length, 2); assert.equal(f.outbox.list()[0].action.operationId, first.action.operationId);
  await drainPersonalSaveWithReconciliation(options);
  assert.equal(applied, 1); assert.equal(f.make().hasPending(), false);
  assert.equal(f.make().recoverSnapshot().items.item.name, "second");
});

test("changed account during ACK never receives another owner's snapshot or a same-owner retry", async () => {
  const f = fixture(); f.capture("first");
  const run = f.queue.run; f.queue.run = async request => { const result = await run(request); f.context.actorId = "someone-else"; return result; };
  await assert.rejects(drainPersonalSaveWithReconciliation({ outbox: f.outbox, queue: f.queue, getContext: () => f.context,
    onConfirmed: () => assert.fail("wrong account"), onAdopted: () => assert.fail("wrong account") }), { code: "context" });
  assert.equal(f.make().hasPending(), true);
});

test("rejected rename rebases independent fields as a new action, retaining exact compact history", async () => {
  const f = fixture(), first = f.capture("Renamed offline"), raw = [...f.values];
  const rejected = f.proof(first, 6); rejected.operation.state = "rejected";
  rejected.resultStatus = 409; rejected.rejectionCode = "rename_item_changed";
  f.receipts.set(first.action.operationId, rejected);
  const remote = structuredClone(f.base); remote.items.item.weight = 150;
  const next = await f.outbox.reconcile({ queue: f.queue, getContext: () => f.context,
    readRemote: async () => ({ id: "list", ownerId: "actor", stateRevision: 6, payload: remote }) });
  assert.equal(next.action.kind, "list.update");
  assert.equal(next.action.body.payload.items.item.name, "Renamed offline");
  assert.equal(next.action.body.payload.items.item.weight, 150);
  for (const key of ["version", "itemId", "expectedName", "name", "itemMeta"]) assert.equal(Object.hasOwn(next.action.body, key), false);
  assert.deepEqual([...f.values].slice(0, raw.length), raw);
  assert.deepEqual(f.make().recover(), next);
});
