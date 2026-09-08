import { preservesConfirmedPersonalPhotos } from "./personal-confirmed-photos.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";

const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const containsPersonalPhotos = value => value !== null && typeof value === "object"
  && Object.entries(value).some(([key, child]) => key === "photos" && Array.isArray(child) && child.length > 0 || containsPersonalPhotos(child));

// This certificate permits only an explicit keep-current decision after an
// exactly settled rejected restore. It cannot authorize replaying the restored
// payload on a new base, nor losing unrelated records in later descendants.
export function validPersonalRestoreCancellation(record) {
  const decision = record?.reconciliation?.decision, action = record?.action;
  const base = record?.mergeBase, outcomes = record?.reconciliation?.settled;
  return decision?.version === 1 && ["keep-server-after-rejected-restore", "keep-server-after-rejected-import"].includes(decision.type)
    && uuid(decision.restoreOperationId) && Number.isSafeInteger(decision.stateRevision) && decision.stateRevision > 0
    && action?.kind === "list.update" && base?.stateRevision === decision.stateRevision
    && action.body?.baseStateRevision === decision.stateRevision && Boolean(base.payload)
    && Array.isArray(outcomes) && outcomes.some(proof => proof.operation?.id === decision.restoreOperationId
      && proof.operation.kind === (decision.type === "keep-server-after-rejected-import" ? "list.import" : "list.restore") && proof.operation.state === "rejected")
    && (!containsPersonalPhotos(action.body.payload) || preservesConfirmedPersonalPhotos(base.payload, action.body.payload, action.listId))
    && canonicalListOperationJson(action.body.payload) === canonicalListOperationJson(base.payload);
}
