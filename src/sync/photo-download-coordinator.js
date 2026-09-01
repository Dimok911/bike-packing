import { downloadPhotoBlob } from "./photo-cache-engine.js";

export const PHOTO_DOWNLOAD_PRIORITY = Object.freeze({
  OFFLINE: 10,
  VISIBLE_PREVIEW: 80,
  OPEN_PHOTO: 100
});

function abortError() {
  const error = new Error("Photo download was aborted");
  error.name = "AbortError";
  return error;
}

export function createPhotoDownloadCoordinator({
  download = downloadPhotoBlob,
  maxConcurrent = 3,
  maxBackground = 1
} = {}) {
  const queued = [];
  const tasks = new Map();
  let active = 0;
  let activeBackground = 0;
  let sequence = 0;

  const pump = () => {
    queued.sort((left, right) => right.priority - left.priority || left.sequence - right.sequence);
    while (active < maxConcurrent) {
      const foregroundWaiting = queued.some((task) => !task.background);
      const index = queued.findIndex((task) => (
        !task.background || (!foregroundWaiting && activeBackground < maxBackground)
      ));
      if (index < 0) return;
      const task = queued.splice(index, 1)[0];
      task.started = true;
      active += 1;
      if (task.background) activeBackground += 1;
      download(task.url, {
        fetchImpl: task.fetchImpl,
        requestInit: task.requestInit,
        timeoutMs: task.timeoutMs,
        onProgress: (progress) => {
          task.progressListeners.forEach((listener) => listener(progress));
        }
      }).then(task.resolve, task.reject).finally(() => {
        active -= 1;
        if (task.background) activeBackground -= 1;
        tasks.delete(task.key);
        pump();
      });
    }
  };

  const sharedTask = (url, {
    key = String(url || ""),
    priority = PHOTO_DOWNLOAD_PRIORITY.VISIBLE_PREVIEW,
    background = false,
    fetchImpl = globalThis.fetch,
    requestInit,
    timeoutMs = 30_000,
    onProgress
  } = {}) => {
    let task = tasks.get(key);
    if (!task) {
      let resolve;
      let reject;
      const promise = new Promise((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
      });
      task = {
        key,
        url,
        priority: Number(priority) || 0,
        background: Boolean(background),
        fetchImpl,
        requestInit,
        timeoutMs,
        sequence: sequence += 1,
        progressListeners: new Set(),
        promise,
        resolve,
        reject,
        started: false
      };
      tasks.set(key, task);
      queued.push(task);
    } else if (!task.started) {
      task.priority = Math.max(task.priority, Number(priority) || 0);
      if (!background) task.background = false;
    }
    if (typeof onProgress === "function") task.progressListeners.add(onProgress);
    pump();
    return task;
  };

  const downloadShared = (url, options = {}) => {
    if (!url) return Promise.reject(new TypeError("A photo URL is required"));
    const task = sharedTask(url, options);
    const { signal, onProgress } = options;
    if (!signal) return task.promise;
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const abort = () => {
        if (typeof onProgress === "function") task.progressListeners.delete(onProgress);
        reject(abortError());
      };
      signal.addEventListener("abort", abort, { once: true });
      task.promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  };

  return {
    download: downloadShared,
    snapshot: () => ({
      active,
      activeBackground,
      queued: queued.length,
      shared: tasks.size
    })
  };
}
