import {
  API_BASE,
  API_TIMEOUT_MS
} from "../config/constants.js";
import { experimentTransport } from "./experiment-transport.js";

function isRemoteHttpSource(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

export async function fetchClipboardImageSource(source, {
  apiBase = API_BASE,
  fetchImpl = globalThis.fetch,
  timeoutMs = Math.max(API_TIMEOUT_MS, 60000)
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Image download is unavailable.");
  const normalizedSource = String(source || "").trim();
  if (!isRemoteHttpSource(normalizedSource)) return fetchImpl(normalizedSource);

  const useTransport = apiBase === API_BASE;
  let writeId = null;
  if (useTransport) {
    await experimentTransport.prepare();
    experimentTransport.assertWritable("/bike-packing/image-source", "POST");
    writeId = await experimentTransport.beginWrite("/bike-packing/image-source", "POST");
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  let response;
  try {
    response = await fetchImpl(useTransport ? experimentTransport.apiUrl("/bike-packing/image-source") : `${apiBase}/bike-packing/image-source`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      ...(useTransport && experimentTransport.experiment ? { redirect: "error" } : {}),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: normalizedSource }),
      ...(controller ? { signal: controller.signal } : {})
    });
  } catch (error) {
    throw useTransport ? experimentTransport.noteFailure(error, "/bike-packing/image-source", "POST", writeId) : error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  if (useTransport) {
    if (response.status >= 500 || response.status === 408) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw experimentTransport.noteFailure(error, "/bike-packing/image-source", "POST", writeId);
    }
    experimentTransport.confirmWrite(writeId);
    if (experimentTransport.mode === "eu") return response;
  }
  if (response?.ok || ![401, 403, 404].includes(Number(response?.status || 0))) return response;

  // Guests and older API deployments can still import sources that explicitly
  // allow browser-side CORS. Authenticated users normally use the protected
  // server fetch above, which also preserves the original GIF bytes.
  return fetchImpl(normalizedSource, { cache: "no-store" });
}
