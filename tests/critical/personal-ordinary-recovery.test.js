import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { preservesConfirmedPersonalPhotoChain } from "../../src/sync/personal-confirmed-photos.js";
import { personalDeletionReference, preservesUndeletedEntities } from "../../src/sync/personal-deletion-intent.js";
import { PERSONAL_ORDINARY_RECOVERY_ENABLED, createPersonalOrdinaryRecoveryStore,
  assertOrdinaryRecoveryDispatchAllowed } from "../../src/sync/personal-ordinary-recovery.js";

const clone = value => structuredClone(value);
const paused = { code: "ordinary-recovery", isPersonalSaveBlocked: true };
function fixture({ count = 1, enabled = true, changeInput = () => {} } = {}) {
  const values = new Map();
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
  const context = { ...binding, scope: "personal", generation: "editor-1" };
  const photo = { id: "photo-a", listId: "", status: "synced", width: 20, height: 15, updatedAt: "2026-09-14T00:00:00.000Z",
    url: "https://api.vniipo-help.ru/letters-vniipo/api/bike-packing/lists/list-a/photos/photo-a/file",
    thumbUrl: "https://api.vniipo-help.ru/letters-vniipo/api/bike-packing/lists/list-a/photos/photo-a/thumb" };
  const payload = { items: {}, containers: { bag: { id: "bag", name: "Local bag", photos: [photo] },
    oldCopy: { id: "oldCopy", name: "Old shared photo", photos: [clone(photo)] } }, layouts: { layout: { id: "layout", containerIds: ["bag"] } } };
  const make = (on = enabled) => createPersonalSaveOutbox({ storage, ...binding, ordinaryRecoveryEnabled: on });
  const outbox = make(), records = [];
  for (let n = 0; n < count; n++) {
    const body = { payload: clone(payload), baseStateRevision: 1582, stateRevision: 1582, force: false, forceOverwrite: false,
      fullReplace: false, userPlacement: { type: "link-root", containerId: "bag", layoutId: "layout" } };
    body.payload.containers.bag.name += n;
    changeInput(body);
    records.push(outbox.capture({ body, snapshot: { ...clone(body.payload), localUi: "packing" } }));
  }
  const serverPayload = clone(payload); serverPayload.containers.bag.name = "Current server bag";
  const remote = { id: binding.listId, ownerId: binding.actorId, stateRevision: 1585, payload: serverPayload, updatedAt: "server-time", deleted: false };
  const f = { values, storage, binding, context, make, outbox, records, remote, cancels: [], reads: 0 };
  f.proof = (request, state = "rejected") => ({ historicalOnly: true, operation: { id: request.operationId,
    environment: binding.environment, actorId: binding.actorId, kind: "list.update", listId: binding.listId, state,
    payloadDigest: createHash("sha256").update(canonicalListOperationJson({ environment: binding.environment,
      actorId: binding.actorId, kind: "list.update", listId: binding.listId, body: JSON.parse(request.body) })).digest("hex") },
    ...(state === "committed" ? { resultStatus: 200, stateRevision: 1584 } : { resultStatus: 409, rejectionCode: "operation_cancelled",
      cancellation: { version: 1, operationId: request.operationId, noBusinessEffects: true, operationCannotApply: true } }) });
  f.options = { getContext: () => f.context, readRemote: async () => { f.reads++; return clone(f.remote); },
    makeSnapshot: (server, old) => ({ ...server, localUi: old.localUi }),
    queue: { cancelExact: async request => { f.cancels.push(clone(request)); return f.proof(request); } } };
  f.prepare = () => f.outbox.prepareOrdinaryRecoveryArchive({ getContext: f.options.getContext });
  f.recover = () => f.outbox.recoverOrdinaryWithServer(f.options);
  f.store = () => createPersonalOrdinaryRecoveryStore({ storage, binding });
  return f;
}

test("server recovery is OFF by default; reading a draft cannot authorize cancellation", async () => {
  assert.equal(PERSONAL_ORDINARY_RECOVERY_ENABLED, false);
  const f = fixture({ enabled: false }), before = [...f.values];
  assert.equal(f.outbox.ordinaryRecoveryState().eligible, false);
  assert.throws(f.prepare, paused); await assert.rejects(f.recover(), paused);
  assert.deepEqual([...f.values], before); assert.equal(f.cancels.length, 0);
});

test("readonly copy is scoped and detached, then the atomic archive preserves exact original bytes before cancellation", () => {
  const f = fixture({ count: 3 }); f.values.set("unrelated-account-token", "never-export");
  const before = [...f.values], copy = f.outbox.ordinaryRecoveryCopy();
  assert.equal(copy.entries.length, 3); assert.equal(JSON.stringify(copy).includes("never-export"), false);
  copy.snapshot.containers.bag.name = "mutated copy";
  assert.deepEqual([...f.values], before);
  const archive = f.prepare();
  assert.deepEqual(archive.choice, { type: "server" });
  assert.deepEqual(archive.operationIds, f.records.map(record => record.action.operationId));
  assert.equal(archive.entries.every(entry => f.values.get(entry.key) === entry.value), true);
  assert.equal(archive.snapshot.localUi, "packing"); assert.equal(f.cancels.length, 0);
  assert.deepEqual(f.prepare(), archive, "repeating the explicit choice allocates nothing");
  assert.deepEqual(f.outbox.ordinaryRecoveryCopy(), archive);
});

test("baseless old-photo chain is stopped exactly, then creates one fresh raw server CAS root without fake confirmation", async () => {
  const f = fixture({ count: 3 }), archive = f.prepare();
  assert.equal(f.records.every(record => !record.mergeBase), true);
  const result = await f.recover();
  assert.equal(result.action.operationId, archive.successorOperationId);
  assert.deepEqual(f.cancels.map(request => request.operationId), archive.operationIds);
  assert.deepEqual(f.cancels.map(request => JSON.parse(request.body)), f.records.map(record => record.action.body));
  assert.deepEqual(result.action.body.payload, f.remote.payload);
  assert.equal(result.action.body.baseStateRevision, 1585);
  assert.deepEqual(result.action.body.causal, { dependsOn: [], reads: [] });
  assert.deepEqual(result.mergeBase, { stateRevision: 1585, payload: f.remote.payload });
  assert.equal(result.snapshot.localUi, "packing");
  assert.equal(f.outbox.hasPending(), true); assert.equal(f.outbox.baseline(), null);
  assert.equal([...f.values.keys()].some(key => key.includes(":applied:")), false);
  assert.equal(f.outbox.ordinaryRecoveryState().pending, false);
  assert.deepEqual(f.make().recover(), result);
  assert.equal(preservesConfirmedPersonalPhotoChain({ records: f.outbox.list(), operationId: result.action.operationId,
    listId: f.binding.listId, allowLegacy: true }), true);
  for (const entry of archive.entries) assert.equal(f.values.get(entry.key), entry.value);
});

test("a committed cancellation-race winner remains historical and requires a server revision at least as new", async () => {
  const f = fixture({ count: 2 }); f.prepare();
  f.options.queue.cancelExact = async request => f.proof(request, request.operationId === f.records[0].action.operationId ? "committed" : "rejected");
  const result = await f.recover();
  assert.equal(result.reconciliation.settled[0].operation.state, "committed");
  assert.equal(result.reconciliation.settled[0].stateRevision, 1584);
  assert.deepEqual(result.action.body.payload, f.remote.payload);
});

test("partial cancellation and lost ACK resume from the original archive after reload", async () => {
  const f = fixture({ count: 3 }), archive = f.prepare(); let failed = false;
  f.options.queue.cancelExact = async request => {
    f.cancels.push(clone(request));
    if (!failed && f.cancels.length === 2) { failed = true; throw Error("lost cancellation ACK"); }
    return f.proof(request);
  };
  await assert.rejects(f.recover(), /lost cancellation ACK/);
  assert.equal(f.reads, 0); assert.equal(f.store().read().pending.archive.recoveryId, archive.recoveryId);
  f.outbox = f.make();
  const result = await f.recover(); assert.equal(result.action.operationId, archive.successorOperationId);
  assert.deepEqual(f.cancels.slice(2).map(request => request.operationId), archive.operationIds);
});

test("quota failure before archive durability performs no cancellation or successor capture", async () => {
  const f = fixture(), original = [...f.values];
  f.storage.setItem = () => { throw new DOMException("Storage quota exhausted", "QuotaExceededError"); };
  assert.throws(f.prepare, error => {
    assert.equal(error.code, "ordinary-recovery-storage"); assert.equal(error.stage, "archive"); assert.equal(error.reason, "quota");
    assert.match(error.message, /Не хватает места/); assert.match(error.message, /Серверная версия не загружена/);
    assert.doesNotMatch(error.message, /Выбрана серверная версия|выбор сохранён/i); return true;
  });
  await assert.rejects(f.recover(), paused);
  assert.deepEqual([...f.values], original); assert.equal(f.cancels.length, 0);
  assert.equal(f.reads, 0); assert.equal(f.store().read().pending, null);
});

for (const failure of ["storage-read", "storage-write", "write-unverified"]) test(`archive ${failure} reports the failed stage without claiming a saved choice`, () => {
  const f = fixture(), original = [...f.values], getItem = f.storage.getItem, setItem = f.storage.setItem;
  if (failure === "storage-read") f.storage.getItem = key => {
    if (key.includes(":archive:")) throw new DOMException("Unavailable storage", "SecurityError");
    return getItem(key);
  };
  else f.storage.setItem = (key, value) => {
    if (!key.includes(":archive:")) return setItem(key, value);
    if (failure === "storage-write") throw Error("Unavailable storage");
  };
  assert.throws(f.prepare, error => {
    assert.equal(error.code, "ordinary-recovery-storage"); assert.equal(error.stage, "archive"); assert.equal(error.reason, failure);
    assert.equal(error.isPersonalSaveBlocked, true); assert.equal(error.isOperationReceiptError, true);
    assert.match(error.message, /Не удалось подтвердить сохранение копии/);
    assert.match(error.message, /Серверная версия не загружена/); return true;
  });
  f.storage.getItem = getItem; f.storage.setItem = setItem;
  assert.deepEqual([...f.values], original); assert.equal(f.store().read().pending, null);
  assert.equal(f.cancels.length, 0); assert.equal(f.reads, 0);
});

test("archive verification read failure retains an already written archive without making an unproven success claim", () => {
  const f = fixture(), original = [...f.values], getItem = f.storage.getItem;
  f.storage.getItem = key => {
    if (key.includes(":archive:") && f.values.has(key)) throw new DOMException("Read unavailable", "SecurityError");
    return getItem(key);
  };
  assert.throws(f.prepare, { code: "ordinary-recovery-storage", stage: "archive", reason: "storage-read" });
  f.storage.getItem = getItem;
  for (const [key, value] of original) assert.equal(f.values.get(key), value);
  const archive = f.store().read().pending.archive;
  assert.deepEqual(f.prepare(), archive, "a later read resumes the same saved choice instead of allocating another archive");
  assert.equal(f.cancels.length, 0); assert.equal(f.reads, 0);
});

test("completion quota after successor write stays fenced and cold recovery completes the same UUID without network", async () => {
  const f = fixture(), archive = f.prepare(), setItem = f.storage.setItem;
  f.storage.setItem = (key, value) => { if (key.includes(":complete:")) throw new DOMException("Completion quota", "QuotaExceededError"); setItem(key, value); };
  await assert.rejects(f.recover(), { code: "ordinary-recovery-storage", stage: "completion", reason: "quota" });
  const captured = f.make().recover(); assert.equal(captured.action.operationId, archive.successorOperationId);
  assert.equal(f.store().read().pending.archive.recoveryId, archive.recoveryId);
  f.outbox = f.make(); f.storage.setItem = setItem;
  const calls = [f.cancels.length, f.reads];
  const recovered = await f.recover(); assert.deepEqual(recovered, captured);
  assert.deepEqual([f.cancels.length, f.reads], calls);
  assert.equal(f.store().read().pending, null);
});

test("pending choice blocks capture and drain even after rollout switches OFF", async () => {
  const f = fixture(); f.prepare(); const cold = f.make(false);
  const original = f.records[0];
  assert.equal(cold.ordinaryRecoveryState().pending, true);
  assert.throws(() => cold.capture({ snapshot: original.snapshot, body: original.action.body }), paused);
  await assert.rejects(cold.drain({ queue: { run: () => assert.fail("pending choice dispatched") }, getContext: f.options.getContext }), paused);
  assert.throws(() => assertOrdinaryRecoveryDispatchAllowed({ storage: f.storage, binding: f.binding }), paused);
});

test("archives survive ordinary compaction and permanently forbid the original UUID", async () => {
  const f = fixture({ count: 2 }), archive = f.prepare(), result = await f.recover();
  f.outbox.markApplied({ operationId: result.action.operationId, stateRevision: 1586 });
  f.outbox.compact(); const cold = f.make();
  assert.equal(cold.hasPending(), false);
  assert.equal(f.store().read().archives[0].completed, true);
  assert.deepEqual(f.store().archive(archive.recoveryId), archive);
  assert.throws(() => assertOrdinaryRecoveryDispatchAllowed({ storage: f.storage, binding: f.binding, operationId: archive.operationIds[0] }), paused);
  assert.doesNotThrow(() => assertOrdinaryRecoveryDispatchAllowed({ storage: f.storage, binding: f.binding, operationId: result.action.operationId }));
});

for (const field of ["actorId", "scopeKey", "listId", "generation", "scope"]) test(`context change during cancellation blocks recovery: ${field}`, async () => {
  const f = fixture({ count: 2 }); f.prepare();
  f.options.queue.cancelExact = async request => { f.cancels.push(request); f.context[field] = "changed"; return f.proof(request); };
  await assert.rejects(f.recover(), { code: "context", isPersonalSaveBlocked: true });
  assert.equal(f.cancels.length, 1); assert.equal(f.reads, 0); assert.equal(f.store().read().pending !== null, true);
});

test("a suspended old writer changing exact archived bytes during cancellation leaves both versions retained", async () => {
  const f = fixture({ count: 2 }), archive = f.prepare();
  f.options.queue.cancelExact = async request => {
    const entry = archive.entries[0], record = JSON.parse(entry.value);
    record.action.body.payload.containers.bag.name = "suspended writer";
    f.values.set(entry.key, JSON.stringify(record)); return f.proof(request);
  };
  await assert.rejects(f.recover(), paused); assert.equal(f.reads, 0);
  assert.equal(f.store().archive(archive.recoveryId).entries[0].value, archive.entries[0].value);
});

for (const [name, mutate] of [
  ["unknown receipt", proof => { proof.operation.state = "unknown"; }],
  ["foreign receipt", proof => { proof.operation.actorId = "someone-else"; }],
  ["wrong digest", proof => { proof.operation.payloadDigest = "0".repeat(64); }],
  ["missing cancellation certificate", proof => { delete proof.cancellation; }],
  ["cancellation can still apply", proof => { proof.cancellation.operationCannotApply = false; }]
]) test(`${name} cannot authorize a replacement action`, async () => {
  const f = fixture(); f.prepare(); f.options.queue.cancelExact = async request => { const proof = f.proof(request); mutate(proof); return proof; };
  await assert.rejects(f.recover(), paused); assert.equal(f.reads, 0);
  assert.equal(f.outbox.list().length, 1); assert.equal(f.store().read().pending !== null, true);
});

for (const [name, mutate] of [
  ["foreign owner", remote => { remote.ownerId = "other"; }],
  ["wrong list", remote => { remote.id = "other"; }],
  ["deleted list", remote => { remote.deleted = true; }],
  ["pending photo", remote => { remote.payload.containers.bag.photos[0].status = "pending"; }],
  ["hidden photo", remote => { remote.payload.settings = { photos: [] }; }]
]) test(`fresh server rejects ${name}`, async () => {
  const f = fixture(); f.prepare(); mutate(f.remote);
  await assert.rejects(f.recover(), paused); assert.equal(f.outbox.list().length, 1);
});

for (const [name, mutate] of [
  ["force", body => { body.force = true; }],
  ["full replacement", body => { body.fullReplace = true; }],
  ["pending legacy photo", body => { body.payload.containers.bag.photos[0].status = "pending"; }],
  ["hidden nested photos", body => { body.payload.settings = { photos: [] }; }]
]) test(`ordinary recovery does not admit ${name}`, () => {
  const f = fixture({ changeInput: mutate }); assert.equal(f.outbox.ordinaryRecoveryState().eligible, false);
  assert.throws(f.prepare, paused); assert.equal(f.cancels.length, 0);
});

test("special photo action fields cannot enter an ordinary recovery through capture", () => {
  assert.throws(() => fixture({ changeInput: body => { body.photoResults = {}; } }));
});

test("async snapshot callback and context change during fresh read cannot install stale server state", async () => {
  const f = fixture(); f.prepare(); f.options.makeSnapshot = async payload => payload;
  await assert.rejects(f.recover(), paused); assert.equal(f.outbox.list().length, 1);
  f.options.makeSnapshot = payload => payload;
  f.options.readRemote = async () => { f.context.generation = "next-editor"; return f.remote; };
  await assert.rejects(f.recover(), { code: "context" }); assert.equal(f.outbox.list().length, 1);
});

test("loss guard uses only the certified raw server boundary, including a baseless cold reader", async () => {
  const f = fixture({ count: 2, changeInput: body => { delete body.userPlacement; } }); f.prepare();
  const result = await f.recover(), records = f.outbox.list();
  const ordinaryRecoveryArchives = f.outbox.ordinaryRecoveryArchives();
  for (const base of [null, f.records[0].action.body.payload]) {
    const reference = personalDeletionReference(base, records, { ordinaryRecoveryArchives });
    assert.deepEqual(reference, f.remote.payload);
    assert.equal(preservesUndeletedEntities(result.snapshot, reference), true);
    reference.containers.bag.name = "detached comparison";
    assert.equal(f.outbox.recover().mergeBase.payload.containers.bag.name, "Current server bag");
  }
});

test("loss guard refuses a naked decision label, foreign archive, altered original action or cancellation proof", async () => {
  const f = fixture({ changeInput: body => { delete body.userPlacement; } }); f.prepare(); await f.recover();
  const originalRecords = f.outbox.list(), archives = f.outbox.ordinaryRecoveryArchives(), base = f.records[0].action.body.payload;
  assert.throws(() => personalDeletionReference(base, originalRecords));
  for (const mutate of [
    (records, archives) => { archives[0].binding.actorId = "foreign"; },
    records => { records[0].action.body.payload.containers.bag.name = "changed immutable intent"; },
    records => { delete records.at(-1).reconciliation.settled[0].cancellation; },
    records => { records.at(-1).mergeBase.payload.containers.bag.name = "invented server baseline"; }
  ]) {
    const records = clone(originalRecords), ordinaryRecoveryArchives = clone(archives); mutate(records, ordinaryRecoveryArchives);
    assert.throws(() => personalDeletionReference(base, records, { ordinaryRecoveryArchives }));
  }
});

test("new root proof cannot hide a later undeclared removal", async () => {
  const f = fixture({ changeInput: body => { delete body.userPlacement; } }); f.prepare(); await f.recover();
  const payload = clone(f.remote.payload); delete payload.containers.oldCopy;
  f.outbox.capture({ body: { payload, baseStateRevision: 1585 }, snapshot: payload });
  const reference = personalDeletionReference(null, f.outbox.list(), { ordinaryRecoveryArchives: f.outbox.ordinaryRecoveryArchives() });
  assert.deepEqual(reference, f.remote.payload);
  assert.equal(preservesUndeletedEntities(payload, reference), false);
});

test("an uncompleted recovery archive does not authorize the loss guard after a completion quota failure", async () => {
  const f = fixture({ changeInput: body => { delete body.userPlacement; } }); f.prepare();
  const setItem = f.storage.setItem;
  f.storage.setItem = (key, value) => { if (key.includes(":complete:")) throw Error("quota"); setItem(key, value); };
  await assert.rejects(f.recover(), { code: "ordinary-recovery-storage", stage: "completion", reason: "storage-write" });
  const cold = f.make(); assert.deepEqual(cold.ordinaryRecoveryArchives(), []);
  assert.throws(() => personalDeletionReference(f.records[0].action.body.payload, cold.list(), { ordinaryRecoveryArchives: cold.ordinaryRecoveryArchives() }));
});
