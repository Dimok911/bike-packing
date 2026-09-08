import { canonicalListOperationJson } from "./list-operation-queue.js";
import { preparePersonalDeletionBatch } from "./personal-deletion-intent.js";
import { preservesConfirmedPersonalPhotos } from "./personal-confirmed-photos.js";
import { assertPersonalPhotoFormRecord } from "./personal-photo-form-outbox-record.js";

export const PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED = false;

// Only the immutable linked form can explain a pending reference. Removing
// its owner does not cancel, rewrite or confirm that form or its native files.
export function isPersonalPendingPhotoOwnerDeletion({ parent, payload, userDeletion, listId }) {
  try {
    const form = assertPersonalPhotoFormRecord(parent);
    if (parent.action.listId !== listId || !userDeletion || !form.photos.some(photo => photo.action === "attach")) return false;
    const collection = form.entityType === "item" ? "items" : "containers";
    const expected = preparePersonalDeletionBatch(parent.photoState.payload, userDeletion).snapshot;
    if (Object.hasOwn(expected[collection], form.entityId) || Object.hasOwn(payload[collection], form.entityId)) return false;
    // Validation of the form proves every original/new reference. After its
    // explicit owner deletion, ALL survivors must be confirmed and unchanged.
    return preservesConfirmedPersonalPhotos(expected, payload, listId);
  } catch { return false; }
}

// Resolve the one file-producing predecessor of a DB continuation. Check each
// intermediate step; a later snapshot cannot hide a pending-photo mutation or
// resurrect an owner. Historical checkpoint links are not dispatch parents.
export function personalPendingPhotoOwnerDeletionForm({ records, operationId, listId }) {
  try {
    const byId = new Map(records.map(record => [record.action.operationId, record]));
    if (byId.size !== records.length) return null;
    const visited = new Set(), successors = [];
    let record = byId.get(operationId);
    while (record) {
      const { action } = record;
      if (visited.has(action.operationId) || action.kind !== "list.update" || action.listId !== listId) return null;
      visited.add(action.operationId);
      successors.push(action.body.payload);
      const parent = byId.get(action.body.causal?.baseOperationId);
      if (!parent || parent.action.listId !== listId) return null;
      const base = parent.photoState?.payload || parent.action.body.payload;
      if (record.mergeBase && canonicalListOperationJson(record.mergeBase.payload) !== canonicalListOperationJson(base)) return null;
      if (parent.action.kind === "photos.mutate") {
        if (!isPersonalPendingPhotoOwnerDeletion({ parent, payload: action.body.payload, userDeletion: action.body.userDeletion, listId })) return null;
        const collection = parent.action.body.entityType === "item" ? "items" : "containers";
        return successors.every(payload => !Object.hasOwn(payload[collection], parent.action.body.entityId)) ? parent : null;
      }
      if (!preservesConfirmedPersonalPhotos(base, action.body.payload, listId, { userDeletion: action.body.userDeletion })) return null;
      // Confirmed-photo preservation alone cannot catch a resurrection of the
      // now photo-less owner. Its tombstone is also enforced by the server.
      record = parent;
    }
    return null;
  } catch { return null; }
}
