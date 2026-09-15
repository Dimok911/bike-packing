import { PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY } from "../config/constants.js";

// Pressure is local to this page and this storage object. A later page may
// cache public templates again; required writes still have the same fallback.
const pressured = new WeakSet();
export function noteStoragePressure(storage, error) {
  if (!["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"].includes(error?.name)) return false;
  if (storage && ["object", "function"].includes(typeof storage)) pressured.add(storage);
  return true;
}
export const canPersistOptionalStorage = storage => !pressured.has(storage);

// Only a renewable public-template cache may be evicted. Never enumerate or
// touch personal state, original operations, archives, drafts or photo files.
// The caller retains responsibility for verifying this exact required write.
export function setRequiredStorageItem(storage, key, raw) {
  try { return storage.setItem(key, raw); }
  catch (original) {
    if (!noteStoragePressure(storage, original) || key === PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY) throw original;
    try {
      if (storage.getItem(PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY) === null) throw original;
      storage.removeItem(PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY);
      if (storage.getItem(PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY) !== null) throw original;
    } catch { throw original; }
    // Synchronous, exactly once, with the original key and bytes. A second
    // failure propagates; no new operation or replacement data is constructed.
    return storage.setItem(key, raw);
  }
}
