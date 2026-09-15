const DATABASE = "bike-packing-personal-data-v1";
const environment = "bike-packing-experiment";
const copy = value => structuredClone(value);
const fail = code => Object.assign(new Error(`Personal data storage: ${code}. Existing data is retained.`),
  { code, isPersonalDataRepositoryError: true });
const id = value => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 191
  && !["__proto__", "constructor", "prototype"].includes(value);
const bindingOf = value => {
  if (!value || value.environment !== environment || !id(value.actorId) || !id(value.listId)
    || value.scopeKey !== `id:${value.actorId}` || Object.keys(value).length !== 4) throw fail("binding");
  return { environment, actorId: value.actorId, listId: value.listId, scopeKey: value.scopeKey };
};
const entryOf = value => {
  if (!value || !["snapshot", "journal"].includes(value.namespace) || typeof value.key !== "string"
    || !value.key || value.key.length > 4096 || typeof value.raw !== "string"
    || Object.keys(value).some(key => !["namespace", "key", "raw"].includes(key))) throw fail("entry");
  return { namespace: value.namespace, key: value.key, raw: value.raw };
};
const identity = entry => JSON.stringify([entry.namespace, entry.key]);
const compareIdentity = (left, right) => identity(left) < identity(right) ? -1 : identity(left) > identity(right) ? 1 : 0;
function entriesOf(values) {
  if (!Array.isArray(values)) throw fail("entry");
  const entries = values.map(entryOf);
  if (new Set(entries.map(identity)).size !== entries.length) throw fail("duplicate-entry");
  return entries;
}
const revisionOf = value => { if (!Number.isSafeInteger(value) || value < 0) throw fail("revision"); return value; };
const storageFailure = error => error?.isPersonalDataRepositoryError ? error
  : fail(error?.name === "QuotaExceededError" ? "quota" : "transaction-aborted");

// This repository owns asynchronous durability, not business validation or
// dispatch. Raw journal strings remain byte-for-byte unchanged. No localStorage
// adapter, deletion of legacy data, or implicit network operation is provided.
export function createPersonalDataRepository({ indexedDB = globalThis.indexedDB, databaseName = DATABASE } = {}) {
  if (typeof databaseName !== "string" || !databaseName || databaseName.length > 191) throw fail("database-name");
  let opening = null, connection = null, closed = false;
  const open = () => {
    if (closed) return Promise.reject(fail("closed"));
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!indexedDB?.open) { reject(fail("unavailable")); return; }
      let request, abandoned = false;
      try { request = indexedDB.open(databaseName, 1); } catch { reject(fail("open")); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("bindings")) db.createObjectStore("bindings", { keyPath: "bindingKey" });
        if (!db.objectStoreNames.contains("entries")) {
          const store = db.createObjectStore("entries", { keyPath: "id" });
          store.createIndex("binding", "bindingKey", { unique: false });
        }
      };
      request.onblocked = () => { abandoned = true; reject(fail("open-blocked")); };
      request.onerror = () => reject(fail("open"));
      request.onsuccess = () => {
        const db = request.result;
        if (abandoned || closed) { db.close(); reject(fail("closed")); return; }
        connection = db;
        db.onversionchange = () => { closed = true; db.close(); connection = null; };
        resolve(db);
      };
    });
    return opening;
  };
  const transaction = async (mode, run) => {
    const db = await open();
    if (closed) throw fail("closed");
    return new Promise((resolve, reject) => {
      let tx, result, failure;
      try { tx = db.transaction(["bindings", "entries"], mode, mode === "readwrite" ? { durability: "strict" } : undefined); }
      catch { reject(fail("transaction-open")); return; }
      const abort = error => { failure = storageFailure(error); try { tx.abort(); } catch { reject(failure); } };
      const guarded = callback => event => { try { callback(event); } catch (error) { abort(error); } };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || storageFailure(tx.error));
      tx.onerror = event => { failure ||= storageFailure(event.target?.error || tx.error); };
      try { run(tx, value => { result = value; }, guarded, abort); } catch (error) { abort(error); }
    });
  };
  const metadata = (row, bindingKey) => {
    if (row === undefined) return { bindingKey, revision: 0, migration: null };
    if (row.bindingKey !== bindingKey || row.version !== 1 || revisionOf(row.revision) < 1) throw fail("corrupt-metadata");
    return row;
  };
  const read = async rawBinding => {
    const binding = bindingOf(rawBinding), bindingKey = JSON.stringify(binding);
    return transaction("readonly", (tx, finish, guarded) => {
      const metaRequest = tx.objectStore("bindings").get(bindingKey);
      const rowsRequest = tx.objectStore("entries").index("binding").getAll(bindingKey);
      let meta, rows;
      const complete = () => {
        if (!meta || !rows) return;
        const entries = rows.map(row => {
          const entry = entryOf({ namespace: row.namespace, key: row.key, raw: row.raw });
          if (row.bindingKey !== bindingKey || JSON.stringify(row.id) !== JSON.stringify([bindingKey, entry.namespace, entry.key])) throw fail("corrupt-entry");
          return entry;
        });
        if (meta.revision === 0 && entries.length) throw fail("corrupt-metadata");
        entries.sort(compareIdentity);
        finish({ binding, revision: meta.revision, entries, migration: copy(meta.migration || null) });
      };
      metaRequest.onsuccess = guarded(() => { meta = metadata(metaRequest.result, bindingKey); complete(); });
      rowsRequest.onsuccess = guarded(() => { rows = rowsRequest.result; complete(); });
    });
  };
  const write = async (binding, expectedRevision, puts, deletes, migration = null) => {
    const bindingKey = JSON.stringify(binding);
    return transaction("readwrite", (tx, finish, guarded) => {
      const metas = tx.objectStore("bindings"), rows = tx.objectStore("entries");
      const request = metas.get(bindingKey);
      request.onsuccess = guarded(() => {
        const current = metadata(request.result, bindingKey);
        if (migration && current.migration) {
          // Idempotence recognizes the original import, not equality of today's
          // snapshots. Never overwrite later edits; cutover must verify a read.
          if (JSON.stringify(current.migration) !== JSON.stringify(migration)) throw fail("migration-conflict");
          finish({ revision: current.revision, imported: false }); return;
        }
        if (current.revision !== expectedRevision) throw fail("revision-conflict");
        if (migration && current.revision !== 0) throw fail("migration-conflict");
        if (current.revision === Number.MAX_SAFE_INTEGER) throw fail("revision");
        const pending = puts.length + deletes.length;
        let remaining = pending;
        const complete = () => {
          if (remaining !== 0) return;
          const revision = current.revision + 1;
          metas.put({ version: 1, bindingKey, revision, migration: migration || current.migration || null });
          finish({ revision, ...(migration ? { imported: true } : {}) });
        };
        for (const entry of puts) {
          const key = [bindingKey, entry.namespace, entry.key], prior = rows.get(key);
          prior.onsuccess = guarded(() => {
            if (entry.namespace === "journal" && prior.result && prior.result.raw !== entry.raw) throw fail("immutable-entry");
            const stored = rows.put({ id: key, bindingKey, ...entry });
            stored.onsuccess = guarded(() => {
              const verify = rows.get(key);
              verify.onsuccess = guarded(() => {
                if (verify.result?.raw !== entry.raw) throw fail("write-unverified");
                remaining--; complete();
              });
            });
          });
        }
        for (const entry of deletes) {
          const removed = rows.delete([bindingKey, entry.namespace, entry.key]);
          removed.onsuccess = guarded(() => { remaining--; complete(); });
        }
        if (pending === 0) complete();
      });
    });
  };
  const api = {
    async open() { await open(); return api; },
    read,
    async commit(rawBinding, { expectedRevision, puts = [], deletes = [] } = {}) {
      const binding = bindingOf(rawBinding), revision = revisionOf(expectedRevision), entries = entriesOf(puts);
      if (!Array.isArray(deletes)) throw fail("entry");
      const removals = deletes.map(entry => {
        const parsed = entryOf({ ...entry, raw: "" });
        if (parsed.namespace !== "snapshot") throw fail("immutable-entry");
        return parsed;
      });
      if (new Set([...entries, ...removals].map(identity)).size !== entries.length + removals.length) throw fail("duplicate-entry");
      return write(binding, revision, entries, removals);
    },
    async importLegacy(rawBinding, { expectedRevision, entries } = {}) {
      const binding = bindingOf(rawBinding), revision = revisionOf(expectedRevision), input = entriesOf(entries);
      const source = [...input].sort(compareIdentity);
      const manifest = [];
      for (const entry of source) {
        // UTF-16LE preserves even unpaired code units in a legacy raw string;
        // TextEncoder would replace them and could identify different bytes.
        const bytes = new Uint8Array(entry.raw.length * 2);
        for (let index = 0; index < entry.raw.length; index++) {
          const unit = entry.raw.charCodeAt(index); bytes[index * 2] = unit & 255; bytes[index * 2 + 1] = unit >>> 8;
        }
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        manifest.push({ namespace: entry.namespace, key: entry.key, utf16Length: entry.raw.length,
          sha256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("") });
      }
      return write(binding, revision, input, [], { version: 1, source: "localStorage", hashEncoding: "utf16le", entries: manifest });
    },
    close() { closed = true; connection?.close(); connection = null; }
  };
  return api;
}
