import { createPersonalSaveOutbox } from "./personal-save-outbox.js";

const clone = value => structuredClone(value);
const fail = code => Object.assign(new Error(`Personal async outbox: ${code}. Existing data is retained.`),
  { code: `personal-async-outbox-${code}`, isPersonalAsyncOutboxError: true });
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
function memory(entries) {
  const values = new Map(entries.map(entry => [entry.key, entry.raw]));
  return { values, get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem(key, raw) { if (typeof key !== "string" || typeof raw !== "string") throw fail("invalid-write"); values.set(key, raw); },
    removeItem: key => values.delete(key) };
}

// Explicit async boundary around a private synchronous MEMORY view. This is
// not an asynchronous Storage shim and is not wired into synchronous app saves.
// Only capture and ordinary recovery are exposed; drain, compaction and photo
// callbacks need separately audited durable barriers before they can be added.
export async function createPersonalAsyncOutbox({ repository, binding: inputBinding, getContext, nativeOptions = {} } = {}) {
  if (!repository?.read || !repository?.commit || typeof getContext !== "function") throw fail("configuration");
  const binding = { environment: inputBinding?.environment, actorId: inputBinding?.actorId,
    listId: inputBinding?.listId, scopeKey: inputBinding?.scopeKey };
  if (binding.environment !== "bike-packing-experiment" || binding.scopeKey !== `id:${binding.actorId}`
    || [binding.actorId, binding.listId].some(id => typeof id !== "string" || !id || id.trim() !== id || id.length > 191)) throw fail("binding");
  const options = clone(nativeOptions), encoded = encodeURIComponent(JSON.stringify(binding));
  const prefixes = [`bike-packing-personal-save-v1:${encoded}:`, `bike-packing-personal-ordinary-recovery-v1:${encoded}:`];
  let invalid = false, busy = false, committed, committedView, committedStatus;
  const assertActive = () => { if (invalid) throw fail("invalidated"); };
  const assertBindingContext = () => {
    const live = getContext();
    if (live?.scope !== "personal" || Object.keys(binding).some(key => live[key] !== binding[key])) {
      invalid = true; throw fail("context");
    }
  };
  const contextGuard = () => {
    const original = clone(getContext());
    const valid = value => value?.scope === "personal" && value.generation !== undefined
      && Object.keys(binding).every(key => value[key] === binding[key]);
    const check = () => {
      const live = getContext();
      if (!valid(original) || !valid(live) || live.generation !== original.generation) {
        invalid = true; throw fail("context");
      }
    };
    check(); return check;
  };
  const validated = view => {
    if (!Number.isSafeInteger(view?.revision) || view.revision < 0 || !Array.isArray(view.entries)) throw fail("repository-view");
    const seen = new Set();
    for (const entry of view.entries) {
      if (!entry || !["journal", "snapshot"].includes(entry.namespace) || typeof entry.key !== "string" || !entry.key
        || typeof entry.raw !== "string" || seen.has(entry.key)
        || entry.namespace === "snapshot" && ["bike-packing-personal-save-v1:", "bike-packing-personal-ordinary-recovery-v1:"].some(prefix => entry.key.startsWith(prefix))
        || entry.namespace === "journal" && !prefixes.some(prefix => entry.key.startsWith(prefix))) throw fail("repository-view");
      seen.add(entry.key);
    }
    return clone(view);
  };
  const native = storage => createPersonalSaveOutbox({ ...options, storage, actorId: binding.actorId,
    listId: binding.listId, scopeKey: binding.scopeKey, environmentId: binding.environment });
  const cacheView = () => {
    try {
      const outbox = native(memory(committed.entries));
      committedView = { revision: committed.revision, binding: clone(binding), head: outbox.recover(),
        snapshot: outbox.recoverSnapshot(), records: outbox.list(), recoveryState: outbox.ordinaryRecoveryState() };
      committedStatus = Object.freeze({ revision: committed.revision, pending: outbox.hasPending(), recoveryPending: committedView.recoveryState.pending });
    } catch (error) { invalid = true; throw error; }
  };
  const repositoryRead = async () => {
    try { return validated(await repository.read(clone(binding))); }
    catch (error) { invalid = true; throw error; }
  };
  const initialGuard = contextGuard();
  committed = await repositoryRead(); initialGuard();
  // Invoke the existing parser now, before exposing a usable adapter.
  cacheView();
  const run = async callback => {
    assertActive(); assertBindingContext(); if (busy) throw fail("busy");
    busy = true;
    try {
      const guard = contextGuard(), draft = memory(committed.entries), outbox = native(draft);
      const flush = async () => {
        assertActive(); guard();
        const old = new Map(committed.entries.map(entry => [entry.key, entry]));
        const puts = [];
        for (const [key, raw] of draft.values) {
          const previous = old.get(key);
          if (previous?.raw === raw) continue;
          // Existing journal rows are immutable. No overwrite/delete fallback.
          if (previous || !prefixes.some(prefix => key.startsWith(prefix))) throw fail("unsupported-write");
          puts.push({ namespace: "journal", key, raw });
        }
        if ([...old.keys()].some(key => !draft.values.has(key))) throw fail("unsupported-delete");
        if (puts.length) {
          let revision;
          try { ({ revision } = await repository.commit(clone(binding), { expectedRevision: committed.revision, puts: clone(puts), deletes: [] })); }
          catch (error) { invalid = true; throw error; }
          if (!Number.isSafeInteger(revision) || revision !== committed.revision + 1) { invalid = true; throw fail("repository-revision"); }
          committed = { revision, entries: [...committed.entries, ...clone(puts)] };
          cacheView();
        } else {
          const actual = await repositoryRead();
          if (actual.revision !== committed.revision) { invalid = true; throw fail("revision-conflict"); }
        }
        guard();
      };
      const barrier = operation => async (...args) => {
        await flush(); guard();
        const result = await operation(...args); guard();
        // A different tab may have committed while the network call ran.
        await flush(); guard(); return result;
      };
      const result = await callback(outbox, { guard, barrier });
      await flush(); guard(); return clone(result);
    } finally {
      // Uncommitted drafts are scoped to this invocation. Durable barriers
      // already published to the repository are intentionally never rolled back.
      busy = false;
    }
  };
  return Object.freeze({
    readView() {
      assertActive(); assertBindingContext(); return freeze(clone(committedView));
    },
    status() { assertActive(); assertBindingContext(); return committedStatus; },
    async capture(input) { const frozen = clone(input); return run(outbox => outbox.capture(frozen)); },
    async prepareOrdinaryRecoveryArchive() { return run(outbox => outbox.prepareOrdinaryRecoveryArchive({ getContext })); },
    async recoverOrdinaryWithServer({ queue, readRemote, makeSnapshot } = {}) {
      return run((outbox, { barrier }) => {
        if (typeof queue?.cancelExact !== "function" || typeof readRemote !== "function") throw fail("recovery-configuration");
        return outbox.recoverOrdinaryWithServer({ getContext,
          queue: { cancelExact: barrier(request => queue.cancelExact(request)) }, readRemote: barrier(readRemote),
          ...(makeSnapshot ? { makeSnapshot } : {}) });
      });
    }
  });
}
