import { createPersonalJournalStorage } from "./personal-journal-storage.js";

let journal = null;
export async function initializePersonalJournal(enabled) {
  if (enabled && !journal) journal = await createPersonalJournalStorage();
  return journal;
}
export const personalJournalStorage = () => journal || globalThis.localStorage;
export const preparePersonalJournal = () => journal?.prepare() || Promise.resolve();
export const flushPersonalJournal = scope => journal?.flush(scope) || Promise.resolve();
export const personalJournalDiagnostics = () => journal?.diagnostics() || { available: false };
