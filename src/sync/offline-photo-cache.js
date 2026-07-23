import { normalizeRemotePhotoUrl, remotePhotoSourceFromRecord } from "./photos.js";
import { photoBlobsAreDistinct, photoCacheSourceSignature } from "./photo-cache-quality.js";

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

export function offlinePhotoCacheFingerprint(targetState) {
  return collectOfflinePhotoCacheTasks(targetState)
    .map((task) => `${task.key}|${task.signature}`)
    .sort()
    .join("\n");
}

async function fetchPhotoBlob(url, { fetchImpl, timeoutMs }) {
  if (!url || typeof fetchImpl !== "function") return null;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller && timeoutMs > 0
    ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetchImpl(url, {
      credentials: "include",
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {})
    });
    if (!response?.ok) return null;
    const blob = await response.blob();
    return blob?.size ? blob : null;
  } catch {
    return null;
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
}

async function cacheTask(task, {
  fetchImpl,
  getCachedPhoto,
  putCachedPhoto,
  onPending,
  timeoutMs
}) {
  const cached = await getCachedPhoto(task.key).catch(() => null);
  if (
    cached?.blob
    && cached.fullBlobVerified === true
    && cached.sourceSignature === task.signature
  ) {
    return "cached";
  }
  onPending();
  const fullBlobPromise = task.hasFullSource
    ? fetchPhotoBlob(task.fullUrl, { fetchImpl, timeoutMs })
    : Promise.resolve(null);
  const thumbBlobPromise = task.hasFullSource && task.thumbUrl === task.fullUrl
    ? Promise.resolve(null)
    : fetchPhotoBlob(task.thumbUrl, { fetchImpl, timeoutMs });
  const thumbBlob = await thumbBlobPromise;
  const cachedThumbBlob = cached?.thumbBlob
    || (cached?.fullBlobVerified !== true ? cached?.blob : null);
  const previewBlob = thumbBlob || cachedThumbBlob || null;
  const savedAt = new Date().toISOString();
  if (thumbBlob) {
    const hasVerifiedCachedFull = Boolean(cached?.blob && cached.fullBlobVerified === true);
    await putCachedPhoto({
      ...(cached || {}),
      id: task.key,
      blob: cached?.blob || null,
      thumbBlob: previewBlob,
      fullBlobVerified: hasVerifiedCachedFull,
      fullBlobDistinct: hasVerifiedCachedFull ? cached?.fullBlobDistinct : false,
      fileName: task.fileName,
      type: cached?.type || previewBlob.type || task.type,
      size: cached?.size || 0,
      width: task.width,
      height: task.height,
      sourceSignature: hasVerifiedCachedFull
        ? cached?.sourceSignature || ""
        : task.signature,
      createdAt: cached?.createdAt || savedAt,
      updatedAt: savedAt
    });
  }
  const fullBlob = await fullBlobPromise;
  if (!fullBlob) return "failed";
  const finalPreviewBlob = previewBlob || fullBlob;
  const fullBlobDistinct = !task.hasDistinctThumbSource
    || await photoBlobsAreDistinct(fullBlob, finalPreviewBlob);
  await putCachedPhoto({
    ...(cached || {}),
    id: task.key,
    blob: fullBlob,
    thumbBlob: finalPreviewBlob,
    fullBlobVerified: true,
    fullBlobDistinct,
    fileName: task.fileName,
    type: fullBlob.type || finalPreviewBlob.type || task.type,
    size: fullBlob.size || 0,
    width: task.width,
    height: task.height,
    sourceSignature: task.signature,
    createdAt: cached?.createdAt || savedAt,
    updatedAt: savedAt
  });
  return "downloaded";
}

export async function cacheRemotePhotosForOffline(targetState, {
  fetchImpl = globalThis.fetch,
  getCachedPhoto = async () => null,
  putCachedPhoto = async () => {},
  concurrency = 2,
  timeoutMs = 30000,
  onPending = () => {}
} = {}) {
  const tasks = collectOfflinePhotoCacheTasks(targetState);
  if (!tasks.length) return { total: 0, cached: 0, downloaded: 0, failed: 0 };
  let cursor = 0;
  let pendingReported = false;
  const result = { total: tasks.length, cached: 0, downloaded: 0, failed: 0 };
  const worker = async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      const reportPending = () => {
        if (pendingReported) return;
        pendingReported = true;
        onPending(tasks.length);
      };
      const status = await cacheTask(task, {
        fetchImpl,
        getCachedPhoto,
        putCachedPhoto,
        onPending: reportPending,
        timeoutMs
      }).catch(() => "failed");
      result[status] += 1;
    }
  };
  await Promise.all(Array.from(
    { length: Math.max(1, Math.min(Number(concurrency) || 1, tasks.length)) },
    () => worker()
  ));
  return result;
}

export function createOfflinePhotoCacheController({
  getState = () => null,
  isEnabled = () => true,
  getProgressMessage = () => "",
  getFailureMessage = () => "",
  onChange = () => {},
  cachePhotos = cacheRemotePhotosForOffline,
  cacheOptions = {},
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
        ...cacheOptions,
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
