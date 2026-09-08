import { canonicalListOperationJson } from "./list-operation-queue.js";
import { preparePersonalDeletionBatch } from "./personal-deletion-intent.js";
import { preservesConfirmedPersonalPhotos } from "./personal-confirmed-photos.js";
import { assertPersonalPhotoFormRecord } from "./personal-photo-form-outbox-record.js";

export const PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED = false;
export const PERSONAL_PENDING_PHOTO_COPY_DELETION_CAPABILITY = "personalCausalPhotoCopyDeletionV1";
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const catalogCopy = (owner, type) => {
  const result = clone(owner);
  for (const key of type === "item" ? ["containerId", "parentContainerId"] : ["parentId", "childIds", "itemIds", "order"]) {
    if (Array.isArray(result[key]) ? result[key].length : result[key]) throw Error("Copy acquired a placement");
    delete result[key];
  }
  return result;
};

export function personalPhotoCopyResultReference(form) {
  const manifest = assertPersonalPhotoFormRecord(form);
  if (!manifest.copySource) throw Error("Не подтверждено исходное действие копирования.");
  return { version: 1, operationId: form.action.operationId, entityType: manifest.entityType, entityId: manifest.entityId };
}

// Only this exact copied owner may carry symbolic pending references. Its
// whole frozen field/photo selection is preserved until explicit deletion.
// Every survivor outside it must remain a confirmed, unchanged publication.
export function isPersonalPendingPhotoCopyDeletion({ form, basePayload, payload, userDeletion, listId }) {
  try {
    const reference = personalPhotoCopyResultReference(form);
    if (form.action.listId !== listId || !userDeletion) return false;
    const collection = reference.entityType === "item" ? "items" : "containers";
    const sourceId = form.action.body.copySource.entityId;
    if (!Object.hasOwn(basePayload[collection], sourceId) && Object.hasOwn(payload[collection], sourceId)) return false;
    const expected = preparePersonalDeletionBatch(basePayload, userDeletion).snapshot, actual = clone(payload);
    const expectedOwner = expected[collection]?.[reference.entityId], actualOwner = actual[collection]?.[reference.entityId];
    const original = form.photoState.payload[collection][reference.entityId];
    if (expectedOwner === undefined ? actualOwner !== undefined : !same(catalogCopy(expectedOwner, reference.entityType), catalogCopy(original, reference.entityType))
      || !same(catalogCopy(actualOwner, reference.entityType), catalogCopy(original, reference.entityType))) return false;
    for (const layout of Object.values(actual.layouts || {})) {
      if ((layout.rootContainerIds || []).includes(reference.entityId) || (layout.arrangement?.rootContainerIds || []).includes(reference.entityId)
        || Object.hasOwn(layout.arrangement?.[collection] || {}, reference.entityId)) return false;
    }
    if (expectedOwner) expectedOwner.photos = [];
    if (actualOwner) actualOwner.photos = [];
    return preservesConfirmedPersonalPhotos(expected, actual, listId);
  } catch { return false; }
}

// Historical checkpoint links are not causal parents. Each active edge must
// preserve the same result reference and must depend on the original copy as
// well as its immediate predecessor; no later step can hide a resurrection.
export function personalPendingPhotoCopyDeletionForm({ records, operationId, listId, includeForm = false }) {
  try {
    const byId = new Map(records.map(record => [record.action.operationId, record]));
    if (byId.size !== records.length) return null;
    const visited = new Set(), steps = [];
    let record = byId.get(operationId);
    while (record) {
      const { action } = record;
      if (visited.has(action.operationId) || action.listId !== listId) return null;
      visited.add(action.operationId);
      if (action.kind === "photos.mutate") {
        if (!steps.length && !includeForm) return null;
        const reference = personalPhotoCopyResultReference(record);
        for (const step of steps.reverse()) {
          const child = step.record.action, base = step.parent.photoState?.payload || step.parent.action.body.payload;
          if (!same(child.body.photoResults, reference) || !child.body.causal?.dependsOn?.some(dep => dep.operationId === action.operationId && dep.listId === listId)
            || !child.body.causal.dependsOn.some(dep => dep.operationId === step.parent.action.operationId && dep.listId === listId)
            || step.record.mergeBase && !same(step.record.mergeBase.payload, base)
            || !isPersonalPendingPhotoCopyDeletion({ form: record, basePayload: base, payload: child.body.payload, userDeletion: child.body.userDeletion, listId })) return null;
        }
        return record;
      }
      if (action.kind !== "list.update") return null;
      const parent = byId.get(action.body.causal?.baseOperationId);
      if (!parent) return null;
      steps.push({ record, parent }); record = parent;
    }
    return null;
  } catch { return null; }
}
