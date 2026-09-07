import { canonicalListOperationJson } from "./list-operation-queue.js";

// Explicit keep-current decision only. The retained original file is not
// deleted, rebound to another owner or registered under a replacement UUID.
export function validPersonalPhotoCancellation(record) {
  const decision = record?.reconciliation?.decision, action = record?.action;
  const base = record?.mergeBase, outcomes = record?.reconciliation?.settled;
  return decision?.version === 1 && decision.type === "keep-server-after-rejected-photo"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(decision.photoOperationId || "")
    && Number.isSafeInteger(decision.stateRevision) && decision.stateRevision > 0 && decision.localFilesRetained === true
    && action?.kind === "list.update" && base?.stateRevision === decision.stateRevision
    && action.body?.baseStateRevision === decision.stateRevision && Boolean(base.payload)
    && Array.isArray(outcomes) && outcomes.at(-1)?.operation.state === "rejected"
    && outcomes.some(proof => proof.operation?.id === decision.photoOperationId && proof.operation.kind === "photos.mutate" && proof.operation.state === "rejected")
    && ["assetId", "photoId", "action", "changes", "entityId", "entityType", "expectedPhotoIds", "baseEntityRevision", "source"].every(key => action.body[key] === undefined)
    && canonicalListOperationJson(action.body.payload) === canonicalListOperationJson(base.payload);
}
