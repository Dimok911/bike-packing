import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { serverImportFixture } from "./personal-server-import-fixture.js";
import { personalServerPendingPhotoFormChain as chain } from "../../src/sync/personal-server-pending-photo-chain.js";
import { preparePersonalPendingPhotoForm } from "../../src/sync/personal-pending-photo-form-plan.js";
import { personalServerPhotoResultReference } from "../../src/sync/personal-pending-server-update.js";
import { personalFormPhotoResultReference, isPersonalPendingFormUpdate, validatePersonalPendingFormUpdateResult } from "../../src/sync/personal-pending-form-update.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { createPersonalPendingPhotoFormSession } from "../../src/sync/personal-pending-photo-form-session.js";
import { preparePersonalServerImport } from "../../src/sync/personal-server-import.js";
import { createPersonalServerImportSelectionStore } from "../../src/sync/personal-server-import-selection-store.js";
import { encodePersonalServerImportRecord, decodePersonalServerImportRecord } from "../../src/sync/personal-server-import-record.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";
import { createListOperationQueue, canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { createPersonalPhotoStaging } from "../../src/sync/personal-photo-staging.js";
import { drainPersonalPhotoForm } from "../../src/sync/personal-photo-form-drain.js";
import { personalPhotoRecoveryCancellationHead } from "../../src/sync/personal-photo-recovery-cancel.js";
import { personalPublicPendingPhotoInventory } from "../../src/sync/personal-public-photo-form-result.js";

const payloadOf = record => record.photoState?.payload || record.action.body.payload;
const causal = (root, parent, source = parent) => ({ baseOperationId: parent.action.operationId, reads: [],
  dependsOn: [...new Set([root.action.operationId, parent.action.operationId, source.action.operationId])].map(operationId => ({ operationId, listId: "list" })) });
function dbEdit(root, parent, source, payload, userDeletion) {
  return { version: 1, snapshot: structuredClone(payload), mergeBase: { payload: structuredClone(payloadOf(parent)), stateRevision: 7 },
    action: { ...root.action, operationId: randomUUID(), kind: "list.update", generation: parent.action.generation + 1,
      body: { baseStateRevision: 7, payload, ...(userDeletion ? { userDeletion } : {}),
        photoResults: source === root ? personalServerPhotoResultReference(source) : personalFormPhotoResultReference(source), causal: causal(root, parent, source) } } };
}
function form(root, parent, binding, entityType, entityId) {
  const base = payloadOf(parent), plan = preparePersonalPendingPhotoForm({ binding, snapshot: base, basePayload: base,
    baseStateRevision: 7, parentOperationId: parent.action.operationId, serverOperationId: root.action.operationId,
    entityType, entityId, fields: { name: `New photo form for ${entityType}` },
    files: [{ file: new Blob([`new bytes for ${entityType}`], { type: "image/png" }), fileName: "new.png" }] },
  { enabled: true, serverEnabled: true });
  return { version: 1, snapshot: plan.snapshot, mergeBase: { payload: structuredClone(base), stateRevision: 7 },
    action: { ...binding, operationId: plan.operationId, kind: "photos.mutate", generation: parent.action.generation + 1,
      body: { ...plan.body, causal: causal(root, parent) } },
    photoState: { version: 1, payload: plan.payload, fileIntentHash: "b".repeat(64), fileInventoryVersion: 2 } };
}
async function fixture(fileless = false) {
  const f = await serverImportFixture(fileless, { containerPhotos: true });
  const root = { version: 1, snapshot: structuredClone(f.plan.payload), mergeBase: { payload: f.selection.basePayload, stateRevision: 7 },
    action: { ...f.action, generation: 1 }, photoState: { version: 1, payload: f.plan.payload,
      fileIntentHash: fileless ? null : "a".repeat(64), ...(fileless ? {} : { fileInventoryVersion: 2 }) } };
  const item = f.plan.createdOwners.items[0], bag = f.plan.createdOwners.containers[0], edited = structuredClone(payloadOf(root));
  edited.items[item].weight = 57;
  const firstEdit = dbEdit(root, root, root, edited), firstForm = form(root, firstEdit, f.binding, "item", item);
  const deletion = preparePersonalDeletionBatch(payloadOf(firstForm), { type: "item", id: item });
  const removed = dbEdit(root, firstForm, firstForm, deletion.snapshot, deletion.intent);
  const secondForm = form(root, removed, f.binding, "container", bag), finalPayload = structuredClone(payloadOf(secondForm));
  finalPayload.containers[bag].note = "Final DB-only change";
  const final = dbEdit(root, secondForm, secondForm, finalPayload), records = [final, removed, root, secondForm, firstEdit, firstForm];
  return { root, firstEdit, firstForm, removed, secondForm, final, records, item, bag, listId: "list", operationId: final.action.operationId };
}

for (const fileless of [false, true]) test(`server ${fileless ? "fileless" : "multi-owner photo"} root retains both later file forms through fields, deletion and another owner`, async () => {
  const f = await fixture(fileless), original = structuredClone(f.records), result = chain(f);
  assert.ok(result);
  assert.deepEqual(result.forms, [f.root, f.firstForm, f.secondForm]);
  assert.deepEqual(result.steps, [f.root, f.firstEdit, f.firstForm, f.removed, f.secondForm, f.final]);
  assert.equal(result.serverOperationId, f.root.action.operationId);
  assert.equal(f.firstEdit.action.body.photoResults.version, 12);
  assert.equal(f.removed.action.body.photoResults.version, 13);
  assert.equal(f.final.action.body.photoResults.version, 13);
  assert.equal(result.source.action.operationId, f.secondForm.action.operationId);
  assert.equal(Object.hasOwn(payloadOf(result.head).items, f.item), false);
  assert.equal(chain({ ...f, operationId: f.root.action.operationId, entityType: "item", entityId: f.item }).entityId, f.item);
  assert.equal(chain({ ...f, entityType: "item", entityId: f.item }), null);
  assert.deepEqual(f.records, original);
});

test("server file ancestry rejects relabelled imports, skipped roots/parents, wrong owners and forged inventory", async () => {
  const fixtureBase = await fixture();
  for (const mutate of [f => { f.records = f.records.filter(record => record !== f.root); },
    f => { f.records.push(f.root); },
    f => { f.firstForm.action.body.causal.dependsOn = f.firstForm.action.body.causal.dependsOn.filter(dep => dep.operationId !== f.root.action.operationId); },
    f => { f.firstForm.action.body.ownerResult.serverOperationId = randomUUID(); },
    f => { f.firstForm.action.body.ownerResult.version = 1; },
    f => { f.firstForm.action.body.ownerResult.pendingPhotos = f.firstForm.action.body.ownerResult.pendingPhotos.filter(row => row.entityType === "item"); },
    f => { f.firstForm.action.body.ownerResult.owner.weight++; },
    f => { f.secondForm.action.actorId = "other"; },
    f => { f.secondForm.action.generation++; },
    f => { f.secondForm.action.body.causal.baseOperationId = f.firstForm.action.operationId; },
    f => { f.final.action.body.photoResults.version = 6; },
    f => { f.final.action.body.photoResults.operationId = f.firstForm.action.operationId; },
    f => { f.root.action.body.guestImport = f.root.action.body.serverImport; delete f.root.action.body.serverImport; },
    f => { f.final.action.body.payload.items[f.item] = structuredClone(payloadOf(f.firstForm).items[f.item]); }
  ]) { const f = structuredClone(fixtureBase); mutate(f); assert.equal(chain(f), null, mutate.toString()); }
});

test("server form DB descendants bind every pending owner and accept only exact published substitutions", async () => {
  const f = await fixture(), source = f.firstForm, basePayload = payloadOf(source), changed = structuredClone(basePayload);
  changed.containers[f.bag].note = "Change alongside pending item and bag files";
  const input = { source, basePayload, payload: changed, listId: "list" };
  assert.equal(isPersonalPendingFormUpdate(input), true);
  assert.equal(personalFormPhotoResultReference(source).owners.length, 2);
  for (const mutate of [p => { p.containers[f.bag].photos = []; },
    p => { p.containers[f.bag].photos[0].assetId = randomUUID(); },
    p => { p.containers[f.bag].photos[0].url = "/guessed"; },
    p => { p.items[f.item].photos.reverse(); }, p => { delete p.containers[f.bag]; }]) {
    const payload = structuredClone(changed); mutate(payload); assert.equal(isPersonalPendingFormUpdate({ ...input, payload }), false);
  }
  const child = dbEdit(f.root, source, source, changed), published = structuredClone(changed);
  for (const collection of ["items", "containers"]) for (const owner of Object.values(published[collection])) {
    owner.photos = (owner.photos || []).map(photo => photo.status === "pending" ? { ...photo, status: "synced", url: `/original/${photo.id}`, thumbUrl: `/thumb/${photo.id}` } : photo);
  }
  const receipt = { ok: true, stateRevision: 15, list: { id: "list", stateRevision: 15, payload: published },
    serverPhotoFormSourceOperationId: source.action.operationId, serverPhotoForm: { version: 1,
      serverOperationId: f.root.action.operationId, pendingPhotos: personalPublicPendingPhotoInventory(changed, "list") } };
  assert.equal(validatePersonalPendingFormUpdateResult(receipt, child.action), true);
  for (const mutate of [r => { r.list.payload.containers[f.bag].photos[0].assetId = randomUUID(); },
    r => { delete r.list.payload.items[f.item].custom; },
    r => { r.list.payload.items[f.item].photos.reverse(); }, r => { r.list.payload.containers[f.bag].photos.pop(); }]) {
    const result = structuredClone(receipt); mutate(result); assert.equal(validatePersonalPendingFormUpdateResult(result, child.action), false);
  }
});

for (const contextChange of [null, "actorId", "generation"]) test(`real server outbox retains mixed binary records and stops a changed context (${contextChange || "same editor, OFF recovery"})`, async () => {
  const f = await serverImportFixture(false, { containerPhotos: true }), values = new Map(), native = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = (enabled = true, overrides = {}) => createPersonalSaveOutbox({ ...f.binding, storage, photoEnabled: enabled, photoBatchEnabled: enabled,
    photoFormEnabled: enabled, photoEditEnabled: enabled, formOwnerResultEnabled: enabled, serverPhotoFormEnabled: enabled,
    serverImportEnabled: enabled, pendingFormUpdateEnabled: enabled, ...overrides });
  const outbox = make(), current = { ...f.binding, scope: "personal", generation: "opened-server-form" }, getContext = () => current;
  outbox.adoptRemoteBaseline({ snapshot: f.selection.basePayload, payload: f.selection.basePayload, stateRevision: 7 });
  const store = { binding: f.binding, ids: async () => [...native.keys()],
    read: id => { const row = native.get(id); return row ? (row.kind === "server" ? decodePersonalServerImportRecord : decodePersonalPhotoFormRecord)(row.bytes, f.binding, id) : null; },
    captureServer: async value => native.set(value.action.operationId, { kind: "server", bytes: await encodePersonalServerImportRecord({ binding: f.binding, ...value }) }),
    captureForm: async value => native.set(value.action.operationId, { kind: "form", bytes: await encodePersonalPhotoFormRecord({ binding: f.binding, ...value }) }) };
  const prepared = await preparePersonalServerImport({ selection: f.selection, enabled: true, outbox, store, getContext,
    selectionStore: createPersonalServerImportSelectionStore({ binding: f.binding, storage, locks: { request: async (_name, run) => run() }, getContext, enabled: true }),
    getState: () => f.selection.basePayload, getRevision: () => 7, makeSnapshot: value => value,
    loadFile: async () => ({ file: f.file, fileName: "Selected.png", thumb: null }), onCaptured: () => {} });
  await prepared(); const root = outbox.recover(), item = f.plan.createdOwners.items[0], bag = f.plan.createdOwners.containers[0];
  if (contextChange) {
    const before = [...values]; let release;
    store.ids = () => new Promise(resolve => { release = () => resolve([...native.keys()]); });
    const session = createPersonalPendingPhotoFormSession({ outbox, store, getContext, enabled: true, serverEnabled: true,
      onDurable: () => assert.fail("Changed editor must not adopt the old form") });
    const pending = session.submit({ binding: f.binding, snapshot: root.snapshot, basePayload: payloadOf(root), baseStateRevision: 7,
      parentOperationId: root.action.operationId, entityType: "item", entityId: item, created: false, fields: { name: "Unsent form" },
      files: [{ fileName: "unsent.png", file: new Blob(["retained unsent bytes"], { type: "image/png" }) }] });
    assert.equal(typeof release, "function"); current[contextChange] = "changed"; release();
    await assert.rejects(pending);
    assert.deepEqual([...values], before); assert.equal(native.size, 1);
    assert.equal((await store.read(root.action.operationId)).files.length, 2);
    if (contextChange === "actorId") assert.equal(session.recoveryCopy(), null);
    else assert.equal(await session.recoveryCopy().files[0].file.text(), "retained unsent bytes");
    return;
  }
  const submit = (entityType, entityId) => {
    const parent = outbox.recover();
    return createPersonalPendingPhotoFormSession({ outbox, store, getContext, enabled: true, serverEnabled: true, onDurable: record => {
      assert.deepEqual(make(false).recover(), record);
    } }).submit({ binding: f.binding, snapshot: parent.snapshot, basePayload: payloadOf(parent), baseStateRevision: 7,
      parentOperationId: parent.action.operationId, entityType, entityId, created: false, fields: { name: `Later ${entityType}` },
      files: [{ fileName: "later.png", file: new Blob([`saved ${entityType} bytes`], { type: "image/png" }) }] });
  };
  const first = (await submit("item", item)).record;
  const changed = structuredClone(first.snapshot); changed.items[item].weight = 81;
  const edit = outbox.capture({ snapshot: changed, body: { payload: changed, baseStateRevision: 7 } });
  assert.equal(edit.action.body.photoResults.version, 13);
  assert.deepEqual(edit.action.body.causal.dependsOn.map(dep => dep.operationId), [first.action.operationId, root.action.operationId]);
  const second = (await submit("container", bag)).record;
  assert.deepEqual(second.action.body.causal.dependsOn.map(dep => dep.operationId), [edit.action.operationId, root.action.operationId]);
  const finalPayload = structuredClone(second.snapshot); finalPayload.containers[bag].note = "Following DB edit";
  const final = outbox.capture({ snapshot: finalPayload, body: { payload: finalPayload, baseStateRevision: 7 } });
  const lastPayload = structuredClone(final.snapshot); lastPayload.containers[bag].note = "One more DB edit";
  const last = outbox.capture({ snapshot: lastPayload, body: { payload: lastPayload, baseStateRevision: 7 } });
  assert.deepEqual(last.action.body.causal.dependsOn.map(dep => dep.operationId), [final.action.operationId, second.action.operationId, root.action.operationId]);
  const cold = make(false), restored = cold.recover(); assert.deepEqual(restored, last);
  const result = chain({ records: cold.list(), operationId: restored.action.operationId, listId: "list" });
  assert.deepEqual(result.forms.map(record => record.action.operationId), [root.action.operationId, first.action.operationId, second.action.operationId]);
  assert.equal(native.size, 3);
  assert.equal((await store.read(root.action.operationId)).files.length, 2);
  assert.equal(await (await store.read(first.action.operationId)).files[0].file.text(), "saved item bytes");
  assert.equal(await (await store.read(second.action.operationId)).files[0].file.text(), "saved container bytes");
  const blockedEdit = structuredClone(restored.snapshot); blockedEdit.containers[bag].weight = 121;
  assert.throws(() => cold.capture({ snapshot: blockedEdit, body: { payload: blockedEdit, baseStateRevision: 7 } }), { code: "form-pending" });
  const oldGatesOnly = make(true, { serverPhotoFormEnabled: false, photoBatchCancellationEnabled: true });
  assert.deepEqual(oldGatesOnly.recover(), last);
  const savedValues = [...values], unexpected = () => assert.fail("OFF continuation must stop before any queue or stage request");
  const queue = { inspect: unexpected, run: unexpected, cancelExact: unexpected }, staging = { inspect: unexpected, stage: unexpected, cancel: unexpected };
  await assert.rejects(oldGatesOnly.drain({ queue, getContext, photoStore: store, photoStaging: staging }), { code: "server-photo-form-disabled" });
  await assert.rejects(oldGatesOnly.cancelPhotoUpload({ queue, getContext, photoStore: store, photoStaging: staging }), { code: "server-photo-form-disabled" });
  await assert.rejects(drainPersonalPhotoForm({ outbox: oldGatesOnly, store, staging, queue, getContext, enabled: true,
    serverEnabled: true, formOwnerResultEnabled: true, pendingFormUpdateEnabled: true, onAdopted: unexpected }), { code: "photo-form-drain" });
  assert.equal(personalPhotoRecoveryCancellationHead(last, { records: oldGatesOnly.list(), batchEnabled: true, formEnabled: true,
    editEnabled: true, formOwnerResultEnabled: true, serverEnabled: true, pendingFormUpdateEnabled: true }), false);
  assert.deepEqual([...values], savedValues);
  assert.equal(native.size, 3);
});

function networkFixture(record, overrides = {}) {
  const calls = [], action = record.action, context = { ...action, scope: "personal", generation: "same-editor" }, writes = [];
  const oldCapabilities = ["personalListCausalOperationsV1", "personalListOperationCancellationV1", "personalCausalPhotoPublicationV1",
    "personalCausalPhotoFormV1", "personalCausalPhotoFormOwnerResultV1", "personalCausalPhotoFormDescendantsV1", "personalCausalServerImportV1",
    "personalStagedPhotoAssetsV1", "personalStagedPhotoCancellationV1"];
  const state = { capabilities: oldCapabilities, known: null };
  const transport = { experiment: true, writes, apiUrl: path => path, prepare: async () => {},
    assertWritable: () => {}, beginWrite: async () => { calls.push("claim"); }, confirmWrite: () => true };
  const fetchImpl = async (path, options) => {
    calls.push({ path, method: options.method });
    assert.equal(options.method, "GET", "unsupported server continuation never POSTs");
    const data = path === "/auth/me" ? { user: { id: action.actorId } }
      : path === "/bike-packing/capabilities" ? { capabilities: state.capabilities }
      : state.known || { ok: true, operation: { id: action.operationId, state: "unknown" } };
    return new Response(JSON.stringify(data));
  };
  const locks = { request: async (_key, run) => run() }, getContext = () => context;
  const queue = createListOperationQueue({ transport, getContext, fetchImpl, locks, enabled: true, photoEnabled: true,
    photoFormEnabled: true, formOwnerResultEnabled: true, pendingFormUpdateEnabled: true, serverImportEnabled: true,
    cancellationEnabled: true, ...overrides });
  const request = { path: `/bike-packing/lists/list${action.kind === "photos.mutate" ? "/photos/mutate" : ""}`,
    method: action.kind === "photos.mutate" ? "POST" : "PUT", operationId: action.operationId, body: JSON.stringify(action.body) };
  return { queue, request, calls, state, transport, fetchImpl, locks, getContext };
}

test("server continuation queue blocks both new forms and DB descendants with its own flag OFF", async () => {
  const f = await fixture();
  for (const record of [f.firstForm, f.final]) for (const option of ["serverPhotoFormEnabled", "serverImportEnabled", "formOwnerResultEnabled"]) {
    const n = networkFixture(record, { serverPhotoFormEnabled: true, [option]: false });
    await assert.rejects(n.queue.run(n.request), { isOperationReceiptError: true });
    await assert.rejects(n.queue.cancelExact(n.request), { isOperationReceiptError: true });
    assert.deepEqual(n.calls, [], option);
  }
});

test("old server capabilities cannot claim server continuation forms, descendants or cancellation", async () => {
  const f = await fixture();
  for (const record of [f.firstForm, f.final]) for (const method of ["run", "cancelExact"]) {
    const n = networkFixture(record, { serverPhotoFormEnabled: true });
    await assert.rejects(n.queue[method](n.request), { isOperationReceiptError: true });
    assert.ok(n.calls.some(call => call.path === "/bike-packing/capabilities"));
    assert.equal(n.calls.includes("claim"), false);
  }
});

test("waiting server continuation rechecks server support and rejected receipts remain readable with writers OFF", async () => {
  const f = await fixture();
  for (const record of [f.firstForm, f.final]) {
    const n = networkFixture(record, { serverPhotoFormEnabled: true }), { action } = record;
    const payloadDigest = createHash("sha256").update(canonicalListOperationJson({ environment: action.environment,
      actorId: action.actorId, kind: action.kind, listId: action.listId, body: action.body })).digest("hex");
    const expected = { ...action, payloadDigest };
    const requestKey = createHash("sha256").update(canonicalListOperationJson({ path: n.request.path, method: n.request.method,
      body: action.body, actorId: action.actorId, operationId: action.operationId })).digest("hex");
    n.transport.writes.push({ id: action.operationId, recovery: { ...expected, type: "list", protocol: "causal-v1", requestKey } });
    const operation = { id: action.operationId, actorId: action.actorId, environment: action.environment, kind: action.kind,
      listId: action.listId, payloadDigest, state: "waiting" };
    n.state.known = { ok: true, operation, result: null, waiting: { code: "dependency_not_committed", retrySameOperation: true,
      operationIds: action.body.causal.dependsOn.map(dep => dep.operationId) } };
    await assert.rejects(n.queue.run(n.request), { isOperationReceiptError: true });
    assert.ok(n.calls.some(call => call.path === "/bike-packing/capabilities"));
    const off = networkFixture(record);
    off.state.known = { ok: true, operation: { ...operation, state: "rejected" }, result: { status: 409,
      payload: { ok: false, code: "dependency_rejected" } } };
    assert.equal((await off.queue.inspect(off.request)).operation.state, "rejected");
    assert.ok(off.calls.every(call => call.method === "GET"));
  }
});

test("a new server form's file cannot be staged or cancelled using only older photo gates", async () => {
  const f = await fixture(), n = networkFixture(f.firstForm), action = f.firstForm.action;
  const binding = Object.fromEntries(["actorId", "environment", "scopeKey", "listId"].map(key => [key, action[key]]));
  const attachment = action.body.changes.find(change => change.action === "attach"), stageId = attachment.assetId;
  const store = { binding, readStage: async () => ({ binding, action, stage: { operationId: stageId, ...attachment },
    fileMetadata: { hash: "a".repeat(64) }, intentHash: "b".repeat(64) }), claimStage: () => assert.fail("no stage claim") };
  const make = overrides => createPersonalPhotoStaging({ store, transport: n.transport, getContext: n.getContext,
    fetchImpl: n.fetchImpl, locks: n.locks, enabled: true, cancellationEnabled: true, batchEnabled: true,
    formEnabled: true, serverEnabled: true, ...overrides });
  for (const method of ["stage", "cancel"]) {
    await assert.rejects(make({})[method](action.operationId, stageId), { isPhotoStagingBlocked: true });
    assert.deepEqual(n.calls, []);
  }
  for (const method of ["stage", "cancel"]) {
    await assert.rejects(make({ serverPhotoFormEnabled: true })[method](action.operationId, stageId), { isPhotoStagingBlocked: true });
    assert.ok(n.calls.some(call => call.path === "/bike-packing/capabilities"));
  }
});
