import { personalJournalStorage } from "./personal-journal-runtime.js";
import { createPersonalMirrorStorage } from "./personal-mirror-storage.js";

let mirrors = null;
export async function initializePersonalMirrors(enabled) {
  if (enabled && !mirrors) mirrors = await createPersonalMirrorStorage();
  return mirrors;
}
export const readPersonalLocalValue = key => mirrors?.owns(key) ? mirrors.getItem(key) : personalJournalStorage().getItem(key);
export const ownsPersonalMirror = key => Boolean(mirrors?.owns(key));
export const writePersonalMirror = (key, raw) => mirrors.write(key, raw);
export const writePersonalMirrorBatch = rows => mirrors.writeBatch(rows);
export const flushPersonalMirrors = scope => mirrors?.flush(scope) || Promise.resolve();
export const personalMirrorDiagnostics = () => mirrors?.diagnostics() || { available: false };

// Read-through view for offline account discovery. Large writes must use the
// explicit async API above; auth preferences retain their existing sync store.
export function personalLocalReadView() {
  if (!mirrors) return typeof localStorage === "undefined" ? null : localStorage;
  return { get length() { return mirrors.keys().length; }, key: index => mirrors.keys()[index] ?? null,
    getItem: readPersonalLocalValue,
    setItem(key, value) {
      if (mirrors.owns(key)) throw Error("Personal mirrors require asynchronous persistence");
      localStorage.setItem(key, value);
    },
    removeItem(key) {
      if (mirrors.owns(key)) throw Error("Personal mirrors cannot be implicitly removed");
      localStorage.removeItem(key);
    } };
}
