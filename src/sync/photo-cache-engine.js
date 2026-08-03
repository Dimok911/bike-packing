function normalizedConcurrency(value, total) {
  return Math.max(1, Math.min(Number(value) || 1, Math.max(1, total)));
}

export function cachedPhotoMatchesTask(cached, task) {
  if (!cached || !task) return false;
  if (!task.sourceSignature) return true;
  return cached.sourceSignature === task.sourceSignature;
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
    () => worker()
  ));
}

export async function hydrateNormalizedPhotoTasks(tasks, {
  getCachedPhoto = async () => null,
  putCachedPhoto = async () => {},
  onRecord = () => {},
  concurrency = 6
} = {}) {
  const normalizedTasks = Array.isArray(tasks) ? tasks : [];
  const result = { total: normalizedTasks.length, hydrated: 0, stale: 0, missing: 0 };
  await runWorkers(normalizedTasks, concurrency, async (task) => {
    const cached = await getCachedPhoto(task.key).catch(() => null);
    if (!cached) {
      result.missing += 1;
      return;
    }
    if (!cachedPhotoMatchesTask(cached, task)) {
      if (
        task.allowUnversionedVerifiedFull
        && !cached.sourceSignature
        && cached.blob
        && cached.fullBlobVerified === true
      ) {
        const adopted = {
          ...cached,
          id: task.key,
          sourceSignature: task.sourceSignature,
          cachePurpose: cached.cachePurpose || task.cachePurpose || "offline-remote",
          updatedAt: new Date().toISOString()
        };
        await putCachedPhoto(adopted);
        result.hydrated += 1;
        await onRecord(task, adopted, {
          previewBlob: adopted.thumbBlob || adopted.blob,
          fullBlob: adopted.blob
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

async function cacheNormalizedPhotoTask(task, {
  fetchImpl,
  getCachedPhoto,
  putCachedPhoto,
  onRecord,
  onPending,
  timeoutMs,
  blobsAreDistinct
}) {
  const cached = await getCachedPhoto(task.key).catch(() => null);
  const sourceMatches = cachedPhotoMatchesTask(cached, task);
  const verifiedFull = cachedPhotoVerifiedFull(cached, task);
  if (
    !sourceMatches
    && task.allowUnversionedVerifiedFull
    && !cached?.sourceSignature
    && cached?.blob
    && cached.fullBlobVerified === true
  ) {
    const adopted = {
      ...cached,
      id: task.key,
      sourceSignature: task.sourceSignature,
      cachePurpose: cached.cachePurpose || task.cachePurpose || "offline-remote",
      updatedAt: new Date().toISOString()
    };
    await putCachedPhoto(adopted);
    await onRecord(task, adopted, {
      previewBlob: adopted.thumbBlob || adopted.blob,
      fullBlob: adopted.blob
    });
    return "cached";
  }
  if (sourceMatches && (cachedPhotoPreview(cached, task) || verifiedFull)) {
    await onRecord(task, cached, {
      previewBlob: cachedPhotoPreview(cached, task) || verifiedFull,
      fullBlob: verifiedFull
    });
  }
  if (verifiedFull) return "cached";
  if (!task.fullUrl && !task.thumbUrl) return sourceMatches && cachedPhotoPreview(cached, task)
    ? "cached"
    : "failed";

  onPending();
  const matchingPreview = sourceMatches ? cachedPhotoPreview(cached, task) : null;
  const fullBlobPromise = task.fullUrl
    ? fetchPhotoBlob(task.fullUrl, { fetchImpl, timeoutMs })
    : Promise.resolve(null);
  const shouldFetchThumb = task.thumbUrl
    && task.thumbUrl !== task.fullUrl
    && !matchingPreview;
  const thumbBlobPromise = shouldFetchThumb
    ? fetchPhotoBlob(task.thumbUrl, { fetchImpl, timeoutMs })
    : Promise.resolve(null);
  const downloadedThumb = await thumbBlobPromise;
  const previewBlob = downloadedThumb || matchingPreview || null;
  const savedAt = new Date().toISOString();

  if (downloadedThumb) {
    const previewRecord = {
      ...(sourceMatches ? cached : {}),
      id: task.key,
      blob: null,
      thumbBlob: downloadedThumb,
      fullBlobVerified: false,
      fullBlobDistinct: false,
      fileName: task.fileName,
      type: downloadedThumb.type || task.type,
      size: 0,
      width: task.width,
      height: task.height,
      sourceSignature: task.sourceSignature,
      cachePurpose: task.cachePurpose || "offline-remote",
      createdAt: sourceMatches && cached?.createdAt ? cached.createdAt : savedAt,
      updatedAt: savedAt
    };
    await putCachedPhoto(previewRecord);
    await onRecord(task, previewRecord, { previewBlob: downloadedThumb, fullBlob: null });
  }

  const fullBlob = await fullBlobPromise;
  if (!task.fullUrl) return downloadedThumb ? "downloaded" : matchingPreview ? "cached" : "failed";
  if (!fullBlob) return "failed";
  const finalPreviewBlob = previewBlob || fullBlob;
  const fullBlobDistinct = task.thumbUrl && task.thumbUrl !== task.fullUrl
    ? await blobsAreDistinct(fullBlob, finalPreviewBlob)
    : true;
  const fullRecord = {
    ...(sourceMatches ? cached : {}),
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
    sourceSignature: task.sourceSignature,
    cachePurpose: task.cachePurpose || "offline-remote",
    createdAt: sourceMatches && cached?.createdAt ? cached.createdAt : savedAt,
    updatedAt: savedAt
  };
  await putCachedPhoto(fullRecord);
  await onRecord(task, fullRecord, { previewBlob: finalPreviewBlob, fullBlob });
  return "downloaded";
}

export async function cacheNormalizedPhotoTasks(tasks, {
  fetchImpl = globalThis.fetch,
  getCachedPhoto = async () => null,
  putCachedPhoto = async () => {},
  onRecord = () => {},
  onPending = () => {},
  blobsAreDistinct = async (fullBlob, thumbBlob) => fullBlob !== thumbBlob,
  concurrency = 2,
  timeoutMs = 30000
} = {}) {
  const normalizedTasks = Array.isArray(tasks) ? tasks : [];
  if (!normalizedTasks.length) return { total: 0, cached: 0, downloaded: 0, failed: 0 };
  const result = { total: normalizedTasks.length, cached: 0, downloaded: 0, failed: 0 };
  let pendingReported = false;
  await runWorkers(normalizedTasks, concurrency, async (task) => {
    const reportPending = () => {
      if (pendingReported) return;
      pendingReported = true;
      onPending(normalizedTasks.length);
    };
    const status = await cacheNormalizedPhotoTask(task, {
      fetchImpl,
      getCachedPhoto,
      putCachedPhoto,
      onRecord,
      onPending: reportPending,
      timeoutMs,
      blobsAreDistinct
    }).catch(() => "failed");
    result[status] += 1;
  });
  return result;
}
