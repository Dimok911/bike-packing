import test from "node:test";
import assert from "node:assert/strict";
import { publicImportFixture } from "./personal-public-import-fixture.js";
import { createPersonalPublicImportSelectionStore } from "../../src/sync/personal-public-import-selection-store.js";
import { preparePersonalPublicImport } from "../../src/sync/personal-public-import.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalPublicImportRecord, decodePersonalPublicImportRecord } from "../../src/sync/personal-public-import-record.js";
import { inspectPersonalPhotoRecovery } from "../../src/sync/personal-photo-recovery-inventory.js";
import { personalArchiveHash } from "../../src/sync/personal-archive-import-protocol.js";
import { recoverPersonalPublicImportLink } from "../../src/sync/personal-public-import-link-recovery.js";
import { createPersonalPhotoRecoveryArchive } from "../../src/sync/personal-photo-recovery-archive.js";
import { readZipEntries, zipText } from "../../src/utils/simple-zip.js";
import { personalPublicImportSnapshot } from "../../src/sync/personal-public-import-snapshot.js";
import { personalGuestBusinessPayload } from "../../src/sync/personal-guest-import-plan.js";
import { copySharedLayoutFlow } from "../../src/public/shared-layout-copy-flow.js";

async function fixture(fileless = false) {
  const input = await publicImportFixture(fileless), { binding, selection } = input;
  const context = { ...binding, scope: "personal", generation: "public-editor" }, values = new Map(), native = new Map(), events = [];
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const locks = { request: async (name, run) => run() }, getContext = () => context;
  const journal = (enabled = true) => createPersonalPublicImportSelectionStore({ binding, storage, locks, getContext, enabled });
  const make = (enabled = true) => createPersonalSaveOutbox({ ...binding, storage, photoEnabled: enabled, photoBatchEnabled: enabled, publicImportEnabled: enabled });
  const outbox = make(), current = structuredClone(selection.basePayload);
  outbox.adoptRemoteBaseline({ snapshot: current, payload: current, stateRevision: selection.baseStateRevision });
  const store = { binding, ids: async () => [...native.keys()], read: id => native.has(id) ? decodePersonalPublicImportRecord(native.get(id), binding, id) : null,
    async capturePublic(value) { events.push("native-start"); native.set(value.action.operationId, await encodePersonalPublicImportRecord({ binding, ...value })); events.push("native-saved"); } };
  const options = { enabled: true, selection, selectionStore: journal(), outbox, store, getContext, getState: () => current,
    getRevision: () => selection.baseStateRevision, makeSnapshot: value => value,
    async loadFile() { assert.deepEqual(await journal(false).read(selection.operationId), selection); events.push("file-read"); return { file: input.file, thumb: null, fileName: "Selected.png" }; },
    onCaptured(saved) { assert.deepEqual(make(false).recover(), saved); events.push("view"); } };
  return { input, selection, binding, values, native, events, storage, locks, context, journal, outbox, make, store, current, options };
}

test("public selection journal is immutable, caller-frozen and readable with writers disabled", async () => {
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
  const action = structuredClone(f.input.action); action.body.publicImport.source.stateRevision++;
  await assert.rejects(f.journal().rememberAction({ selection: original, action }));
  assert.deepEqual([...f.values], before);
});

test("public selection quota, corrupted source/action and account change cannot replace an original selection", async () => {
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

for (const fileless of [false, true]) test(`public preparation, files=${!fileless}, persists source, action and native bytes before showing a copy`, async () => {
  const f = await fixture(fileless), original = structuredClone(f.selection), pending = preparePersonalPublicImport(f.options);
  // The caller's source reference can change after the action has started.
  f.options.selection = structuredClone(f.selection); f.options.selection.sourcePayload.items.item.name = "A later source";
  const commit = await pending;
  assert.deepEqual(await f.journal(false).read(original.operationId), original);
  assert.equal(f.events.includes("view"), false); assert.equal(f.native.size, 0); assert.equal(f.outbox.hasPending(), false);
  assert.equal((await f.journal(false).entries())[0].action.operationId, original.operationId);
  const first = commit(); assert.equal(first, commit()); const saved = await first;
  assert.equal(saved.action.body.publicImport.sourcePayload.items.item.custom.selected, "complete original field");
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
  test(`public ${failure} retains exact recovery data and does not show a partial copy`, async () => {
    const f = await fixture(), original = structuredClone(f.selection), setItem = f.storage.setItem;
    if (failure === "source-quota") f.storage.setItem = () => { throw Error("full"); };
    if (failure === "file-read") f.options.loadFile = async () => { throw Error("download failed"); };
    if (["source-quota", "file-read"].includes(failure)) {
      await assert.rejects(preparePersonalPublicImport(f.options), error => { assert.deepEqual(error.publicImportRecovery.request.selection, original); return true; });
      assert.equal(f.events.length, 0); assert.equal(f.outbox.hasPending(), false); return;
    }
    const commit = await preparePersonalPublicImport(f.options), capture = f.store.capturePublic;
    if (failure === "native-quota") f.store.capturePublic = async () => { throw Error("disk full"); };
    if (failure === "link-quota") f.store.capturePublic = async value => { await capture(value); f.storage.setItem = () => { throw Error("full"); }; };
    if (failure === "changed-editor") f.context.generation = "new-editor";
    if (failure === "changed-target") f.current.categories.push("late edit");
    await assert.rejects(commit(), error => {
      assert.deepEqual(error.publicImportRecovery.request.selection, original);
      assert.equal(error.publicImportRecovery.files.length, 1); return true;
    });
    assert.equal(f.events.includes("view"), false); assert.equal(f.outbox.hasPending(), false);
    f.storage.setItem = setItem;
    assert.deepEqual(await f.journal(false).read(original.operationId), original);
    if (failure === "link-quota") {
      const frozenNative = structuredClone([...f.native]); f.store.capturePublic = capture;
      f.options.loadFile = async () => assert.fail("Retained original bytes must not be downloaded again");
      const saved = await (await preparePersonalPublicImport(f.options))();
      assert.equal(saved.action.operationId, original.operationId); assert.deepEqual([...f.native], frozenNative);
      assert.equal(f.events.at(-1), "view");
    }
  });

for (const state of ["committed", "rejected"]) test(`public ${state} completion survives outbox compaction and refuses a different receipt`, async () => {
  const f = await fixture(true); await preparePersonalPublicImport(f.options);
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

for (const fileless of [false, true]) test(`public explicit local link recovery, files=${!fileless}, reuses the prepared action without downloads or view changes`, async () => {
  const f = await fixture(fileless), commit = await preparePersonalPublicImport(f.options);
  if (!fileless) {
    const capture = f.store.capturePublic, setItem = f.storage.setItem;
    f.store.capturePublic = async value => { await capture(value); f.storage.setItem = () => { throw Error("full"); }; };
    await assert.rejects(commit()); f.storage.setItem = setItem;
  }
  const entry = (await f.journal(false).entries())[0], original = structuredClone(entry);
  const record = await recoverPersonalPublicImportLink({ entry, enabled: true, outbox: f.make(), store: f.store,
    getContext: f.options.getContext, makeSnapshot: value => value });
  assert.deepEqual(record.action, entry.action); assert.deepEqual(entry, original); assert.equal(f.events.includes("view"), false);
  assert.equal(f.events.filter(event => event === "file-read").length, Number(!fileless));
});

test("public recovery archive retains even corrupted selection bytes, and refuses a changing journal", async () => {
  const f = await fixture(true); await preparePersonalPublicImport(f.options);
  const key = [...f.values.keys()].find(key => key.endsWith(":selection")), original = f.values.get(key);
  f.values.set(key, `${original}broken`);
  const publicSelectionStore = f.journal(false), options = { publicSelectionStore, getContext: f.options.getContext,
    store: { ...f.store, recoveryRecords: async () => [] },
    getRecoveryCopy: () => ({ environment: f.binding.environment, scopeKey: f.binding.scopeKey, automaticImportAllowed: false }) };
  const result = await createPersonalPhotoRecoveryArchive(options), entries = await readZipEntries(result.blob);
  expectPublicRows(JSON.parse(zipText(entries.get("public-import-selections.json"))));
  function expectPublicRows(rows) {
    assert.ok(rows.some(row => row.key.endsWith(":selection") && row.text === `${original}broken`));
    assert.equal(result.manifest.publicSelectionsIncluded, true); assert.equal(result.manifest.publicSelectionsVerified, false);
  }
  let reads = 0;
  const changing = { ...publicSelectionStore, async recoveryRecords() { if (reads++) f.values.set(key, original); return publicSelectionStore.recoveryRecords(); } };
  await assert.rejects(createPersonalPhotoRecoveryArchive({ ...options, publicSelectionStore: changing }), { code: "photo-recovery-export" });
});

test("public view preserves absent legacy fields and unknown business fields while retaining only placement/UI mirrors", async () => {
  const f = await publicImportFixture(false), payload = f.plan.payload, view = structuredClone(payload);
  for (const owner of Object.values(view.items)) Object.assign(owner, { weight: 0, color: "", categories: [], category: "", containerId: "display-container" });
  for (const owner of Object.values(view.containers)) Object.assign(owner, { weight: 0, volume: 0, note: "", location: "Default location", parentId: "display-parent", childIds: [], itemIds: [] });
  view.activeLayoutId = f.plan.importedLayoutIds[0]; view.collapsedContainers = { "display-container": true };
  const snapshot = personalPublicImportSnapshot(payload, view);
  assert.deepEqual(personalGuestBusinessPayload(snapshot), payload);
  assert.equal(snapshot.activeLayoutId, view.activeLayoutId); assert.deepEqual(snapshot.collapsedContainers, view.collapsedContainers);
  assert.ok(Object.values(snapshot.items).every(owner => owner.containerId === "display-container"));
  view.items[Object.keys(view.items)[0]].custom = "changed after view capture";
  assert.deepEqual(personalGuestBusinessPayload(snapshot), payload);
});

test("the real shared-copy router reaches the causal adapter before every legacy mutation, including demo", async () => {
  for (const mode of ["shared", "demo", "disabled", "cancelled"]) {
    const id = mode === "demo" ? "demo" : "source", calls = [], original = { unchanged: true };
    const progress = { update() {}, finish: () => calls.push("finished"), cancel: () => calls.push("cancelled"), fail: () => calls.push("failed") };
    const dependencies = { findSharedLayout: () => ({ id }), beginCopyProgress: () => progress, DEMO_SHARED_LAYOUT_ID: "demo",
      async copyPersonalPublicLayout() { calls.push("causal"); if (mode === "disabled") throw Error("Own writer disabled"); return mode === "cancelled" ? { cancelled: true } : { layoutId: "new-private" }; },
      canOpenAdminPublishedEdit: () => assert.fail("Legacy branch must not decide a personal operation"),
      ensurePrivateStateForSharedCopy: () => assert.fail("Legacy private mutation"), createLocalDemoCopy: () => assert.fail("Legacy demo mutation"),
      t: value => value, updateSyncUi() {}, showToast() {} };
    const result = await copySharedLayoutFlow({ runtime: { state: original }, dependencies }, id);
    assert.equal(result, ["disabled", "cancelled"].includes(mode) ? "" : "new-private");
    assert.deepEqual(calls, ["causal", mode === "disabled" ? "failed" : mode === "cancelled" ? "cancelled" : "finished"]);
    assert.deepEqual(original, { unchanged: true });
  }
});
