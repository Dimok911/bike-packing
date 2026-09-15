import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const origin = "https://repository.test";
const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
async function ready(page, context) {
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && /^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(url.pathname)) return route.fulfill({
      contentType: "text/javascript", body: await readFile(resolve(`.${url.pathname}`), "utf8") });
    if (url.origin === origin && url.pathname === "/") return route.fulfill({ contentType: "text/html", body:
      '<script type="module">import {createPersonalDataRepository} from "/src/storage/personal-data-repository.js";window.repository=createPersonalDataRepository;</script>' });
    await route.abort();
  });
  await page.goto(origin); await page.waitForFunction(() => Boolean(window.repository));
}
test.beforeEach(async ({ page, context }) => ready(page, context));

test("native committed raw records survive cold reload; snapshots CAS update while journal remains immutable", async ({ page }) => {
  const raw = '{ "operationId": "original", "payload": {"name":"Сумка"} }\n';
  const first = await page.evaluate(async ({ binding, raw }) => {
    const repo = await window.repository().open();
    const initial = await repo.read(binding);
    await repo.commit(binding, { expectedRevision: 0, puts: [{ namespace: "journal", key: "operation", raw },
      { namespace: "snapshot", key: "current", raw: '{"bag":1}' }] });
    repo.close(); return initial;
  }, { binding, raw });
  expect(first.revision).toBe(0); expect(first.entries).toEqual([]);
  await page.reload(); await page.waitForFunction(() => Boolean(window.repository));
  const result = await page.evaluate(async binding => {
    const repo = await window.repository().open(), cold = await repo.read(binding);
    let rejected;
    try { await repo.commit(binding, { expectedRevision: 1, puts: [{ namespace: "journal", key: "operation", raw: "changed" },
      { namespace: "snapshot", key: "current", raw: "must rollback" }] }); } catch (error) { rejected = error.code; }
    const afterFailure = await repo.read(binding);
    await repo.commit(binding, { expectedRevision: 1, puts: [{ namespace: "snapshot", key: "current", raw: '{"bag":2}' }] });
    return { cold, rejected, afterFailure, final: await repo.read(binding) };
  }, binding);
  expect(result.cold.entries.find(entry => entry.namespace === "journal").raw).toBe(raw);
  expect(result.rejected).toBe("immutable-entry"); expect(result.afterFailure).toEqual(result.cold);
  expect(result.final.revision).toBe(2); expect(result.final.entries.find(entry => entry.namespace === "snapshot").raw).toBe('{"bag":2}');
});

test("two native tabs competing on one revision admit exactly one commit and keep unrelated bindings separate", async ({ page, context }) => {
  const other = await context.newPage(); await other.goto(origin); await other.waitForFunction(() => Boolean(window.repository));
  const compete = (target, label) => target.evaluate(async ({ binding, label }) => {
    const repo = await window.repository().open();
    try { return await repo.commit(binding, { expectedRevision: 0, puts: [{ namespace: "journal", key: label, raw: label }] }); }
    catch (error) { return { error: error.code }; }
  }, { binding, label });
  const outcomes = await Promise.all([compete(page, "first"), compete(other, "second")]);
  expect(outcomes.filter(value => value.revision === 1)).toHaveLength(1);
  expect(outcomes.filter(value => value.error === "revision-conflict")).toHaveLength(1);
  const result = await page.evaluate(async binding => {
    const repo = await window.repository().open(), foreign = { ...binding, listId: "list-b" };
    await repo.commit(foreign, { expectedRevision: 0, puts: [{ namespace: "snapshot", key: "current", raw: "foreign-list" }] });
    return { own: await repo.read(binding), foreign: await repo.read(foreign) };
  }, binding);
  expect(result.own.entries).toHaveLength(1); expect(result.foreign.entries[0].raw).toBe("foreign-list");
});

test("legacy import preserves exact local strings without removal; same manifest is idempotent and changed source blocked", async ({ page }) => {
  const entries = [{ namespace: "snapshot", key: "legacy-current", raw: '{"name":"phone"}' },
    { namespace: "journal", key: "legacy-operation", raw: '{ "UUID" : "unchanged" }\n' }];
  const result = await page.evaluate(async ({ binding, entries }) => {
    for (const entry of entries) localStorage.setItem(entry.key, entry.raw);
    const repo = await window.repository().open();
    const imported = await repo.importLegacy(binding, { expectedRevision: 0, entries });
    const repeated = await repo.importLegacy(binding, { expectedRevision: 0, entries: [...entries].reverse() });
    let changed;
    try { await repo.importLegacy(binding, { expectedRevision: 0, entries: entries.map(entry => ({ ...entry, raw: entry.raw + " " })) }); }
    catch (error) { changed = error.code; }
    return { imported, repeated, changed, read: await repo.read(binding), local: entries.map(entry => localStorage.getItem(entry.key)) };
  }, { binding, entries });
  expect(result.imported).toEqual({ revision: 1, imported: true });
  expect(result.repeated).toEqual({ revision: 1, imported: false }); expect(result.changed).toBe("migration-conflict");
  expect(result.local).toEqual(entries.map(entry => entry.raw));
  expect(result.read.entries).toEqual([...entries].sort((a, b) => a.namespace.localeCompare(b.namespace)));
  expect(result.read.migration.entries).toHaveLength(2);
  expect(result.read.migration.entries.every(entry => !Object.hasOwn(entry, "raw") && /^[0-9a-f]{64}$/.test(entry.sha256))).toBe(true);
  await page.reload(); await page.waitForFunction(() => Boolean(window.repository));
  const cold = await page.evaluate(async binding => (await window.repository().open()).read(binding), binding);
  expect(cold).toEqual(result.read);
});

test("native transaction abort rolls back every entry and revision before result; strict durability requested", async ({ page }) => {
  const result = await page.evaluate(async binding => {
    const repo = await window.repository().open(), original = IDBDatabase.prototype.transaction, originalPut = IDBObjectStore.prototype.put;
    let strict = false, reachedMetadataWrite = 0;
    IDBDatabase.prototype.transaction = function(stores, mode, options) {
      const tx = original.call(this, stores, mode, options);
      if (mode === "readwrite") strict = options?.durability === "strict";
      return tx;
    };
    IDBObjectStore.prototype.put = function(...args) {
      const request = originalPut.apply(this, args), tx = this.transaction;
      if (this.name === "bindings") request.addEventListener("success", () => { reachedMetadataWrite++; tx.abort(); });
      return request;
    };
    let code, importCode;
    try { await repo.commit(binding, { expectedRevision: 0, puts: [{ namespace: "journal", key: "pending", raw: "must not persist" }] }); }
    catch (error) { code = error.code; }
    try { await repo.importLegacy(binding, { expectedRevision: 0, entries: [{ namespace: "snapshot", key: "legacy", raw: "must not persist" }] }); }
    catch (error) { importCode = error.code; }
    finally { IDBDatabase.prototype.transaction = original; IDBObjectStore.prototype.put = originalPut; }
    return { code, importCode, strict, reachedMetadataWrite, after: await repo.read(binding) };
  }, binding);
  expect(result.code).toBe("transaction-aborted"); expect(result.strict).toBe(true);
  expect(result.importCode).toBe("transaction-aborted"); expect(result.reachedMetadataWrite).toBe(2);
  expect(result.after.revision).toBe(0); expect(result.after.entries).toEqual([]);
});

test("migration detaches caller input before hashing and distinguishes unmatched UTF-16 raw strings", async ({ page }) => {
  const result = await page.evaluate(async binding => {
    const repo = await window.repository().open(), entries = [{ namespace: "journal", key: "raw", raw: "\ud800" }];
    const importing = repo.importLegacy(binding, { expectedRevision: 0, entries });
    entries[0].raw = "mutated after call"; await importing;
    let changed;
    try { await repo.importLegacy(binding, { expectedRevision: 0, entries: [{ namespace: "journal", key: "raw", raw: "\ud801" }] }); }
    catch (error) { changed = error.code; }
    return { changed, raw: (await repo.read(binding)).entries[0].raw };
  }, binding);
  expect(result.changed).toBe("migration-conflict"); expect(result.raw).toBe("\ud800");
});

test("migration manifest order is locale independent and re-import never overwrites later snapshot edits", async ({ page }) => {
  const result = await page.evaluate(async binding => {
    const repo = await window.repository().open();
    const entries = ["é", "a", "Z"].map(key => ({ namespace: "snapshot", key, raw: "original" }));
    await repo.importLegacy(binding, { expectedRevision: 0, entries });
    const initial = await repo.read(binding);
    await repo.commit(binding, { expectedRevision: 1, puts: [{ namespace: "snapshot", key: "Z", raw: "later local change" }] });
    repo.close();
    const cold = await window.repository().open();
    const repeated = await cold.importLegacy(binding, { expectedRevision: 2, entries: [...entries].reverse() });
    const current = await cold.read(binding);
    return { manifestKeys: initial.migration.entries.map(entry => entry.key), rowKeys: initial.entries.map(entry => entry.key),
      repeated, edited: current.entries.find(entry => entry.key === "Z").raw };
  }, binding);
  expect(result.manifestKeys).toEqual(["Z", "a", "é"]); expect(result.rowKeys).toEqual(["Z", "a", "é"]);
  expect(result.repeated).toEqual({ revision: 2, imported: false }); expect(result.edited).toBe("later local change");
});

test("real migration flow imports a 3 MiB owner namespace from full localStorage without rewriting source or foreign data", async ({ page }) => {
  const result = await page.evaluate(async binding => {
    const { preparePersonalDataMigration } = await import("/src/storage/personal-data-migration.js");
    const { createPersonalSaveOutbox } = await import("/src/sync/personal-save-outbox.js");
    const { STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY } = await import("/src/config/constants.js");
    const payload = { items: {}, containers: { bag: { id: "bag", name: "Exact phone bag", photos: [] } }, layouts: {} };
    const outbox = createPersonalSaveOutbox({ storage: localStorage, ...binding });
    const original = outbox.capture({ snapshot: payload, body: { payload, baseStateRevision: 1582, stateRevision: 1582,
      force: false, forceOverwrite: false, fullReplace: false } });
    for (const key of [STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY]) {
      localStorage.setItem(`${key}::${binding.scopeKey}`, ` ${JSON.stringify({ ...payload, unknownAdminDraft: "x".repeat(512 * 1024) })}\n`);
    }
    localStorage.setItem(STORAGE_KEY, "guest-only-" + "g".repeat(210 * 1024));
    localStorage.setItem(`${STORAGE_KEY}::id:other`, "other-only-" + "o".repeat(210 * 1024));
    const before = Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b));
    const totalBytes = before.reduce((sum, [key, raw]) => sum + 2 * (key.length + raw.length), 0);
    const originalSet = Storage.prototype.setItem, originalRemove = Storage.prototype.removeItem;
    let mutationAttempts = 0, prepared, verified;
    Storage.prototype.setItem = () => { mutationAttempts++; throw new DOMException("Simulated full legacy store", "QuotaExceededError"); };
    Storage.prototype.removeItem = () => { mutationAttempts++; throw Error("Legacy data must stay"); };
    try {
      const repo = await window.repository().open();
      prepared = await preparePersonalDataMigration({ repository: repo, storage: localStorage, binding,
        getContext: () => ({ ...binding, scope: "personal", generation: "editor-1" }) });
      const read = await repo.read(binding);
      verified = read.entries.every(entry => before.some(([key, raw]) => entry.key === key && entry.raw === raw));
      repo.close();
    } finally { Storage.prototype.setItem = originalSet; Storage.prototype.removeItem = originalRemove; }
    return { prepared, verified, mutationAttempts, totalBytes, operationId: original.action.operationId,
      unchanged: JSON.stringify(Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b))) === JSON.stringify(before) };
  }, binding);
  expect(result.prepared).toMatchObject({ revision: 1, entryCount: 4, cutover: false, legacyRetained: true });
  expect(result.prepared.sourceBytes).toBeGreaterThan(3 * 1024 * 1024);
  expect(result.totalBytes).toBeGreaterThan(3.8 * 1024 * 1024);
  expect(result.verified).toBe(true); expect(result.unchanged).toBe(true); expect(result.mutationAttempts).toBe(0);
  await page.reload(); await page.waitForFunction(() => Boolean(window.repository));
  const cold = await page.evaluate(async binding => {
    const read = await (await window.repository().open()).read(binding);
    const journal = read.entries.filter(entry => entry.namespace === "journal");
    return { count: read.entries.length, operationId: JSON.parse(journal[0].raw).action.operationId,
      mirrorsPreserved: read.entries.filter(entry => entry.namespace === "snapshot").every(entry => JSON.parse(entry.raw).unknownAdminDraft.length === 512 * 1024),
      foreignAbsent: read.entries.every(entry => !entry.raw.startsWith("guest-only-") && !entry.raw.startsWith("other-only-")) };
  }, binding);
  expect(cold).toEqual({ count: 4, operationId: result.operationId, mirrorsPreserved: true, foreignAbsent: true });
});
