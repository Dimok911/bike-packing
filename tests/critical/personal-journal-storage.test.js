import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalJournalStorage } from "../../src/storage/personal-journal-storage.js";

const binding = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor" };
const keyFor = (suffix = "action", owner = binding, recovery = false) =>
  `bike-packing-personal-${recovery ? "ordinary-recovery" : "save"}-v1:${encodeURIComponent(JSON.stringify(owner))}:${suffix}`;
const key = keyFor();
function fixture(initial = []) {
  const values = new Map(initial), states = new Map(), tails = new Map();
  const f = { values, states };
  f.legacy = { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, removeItem: key => values.delete(key),
    setItem(key, raw) { f.beforeMarker?.(key, raw); values.set(key, raw); } };
  f.locks = { request(name, callback) {
    const task = (tails.get(name) || Promise.resolve()).then(callback);
    tails.set(name, task.catch(() => {})); return task;
  } };
  const state = binding => states.get(JSON.stringify(binding)) || { revision: 0, entries: [] };
  f.repository = {
    async read(binding) { await f.beforeRead?.(binding); return structuredClone(state(binding)); },
    async commit(binding, { expectedRevision, puts, deletes }) {
      await f.beforeCommit?.({ puts, deletes });
      const previous = state(binding);
      assert.equal(previous.revision, expectedRevision);
      const identity = row => `${row.namespace}:${row.key}`;
      const entries = new Map(previous.entries.map(row => [identity(row), row]));
      for (const row of puts) { assert.equal(entries.has(identity(row)), false); entries.set(identity(row), structuredClone(row)); }
      for (const row of deletes) { assert.equal(row.namespace, "snapshot"); entries.delete(identity(row)); }
      const revision = expectedRevision + 1;
      states.set(JSON.stringify(binding), { revision, entries: [...entries.values()] });
      await f.afterCommit?.(); return { revision };
    }
  };
  f.open = () => createPersonalJournalStorage(f);
  return f;
}
const blocked = reason => error => error.isPersonalSaveBlocked && error.reason === `personal-journal-${reason}`;

test("migration retains exact original journal and recovery bytes while replacing only owned index values", async () => {
  const original = ` {"name":"old","note":"${"я".repeat(790867)}"}\n`;
  const recoveryKey = keyFor("archive", binding, true);
  const f = fixture([[key, original], [recoveryKey, "malformed legacy \ud800"], ["guest", "untouched"]]);
  const storage = await f.open();
  assert.equal(storage.getItem(key), original);
  assert.equal(storage.getItem(recoveryKey), "malformed legacy \ud800");
  assert.equal(f.values.get("guest"), "untouched");
  assert.ok(f.values.get(key).length < 200);
  const rows = [...f.states.values()][0].entries;
  assert.ok(rows.some(row => row.raw === original));
  assert.ok(rows.some(row => row.raw === "malformed legacy \ud800"));
  const cold = await f.open();
  assert.equal(cold.getItem(key), original);
  assert.equal(cold.diagnostics().recordCount, 2);
  assert.equal(cold.diagnostics().inlineBytes, 0);
  assert.ok(cold.diagnostics().journalBytes > 1_500_000);
});

test("large offline record becomes visible only after commit and survives reopening with tiny localStorage quota", async () => {
  const f = fixture(), storage = await f.open();
  f.beforeMarker = (_, raw) => { if (raw.length > 1024) throw new DOMException("full", "QuotaExceededError"); };
  let release;
  f.beforeCommit = () => new Promise(resolve => { release = resolve; });
  const raw = JSON.stringify({ name: "renamed offline", payload: "x".repeat(1_200_000) });
  const task = storage.writeRequired(key, raw);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal(storage.getItem(key), null);
  let flushed = false;
  const flush = storage.flush().then(() => { flushed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(flushed, false);
  release(); await task; await flush;
  assert.equal(storage.getItem(key), raw);
  f.beforeCommit = null;
  assert.equal((await f.open()).getItem(key), raw);
  assert.throws(() => storage.setItem(keyFor("large-sync"), raw), blocked("async-write-required"));
  storage.setItem(keyFor("applied"), '{"stateRevision":2}');
  assert.equal(storage.getItem(keyFor("applied")), '{"stateRevision":2}');
});

test("IDB failure and marker failure retain source; identical retry reuses retained immutable bytes", async () => {
  const f = fixture([[key, "original"]]);
  f.beforeCommit = () => { throw new DOMException("full", "QuotaExceededError"); };
  await assert.rejects(f.open(), { code: "quota" });
  assert.equal(f.values.get(key), "original"); assert.equal(f.states.size, 0);
  f.beforeCommit = null;
  f.beforeMarker = () => { throw new DOMException("full", "QuotaExceededError"); };
  await assert.rejects(f.open(), { code: "quota" });
  assert.equal(f.values.get(key), "original");
  assert.equal([...f.states.values()][0].entries[0].raw, "original");
  const revision = [...f.states.values()][0].revision;
  f.beforeMarker = null;
  assert.equal((await f.open()).getItem(key), "original");
  assert.equal([...f.states.values()][0].revision, revision);
});

test("migration never replaces another tab's intervening inline edit", async () => {
  const f = fixture([[key, "original"]]);
  f.afterCommit = () => f.values.set(key, "other tab changed source");
  await assert.rejects(f.open(), blocked("source-changed"));
  assert.equal(f.values.get(key), "other tab changed source");
  assert.ok([...f.states.values()][0].entries.some(row => row.raw === "original"));
});

test("failed readback or unavailable cross-tab lock never publishes an IDB reference", async () => {
  const f = fixture([[key, "original"]]);
  f.afterCommit = () => { [...f.states.values()][0].entries[0].raw = "failed readback"; };
  await assert.rejects(f.open(), blocked("write-verification"));
  assert.equal(f.values.get(key), "original");
  const g = fixture([[key, "original"]]);
  g.locks = null;
  await assert.rejects(g.open(), blocked("lock-unavailable"));
  assert.equal(g.values.get(key), "original"); assert.equal(g.states.size, 0);
});

test("missing, changed or foreign referenced bytes fail closed; no raw fallback overwrite", async () => {
  for (const kind of ["missing", "changed", "foreign", "length", "shape"]) {
    const f = fixture([[key, "original"]]); await f.open();
    if (kind === "missing") f.states.clear();
    if (kind === "changed") [...f.states.values()][0].entries[0].raw = "different";
    if (kind === "foreign") { f.values.set(keyFor("other-key"), f.values.get(key)); f.values.delete(key); }
    if (kind === "length") {
      const marker = JSON.parse(f.values.get(key)); marker.utf16Length++;
      f.values.set(key, JSON.stringify(marker));
    }
    if (kind === "shape") f.values.set(key, '{"personalJournalReference":2}');
    await assert.rejects(f.open(), error => error.isPersonalSaveBlocked === true);
  }
});

test("unseen reference from another tab blocks synchronous read until prepare and guards context before publication", async () => {
  const f = fixture(), first = await f.open(), other = await f.open();
  await first.writeRequired(key, "from first");
  assert.throws(() => other.getItem(key), blocked("reference-not-prepared"));
  await other.prepare(); assert.equal(other.getItem(key), "from first");
  let active = true;
  f.afterCommit = () => { active = false; };
  await assert.rejects(other.writeRequired(keyFor("next"), "new bytes", {
    assertCurrent: () => { if (!active) throw Error("account changed"); }
  }), error => error.isPersonalSaveBlocked === true);
  assert.equal(f.values.has(keyFor("next")), false);
  assert.equal(other.getItem(key), "from first");
  await assert.rejects(other.flush());
});

test("retirement removes index only, export remains hydrated and malformed bindings never migrate", async () => {
  const f = fixture([[key, "raw original"]]), storage = await f.open();
  const exported = Array.from({ length: storage.length }, (_, index) => {
    const key = storage.key(index); return { key, value: storage.getItem(key) };
  });
  assert.deepEqual(exported, [{ key, value: "raw original" }]);
  storage.removeItem(key);
  assert.equal(storage.getItem(key), null);
  assert.equal([...f.states.values()][0].entries[0].raw, "raw original");
  for (const owner of [{ ...binding, scopeKey: "id:other" }, { ...binding, environment: "production" }]) {
    const g = fixture([[keyFor("action", owner), "untouched"]]);
    await assert.rejects(g.open(), blocked("binding"));
    assert.equal(g.states.size, 0); assert.equal([...g.values.values()][0], "untouched");
  }
});

test("explicit retirement prunes new payloads while active actions, recovery refs and migration originals remain", async () => {
  const f = fixture([[key, "migration original"]]), storage = await f.open();
  const retiredKey = keyFor("retired"), pendingKey = keyFor("pending"), recoveryKey = keyFor("archive", binding, true);
  await storage.writeRequired(retiredKey, "retired large payload".repeat(5000));
  await storage.writeRequired(pendingKey, "pending large payload".repeat(5000));
  await storage.writeRequired(recoveryKey, "required recovery copy".repeat(5000));
  const retiredRaw = storage.getItem(retiredKey);
  storage.removeItem(retiredKey); storage.removeItem(key);
  await storage.flush();
  const rows = [...f.states.values()][0].entries;
  assert.equal(rows.some(row => row.raw === retiredRaw), false);
  assert.ok(rows.some(row => row.namespace === "journal" && row.raw === "migration original"));
  assert.ok(rows.some(row => row.namespace === "snapshot" && row.raw === storage.getItem(pendingKey)));
  assert.ok(rows.some(row => row.namespace === "snapshot" && row.raw === storage.getItem(recoveryKey)));
  const cold = await f.open();
  assert.equal(cold.getItem(pendingKey), storage.getItem(pendingKey));
  assert.equal(cold.getItem(recoveryKey), storage.getItem(recoveryKey));
});

test("failed marker publication survives cold reopening and unrelated authorized cleanup", async () => {
  const f = fixture(), storage = await f.open(), retiredKey = keyFor("retired"), failedKey = keyFor("failed");
  await storage.writeRequired(retiredKey, "old completed payload");
  f.beforeMarker = key => { if (key === failedKey) throw new DOMException("full", "QuotaExceededError"); };
  await assert.rejects(storage.writeRequired(failedKey, "unpublished intent body"), { code: "quota" });
  f.beforeMarker = null;
  const cold = await f.open();
  cold.removeItem(retiredKey); await cold.flush();
  const rows = [...f.states.values()][0].entries;
  assert.equal(rows.some(row => row.raw === "old completed payload"), false);
  assert.ok(rows.some(row => row.raw === "unpublished intent body"));
  assert.equal(f.values.has(failedKey), false);
  await cold.writeRequired(failedKey, "unpublished intent body");
  assert.equal(cold.getItem(failedKey), "unpublished intent body");
});

test("pruning stops on corrupt references and protects the exact body restored by an uncooperative inline writer", async () => {
  const f = fixture(), storage = await f.open(), retiredKey = keyFor("retired");
  await storage.writeRequired(key, "active body"); await storage.writeRequired(retiredKey, "retired body");
  storage.removeItem(retiredKey);
  const originalMarker = f.values.get(key), malformed = JSON.parse(originalMarker);
  malformed.sha256 = "0".repeat(64); f.values.set(key, JSON.stringify(malformed));
  await assert.rejects(storage.flush(), blocked("body-verification"));
  assert.ok([...f.states.values()][0].entries.some(row => row.raw === "retired body"));
  f.values.set(key, originalMarker);
  f.values.set(retiredKey, "retired body"); // An old tab restored these full bytes after removal.
  await storage.flush();
  assert.ok([...f.states.values()][0].entries.some(row => row.raw === "retired body"));
  assert.equal(f.values.get(retiredKey), "retired body");
  await storage.prepare();
  assert.equal(storage.getItem(retiredKey), "retired body");
  storage.removeItem(retiredKey); await storage.flush();
  assert.ok([...f.states.values()][0].entries.some(row => row.raw === "retired body" && row.namespace === "journal"),
    "an old inline writer's newly migrated original remains retained after retirement");
  assert.equal(storage.getItem(key), "active body");
});

test("pruning waits for another writer's unpublished body and then retains its newly published reference", async () => {
  const f = fixture(), storage = await f.open(), other = await f.open();
  const retiredKey = keyFor("retired"), newKey = keyFor("new");
  await storage.writeRequired(retiredKey, "completed payload"); storage.removeItem(retiredKey);
  let release;
  f.beforeCommit = ({ puts }) => puts.length ? new Promise(resolve => { release = resolve; }) : undefined;
  const capture = other.writeRequired(newKey, "new pending body");
  while (!release) await new Promise(resolve => setImmediate(resolve));
  let cleaned = false;
  const cleanup = storage.flush().then(() => { cleaned = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cleaned, false); assert.equal(f.values.has(newKey), false);
  release(); await capture; await cleanup;
  const rows = [...f.states.values()][0].entries;
  assert.equal(rows.some(row => row.raw === "completed payload"), false);
  assert.ok(rows.some(row => row.raw === "new pending body"));
  assert.equal(storage.getItem(newKey), "new pending body");
});

test("scoped flush never reports another account's failed capture or performs its pending cleanup", async () => {
  const f = fixture(), storage = await f.open();
  const otherBinding = { ...binding, actorId: "other-actor", scopeKey: "id:other-actor" };
  const otherKey = keyFor("retired", otherBinding), retiredKey = keyFor("retired"), failedKey = keyFor("failed");
  await storage.writeRequired(retiredKey, "first account's retired body");
  await storage.writeRequired(otherKey, "other account's retired body");
  storage.removeItem(retiredKey); storage.removeItem(otherKey);
  const oldFailure = Object.assign(Error("old editor changed"), { code: "stale-tab", isPersonalSaveBlocked: true,
    unconfirmedMemoryDraft: { note: "only first account may receive this draft" } });
  const failedCapture = storage.writeRequired(failedKey, "old account intent", { assertCurrent: () => { throw oldFailure; } });
  const otherFlush = storage.flush(otherBinding.scopeKey);
  const results = await Promise.allSettled([failedCapture, otherFlush]);
  assert.equal(results[0].status, "rejected"); assert.equal(results[0].reason, oldFailure);
  assert.equal(results[1].status, "fulfilled");
  assert.equal(f.states.get(JSON.stringify(otherBinding)).entries.length, 0, "current account cleanup proceeds");
  assert.ok(f.states.get(JSON.stringify(binding)).entries.some(row => row.raw === "first account's retired body"),
    "failed old account's cleanup remains untouched");
  await assert.rejects(storage.flush(binding.scopeKey), error => error === oldFailure);
  await assert.rejects(storage.flush(), error => error === oldFailure, "unscoped callers retain earlier failure behavior");
});
