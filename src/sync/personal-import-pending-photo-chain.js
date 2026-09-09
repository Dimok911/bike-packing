import { personalArchiveJson } from "./personal-archive-import-protocol.js";
import { assertPersonalGuestImportRecord } from "./personal-guest-import-outbox-record.js";
import { assertPersonalArchivePhotoRecord } from "./personal-archive-photo-outbox-record.js";
import { personalGuestPhotoResultReference, isPersonalPendingGuestUpdate } from "./personal-pending-guest-update.js";
import { personalArchivePhotoResultReference, isPersonalPendingArchiveUpdate } from "./personal-pending-archive-update.js";
import { assertPersonalPhotoFormRecord } from "./personal-photo-form-outbox-record.js";
import { personalFormPhotoResultReference, isPersonalPendingFormUpdate } from "./personal-pending-form-update.js";

const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const payloadOf = record => record.photoState?.payload || record.action.body.payload;
const rootKind = record => record.action.kind === "list.import" && (record.action.body.guestImport?.version === 1 ? "guest"
  : record.action.body.archiveImport?.version === 2 ? "archive" : null);

// Prove exact retained ancestry. Guest and archive imports cannot substitute
// for one another, a public copy, or an unrelated accepted photo owner.
export function personalImportPendingPhotoFormChain({ records, operationId, listId, entityType, entityId }) {
  try {
    const byId = new Map(records.map(record => [record.action.operationId, record]));
    if (byId.size !== records.length) return null;
    const seen = new Set(), reverse = []; let record = byId.get(operationId);
    while (record) {
      const { action } = record, body = action.body;
      if (seen.has(action.operationId) || action.listId !== listId) return null;
      seen.add(action.operationId); reverse.push(record);
      if (rootKind(record)) break;
      if (action.kind === "list.update" ? ![3, 4, 9].includes(body.photoResults?.version)
        : action.kind !== "photos.mutate" || body.action !== "form" || body.ownerResult?.version !== 3
          || body.ownerResult.operationId !== body.causal?.baseOperationId) return null;
      record = byId.get(body.causal?.baseOperationId);
    }
    if (!record) return null;
    const steps = reverse.reverse(), root = steps[0], importKind = rootKind(root);
    (importKind === "guest" ? assertPersonalGuestImportRecord : assertPersonalArchivePhotoRecord)(root);
    const importOperationId = root.action.operationId, forms = [root]; let previous = root, source = root;
    for (const step of steps.slice(1)) {
      const action = step.action, body = action.body, deps = body.causal?.dependsOn, basePayload = payloadOf(previous);
      if (["actorId", "environment", "scopeKey", "listId"].some(key => action[key] !== root.action[key])
        || action.generation !== previous.action.generation + 1 || body.causal?.baseOperationId !== previous.action.operationId
        || !Array.isArray(deps) || ![previous.action.operationId, importOperationId].every(id => deps.some(dep => dep.operationId === id && dep.listId === listId))
        || step.mergeBase && !same(step.mergeBase.payload, basePayload)) return null;
      if (action.kind === "photos.mutate") {
        const form = assertPersonalPhotoFormRecord(step), ref = form.ownerResult;
        if (form.copySource || ref?.version !== 3 || ref.importOperationId !== importOperationId || ref.importKind !== importKind
          || ref.operationId !== previous.action.operationId || !same(step.mergeBase.payload, basePayload)) return null;
        forms.push(step); source = step;
      } else {
        const imported = source === root;
        const reference = imported ? (importKind === "guest" ? personalGuestPhotoResultReference : personalArchivePhotoResultReference)(source)
          : personalFormPhotoResultReference(source);
        const validate = imported ? importKind === "guest" ? isPersonalPendingGuestUpdate : isPersonalPendingArchiveUpdate : isPersonalPendingFormUpdate;
        if (step.photoState || !same(body.photoResults, reference)
          || !deps.some(dep => dep.operationId === source.action.operationId && dep.listId === listId)
          || !validate({ source, basePayload, payload: body.payload, userDeletion: body.userDeletion, listId })) return null;
      }
      previous = step;
    }
    const selectedType = entityType ?? (source === root ? undefined : source.action.body.entityType);
    const selectedId = entityId ?? (source === root ? undefined : source.action.body.entityId);
    if (selectedType !== undefined || selectedId !== undefined) {
      const collection = selectedType === "item" ? "items" : selectedType === "container" ? "containers" : null;
      if (!collection || typeof selectedId !== "string" || !payloadOf(previous)[collection]?.[selectedId]) return null;
    }
    return { root, source, head: previous, forms, steps, importOperationId, importKind, entityType: selectedType, entityId: selectedId };
  } catch { return null; }
}
