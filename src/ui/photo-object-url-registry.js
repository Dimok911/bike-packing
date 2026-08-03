import { createScopedPhotoBlobUrlRegistry } from "../sync/photo-cache-engine.js";

export function photoObjectUrlKey(id, sourceSignature = "") {
  return `${String(id || "").trim()}\u0000${String(sourceSignature || "").trim()}`;
}

export function createPhotoObjectUrlRegistry(options = {}) {
  const registry = createScopedPhotoBlobUrlRegistry(options);

  const ensure = (id, sourceSignature, blob, variant = "preview") => {
    if (!id || !blob) return "";
    const task = { key: id, sourceSignature };
    const current = registry.getRecord(task) || {
      id,
      sourceSignature,
      fullBlobVerified: false
    };
    const record = variant === "full"
      ? { ...current, blob, fullBlobVerified: true }
      : { ...current, thumbBlob: blob };
    registry.setRecord(task, record);
    return registry.get(id, sourceSignature, variant);
  };

  return {
    activateScope: registry.activateScope,
    currentScope: registry.currentScope,
    currentGeneration: registry.currentGeneration,
    isCurrent: registry.isCurrent,
    get(id, sourceSignature = "", variant = "preview") {
      return registry.get(id, sourceSignature, variant);
    },
    sources(id, sourceSignature = "") {
      return registry.sources(id, sourceSignature);
    },
    getRecord(task, sourceSignature = "") {
      return typeof task === "object"
        ? registry.getRecord(task)
        : registry.getRecord(task, sourceSignature);
    },
    setRecord(task, record) {
      return registry.setRecord(task, record);
    },
    ensure,
    reconcile(tasks) {
      registry.reconcile(tasks);
    },
    remove(id, sourceSignature = "") {
      registry.remove(id, sourceSignature);
    },
    setReady: registry.setReady,
    isReady: registry.isReady,
    clear: registry.clear,
    size: registry.size,
    urlCount: registry.urlCount
  };
}
