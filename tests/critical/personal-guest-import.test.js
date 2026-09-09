import test from "node:test";
import assert from "node:assert/strict";
import { guestSelectionFixture } from "./personal-guest-import-fixture.js";
import { createGuestLoginHandoff } from "../../src/public/guest-login-handoff.js";
import { preparePersonalGuestImportSelection } from "../../src/sync/personal-guest-import-selection.js";
import { preparePersonalGuestImport } from "../../src/sync/personal-guest-import.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalGuestImportRecord, decodePersonalGuestImportRecord } from "../../src/sync/personal-guest-import-record.js";
import { personalGuestImportReceipt } from "../../src/sync/personal-guest-import-protocol.js";
import { personalArchiveHash } from "../../src/sync/personal-archive-import-protocol.js";
import { inspectPersonalPhotoRecovery } from "../../src/sync/personal-photo-recovery-inventory.js";
import { personalPhotoRecoveryCancellationHead } from "../../src/sync/personal-photo-recovery-cancel.js";
import { drainPersonalPhotoForm } from "../../src/sync/personal-photo-form-drain.js";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";
import { createListOperationQueue } from "../../src/sync/list-operation-queue.js";
import { personalGuestCompletion, personalGuestCompletedBody, personalGuestPreparedIntent } from "../../src/sync/personal-guest-import-completion.js";
import { loadPersonalGuestImportPhoto } from "../../src/sync/personal-guest-import-photo-loader.js";
import { personalGuestBaseNeedsPreparation } from "../../src/sync/personal-guest-import-base.js";
import { recoverPersonalGuestImportLink } from "../../src/sync/personal-guest-import-link-recovery.js";

async function fixture({ fileless = false } = {}) {
  const input = guestSelectionFixture();
  if (fileless) {
    input.candidate.sourceState.items.item.photos = [];
    input.handoff = createGuestLoginHandoff({ candidate: input.candidate, eligibleLayoutIds: ["a", "b"], email: input.user.email,
      guestSessionId: "chosen-session", nowMs: input.nowMs });
  }
  const selection = preparePersonalGuestImportSelection(input, { enabled: true });
  const context = { ...input.binding, scope: "personal", generation: "guest" }, events = [], values = new Map(), records = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = (enabled = true) => createPersonalSaveOutbox({ ...input.binding, storage, photoEnabled: enabled, photoBatchEnabled: enabled, guestImportEnabled: enabled,
    photoBatchCancellationEnabled: enabled });
  const outbox = make(), current = structuredClone(input.basePayload);
  outbox.adoptRemoteBaseline({ snapshot: current, payload: current, stateRevision: input.baseStateRevision });
  const store = { binding: input.binding, ids: async () => [...records.keys()],
    read: async id => records.has(id) ? decodePersonalGuestImportRecord(records.get(id), input.binding, id) : null,
    async captureGuest(value) { events.push("files-start"); records.set(value.action.operationId, await encodePersonalGuestImportRecord({ binding: input.binding, ...value })); events.push("files-commit"); } };
  const selectionStore = { binding: input.binding, async capture(value) { events.push("selection"); return { selection: structuredClone(value), reused: false }; }, async rememberAction() { events.push("intent"); } };
  const options = { enabled: true, selection, selectionStore, outbox, store, getContext: () => context, getHandoff: () => input.handoff,
    getState: () => current, getRevision: () => input.baseStateRevision, makeSnapshot: value => value,
    loadFile: async () => { events.push("read-file"); return { file: new Blob(["guest original"], { type: "image/png" }), thumb: null, fileName: "guest.png" }; },
    onCaptured(saved) { assert.deepEqual(make(false).recover(), saved); events.push("view"); } };
  return { input, selection, selectionStore, context, events, values, records, storage, store, current, outbox, make, options };
}

function resultFor(action) {
  const payload = structuredClone(action.body.payload), manifest = action.body.guestImport;
  const guestPhotos = manifest.files.map(file => {
    const photo = { id: file.photoId, photoId: file.photoId, assetId: file.assetId, listId: action.listId, status: "synced",
      url: "https://files.example.test/original", thumbUrl: "https://files.example.test/thumb", fileName: file.file.fileName,
      type: file.file.type, size: file.file.size, width: 1, height: 1 };
    payload[file.entityType === "item" ? "items" : "containers"][file.entityId].photos = [photo];
    return { entityType: file.entityType, entityId: file.entityId, photoId: file.photoId, assetId: file.assetId,
      fileHash: file.file.hash, thumbHash: file.thumb?.hash || file.file.hash, photo };
  });
  return { ok: true, stateRevision: manifest.targetStateRevision + 1, list: { id: action.listId, stateRevision: manifest.targetStateRevision + 1, payload },
    guestImport: personalGuestImportReceipt(manifest), guestPhotos };
}

for (const fileless of [false, true]) test(`guest ${fileless ? "fileless" : "native photo"} action commits selection and bytes before view and reloads with writers off`, async () => {
  const f = await fixture({ fileless }), pending = preparePersonalGuestImport(f.options);
  f.selection.candidate.sourceState.items.item.name = "After preparation";
  const commit = await pending;
  assert.deepEqual(f.events, fileless ? ["selection", "intent"] : ["selection", "read-file", "intent"]);
  const first = commit(); assert.equal(first, commit()); const saved = await first;
  assert.equal(saved.action.kind, "list.import"); assert.equal(saved.action.operationId, f.selection.operationId);
  assert.equal(saved.action.body.guestImport.sourcePayload.items.item.name, "Guest tool");
  assert.deepEqual(f.make(false).recover(), saved); assert.equal(f.events.at(-1), "view");
  assert.equal(f.records.size, fileless ? 0 : 1);
  assert.equal((await inspectPersonalPhotoRecovery({ ...f.options, outbox: f.make(false) })).entries[0].state, "linked");
  assert.equal(personalPhotoRecoveryCancellationHead(saved, { guestEnabled: true, batchEnabled: true }), true);
  assert.equal(Boolean(personalPhotoRecoveryCancellationHead(saved, { guestEnabled: false, archiveEnabled: true, batchEnabled: true })), false);
  const edited = structuredClone(saved.snapshot); edited.items[Object.keys(edited.items)[0]].name = "Pending edit";
  assert.throws(() => f.outbox.capture({ snapshot: edited, body: { payload: edited, baseStateRevision: 7 } }));
});

for (const phase of ["selection", "files", "link", "handoff", "account"]) test(`guest ${phase} failure preserves source and never displays a partial transfer`, async () => {
  const f = await fixture();
  if (phase === "selection") f.selectionStore.capture = async () => { throw Error("quota"); };
  if (phase === "selection") {
    await assert.rejects(preparePersonalGuestImport(f.options)); assert.equal(f.events.includes("read-file"), false); return;
  }
  const commit = await preparePersonalGuestImport(f.options), capture = f.store.captureGuest;
  f.store.captureGuest = async value => {
    if (phase === "files") throw Error("disk full");
    await capture(value);
    if (phase === "link") f.storage.setItem = () => { throw Error("quota"); };
    if (phase === "handoff") f.input.handoff.guestSessionId = "new session";
    if (phase === "account") f.context.actorId = "other";
  };
  const pending = commit(); assert.equal(commit(), pending); await assert.rejects(pending);
  assert.equal(f.events.includes("view"), false); assert.equal(f.outbox.list().length, 0);
  if (phase === "account") assert.equal(commit.recoveryCopy(), null);
  else assert.equal(await commit.recoveryCopy().files[0].file.text(), "guest original");
});

test("guest queue uses its own capability and same operation after lost ACK; read-only recovery adopts the newer server checkpoint", async () => {
  const f = await fixture(), saved = await (await preparePersonalGuestImport(f.options))(), action = saved.action;
  let receipt, hidden = true, posts = 0, capabilities = ["personalListCausalOperationsV1", "personalCausalGuestImportV1"];
  const locks = { request: async (name, run) => run() };
  const fetchImpl = async (url, options) => {
    let data;
    if (url.endsWith("/auth/me")) data = { user: { id: "actor" } };
    else if (url.endsWith("/capabilities")) data = { capabilities };
    else if (url.endsWith("/freshness")) data = { stateRevision: 8 };
    else if (options.method === "POST") {
      const sent = JSON.parse(options.body); assert.deepEqual(sent.body, action.body); assert.equal(sent.operationId, action.operationId); posts++;
      receipt = { ok: true, operation: { id: action.operationId, environment: "bike-packing-experiment", actorId: "actor", listId: "list", kind: "list.import",
        payloadDigest: await personalArchiveHash({ environment: "bike-packing-experiment", actorId: "actor", kind: "list.import", listId: "list", body: action.body }), state: "committed" },
        result: { status: 200, payload: resultFor(action) } }; throw Error("lost ACK");
    } else data = !hidden && receipt || { ok: true, operation: { id: action.operationId, state: "unknown" } };
    return new Response(JSON.stringify(data), { status: 200 });
  };
  const queue = (enabled = true) => createListOperationQueue({ transport: createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN },
    storage: f.storage, locks, selection: "direct" }), getContext: () => f.context, locks, fetchImpl, enabled: true, photoEnabled: true,
    guestImportEnabled: enabled, readOnly: !enabled });
  const request = { path: "/bike-packing/lists/list/import", method: "POST", operationId: action.operationId, body: JSON.stringify(action.body) };
  capabilities = ["personalListCausalOperationsV1", "personalCausalArchiveImportV1"];
  await assert.rejects(queue().run(request)); assert.equal(posts, 0);
  capabilities = ["personalListCausalOperationsV1", "personalCausalGuestImportV1"];
  await assert.rejects(queue().run(request)); assert.equal(posts, 1);
  await assert.rejects(queue().run(request)); assert.equal(posts, 1);
  hidden = false; assert.equal((await queue(false).inspect(request)).operation.state, "committed");
  assert.equal((await queue().run({ ...request, receiptOnly: true })).operation.state, "committed"); assert.equal(posts, 1);
  const remote = { id: "list", ownerId: "actor", stateRevision: 9, payload: { ...structuredClone(f.current), note: "Later server state" } };
  let adopted;
  await drainPersonalPhotoForm({ enabled: true, guestEnabled: true, outbox: f.outbox, store: f.store, staging: { stage() { assert.fail("Committed import cannot upload again"); } },
    queue: queue(false), getContext: () => f.context, readRemote: async () => remote, onAdopted: value => { adopted = value; } });
  assert.deepEqual(adopted.snapshot, remote.payload); assert.equal(f.outbox.hasPending(), false); assert.equal(f.records.size, 1);
  assert.equal((await inspectPersonalPhotoRecovery({ ...f.options, outbox: f.make(false) })).entries[0].state, "settled-retained");
});

for (const fileless of [false, true]) test(`guest ${fileless ? "fileless" : "photo"} cancellation fences the exact import and keep-current cannot replay its source`, async () => {
  const f = await fixture({ fileless }), saved = await (await preparePersonalGuestImport(f.options))(), action = saved.action, calls = [];
  let proof;
  const queue = { async inspect() { if (!proof) throw Object.assign(Error("unknown"), { isOperationReceiptError: true }); return proof; },
    supportsCancellation: () => true, async cancelExact(request) {
      assert.equal(request.operationId, action.operationId); assert.deepEqual(JSON.parse(request.body), action.body); calls.push("owner");
      proof = { historicalOnly: true, operation: { id: action.operationId, environment: f.input.binding.environment, actorId: "actor", listId: "list", kind: "list.import", state: "rejected",
        payloadDigest: await personalArchiveHash({ environment: f.input.binding.environment, actorId: "actor", listId: "list", kind: "list.import", body: action.body }) },
        resultStatus: 409, stateRevision: null, rejectionCode: "operation_cancelled" }; return proof;
    } };
  const staging = { async cancel(operationId, assetId) {
    assert.equal(operationId, action.operationId); calls.push(assetId);
    const part = (await f.store.read(operationId)).files.find(part => part.stage.operationId === assetId);
    return { ok: true, operation: { ...f.input.binding, ...part.stage, id: assetId, state: "cancelled", payloadDigest: "a".repeat(64) },
      cancellation: { version: 1, stageOperationId: assetId, fileHash: part.fileMetadata.hash, thumbHash: part.fileMetadata.hash,
        noAssetPublished: true, stageCannotPublish: true } };
  } };
  await f.outbox.cancelPhotoUpload({ queue, getContext: () => f.context, photoStore: f.store, photoStaging: staging });
  assert.deepEqual(calls, ["owner", ...action.body.guestImport.files.map(part => part.assetId)]);
  const decision = await f.outbox.reconcile({ queue, getContext: () => f.context, readRemote: async () => ({ id: "list", ownerId: "actor", stateRevision: 7, payload: f.current }),
    resolveRejectedRestore: async details => { assert.equal(details.source, "guest"); return "keep-server"; } });
  assert.equal(decision.action.kind, "list.update"); assert.equal(decision.action.body.guestImport, undefined);
  assert.deepEqual(decision.action.body.payload, f.current); assert.equal(f.outbox.hasPending(), true);
  assert.deepEqual(f.make(false).list().find(record => record.action.operationId === action.operationId), saved);
});

test("guest completion reconstructs the exact source after compaction and rejects foreign, rejected or changed receipts", async () => {
  const f = await fixture(), saved = await (await preparePersonalGuestImport(f.options))(), action = saved.action;
  const proof = { historicalOnly: true, operation: { id: action.operationId, environment: f.input.binding.environment, actorId: "actor", listId: "list", kind: "list.import", state: "committed",
    payloadDigest: await personalArchiveHash({ environment: f.input.binding.environment, actorId: "actor", listId: "list", kind: "list.import", body: action.body }) }, resultStatus: 200, stateRevision: 8 };
  const completion = await personalGuestCompletion(f.selection, action, proof);
  assert.deepEqual(await personalGuestCompletedBody(f.selection, completion), action.body);
  assert.deepEqual(await personalGuestPreparedIntent(f.selection, action), { version: 1, files: action.body.guestImport.files, causal: action.body.causal });
  for (const change of [value => value.proof.operation.state = "rejected", value => value.proof.operation.actorId = "other",
    value => value.proof.stateRevision++, value => value.files[0].file.hash = "b".repeat(64), value => value.causal.dependsOn.push({ operationId: crypto.randomUUID(), listId: "list" })]) {
    const invalid = structuredClone(completion); change(invalid); await assert.rejects(personalGuestCompletedBody(f.selection, invalid));
  }
});

test("guest file loading uses the explicit guest scope and refuses a thumbnail as the only original", async () => {
  const bytes = new Blob(["original"], { type: "image/png" }), thumb = new Blob(["tiny"], { type: "image/png" }), calls = [];
  const options = { getCachedPhoto: async (id, scope) => { calls.push([id, scope]); return { blob: bytes, thumbBlob: thumb, fullBlobVerified: true }; },
    guestScope: "guest-source", fetchPhoto: () => assert.fail("verified local file must not be fetched") };
  assert.equal((await loadPersonalGuestImportPhoto({ photo: { id: "guest-photo", localId: "guest-local", status: "pending" } }, options)).file, bytes);
  assert.deepEqual(calls, [["guest-local", "guest-source"]]);
  await assert.rejects(loadPersonalGuestImportPhoto({ photo: { id: "guest-photo", status: "synced", thumbUrl: "https://example.test/thumb" } }, options), /оригинал|исходный/);
  const result = await loadPersonalGuestImportPhoto({ photo: { id: "guest-photo", status: "synced", url: "https://example.test/full", thumbUrl: "https://example.test/thumb" } },
    { ...options, fetchPhoto: async url => { assert.equal(url, "https://example.test/full"); return { ok: true, blob: async () => bytes }; } });
  assert.equal(result.file, bytes); assert.equal(result.thumb, null);
});

test("guest base preparation admits only the known missing quantity migration marker", () => {
  const base = guestSelectionFixture().candidate.sourceState, current = structuredClone(base);
  assert.equal(personalGuestBaseNeedsPreparation(base, current), false);
  current.layouts.a.arrangement.itemQuantityMigrationVersion = 3;
  assert.equal(personalGuestBaseNeedsPreparation(base, current), true);
  current.items.item.name = "Unconfirmed personal change";
  assert.throws(() => personalGuestBaseNeedsPreparation(base, current));
});

test("guest native-file link gap resumes the original body and snapshot after reload without reading or downloading source again", async () => {
  const f = await fixture(), commit = await preparePersonalGuestImport(f.options), write = f.storage.setItem;
  f.storage.setItem = () => { throw Error("link quota"); }; await assert.rejects(commit()); f.storage.setItem = write;
  const saved = await f.store.read(f.selection.operationId);
  const entry = { selection: f.selection, intent: await personalGuestPreparedIntent(f.selection, saved.action), completion: null };
  const options = { entry, outbox: f.make(), store: f.store, getContext: () => f.context, enabled: true };
  await assert.rejects(recoverPersonalGuestImportLink({ ...options, enabled: false }));
  const wrong = structuredClone(entry); wrong.intent.files[0].file.hash = "d".repeat(64);
  await assert.rejects(recoverPersonalGuestImportLink({ ...options, entry: wrong }));
  assert.equal(f.make().recover(), null);
  const linked = await recoverPersonalGuestImportLink(options);
  assert.deepEqual(linked.action, saved.action); assert.deepEqual(linked.snapshot, saved.snapshot);
  assert.deepEqual(f.make(false).recover(), linked); assert.equal(f.records.size, 1); assert.equal(f.events.filter(event => event === "read-file").length, 1);
});
