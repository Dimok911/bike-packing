const environment = "bike-packing-experiment";
const journalPrefix = "bike-packing-personal-save-v1:";
const blockingCodes = new Set(["quota", "storage", "fork", "stale-tab", "selection", "payload-size", "payload-shape", "photo-recovery"]);

// A storage failure is a latched stop for this editor, not an invitation to
// retry a form which may already have changed its in-memory entities.
export function createPersonalSaveRecovery({ onBlocked = () => {}, isCurrentScope = () => true } = {}) {
  let failure = null, resolving = false;
  const assertRunning = () => { if (failure) throw failure.error; };
  const report = (error, { scopeKey, snapshot, recoverDraft, canRecoverDraft } = {}) => {
    if (!error?.isPersonalSaveBlocked || !blockingCodes.has(error.code)) return false;
    if (!isCurrentScope(scopeKey)) return false;
    if (!failure) failure = { error, scopeKey, draft: null, draftAvailable: false };
    if (failure.error !== error) return false;
    snapshot ||= error.unconfirmedMemoryDraft;
    if (snapshot && !failure.draftAvailable) {
      try { failure.draft = JSON.parse(JSON.stringify(snapshot)); failure.draftAvailable = true; }
      catch { /* The journal can still be exported when the memory copy fails. */ }
    }
    if (error.code === "stale-tab" && recoverDraft && canRecoverDraft?.() && !failure.recoverDraft) failure.recoverDraft = recoverDraft;
    onBlocked(failure);
    return true;
  };
  const run = (callback, details = {}) => {
    assertRunning();
    const rejected = error => { report(error, details); throw error; };
    try {
      const result = callback();
      return result?.then ? result.catch(rejected) : result;
    } catch (error) { return rejected(error); }
  };
  return {
    assertRunning, report, run,
    owns: error => Boolean(failure && failure.error === error),
    message: () => failure?.error.message || "",
    canRecoverDraft: () => Boolean(failure?.recoverDraft && isCurrentScope(failure.scopeKey) && !resolving),
    async recoverDraft(options) {
      const original = failure;
      if (!original?.recoverDraft || !isCurrentScope(original.scopeKey) || resolving) throw Error("No recoverable draft in this scope");
      resolving = true;
      try {
        const record = await original.recoverDraft(options);
        if (failure !== original || !isCurrentScope(original.scopeKey)
          || record?.action?.scopeKey !== original.scopeKey || !record.localReconciliation || !record.snapshot) {
          throw Error("The recovered draft no longer belongs to this editor");
        }
        // The adapter has published and re-read the exact successor. Only this
        // narrow success unlocks editing; cancel/errors leave the latch intact.
        failure = null;
        return record;
      } catch (error) {
        if (error.draftPublicationAttempted) original.recoverDraft = null;
        throw error;
      } finally { resolving = false; }
    },
    outbox(factory, scopeKey) {
      const outbox = run(factory, { scopeKey });
      return Object.fromEntries(Object.entries(outbox).map(([name, value]) => [name,
        typeof value !== "function" ? value : (...args) => run(() => value.apply(outbox, args), {
          scopeKey, snapshot: name === "capture" ? args[0]?.snapshot : undefined,
          recoverDraft: name === "capture" ? options => {
            if (!outbox.canReconcileStaleCapture?.()) throw Error("No frozen common base for this draft");
            return outbox.reconcileStaleCapture(options);
          } : undefined,
          canRecoverDraft: () => outbox.canReconcileStaleCapture?.()
        })]));
    },
    recoveryCopy(storage) {
      if (!failure) throw Error("No blocked personal save to export");
      if (!isCurrentScope(failure.scopeKey)) throw Error("Recovery belongs to a different account scope");
      const entries = [];
      let storageReadable = true;
      try {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (!key?.startsWith(journalPrefix)) continue;
          let binding;
          try { binding = JSON.parse(decodeURIComponent(key.slice(journalPrefix.length).split(":")[0])); }
          catch { continue; } // Never guess the owner of a malformed key.
          if (binding.environment !== environment || binding.scopeKey !== failure.scopeKey
            || `id:${binding.actorId}` !== failure.scopeKey) continue;
          entries.push({ key, value: storage.getItem(key) }); // Preserve even malformed JSON verbatim.
        }
      } catch { storageReadable = false; }
      return { format: "bike-packing-personal-recovery-v1", environment, scopeKey: failure.scopeKey,
        reasonCode: failure.error.code, storageReadable, journalEntries: entries,
        unconfirmedMemoryDraft: failure.draft, memoryDraftAvailable: failure.draftAvailable,
        automaticImportAllowed: false, photoFilesIncluded: false };
    }
  };
}
