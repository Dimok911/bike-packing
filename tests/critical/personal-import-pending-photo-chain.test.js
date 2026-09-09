import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { importPhotoChainFixture } from "./personal-import-photo-chain-fixture.js";
import { createPersonalPendingPhotoFormSession } from "../../src/sync/personal-pending-photo-form-session.js";
import { personalImportPendingPhotoFormChain as chain } from "../../src/sync/personal-import-pending-photo-chain.js";
import { validatePersonalPendingFormUpdateResult } from "../../src/sync/personal-pending-form-update.js";
import { personalPublicPendingPhotoInventory } from "../../src/sync/personal-public-photo-form-result.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";
import { drainPersonalPhotoForm } from "../../src/sync/personal-photo-form-drain.js";
import { personalPhotoRecoveryCancellationHead } from "../../src/sync/personal-photo-recovery-cancel.js";

const payloadOf = record => record.photoState?.payload || record.action.body.payload;
for (const importKind of ["guest", "archive"]) for (const changedContext of ["actorId", "generation"]) {
  test(`${importKind} changing ${changedContext} during native inventory inspection keeps the original import and stops the new form`, async () => {
    const f = await importPhotoChainFixture(importKind), before = [...f.values], nativeBefore = structuredClone([...f.native]);
    let release;
    f.store.ids = () => new Promise(resolve => { release = () => resolve([...f.native.keys()]); });
    const session = createPersonalPendingPhotoFormSession({ outbox: f.outbox, store: f.store, getContext: f.getContext,
      enabled: true, importEnabled: true, onDurable: () => assert.fail("A different editor must not adopt the saved form") });
    const saving = session.submit({ binding: f.binding, snapshot: f.root.snapshot, basePayload: payloadOf(f.root), baseStateRevision: 7,
      parentOperationId: f.root.action.operationId, created: false, entityType: "item", entityId: f.item,
      fields: { name: "Kept form" }, files: [{ fileName: "kept.png", file: new Blob(["kept bytes"], { type: "image/png" }) }] });
    assert.equal(typeof release, "function"); f.context[changedContext] = "different"; release();
    await assert.rejects(saving); assert.deepEqual([...f.values], before); assert.deepEqual([...f.native], nativeBefore);
    if (changedContext === "actorId") assert.equal(session.recoveryCopy(), null);
    else assert.equal(await session.recoveryCopy().files[0].file.text(), "kept bytes");
  });
}
const submit = (f, entityType, entityId) => {
  const parent = f.outbox.recover();
  return createPersonalPendingPhotoFormSession({ outbox: f.outbox, store: f.store, getContext: f.getContext,
    enabled: true, importEnabled: true, onDurable: saved => assert.deepEqual(f.make(false).recover(), saved) }).submit({
    binding: f.binding, snapshot: parent.snapshot, basePayload: payloadOf(parent), baseStateRevision: 7,
    parentOperationId: parent.action.operationId, entityType, entityId, created: false,
    fields: { name: `Later ${entityType}` }, files: [{ fileName: "later.png", file: new Blob([`saved ${entityType}`], { type: "image/png" }) }] });
};
const edit = (f, update, userDeletion) => {
  const payload = structuredClone(payloadOf(f.outbox.recover())); update(payload);
  return f.outbox.capture({ snapshot: payload, body: { payload, baseStateRevision: 7, ...(userDeletion ? { userDeletion } : {}) } });
};
async function fixture(kind, fileless = false) {
  const f = await importPhotoChainFixture(kind, fileless);
  const firstEdit = edit(f, p => { p.items[f.item].weight = 83; });
  const firstForm = (await submit(f, "item", f.item)).record;
  const deletion = preparePersonalDeletionBatch(payloadOf(firstForm), { type: "item", id: f.item });
  const removed = f.outbox.capture({ snapshot: deletion.snapshot, body: { payload: deletion.snapshot, baseStateRevision: 7, userDeletion: deletion.intent } });
  const secondForm = (await submit(f, "container", f.bag)).record;
  const final = edit(f, p => { p.containers[f.bag].note = "Final fields"; });
  return { ...f, firstEdit, firstForm, removed, secondForm, final, records: f.outbox.list(), operationId: final.action.operationId, listId: "list" };
}

for (const kind of ["guest", "archive"]) for (const fileless of [false, true]) {
  test(`${kind} ${fileless ? "fileless" : "photo"} import preserves new file forms across owners, deletion and cold OFF recovery`, async () => {
    const f = await fixture(kind, fileless), original = structuredClone(f.records), cold = f.make(false), result = chain(f);
    assert.ok(result);
    assert.deepEqual(result.forms, [f.root, f.firstForm, f.secondForm]);
    assert.deepEqual(result.steps, [f.root, f.firstEdit, f.firstForm, f.removed, f.secondForm, f.final]);
    assert.equal(result.importKind, kind); assert.equal(result.importOperationId, f.root.action.operationId);
    assert.equal(f.firstEdit.action.body.photoResults.version, kind === "guest" ? 4 : 3);
    assert.equal(f.firstForm.action.body.ownerResult.version, 3);
    assert.equal(f.firstForm.action.body.ownerResult.importKind, kind);
    assert.equal(f.final.action.body.photoResults.version, 9);
    assert.deepEqual(cold.recover(), f.final); assert.deepEqual(f.records, original);
    assert.equal(f.native.size, fileless ? 2 : 3);
    if (!fileless) assert.equal((await f.store.read(f.root.action.operationId)).files.length, 2);
    assert.equal(await (await f.store.read(f.firstForm.action.operationId)).files[0].file.text(), "saved item");
    assert.equal(await (await f.store.read(f.secondForm.action.operationId)).files[0].file.text(), "saved container");
    const previous = [...f.values], unexpected = () => assert.fail("Disabled continuation must stop before any network request");
    const off = f.make(true, { importPhotoFormEnabled: false, photoBatchCancellationEnabled: true });
    const queue = { inspect: unexpected, run: unexpected, cancelExact: unexpected }, staging = { inspect: unexpected, stage: unexpected, cancel: unexpected };
    await assert.rejects(off.drain({ queue, getContext: f.getContext, photoStore: f.store, photoStaging: staging }), { code: "import-photo-form-disabled" });
    await assert.rejects(off.cancelPhotoUpload({ queue, getContext: f.getContext, photoStore: f.store, photoStaging: staging }), { code: "import-photo-form-disabled" });
    await assert.rejects(drainPersonalPhotoForm({ outbox: off, store: f.store, staging, queue, getContext: f.getContext, enabled: true,
      guestEnabled: true, archiveEnabled: true, formOwnerResultEnabled: true, pendingFormUpdateEnabled: true, onAdopted: unexpected }), { code: "photo-form-drain" });
    assert.equal(personalPhotoRecoveryCancellationHead(f.final, { records: off.list(), batchEnabled: true, formEnabled: true,
      editEnabled: true, formOwnerResultEnabled: true, guestEnabled: true, archiveEnabled: true, pendingFormUpdateEnabled: true }), false);
    assert.deepEqual([...f.values], previous);
  });
}

for (const kind of ["guest", "archive"]) {
  test(`${kind} ancestry refuses relabelled import kinds, omitted dependencies, changed files and owner resurrection`, async () => {
    const original = await fixture(kind);
    for (const mutate of [f => { f.records = f.records.filter(r => r !== f.root); },
      f => { f.records.push(f.root); }, f => { f.firstForm.action.body.ownerResult.importKind = kind === "guest" ? "archive" : "guest"; },
      f => { f.firstForm.action.body.ownerResult.importOperationId = randomUUID(); },
      f => { f.firstForm.action.body.ownerResult.version = 2; },
      f => { f.firstForm.action.body.ownerResult.pendingPhotos.pop(); },
      f => { f.firstForm.action.body.ownerResult.owner.weight++; },
      f => { f.firstForm.action.body.causal.dependsOn.pop(); }, f => { f.secondForm.action.actorId = "foreign"; },
      f => { f.secondForm.action.generation++; }, f => { f.final.action.body.photoResults.version = 8; },
      f => { f.final.action.body.payload.items[f.item] = structuredClone(payloadOf(f.firstForm).items[f.item]); }]) {
      const f = structuredClone({ records: original.records, root: original.root, firstForm: original.firstForm, secondForm: original.secondForm,
        final: original.final, item: original.item, operationId: original.operationId, listId: "list" });
      for (const key of ["root", "firstForm", "secondForm", "final"]) f[key] = f.records.find(r => r.action.operationId === f[key].action.operationId);
      mutate(f); assert.equal(chain(f), null, mutate.toString());
    }
  });
  test(`${kind} descendant receipts accept only exact typed inventory and published photo substitutions`, async () => {
    const f = await fixture(kind), published = structuredClone(f.final.action.body.payload);
    for (const field of ["items", "containers"]) for (const owner of Object.values(published[field])) owner.photos = (owner.photos || []).map(photo =>
      photo.status === "pending" ? { ...photo, status: "synced", url: `/original/${photo.id}`, thumbUrl: `/thumb/${photo.id}` } : photo);
    const result = { ok: true, stateRevision: 14, list: { id: "list", stateRevision: 14, payload: published },
      importPhotoFormSourceOperationId: f.secondForm.action.operationId, importPhotoForm: { version: 1, importOperationId: f.root.action.operationId,
        importKind: kind, pendingPhotos: personalPublicPendingPhotoInventory(f.final.action.body.payload, "list") } };
    assert.equal(validatePersonalPendingFormUpdateResult(result, f.final.action), true);
    for (const mutate of [r => { r.importPhotoForm.importOperationId = randomUUID(); }, r => { r.importPhotoForm.importKind = "public"; },
      r => { r.importPhotoFormSourceOperationId = f.firstForm.action.operationId; }, r => { r.importPhotoForm.pendingPhotos = []; },
      r => { r.list.payload.containers[f.bag].photos.reverse(); }, r => { r.list.payload.containers[f.bag].photos[0].assetId = randomUUID(); }]) {
      const changed = structuredClone(result); mutate(changed); assert.equal(validatePersonalPendingFormUpdateResult(changed, f.final.action), false);
    }
  });
}

import { createListOperationQueue, canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { createPersonalPhotoStaging } from "../../src/sync/personal-photo-staging.js";

function networkFixture(record, overrides = {}) {
  const calls = [], action = record.action, context = { ...action, scope: "personal", generation: "same-editor" }, writes = [];
  const oldCapabilities = ["personalListCausalOperationsV1", "personalListOperationCancellationV1", "personalCausalPhotoPublicationV1",
    "personalCausalPhotoFormV1", "personalCausalPhotoFormOwnerResultV1", "personalCausalPhotoFormDescendantsV1", "personalCausalGuestImportV1", "personalCausalArchiveImportV1", "personalCausalArchivePhotoImportV1",
    "personalStagedPhotoAssetsV1", "personalStagedPhotoCancellationV1", "personalCausalGuestDescendantsV1", "personalCausalArchiveDescendantsV1"];
  const state = { capabilities: oldCapabilities, known: null };
  const transport = { experiment: true, writes, apiUrl: path => path, prepare: async () => {},
    assertWritable: () => {}, beginWrite: async () => { calls.push("claim"); }, confirmWrite: () => true };
  const fetchImpl = async (path, options) => {
    calls.push({ path, method: options.method });
    assert.equal(options.method, "GET", "unsupported import continuation never POSTs");
    const data = path === "/auth/me" ? { user: { id: action.actorId } }
      : path === "/bike-packing/capabilities" ? { capabilities: state.capabilities }
      : state.known || { ok: true, operation: { id: action.operationId, state: "unknown" } };
    return new Response(JSON.stringify(data));
  };
  const locks = { request: async (_key, run) => run() }, getContext = () => context;
  const queue = createListOperationQueue({ transport, getContext, fetchImpl, locks, enabled: true, photoEnabled: true,
    photoFormEnabled: true, formOwnerResultEnabled: true, pendingFormUpdateEnabled: true, guestImportEnabled: true, archiveImportEnabled: true, archivePhotoImportEnabled: true,
    cancellationEnabled: true, ...overrides });
  const request = { path: `/bike-packing/lists/list${action.kind === "photos.mutate" ? "/photos/mutate" : ""}`,
    method: action.kind === "photos.mutate" ? "POST" : "PUT", operationId: action.operationId, body: JSON.stringify(action.body) };
  return { queue, request, calls, state, transport, fetchImpl, locks, getContext };
}

for (const importKind of ["guest", "archive"]) test(`${importKind} import continuation queue blocks both new forms and DB descendants with its own flag OFF`, async () => {
  const f = await fixture(importKind);
  for (const record of [f.firstForm, f.final]) for (const option of ["importPhotoFormEnabled", "formOwnerResultEnabled"]) {
    const n = networkFixture(record, { importPhotoFormEnabled: true, [option]: false });
    await assert.rejects(n.queue.run(n.request), { isOperationReceiptError: true });
    await assert.rejects(n.queue.cancelExact(n.request), { isOperationReceiptError: true });
    assert.deepEqual(n.calls, [], option);
  }
});

for (const importKind of ["guest", "archive"]) test(`${importKind} old server capabilities cannot claim import continuation forms, descendants or cancellation`, async () => {
  const f = await fixture(importKind);
  for (const record of [f.firstForm, f.final]) for (const method of ["run", "cancelExact"]) {
    const n = networkFixture(record, { importPhotoFormEnabled: true });
    await assert.rejects(n.queue[method](n.request), { isOperationReceiptError: true });
    assert.ok(n.calls.some(call => call.path === "/bike-packing/capabilities"));
    assert.equal(n.calls.includes("claim"), false);
    if (record === f.firstForm) {
      const selected = importKind === "guest" ? "personalCausalGuestDescendantsV1" : "personalCausalArchiveDescendantsV1";
      n.state.capabilities = [...n.state.capabilities, "personalCausalImportPhotoFormsV1"].filter(value => value !== selected);
      await assert.rejects(n.queue[method](n.request), { isOperationReceiptError: true });
      assert.equal(n.calls.includes("claim"), false, "The other import kind cannot authorize this form");
    }
  }
});

for (const importKind of ["guest", "archive"]) test(`${importKind} waiting import continuation rechecks server support and rejected receipts remain readable with writers OFF`, async () => {
  const f = await fixture(importKind);
  for (const record of [f.firstForm, f.final]) {
    const n = networkFixture(record, { importPhotoFormEnabled: true }), { action } = record;
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

for (const importKind of ["guest", "archive"]) test(`${importKind} a new import form's file cannot be staged or cancelled using only older photo gates`, async () => {
  const f = await fixture(importKind), n = networkFixture(f.firstForm), action = f.firstForm.action;
  const binding = Object.fromEntries(["actorId", "environment", "scopeKey", "listId"].map(key => [key, action[key]]));
  const attachment = action.body.changes.find(change => change.action === "attach"), stageId = attachment.assetId;
  const store = { binding, readStage: async () => ({ binding, action, stage: { operationId: stageId, ...attachment },
    fileMetadata: { hash: "a".repeat(64) }, intentHash: "b".repeat(64) }), claimStage: () => assert.fail("no stage claim") };
  const make = overrides => createPersonalPhotoStaging({ store, transport: n.transport, getContext: n.getContext,
    fetchImpl: n.fetchImpl, locks: n.locks, enabled: true, cancellationEnabled: true, batchEnabled: true,
    formEnabled: true, guestEnabled: true, archiveEnabled: true, ...overrides });
  for (const method of ["stage", "cancel"]) {
    await assert.rejects(make({})[method](action.operationId, stageId), { isPhotoStagingBlocked: true });
    assert.deepEqual(n.calls, []);
  }
  for (const method of ["stage", "cancel"]) {
    await assert.rejects(make({ importPhotoFormEnabled: true })[method](action.operationId, stageId), { isPhotoStagingBlocked: true });
    assert.ok(n.calls.some(call => call.path === "/bike-packing/capabilities"));
  }
  const selected = importKind === "guest" ? "personalCausalGuestDescendantsV1" : "personalCausalArchiveDescendantsV1";
  n.state.capabilities = [...n.state.capabilities, "personalCausalImportPhotoFormsV1"].filter(value => value !== selected);
  for (const method of ["stage", "cancel"]) {
    await assert.rejects(make({ importPhotoFormEnabled: true })[method](action.operationId, stageId), { isPhotoStagingBlocked: true });
    assert.equal(n.calls.includes("claim"), false, "Unrelated import support must not authorize a file claim");
  }
});
