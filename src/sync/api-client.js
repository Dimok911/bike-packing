import {
  API_BASE,
  API_TIMEOUT_MS
} from "../config/constants.js";

export function isNetworkError(error) {
  return Boolean(error?.isNetworkError);
}

export function isTimeoutError(error) {
  return Boolean(error?.isTimeoutError);
}

export function isTemporaryServerStorageError(error) {
  const message = `${error?.message || ""} ${error?.data?.error || ""} ${error?.data?.message || ""}`;
  return /out of sort memory|sort buffer/i.test(message);
}

export function createNetworkError(message, cause = null, options = {}) {
  const networkError = new Error(message);
  networkError.isNetworkError = true;
  if (options.timeout) networkError.isTimeoutError = true;
  networkError.cause = cause;
  return networkError;
}

export function apiErrorMessage(error) {
  return String(
    error?.data?.message ||
    error?.data?.error ||
    error?.data?.code ||
    error?.message ||
    "unknown error"
  );
}

export async function apiFetchRequest(path, options = {}, { isForcedOffline = () => false } = {}) {
  if (isForcedOffline()) {
    throw createNetworkError("принудительный офлайн-режим");
  }
  if ("onLine" in navigator && !navigator.onLine) {
    throw createNetworkError("нет соединения с сервером");
  }
  const { timeoutMs = API_TIMEOUT_MS, silentErrors = false, ...fetchOptions } = options;
  const isFormDataBody = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      credentials: "include",
      cache: fetchOptions.cache || "no-store",
      signal: controller.signal,
      headers: {
        ...(fetchOptions.body && !isFormDataBody ? { "Content-Type": "application/json" } : {}),
        ...(fetchOptions.headers || {})
      }
    });
  } catch (error) {
    const timeout = error?.name === "AbortError";
    const message = timeout ? "сервер не ответил вовремя" : "нет соединения с сервером";
    throw createNetworkError(message, error, { timeout });
  } finally {
    window.clearTimeout(timeoutId);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    const apiError = new Error(data?.message || data?.error || data?.code || `HTTP ${response.status}`);
    apiError.status = response.status;
    apiError.data = data;
    apiError.path = path;
    apiError.method = fetchOptions.method || "GET";
    if (!silentErrors && typeof console !== "undefined" && console.warn) {
      console.warn("[bike-packing] API error", {
        method: apiError.method,
        path,
        status: response.status,
        response: data
      });
    }
    throw apiError;
  }
  return data;
}

export function apiUploadFormDataRequest(
  path,
  {
    body,
    headers = {},
    method = "POST",
    timeoutMs = API_TIMEOUT_MS,
    silentErrors = false,
    onUploadProgress = null,
    stalledUploadTimeoutMs = 0
  } = {},
  { isForcedOffline = () => false } = {}
) {
  if (isForcedOffline()) {
    return Promise.reject(createNetworkError("принудительный офлайн-режим"));
  }
  if ("onLine" in navigator && !navigator.onLine) {
    return Promise.reject(createNetworkError("нет соединения с сервером"));
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let stalledUploadTimer = null;
    let lastUploadLoaded = -1;
    const clearStalledUploadTimer = () => {
      if (!stalledUploadTimer) return;
      clearTimeout(stalledUploadTimer);
      stalledUploadTimer = null;
    };
    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      clearStalledUploadTimer();
      resolve(value);
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      clearStalledUploadTimer();
      reject(error);
    };
    const scheduleStalledUploadTimer = () => {
      if (!stalledUploadTimeoutMs || stalledUploadTimeoutMs <= 0) return;
      clearStalledUploadTimer();
      stalledUploadTimer = setTimeout(() => {
        const error = createNetworkError("загрузка фото не отвечает", null, { timeout: true });
        error.isUploadStalled = true;
        rejectOnce(error);
        try {
          xhr.abort();
        } catch {
          // The request is already considered failed.
        }
      }, stalledUploadTimeoutMs);
    };
    xhr.open(method, `${API_BASE}${path}`, true);
    xhr.withCredentials = true;
    xhr.timeout = timeoutMs;
    Object.entries(headers || {}).forEach(([name, value]) => {
      if (value !== undefined && value !== null) xhr.setRequestHeader(name, String(value));
    });
    if (typeof onUploadProgress === "function") {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !event.total) return;
        const loaded = Number(event.loaded) || 0;
        if (loaded > lastUploadLoaded) {
          lastUploadLoaded = loaded;
          scheduleStalledUploadTimer();
        }
        onUploadProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
      };
    }
    xhr.onload = () => {
      const data = parseApiJsonResponse(xhr.responseText);
      if (xhr.status < 200 || xhr.status >= 300 || data?.ok === false) {
        const apiError = new Error(data?.message || data?.error || data?.code || `HTTP ${xhr.status}`);
        apiError.status = xhr.status;
        apiError.data = data;
        apiError.path = path;
        apiError.method = method;
        if (!silentErrors && typeof console !== "undefined" && console.warn) {
          console.warn("[bike-packing] API error", {
            method,
            path,
            status: xhr.status,
            response: data
          });
        }
        rejectOnce(apiError);
        return;
      }
      resolveOnce(data);
    };
    xhr.onerror = () => rejectOnce(createNetworkError("нет соединения с сервером"));
    xhr.ontimeout = () => rejectOnce(createNetworkError("сервер не ответил вовремя", null, { timeout: true }));
    xhr.onabort = () => rejectOnce(createNetworkError("загрузка фото отменена"));
    scheduleStalledUploadTimer();
    xhr.send(body);
  });
}

function parseApiJsonResponse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
