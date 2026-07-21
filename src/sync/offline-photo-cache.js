import { normalizeRemotePhotoUrl, remotePhotoSourceFromRecord } from "./photos.js";

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
  return [fullUrl, thumbUrl, String(photo?.updatedAt || photo?.updated_at || "")].join("|");
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
  if (cached?.blob && (!cached.sourceSignature || cached.sourceSignature === task.signature)) {
    return "cached";
  }
  onPending();
  const [fullBlob, thumbBlob] = await Promise.all([
    fetchPhotoBlob(task.fullUrl, { fetchImpl, timeoutMs }),
    task.thumbUrl === task.fullUrl
      ? Promise.resolve(null)
      : fetchPhotoBlob(task.thumbUrl, { fetchImpl, timeoutMs })
  ]);
  const fallbackBlob = fullBlob || thumbBlob;
  if (!fallbackBlob) return "failed";
  const savedAt = new Date().toISOString();
  await putCachedPhoto({
    id: task.key,
    blob: fallbackBlob,
    thumbBlob: thumbBlob || fullBlob,
    fileName: task.fileName,
    type: fallbackBlob.type || task.type,
    size: fallbackBlob.size || 0,
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
  cacheOptions = {}
} = {}) {
  let running = false;
  let active = false;
  let failed = false;
  let lastAttemptFingerprint = "";
  let rerunRequested = false;

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
      setFailed(Number(result?.failed) > 0);
      return result;
    } catch {
      setFailed(true);
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
    schedule: ({ force = false } = {}) => Promise.resolve().then(() => run(force))
  };
}
