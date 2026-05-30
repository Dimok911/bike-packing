export function createPublicTemplatePayloadCache({
  cloneValue = (value) => value,
  normalizePayload = (value) => value,
  now = () => Date.now(),
  ttlMs = 60_000
} = {}) {
  const cache = new Map();
  const stamp = (value = "") => String(value || "").trim();

  function get(key, { updatedAt = "" } = {}) {
    const entry = cache.get(String(key || ""));
    if (!entry?.payload) return null;
    const expectedUpdatedAt = stamp(updatedAt);
    if (expectedUpdatedAt) {
      return entry.updatedAt === expectedUpdatedAt ? cloneValue(entry.payload) : null;
    }
    return now() - entry.cachedAt <= ttlMs ? cloneValue(entry.payload) : null;
  }

  function set(key, payload, { updatedAt = "" } = {}) {
    const normalized = normalizePayload(payload);
    if (!normalized) return null;
    cache.set(String(key || ""), {
      cachedAt: now(),
      payload: cloneValue(normalized),
      updatedAt: stamp(updatedAt)
    });
    return cloneValue(normalized);
  }

  return { get, set };
}
