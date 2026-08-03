export function photoObjectUrlKey(id, sourceSignature = "") {
  return `${String(id || "").trim()}\u0000${String(sourceSignature || "").trim()}`;
}

export function createPhotoObjectUrlRegistry({
  createObjectUrl = (blob) => URL.createObjectURL(blob),
  revokeObjectUrl = (url) => URL.revokeObjectURL(url)
} = {}) {
  const entries = new Map();
  let scopeKey = "";
  let ready = false;

  const remove = (key) => {
    const entry = entries.get(key);
    if (!entry) return;
    revokeObjectUrl(entry.url);
    entries.delete(key);
  };

  return {
    activateScope(nextScopeKey) {
      const next = String(nextScopeKey || "guest");
      if (next !== scopeKey) {
        for (const key of [...entries.keys()]) remove(key);
        scopeKey = next;
      }
      ready = false;
    },
    currentScope: () => scopeKey,
    get(id, sourceSignature = "") {
      return entries.get(photoObjectUrlKey(id, sourceSignature))?.url || "";
    },
    ensure(id, sourceSignature, blob) {
      if (!id || !blob) return "";
      const key = photoObjectUrlKey(id, sourceSignature);
      const existing = entries.get(key);
      if (existing?.blob === blob) return existing.url;
      if (existing) remove(key);
      const url = createObjectUrl(blob);
      entries.set(key, { blob, url, managed: true });
      return url;
    },
    reconcile(activeKeys) {
      const keep = activeKeys instanceof Set ? activeKeys : new Set(activeKeys || []);
      for (const [key, entry] of entries) {
        if (entry.managed && !keep.has(key)) remove(key);
      }
    },
    setReady(value = true) {
      ready = Boolean(value);
    },
    isReady: () => ready,
    clear() {
      for (const key of [...entries.keys()]) remove(key);
      ready = false;
    },
    size: () => entries.size
  };
}
