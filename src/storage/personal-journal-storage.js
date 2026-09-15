import { createPersonalDataRepository } from "./personal-data-repository.js";

const prefixes = ["bike-packing-personal-save-v1:", "bike-packing-personal-ordinary-recovery-v1:"];
const referenceField = "personalJournalReference";
const environment = "bike-packing-experiment";
const inlineLimit = 65536;
const failure = (reason, cause) => Object.assign(new Error(
  "Не удалось надёжно сохранить или прочитать личную очередь. Исходные данные сохранены; не очищайте данные сайта."),
  { code: cause?.name === "QuotaExceededError" || cause?.code === "quota" ? "quota" : "storage",
    reason: `personal-journal-${reason}`, isPersonalSaveBlocked: true, cause });
const owns = key => typeof key === "string" && prefixes.some(prefix => key.startsWith(prefix));
const validId = value => typeof value === "string" && value === value.trim() && value.length > 0
  && value.length <= 191 && !["__proto__", "prototype", "constructor"].includes(value);
const bindingOf = key => {
  try {
    const prefix = prefixes.find(value => key.startsWith(value));
    if (!prefix) throw Error("namespace");
    const rest = key.slice(prefix.length), separator = rest.indexOf(":");
    if (separator < 1 || separator === rest.length - 1) throw Error("key");
    const encoded = rest.slice(0, separator), value = JSON.parse(decodeURIComponent(encoded));
    const binding = { environment: value.environment, actorId: value.actorId, listId: value.listId, scopeKey: value.scopeKey };
    if (Object.keys(value).length !== 4 || binding.environment !== environment || !validId(binding.actorId)
      || !validId(binding.listId) || binding.scopeKey !== `id:${binding.actorId}`
      || encodeURIComponent(JSON.stringify(binding)) !== encoded) throw Error("binding");
    return binding;
  } catch (cause) { throw failure("binding", cause); }
};
const reference = raw => {
  if (typeof raw !== "string") return null;
  let value;
  try { value = JSON.parse(raw); } catch { return null; } // Preserve malformed legacy bytes for the native parser/export.
  if (!value || typeof value !== "object" || !Object.hasOwn(value, referenceField)) return null;
  if (value[referenceField] !== 1 || Object.keys(value).length !== 3
    || !/^[a-f0-9]{64}$/.test(value.sha256 || "") || !Number.isSafeInteger(value.utf16Length) || value.utf16Length < 0) {
    throw failure("reference");
  }
  return value;
};
// JSON escaping preserves unpaired UTF-16 units before TextEncoder runs.
const digest = async (key, raw) => [...new Uint8Array(await crypto.subtle.digest("SHA-256",
  new TextEncoder().encode(JSON.stringify([key, raw]))))].map(byte => byte.toString(16).padStart(2, "0")).join("");
const rowKey = hash => `raw:${hash}`;
const cacheKey = (key, marker) => JSON.stringify([key, marker]);

// Raw journal grammar stays owned by the existing outbox. IDB is the durable
// byte store; localStorage references remain the synchronous cross-tab index.
// There is deliberately no delayed Storage.setItem implementation. Large writes
// must await writeRequired. Migrated originals stay immutable. New values may
// be pruned only after the native journal explicitly retires their index keys.
export async function createPersonalJournalStorage({ legacy = globalThis.localStorage,
  repository = createPersonalDataRepository({ databaseName: "bike-packing-personal-journal-v1" }),
  locks = globalThis.navigator?.locks } = {}) {
  const cache = new Map(), pending = new Set(), writeFailures = new Map(), retired = new Map();
  const rawRows = (view, hash) => view.entries.filter(row => ["journal", "snapshot"].includes(row.namespace)
    && row.key === rowKey(hash));
  const readLegacy = key => { try { return legacy.getItem(key); } catch (cause) { throw failure("read", cause); } };
  const lock = (binding, callback) => {
    if (!locks?.request) throw failure("lock-unavailable");
    return locks.request(`bike-packing-personal-journal-v1:${JSON.stringify(binding)}`, callback);
  };
  const unchanged = (key, expected) => { if (readLegacy(key) !== expected) throw failure("source-changed"); };
  const loadReference = async (key, marker, expected = readLegacy(key)) => {
    const owner = bindingOf(key), view = await repository.read(owner);
    unchanged(key, expected);
    const rows = rawRows(view, marker.sha256);
    if (rows.length !== 1 || typeof rows[0].raw !== "string" || rows[0].raw.length !== marker.utf16Length
      || await digest(key, rows[0].raw) !== marker.sha256) throw failure("body-verification");
    unchanged(key, expected);
    cache.set(cacheKey(key, expected), rows[0].raw);
    return rows[0].raw;
  };
  const tracked = (key, promise) => {
    pending.add(promise);
    promise.then(() => { pending.delete(promise); writeFailures.delete(key); }, error => {
      pending.delete(promise); writeFailures.set(key, error);
    });
    return promise;
  };
  const belongsToScope = (key, scopeKey) => {
    if (scopeKey === undefined) return true;
    try { return bindingOf(key).scopeKey === scopeKey; } catch { return false; }
  };
  const writeValue = (key, raw, { assertCurrent = () => {} } = {}, retainOriginal = false) => {
    const task = (async () => {
      try {
        if (!owns(key) || typeof raw !== "string" || typeof assertCurrent !== "function") throw failure("write-input");
        if (reference(raw)) throw failure("nested-reference");
        const owner = bindingOf(key), expected = readLegacy(key);
        return await lock(owner, async () => {
          const guard = () => { assertCurrent(); unchanged(key, expected); };
          guard();
          const previousReference = reference(expected);
          if (previousReference) { await loadReference(key, previousReference, expected); guard(); }
          const hash = await digest(key, raw); guard();
          const marker = JSON.stringify({ [referenceField]: 1, sha256: hash, utf16Length: raw.length });
          let view = await repository.read(owner); guard();
          const stored = rawRows(view, hash);
          if (stored.length > 1 || stored.length === 1 && stored[0].raw !== raw) throw failure("body-collision");
          if (!stored.length || retainOriginal && stored[0].namespace === "snapshot") {
            await repository.commit(owner, { expectedRevision: view.revision,
              puts: [{ namespace: retainOriginal ? "journal" : "snapshot", key: rowKey(hash), raw }],
              deletes: stored.length ? [{ namespace: "snapshot", key: rowKey(hash) }] : [] });
            guard();
          }
          view = await repository.read(owner); guard();
          const checked = rawRows(view, hash);
          if (checked.length !== 1 || checked[0].raw !== raw) throw failure("write-verification");
          // Cache publication cannot make a record visible until its marker is
          // durably written. A failed marker leaves only an unreferenced body.
          cache.set(cacheKey(key, marker), raw);
          if (expected !== marker) legacy.setItem(key, marker);
          if (readLegacy(key) !== marker) throw failure("marker-verification");
          return true;
        });
      } catch (cause) { throw cause?.isPersonalSaveBlocked ? cause : failure("write", cause); }
    })();
    return tracked(key, task);
  };
  const scan = () => {
    const rows = [], seen = new Set(), count = legacy.length;
    for (let index = 0; index < count; index++) {
      const key = legacy.key(index);
      if (typeof key !== "string" || seen.has(key)) throw failure("scan-changed");
      seen.add(key);
      if (!owns(key)) continue;
      bindingOf(key);
      const raw = readLegacy(key);
      if (raw === null) throw failure("scan-changed");
      rows.push([key, raw]);
    }
    if (legacy.length !== count) throw failure("scan-changed");
    return rows;
  };
  const pruneRetired = async scopeKey => {
    // No general orphan sweep: a body without a marker may belong to a failed
    // capture. Only a native removeItem call authorizes retirement. Losing this
    // small in-memory set in a crash can leak an orphan, never lose an intent.
    if ([...writeFailures.keys()].some(key => belongsToScope(key, scopeKey))) return;
    for (const [ownerKey, removed] of retired) {
      if (scopeKey !== undefined && JSON.parse(ownerKey).scopeKey !== scopeKey) continue;
      await lock(JSON.parse(ownerKey), async () => {
      const observedRemoved = new Set(removed);
      const ownedRows = () => scan().filter(([key]) => JSON.stringify(bindingOf(key)) === ownerKey);
      const source = ownedRows();
      const assertSource = () => {
        if (JSON.stringify(source) !== JSON.stringify(ownedRows())) throw failure("prune-source-changed");
      };
      const active = new Set();
      for (const [key, raw] of source) {
        const marker = reference(raw);
        if (marker) {
          await loadReference(key, marker, raw); assertSource();
          active.add(marker.sha256);
        } else {
          // Small applied markers remain inline. An old tab's full inline
          // value also protects the identical body, without blocking unrelated
          // confirmed cleanup or treating raw bytes as an absent reference.
          active.add(await digest(key, raw)); assertSource();
        }
      }
      const owner = JSON.parse(ownerKey), view = await repository.read(owner); assertSource();
      const deletes = view.entries.filter(row => row.namespace === "snapshot" && row.key.startsWith("raw:")
        && observedRemoved.has(row.key.slice(4)) && !active.has(row.key.slice(4)))
        .map(row => ({ namespace: row.namespace, key: row.key }));
      if (deletes.length) {
        // The same lock excludes a candidate's IDB-write -> reference interval.
        assertSource();
        await repository.commit(owner, { expectedRevision: view.revision, puts: [], deletes });
        const verified = await repository.read(owner);
        if (deletes.some(target => verified.entries.some(row => row.namespace === target.namespace && row.key === target.key))) {
          throw failure("prune-verification");
        }
        for (const id of cache.keys()) {
          const [key, raw] = JSON.parse(id), marker = reference(raw);
          if (JSON.stringify(bindingOf(key)) === ownerKey && deletes.some(row => row.key === rowKey(marker.sha256))) cache.delete(id);
        }
      }
      // An active re-published value is no longer authorized for retirement.
      for (const hash of observedRemoved) removed.delete(hash);
      if (!removed.size) retired.delete(ownerKey);
      });
    }
  };
  const api = {
    owns,
    get length() { return legacy.length; },
    key: index => legacy.key(index),
    getItem(key) {
      const raw = readLegacy(key);
      if (!owns(key) || raw === null) return raw;
      bindingOf(key);
      if (!reference(raw)) return raw;
      const id = cacheKey(key, raw);
      if (!cache.has(id)) throw failure("reference-not-prepared");
      return cache.get(id);
    },
    setItem(key, raw) {
      if (owns(key)) {
        bindingOf(key);
        if (typeof raw !== "string" || reference(raw) || raw.length > inlineLimit) throw failure("async-write-required");
        if (api.getItem(key) === raw) return;
      }
      try { legacy.setItem(key, raw); } catch (cause) { throw failure("inline-write", cause); }
    },
    removeItem(key) {
      let marker = null, ownerKey = null;
      if (owns(key)) {
        ownerKey = JSON.stringify(bindingOf(key)); api.getItem(key);
        marker = reference(readLegacy(key));
      }
      try { legacy.removeItem(key); } catch (cause) { throw failure("remove", cause); }
      if (marker && readLegacy(key) === null) {
        if (!retired.has(ownerKey)) retired.set(ownerKey, new Set());
        retired.get(ownerKey).add(marker.sha256);
      }
    },
    writeRequired: (key, raw, options) => writeValue(key, raw, options),
    async prepare() {
      try {
        for (const [key, raw] of scan()) {
          const marker = reference(raw);
          if (marker) await lock(bindingOf(key), () => loadReference(key, marker, raw));
          else await writeValue(key, raw, { assertCurrent: () => unchanged(key, raw) }, true);
        }
        // A newly arrived reference must never look like an absent operation.
        for (const [key] of scan()) api.getItem(key);
        await pruneRetired();
      } catch (cause) { throw cause?.isPersonalSaveBlocked ? cause : failure("prepare", cause); }
      return api;
    },
    async flush(scopeKey) {
      // Settle existing writes without leaking an old account's rejected
      // promise (and its memory draft) into the current account's save.
      while (pending.size) await Promise.allSettled([...pending]);
      for (const [key, error] of writeFailures) if (belongsToScope(key, scopeKey)) throw error;
      await pruneRetired(scopeKey);
    },
    diagnostics() {
      let journalBytes = 0, referenceBytes = 0, inlineBytes = 0, recordCount = 0;
      for (const [key, raw] of scan()) {
        recordCount++;
        const value = api.getItem(key);
        journalBytes += 2 * (key.length + value.length);
        if (reference(raw)) referenceBytes += 2 * (key.length + raw.length);
        else inlineBytes += 2 * (key.length + raw.length);
      }
      return { available: true, journalBytes, referenceBytes, inlineBytes, recordCount,
        pendingWrites: pending.size, originalValuesRetained: true, retiredValueCleanupPending: retired.size };
    }
  };
  await api.prepare();
  return api;
}
