import { normalizeRemotePhotoUrl, remotePhotoSourceFromRecord } from "./photos.js";
import { photoBlobsAreDistinct, photoCacheSourceSignature } from "./photo-cache-quality.js";
import {
  cacheNormalizedPhotoTasks,
  hydrateNormalizedPhotoTasks,
  reconcileNormalizedPhotoTasks
} from "./photo-cache-engine.js";

const OFFLINE_REMOTE_PHOTO_NAMESPACE = "offline-remote";

function decorateBikepackingCacheRecord(task, cached, record) {
  return {
    ...record,
    cachePurpose: cached?.cachePurpose || task.cachePurpose || OFFLINE_REMOTE_PHOTO_NAMESPACE
  };
}

function photoUrl(photo, variant) {
  if (!photo || typeof photo !== "object") return "";
  const source = variant === "thumb"
    ? (photo.thumbUrl || photo.thumb_url || photo.thumbnailUrl || photo.thumbnail_url || photo.thumb || "")
    : (photo.url || photo.fileUrl || photo.file_url || photo.src || photo.href || "");
  return normalizeRemotePhotoUrl(source);
}

function photoCacheKey(photo) {
  const localId = String(photo?.localId || "").trim();
  if (localId) return localId;
  const id = String(photo?.id || photo?.photoId || "").trim();
  if (id) return id;
  return String(remotePhotoSourceFromRecord(photo).sourcePhotoId || "").trim();
}

function photoSourceSignature(photo, fullUrl, thumbUrl) {
  return photoCacheSourceSignature(fullUrl, thumbUrl, photo?.updatedAt || photo?.updated_at || "");
}

export function collectOfflinePhotoCacheTasks(targetState) {
  const tasks = [];
  const seen = new Set();
  const visit = (record) => {
    (Array.isArray(record?.photos) ? record.photos : []).forEach((photo) => {
      const key = photoCacheKey(photo);
      const localId = String(photo?.localId || "").trim();
      const fullUrl = photoUrl(photo, "file");
      const thumbUrl = photoUrl(photo, "thumb") || fullUrl;
      if (!key || (!fullUrl && !thumbUrl)) return;
      const signature = photoSourceSignature(photo, fullUrl, thumbUrl);
      if (seen.has(key)) return;
      seen.add(key);
      tasks.push({
        key,
        fullUrl: fullUrl || thumbUrl,
        thumbUrl,
        hasFullSource: Boolean(fullUrl),
        hasDistinctThumbSource: Boolean(fullUrl && thumbUrl && fullUrl !== thumbUrl),
        signature,
        sourceSignature: signature,
        namespace: OFFLINE_REMOTE_PHOTO_NAMESPACE,
        cachePurpose: "offline-remote",
        allowUnversionedVerifiedFull: Boolean(localId && key === localId),
        fileName: String(photo.fileName || `${key}.jpg`),
        type: String(photo.type || "image/jpeg"),
        width: Number.isFinite(Number(photo.width)) ? Number(photo.width) : 0,
        height: Number.isFinite(Number(photo.height)) ? Number(photo.height) : 0
      });
    });
  };
  Object.values(targetState?.items || {}).forEach(visit);
  Object.values(targetState?.containers || {}).forEach(visit);
  return tasks;
}

export function collectPhotoHydrationTasks(targetState) {
  const tasks = [];
  const seen = new Set();
  const visit = (record) => {
    (Array.isArray(record?.photos) ? record.photos : []).forEach((photo) => {
      const key = photoCacheKey(photo);
      const localId = String(photo?.localId || "").trim();
      if (!key) return;
      const fullUrl = photoUrl(photo, "file");
      const thumbUrl = photoUrl(photo, "thumb") || fullUrl;
      const sourceSignature = fullUrl
        ? photoSourceSignature(photo, fullUrl, thumbUrl)
        : "";
      const identity = `${key}|${sourceSignature}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      tasks.push({
        key,
        sourceSignature,
        namespace: OFFLINE_REMOTE_PHOTO_NAMESPACE,
        cachePurpose: "offline-remote",
        allowUnversionedVerifiedFull: Boolean(localId && key === localId)
      });
    });
  };
  Object.values(targetState?.items || {}).forEach(visit);
  Object.values(targetState?.containers || {}).forEach(visit);
  return tasks;
}

export function offlinePhotoCacheFingerprint(targetState) {
  return collectOfflinePhotoCacheTasks(targetState)
    .map((task) => `${task.key}|${task.signature}`)
    .sort()
    .join("\n");
}

export async function cacheRemotePhotosForOffline(targetState, {
  fetchImpl = globalThis.fetch,
  getCachedPhoto = async () => null,
  putCachedPhoto = async () => {},
  getMemoryRecord,
  concurrency = 2,
  timeoutMs = 30000,
  onPending = () => {},
  onRecord = () => {}
} = {}) {
  const tasks = collectOfflinePhotoCacheTasks(targetState).map((task) => ({
    ...task,
    fullUrl: task.hasFullSource ? task.fullUrl : ""
  }));
  return cacheNormalizedPhotoTasks(tasks, {
    fetchImpl,
    getCachedPhoto,
    putCachedPhoto,
    getMemoryRecord,
    concurrency,
    timeoutMs,
    onPending,
    onRecord,
    blobsAreDistinct: photoBlobsAreDistinct,
    decorateRecord: decorateBikepackingCacheRecord
  });
}

export function createOfflinePhotoRenderCoordinator({
  getState = () => null,
  getScopeKey = () => "guest",
  getCachedPhoto = async () => null,
  putCachedPhoto = async () => {},
  listCachedPhotos = async () => [],
  deleteCachedPhoto = async () => {},
  onScopeChange = () => {},
  objectUrls
} = {}) {
  let preparedFingerprint = "";
  let pendingFingerprint = "";
  let pendingRun = null;
  let generation = 0;

  const fingerprint = (targetState, scopeKey) => collectPhotoHydrationTasks(targetState)
    .map((task) => `${task.key}|${task.sourceSignature}`)
    .sort()
    .join(`\n${scopeKey}|`);

  const activateScope = (scopeKey = getScopeKey()) => {
    generation += 1;
    onScopeChange(scopeKey);
    objectUrls?.activateScope?.(scopeKey);
    preparedFingerprint = "";
    pendingFingerprint = "";
    pendingRun = null;
  };

  const prepare = async () => {
    const targetState = getState();
    const scopeKey = String(getScopeKey() || "guest");
    if (objectUrls?.currentScope?.() !== scopeKey) activateScope(scopeKey);
    const tasks = collectPhotoHydrationTasks(targetState);
    const nextFingerprint = `${scopeKey}|${fingerprint(targetState, scopeKey)}`;
    if (objectUrls?.isReady?.() && preparedFingerprint === nextFingerprint) return null;
    if (pendingRun && pendingFingerprint === nextFingerprint) return pendingRun;
    objectUrls?.setReady?.(false);
    pendingFingerprint = nextFingerprint;
    const runGeneration = generation;
    pendingRun = (async () => {
      await hydrateNormalizedPhotoTasks(tasks, {
        getCachedPhoto: (id) => getCachedPhoto(id, scopeKey),
        putCachedPhoto: (record) => putCachedPhoto(record, scopeKey),
        getMemoryRecord: (task) => objectUrls?.getRecord?.(task),
        decorateRecord: decorateBikepackingCacheRecord,
        isCurrent: () => runGeneration === generation,
        onRecord: (task, record) => {
          if (runGeneration !== generation) return;
          objectUrls?.setRecord?.(task, record);
        }
      });
      if (runGeneration !== generation) return null;
      objectUrls?.reconcile?.(tasks);
      await reconcileNormalizedPhotoTasks(tasks, {
        namespaces: [OFFLINE_REMOTE_PHOTO_NAMESPACE],
        listCachedPhotos: async () => (await listCachedPhotos(scopeKey).catch(() => []))
          .map((record) => ({
            ...record,
            namespace: record?.namespace || record?.cachePurpose || ""
          })),
        deleteCachedPhoto: (id) => deleteCachedPhoto(id, scopeKey)
      });
      preparedFingerprint = nextFingerprint;
      objectUrls?.setReady?.(true);
      return { total: tasks.length };
    })().catch((error) => {
      if (runGeneration === generation) {
        preparedFingerprint = nextFingerprint;
        objectUrls?.setReady?.(true);
      }
      throw error;
    }).finally(() => {
      if (runGeneration === generation && pendingFingerprint === nextFingerprint) {
        pendingRun = null;
        pendingFingerprint = "";
      }
    });
    return pendingRun;
  };

  return {
    activateScope,
    isReady: () => {
      const scopeKey = String(getScopeKey() || "guest");
      const currentFingerprint = `${scopeKey}|${fingerprint(getState(), scopeKey)}`;
      return Boolean(objectUrls?.isReady?.()) && preparedFingerprint === currentFingerprint;
    },
    prepare
  };
}

export function createOfflinePhotoCacheController({
  getState = () => null,
  isEnabled = () => true,
  getProgressMessage = () => "",
  getFailureMessage = () => "",
  onChange = () => {},
  cachePhotos = cacheRemotePhotosForOffline,
  cacheOptions = {},
  getCacheOptions = () => cacheOptions,
  retryDelaysMs = [5000, 15000, 45000],
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (timer) => globalThis.clearTimeout(timer)
} = {}) {
  let running = false;
  let active = false;
  let failed = false;
  let lastAttemptFingerprint = "";
  let rerunRequested = false;
  let retryTimer = null;
  let retryAttempt = 0;
  let retryFingerprint = "";

  const clearRetry = () => {
    if (retryTimer !== null) clearTimer(retryTimer);
    retryTimer = null;
    retryAttempt = 0;
    retryFingerprint = "";
  };
  const scheduleRetry = (fingerprint) => {
    const delays = Array.isArray(retryDelaysMs) ? retryDelaysMs : [];
    if (!fingerprint || retryTimer !== null || retryAttempt >= delays.length) return;
    if (retryFingerprint && retryFingerprint !== fingerprint) clearRetry();
    retryFingerprint = fingerprint;
    const delay = Math.max(0, Number(delays[retryAttempt]) || 0);
    retryAttempt += 1;
    retryTimer = setTimer(() => {
      retryTimer = null;
      Promise.resolve().then(() => run(true));
    }, delay);
    retryTimer?.unref?.();
  };

  const setActive = (next) => {
    if (active === next) return;
    active = next;
    onChange(active);
  };
  const setFailed = (next) => {
    if (failed === next) return;
    failed = next;
    onChange(active);
  };

  const run = async (force = false) => {
    if (!isEnabled()) return null;
    const targetState = getState();
    const fingerprint = offlinePhotoCacheFingerprint(targetState);
    if (!fingerprint || (!force && fingerprint === lastAttemptFingerprint)) return null;
    if (running) {
      rerunRequested = true;
      return null;
    }
    running = true;
    lastAttemptFingerprint = fingerprint;
    try {
      const result = await cachePhotos(targetState, {
        ...getCacheOptions(),
        onPending: () => setActive(true)
      });
      const hasFailures = Number(result?.failed) > 0;
      setFailed(hasFailures);
      if (hasFailures) scheduleRetry(fingerprint);
      else clearRetry();
      return result;
    } catch {
      setFailed(true);
      scheduleRetry(fingerprint);
      return { total: 0, cached: 0, downloaded: 0, failed: 1 };
    } finally {
      running = false;
      setActive(false);
      if (rerunRequested) {
        rerunRequested = false;
        Promise.resolve().then(() => run());
      }
    }
  };

  return {
    currentMessage: () => active ? getProgressMessage() : failed ? getFailureMessage() : "",
    isRunning: () => running,
    schedule: ({ force = false } = {}) => {
      if (force) clearRetry();
      return Promise.resolve().then(() => run(force));
    }
  };
}
