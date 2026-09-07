import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { preparePersonalListMigration, PERSONAL_LIST_MIGRATION_ENABLED, validatePersonalListMigrationResult } from "../../src/sync/personal-list-migration.js";
import { canonicalListOperationJson, createListOperationQueue, listOperationRoute } from "../../src/sync/list-operation-queue.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { loadRemoteStateFlow } from "../../src/sync/load-remote-state-flow.js";

function fixture() {
  const context = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor", scope: "personal", generation: "before" };
  const state = { items: {}, containers: {}, layouts: {} }, values = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const payload = { items: { old: { id: "old", name: "Old item" } }, containers: {}, layouts: { one: { id: "one", name: "Existing layout" } } };
  const manifest = { version: 1, legacyPayloadHash: "a".repeat(64),
    projectedPayloadHash: createHash("sha256").update(canonicalListOperationJson(payload)).digest("hex") };
  const result = { ok: true, ...context, migration: { baseStateRevision: 5, payload, migration: manifest } };
  const make = () => createPersonalSaveOutbox({ storage, ...context }), outbox = make(), adopted = [];
  const options = { outbox, getContext: () => context, getState: () => state, hasLocalChanges: () => false,
    readPreview: async () => result, makeSnapshot: value => ({ ...value, localPreference: true }), onCaptured: value => adopted.push(value) };
  return { context, state, values, storage, payload, result, make, outbox, adopted, options };
}

test("initial migration preview freezes exact bytes and captures once before UI adoption", async () => {
  const f = fixture(), before = structuredClone(f.state), confirm = await preparePersonalListMigration(f.options);
  f.payload.items.old.name = "Changed outside candidate";
  assert.equal(f.values.size, 0); assert.deepEqual(f.state, before);
  const saved = confirm();
  assert.equal(saved.action.kind, "list.migrate"); assert.equal(saved.action.body.payload.items.old.name, "Old item");
  assert.deepEqual(saved.action.body.causal, { dependsOn: [], reads: [] });
  assert.deepEqual(f.make().recover(), saved); assert.equal(f.adopted.length, 1); assert.equal(confirm(), null);
});

test("migration rejects pending/local drafts, wrong provenance, changed bytes, files and extra fields", async () => {
  for (const change of [
    f => { f.options.hasLocalChanges = () => true; },
    f => { f.state.items.photo = { photos: [{ id: "local-file" }] }; },
    f => { f.result.actorId = "other"; },
    f => { f.result.environment = "production"; },
    f => { f.result.migration.payload.items.changed = {}; },
    f => { f.result.migration.payload.items.old.photos = [{ id: "file" }]; },
    f => { f.result.migration.force = true; },
    f => { f.result.migration.causal = { dependsOn: [], reads: [] }; },
    f => { f.result.migration.baseStateRevision = 0; },
    f => { f.result.migration.migration.legacyPayloadHash = "bad"; },
  ]) {
    const f = fixture(); change(f); await assert.rejects(preparePersonalListMigration(f.options)); assert.equal(f.values.size, 0); assert.equal(f.adopted.length, 0);
  }
  const f = fixture(); f.outbox.capture({ snapshot: f.state, body: { payload: f.state, baseStateRevision: 5 } });
  const bytes = [...f.values]; await assert.rejects(preparePersonalListMigration(f.options)); assert.deepEqual([...f.values], bytes);
});

test("migration checks context and current state both after preview and at confirmation", async () => {
  for (const field of ["actorId", "environment", "generation", "listId", "scopeKey", "scope", "state"]) {
    for (const duringRead of [true, false]) {
      const f = fixture(), change = () => { if (field === "state") f.state.items.later = {}; else f.context[field] = "changed"; };
      if (duringRead) { f.options.readPreview = async () => { change(); return f.result; }; await assert.rejects(preparePersonalListMigration(f.options)); }
      else { const confirm = await preparePersonalListMigration(f.options); change(); assert.throws(confirm); }
      assert.equal(f.values.size, 0); assert.equal(f.adopted.length, 0);
    }
  }
});

test("migration quota never adopts or sends and confirmation cannot generate another ID", async () => {
  const f = fixture(), confirm = await preparePersonalListMigration(f.options);
  f.storage.setItem = () => { throw Error("quota"); };
  assert.throws(confirm, { code: "quota" }); assert.equal(confirm(), null); assert.equal(f.adopted.length, 0); assert.equal(f.values.size, 0);
});

test("migration reload/lost ACK retains exact request, blocks edits until confirmed, then permits ordinary successor", async () => {
  const f = fixture(), saved = (await preparePersonalListMigration(f.options))(), bytes = [...f.values], requests = [];
  await assert.rejects(f.make().drain({ getContext: () => f.context, queue: { run: async input => { requests.push(input); throw Error("lost ACK"); } } }), /lost ACK/);
  assert.deepEqual([...f.values], bytes); assert.equal(requests[0].path, "/bike-packing/lists/list/migration");
  assert.equal(requests[0].method, "POST"); assert.deepEqual(JSON.parse(requests[0].body), saved.action.body);
  const reloaded = f.make(), next = structuredClone(saved.snapshot); next.items.later = { id: "later" };
  assert.throws(() => reloaded.capture({ snapshot: next, body: { payload: next, baseStateRevision: 5 } }), { code: "migration-pending" });
  reloaded.markApplied({ operationId: saved.action.operationId, stateRevision: 6 });
  const successor = reloaded.capture({ snapshot: next, body: { payload: next, baseStateRevision: 6 } });
  assert.equal(successor.action.kind, "list.update"); assert.equal(successor.action.body.migration, undefined);
  assert.equal(successor.action.body.causal.baseOperationId, saved.action.operationId); assert.deepEqual(f.make().recover(), successor);
});

test("rejected initial migration cannot silently rebase or discard the original manifest", async () => {
  const f = fixture(), saved = (await preparePersonalListMigration(f.options))(), before = [...f.values];
  await assert.rejects(f.outbox.reconcile({ getContext: () => f.context,
    queue: { inspect: async () => ({ historicalOnly: true, resultStatus: 409, rejectionCode: "stale_state_revision", stateRevision: 6,
      operation: { ...f.outbox.binding, id: saved.action.operationId, kind: "list.migrate", state: "rejected", payloadDigest: "a".repeat(64) } }) },
    readRemote: async () => { throw Error("Must not rebase migration"); }
  }), { code: "migration-reconciliation" });
  assert.deepEqual([...f.values], before);
});

test("migration cannot be a second action, hide in a save, or gain causal dependencies on reload", async () => {
  const f = fixture();
  assert.throws(() => f.outbox.capture({ snapshot: f.payload, body: f.result.migration }), { code: "input" });
  const saved = (await preparePersonalListMigration(f.options))();
  f.outbox.markApplied({ operationId: saved.action.operationId, stateRevision: 6 });
  assert.throws(() => f.outbox.capture({ migration: true, snapshot: f.payload, body: f.result.migration }), { code: "migration-base" });
  const key = [...f.values.keys()].find(key => key.endsWith(saved.action.operationId)), raw = JSON.parse(f.values.get(key));
  raw.action.body.causal.baseOperationId = crypto.randomUUID(); f.values.set(key, JSON.stringify(raw));
  assert.throws(() => f.make().recover());
});

test("migration requires its own rollout gate and validates the full receipt projection", async () => {
  assert.equal(PERSONAL_LIST_MIGRATION_ENABLED, false);
  const path = "/bike-packing/lists/list/migration";
  assert.deepEqual(listOperationRoute(path, "POST"), { kind: "list.migrate", listId: "list" });
  const queue = createListOperationQueue({ transport: { experiment: true }, enabled: true });
  assert.equal(queue.supports(path, "POST"), false);
  assert.equal(createListOperationQueue({ transport: { experiment: true }, enabled: true, migrationEnabled: true }).supports(path, "POST"), true);
  const f = fixture(), saved = (await preparePersonalListMigration(f.options))();
  const expected = { listId: "list", body: saved.action.body }, result = { ok: true,
    migration: saved.action.body.migration, list: { id: "list", stateRevision: 6, payload: saved.action.body.payload } };
  assert.equal(validatePersonalListMigrationResult(result, expected), true);
  for (const change of [r => { r.list.id = "other"; }, r => { r.list.stateRevision = 5; }, r => { r.list.payload.items = {}; }, r => { r.migration.legacyPayloadHash = "b".repeat(64); }]) {
    const altered = structuredClone(result); change(altered); assert.equal(validatePersonalListMigrationResult(altered, expected), false);
  }
});

test("an explicit migration read failure is handled without empty-list seeding, fallback adoption or an automatic save", async () => {
  const failure = Object.assign(Error("prepare required"), { data: { code: "causal_read_migration_required" } }), calls = [];
  const forbidden = () => { throw Error("The normal load path must not continue after migration handling"); };
  await loadRemoteStateFlow({ runtime: { currentUser: { id: "actor" }, state: {}, syncMeta: {}, initialRemoteLoadPending: true }, dependencies: {
    isSharedListLinkRoute: () => false, isPublicLayoutContext: () => false, setLayoutLoadStatus: () => {}, clearStaleDirtyFlagIfNoLocalChanges: () => {},
    fetchRemoteStateRecord: async () => { throw failure; },
    handleInitialListMigrationRequired: async error => { assert.equal(error, failure); calls.push("handled"); return true; },
    normalizeRemoteState: forbidden, saveRemoteState: forbidden, applyRemoteState: forbidden, saveActivePackingListId: forbidden,
    isTemporaryServerStorageError: forbidden, createEmptyUserState: forbidden, replaceState: forbidden
  } });
  assert.deepEqual(calls, ["handled"]);
});

test("the actual state reader cannot bypass the migration fence through richer legacy list details", async () => {
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const source = app.match(/async function fetchRemoteListStateSnapshot\([^]*?\n\}/)?.[0]; assert.ok(source);
  const failure = Object.assign(Error("prepare required"), { data: { code: "causal_read_migration_required" } }); let legacyReads = 0;
  const dependencies = { personalSavePilotEnabled: () => true, setLayoutLoadProgress: () => {}, localText: a => a, LIST_API_TIMEOUT_MS: 100,
    apiFetch: async () => { throw failure; }, fetchRemoteListDetailRecord: async () => { legacyReads++; return { payload: { unprotected: true } }; } };
  const read = new Function(...Object.keys(dependencies), `return (${source});`)(...Object.values(dependencies));
  await assert.rejects(read("list"), error => error === failure); assert.equal(legacyReads, 0);
});
