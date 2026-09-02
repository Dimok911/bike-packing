import { collectOfflinePhotoCacheTasks } from "./offline-photo-cache.js";

export const OFFLINE_LAYOUT_SELECTION_KEY = "bike-packing-offline-layouts-v1";

export function normalizeOfflineLayoutIds(ids, targetState) {
  const available = new Set(Object.keys(targetState?.layouts || {}));
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter((id) => id && available.has(id)))];
}

export function readOfflineLayoutIds(storage, storageKey, targetState, {
  fallbackLayoutId = ""
} = {}) {
  try {
    const raw = storage?.getItem?.(storageKey);
    if (raw !== null && raw !== undefined && raw !== "") {
      return normalizeOfflineLayoutIds(JSON.parse(raw), targetState);
    }
  } catch {
    // A damaged local preference should fall back to the current layout.
  }
  return normalizeOfflineLayoutIds([fallbackLayoutId], targetState);
}

export function writeOfflineLayoutIds(storage, storageKey, ids, targetState) {
  const normalized = normalizeOfflineLayoutIds(ids, targetState);
  try {
    storage?.setItem?.(storageKey, JSON.stringify(normalized));
  } catch {
    // Storage limits must not make the settings view unusable.
  }
  return normalized;
}

export function offlinePhotoStateForLayouts(targetState, layoutIds, {
  getLayoutContainerIdSet,
  getLayoutItemIdSet
} = {}) {
  const itemIds = new Set();
  const containerIds = new Set();
  normalizeOfflineLayoutIds(layoutIds, targetState).forEach((layoutId) => {
    const layout = targetState?.layouts?.[layoutId];
    getLayoutContainerIdSet?.(targetState, layout)?.forEach?.((id) => containerIds.add(id));
    getLayoutItemIdSet?.(targetState, layout)?.forEach?.((id) => itemIds.add(id));
  });
  return {
    items: Object.fromEntries([...itemIds]
      .filter((id) => targetState?.items?.[id])
      .map((id) => [id, targetState.items[id]])),
    containers: Object.fromEntries([...containerIds]
      .filter((id) => targetState?.containers?.[id])
      .map((id) => [id, targetState.containers[id]]))
  };
}

export function offlineLayoutPhotoCount(targetState, layoutId, helpers) {
  return collectOfflinePhotoCacheTasks(
    offlinePhotoStateForLayouts(targetState, [layoutId], helpers)
  ).length;
}

export function offlinePhotoCacheUsage(records, { purpose = "" } = {}) {
  const filtered = (Array.isArray(records) ? records : []).filter((record) => (
    !purpose || String(record?.cachePurpose || record?.namespace || "") === purpose
  ));
  let bytes = 0;
  let files = 0;
  filtered.forEach((record) => {
    const seen = new Set();
    [record?.blob, record?.thumbBlob].forEach((blob) => {
      if (!blob || seen.has(blob)) return;
      seen.add(blob);
      const size = Math.max(0, Number(blob.size) || 0);
      if (!size) return;
      bytes += size;
      files += 1;
    });
  });
  return { bytes, files, photos: filtered.length };
}

export async function pruneOfflineRemotePhotoCache(targetState, {
  deleteCachedPhoto = async () => {},
  listCachedPhotos = async () => []
} = {}) {
  const allowedKeys = new Set(collectOfflinePhotoCacheTasks(targetState).map((task) => task.key));
  const cached = await listCachedPhotos().catch(() => []);
  const removable = (Array.isArray(cached) ? cached : []).filter((record) => {
    const purpose = String(record?.cachePurpose || record?.namespace || "");
    const key = String(record?.id || record?.key || "").trim();
    return purpose === "offline-remote" && key && !allowedKeys.has(key);
  });
  const removedBytes = offlinePhotoCacheUsage(removable).bytes;
  await Promise.all(removable.map((record) => deleteCachedPhoto(record.id || record.key)));
  return { removed: removable.length, removedBytes, kept: allowedKeys.size };
}
