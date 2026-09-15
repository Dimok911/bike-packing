import { PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY } from "../config/constants.js";

// Content-size estimate only: localStorage does not expose its actual quota
// or disk usage. Never return keys, values, identities or authentication data.
export function readPersonalRecoveryStorageDiagnostics(storage) {
  const unavailable = { available: false };
  try {
    const length = storage?.length;
    if (!Number.isSafeInteger(length) || length < 0) return unavailable;
    const result = { available: true, estimate: "utf16-key-and-value-bytes", totalBytes: 0,
      personalQueueBytes: 0, recoveryBytes: 0, transportJournalBytes: 0, publicCacheBytes: 0, otherBytes: 0 };
    const seen = new Set();
    for (let index = 0; index < length; index++) {
      const key = storage.key(index);
      if (typeof key !== "string" || seen.has(key)) return unavailable;
      seen.add(key);
      const value = storage.getItem(key);
      if (typeof value !== "string") return unavailable;
      const bytes = 2 * (key.length + value.length);
      const category = key.startsWith("bike-packing-personal-save-v1:") ? "personalQueueBytes"
        : key.startsWith("bike-packing-personal-ordinary-recovery-v1:") ? "recoveryBytes"
          : key.startsWith("bike-packing-experiment-uncertain-write-v1:") ? "transportJournalBytes"
            : key === PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY ? "publicCacheBytes" : "otherBytes";
      result[category] += bytes; result.totalBytes += bytes;
      if (!Number.isSafeInteger(result.totalBytes)) return unavailable;
    }
    if (storage.length !== length) return unavailable;
    return result;
  } catch { return unavailable; }
}

export function formatPersonalRecoveryStorageBytes(bytes, language = "ru") {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return language === "en" ? "unavailable" : "недоступно";
  if (bytes < 1024) return `${bytes} ${language === "en" ? "B" : "Б"}`;
  const megabytes = bytes >= 1024 * 1024;
  const amount = (bytes / (megabytes ? 1024 * 1024 : 1024)).toFixed(2);
  return `${language === "en" ? amount : amount.replace(".", ",")} ${megabytes ? "MiB" : "KiB"}`;
}
