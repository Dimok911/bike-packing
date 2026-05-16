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
  const { timeoutMs = API_TIMEOUT_MS, ...fetchOptions } = options;
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
    if (typeof console !== "undefined" && console.warn) {
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
