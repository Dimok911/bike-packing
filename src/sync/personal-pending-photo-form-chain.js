import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertPersonalPhotoFormRecord } from "./personal-photo-form-outbox-record.js";
import { assertPersonalPhotoFormCandidate } from "./personal-photo-form-protocol.js";
import { personalFormPhotoResultReference, isPersonalPendingFormUpdate } from "./personal-pending-form-update.js";
import { personalPublicPendingPhotoFormChain } from "./personal-public-pending-photo-chain.js";
import { personalImportPendingPhotoFormChain } from "./personal-import-pending-photo-chain.js";

const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const payloadOf = record => record.photoState?.payload || record.action.body.payload;

// Proves every local step between the original file-owning form and the head.
// Checkpoints, timestamps, UUID ordering and matching owner IDs are not edges.
export function personalPendingPhotoFormChain({ records, operationId, listId, entityType, entityId, allowNewOwner = false }) {
  if (allowNewOwner) return personalImportPendingPhotoFormChain({ records, operationId, listId, entityType, entityId, allowNewOwner });
  const publicChain = personalPublicPendingPhotoFormChain({ records, operationId, listId, entityType, entityId });
  if (publicChain) return publicChain;
  const importChain = personalImportPendingPhotoFormChain({ records, operationId, listId, entityType, entityId });
  if (importChain) return importChain;
  try {
    const byId = new Map(records.map(record => [record.action.operationId, record]));
    if (byId.size !== records.length) return null;
    const seen = new Set(), reverse = []; let record = byId.get(operationId);
    while (record) {
      const { action } = record, body = action.body;
      if (seen.has(action.operationId) || action.listId !== listId) return null;
      seen.add(action.operationId); reverse.push(record);
      if (action.kind === "photos.mutate" && body.action === "form" && !Object.hasOwn(body, "ownerResult")) break;
      if (action.kind === "list.update" ? ![5, 6].includes(body.photoResults?.version)
        : action.kind !== "photos.mutate" || body.action !== "form" || body.ownerResult?.operationId !== body.causal?.baseOperationId) return null;
      record = byId.get(body.causal?.baseOperationId);
    }
    if (!record) return null;
    const steps = reverse.reverse(), root = steps[0], rootManifest = assertPersonalPhotoFormRecord(root);
    if (rootManifest.copySource || rootManifest.ownerResult) return null;
    for (const collection of ["items", "containers"]) for (const owner of Object.values(root.mergeBase.payload[collection] || {})) {
      if ((owner.photos || []).some(photo => photo.status !== "synced")) return null;
    }
    const forms = [root]; let previous = root, source = root;
    for (const step of steps.slice(1)) {
      const action = step.action, body = action.body, deps = body.causal?.dependsOn, basePayload = payloadOf(previous);
      if (["actorId", "environment", "scopeKey", "listId"].some(key => action[key] !== root.action[key])
        || action.generation !== previous.action.generation + 1 || body.causal?.baseOperationId !== previous.action.operationId
        || !Array.isArray(deps) || !deps.some(dep => dep.operationId === previous.action.operationId && dep.listId === listId)
        || step.mergeBase && !same(step.mergeBase.payload, basePayload)) return null;
      if (action.kind === "photos.mutate") {
        const form = assertPersonalPhotoFormRecord(step);
        if (form.ownerResult?.version !== 1 || form.copySource || form.entityType !== rootManifest.entityType || form.entityId !== rootManifest.entityId
          || form.ownerResult.operationId !== previous.action.operationId) return null;
        assertPersonalPhotoFormCandidate({ body, basePayload, payload: step.photoState.payload, listId });
        forms.push(step); source = step;
      } else {
        if (step.photoState || !same(body.photoResults, personalFormPhotoResultReference(source))
          || !deps.some(dep => dep.operationId === source.action.operationId && dep.listId === listId)
          || !isPersonalPendingFormUpdate({ source, basePayload, payload: body.payload, userDeletion: body.userDeletion, listId })) return null;
      }
      previous = step;
    }
    return { root, source, head: previous, forms, steps, entityType: rootManifest.entityType, entityId: rootManifest.entityId };
  } catch { return null; }
}
