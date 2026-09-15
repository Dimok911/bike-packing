import test from "node:test";
import assert from "node:assert/strict";
import { collectLegacyPersonalData, preparePersonalDataMigration } from "../../src/storage/personal-data-migration.js";
import { STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY, SYNC_META_KEY } from "../../src/config/constants.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";

function fixture() {
  const values = new Map(), binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
  const context = { ...binding, scope: "personal", generation: "editor-1" };
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem: (key, raw) => values.set(key, raw), removeItem: () => { throw Error("Migration must not remove legacy data"); } };
  const payload = { items: {}, containers: { bag: { id: "bag", name: "Сумка 🧳", photos: [] } }, layouts: {} };
  const outbox = createPersonalSaveOutbox({ storage, ...binding });
  outbox.capture({ snapshot: payload, body: { payload, baseStateRevision: 1582, stateRevision: 1582, force: false, forceOverwrite: false, fullReplace: false } });
  for (const key of [STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY]) values.set(`${key}::${binding.scopeKey}`, ` ${JSON.stringify({ ...payload, unknownAdminDraft: "retain" })}\n`);
  values.set(STORAGE_KEY, "guest-private-draft"); values.set(`${STORAGE_KEY}::id:other`, "other-account-private-draft");
  values.set("bike-packing-auth-authorization-v1", "private-auth-value");
  const f = { values, storage, binding, context, imports: 0, state: { revision: 0, entries: [], migration: null }, readHook: null, importHook: null };
  f.repository = { read: async () => { await f.readHook?.(); return structuredClone(f.state); }, importLegacy: async (receivedBinding, { entries, expectedRevision }) => {
    assert.deepEqual(receivedBinding, binding); assert.equal(expectedRevision, f.state.revision);
    f.imports++; f.state = { revision: 1, entries: structuredClone(entries), migration: { retained: true } };
    await f.importHook?.(); return structuredClone(f.state);
  } };
  f.prepare = () => preparePersonalDataMigration({ ...f, getContext: () => ({ ...context }) });
  return f;
}

test("legacy migration selects exact owner snapshots/journal and preserves every source byte", async () => {
  const f = fixture(), original = [...f.values], source = collectLegacyPersonalData(f);
  assert.equal(source.entries.length, 4);
  assert.equal(source.entries.filter(row => row.namespace === "journal").length, 1);
  for (const row of source.entries) assert.equal(row.raw, f.values.get(row.key));
  assert.doesNotMatch(JSON.stringify(source), /private-auth-value|other-account-private-draft|guest-private-draft/);
  const result = await f.prepare();
  assert.equal(result.cutover, false); assert.equal(result.legacyRetained, true);
  assert.equal(result.entryCount, 4); assert.ok(result.sourceBytes > 0);
  assert.deepEqual(f.state.entries, source.entries); assert.deepEqual([...f.values], original);
});

test("old tab changes during repository read block import before it starts", async () => {
  const f = fixture(); f.readHook = () => { f.values.set(`${STORAGE_KEY}::${f.binding.scopeKey}`, "newer local snapshot"); };
  await assert.rejects(f.prepare(), { code: "personal-data-migration-changed" }); assert.equal(f.imports, 0);
  assert.equal(f.values.get(`${STORAGE_KEY}::${f.binding.scopeKey}`), "newer local snapshot");
});

test("migration preserves owned sync metadata and detects an old tab confirming during import", async () => {
  const f = fixture(), key = `${SYNC_META_KEY}::${f.binding.scopeKey}`;
  const raw = ' {"dirty":true,"stateRevision":1582}\n';
  f.values.set(key, raw);
  f.values.set(`${SYNC_META_KEY}::id:other`, "other-account-private-metadata");
  await f.prepare();
  assert.equal(f.state.entries.find(row => row.key === key).raw, raw);
  assert.equal(f.state.entries.some(row => row.raw.includes("other-account-private-metadata")), false);
  const g = fixture(); g.values.set(key, raw);
  g.readHook = () => g.values.set(key, '{"dirty":false,"stateRevision":1583}');
  await assert.rejects(g.prepare(), { code: "personal-data-migration-changed" });
  assert.equal(g.imports, 0);
});

test("old tab changes after commit retain the verified copy and newer source without authorizing cutover", async () => {
  const f = fixture(), original = collectLegacyPersonalData(f).entries;
  f.importHook = () => f.values.set(`${STORAGE_KEY}::${f.binding.scopeKey}`, "newer local snapshot");
  await assert.rejects(f.prepare(), { code: "personal-data-migration-changed" });
  assert.deepEqual(f.state.entries, original); assert.equal(f.values.get(`${STORAGE_KEY}::${f.binding.scopeKey}`), "newer local snapshot");
});

for (const field of ["actorId", "listId", "scopeKey", "scope", "generation"]) test(`scope change ${field} across commit preserves source and blocks activation`, async () => {
  const f = fixture(), original = [...f.values]; f.importHook = () => { f.context[field] = "changed"; };
  await assert.rejects(f.prepare(), { code: "personal-data-migration-context" }); assert.deepEqual([...f.values], original);
});

test("storage refusal and malformed operation are not exported as an empty journal", () => {
  const f = fixture(); f.storage.getItem = () => { throw Error("Denied"); };
  assert.throws(() => collectLegacyPersonalData(f), { code: "personal-data-migration-unreadable" });
  const g = fixture(), key = [...g.values.keys()].find(key => key.startsWith("bike-packing-personal-save-v1:"));
  g.values.set(key, "{}"); assert.throws(() => collectLegacyPersonalData(g), { isPersonalSaveBlocked: true });
});

test("in-place context mutation cannot change the captured migration generation", async () => {
  const f = fixture(), original = [...f.values];
  f.importHook = () => { f.context.generation = "editor-2"; };
  await assert.rejects(preparePersonalDataMigration({ ...f, getContext: () => f.context }),
    { code: "personal-data-migration-context" });
  assert.deepEqual([...f.values], original);
});

test("readback mismatch never reports a verified migration", async () => {
  const f = fixture(); f.importHook = () => { f.state.entries[0].raw = "corrupted"; };
  await assert.rejects(f.prepare(), { code: "personal-data-migration-verification" });
});
