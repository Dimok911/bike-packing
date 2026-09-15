import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalMirrorStorage } from "../../src/storage/personal-mirror-storage.js";
import { STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY } from "../../src/config/constants.js";

const scope = "id:actor", key = `${STORAGE_KEY}::${scope}`, base = `${BASE_STATE_KEY}::${scope}`;
function fixture() {
  const values = new Map([[key, ' {"name":"old","adminDraft":"retained"}\n'], [base, '{"name":"base"}'],
    [`${RECOVERY_STATE_KEY}::${scope}`, "[]"], [STORAGE_KEY, "guest"]]);
  const states = new Map(), f = { values, states };
  const identity = binding => JSON.stringify(binding);
  const state = binding => states.get(identity(binding)) || { binding, revision: 0, entries: [] };
  f.legacy = { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, removeItem: key => values.delete(key) };
  f.repository = { open: async () => {}, close() {}, listBindings: async () => [...states.values()].map(value => value.binding),
    read: async binding => structuredClone(state(binding)),
    importLegacy: async (binding, { entries }) => {
      await f.beforeImport?.();
      const current = state(binding);
      if (current.revision !== 0) return { revision: current.revision };
      const result = { binding, revision: 1, entries: structuredClone(entries) };
      states.set(identity(binding), result); await f.afterImport?.(); return { revision: 1 };
    },
    commit: async (binding, { expectedRevision, puts }) => {
      await f.beforeCommit?.();
      const current = state(binding);
      if (current.revision !== expectedRevision) throw Error("revision-conflict");
      const entries = new Map(current.entries.map(row => [`${row.namespace}:${row.key}`, row]));
      for (const row of puts) entries.set(`${row.namespace}:${row.key}`, row);
      const revision = current.revision + 1;
      states.set(identity(binding), { binding, revision, entries: structuredClone([...entries.values()]) });
      return { revision };
    }
  };
  f.open = () => createPersonalMirrorStorage(f);
  return f;
}

test("primary mirrors retain exact original bytes before freeing legacy quota; guest data is unchanged", async () => {
  const f = fixture(), original = [...f.values];
  f.afterImport = () => assert.deepEqual([...f.values], original);
  const storage = await f.open();
  assert.equal(storage.getItem(key), original[0][1]);
  assert.deepEqual([...f.values], [[STORAGE_KEY, "guest"]]);
  const entries = [...f.states.values()][0].entries;
  for (const [key, raw] of original.slice(0, 3)) assert.ok(entries.some(row => row.key === `original:${key}` && row.raw === raw));
});

test("failed migration and old-tab changes never remove the source", async () => {
  const f = fixture(), original = [...f.values];
  f.beforeImport = () => { throw Error("quota"); };
  await assert.rejects(f.open(), /quota/); assert.deepEqual([...f.values], original);
  const g = fixture(); g.afterImport = () => g.values.set(key, "new old-tab edit");
  await assert.rejects(g.open(), { code: "personal-mirrors-source-changed" });
  assert.equal(g.values.get(key), "new old-tab edit");
  assert.ok([...g.states.values()][0].entries.some(row => row.key === `original:${key}`));
});

test("a batch becomes readable only after commit and survives reopening without legacy mirrors", async () => {
  const f = fixture(), storage = await f.open(); let release;
  f.beforeCommit = () => new Promise(resolve => { release = resolve; });
  const task = storage.writeBatch([{ key, raw: "new" }, { key: base, raw: "new base" }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.notEqual(storage.getItem(key), "new"); release(); await task;
  assert.equal(storage.getItem(key), "new"); assert.equal(storage.getItem(base), "new base");
  assert.equal(f.values.has(key), false);
  const cold = await f.open(); assert.equal(cold.getItem(key), "new");
  assert.equal([...f.states.values()][0].entries.find(row => row.key === `original:${key}`).raw.includes("retained"), true);
});

test("a failed write keeps durable old data and blocks later writes", async () => {
  const f = fixture(), storage = await f.open();
  f.beforeCommit = () => { throw Error("quota"); };
  await assert.rejects(storage.write(key, "new"), { code: "personal-mirrors-commit" });
  await assert.rejects(storage.flush(scope), { code: "personal-mirrors-commit" });
  const cold = await f.open(); assert.notEqual(cold.getItem(key), "new");
});

test("another new tab cannot overwrite a newer mirror revision", async () => {
  const f = fixture(), first = await f.open(), second = await f.open();
  await first.write(key, "first tab");
  await assert.rejects(second.write(key, "second tab"), { code: "personal-mirrors-commit" });
  assert.equal((await f.open()).getItem(key), "first tab");
});

test("an old tab resurrecting a legacy mirror blocks reads and writes without deleting its data", async () => {
  const f = fixture(), storage = await f.open(); f.values.set(key, "old-tab edit");
  assert.throws(() => storage.getItem(key), { code: "personal-mirrors-old-tab-change" });
  await assert.rejects(storage.write(key, "new-tab edit"), { code: "personal-mirrors-old-tab-change" });
  assert.equal(f.values.get(key), "old-tab edit");
});

test("simultaneous first writes share initialization and serialize their commits", async () => {
  const f = fixture(); f.values.clear(); const storage = await f.open();
  await Promise.all([storage.write(key, "first"), storage.write(base, "base")]);
  assert.equal(storage.getItem(key), "first"); assert.equal(storage.getItem(base), "base");
});

test("a batch cannot mix owners or use authentication keys", async () => {
  const storage = await fixture().open();
  await assert.rejects(storage.writeBatch([{ key, raw: "one" }, { key: `${STORAGE_KEY}::id:other`, raw: "two" }]),
    { code: "personal-mirrors-write" });
  await assert.rejects(storage.write("bike-packing-auth", "value"), { code: "personal-mirrors-write" });
});

test("flush includes a write that has not yet entered its first commit", async () => {
  const f = fixture(), storage = await f.open(); let release, finished = false;
  f.beforeCommit = () => new Promise(resolve => { release = resolve; });
  const write = storage.write(key, "pending"), flush = storage.flush(scope).then(() => { finished = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false); release(); await write; await flush;
  assert.equal(finished, true); assert.equal(storage.getItem(key), "pending");
});
