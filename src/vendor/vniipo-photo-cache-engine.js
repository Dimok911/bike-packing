const clean = (value) => String(value || "").trim();

const normalizedConcurrency = (value, total) =>
  Math.max(1, Math.min(Number(value) || 1, Math.max(1, total)));

const recordId = (record) => clean(record?.id || record?.key);

const taskIdentity = (task) => `${clean(task?.namespace)}\u0000${clean(task?.key)}`;

export function photoCacheSourceSignature(fullUrl = "", thumbUrl = "", version = "") {
  return [clean(fullUrl), clean(thumbUrl), clean(version)].join("|");
}

export function normalizePhotoTask(task = {}) {
  const key = clean(task.key || task.id);
  const fullUrl = clean(task.fullUrl);
  const thumbUrl = clean(task.thumbUrl || task.fullUrl);
  const sourceSignature = clean(task.sourceSignature || task.signature);
  return {
    ...task,
    key,
    namespace: clean(task.namespace || "default"),
    fullUrl,
    thumbUrl,
    sourceSignature,
    signature: sourceSignature,
  };
}

export function normalizePhotoTasks(tasks) {
  const result = [];
  const seen = new Set();
  for (const candidate of Array.isArray(tasks) ? tasks : []) {
    const task = normalizePhotoTask(candidate);
    if (!task.key) continue;
    const identity = `${taskIdentity(task)}\u0000${task.sourceSignature}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(task);
  }
  return result;
}

export function cachedPhotoMatchesTask(cached, candidate) {
  if (!cached || !candidate) return false;
  const task = normalizePhotoTask(candidate);
  return clean(cached.sourceSignature) === task.sourceSignature;
}

export function cachedPhotoPreview(cached, task) {
  if (!cachedPhotoMatchesTask(cached, task)) return null;
  return cached.thumbBlob
    || (cached.fullBlobVerified !== true ? cached.blob : null)
    || cached.blob
    || null;
}

export function cachedPhotoVerifiedFull(cached, task) {
  return cachedPhotoMatchesTask(cached, task)
    && cached?.blob
    && cached.fullBlobVerified === true
    ? cached.blob
    : null;
}

const canAdoptUnversionedFull = (cached, task) => Boolean(
  task.allowUnversionedVerifiedFull
  && !clean(cached?.sourceSignature)
  && task.sourceSignature
  && cached?.blob
  && cached.fullBlobVerified === true
);

const defaultRecord = (task, cached, patch, now) => ({
  ...(cached || {}),
  ...patch,
  id: task.key,
  sourceSignature: task.sourceSignature,
  namespace: task.namespace,
  createdAt: cached?.createdAt || now,
  updatedAt: now,
});

const buildRecord = (task, cached, patch, { now, decorateRecord }) => {
  const base = defaultRecord(task, cached, patch, now);
  return typeof decorateRecord === "function"
    ? decorateRecord(task, cached, base)
    : base;
};

async function runWorkers(tasks, concurrency, visit) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      await visit(task);
    }
  };
  await Promise.all(Array.from(
    { length: normalizedConcurrency(concurrency, tasks.length) },
    () => worker(),
  ));
}

async function fetchPhotoBlob(url, {
  fetchImpl,
  timeoutMs,
  requestInit,
  signal,
} = {}) {
  if (!url || typeof fetchImpl !== "function" || signal?.aborted) return null;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const abort = () => controller?.abort();
  signal?.addEventListener?.("abort", abort, { once: true });
  const timer = controller && timeoutMs > 0
    ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetchImpl(url, {
      credentials: "include",
      cache: "no-store",
      ...(requestInit || {}),
      ...(controller ? { signal: controller.signal } : signal ? { signal } : {}),
    });
    if (!response?.ok) return null;
    const blob = await response.blob();
    return blob?.size ? blob : null;
  } catch {
    return null;
  } finally {
    if (timer) globalThis.clearTimeout(timer);
    signal?.removeEventListener?.("abort", abort);
  }
}

const matchingMemoryRecord = (task, getMemoryRecord) => {
  if (typeof getMemoryRecord !== "function") return null;
  const record = getMemoryRecord(task);
  return cachedPhotoMatchesTask(record, task) ? record : null;
};

export async function hydrateNormalizedPhotoTasks(tasks, {
  getCachedPhoto = async () => null,
  putCachedPhoto = async () => {},
  getMemoryRecord,
  onRecord = () => {},
  decorateRecord,
  concurrency = 6,
  isCurrent = () => true,
  now = () => new Date().toISOString(),
} = {}) {
  const queue = normalizePhotoTasks(tasks);
  const result = { total: queue.length, hydrated: 0, stale: 0, missing: 0, memory: 0 };
  await runWorkers(queue, concurrency, async (task) => {
    if (!isCurrent()) return;
    const memory = matchingMemoryRecord(task, getMemoryRecord);
    const memoryPreview = cachedPhotoPreview(memory, task);
    const memoryFull = cachedPhotoVerifiedFull(memory, task);
    if (memoryFull) {
      result.hydrated += 1;
      result.memory += 1;
      await onRecord(task, memory, {
        previewBlob: memoryPreview || memoryFull,
        fullBlob: memoryFull,
      });
      return;
    }
    const cached = await getCachedPhoto(task.key).catch(() => null);
    if (!isCurrent()) return;
    if (!cached) {
      if (memoryPreview) {
        result.hydrated += 1;
        result.memory += 1;
        await onRecord(task, memory, { previewBlob: memoryPreview, fullBlob: null });
        return;
      }
      result.missing += 1;
      return;
    }
    if (!cachedPhotoMatchesTask(cached, task)) {
      if (canAdoptUnversionedFull(cached, task)) {
        const adopted = buildRecord(task, cached, {}, { now: now(), decorateRecord });
        await putCachedPhoto(adopted);
        if (!isCurrent()) return;
        result.hydrated += 1;
        await onRecord(task, adopted, {
          previewBlob: adopted.thumbBlob || adopted.blob,
          fullBlob: adopted.blob,
        });
        return;
      }
      result.stale += 1;
      return;
    }
    const previewBlob = cachedPhotoPreview(cached, task);
    const fullBlob = cachedPhotoVerifiedFull(cached, task);
    if (!previewBlob && !fullBlob) {
      result.missing += 1;
      return;
    }
    result.hydrated += 1;
    await onRecord(task, cached, { previewBlob: previewBlob || fullBlob, fullBlob });
  });
  return result;
}

async function cacheNormalizedPhotoTask(task, options) {
  const {
    fetchImpl,
    getCachedPhoto,
    putCachedPhoto,
    getMemoryRecord,
    onRecord,
    onPending,
    timeoutMs,
    requestInit,
    signal,
    blobsAreDistinct,
    decorateRecord,
    now,
    isCurrent,
  } = options;
  const memory = matchingMemoryRecord(task, getMemoryRecord);
  if (cachedPhotoVerifiedFull(memory, task)) {
    await onRecord(task, memory, {
      previewBlob: cachedPhotoPreview(memory, task) || memory.blob,
      fullBlob: memory.blob,
    });
    return "cached";
  }
  const cached = await getCachedPhoto(task.key).catch(() => null);
  if (!isCurrent() || signal?.aborted) return "failed";
  const sourceMatches = cachedPhotoMatchesTask(cached, task);
  const verifiedFull = cachedPhotoVerifiedFull(cached, task);
  if (!sourceMatches && canAdoptUnversionedFull(cached, task)) {
    const adopted = buildRecord(task, cached, {}, { now: now(), decorateRecord });
    await putCachedPhoto(adopted);
    if (!isCurrent()) return "failed";
    await onRecord(task, adopted, {
      previewBlob: adopted.thumbBlob || adopted.blob,
      fullBlob: adopted.blob,
    });
    return "cached";
  }
  if (sourceMatches && (cachedPhotoPreview(cached, task) || verifiedFull)) {
    await onRecord(task, cached, {
      previewBlob: cachedPhotoPreview(cached, task) || verifiedFull,
      fullBlob: verifiedFull,
    });
  }
  if (verifiedFull) return "cached";
  if (!task.fullUrl && !task.thumbUrl) {
    return sourceMatches && cachedPhotoPreview(cached, task) ? "cached" : "failed";
  }

  onPending();
  const matchingPreview = sourceMatches ? cachedPhotoPreview(cached, task) : null;
  const fullPromise = task.fullUrl
    ? fetchPhotoBlob(task.fullUrl, { fetchImpl, timeoutMs, requestInit, signal })
    : Promise.resolve(null);
  const shouldFetchThumb = task.thumbUrl
    && task.thumbUrl !== task.fullUrl
    && !matchingPreview;
  const thumbPromise = shouldFetchThumb
    ? fetchPhotoBlob(task.thumbUrl, { fetchImpl, timeoutMs, requestInit, signal })
    : Promise.resolve(null);
  const downloadedThumb = await thumbPromise;
  if (!isCurrent() || signal?.aborted) return "failed";
  const previewBlob = downloadedThumb || matchingPreview || null;
  const savedAt = now();

  if (downloadedThumb) {
    const previewRecord = buildRecord(task, sourceMatches ? cached : null, {
      blob: null,
      thumbBlob: downloadedThumb,
      fullBlobVerified: false,
      fullBlobDistinct: false,
      fileName: task.fileName,
      type: downloadedThumb.type || task.type,
      size: 0,
      width: task.width,
      height: task.height,
    }, { now: savedAt, decorateRecord });
    await putCachedPhoto(previewRecord);
    if (!isCurrent()) return "failed";
    await onRecord(task, previewRecord, { previewBlob: downloadedThumb, fullBlob: null });
  }

  const fullBlob = await fullPromise;
  if (!isCurrent() || signal?.aborted) return "failed";
  if (!task.fullUrl) return downloadedThumb ? "downloaded" : matchingPreview ? "cached" : "failed";
  if (!fullBlob) return "failed";
  const finalPreviewBlob = previewBlob || fullBlob;
  const fullBlobDistinct = task.thumbUrl && task.thumbUrl !== task.fullUrl
    ? await blobsAreDistinct(fullBlob, finalPreviewBlob)
    : true;
  const fullRecord = buildRecord(task, sourceMatches ? cached : null, {
    blob: fullBlob,
    thumbBlob: finalPreviewBlob,
    fullBlobVerified: true,
    fullBlobDistinct,
    fileName: task.fileName,
    type: fullBlob.type || finalPreviewBlob.type || task.type,
    size: fullBlob.size || 0,
    width: task.width,
    height: task.height,
  }, { now: savedAt, decorateRecord });
  await putCachedPhoto(fullRecord);
  if (!isCurrent()) return "failed";
  await onRecord(task, fullRecord, { previewBlob: finalPreviewBlob, fullBlob });
  return "downloaded";
}

export async function cacheNormalizedPhotoTasks(tasks, {
  fetchImpl = globalThis.fetch,
  getCachedPhoto = async () => null,
  putCachedPhoto = async () => {},
  getMemoryRecord,
  onRecord = () => {},
  onPending = () => {},
  blobsAreDistinct = async (fullBlob, thumbBlob) => fullBlob !== thumbBlob,
  decorateRecord,
  concurrency = 2,
  timeoutMs = 30_000,
  requestInit,
  signal,
  isCurrent = () => true,
  now = () => new Date().toISOString(),
} = {}) {
  const queue = normalizePhotoTasks(tasks);
  const result = { total: queue.length, cached: 0, downloaded: 0, failed: 0 };
  if (!queue.length) return result;
  let pendingReported = false;
  await runWorkers(queue, concurrency, async (task) => {
    const status = await cacheNormalizedPhotoTask(task, {
      fetchImpl,
      getCachedPhoto,
      putCachedPhoto,
      getMemoryRecord,
      onRecord,
      onPending: () => {
        if (pendingReported) return;
        pendingReported = true;
        onPending(queue.length);
      },
      timeoutMs,
      requestInit,
      signal,
      blobsAreDistinct,
      decorateRecord,
      now,
      isCurrent,
    }).catch(() => "failed");
    result[status] += 1;
  });
  return result;
}

export function photoTaskFingerprint(tasks) {
  return normalizePhotoTasks(tasks)
    .map((task) => `${taskIdentity(task)}\u0000${task.sourceSignature}`)
    .sort()
    .join("\n");
}

export async function reconcileNormalizedPhotoTasks(tasks, {
  listCachedPhotos = async () => [],
  deleteCachedPhoto = async () => {},
  onDelete = () => {},
  namespaces,
} = {}) {
  const queue = normalizePhotoTasks(tasks);
  const active = new Set(queue.map(taskIdentity));
  const managedNamespaces = new Set(
    Array.isArray(namespaces) && namespaces.length
      ? namespaces.map(clean)
      : queue.map((task) => task.namespace),
  );
  const records = await listCachedPhotos().catch(() => []);
  const deleted = [];
  for (const record of Array.isArray(records) ? records : []) {
    const namespace = clean(record?.namespace || "default");
    const key = recordId(record);
    if (!key || !managedNamespaces.has(namespace) || active.has(`${namespace}\u0000${key}`)) continue;
    await deleteCachedPhoto(key, record);
    deleted.push(record);
    await onDelete(record);
  }
  return { active: active.size, deleted: deleted.length, records: deleted };
}

const blobKey = (key, sourceSignature, variant) =>
  `${clean(key)}\u0000${clean(sourceSignature)}\u0000${variant === "full" ? "full" : "preview"}`;

const recordKey = (key, sourceSignature) => `${clean(key)}\u0000${clean(sourceSignature)}`;

export function createScopedPhotoBlobUrlRegistry({
  createObjectUrl = (blob) => URL.createObjectURL(blob),
  revokeObjectUrl = (url) => URL.revokeObjectURL(url),
} = {}) {
  const urls = new Map();
  const records = new Map();
  let scope = "";
  let generation = 0;
  let ready = false;

  const removeUrl = (key) => {
    const entry = urls.get(key);
    if (!entry) return;
    revokeObjectUrl(entry.url);
    urls.delete(key);
  };
  const removeRecord = (key) => {
    for (const variant of ["preview", "full"]) removeUrl(`${key}\u0000${variant}`);
    records.delete(key);
  };
  const ensure = (key, signature, variant, blob) => {
    if (!clean(key) || !blob) return "";
    const identity = blobKey(key, signature, variant);
    const existing = urls.get(identity);
    if (existing?.blob === blob) return existing.url;
    if (existing) removeUrl(identity);
    const url = createObjectUrl(blob);
    urls.set(identity, { blob, url });
    return url;
  };
  const setRecord = (candidate, record) => {
    const task = normalizePhotoTask(candidate);
    if (!task.key || !cachedPhotoMatchesTask(record, task)) return null;
    const identity = recordKey(task.key, task.sourceSignature);
    records.set(identity, record);
    const previewBlob = cachedPhotoPreview(record, task);
    const fullBlob = cachedPhotoVerifiedFull(record, task);
    if (previewBlob) ensure(task.key, task.sourceSignature, "preview", previewBlob);
    if (fullBlob) ensure(task.key, task.sourceSignature, "full", fullBlob);
    return record;
  };
  const clear = () => {
    for (const key of [...urls.keys()]) removeUrl(key);
    records.clear();
    ready = false;
  };

  return {
    activateScope(nextScope) {
      const normalized = clean(nextScope || "default");
      generation += 1;
      if (normalized !== scope) clear();
      scope = normalized;
      ready = false;
      return generation;
    },
    currentScope: () => scope,
    currentGeneration: () => generation,
    isCurrent: (candidate) => Number(candidate) === generation,
    setReady(value = true) { ready = Boolean(value); },
    isReady: () => ready,
    ensure,
    setRecord,
    getRecord(candidate, sourceSignature) {
      const task = typeof candidate === "object"
        ? normalizePhotoTask(candidate)
        : normalizePhotoTask({ key: candidate, sourceSignature });
      return records.get(recordKey(task.key, task.sourceSignature)) || null;
    },
    get(key, sourceSignature, variant = "preview") {
      return urls.get(blobKey(key, sourceSignature, variant))?.url || "";
    },
    sources(key, sourceSignature) {
      return {
        preview: urls.get(blobKey(key, sourceSignature, "preview"))?.url || "",
        full: urls.get(blobKey(key, sourceSignature, "full"))?.url || "",
      };
    },
    reconcile(tasks) {
      const active = new Set(normalizePhotoTasks(tasks)
        .map((task) => recordKey(task.key, task.sourceSignature)));
      for (const key of [...records.keys()]) {
        if (!active.has(key)) removeRecord(key);
      }
    },
    remove(key, sourceSignature) {
      removeRecord(recordKey(key, sourceSignature));
    },
    clear,
    size: () => records.size,
    urlCount: () => urls.size,
  };
}

export function createPhotoCacheRunController({
  getTasks = () => [],
  isEnabled = () => true,
  runTasks = cacheNormalizedPhotoTasks,
  getRunOptions = () => ({}),
  retryDelaysMs = [5_000, 15_000, 45_000],
  onChange = () => {},
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
} = {}) {
  let running = false;
  let active = false;
  let failed = false;
  let lastFingerprint = "";
  let rerunRequested = false;
  let retryTimer = null;
  let retryAttempt = 0;
  let retryFingerprint = "";

  const publish = () => onChange({ running, active, failed });
  const clearRetry = () => {
    if (retryTimer !== null) clearTimer(retryTimer);
    retryTimer = null;
    retryAttempt = 0;
    retryFingerprint = "";
  };
  const scheduleRetry = (fingerprint) => {
    if (!fingerprint || retryTimer !== null || retryAttempt >= retryDelaysMs.length) return;
    if (retryFingerprint && retryFingerprint !== fingerprint) clearRetry();
    retryFingerprint = fingerprint;
    const delay = Math.max(0, Number(retryDelaysMs[retryAttempt]) || 0);
    retryAttempt += 1;
    retryTimer = setTimer(() => {
      retryTimer = null;
      Promise.resolve().then(() => run(true));
    }, delay);
    retryTimer?.unref?.();
  };
  const run = async (force = false) => {
    if (!isEnabled()) return null;
    const tasks = normalizePhotoTasks(getTasks());
    const fingerprint = photoTaskFingerprint(tasks);
    if (!fingerprint || (!force && fingerprint === lastFingerprint)) return null;
    if (running) {
      rerunRequested = true;
      return null;
    }
    running = true;
    lastFingerprint = fingerprint;
    publish();
    try {
      const result = await runTasks(tasks, {
        ...getRunOptions(),
        onPending: () => {
          active = true;
          publish();
        },
      });
      failed = Number(result?.failed) > 0;
      if (failed) scheduleRetry(fingerprint);
      else clearRetry();
      return result;
    } catch {
      failed = true;
      scheduleRetry(fingerprint);
      return { total: tasks.length, cached: 0, downloaded: 0, failed: tasks.length || 1 };
    } finally {
      running = false;
      active = false;
      publish();
      if (rerunRequested) {
        rerunRequested = false;
        Promise.resolve().then(() => run());
      }
    }
  };

  return {
    schedule: ({ force = false } = {}) => {
      if (force) clearRetry();
      return Promise.resolve().then(() => run(force));
    },
    cancelRetries: clearRetry,
    isRunning: () => running,
    hasFailures: () => failed,
  };
}

export const PHOTO_CACHE_ENGINE_VERSION = "1.0.0";
export const PHOTO_CACHE_ENGINE_CONTRACT_VERSION = 1;
