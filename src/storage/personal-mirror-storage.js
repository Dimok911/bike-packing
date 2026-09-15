import { createPersonalDataRepository } from "./personal-data-repository.js";
import { STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY } from "../config/constants.js";

const bases = [STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY];
const databaseName = "bike-packing-personal-mirrors-v1";
const keyScope = key => {
  const base = bases.find(value => key.startsWith(`${value}::id:`));
  if (!base) return null;
  const scopeKey = key.slice(base.length + 2), actorId = scopeKey.slice(3);
  return actorId && actorId.trim() === actorId && actorId.length <= 191 ? scopeKey : null;
};
const bindingFor = scopeKey => ({ environment: "bike-packing-experiment", actorId: scopeKey.slice(3),
  // Storage namespace for the existing account-wide mirrors, not an API list ID.
  listId: "account-mirrors", scopeKey });
const blocked = (code, cause) => Object.assign(new Error(
  "Запись местных данных приостановлена. Исходные данные сохранены; не очищайте данные сайта."),
  { code: `personal-mirrors-${code}`, isPersonalSaveBlocked: true, cause });

// Async primary storage for the three large account mirrors. The existing
// synchronous operation journal remains the durable authority for captured
// edits. No asynchronous Storage.setItem shim is exposed.
export async function createPersonalMirrorStorage({ legacy = globalThis.localStorage,
  repository = createPersonalDataRepository({ databaseName }) } = {}) {
  const scopes = new Map(), openings = new Map(), pendingWrites = new Map();
  const sourceKeys = scope => bases.map(base => `${base}::${scope}`);
  const readSource = scope => sourceKeys(scope).map(key => ({ key, raw: legacy.getItem(key) }));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const assertSource = entry => {
    if (entry.failure) throw entry.failure;
    if (readSource(entry.binding.scopeKey).some(row => row.raw !== null)) {
      throw (entry.failure = blocked("old-tab-change"));
    }
  };
  const install = async scope => {
    const binding = bindingFor(scope), source = readSource(scope);
    let view = await repository.read(binding);
    if (view.revision === 0) {
      if (!same(source, readSource(scope))) throw blocked("source-changed");
      const copies = source.filter(row => row.raw !== null);
      await repository.importLegacy(binding, { expectedRevision: 0, entries: copies.flatMap(row => [
        { namespace: "snapshot", ...row }, { namespace: "journal", key: `original:${row.key}`, raw: row.raw }
      ]) });
      view = await repository.read(binding);
      if (!same(source, readSource(scope))) throw blocked("source-changed");
    }
    // Original bytes remain immutable in IndexedDB even after mirror updates.
    // A restart can finish only exact source removals; an old tab's edit is never
    // overwritten or removed merely because the destination already exists.
    for (const row of source) {
      if (row.raw === null) continue;
      const retained = view.entries.find(value => value.namespace === "journal" && value.key === `original:${row.key}`);
      if (!retained || retained.raw !== row.raw) throw blocked("source-changed");
      if (!view.entries.some(value => value.namespace === "snapshot" && value.key === row.key)) throw blocked("unverified-import");
    }
    if (!same(source, readSource(scope))) throw blocked("source-changed");
    for (const row of source) if (row.raw !== null) {
      legacy.removeItem(row.key);
      if (legacy.getItem(row.key) !== null) throw blocked("source-retained");
    }
    const originalBytes = view.entries.filter(row => row.namespace === "journal").reduce((sum, row) => sum + 2 * (row.key.length + row.raw.length), 0);
    const entry = { binding, revision: view.revision, originalBytes, values: new Map(view.entries.filter(row => row.namespace === "snapshot")
      .map(row => [row.key, row.raw])), tail: Promise.resolve(), failure: null };
    scopes.set(scope, entry); return entry;
  };
  await repository.open();
  const known = new Set((await repository.listBindings()).filter(binding => binding.listId === "account-mirrors").map(binding => binding.scopeKey));
  for (let index = 0; index < legacy.length; index++) {
    const scope = keyScope(legacy.key(index) || ""); if (scope) known.add(scope);
  }
  for (const scope of known) await install(scope);

  const entryFor = async scope => {
    if (scopes.has(scope)) return scopes.get(scope);
    if (!openings.has(scope)) openings.set(scope, install(scope));
    return openings.get(scope);
  };
  const api = {
    owns: key => Boolean(keyScope(key)),
    getItem(key) {
      const scope = keyScope(key);
      if (!scope) return legacy.getItem(key);
      const entry = scopes.get(scope);
      if (!entry) return legacy.getItem(key);
      assertSource(entry); return entry.values.get(key) ?? null;
    },
    keys() {
      const keys = new Set();
      for (let index = 0; index < legacy.length; index++) keys.add(legacy.key(index));
      for (const entry of scopes.values()) { assertSource(entry); for (const key of entry.values.keys()) keys.add(key); }
      return [...keys];
    },
    diagnostics() {
      let snapshotBytes = 0, originalBytes = 0;
      for (const entry of scopes.values()) {
        originalBytes += entry.originalBytes;
        for (const [key, raw] of entry.values) snapshotBytes += 2 * (key.length + raw.length);
      }
      return { available: true, snapshotBytes, originalBytes };
    },
    writeBatch(rows) {
      const scope = keyScope(rows?.[0]?.key || ""), task = commitBatch(rows);
      if (!pendingWrites.has(scope)) pendingWrites.set(scope, new Set());
      const pending = pendingWrites.get(scope); pending.add(task);
      task.then(() => pending.delete(task), () => pending.delete(task));
      return task;
    },
    write(key, raw) { return api.writeBatch([{ key, raw }]); },
    async flush(scope) {
      const pending = pendingWrites.get(scope);
      while (pending?.size) await Promise.all([...pending]);
      const entry = scopes.get(scope); if (entry) { await entry.tail; assertSource(entry); }
    },
    close() { repository.close(); }
  };
  async function commitBatch(rows) {
      if (!Array.isArray(rows) || !rows.length || rows.some(row => !keyScope(row?.key || "") || typeof row.raw !== "string")
        || new Set(rows.map(row => row.key)).size !== rows.length || new Set(rows.map(row => keyScope(row.key))).size !== 1) throw blocked("write");
      const frozen = structuredClone(rows), entry = await entryFor(keyScope(rows[0].key));
      const task = entry.tail.then(async () => {
        assertSource(entry);
        try {
          const result = await repository.commit(entry.binding, { expectedRevision: entry.revision,
            puts: frozen.map(row => ({ namespace: "snapshot", ...row })) });
          entry.revision = result.revision;
          for (const row of frozen) entry.values.set(row.key, row.raw);
          assertSource(entry); return true;
        } catch (cause) { throw (entry.failure = cause?.isPersonalSaveBlocked ? cause : blocked("commit", cause)); }
      });
      entry.tail = task.catch(() => {});
      return task;
  }
  return api;
}
