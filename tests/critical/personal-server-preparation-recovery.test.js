import test from "node:test";
import assert from "node:assert/strict";
import { serverImportFixture, serverEntityFixture } from "./personal-server-import-fixture.js";
import { createPersonalServerImportSelectionStore } from "../../src/sync/personal-server-import-selection-store.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalServerImportRecord, decodePersonalServerImportRecord } from "../../src/sync/personal-server-import-record.js";
import { preparePersonalServerImport } from "../../src/sync/personal-server-import.js";
import { personalServerPendingPreparations, recoverPersonalServerImportPreparation, choosePersonalServerPreparation } from "../../src/sync/personal-server-import-preparation-recovery.js";
import { resolvePersonalServerPreparation, personalServerRecoverablePreparations } from "../../src/sync/personal-server-preparation-resolution.js";
import { inspectPersonalPhotoRecovery } from "../../src/sync/personal-photo-recovery-inventory.js";
import { personalArchiveHash } from "../../src/sync/personal-archive-import-protocol.js";

async function fixture(version, photos = true) {
  const input = version === 2 ? await serverEntityFixture({ photos }) : await serverImportFixture(!photos);
  const { binding, selection } = input, values = new Map(), native = new Map(), events = [];
  const context = { ...binding, scope: "personal", generation: "preparation-recovery" }, getContext = () => context;
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = () => createPersonalSaveOutbox({ ...binding, storage, photoEnabled: true, photoBatchEnabled: true,
    serverImportEnabled: true, publicEntityEnabled: true });
  const journal = (overrides = {}) => createPersonalServerImportSelectionStore({ binding, storage, getContext,
    locks: { request: async (key, run) => run() }, enabled: true, publicEntityEnabled: true, choiceEnabled: true, resolutionEnabled: true, ...overrides });
  const store = { binding, ids: async () => [...native.keys()],
    serverPreparationEntries: () => journal().entries(),
    read: async id => native.has(id) ? decodePersonalServerImportRecord(native.get(id), binding, id) : null,
    async captureServer(value) { native.set(value.action.operationId, await encodePersonalServerImportRecord({ binding, ...value })); events.push("native"); } };
  const loadFile = async () => { events.push("download"); return { file: input.file, thumb: null,
    fileName: input.action.body.serverImport.files[0]?.file.fileName || "Selected.png" }; };
  const outbox = make(); outbox.adoptRemoteBaseline({ snapshot: selection.basePayload, payload: selection.basePayload, stateRevision: selection.baseStateRevision });
  const prepare = () => preparePersonalServerImport({ selection, selectionStore: journal(), outbox, store, getContext,
    getState: () => selection.basePayload, getRevision: () => selection.baseStateRevision, makeSnapshot: value => value,
    loadFile, onCaptured: () => events.push("view"), enabled: true, publicEntityEnabled: true });
  const recover = async (overrides = {}) => recoverPersonalServerImportPreparation({ entry: (await journal().entries())[0],
    selectionStore: journal(), outbox: make(), store, getContext, makeSnapshot: value => value, loadFile,
    enabled: true, publicEntityEnabled: true, ...overrides });
  return { input, selection, binding, values, native, events, context, store, outbox, make, journal, prepare, recover };
}

for (const version of [1, 2]) for (const phase of ["selection", "fileless-selection", "prepared", "native"])
test(`server v${version} cold preparation recovery from ${phase} keeps the original source, action and IDs`, async () => {
  const f = await fixture(version, phase !== "fileless-selection"), selected = structuredClone(f.selection);
  await f.journal().capture(f.selection);
  if (["prepared", "native"].includes(phase)) {
    const commit = await f.prepare();
    if (phase === "native") {
      f.outbox.capturePhoto = async () => { throw Error("Crash before linking the queue"); };
      await assert.rejects(commit());
    }
  }
  const before = (await f.journal().entries())[0], originalAction = before.action && structuredClone(before.action);
  const reads = f.events.filter(value => value === "download").length;
  const saved = await f.recover();
  assert.deepEqual(saved.action, originalAction || { ...f.input.action, generation: 1 });
  assert.deepEqual(saved, f.make().recover());
  assert.deepEqual((await f.journal().entries())[0].selection, selected);
  assert.equal(f.events.includes("view"), false);
  assert.equal(f.events.filter(value => value === "download").length - reads, ["native", "fileless-selection"].includes(phase) ? 0 : 1);
  assert.equal(f.native.size, phase === "fileless-selection" ? 0 : 1);
});

for (const version of [1, 2]) test(`server v${version} recovery refuses changed or unavailable prepared bytes without replacing its action`, async () => {
  const f = await fixture(version); await f.prepare();
  const before = [...f.values], entry = (await f.journal().entries())[0];
  for (const loadFile of [async () => { throw Error("Source file unavailable"); }, async () => ({
    file: new Blob(["different public bytes"], { type: "image/png" }), thumb: null, fileName: entry.action.body.serverImport.files[0].file.fileName })]) {
    await assert.rejects(f.recover({ loadFile }));
    assert.deepEqual([...f.values], before); assert.equal(f.native.size, 0); assert.equal(f.make().hasPending(), false);
  }
  assert.deepEqual((await f.journal().entries())[0], entry);
  assert.deepEqual((await f.recover()).action, entry.action);
});

test("server preparation recovery gates and changed context stop before any bytes or queue write", async () => {
  const f = await fixture(2); await f.journal().capture(f.selection); const before = [...f.values];
  await assert.rejects(f.recover({ enabled: false }));
  assert.deepEqual([...f.values], before); assert.deepEqual(f.events, []);
  await assert.rejects(f.recover({ loadFile: async () => {
    f.context.generation = "different-editor";
    return { file: f.input.file, thumb: null, fileName: "Original.png" };
  } }));
  assert.deepEqual([...f.values], before); assert.equal(f.native.size, 0); assert.equal(f.make().hasPending(), false);
});

test("server preparation recovery refuses a stale caller or a different confirmed target without downloads", async () => {
  const f = await fixture(1); await f.journal().capture(f.selection);
  const stale = (await f.journal().entries())[0]; await f.prepare(); const before = [...f.values];
  await assert.rejects(f.recover({ entry: stale }));
  const changed = structuredClone(f.selection.basePayload); changed.categories.push("New confirmed target value");
  const outbox = f.make(); outbox.adoptRemoteBaseline({ snapshot: changed, payload: changed, stateRevision: f.selection.baseStateRevision + 1 });
  const reads = f.events.filter(value => value === "download").length;
  await assert.rejects(f.recover({ outbox }));
  assert.equal(f.events.filter(value => value === "download").length, reads);
  assert.deepEqual([...f.values], before); assert.equal(f.native.size, 0);
});

test("a selection-only public preparation fences its list until the exact action is linked", async () => {
  const f = await fixture(2); await f.journal().capture(f.selection);
  assert.deepEqual(personalServerPendingPreparations(await f.journal().entries(), f.make()).map(entry => entry.selection.operationId), [f.selection.operationId]);
  await f.recover();
  assert.deepEqual(personalServerPendingPreparations(await f.journal().entries(), f.make()), []);
});

test("multiple unfinished public selections remain available and cannot silently overtake each other", async () => {
  const f = await fixture(1), other = await serverImportFixture(false);
  await f.journal().capture(f.selection); await f.journal().capture(other.selection);
  const before = [...f.values]; await assert.rejects(f.recover());
  assert.deepEqual([...f.values], before); assert.deepEqual(f.events, []);
  assert.equal(personalServerPendingPreparations(await f.journal().entries(), f.make()).length, 2);
});

for (const version of [1, 2]) test(`server v${version} repeated file recovery on the same reader never substitutes the prepared action`, async () => {
  const f = await fixture(version); await f.prepare(); const entry = (await f.journal().entries())[0], outbox = f.make();
  await assert.rejects(f.recover({ outbox, loadFile: async () => ({ file: new Blob(["changed"], { type: "image/png" }),
    thumb: null, fileName: entry.action.body.serverImport.files[0].file.fileName }) }));
  assert.deepEqual((await f.recover({ outbox })).action, entry.action);
});

test("server recovery accepts the same validated action with a different JSON key order and retains the original journal bytes", async () => {
  const f = await fixture(1); await f.journal().capture(f.selection);
  const original = { ...f.input.action, generation: 1 };
  await f.journal().rememberAction({ selection: f.selection, action: original });
  const journalBefore = [...f.values];
  assert.deepEqual((await f.recover()).action, original);
  for (const [key, text] of journalBefore) assert.equal(f.values.get(key), text);
});

async function multiple(version = 1, photos = true) {
  const f = await fixture(version, photos), other = version === 2 ? await serverEntityFixture({ photos }) : await serverImportFixture(!photos);
  await f.journal().capture(f.selection); await f.journal().capture(other.selection);
  const entries = await f.journal().entries();
  const choose = (overrides = {}) => choosePersonalServerPreparation({ entries, operationId: f.selection.operationId,
    selectionStore: f.journal(), outbox: f.make(), store: f.store, getContext: () => f.context, enabled: true, ...overrides });
  return { ...f, other, entries, choose };
}

for (const version of [1, 2]) for (const photos of [false, true])
test(`explicit server v${version} ${photos ? "photo" : "fileless"} choice retains the other original selection across restart`, async () => {
  const f = await multiple(version, photos), before = [...f.values];
  const chosen = await f.choose();
  assert.deepEqual(chosen, f.entries[0]); assert.equal(f.values.size, before.length + 1);
  for (const [key, value] of before) assert.equal(f.values.get(key), value);
  assert.deepEqual(f.events, []); assert.equal(f.make().hasPending(), false);
  const entries = await f.journal().entries(), alternative = entries.find(entry => entry.selection.operationId === f.other.selection.operationId);
  assert.deepEqual(alternative.retainedAlternative, { version: 1, selectedOperationId: f.selection.operationId });
  assert.deepEqual(personalServerPendingPreparations(entries, f.make()), [chosen]);
  const action = (await f.recover({ entry: chosen })).action;
  assert.equal(action.operationId, f.selection.operationId);
  assert.deepEqual(action.body.serverImport.sourcePayload, chosen.selection.sourcePayload);
  assert.equal(f.native.size, photos ? 1 : 0);
  const rollback = f.journal({ enabled: false, publicEntityEnabled: false, choiceEnabled: false });
  assert.deepEqual(await rollback.entries(), await f.journal().entries());
  const exported = await rollback.recoveryRecords();
  assert.equal(exported.filter(row => row.key.endsWith(":selection")).length, 2);
  assert.equal(exported.filter(row => row.key.startsWith("choice:")).length, 1);
});

test("choosing the second preparation uses the explicit ID, not journal or UUID order", async () => {
  const f = await multiple(), chosen = await f.choose({ operationId: f.other.selection.operationId });
  assert.deepEqual(chosen, f.entries[1]);
  assert.deepEqual(personalServerPendingPreparations(await f.journal().entries(), f.make()), [chosen]);
  const saved = await f.recover({ entry: chosen }); assert.equal(saved.action.operationId, f.other.selection.operationId);
});

test("retained alternatives reject capture and action preparation while their original rows remain exportable", async () => {
  const f = await multiple(); await f.choose(); const before = [...f.values];
  await assert.rejects(f.journal().capture(f.other.selection));
  await assert.rejects(f.journal().rememberAction({ selection: f.other.selection, action: f.other.action }));
  await assert.rejects(f.recover({ entry: f.entries[1] }));
  assert.deepEqual([...f.values], before); assert.deepEqual(f.events, []);
  assert.deepEqual(await f.journal().read(f.other.selection.operationId), f.other.selection);
});

for (const gate of ["enabled"])
test(`server preparation choice respects ${gate} before writing while rollback reading works`, async () => {
  const f = await multiple(2), before = [...f.values];
  await assert.rejects(f.choose({ selectionStore: f.journal({ [gate]: false }) }));
  assert.deepEqual([...f.values], before); assert.deepEqual(await f.journal({ [gate]: false }).entries(), f.entries);
});

test("server preparation choice refuses a stale inventory or an action prepared in another tab", async () => {
  for (const changed of ["selection", "action"]) {
    const f = await multiple(), newer = await serverImportFixture(false);
    if (changed === "selection") await f.journal().capture(newer.selection);
    else await f.journal().rememberAction({ selection: f.other.selection, action: f.other.action });
    const before = [...f.values]; await assert.rejects(f.choose());
    assert.deepEqual([...f.values], before); assert.deepEqual(f.events, []);
  }
});

for (const changed of ["generation", "actorId", "base", "native"])
test(`server preparation choice rechecks ${changed} after asynchronous file inventory inspection`, async () => {
  const f = await multiple(), outbox = f.make(), before = [...f.values];
  const store = { ...f.store, async ids() {
    if (changed === "base") outbox.adoptRemoteBaseline({ snapshot: f.selection.basePayload, payload: f.selection.basePayload,
      stateRevision: f.selection.baseStateRevision + 1 });
    else if (changed === "native") {
      await f.store.captureServer({ action: f.other.action, snapshot: f.other.plan.payload, files: f.other.selection.photoTargets.map(target => ({
        stage: { operationId: target.assetId, photoId: target.photoId, entityType: target.entityType, entityId: target.entityId, fileName: "Selected.png" }, file: f.other.file, thumb: null })) });
      return [...f.native.keys()];
    } else f.context[changed] = "changed-editor";
    return [];
  } };
  await assert.rejects(f.choose({ store, outbox })); assert.deepEqual([...f.values], before);
});

test("a failed atomic choice write retains all candidates and does not select one on retry implicitly", async () => {
  const f = await multiple(), before = [...f.values];
  const storage = { get length() { return f.values.size; }, key: i => [...f.values.keys()][i], getItem: key => f.values.get(key) ?? null,
    setItem() { throw new DOMException("No space", "QuotaExceededError"); } };
  await assert.rejects(f.choose({ selectionStore: f.journal({ storage }) }));
  assert.deepEqual([...f.values], before); assert.deepEqual(personalServerPendingPreparations(await f.journal().entries(), f.make()), f.entries);
  await assert.rejects(f.recover()); assert.deepEqual(f.events, []);
});

test("corrupt choices block reads and new writers but raw recovery includes every original byte", async () => {
  const f = await multiple(); await f.choose();
  const key = [...f.values.keys()].find(key => key.includes(":choice:")); f.values.set(key, "broken choice");
  const before = [...f.values]; await assert.rejects(f.journal().entries()); await assert.rejects(f.prepare());
  assert.deepEqual([...f.values], before);
  assert.equal((await f.journal({ choiceEnabled: false }).recoveryRecords()).find(row => row.key.startsWith("choice:")).text, "broken choice");
});

test("a later explicit choice may retain a prior unprepared choice without inventing causal order", async () => {
  const f = await multiple(); await f.choose(); const newer = await serverImportFixture(false);
  await f.journal().capture(newer.selection);
  const pending = personalServerPendingPreparations(await f.journal().entries(), f.make());
  await f.choose({ entries: pending, operationId: newer.selection.operationId });
  const entries = await f.journal().entries();
  assert.deepEqual(personalServerPendingPreparations(entries, f.make()).map(entry => entry.selection.operationId), [newer.selection.operationId]);
  assert.equal(entries.filter(entry => entry.retainedAlternative).length, 2);
  assert.equal((await f.journal().recoveryRecords()).filter(row => row.key.startsWith("choice:")).length, 2);
});

for (const winner of ["choice", "action"]) test(`server preparation ${winner} wins a real serialized race without retiring an action`, async () => {
  const f = await multiple(); let tail = Promise.resolve();
  const locks = { request(key, run) { const result = tail.then(run); tail = result.catch(() => {}); return result; } };
  const journal = f.journal({ locks });
  const choose = () => journal.choosePreparation({ entries: f.entries, operationId: f.selection.operationId, assertCurrent() {} });
  const remember = () => journal.rememberAction({ selection: f.other.selection, action: f.other.action });
  // rememberAction hashes before acquiring the lock; awaiting its successful
  // run ensures this direction is also tested, independently of hash timing.
  if (winner === "action") { await remember(); await assert.rejects(choose()); }
  else { const first = choose(), second = remember(); await first; await assert.rejects(second); }
  const entries = await journal.entries(), other = entries.find(entry => entry.selection.operationId === f.other.selection.operationId);
  assert.equal(Boolean(other.action), winner === "action"); assert.equal(Boolean(other.retainedAlternative), winner === "choice");
});

async function resolvable(version = 1, phase = "native") {
  const f = await multiple(version, phase !== "fileless");
  const action = { ...f.other.action, generation: 1 };
  await f.journal().rememberAction({ selection: f.other.selection, action });
  if (phase === "native") await f.store.captureServer({ action, snapshot: f.other.plan.payload,
    files: action.body.serverImport.files.map(file => ({ stage: { operationId: file.assetId, photoId: file.photoId,
      entityType: file.entityType, entityId: file.entityId, fileName: file.file.fileName }, file: f.other.file, thumb: null })) });
  const calls = [], state = { owner: "unknown", failStage: false, failOwner: false };
  const proof = async () => ({ historicalOnly: true, operation: { id: action.operationId, environment: f.binding.environment,
    actorId: f.binding.actorId, listId: f.binding.listId, kind: "list.import", state: state.owner,
    payloadDigest: await personalArchiveHash({ environment: f.binding.environment, actorId: f.binding.actorId, listId: f.binding.listId,
      kind: action.kind, body: action.body }) }, resultStatus: state.owner === "committed" ? 200 : 409,
    stateRevision: state.owner === "committed" ? action.body.baseStateRevision + 1 : null });
  const stageProof = id => {
    const file = action.body.serverImport.files.find(file => file.assetId === id);
    return { ok: true, operation: { id, state: "cancelled", environment: f.binding.environment, actorId: f.binding.actorId,
      listId: f.binding.listId, entityType: file.entityType, entityId: file.entityId, photoId: file.photoId, payloadDigest: "a".repeat(64) },
      cancellation: { version: 1, stageOperationId: id, fileHash: file.file.hash, thumbHash: file.thumb?.hash || file.file.hash,
        noAssetPublished: true, stageCannotPublish: true } };
  };
  const queue = { inspect: async request => {
    calls.push("inspect-owner"); assert.equal(request.operationId, action.operationId); assert.deepEqual(JSON.parse(request.body), action.body);
    if (state.owner === "unknown") throw Object.assign(Error("Unknown"), { isOperationReceiptError: true }); return proof();
  }, supportsCancellation: () => true, cancelExact: async request => {
    calls.push("cancel-owner"); assert.equal(request.operationId, action.operationId); assert.deepEqual(JSON.parse(request.body), action.body);
    state.owner = "rejected"; if (state.failOwner) throw Error("Lost owner cancellation ACK"); return proof();
  } };
  const stage = mode => async (id, assetId) => {
    calls.push(`${mode}:${assetId}`); assert.equal(id, action.operationId);
    if (state.failStage) throw Error("Lost stage cancellation ACK"); return stageProof(assetId);
  };
  const staging = { inspect: stage("inspect-stage"), cancel: stage("cancel-stage") };
  const resolve = async (overrides = {}) => resolvePersonalServerPreparation({
    entry: (await f.journal().entries()).find(entry => entry.selection.operationId === action.operationId),
    selectionStore: f.journal(), outbox: f.make(), store: f.store, getContext: () => f.context,
    queue, staging, cancel: true, enabled: true, publicEnabled: true, publicEntityEnabled: true, ...overrides });
  const inventory = () => inspectPersonalPhotoRecovery({ outbox: f.make(), store: f.store, getContext: () => f.context });
  return { ...f, calls, state, action, proof, stageProof, queue, staging, resolve, inventory };
}

for (const version of [1, 2]) for (const phase of ["native", "fileless", "missing-native"]) for (const owner of ["unknown", "committed", "rejected"])
test(`server v${version} ${phase} ${owner} resolves the exact alternative and keeps the other choice and original bytes`, async () => {
  const f = await resolvable(version, phase), before = [...f.values], nativeBefore = [...f.native]; f.state.owner = owner;
  const result = await f.resolve({ cancel: owner !== "committed" });
  assert.equal(result.outcome, owner === "committed" ? "committed" : "rejected");
  assert.equal(f.calls.filter(value => value === "cancel-owner").length, owner === "unknown" ? 1 : 0);
  assert.equal(f.calls.filter(value => value.startsWith("cancel-stage:")).length, phase === "native" && owner !== "committed" ? f.action.body.serverImport.files.length : 0);
  for (const [key, value] of before) assert.equal(f.values.get(key), value);
  assert.deepEqual([...f.native], nativeBefore); assert.equal(f.make().hasPending(), false);
  const entries = await f.journal().entries(), inventory = await f.inventory();
  assert.deepEqual(personalServerRecoverablePreparations(entries, f.make(), inventory).map(entry => entry.selection.operationId), [f.selection.operationId]);
  assert.ok(inventory.entries.every(entry => entry.state === "settled-retained"));
  if (owner !== "committed") assert.equal((await f.recover({ entry: entries.find(entry => entry.selection.operationId === f.selection.operationId) })).action.operationId, f.selection.operationId);
});

for (const lost of ["owner", "stage"]) test(`lost server preparation ${lost} cancellation ACK resumes receipts without replacing original actions`, async () => {
  const f = await resolvable(); f.state[lost === "owner" ? "failOwner" : "failStage"] = true;
  const before = [...f.values], nativeBefore = [...f.native]; await assert.rejects(f.resolve(), /Lost/);
  for (const [key, value] of before) assert.equal(f.values.get(key), value);
  assert.deepEqual([...f.native], nativeBefore); assert.equal((await f.inventory()).needsRecovery, true);
  f.state.failOwner = false; f.state.failStage = false;
  assert.equal((await f.resolve()).outcome, "rejected");
  assert.equal(f.calls.filter(value => value === "cancel-owner").length, 1);
  assert.equal((await f.inventory()).needsRecovery, false);
});

test("server preparation read-only unknown result never writes a completion or calls cancellation", async () => {
  const f = await resolvable(), before = [...f.values];
  assert.equal((await f.resolve({ cancel: false, enabled: false, publicEnabled: false, publicEntityEnabled: false })).outcome, "unknown");
  assert.deepEqual([...f.values], before); assert.deepEqual(f.calls, ["inspect-owner"]);
});

for (const gate of ["enabled"])
test(`prepared server cancellation requires ${gate} before the first network call`, async () => {
  const f = await resolvable(2), before = [...f.values]; await assert.rejects(f.resolve({ [gate]: false }));
  assert.deepEqual([...f.values], before); assert.deepEqual(f.calls, []);
});

test("an already executed public alternative wins a cancellation race and its files are not cancelled", async () => {
  const f = await resolvable(); f.queue.cancelExact = async () => { f.state.owner = "committed"; return f.proof(); };
  assert.equal((await f.resolve()).outcome, "committed");
  assert.deepEqual(f.calls, ["inspect-owner"]); assert.equal((await f.inventory()).needsRecovery, false);
});

test("late native bytes after owner-only cancellation require their own exact stage settlement", async () => {
  const f = await resolvable(1, "missing-native"); await f.resolve();
  await f.store.captureServer({ action: f.action, snapshot: f.other.plan.payload, files: f.action.body.serverImport.files.map(file => ({
    stage: { operationId: file.assetId, photoId: file.photoId, entityType: file.entityType, entityId: file.entityId, fileName: file.file.fileName }, file: f.other.file, thumb: null })) });
  const inventory = await f.inventory(); assert.equal(inventory.entries[0].state, "server-preparation-needs-stage-proof");
  assert.equal(personalServerRecoverablePreparations(await f.journal().entries(), f.make(), inventory).length, 2);
  await f.resolve(); assert.equal((await f.inventory()).needsRecovery, false);
  assert.equal(f.calls.filter(value => value === "cancel-owner").length, 1);
});

test("a stale preparation-only variant can be explicitly retained without a server action or a new operation ID", async () => {
  const f = await multiple(), original = f.entries[1], before = [...f.values];
  const result = await resolvePersonalServerPreparation({ entry: original, selectionStore: f.journal(), outbox: f.make(), store: f.store,
    getContext: () => f.context, cancel: true, enabled: true, publicEnabled: true });
  assert.equal(result.outcome, "retained"); assert.deepEqual(f.events, []);
  for (const [key, value] of before) assert.equal(f.values.get(key), value);
  const retained = (await f.journal().entries()).find(entry => entry.selection.operationId === original.selection.operationId);
  assert.deepEqual(retained.retainedAlternative, { version: 1, selectedOperationId: null });
  await assert.rejects(f.journal().rememberAction({ selection: f.other.selection, action: f.other.action }));
  assert.equal(personalServerPendingPreparations(await f.journal().entries(), f.make()).length, 1);
});

test("foreign owner proof and forged stage metadata cannot settle a public preparation", async () => {
  for (const foreign of ["owner", "stage"]) {
    const f = await resolvable(); f.state.owner = "rejected";
    if (foreign === "owner") f.queue.inspect = async () => { const proof = await f.proof(); proof.operation.actorId = "someone-else"; return proof; };
    else f.staging.cancel = async (id, assetId) => { const proof = f.stageProof(assetId); proof.cancellation.fileHash = "b".repeat(64); return proof; };
    await assert.rejects(f.resolve()); assert.equal((await f.inventory()).needsRecovery, true);
    assert.equal((await f.journal().entries()).some(entry => entry.nativeSettlement), false);
  }
});

test("changed editor after server cancellation cannot write local proof or cancel files under the new account", async () => {
  const f = await resolvable(), before = [...f.values];
  f.queue.cancelExact = async () => { f.state.owner = "rejected"; f.context.generation = "new-editor"; return f.proof(); };
  await assert.rejects(f.resolve()); assert.deepEqual([...f.values], before);
  assert.deepEqual(f.calls, ["inspect-owner"]);
});

for (const boundary of ["completion", "native-settlement"])
test(`server preparation ${boundary} storage failure keeps originals and resumes exact receipts after reload`, async () => {
  const f = await resolvable(), before = [...f.values], originals = new Map(f.native);
  const save = f.values.set.bind(f.values);
  f.values.set = (key, value) => {
    if (key.endsWith(`:${boundary}`)) throw Error("Receipt storage quota");
    return save(key, value);
  };
  await assert.rejects(f.resolve());
  for (const [key, value] of before) assert.equal(f.values.get(key), value);
  assert.deepEqual(new Map(f.native), originals); assert.equal((await f.inventory()).needsRecovery, true);
  if (boundary === "completion") assert.equal(f.calls.some(value => value.startsWith("cancel-stage:")), false);
  f.values.set = save; f.context.generation = "reloaded-after-proof-quota";
  assert.equal((await f.resolve()).outcome, "rejected");
  assert.equal(f.calls.filter(value => value === "cancel-owner").length, 1);
  assert.equal((await f.inventory()).needsRecovery, false); assert.deepEqual(new Map(f.native), originals);
});

test("damaged native settlement blocks recovery while raw export retains its original bytes", async () => {
  const f = await resolvable(); await f.resolve();
  const key = [...f.values.keys()].find(key => key.endsWith(":native-settlement"));
  f.values.set(key, "damaged native settlement"); const before = [...f.values];
  await assert.rejects(f.inventory()); await assert.rejects(f.resolve());
  assert.deepEqual([...f.values], before);
  assert.equal((await f.journal().recoveryRecords()).find(row => row.key.endsWith(":native-settlement")).text, "damaged native settlement");
});
