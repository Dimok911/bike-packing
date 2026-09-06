import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ensureCausalPersonalListId, initialPersonalListId } from "../../src/sync/causal-personal-list-bootstrap.js";
import { createPersonalSaveOutbox, recoverPersonalSaveListId } from "../../src/sync/personal-save-outbox.js";

function fixture() {
  const values = new Map(), calls = [];
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const context = { environment: "bike-packing-experiment", actorId: "actor-a", scopeKey: "id:actor-a", scope: "personal", generation: "one" };
  let currentId = "";
  const input = { snapshot: { items: { a: { weight: 100 } } }, body: { payload: { items: { a: { weight: 100 } } } } };
  const options = { ...input, storage, getContext: () => ({ ...context }), getCurrentListId: () => currentId,
    locks: { request: async (key, callback) => callback() }, fetchLists: async () => { calls.push("inventory"); return []; },
    chooseDefaultList: lists => lists[0], recordId: record => record.id, onExisting: () => calls.push("existing"),
    onRegistered: id => { calls.push("mirror"); currentId = id; } };
  const recoverId = () => recoverPersonalSaveListId({ storage, ...context });
  const outbox = () => createPersonalSaveOutbox({ storage, ...context, listId: recoverId() });
  return { values, calls, storage, context, input, options, recoverId, outbox };
}

test("first list identity is stable per actor across devices, not based on clock or operation UUID", async () => {
  assert.equal(await initialPersonalListId("actor-a"), await initialPersonalListId("actor-a"));
  assert.notEqual(await initialPersonalListId("actor-a"), await initialPersonalListId("actor-b"));
  assert.match(await initialPersonalListId("actor-a"), /^personal-[a-f0-9]{64}$/);
});

test("initial creation freezes before inventory wait and persists snapshot, list ID and action before the pointer", async () => {
  const f = fixture();
  f.options.fetchLists = async () => { f.input.snapshot.items.a.weight = 900; f.input.body.payload.items.a.weight = 900; return []; };
  f.options.onRegistered = id => {
    assert.equal(f.recoverId(), id);
    assert.equal(f.outbox().recover().action.kind, "list.create");
    throw Error("crash before pointer");
  };
  await assert.rejects(ensureCausalPersonalListId(f.options), /crash/);
  assert.equal(f.values.size, 1);
  const record = f.outbox().recover();
  assert.equal(record.snapshot.items.a.weight, 100);
  assert.equal(record.action.body.payload.items.a.weight, 100);
  assert.equal(record.action.body.id, await initialPersonalListId("actor-a"));
  const restored = { ...f.options, snapshot: record.snapshot, body: record.action.body,
    onRegistered: id => f.calls.push(id), fetchLists: () => { throw Error("must not refetch or recreate"); } };
  assert.equal(await ensureCausalPersonalListId(restored), record.action.listId);
  assert.equal(f.outbox().recover().action.operationId, record.action.operationId);
  assert.equal(f.values.size, 1);
});

test("an existing remote list is not silently overwritten using its summary as a baseline", async () => {
  const f = fixture(); f.options.fetchLists = async () => [{ id: "remote-list" }];
  await assert.rejects(ensureCausalPersonalListId(f.options), /существующий/);
  assert.deepEqual(f.calls, ["existing"]); assert.equal(f.values.size, 0);
});

test("offline, malformed inventory, missing lock and quota failures never register or send a second create", async () => {
  for (const scenario of ["offline", "invalid", "locks", "quota"]) {
    const f = fixture();
    if (scenario === "offline") f.options.fetchLists = async () => { throw Error("offline"); };
    if (scenario === "invalid") f.options.fetchLists = async () => ({ ok: true });
    if (scenario === "locks") f.options.locks = null;
    if (scenario === "quota") f.storage.setItem = () => { throw Error("quota"); };
    await assert.rejects(ensureCausalPersonalListId(f.options));
    assert.equal(f.values.size, 0); assert.ok(!f.calls.includes("mirror"));
  }
});

test("actor, scope, environment or local generation changed during inventory cannot apply a late result", async () => {
  for (const field of ["actorId", "scopeKey", "scope", "environment", "generation"]) {
    const f = fixture(); f.options.fetchLists = async () => { f.context[field] = "changed"; return []; };
    await assert.rejects(ensureCausalPersonalListId(f.options), /изменились/);
    assert.equal(f.values.size, 0);
  }
});

test("a second tab waiting on initial creation cannot attach its stale draft to the first tab's action", async () => {
  const f = fixture(), callbacks = [];
  f.options.locks = { request: (key, callback) => new Promise((resolve, reject) => callbacks.push(() => callback().then(resolve, reject))) };
  const first = ensureCausalPersonalListId(f.options);
  const second = ensureCausalPersonalListId({ ...f.options, getCurrentListId: () => "" });
  await callbacks[0](); await first;
  const rejected = assert.rejects(second, /Другая вкладка/);
  await callbacks[1](); await rejected;
  assert.equal(f.values.size, 1); assert.deepEqual(f.calls, ["inventory", "mirror"]);
});

test("corrupt journals and multiple candidate lists stop discovery, and another actor stays isolated", async () => {
  const f = fixture(); await ensureCausalPersonalListId(f.options);
  assert.equal(recoverPersonalSaveListId({ storage: f.storage, actorId: "actor-b", scopeKey: "id:actor-b" }), "");
  createPersonalSaveOutbox({ storage: f.storage, ...f.context, listId: "another-list" }).capture({ ...f.input, create: true });
  assert.throws(f.recoverId, { code: "selection" });
  const bad = fixture(); await ensureCausalPersonalListId(bad.options);
  bad.values.set([...bad.values.keys()][0], "not JSON");
  assert.throws(bad.recoverId, { code: "storage" });
});

test("a pending journal with different draft data cannot be reused without recovering its snapshot", async () => {
  const f = fixture(); await ensureCausalPersonalListId(f.options);
  const saved = f.outbox().recover();
  f.input.body.payload.items.a.weight = 700;
  await assert.rejects(ensureCausalPersonalListId({ ...f.options, getCurrentListId: () => "" }), /восстановите/);
  assert.deepEqual(f.outbox().recover(), saved);
});

test("actual app uses causal bootstrap, recovers a missing pointer and refuses to clear a pending list", async () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const extract = (name, dependencies) => {
    const body = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))?.[0];
    return new Function(...Object.keys(dependencies), `return (${body});`)(...Object.values(dependencies));
  };
  const f = fixture(); await ensureCausalPersonalListId(f.options);
  const load = extract("loadActivePackingListId", { loadStoredActivePackingListId: () => "", ACTIVE_LIST_ID_KEY: "active",
    scopedLocalStorageKey: key => key, personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor-a",
    localStorage: f.storage, recoverPersonalSaveListId });
  assert.equal(load(), f.recoverId());
  const clear = extract("saveActivePackingListId", { personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor-a",
    loadActivePackingListId: load, personalSaveOutboxForScope: f.outbox });
  assert.throws(() => clear(""), /неподтверждённые/);
  assert.throws(() => clear("other-list"), /неподтверждённые/);
  const ensure = extract("ensureCurrentPackingListId", { personalSavePilotEnabled: () => true, currentUser: { id: "actor-a" },
    isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, modeState: {},
    isPublicTemplateListId: () => false, currentPackingListId: "", localStorage: f.storage,
    personalSaveContext: f.options.getContext, state: f.input.snapshot, buildListSaveBody: () => f.input.body,
    localText: (en, ru) => ru, chooseDefaultPackingList: () => null, remoteRecordId: record => record.id,
    ensureCausalPersonalListId: async options => { assert.equal(options.storage, f.storage); return "causal-id"; } });
  assert.equal(await ensure(), "causal-id");
});

test("actual first UI edit stores its create action synchronously, before the pointer or network", () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const captureSource = source.match(/function capturePersonalSaveIntent\([^]*?\n\}/)[0];
  const f = fixture(), listId = "initial-list";
  const prepared = createPersonalSaveOutbox({ storage: f.storage, ...f.context, listId });
  const dependencies = { personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor-a", GUEST_STORAGE_SCOPE: "guest",
    isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, modeState: {},
    personalSaveOutboxForScope: () => null, buildListSaveBodyForSync: options => ({ payload: options.serializeState() }),
    currentHistoryActionContext: () => ({}), nowIso: () => "", syncDevice: {}, syncMeta: {}, cloneStateForSync: value => value,
    currentPackingListId: "", personalInitialSaveOutbox: prepared, currentUser: { id: "actor-a" },
    userStorageScopeKey: () => "id:actor-a", localText: (en, ru) => ru, personalSaveOutboxes: new Map(),
    saveActivePackingListId: id => { assert.equal(f.recoverId(), id); throw Error("crash before pointer"); } };
  const capture = new Function(...Object.keys(dependencies), `return (${captureSource});`)(...Object.values(dependencies));
  assert.throws(() => capture(f.input.snapshot), /crash before pointer/);
  assert.equal(f.outbox().recover().action.kind, "list.create");
  assert.equal(f.outbox().recover().snapshot.items.a.weight, 100);
  assert.equal(f.values.size, 1);
});

test("actual inventory load cannot authorize first creation after an account switch", async () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const fetchSource = source.match(/async function fetchRemoteListStateRecord\([^]*?\n\}/)[0];
  const f = fixture();
  const dependencies = { personalSavePilotEnabled: () => true, personalSaveContext: () => ({ ...f.context }),
    hasPendingPersonalSave: () => false, personalListApiUnavailable: false, isPublicTemplateListId: () => false,
    currentPackingListId: "", remoteRecordPrivateLayoutCount: () => 0, setLayoutLoadStatus: () => {},
    localText: (en, ru) => ru, LIST_API_TIMEOUT_MS: 100,
    apiFetch: async () => { f.context.actorId = "actor-b"; return { ok: true, lists: [] }; } };
  const fetch = new Function(...Object.keys(dependencies), `return (${fetchSource});`)(...Object.values(dependencies));
  await assert.rejects(fetch(), /изменились/);
  assert.equal(f.values.size, 0);
});

test("actual detail and incremental readers cannot apply responses into a changed editor", async () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  for (const name of ["fetchRemoteListDetailRecord", "tryApplyRemoteEntityChanges"]) {
    const f = fixture();
    const functionSource = source.match(new RegExp(`async function ${name}\\([^]*?\\n\\}`))[0];
    const lateRead = async () => { f.context.generation = "new-local-edit"; return { ok: true }; };
    const dependencies = { personalSavePilotEnabled: () => true, personalSaveContext: () => ({ ...f.context }),
      hasPendingPersonalSave: () => false, apiFetch: lateRead, fetchRemoteListChangesRecord: lateRead,
      canRequestEntityChanges: () => ({ ok: true, sinceRevision: 1 }), syncMeta: {}, LIST_API_TIMEOUT_MS: 100 };
    const read = new Function(...Object.keys(dependencies), `return (${functionSource});`)(...Object.values(dependencies));
    if (name === "fetchRemoteListDetailRecord") await assert.rejects(read("list-a"), /не применены/);
    else assert.equal((await read("list-a", {})).reason, "personal-context-changed");
  }
});
