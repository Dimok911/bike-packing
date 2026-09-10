import { personalArchiveJson } from "./personal-archive-import-protocol.js";
import { assertPersonalServerImportRecord } from "./personal-server-import-outbox-record.js";
import { personalServerPhotoResultReference, isPersonalPendingServerUpdate } from "./personal-pending-server-update.js";
import { assertPersonalPhotoFormRecord } from "./personal-photo-form-outbox-record.js";
import { personalFormPhotoResultReference, isPersonalPendingFormUpdate } from "./personal-pending-form-update.js";

const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const payloadOf = record => record.photoState?.payload || record.action.body.payload;

// Readers prove the entire retained server ancestry independently of writer
// flags. The caller must gate capture, sending and cancellation separately.
export function personalServerPendingPhotoFormChain({ records, operationId, listId, entityType, entityId, allowNewOwner = false }) {
  try {
    const byId = new Map(records.map(record => [record.action.operationId, record]));
    if (byId.size !== records.length) return null;
    const seen = new Set(), reverse = []; let record = byId.get(operationId);
    while (record) {
      const { action } = record, body = action.body;
      if (seen.has(action.operationId) || action.listId !== listId) return null;
      seen.add(action.operationId); reverse.push(record);
      if (action.kind === "list.import" && [1, 2].includes(body.serverImport?.version)) break;
      if (action.kind === "list.update" ? ![12, 13, 14].includes(body.photoResults?.version)
        : action.kind !== "photos.mutate" || body.action !== "form" || ![6, 7].includes(body.ownerResult?.version)
          || body.ownerResult.operationId !== body.causal?.baseOperationId) return null;
      record = byId.get(body.causal?.baseOperationId);
    }
    if (!record) return null;
    const steps = reverse.reverse(), root = steps[0];
    assertPersonalServerImportRecord(root);
    const serverOperationId = root.action.operationId, forms = [root]; let previous = root, source = root;
    for (const step of steps.slice(1)) {
      const action = step.action, body = action.body, deps = body.causal?.dependsOn, basePayload = payloadOf(previous);
      if (["actorId", "environment", "scopeKey", "listId"].some(key => action[key] !== root.action[key])
        || action.generation !== previous.action.generation + 1 || body.causal?.baseOperationId !== previous.action.operationId
        || !Array.isArray(deps) || ![previous.action.operationId, serverOperationId].every(id => deps.some(dep => dep.operationId === id && dep.listId === listId))
        || step.mergeBase && !same(step.mergeBase.payload, basePayload)) return null;
      if (action.kind === "photos.mutate") {
        const form = assertPersonalPhotoFormRecord(step);
        if (form.copySource || ![6, 7].includes(form.ownerResult?.version) || form.ownerResult.serverOperationId !== serverOperationId
          || form.ownerResult.operationId !== previous.action.operationId || !same(step.mergeBase.payload, basePayload)) return null;
        if (form.ownerResult.version === 7 && steps.slice(0, steps.indexOf(step)).some(prior =>
          payloadOf(prior).items?.[form.entityId] || payloadOf(prior).containers?.[form.entityId])) return null;
        forms.push(step); source = step;
      } else {
        const serverSource = source === root, reference = serverSource ? personalServerPhotoResultReference(source) : personalFormPhotoResultReference(source);
        if (step.photoState || !same(body.photoResults, reference)
          || !deps.some(dep => dep.operationId === source.action.operationId && dep.listId === listId)
          || !(serverSource ? isPersonalPendingServerUpdate : isPersonalPendingFormUpdate)({ source, basePayload,
            payload: body.payload, userDeletion: body.userDeletion, listId })) return null;
      }
      previous = step;
    }
    const selectedType = entityType ?? (source === root ? undefined : source.action.body.entityType);
    const selectedId = entityId ?? (source === root ? undefined : source.action.body.entityId);
    if (selectedType !== undefined || selectedId !== undefined) {
      const collection = selectedType === "item" ? "items" : selectedType === "container" ? "containers" : null;
      if (!collection || typeof selectedId !== "string" || (allowNewOwner
        ? steps.some(step => payloadOf(step).items?.[selectedId] || payloadOf(step).containers?.[selectedId])
        : (entityType !== undefined || entityId !== undefined) && !payloadOf(previous)[collection]?.[selectedId])) return null;
    } else if (allowNewOwner) return null;
    return { root, source, head: previous, forms, steps, serverOperationId, entityType: selectedType, entityId: selectedId };
  } catch { return null; }
}
