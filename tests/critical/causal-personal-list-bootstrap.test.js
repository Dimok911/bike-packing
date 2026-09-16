import test from "node:test";
import { commitPreparedPersonalChange } from "../../src/sync/personal-prepared-commit.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ensureCausalPersonalListId, initialPersonalListId } from "../../src/sync/causal-personal-list-bootstrap.js";
import { createPersonalSaveOutbox, recoverPersonalSaveListId } from "../../src/sync/personal-save-outbox.js";
import { createRemoteListRecordSelector } from "../../src/sync/list-records.js";
import { isReadOnlyBikePackingRecord } from "../../src/public/scope.js";
import { isPublicTemplateListId } from "../../src/storage/active-choice.js";

function actualPersonalSelectors(currentPackingListId = "") {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const extract = (name, dependencies = {}) => {
    const body = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))?.[0];
    assert.ok(body);
    return new Function(...Object.keys(dependencies), `return (${body});`)(...Object.values(dependencies));
  };
  const remoteRecordId = extract("remoteRecordId");
  const dependencies = { createRemoteListRecordSelector, isPublicTemplateListId, remoteRecordId,
    isReadOnlyBikePackingRecord, normalizeRemoteListRecord: value => value, normalizeRemoteState: value => value,
    statePrivateLayoutCount: value => Object.keys(value?.layouts || {}).length,
    isMeaningfulPackingState: value => Boolean(Object.keys(value?.items || {}).length),
    remoteUpdatedAt: value => value?.updatedAt, timeValue: value => Date.parse(value) || 0 };
  const declaration = source.match(/const remoteListRecords = createRemoteListRecordSelector\(\{[^]*?\n\}\);/)?.[0];
  assert.ok(declaration);
  const selector = new Function(...Object.keys(dependencies), `${declaration}\nreturn remoteListRecords;`)(...Object.values(dependencies));
  return { selector, extract, remoteRecordId,
    chooseDefaultPackingList: extract("chooseDefaultPackingList", { ...dependencies, currentPackingListId, DATA_ITEM_KEY: "state" }) };
}

test("actual personal selectors exclude private administrative IDs even without itemKey or public visibility", () => {
  const personal = { id: "my-list", role: "owner", visibility: "private", updatedAt: "2024-01-01", payload: { layouts: { mine: {} }, items: {} } };
  const admin = ["public-demo-state", "public-demo-state-a", "public-shared-layout-a"].map((id, index) => ({
    [index === 1 ? "list_id" : "id"]: id, role: "owner", visibility: "private", isDefault: true,
    updatedAt: "2030-01-01", payload: { layouts: { a: {}, b: {}, c: {} }, items: { rich: {} } }
  }));
  for (const saved of ["", personal.id, admin[0].id]) {
    const { selector, chooseDefaultPackingList } = actualPersonalSelectors(saved);
    assert.equal(selector.bestCatalogListRecord([...admin, personal]), personal);
    assert.equal(chooseDefaultPackingList([...admin, personal]), personal);
    assert.equal(selector.bestCatalogListRecord(admin), null);
    assert.equal(chooseDefaultPackingList(admin), null);
  }
  const readonly = { ...personal, id: "shared-readonly", visibility: "public", isDefault: true };
  const saved = { ...personal, id: "saved-personal" };
  const normal = actualPersonalSelectors(saved.id);
  assert.equal(normal.chooseDefaultPackingList([readonly, personal, saved]), saved);
});

test("actual cold personal inventory never loads an administrative template as personal data", async () => {
  const admin = { id: "public-demo-state-private", visibility: "private", role: "owner", updatedAt: "2030-01-01",
    payload: { layouts: { a: {}, b: {} }, items: { photo: {} } } };
  const personal = { id: "personal-list", visibility: "private", role: "owner", updatedAt: "2024-01-01",
    payload: { layouts: { own: {} }, items: {} } };
  for (const hasPersonal of [false, true]) {
    const { selector, extract, remoteRecordId, chooseDefaultPackingList } = actualPersonalSelectors();
    const readIds = []; let prepared = 0;
    const load = extract("fetchRemoteListStateRecord", { personalSavePilotEnabled: () => false,
      personalListApiUnavailable: false, isPublicTemplateListId, currentPackingListId: "",
      remoteRecordPrivateLayoutCount: selector.remoteRecordPrivateLayoutCount, setLayoutLoadStatus: () => {},
      localText: (en, ru) => ru, LIST_API_TIMEOUT_MS: 100, apiFetch: async () => ({ lists: hasPersonal ? [admin, personal] : [admin] }),
      normalizePackingListsResponse: value => value.lists, bestCatalogListRecord: selector.bestCatalogListRecord,
      remoteRecordId, chooseDefaultPackingList, prepareInitialPersonalSave: async () => { prepared++; },
      setLayoutLoadProgress: () => {}, normalizeRemoteListRecord: value => value,
      fetchRemoteListStateSnapshot: async id => { readIds.push(id); assert.equal(id, personal.id); return personal; },
      pickRicherRemoteListRecord: selector.pickRicherRemoteListRecord, rememberCurrentPackingListRecord: () => {},
      setLoadedRemoteListProgress: () => {} });
    assert.equal(await load(), hasPersonal ? personal : null);
    assert.deepEqual(readIds, hasPersonal ? [personal.id] : []);
    assert.equal(prepared, hasPersonal ? 0 : 1);
  }
});

test("actual state response retains its outer list identity when the equally rich detail loses the tie", () => {
  const { selector, extract, remoteRecordId } = actualPersonalSelectors();
  const normalize = extract("normalizeRemoteListRecord", { remoteRecordId,
    stateIntegrityMetaFromResponse: data => ({ stateRevision: data.stateRevision }),
    remoteUpdatedAt: value => value?.updatedAt });
  const payload = { layouts: { own: {} }, items: { pump: { name: "Pump", opaque: { preserved: true } } } };
  const updatedAt = "2026-09-12T12:00:00Z";
  const response = { ok: true, listId: "personal-list", stateRevision: 7, updatedAt,
    record: { payload, updatedAt }, payload };
  const before = structuredClone(response), stateRecord = normalize(response);
  const detail = { id: "personal-list", payload, updatedAt, visibility: "private" };
  assert.equal(remoteRecordId(selector.pickRicherRemoteListRecord(stateRecord, detail)), "personal-list");
  assert.deepEqual(stateRecord.payload, payload); assert.equal(stateRecord.stateRevision, 7);
  assert.deepEqual(response, before);
  assert.equal(remoteRecordId(normalize({ ...response, record: { ...response.record, id: "inner-list" } })), "inner-list");
  assert.equal(remoteRecordId(normalize({ ok: true, id: "envelope-operation-id", record: { payload } })), "");
});

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
    personalSaveRecovery: { run: callback => callback() },
    scopedLocalStorageKey: key => key, personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor-a",
    personalJournalStorage: () => f.storage, recoverPersonalSaveListId });
  assert.equal(load(), f.recoverId());
  const clear = extract("saveActivePackingListId", { personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor-a",
    loadActivePackingListId: load, personalSaveOutboxForScope: f.outbox });
  assert.throws(() => clear(""), /неподтверждённые/);
  assert.throws(() => clear("other-list"), /неподтверждённые/);
  const ensure = extract("ensureCurrentPackingListId", { personalSavePilotEnabled: () => true, currentUser: { id: "actor-a" },
    personalSaveRecovery: { run: callback => callback() }, clone: structuredClone, localStorageScopeKey: "id:actor-a",
    isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, modeState: {},
    isPublicTemplateListId: () => false, currentPackingListId: "", personalJournalStorage: () => f.storage,
    personalSaveContext: f.options.getContext, state: f.input.snapshot, buildListSaveBody: () => f.input.body,
    localText: (en, ru) => ru, chooseDefaultPackingList: () => null, remoteRecordId: record => record.id,
    ensureCausalPersonalListId: async options => { assert.equal(options.storage, f.storage); return "causal-id"; } });
  assert.equal(await ensure(), "causal-id");
});

test("actual first UI edit awaits durable capture before the pointer and a late list switch cannot authorize UI adoption", async () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const captureSource = source.match(/function capturePersonalSaveIntent\([^]*?\n\}/)[0];
  const captureNowSource = source.match(/async function capturePersonalSaveIntentNow\([^]*?\n\}/)[0];
  const f = fixture(), listId = "initial-list";
  const prepared = createPersonalSaveOutbox({ storage: f.storage, ...f.context, listId });
  const dependencies = { personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor-a", GUEST_STORAGE_SCOPE: "guest",
    clone: structuredClone, sameJson: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    personalSaveContext: () => ({ ...f.context, listId: "" }), preparePersonalJournal: async () => {},
    personalSaveRecovery: { assertRunning() {}, report() {} },
    isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, modeState: {},
    personalSaveOutboxForScope: () => null, buildListSaveBodyForSync: options => ({ payload: options.serializeState() }),
    currentHistoryActionContext: () => ({}), nowIso: () => "", syncDevice: {}, syncMeta: {}, cloneStateForSync: value => value,
    currentPackingListId: "", personalInitialSaveOutbox: prepared, currentUser: { id: "actor-a" },
    userStorageScopeKey: () => "id:actor-a", localText: (en, ru) => ru, personalSaveOutboxes: new Map(),
    saveActivePackingListId: id => { assert.equal(f.recoverId(), id); throw Error("crash before pointer"); } };
  const build = dependencies => new Function(...Object.keys(dependencies),
    `let personalCaptureTail = Promise.resolve(); ${captureNowSource}; return (${captureSource});`)(...Object.values(dependencies));
  let writeStarted, finishWrite;
  const started = new Promise(resolve => { writeStarted = resolve; });
  f.storage.writeRequired = async (key, raw, { assertCurrent }) => {
    writeStarted();
    await new Promise(resolve => { finishWrite = resolve; });
    assertCurrent(); f.storage.setItem(key, raw);
    assert.equal(f.storage.getItem(key), raw);
  };
  const capture = build(dependencies), capturing = capture(f.input.snapshot);
  const failed = assert.rejects(capturing, /crash before pointer/);
  await started;
  assert.equal(f.values.size, 0, "no queue row is acknowledged while durable capture is pending");
  f.input.snapshot.items.a.weight = 999;
  finishWrite(); await failed;
  assert.equal(f.outbox().recover().action.kind, "list.create");
  assert.equal(f.outbox().recover().snapshot.items.a.weight, 100);
  assert.equal(f.values.size, 1);
  const prepareSource = source.match(/function preparePersonalLayoutCopyAction\([^]*?\n\}/)[0];
  for (const mode of ["success", "other-list", "actor", "generation", "before-capture"]) {
    const completed = fixture(), events = [], context = { ...completed.context, listId: "" };
    const initialOutbox = createPersonalSaveOutbox({ storage: completed.storage, ...completed.context, listId });
    const successfulDependencies = { ...dependencies, personalInitialSaveOutbox: initialOutbox, personalSaveOutboxes: new Map(),
      personalSaveContext: () => ({ ...context }),
      saveActivePackingListId: id => {
        assert.equal(initialOutbox.recover().action.kind, "list.create"); context.listId = mode === "other-list" ? "foreign-list" : id;
        if (mode === "actor") context.actorId = "actor-b";
        if (mode === "generation") context.generation = "changed";
        events.push("pointer");
      } };
    const captureCompleted = build(successfulDependencies);
    const state = { ...structuredClone(completed.input.snapshot), containers: {}, layouts: {}, packedItems: {} };
    const preparationDeps = { ...successfulDependencies, commitPreparedPersonalChange, state, locations: [], categories: [],
      currentCreateMeta: () => ({}), uniqueLayoutName: name => name, personalPhotoFormUiEnabled: () => false,
      preparePersonalLayoutCopy: (_state, { targetLayoutId }) => ({ layoutId: targetLayoutId, intent: {},
        snapshot: { ...structuredClone(state), layouts: { [targetLayoutId]: { id: targetLayoutId, name: "New layout" } } } }),
      persistStateSnapshot: snapshot => captureCompleted(snapshot), showToast: () => events.push("refused"),
      setActivePrivateScope() {}, applyLayoutArrangement() {}, rememberActiveLayoutChoice() {}, render() {},
      saveState: () => { assert.equal(initialOutbox.recover().snapshot.items.a.weight, 100); events.push("apply"); } };
    const prepare = new Function(...Object.keys(preparationDeps), `return (${prepareSource});`)(...Object.values(preparationDeps));
    const commit = prepare({ requestedName: "New layout" });
    if (mode === "before-capture") context.listId = listId;
    const result = await commit();
    if (mode === "success") {
      assert.match(result, /^layout-/); assert.deepEqual(events, ["pointer", "apply"]);
      assert.equal(initialOutbox.recover().snapshot.layouts[result].id, result);
    } else {
      assert.equal(result, false); assert.deepEqual(state.layouts, {});
      assert.deepEqual(events, mode === "before-capture" ? ["refused"] : ["pointer", "refused"]);
    }
    assert.equal(completed.values.size, mode === "before-capture" ? 0 : 1);
  }
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
