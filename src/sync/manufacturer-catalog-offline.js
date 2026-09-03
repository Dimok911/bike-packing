export const MANUFACTURER_CATALOG_OFFLINE_CACHE = "bike-packing-manufacturer-catalog-offline-v1";

const responseSize = async (response) => {
  const headerSize = Number(response?.headers?.get?.("content-length"));
  if (Number.isFinite(headerSize) && headerSize >= 0) return headerSize;
  try {
    return Number((await response.clone().blob()).size) || 0;
  } catch {
    return 0;
  }
};

export function manufacturerCatalogPreviewUrls(catalog = []) {
  return [...new Set((Array.isArray(catalog) ? catalog : [])
    .map((entry) => entry?.imageUrls?.[0] || entry?.imageUrl || "")
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

export async function manufacturerCatalogOfflineUsage({
  cachesImpl = globalThis.caches
} = {}) {
  if (!cachesImpl?.open) return { available: false, bytes: 0, files: 0 };
  const cache = await cachesImpl.open(MANUFACTURER_CATALOG_OFFLINE_CACHE);
  const requests = await cache.keys();
  let bytes = 0;
  for (const request of requests) {
    const response = await cache.match(request);
    bytes += await responseSize(response);
  }
  return { available: requests.length > 0, bytes, files: requests.length };
}

export async function browserStorageEstimate({
  storageManager = globalThis.navigator?.storage
} = {}) {
  if (!storageManager?.estimate) return { available: 0, persisted: false, quota: 0, usage: 0 };
  const persistedResult = typeof storageManager.persisted === "function"
    ? storageManager.persisted().catch(() => false)
    : false;
  const [{ quota = 0, usage = 0 } = {}, persisted = false] = await Promise.all([
    storageManager.estimate(),
    persistedResult
  ]);
  return {
    available: Math.max(0, Number(quota) - Number(usage)),
    persisted: Boolean(persisted),
    quota: Math.max(0, Number(quota) || 0),
    usage: Math.max(0, Number(usage) || 0)
  };
}

export async function cacheManufacturerCatalogPreviews(catalog, {
  cachesImpl = globalThis.caches,
  fetchImpl = globalThis.fetch,
  onProgress = () => {},
  storageManager = globalThis.navigator?.storage
} = {}) {
  if (!cachesImpl?.open || typeof fetchImpl !== "function") throw new Error("catalog-offline-unsupported");
  const urls = manufacturerCatalogPreviewUrls(catalog);
  const cache = await cachesImpl.open(MANUFACTURER_CATALOG_OFFLINE_CACHE);
  if (typeof storageManager?.persist === "function") await storageManager.persist().catch(() => false);
  let completed = 0;
  let downloaded = 0;
  let failed = 0;
  let bytes = 0;
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        let response = await cache.match(url);
        if (!response) {
          response = await fetchImpl(url, {
            cache: "reload",
            credentials: "same-origin",
            headers: { "X-Bike-Packing-Offline-Catalog": "1" }
          });
          if (!response?.ok) throw new Error(`catalog-preview-http-${Number(response?.status) || 0}`);
          await cache.put(url, response.clone());
          downloaded += 1;
        }
        const size = await responseSize(response);
        bytes += size;
      } catch {
        failed += 1;
      } finally {
        completed += 1;
        onProgress({ completed, downloaded, failed, total: urls.length });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, urls.length || 1) }, worker));
  return { bytes, downloaded, failed, files: urls.length - failed, total: urls.length };
}

export async function clearManufacturerCatalogOffline({ cachesImpl = globalThis.caches } = {}) {
  if (!cachesImpl?.delete) return false;
  return cachesImpl.delete(MANUFACTURER_CATALOG_OFFLINE_CACHE);
}
