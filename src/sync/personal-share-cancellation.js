import { canonicalListOperationJson } from "./list-operation-queue.js";
import { preservesConfirmedPersonalPhotos } from "./personal-confirmed-photos.js";

// A stored user decision may close the rejected chain, never recreate its
// disclosure choice against a different source or reuse its operation ID.
export function validPersonalShareCancellation(record, records) {
  const decision = record?.reconciliation?.decision, action = record?.action;
  const base = record?.mergeBase, outcomes = record?.reconciliation?.settled;
  const original = records?.get(decision?.shareOperationId)?.action;
  return decision?.version === 1 && decision.type === "keep-server-after-rejected-share"
    && Object.keys(decision).length === 5
    && original?.kind === "list.update" && Boolean(original.body.shareLink)
    && Number.isSafeInteger(decision.stateRevision) && decision.stateRevision > 0
    && decision.localFilesRetained === true && action?.kind === "list.update"
    && base?.stateRevision === decision.stateRevision && action.body?.baseStateRevision === decision.stateRevision
    && Boolean(base.payload) && Array.isArray(outcomes) && outcomes.at(-1)?.operation.state === "rejected"
    && outcomes.some(proof => proof.operation?.id === original.operationId && proof.operation.state === "rejected")
    && Object.keys(action.body).every(key => ["payload", "baseStateRevision", "stateRevision", "baseServerUpdatedAt",
      "force", "forceOverwrite", "fullReplace", "causal"].includes(key))
    && ["force", "forceOverwrite", "fullReplace"].every(key => action.body[key] === false)
    && Array.isArray(action.body.causal?.reads) && action.body.causal.reads.length === 0
    && preservesConfirmedPersonalPhotos(base.payload, action.body.payload, action.listId)
    && canonicalListOperationJson(action.body.payload) === canonicalListOperationJson(base.payload);
}
