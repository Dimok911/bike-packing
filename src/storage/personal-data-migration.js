import { STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY } from "../config/constants.js";
import { scopedLocalStorageKey } from "./scope.js";
import { createPersonalSaveOutbox } from "../sync/personal-save-outbox.js";

const fail = code => { throw Object.assign(new Error("Перенос местных данных остановлен. Исходные данные сохранены."),
  { code: `personal-data-migration-${code}`, isPersonalSaveBlocked: true }); };
const stable = entries => JSON.stringify(entries);
const bindingOf = input => {
  const value = { environment: input?.environment, actorId: input?.actorId, listId: input?.listId, scopeKey: input?.scopeKey };
  if (value.environment !== "bike-packing-experiment" || value.scopeKey !== `id:${value.actorId}`
    || [value.actorId, value.listId].some(id => typeof id !== "string" || !id || id.trim() !== id)) fail("binding");
  return value;
};

// Exact current-account namespaces only. Authentication, other accounts, guest
// state and renewable caches are not part of this transfer. No removal API.
export function collectLegacyPersonalData({ storage, binding: input }) {
  const binding = bindingOf(input), suffix = encodeURIComponent(JSON.stringify(binding));
  const prefixes = [`bike-packing-personal-save-v1:${suffix}:`, `bike-packing-personal-ordinary-recovery-v1:${suffix}:`];
  const snapshots = new Set([STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY].map(key => scopedLocalStorageKey(key, binding.scopeKey)));
  const scan = () => {
    const entries = [], keys = new Set(), count = storage.length;
    if (!Number.isSafeInteger(count) || count < 0) fail("unreadable");
    for (let index = 0; index < count; index++) {
      const key = storage.key(index);
      if (typeof key !== "string" || keys.has(key)) fail("changed");
      keys.add(key);
      const namespace = snapshots.has(key) ? "snapshot" : prefixes.some(prefix => key.startsWith(prefix)) ? "journal" : null;
      if (!namespace) continue;
      const raw = storage.getItem(key);
      if (typeof raw !== "string") fail("changed");
      entries.push({ namespace, key, raw });
    }
    if (storage.length !== count) fail("changed");
    return entries.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  };
  try {
    const before = scan(), after = scan();
    if (stable(before) !== stable(after)) fail("changed");
    // Reuse the existing journal grammar before copying it into another store.
    // Opaque state mirrors can own admin drafts; preserve them byte-for-byte.
    createPersonalSaveOutbox({ storage, ...binding }).list();
    if (stable(before) !== stable(scan())) fail("changed");
    return { binding, entries: before };
  } catch (error) {
    if (error?.isPersonalSaveBlocked) throw error;
    fail("unreadable");
  }
}

// This prepares and verifies a durable import. It deliberately does not switch
// the application to IndexedDB or remove localStorage. The caller must perform
// a separately guarded cutover only after all readers use the new repository.
export async function preparePersonalDataMigration({ repository, storage, binding, getContext }) {
  const initial = collectLegacyPersonalData({ storage, binding });
  // Copy the observed values: callers may reuse and mutate one context object.
  const context = { ...getContext?.() };
  const assertSource = () => {
    const current = getContext?.();
    if (!context || current?.scope !== "personal" || context.scope !== "personal"
      || !context.generation || current.generation !== context.generation
      || Object.keys(initial.binding).some(key => current[key] !== initial.binding[key] || context[key] !== initial.binding[key])) fail("context");
    if (stable(collectLegacyPersonalData({ storage, binding }).entries) !== stable(initial.entries)) fail("changed");
  };
  assertSource();
  const before = await repository.read(initial.binding); assertSource();
  const imported = await repository.importLegacy(initial.binding, { expectedRevision: before.revision, entries: initial.entries });
  assertSource();
  const verified = await repository.read(initial.binding); assertSource();
  if (verified.revision !== imported.revision || initial.entries.some(entry =>
    !verified.entries.some(row => row.namespace === entry.namespace && row.key === entry.key && row.raw === entry.raw))) fail("verification");
  return { binding: initial.binding, revision: verified.revision, entryCount: initial.entries.length,
    sourceBytes: initial.entries.reduce((size, entry) => size + 2 * (entry.key.length + entry.raw.length), 0),
    cutover: false, legacyRetained: true };
}
