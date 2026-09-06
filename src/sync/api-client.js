import {
  API_TIMEOUT_MS
} from "../config/constants.js";
import { experimentTransport } from "./experiment-transport.js";

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

export async function apiFetchRequest(path, options = {}, { isForcedOffline = () => false, transport = experimentTransport } = {}) {
  if (isForcedOffline()) {
    throw createNetworkError("принудительный офлайн-режим");
  }
  const { timeoutMs = API_TIMEOUT_MS, silentErrors = false, ...fetchOptions } = options;
  await transport.prepare();
  transport.assertWritable(path, fetchOptions.method || "GET");
  const writeId = await transport.beginWrite(path, fetchOptions.method || "GET", fetchOptions.body);
  const isFormDataBody = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  const controller = new AbortController();
  let timeoutId;
  let response, data;
  try {
    transport.assertWritable(path, fetchOptions.method || "GET");
  } catch (error) {
    transport.confirmWrite(writeId, { committed: false });
    throw error;
  }
  try {
    // Bound response-body decoding too. Only this settled await may acknowledge
    // the intent; a late response after timeout cannot release the barrier.
    ({ response, data } = await Promise.race([fetch(transport.apiUrl(path), {
      ...fetchOptions,
      credentials: "include",
      cache: fetchOptions.cache || "no-store",
      ...(transport.experiment ? { redirect: "error" } : {}),
      signal: controller.signal,
      headers: {
        ...(fetchOptions.body && !isFormDataBody ? { "Content-Type": "application/json" } : {}),
        ...(fetchOptions.headers || {})
      }
    }).then(async (response) => ({ response, data: await response.json().catch(() => null) })),
    new Promise((resolve, reject) => {
      timeoutId = window.setTimeout(() => {
        controller.abort();
        const error = new Error("Request timed out");
        error.name = "AbortError";
        reject(error);
      }, timeoutMs);
    })]));
  } catch (error) {
    const timeout = error?.name === "AbortError";
    const message = timeout ? "сервер не ответил вовремя" : "нет соединения с сервером";
    throw transport.noteFailure(createNetworkError(message, error, { timeout }), path, fetchOptions.method || "GET", writeId);
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (transport.experiment && data === null && response.ok) {
    throw transport.noteFailure(createNetworkError("Сервер вернул неподтверждённый результат"), path, fetchOptions.method || "GET", writeId);
  }
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
    if ([401, 403].includes(response.status)) transport.confirmWrite(writeId, { committed: false });
    throw transport.noteFailure(apiError, path, fetchOptions.method || "GET", writeId);
  }
  transport.confirmWrite(writeId);
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
  { isForcedOffline = () => false, transport = experimentTransport } = {}
) {
  if (isForcedOffline()) {
    return Promise.reject(createNetworkError("принудительный офлайн-режим"));
  }
  const send = (writeId) => new Promise((resolve, reject) => {
    try {
      transport.assertWritable(path, method);
    } catch (error) {
      transport.confirmWrite(writeId, { committed: false });
      throw error;
    }
    let xhr;
    try { xhr = new XMLHttpRequest(); }
    catch (error) {
      transport.confirmWrite(writeId, { committed: false });
      throw error;
    }
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
      transport.confirmWrite(writeId);
      resolve(value);
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      clearStalledUploadTimer();
      if ([401, 403].includes(error?.status)) transport.confirmWrite(writeId, { committed: false });
      reject(transport.noteFailure(error, path, method, writeId));
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
    try {
      xhr.open(method, transport.apiUrl(path), true);
      xhr.withCredentials = true;
      xhr.timeout = timeoutMs;
      Object.entries(headers || {}).forEach(([name, value]) => {
        if (value !== undefined && value !== null) xhr.setRequestHeader(name, String(value));
      });
    } catch (error) {
      transport.confirmWrite(writeId, { committed: false });
      reject(error);
      return;
    }
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !event.total) return;
      const loaded = Number(event.loaded) || 0;
      if (loaded > lastUploadLoaded) {
        lastUploadLoaded = loaded;
        scheduleStalledUploadTimer();
      }
      if (typeof onUploadProgress === "function") {
        onUploadProgress(Math.max(0, Math.min(99, Math.round((event.loaded / event.total) * 100))));
      }
    };
    xhr.upload.onload = () => {
      lastUploadLoaded = Number.POSITIVE_INFINITY;
      clearStalledUploadTimer();
    };
    xhr.onload = () => {
      if (settled) return;
      if (transport.experiment && xhr.responseURL && xhr.responseURL !== transport.apiUrl(path)) {
        rejectOnce(createNetworkError("Unexpected upload response URL; outcome requires reconciliation"));
        return;
      }
      const data = parseApiJsonResponse(xhr.responseText);
      if (transport.experiment && data === null && xhr.status >= 200 && xhr.status < 300) {
        rejectOnce(createNetworkError("Сервер вернул неподтверждённый результат загрузки"));
        return;
      }
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
    try { xhr.send(body); }
    catch (error) { rejectOnce(createNetworkError("загрузка фото не подтверждена", error)); }
  });
  return transport.experiment
    ? transport.prepare().then(() => transport.beginWrite(path, method, body)).then(send)
    : send(null);
}

function parseApiJsonResponse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
