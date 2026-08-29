import {
  API_BASE,
  API_TIMEOUT_MS
} from "../config/constants.js";

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

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  let response;
  try {
    response = await fetchImpl(`${apiBase}/bike-packing/image-source`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: normalizedSource }),
      ...(controller ? { signal: controller.signal } : {})
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  if (response?.ok || ![401, 403, 404].includes(Number(response?.status || 0))) return response;

  // Guests and older API deployments can still import sources that explicitly
  // allow browser-side CORS. Authenticated users normally use the protected
  // server fetch above, which also preserves the original GIF bytes.
  return fetchImpl(normalizedSource, { cache: "no-store" });
}
