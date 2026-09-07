import { causalPhotoReferenceForSync } from "../state/causal-photo-reference.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";

// A database-only edit may retain already confirmed assets, never perform a
// hidden attach, copy, delete, reorder or legacy URL-to-asset conversion.
export function preservesConfirmedPersonalPhotos(base, candidate, listId) {
  if (!base || !candidate || typeof listId !== "string" || !listId) return false;
  const inventory = payload => {
    const result = [], ids = new Set(), assets = new Set();
    for (const collection of ["items", "containers"]) {
      if (!payload[collection] || typeof payload[collection] !== "object" || Array.isArray(payload[collection])) throw Error("owners");
      for (const [id, owner] of Object.entries(payload[collection]).sort(([a], [b]) => a.localeCompare(b))) {
        if (!owner || owner.id !== id || Object.hasOwn(owner, "photos") && !Array.isArray(owner.photos)) throw Error("owner");
        for (const [index, photo] of (owner.photos || []).entries()) {
          const reference = causalPhotoReferenceForSync(photo);
          if (!reference || reference.status !== "synced" || reference.listId !== listId || ids.has(reference.id) || assets.has(reference.assetId)
            || canonicalListOperationJson(photo) !== canonicalListOperationJson(reference)) throw Error("unconfirmed");
          ids.add(reference.id); assets.add(reference.assetId);
          result.push({ collection, ownerId: id, index, reference });
        }
      }
    }
    return result;
  };
  try { return canonicalListOperationJson(inventory(base)) === canonicalListOperationJson(inventory(candidate)); }
  catch { return false; }
}

// Only the active causal dispatch chain matters here. A previousLocalOperationId
// is a historical checkpoint link, not permission to dispatch that old form.
// Records must come from the validated scoped outbox; this adds the file guard,
// it does not replace its receipt, fork, revision or server-side checks.
export function preservesConfirmedPersonalPhotoChain({ records, operationId, listId }) {
  try {
    if (!Array.isArray(records) || !records.length || !operationId) return false;
    const byId = new Map(records.map(record => [record.action.operationId, record]));
    if (byId.size !== records.length) return false;
    const visited = new Set();
    let record = byId.get(operationId);
    if (!record) return false;
    while (record) {
      const { action } = record, parentId = action.body.causal?.baseOperationId;
      if (visited.has(action.operationId) || action.kind !== "list.update" || action.listId !== listId) return false;
      visited.add(action.operationId);
      const parent = parentId ? byId.get(parentId) : null;
      if (parentId && !parent) return false;
      const base = record.mergeBase?.payload || parent?.action.body.payload;
      if (record.mergeBase && parent && canonicalListOperationJson(base) !== canonicalListOperationJson(parent.action.body.payload)) return false;
      if (!preservesConfirmedPersonalPhotos(base, action.body.payload, listId)) return false;
      record = parent;
    }
    return true;
  } catch { return false; }
}
