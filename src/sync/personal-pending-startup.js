const ownerKeys = ["environment", "actorId", "scopeKey", "scope", "listId"];
const invalid = () => { throw Error("Проверка сохранённых действий требует текущего личного аккаунта."); };
const synchronous = callback => {
  if (typeof callback !== "function") invalid();
  const value = callback();
  if (value?.then) { Promise.resolve(value).catch(() => {}); invalid(); }
  return value;
};
const owner = getContext => {
  const value = synchronous(getContext);
  if (!value || value.environment !== "bike-packing-experiment" || !value.actorId || value.scope !== "personal"
    || value.scopeKey !== `id:${value.actorId}` || typeof value.listId !== "string") return null;
  return Object.fromEntries(ownerKeys.map(key => [key, value[key]]));
};

// Run inside the load's single-flight promise, AFTER existing photo recovery.
// The normal replacement loader is never used to settle pending actions. The
// injected existing saver owns receipts, CAS, photo guards and reconciliation.
// A resolved save promise alone is not success: it may have handled a refusal.
export async function recoverPendingPersonalSaveBeforeLoad({ enabled = false, getContext, hasPending, resume, onPending = () => {} }) {
  if (enabled !== true) return true;
  const initial = owner(getContext);
  if (!initial) return false;
  const current = () => {
    const value = owner(getContext);
    return value !== null && ownerKeys.every(key => value[key] === initial[key]);
  };
  const pending = () => {
    if (!current()) return null;
    const value = synchronous(hasPending);
    if (typeof value !== "boolean") invalid();
    return current() ? value : null;
  };
  const before = pending();
  if (before === null) return false;
  if (!before) return true;
  if (!initial.listId || typeof resume !== "function") invalid();
  let failure;
  try { await resume(); } catch (error) { failure = error; }
  // Reconciliation may legitimately change the editor generation. The saver
  // guards each action; here only its account/list/scope must remain identical.
  // A switched account must receive neither an old warning nor an old load.
  if (!current()) return false;
  const after = pending();
  if (after === null) return false;
  if (failure || after) {
    synchronous(() => onPending(failure));
    return false;
  }
  return true;
}
