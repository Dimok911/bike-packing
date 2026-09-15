import { setRequiredStorageItem } from "../utils/storage-pressure.js";

// Preserve synchronous legacy callers. The experiment adapter explicitly
// returns a Promise, and success is exposed only after durable readback.
export function writeJournalValue(storage, key, raw, assertCurrent = () => {}) {
  assertCurrent();
  return storage.writeRequired ? storage.writeRequired(key, raw, { assertCurrent })
    : setRequiredStorageItem(storage, key, raw);
}

export function afterJournalWrite(write, done, failed = error => { throw error; }) {
  let result;
  try { result = write(); } catch (error) { return failed(error); }
  return result?.then ? result.then(done, failed) : done(result);
}
