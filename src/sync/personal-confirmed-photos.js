import { causalPhotoReferenceForSync } from "../state/causal-photo-reference.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";
import { preparePersonalDeletionBatch } from "./personal-deletion-intent.js";

export const PERSONAL_PHOTO_OWNER_DELETION_ENABLED = false;

// A database-only edit may retain already confirmed assets, never perform a
// hidden attach, copy, delete, reorder or legacy URL-to-asset conversion.
export function preservesConfirmedPersonalPhotos(base, candidate, listId, { userDeletion = null } = {}) {
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
  try {
    // Validate the complete original inventory BEFORE reducing explicit owners.
    // A deleted owner must not hide pending, legacy or cross-list references.
    const original = canonicalListOperationJson(inventory(base));
    const actual = canonicalListOperationJson(inventory(candidate));
    if (original === actual) return true;
    if (!userDeletion) return false;
    const expected = preparePersonalDeletionBatch(base, userDeletion).snapshot;
    if (["items", "containers"].some(collection => Object.keys(base[collection]).some(id =>
      !Object.hasOwn(expected[collection], id) && Object.hasOwn(candidate[collection], id)))) return false;
    // The ordinary reducer preserves items and independently reusable nested
    // bags. Their photos must survive unchanged, including order and metadata.
    return canonicalListOperationJson(inventory(expected)) === actual;
  }
  catch { return false; }
}

// Only the active causal dispatch chain matters here. A previousLocalOperationId
// is a historical checkpoint link, not permission to dispatch that old form.
// Records must come from the validated scoped outbox; this adds the file guard,
// it does not replace its receipt, fork, revision or server-side checks.
export function preservesConfirmedPersonalPhotoChain({ records, operationId, listId, allowOwnerDeletion = false, confirmedBoundary = null }) {
  try {
    if (!Array.isArray(records) || !records.length || !operationId) return false;
    const byId = new Map(records.map(record => [record.action.operationId, record]));
    if (byId.size !== records.length) return false;
    if (confirmedBoundary && (confirmedBoundary.listId !== listId || !byId.has(confirmedBoundary.operationId)
      || !Number.isSafeInteger(confirmedBoundary.stateRevision) || confirmedBoundary.stateRevision < 1
      || !preservesConfirmedPersonalPhotos(confirmedBoundary.payload, confirmedBoundary.payload, listId))) return false;
    const visited = new Set();
    let record = byId.get(operationId);
    if (!record) return false;
    while (record) {
      const { action } = record, parentId = action.body.causal?.baseOperationId;
      if (action.operationId === confirmedBoundary?.operationId) return action.listId === listId;
      if (visited.has(action.operationId) || action.kind !== "list.update" || action.listId !== listId) return false;
      visited.add(action.operationId);
      const parent = parentId ? byId.get(parentId) : null;
      if (parentId && !parent) return false;
      const boundaryParent = confirmedBoundary && parentId === confirmedBoundary.operationId;
      const parentPayload = boundaryParent ? confirmedBoundary.payload : parent?.action.body.payload;
      const base = record.mergeBase?.payload || parentPayload;
      if (record.mergeBase && parent && canonicalListOperationJson(base) !== canonicalListOperationJson(parentPayload)) return false;
      if (boundaryParent && record.mergeBase?.stateRevision !== confirmedBoundary.stateRevision) return false;
      if (!preservesConfirmedPersonalPhotos(base, action.body.payload, listId,
        { userDeletion: allowOwnerDeletion ? action.body.userDeletion : null })) return false;
      record = parent;
    }
    return true;
  } catch { return false; }
}
