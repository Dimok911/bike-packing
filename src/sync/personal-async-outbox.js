import { createPersonalSaveOutbox } from "./personal-save-outbox.js";
import { STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY, SYNC_META_KEY } from "../config/constants.js";
import { isOrdinaryLegacyPersonalUpdate } from "./personal-confirmed-photos.js";

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
// Ordinary confirmation stages UI mirrors and the applied marker in one commit.
// Photo dispatch and compaction still need their own audited durable barriers.
export async function createPersonalAsyncOutbox({ repository, binding: inputBinding, getContext, nativeOptions = {} } = {}) {
  if (!repository?.read || !repository?.commit || typeof getContext !== "function") throw fail("configuration");
  const binding = { environment: inputBinding?.environment, actorId: inputBinding?.actorId,
    listId: inputBinding?.listId, scopeKey: inputBinding?.scopeKey };
  if (binding.environment !== "bike-packing-experiment" || binding.scopeKey !== `id:${binding.actorId}`
    || [binding.actorId, binding.listId].some(id => typeof id !== "string" || !id || id.trim() !== id || id.length > 191)) throw fail("binding");
  const options = clone(nativeOptions), encoded = encodeURIComponent(JSON.stringify(binding));
  const prefixes = [`bike-packing-personal-save-v1:${encoded}:`, `bike-packing-personal-ordinary-recovery-v1:${encoded}:`];
  const snapshotKeys = new Set([STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY, SYNC_META_KEY].map(key => `${key}::${binding.scopeKey}`));
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
        snapshot: outbox.recoverSnapshot(), records: outbox.list(), recoveryState: outbox.ordinaryRecoveryState(),
        snapshots: committed.entries.filter(entry => entry.namespace === "snapshot") };
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
          const namespace = snapshotKeys.has(key) ? "snapshot" : "journal";
          // Existing journal rows are immutable. Only owned mirrors can change.
          if (namespace === "journal" && (previous || !prefixes.some(prefix => key.startsWith(prefix)))
            || previous && previous.namespace !== namespace) throw fail("unsupported-write");
          puts.push({ namespace, key, raw });
        }
        if ([...old.keys()].some(key => !draft.values.has(key))) throw fail("unsupported-delete");
        if (puts.length) {
          let revision;
          try { ({ revision } = await repository.commit(clone(binding), { expectedRevision: committed.revision, puts: clone(puts), deletes: [] })); }
          catch (error) { invalid = true; throw error; }
          if (!Number.isSafeInteger(revision) || revision !== committed.revision + 1) { invalid = true; throw fail("repository-revision"); }
          const entries = new Map(committed.entries.map(entry => [entry.key, entry]));
          for (const entry of puts) entries.set(entry.key, clone(entry));
          committed = { revision, entries: [...entries.values()] };
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
      const writeSnapshots = entries => {
        if (!Array.isArray(entries) || new Set(entries.map(entry => entry?.key)).size !== entries.length
          || entries.some(entry => !snapshotKeys.has(entry?.key) || typeof entry.raw !== "string"
            || Object.keys(entry).some(key => !["key", "raw"].includes(key)))) throw fail("snapshot-write");
        for (const entry of entries) draft.setItem(entry.key, entry.raw);
      };
      const result = await callback(outbox, { guard, barrier, writeSnapshots });
      await flush(); guard(); return clone(result);
    } finally {
      // Uncommitted drafts are scoped to this invocation. Durable barriers
      // already published to the repository are intentionally never rolled back.
      busy = false;
    }
  };
  const readNative = method => {
    assertActive(); assertBindingContext();
    return freeze(clone(native(memory(committed.entries))[method]()));
  };
  return Object.freeze({
    binding: freeze(clone(binding)),
    readView() {
      assertActive(); assertBindingContext(); return freeze(clone(committedView));
    },
    status() { assertActive(); assertBindingContext(); return committedStatus; },
    list: () => readNative("list"),
    ordinaryRecoveryState: () => readNative("ordinaryRecoveryState"),
    ordinaryRecoveryReview: () => readNative("ordinaryRecoveryReview"),
    ordinaryRecoveryCopy: () => readNative("ordinaryRecoveryCopy"),
    async capture(input) { const frozen = clone(input); return run(outbox => outbox.capture(frozen)); },
    async saveSnapshots(entries) {
      const frozen = clone(entries);
      return run((_, { writeSnapshots }) => { writeSnapshots(frozen); return true; });
    },
    async settleOrdinary({ queue, prepareConfirmation } = {}) {
      return run(async (outbox, { barrier, writeSnapshots }) => {
        if (typeof queue?.run !== "function" || typeof prepareConfirmation !== "function") throw fail("confirmation-configuration");
        const records = outbox.list();
        if (records.some(record => record.action.kind !== "list.update" || record.photoState
          || !isOrdinaryLegacyPersonalUpdate(record.action.body))) throw fail("ordinary-only");
        let confirmation = null;
        await outbox.drain({ getContext, queue: { run: barrier(request => queue.run(request)),
          inspect: barrier(request => {
            if (typeof queue.inspect !== "function") throw fail("confirmation-inspection");
            return queue.inspect(request);
          }) },
          onConfirmed(result, record) {
            const stateRevision = result?.list?.stateRevision ?? result?.stateRevision;
            if (!Number.isSafeInteger(stateRevision) || stateRevision < 1) throw fail("confirmation-revision");
            // This is a pure, synchronous projection. The caller adopts the UI
            // only AFTER settleOrdinary resolves, never from this callback.
            const snapshots = clone(prepareConfirmation(clone(result), clone(record)));
            const required = [STORAGE_KEY, BASE_STATE_KEY, SYNC_META_KEY].map(key => `${key}::${binding.scopeKey}`);
            if (!Array.isArray(snapshots) || required.some(key => !snapshots.some(entry => entry?.key === key))) throw fail("confirmation-snapshots");
            writeSnapshots(snapshots);
            outbox.markApplied({ operationId: record.action.operationId, stateRevision });
            confirmation = { result: clone(result), record: clone(record), snapshots: clone(snapshots) };
          }
        });
        return confirmation;
      });
    },
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
