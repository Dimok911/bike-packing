import { randomUUID } from "node:crypto";
import { preparePersonalServerImportSource } from "../../src/sync/personal-server-import-source.js";
import test from "node:test";
import assert from "node:assert/strict";
import { publicImportFixture } from "./personal-public-import-fixture.js";
import { createPersonalServerImportSelectionStore } from "../../src/sync/personal-server-import-selection-store.js";
import { preparePersonalServerImport } from "../../src/sync/personal-server-import.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalServerImportRecord, decodePersonalServerImportRecord } from "../../src/sync/personal-server-import-record.js";
import { inspectPersonalPhotoRecovery } from "../../src/sync/personal-photo-recovery-inventory.js";
import { personalArchiveHash } from "../../src/sync/personal-archive-import-protocol.js";
import { personalGuestBusinessPayload } from "../../src/sync/personal-guest-import-plan.js";

async function fixture(fileless = false) {
  const input = await publicImportFixture(fileless), { binding, selection } = input;
  const source = await preparePersonalServerImportSource({ stateRevision: 7, descriptor: { version: 1, id: `shared-entity-link-${randomUUID()}`,
    mode: "live", scope: "layout", layoutId: "a", entityType: "", entityId: "", title: "Chosen source", description: "", includeAuthor: false, authorName: "" } });
  selection.source = source;
  input.action.body.serverImport = { ...input.action.body.publicImport, source }; delete input.action.body.publicImport;
  input.action.body.causal.reads = [{ listId: source.listId, revision: source.stateRevision }];
  const context = { ...binding, scope: "personal", generation: "public-editor" }, values = new Map(), native = new Map(), events = [];
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const locks = { request: async (name, run) => run() }, getContext = () => context;
  const journal = (enabled = true) => createPersonalServerImportSelectionStore({ binding, storage, locks, getContext, enabled });
  const make = (enabled = true) => createPersonalSaveOutbox({ ...binding, storage, photoEnabled: enabled, photoBatchEnabled: enabled, serverImportEnabled: enabled });
  const outbox = make(), current = structuredClone(selection.basePayload);
  outbox.adoptRemoteBaseline({ snapshot: current, payload: current, stateRevision: selection.baseStateRevision });
  const store = { binding, ids: async () => [...native.keys()], read: id => native.has(id) ? decodePersonalServerImportRecord(native.get(id), binding, id) : null,
    async captureServer(value) { events.push("native-start"); native.set(value.action.operationId, await encodePersonalServerImportRecord({ binding, ...value })); events.push("native-saved"); } };
  const options = { enabled: true, selection, selectionStore: journal(), outbox, store, getContext, getState: () => current,
    getRevision: () => selection.baseStateRevision, makeSnapshot: value => value,
    async loadFile() { assert.deepEqual(await journal(false).read(selection.operationId), selection); events.push("file-read"); return { file: input.file, thumb: null, fileName: "Selected.png" }; },
    onCaptured(saved) { assert.deepEqual(make(false).recover(), saved); events.push("view"); } };
  return { input, selection, binding, values, native, events, storage, locks, context, journal, outbox, make, store, current, options };
}

test("server selection journal is immutable, caller-frozen and readable with writers disabled", async () => {
  const f = await fixture(), original = structuredClone(f.selection), pending = f.journal().capture(f.selection);
  f.selection.sourcePayload.items.item.name = "Changed after capture";
  assert.deepEqual((await pending).selection, original);
  assert.deepEqual(await f.journal(false).read(original.operationId), original);
  assert.equal((await f.journal().capture(original)).reused, true);
  await assert.rejects(f.journal().capture(f.selection));
  await f.journal().rememberAction({ selection: original, action: f.input.action });
  assert.deepEqual(await f.journal(false).entries(), [{ selection: original, action: f.input.action, completion: null }]);
  const before = [...f.values];
  await assert.rejects(f.journal(false).capture(original));
  await assert.rejects(f.journal(false).rememberAction({ selection: original, action: f.input.action }));
  const action = structuredClone(f.input.action); action.body.serverImport.source.stateRevision++;
  await assert.rejects(f.journal().rememberAction({ selection: original, action }));
  assert.deepEqual([...f.values], before);
});

test("server selection quota, corrupted source/action and account change cannot replace an original selection", async () => {
  for (const failure of ["quota", "source", "action", "account"]) {
    const f = await fixture(); await f.journal().capture(f.selection);
    const before = [...f.values], setItem = f.storage.setItem;
    if (failure === "quota") f.storage.setItem = () => { throw Error("full"); };
    if (failure === "account") f.locks.request = async (name, run) => { f.context.generation = "another-editor"; return run(); };
    if (["quota", "account"].includes(failure)) {
      await assert.rejects(f.journal().rememberAction({ selection: f.selection, action: f.input.action }));
      assert.deepEqual([...f.values], before); f.storage.setItem = setItem; continue;
    }
    await f.journal().rememberAction({ selection: f.selection, action: f.input.action });
    const key = [...f.values.keys()].find(key => key.endsWith(failure === "source" ? ":selection" : ":action"));
    const row = JSON.parse(f.values.get(key));
    if (failure === "source") row.selection.source.stateRevision++;
    else row.action.body.payload.items[Object.keys(row.action.body.payload.items)[0]].name = "Corrupt";
    f.values.set(key, JSON.stringify(row));
    await assert.rejects(f.journal(false).entries()); await assert.rejects(f.journal(false).read(f.selection.operationId));
  }
});

for (const fileless of [false, true]) test(`server preparation, files=${!fileless}, persists source, action and native bytes before showing a copy`, async () => {
  const f = await fixture(fileless), original = structuredClone(f.selection), pending = preparePersonalServerImport(f.options);
  // The caller's source reference can change after the action has started.
  f.options.selection = structuredClone(f.selection); f.options.selection.sourcePayload.items.item.name = "A later source";
  const commit = await pending;
  assert.deepEqual(await f.journal(false).read(original.operationId), original);
  assert.equal(f.events.includes("view"), false); assert.equal(f.native.size, 0); assert.equal(f.outbox.hasPending(), false);
  assert.equal((await f.journal(false).entries())[0].action.operationId, original.operationId);
  const first = commit(); assert.equal(first, commit()); const saved = await first;
  assert.equal(saved.action.body.serverImport.sourcePayload.items.item.custom.selected, "complete original field");
  assert.deepEqual(f.make(false).recover(), saved); assert.equal(f.events.at(-1), "view");
  assert.equal(f.native.size, Number(!fileless));
  assert.equal((await inspectPersonalPhotoRecovery({ outbox: f.make(false), store: f.store, getContext: f.options.getContext })).entries[0].state, "linked");
  const cold = f.make(false), before = [...f.values], snapshot = structuredClone(saved.snapshot);
  snapshot.collapsedContainers = { "ui-only": true };
  assert.deepEqual(cold.capture({ snapshot, body: { payload: personalGuestBusinessPayload(snapshot), baseStateRevision: original.baseStateRevision } }), saved);
  assert.deepEqual([...f.values], before);
  snapshot.items[Object.keys(snapshot.items)[0]].name = "A real pending edit still needs its own gate";
  assert.throws(() => cold.capture({ snapshot, body: { payload: personalGuestBusinessPayload(snapshot), baseStateRevision: original.baseStateRevision } }));
});

for (const failure of ["source-quota", "file-read", "native-quota", "link-quota", "changed-editor", "changed-target"])
  test(`server ${failure} retains exact recovery data and does not show a partial copy`, async () => {
    const f = await fixture(), original = structuredClone(f.selection), setItem = f.storage.setItem;
    if (failure === "source-quota") f.storage.setItem = () => { throw Error("full"); };
    if (failure === "file-read") f.options.loadFile = async () => { throw Error("download failed"); };
    if (["source-quota", "file-read"].includes(failure)) {
      await assert.rejects(preparePersonalServerImport(f.options), error => { assert.deepEqual(error.serverImportRecovery.request.selection, original); return true; });
      assert.equal(f.events.length, 0); assert.equal(f.outbox.hasPending(), false); return;
    }
    const commit = await preparePersonalServerImport(f.options), capture = f.store.captureServer;
    if (failure === "native-quota") f.store.captureServer = async () => { throw Error("disk full"); };
    if (failure === "link-quota") f.store.captureServer = async value => { await capture(value); f.storage.setItem = () => { throw Error("full"); }; };
    if (failure === "changed-editor") f.context.generation = "new-editor";
    if (failure === "changed-target") f.current.categories.push("late edit");
    await assert.rejects(commit(), error => {
      assert.deepEqual(error.serverImportRecovery.request.selection, original);
      assert.equal(error.serverImportRecovery.files.length, 1); return true;
    });
    assert.equal(f.events.includes("view"), false); assert.equal(f.outbox.hasPending(), false);
    f.storage.setItem = setItem;
    assert.deepEqual(await f.journal(false).read(original.operationId), original);
    if (failure === "link-quota") {
      const frozenNative = structuredClone([...f.native]); f.store.captureServer = capture;
      f.options.loadFile = async () => assert.fail("Retained original bytes must not be downloaded again");
      const saved = await (await preparePersonalServerImport(f.options))();
      assert.equal(saved.action.operationId, original.operationId); assert.deepEqual([...f.native], frozenNative);
      assert.equal(f.events.at(-1), "view");
    }
  });

for (const state of ["committed", "rejected"]) test(`server ${state} completion survives outbox compaction and refuses a different receipt`, async () => {
  const f = await fixture(true); await preparePersonalServerImport(f.options);
  const { action } = (await f.journal(false).entries())[0], { body, kind, operationId, environment, actorId, listId } = action;
  const proof = { historicalOnly: true, resultStatus: state === "committed" ? 200 : 409, ...(state === "committed" ? { stateRevision: body.baseStateRevision + 1 } : {}),
    operation: { id: operationId, state, kind, environment, actorId, listId, payloadDigest: await personalArchiveHash({ environment, actorId, listId, kind, body }) } };
  await f.journal(false).confirm({ operationId, proof });
  assert.deepEqual((await f.journal(false).entries())[0].completion, proof);
  const before = [...f.values];
  for (const field of ["actorId", "id", "payloadDigest", "state"]) {
    const wrong = structuredClone(proof); wrong.operation[field] = "wrong";
    await assert.rejects(f.journal(false).confirm({ operationId, proof: wrong }));
  }
  assert.deepEqual([...f.values], before);
});
