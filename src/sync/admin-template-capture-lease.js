import { canonicalTemplateJson } from "./admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";

// Keep the existing photo-form lock name so the shared capture fence includes
// append, replacement, creation and fileless editing callers using that key.
const prefix = "bike-packing-admin-template-photo-capture:";
const activeLeases = new WeakMap();
const invalid = () => Object.assign(Error("Сохранение шаблона требует действующей блокировки исходных данных."),
  { code: "admin-template-capture-lease", isAdminTemplateBlocked: true });

function bindingKeys(bindings) {
  if (!Array.isArray(bindings) || !bindings.length) throw invalid();
  try {
    // Validate and detach every binding before requesting the first lock.
    return [...new Set(Array.from(bindings, binding => prefix + canonicalTemplateJson(adminTemplatePhotoActionBinding(binding))))].sort();
  } catch { throw invalid(); }
}

// This proves only current lock coverage. Callers still verify account/context,
// immutable snapshots and both durable journals under these locks. A nested
// caller validates the same lease instead of requesting a held lock again.
export function assertAdminTemplateCaptureLease(lease, bindings) {
  const covered = activeLeases.get(lease);
  if (!covered || bindingKeys(bindings).some(key => !covered.has(key))) throw invalid();
  return true;
}

export async function withAdminTemplateCapture({ bindings, locks } = {}, task) {
  const keys = bindingKeys(bindings);
  if (typeof locks?.request !== "function" || typeof task !== "function") throw invalid();
  const request = locks.request.bind(locks);
  const acquire = index => index < keys.length ? request(keys[index], () => acquire(index + 1)) : run();
  const run = async () => {
    const lease = Object.freeze(Object.create(null));
    activeLeases.set(lease, new Set(keys));
    try { return await task(lease); }
    finally { activeLeases.delete(lease); }
  };
  return await acquire(0);
}
