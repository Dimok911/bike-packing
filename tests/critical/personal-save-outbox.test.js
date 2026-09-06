import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPersonalSaveOutbox, PERSONAL_SAVE_OUTBOX_ENABLED } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalSnapshot, decodePersonalSnapshot, personalSnapshotWithUiPreferences } from "../../src/sync/personal-snapshot-codec.js";
import { personalDeletionReference, preservesUndeletedEntities } from "../../src/sync/personal-deletion-intent.js";
import { createPersonalSaveRecovery } from "../../src/sync/personal-save-recovery.js";
import { saveRootContainerDialogAction, saveItemDialogAction } from "../../src/ui/item-dialog-save.js";
import { resolveSyncVisualState } from "../../src/ui/sync-visual-state.js";

const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
function appFunction(name, dependencies) {
  const source = appSource.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))?.[0];
  assert.ok(source, `actual app function ${name} exists`);
  return new Function(...Object.keys(dependencies), `return (${source});`)(...Object.values(dependencies));
}

function fixture() {
  const values = new Map();
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const binding = { actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a", environment: "bike-packing-experiment" };
  const context = { ...binding, scope: "personal", generation: "editor-1" };
  const make = () => createPersonalSaveOutbox({ storage, ...binding });
  const input = value => ({ snapshot: { items: { a: { weight: value } }, localUi: "packing" },
    body: { baseStateRevision: 5, payload: { items: { a: { weight: value } } } } });
  return { values, storage, context, make, input, outbox: make() };
}

test("outbox remains disabled; atomic action plus local data survive a crash before the mirror write", () => {
  assert.equal(PERSONAL_SAVE_OUTBOX_ENABLED, false);
  const f = fixture(), input = f.input(100), saved = f.outbox.capture(input);
  input.snapshot.items.a.weight = 900; input.body.payload.items.a.weight = 900;
  assert.equal(f.values.size, 1);
  const restored = f.make().recover();
  assert.deepEqual(restored, saved);
  assert.equal(restored.snapshot.items.a.weight, 100);
  assert.equal(restored.action.body.payload.items.a.weight, 100);
});

test("capture records dependencies synchronously, preserves UUIDs on reload and ignores UI-only changes", () => {
  const f = fixture(), first = f.outbox.capture(f.input(100));
  const ui = f.input(100); ui.snapshot.localUi = "catalog";
  assert.equal(f.outbox.capture(ui).action.operationId, first.action.operationId);
  const second = f.outbox.capture(f.input(200));
  assert.deepEqual(second.action.body.causal, { reads: [], baseOperationId: first.action.operationId,
    dependsOn: [{ operationId: first.action.operationId, listId: "list-a" }] });
  assert.equal(second.action.generation, 2);
  assert.equal(f.make().recover().action.operationId, second.action.operationId);
});

test("quota never deletes prior intents; malformed or incomplete journals fail closed", () => {
  const f = fixture(), first = f.outbox.capture(f.input(100));
  const write = f.storage.setItem; f.storage.setItem = () => { throw Error("quota"); };
  assert.throws(() => f.outbox.capture(f.input(200)), { code: "quota" });
  assert.equal(f.make().recover().action.operationId, first.action.operationId);
  f.storage.setItem = write;
  f.outbox.capture(f.input(200));
  f.values.delete([...f.values.keys()][0]);
  assert.throws(f.make, { code: "storage" });
  const bad = fixture(); bad.outbox.capture(bad.input(1));
  bad.values.set([...bad.values.keys()][0], "broken JSON");
  assert.throws(bad.make, { code: "storage" });
});

test("stale tabs cannot acquire an unobserved predecessor; true concurrent forks keep both versions", () => {
  const f = fixture(), other = f.make();
  f.outbox.capture(f.input(100));
  assert.throws(() => other.capture(f.input(200)), { code: "stale-tab" });
  assert.equal(f.values.size, 1);
  const racing = fixture(), second = racing.make(), write = racing.storage.setItem;
  let nested = false;
  racing.storage.setItem = (key, value) => {
    if (!nested) { nested = true; second.capture(racing.input(200)); }
    write(key, value);
  };
  assert.throws(() => racing.outbox.capture(racing.input(100)), { code: "fork" });
  assert.equal(racing.values.size, 2, "neither concurrent intent is overwritten");
  assert.throws(racing.make, { code: "fork" });
});

test("known ID create is frozen before dispatch and never silently recreated", () => {
  const f = fixture(), first = f.outbox.capture({ ...f.input(1), create: true });
  assert.equal(first.action.kind, "list.create"); assert.equal(first.action.body.id, "list-a");
  assert.throws(() => f.outbox.capture({ ...f.input(2), create: true }), { code: "create" });
  assert.throws(() => createPersonalSaveOutbox({ storage: f.storage, actorId: "a", listId: "b", scopeKey: "c", environmentId: "production" }), { code: "scope" });
});

test("only the current action can receive a local applied checkpoint; a newer action remains pending", () => {
  const f = fixture(), first = f.outbox.capture(f.input(1));
  assert.equal(f.outbox.hasPending(), true);
  f.outbox.markApplied({ operationId: first.action.operationId, stateRevision: 6 });
  assert.equal(f.make().hasPending(), false);
  const second = f.outbox.capture(f.input(2));
  assert.equal(f.make().hasPending(), true);
  assert.throws(() => f.outbox.markApplied({ operationId: first.action.operationId, stateRevision: 6 }), { code: "checkpoint" });
  f.storage.setItem = () => { throw Error("quota"); };
  assert.throws(() => f.outbox.markApplied({ operationId: second.action.operationId, stateRevision: 7 }), { code: "storage" });
  assert.equal(f.make().hasPending(), true);
});

test("drain follows dependencies, settles historical receipts without UI apply, then validates only the latest", async () => {
  const f = fixture(), first = f.outbox.capture(f.input(100)), second = f.outbox.capture(f.input(200));
  const calls = [], confirmations = [];
  const queue = { run: async input => { calls.push(input); return { ok: true }; } };
  const options = { queue, getContext: () => ({ ...f.context }), onConfirmed: (result, record) => confirmations.push(record.action.operationId) };
  await f.make().drain(options);
  assert.deepEqual(calls.map(call => [call.operationId, !!call.receiptOnly]), [
    [first.action.operationId, true], [second.action.operationId, true], [second.action.operationId, false]
  ]);
  assert.deepEqual(confirmations, [second.action.operationId]);
  assert.equal(JSON.parse(calls[0].body).payload.items.a.weight, 100);
});

test("lost ACK, offline, waiting, account switch, newer edit and server conflicts never clear local intent", async () => {
  for (const failure of ["unknown", "waiting", "offline", "actor", "generation", "new-action", "conflict"]) {
    const f = fixture(); f.outbox.capture(f.input(100));
    let confirmed = false, count = 0;
    const queue = { run: async () => {
      count++;
      if (failure === "actor") f.context.actorId = "other";
      else if (failure === "generation") f.context.generation = "new";
      else if (failure === "new-action") f.outbox.capture(f.input(200));
      else throw Error(failure);
      return { ok: true };
    } };
    await assert.rejects(f.outbox.drain({ queue, getContext: () => ({ ...f.context }), onConfirmed: () => { confirmed = true; } }));
    assert.equal(count, 1); assert.equal(confirmed, false);
    assert.ok(f.values.size >= 1);
  }
});

test("actual app persistence writes the intent before its mirror and cannot fallback after a quota error", () => {
  const calls = [], f = fixture();
  let fail = false;
  const persist = appFunction("persistStateSnapshot", {
    personalSaveRecovery: createPersonalSaveRecovery(),
    personalSavePilotEnabled: () => true, hasPendingPersonalSave: () => false, applyingRemoteState: false, STORAGE_KEY: "mirror",
    capturePersonalSaveIntent: snapshot => {
      calls.push("intent"); if (fail) throw Error("quota"); return f.outbox.capture({ ...f.input(1), snapshot });
    },
    scopedLocalStorageKey: key => key,
    safeSetLocalStorage: () => { calls.push("mirror"); return false; },
    writeLargeScopedLocalValue: () => { calls.push("legacy"); return true; }
  });
  assert.equal(persist({ items: {} }), true);
  assert.deepEqual(calls, ["intent", "mirror"]);
  assert.ok(f.make().recover());
  calls.length = 0; fail = true;
  assert.throws(() => persist({ items: {} }), /quota/);
  assert.deepEqual(calls, ["intent"]);
  calls.length = 0;
  persist({ items: {} }, { recordAction: false });
  assert.deepEqual(calls, ["legacy"], "read-time normalization is not a user action");
});

test("storage recovery latches the failure, freezes the unsaved draft and blocks subsequent writes", () => {
  const f = fixture(), notifications = [];
  const recovery = createPersonalSaveRecovery({ onBlocked: info => notifications.push(info.error) });
  const guarded = recovery.outbox(f.make, f.context.scopeKey);
  guarded.capture(f.input(100));
  const before = [...f.values];
  f.storage.setItem = () => { throw Error("quota"); };
  const next = f.input(200);
  let failure;
  assert.throws(() => guarded.capture(next), error => { failure = error; return error.code === "quota"; });
  next.snapshot.items.a.weight = 999;
  assert.deepEqual([...f.values], before);
  assert.equal(recovery.owns(failure), true);
  assert.throws(() => guarded.capture(f.input(300)), error => error === failure);
  assert.throws(() => guarded.markApplied({}), error => error === failure);
  assert.throws(() => guarded.compact(), error => error === failure);
  const copy = recovery.recoveryCopy(f.storage);
  assert.equal(copy.unconfirmedMemoryDraft.items.a.weight, 200);
  assert.equal(copy.automaticImportAllowed, false);
  assert.equal(copy.photoFilesIncluded, false);
  assert.deepEqual(notifications, [failure]);
});

test("corrupt journal recovery exports only the affected actor and no auth or production keys", () => {
  const f = fixture(); f.outbox.capture(f.input(100));
  const key = [...f.values.keys()][0];
  f.values.set(key, "broken JSON: retain exactly");
  for (const [actorId, environment] of [["other", "bike-packing-experiment"], ["actor-a", "production"]]) {
    const binding = { environment, actorId, scopeKey: `id:${actorId}`, listId: "list-a" };
    f.values.set(`bike-packing-personal-save-v1:${encodeURIComponent(JSON.stringify(binding))}:anchor`, "secret");
  }
  f.values.set("auth-session", "secret token"); f.values.set("unrelated", "secret");
  const recovery = createPersonalSaveRecovery();
  assert.throws(() => recovery.outbox(f.make, f.context.scopeKey), { code: "storage" });
  const copy = recovery.recoveryCopy(f.storage);
  assert.deepEqual(copy.journalEntries, [{ key, value: "broken JSON: retain exactly" }]);
  assert.equal(copy.memoryDraftAvailable, false);
  assert.equal(JSON.stringify(copy).includes("secret"), false);
  assert.equal(f.values.size, 5, "export never cleans or rewrites storage");
});

test("recovery observes asynchronous storage failures but not ordinary offline or context outcomes", async () => {
  const recovery = createPersonalSaveRecovery();
  for (const error of [Error("offline"), Object.assign(Error("new editor"), { isPersonalSaveBlocked: true, code: "context" })]) {
    await assert.rejects(recovery.run(async () => { throw error; }), value => value === error);
    assert.equal(recovery.message(), "");
  }
  const error = Object.assign(Error("checkpoint not saved"), { isPersonalSaveBlocked: true, code: "storage" });
  await assert.rejects(recovery.run(async () => { throw error; }, { scopeKey: "id:actor-a" }), value => value === error);
  assert.equal(recovery.message(), error.message);
  assert.throws(() => recovery.run(() => assert.fail("must not run")), value => value === error);
  const copy = recovery.recoveryCopy({ get length() { throw Error("storage unavailable"); } });
  assert.equal(copy.storageReadable, false);
});

test("stale editor recovery keeps the other tab's journal and the rejected editor draft separate", () => {
  const f = fixture(), recovery = createPersonalSaveRecovery();
  const stale = recovery.outbox(f.make, f.context.scopeKey);
  f.outbox.capture(f.input(100));
  assert.throws(() => stale.capture(f.input(200)), { code: "stale-tab" });
  const copy = recovery.recoveryCopy(f.storage);
  assert.equal(copy.unconfirmedMemoryDraft.items.a.weight, 200);
  assert.equal(JSON.parse(copy.journalEntries[0].value).action.body.payload.items.a.weight, 100);
  assert.equal(copy.journalEntries.length, 1);
});

test("a late storage failure cannot expose another account's draft or authorize recovery export after scope change", async () => {
  let scope = "id:actor-a", reject;
  const recovery = createPersonalSaveRecovery({ isCurrentScope: value => value === scope });
  const failure = Object.assign(Error("quota"), { code: "quota", isPersonalSaveBlocked: true });
  const pending = recovery.run(() => new Promise((resolve, fail) => { reject = fail; }), {
    scopeKey: scope, snapshot: { private: "actor-a" }
  });
  scope = "id:actor-b"; reject(failure);
  await assert.rejects(pending, error => error === failure);
  assert.equal(recovery.message(), "");
  assert.throws(() => recovery.recoveryCopy({}), /No blocked/);
  recovery.report(failure, { scopeKey: scope, snapshot: { private: "actor-b" } });
  scope = "id:actor-c";
  assert.throws(() => recovery.recoveryCopy({}), /different account/);
});

test("bag creation/edit and item placement do not close their forms before durable save succeeds", () => {
  const error = Error("injected storage failure");
  for (const editing of [false, true]) {
    const state = { containers: editing ? { bag: { id: "bag" } } : {} };
    const refs = Object.fromEntries(["rootContainerName", "rootContainerWeight", "rootContainerVolume", "rootContainerLocation", "rootContainerNote"]
      .map(key => [key, { value: "test" }]));
    refs.saveRootContainerBtn = { disabled: false };
    assert.throws(() => saveRootContainerDialogAction({ state, refs, editingRootContainerId: editing ? "bag" : "",
      saveLayoutMutation: () => { throw error; },
      closeDialogWithoutRestoringFocus: () => assert.fail("must retain form"), render: () => assert.fail("must not render success")
    }), value => value === error);
  }
  for (const containerId of ["next-bag", ""]) {
    const refs = Object.fromEntries(["itemName", "itemWeight", "itemLocation", "itemNote"].map(key => [key, { value: "test" }]));
    refs.itemContainer = { value: containerId }; refs.saveItemBtn = { disabled: false };
    assert.throws(() => saveItemDialogAction({ refs, state: { items: { item: {} }, layouts: { layout: {} } },
      editingItemId: "item", itemDialogTargetLayoutId: "layout", getItemContainerIdInLayout: () => "previous-bag",
      placeExistingItemInLayout: () => true, saveLayoutMutation: () => { throw error; },
      closeDialogWithoutRestoringFocus: () => assert.fail("must retain form"), render: () => assert.fail("must not render success")
    }), value => value === error);
  }
  assert.equal(resolveSyncVisualState({ saveBlocked: true, loggedIn: true, forcedOffline: true }), "error");
  assert.equal(resolveSyncVisualState({ saveBlocked: true, message: "saving", loggedIn: true }), "error");
});

test("snapshot codec preserves all local fields without a second full business payload or prototype mutation", () => {
  const payload = { items: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [String(i), { name: `item-${i}`, weight: i }])) };
  const snapshot = { ...payload, localUi: { collapsed: ["bag"], active: null }, array: [1, null, {}] };
  const patch = encodePersonalSnapshot(payload, snapshot);
  assert.deepEqual(decodePersonalSnapshot(payload, patch), snapshot);
  assert.ok(JSON.stringify(patch).length < JSON.stringify(payload).length / 20);
  const hostile = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"x":1}}');
  assert.deepEqual(decodePersonalSnapshot({}, encodePersonalSnapshot({}, hostile)), hostile);
  assert.equal({}.polluted, undefined);
  assert.throws(() => decodePersonalSnapshot({}, [{ path: ["__proto__", "polluted"], value: true }]));
  const variants = [{ a: [1, 2], b: 3 }, { a: null }, { a: { x: true } }, {}];
  for (const a of variants) for (const b of variants) assert.deepEqual(decodePersonalSnapshot(a, encodePersonalSnapshot(a, b)), b);
});

test("confirmed compaction retains the exact last action and its dependency for the next save", async () => {
  const f = fixture();
  for (let i = 0; i < 30; i++) f.outbox.capture(f.input(i));
  const before = f.outbox.recover();
  assert.equal(f.outbox.compact().pending, true); assert.equal(f.values.size, 30);
  f.outbox.markApplied({ operationId: before.action.operationId, stateRevision: 35 });
  assert.equal(f.outbox.compact().pending, false);
  assert.equal(f.values.size, 3, "one action, one applied marker, one anchor");
  assert.deepEqual(f.make().recover(), before);
  const next = f.make().capture(f.input(40));
  assert.equal(next.action.body.causal.baseOperationId, before.action.operationId);
  const calls = [];
  await f.make().drain({ queue: { run: async input => { calls.push(input); return {}; } }, getContext: () => f.context });
  assert.equal(calls.length, 3, "old discarded history is not repeatedly downloaded");
  assert.deepEqual(calls.map(call => call.operationId), [before.action.operationId, next.action.operationId, next.action.operationId]);
});

test("UI-only mirror preferences survive recovery without overriding durable entities or placement", () => {
  const saved = { items: {}, containers: {}, layouts: { a: { id: "a" } }, packedItems: {}, activeLayoutId: "a", showItemMeta: false };
  const mirror = { items: { deleted: { id: "deleted" } }, containers: { deleted: {} }, layouts: {},
    packedItems: { deleted: true }, activeLayoutId: "old", showItemMeta: true, collapsedContainers: { a: true } };
  const restored = personalSnapshotWithUiPreferences(saved, JSON.stringify(mirror));
  assert.deepEqual(restored, { ...saved, showItemMeta: true, collapsedContainers: { a: true } });
  assert.deepEqual(personalSnapshotWithUiPreferences(saved, "broken"), saved);
  assert.equal(saved.showItemMeta, false);
});

test("interrupted compaction at every deletion is restartable and cannot retire unconfirmed input", () => {
  for (const failAt of [0, 1, 2, 3, 4]) {
    const f = fixture();
    for (let i = 0; i < 4; i++) f.outbox.capture(f.input(i));
    const saved = f.outbox.recover(); f.outbox.markApplied({ operationId: saved.action.operationId, stateRevision: 9 });
    let count = 0; const remove = f.storage.removeItem;
    f.storage.removeItem = key => { if (count++ >= failAt) throw Error("interrupted"); remove(key); };
    f.outbox.compact();
    assert.deepEqual(f.make().recover(), saved);
    f.storage.removeItem = remove; f.make().compact(); assert.equal(f.values.size, 3);
    const newer = f.make().capture(f.input(50));
    assert.equal(f.make().compact().pending, true);
    assert.equal(f.make().recover().action.operationId, newer.action.operationId);
  }
});

test("failed anchor write deletes nothing; a late stale branch remains present and blocked", () => {
  const f = fixture(); const first = f.outbox.capture(f.input(1)), second = f.outbox.capture(f.input(2));
  f.outbox.markApplied({ operationId: second.action.operationId, stateRevision: 7 });
  const original = new Map(f.values), write = f.storage.setItem;
  f.storage.setItem = () => { throw Error("quota"); };
  assert.equal(f.outbox.compact().pending, true); assert.deepEqual(f.values, original);
  f.storage.setItem = write; f.outbox.compact();
  const stale = { ...first, action: { ...first.action, operationId: crypto.randomUUID() } };
  const key = [...original.keys()].find(key => key.endsWith(first.action.operationId)).replace(first.action.operationId, stale.action.operationId);
  f.values.set(key, JSON.stringify(stale));
  assert.throws(f.make, { code: "fork" });
  assert.ok(f.values.has(key), "stale local data is not garbage-collected");
});

test("a fresh server baseline starts a new revision-checked action, never rewrites the old UUID or its body", async () => {
  const f = fixture(), first = f.outbox.capture(f.input(1));
  f.outbox.markApplied({ operationId: first.action.operationId, stateRevision: 6 });
  const remote = f.input(200);
  f.outbox.adoptRemoteBaseline({ ...remote, payload: remote.body.payload, stateRevision: 20, meta: { serverUpdatedAt: "confirmed" } });
  assert.deepEqual(f.make().recover().action, first.action);
  assert.deepEqual(f.make().recoverSnapshot(), remote.snapshot);
  assert.equal(f.make().baseline().stateRevision, 20);
  assert.throws(() => f.outbox.capture(f.input(300)), { code: "baseline" });
  const next = f.outbox.capture({ ...f.input(300), body: { ...f.input(300).body, baseStateRevision: 20 } });
  assert.notEqual(next.action.operationId, first.action.operationId);
  assert.equal(next.action.previousLocalOperationId, first.action.operationId);
  assert.deepEqual(next.action.body.causal, { dependsOn: [], reads: [] });
  const calls = [];
  await f.make().drain({ queue: { run: async input => { calls.push(input); return {}; } }, getContext: () => f.context });
  assert.deepEqual(calls.map(call => call.operationId), [next.action.operationId, next.action.operationId]);
  f.outbox.markApplied({ operationId: next.action.operationId, stateRevision: 21 });
  f.outbox.compact(); assert.equal(f.make().baseline(), null); assert.equal(f.values.size, 3);
});

test("pending changes, revision regression and quota block baseline adoption without changing saved action", () => {
  const f = fixture(), saved = f.outbox.capture(f.input(1)), remote = f.input(200);
  const input = { snapshot: remote.snapshot, payload: remote.body.payload, stateRevision: 20 };
  assert.throws(() => f.outbox.adoptRemoteBaseline(input), { code: "baseline" });
  f.outbox.markApplied({ operationId: saved.action.operationId, stateRevision: 6 });
  f.outbox.adoptRemoteBaseline(input);
  assert.throws(() => f.outbox.adoptRemoteBaseline({ ...input, stateRevision: 19 }), { code: "baseline" });
  f.storage.setItem = () => { throw Error("quota"); };
  assert.throws(() => f.outbox.adoptRemoteBaseline({ ...input, stateRevision: 21 }), { code: "quota" });
  assert.equal(f.make().baseline().stateRevision, 20); assert.deepEqual(f.make().recover(), saved);
});

test("actual app pilot blocks legacy list writes and file upload bypasses before network access", async () => {
  const dependencies = { personalSavePilotEnabled: () => true, currentUser: { id: "actor-a" },
    isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, modeState: {} };
  const fetch = appFunction("apiFetch", dependencies);
  const upload = appFunction("apiUploadFormData", dependencies);
  await assert.rejects(fetch("/bike-packing/lists/list-a", { method: "PUT", body: "{}" }), /обход/);
  await assert.rejects(fetch("/bike-packing/lists", { method: "POST", body: "{}" }), /обход/);
  await assert.rejects(upload("/bike-packing/lists/list-a/photos", {}), /фотографиями/);
  assert.match(appSource, /hasPendingPersonalSave\(\) && !hasLocalSyncChanges\(\)/);
  assert.match(appSource, /outbox\.markApplied\(\{ operationId: record\.action\.operationId/);
});

test("declared deletion removes only its item and placements from the comparison baseline", () => {
  const base = { items: { a: { id: "a", containerId: "bag" }, b: { id: "b" } },
    containers: { bag: { id: "bag", itemIds: ["a"], order: [{ type: "item", id: "a" }] } },
    layouts: { layout: { arrangement: { items: { a: "bag", b: "bag" }, containers: { bag: { itemIds: ["a", "b"], order: [] } } } } } };
  const record = { action: { body: { userDeletion: { type: "item", id: "a" }, payload: { items: { b: base.items.b } } } } };
  const reference = personalDeletionReference(base, [record]);
  assert.deepEqual(Object.keys(reference.items), ["b"]);
  assert.equal(reference.layouts.layout.arrangement.items.a, undefined);
  assert.ok(base.items.a, "comparison cannot mutate the real baseline");
  assert.equal(preservesUndeletedEntities(reference, reference), true);
  assert.equal(preservesUndeletedEntities({ ...reference, items: {} }, reference), false);
  const lostPlacement = structuredClone(reference); lostPlacement.layouts.layout.arrangement.items = {};
  assert.equal(preservesUndeletedEntities(lostPlacement, reference), false);
  assert.equal(personalDeletionReference(base, []), null);
  assert.throws(() => personalDeletionReference(base, [{ action: { body: { userDeletion: { type: "item", id: "a" }, payload: base } } }]));
});

test("confirmed root deletion accounts for nested placements without authorizing deletion of its retained items", () => {
  const base = { items: { a: { id: "a", containerId: "child" } }, containers: {
    bag: { id: "bag", childIds: ["child"] }, child: { id: "child", parentId: "bag", itemIds: ["a"] } },
    layouts: { layout: { rootContainerIds: ["bag"], arrangement: { rootContainerIds: ["bag"],
      containers: { bag: { childIds: ["child"], itemIds: [] }, child: { parentId: "bag", childIds: [], itemIds: ["a"] } },
      items: { a: "child" }, packedItems: {} } } } };
  const reference = personalDeletionReference(base, [{ action: { body: { userDeletion: { type: "container", id: "bag" }, payload: { containers: {} } } } }]);
  assert.deepEqual(Object.keys(reference.containers), []);
  assert.ok(reference.items.a); assert.equal(reference.items.a.containerId, "");
  assert.equal(preservesUndeletedEntities({ ...reference, items: {} }, reference), false);
});
