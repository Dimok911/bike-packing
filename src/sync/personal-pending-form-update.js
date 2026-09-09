import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertPersonalPhotoFormRecord } from "./personal-photo-form-outbox-record.js";
import { personalPhotoFormManifest } from "./personal-photo-form-protocol.js";
import { personalBusinessPayload } from "./personal-server-payload.js";
import { preparePersonalDeletionBatch } from "./personal-deletion-intent.js";
import { preservesConfirmedPersonalPhotos } from "./personal-confirmed-photos.js";
import { personalPendingPhotoFormChain } from "./personal-pending-photo-form-chain.js";
import { personalPublicPhotoFormSummary, assertPersonalPublicPhotoFormSummary, personalPublicPendingPhotoInventory } from "./personal-public-photo-form-result.js";
import { personalImportPhotoFormSummary, assertPersonalImportPhotoFormSummary } from "./personal-import-photo-form-result.js";

export const PERSONAL_PENDING_FORM_UPDATE_ENABLED = false;
export const PERSONAL_PENDING_FORM_UPDATE_CAPABILITY = "personalCausalPhotoFormDescendantsV1";
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const collections = ["items", "containers"];
const payloadOf = record => record.photoState?.payload || record.action.body.payload;

export function personalFormPhotoBodyResultReference(body, operationId, listId) {
  const form = personalPhotoFormManifest(body);
  // Copies retain their existing separate protocol and ancestry rules.
  if (form.copySource) throw Error("A copied photo owner requires its copy protocol");
  if ([2, 3].includes(form.ownerResult?.version)) {
    const imported = form.ownerResult.version === 3, summary = (imported ? personalImportPhotoFormSummary : personalPublicPhotoFormSummary)(body, listId);
    return { version: imported ? 9 : 8, operationId, owners: summary.pendingPhotos.map(({ entityType, entityId }) => ({ entityType, entityId })) };
  }
  return { version: form.ownerResult ? 6 : 5, operationId, owners: [{ entityType: form.entityType, entityId: form.entityId }] };
}

export function personalFormPhotoResultReference(source) {
  assertPersonalPhotoFormRecord(source);
  return personalFormPhotoBodyResultReference(source.action.body, source.action.operationId, source.action.listId);
}

// A committed descendant must describe the entire frozen DB edit. Only the
// exact pending references may acquire their server publication metadata.
export function validatePersonalPendingFormUpdateResult(result, expected) {
  try {
    const body = expected.body, reference = body.photoResults, list = result?.list;
    if (expected.kind !== "list.update" || ![5, 6, 8, 9].includes(reference?.version) || !Array.isArray(reference.owners)
      || ![8, 9].includes(reference.version) && reference.owners.length !== 1
      || list?.id !== expected.listId || result.ok !== true || !Number.isSafeInteger(result.stateRevision)
      || result.stateRevision <= body.baseStateRevision || list.stateRevision !== result.stateRevision) return false;
    const allowed = new Set();
    for (const selected of reference.owners) {
      const collection = selected.entityType === "item" ? "items" : selected.entityType === "container" ? "containers" : null;
      if (!collection || typeof selected.entityId !== "string" || !selected.entityId
        || !same(selected, { entityType: selected.entityType, entityId: selected.entityId })
        || allowed.has(`${collection}:${selected.entityId}`)) return false;
      allowed.add(`${collection}:${selected.entityId}`);
    }
    const frozen = personalBusinessPayload(body.payload), actual = personalBusinessPayload(list.payload);
    if (reference.version === 8) {
      const summary = assertPersonalPublicPhotoFormSummary(result.publicPhotoForm, expected.listId);
      if (result.publicPhotoFormSourceOperationId !== reference.operationId
        || !body.causal?.dependsOn?.some(dep => dep.operationId === summary.publicOperationId && dep.listId === expected.listId)
        || !same(summary.pendingPhotos, personalPublicPendingPhotoInventory(frozen, expected.listId))) return false;
    }
    if (reference.version === 9) {
      const summary = assertPersonalImportPhotoFormSummary(result.importPhotoForm, expected.listId);
      if (result.importPhotoFormSourceOperationId !== reference.operationId
        || !body.causal?.dependsOn?.some(dep => dep.operationId === summary.importOperationId && dep.listId === expected.listId)
        || !same(summary.pendingPhotos, personalPublicPendingPhotoInventory(frozen, expected.listId))) return false;
    }
    for (const name of collections) for (const [id, owner] of Object.entries(frozen[name])) if (owner.photos) {
      owner.photos = owner.photos.map((photo, index) => {
        if (photo.status !== "pending") return photo;
        const published = actual[name]?.[id]?.photos?.[index];
        if (!allowed.has(`${name}:${id}`) || !published || published.status !== "synced"
          || !same(photo, { id: photo.id, photoId: photo.id, assetId: photo.assetId, listId: expected.listId, status: "pending" })
          || ["id", "photoId", "assetId", "listId"].some(key => published[key] !== photo[key])) throw Error("Unbound result photo");
        return clone(published);
      });
    }
    return same(frozen, actual);
  } catch { return false; }
}

// DB descendants retain the selected owner photos exactly, including mixed
// old/new references and fileless delete/order forms. Only explicit deletion
// may remove an owner. New bytes require a separate file-owning operation.
export function isPersonalPendingFormUpdate({ source, basePayload, payload, userDeletion = null, listId }) {
  try {
    const reference = personalFormPhotoResultReference(source);
    if (source.action.listId !== listId) return false;
    const initial = source.photoState.payload, base = personalBusinessPayload(basePayload), actual = personalBusinessPayload(payload);
    const layoutDeletion = userDeletion?.type === "layout";
    if (layoutDeletion && (!base.layouts[userDeletion.id] || actual.layouts[userDeletion.id])) return false;
    const ownerDeletion = layoutDeletion ? null : userDeletion;
    const expected = ownerDeletion ? preparePersonalDeletionBatch(base, ownerDeletion).snapshot : base;
    for (const collection of collections) {
      if (Object.keys(base[collection]).some(id => Object.hasOwn(expected[collection], id) !== Object.hasOwn(actual[collection], id))
        || Object.keys(initial[collection]).some(id => !Object.hasOwn(base[collection], id) && Object.hasOwn(actual[collection], id))) return false;
    }
    const attached = new Map(source.action.body.changes.filter(change => change.action === "attach").map(change => [change.photoId, change]));
    const inherited = [2, 3].includes(source.action.body.ownerResult?.version) ? source.action.body.ownerResult.pendingPhotos
      : [{ entityType: source.action.body.entityType, entityId: source.action.body.entityId, photos: source.action.body.ownerResult?.owner.photos || [] }];
    for (const owner of inherited) for (const photo of owner.photos) if (photo.status === "pending") {
      if (attached.has(photo.id)) return false;
      attached.set(photo.id, { photoId: photo.id, assetId: photo.assetId, entityType: owner.entityType, entityId: owner.entityId });
    }
    const withoutPending = value => {
      const result = clone(value);
      for (const collection of collections) for (const owner of Object.values(result[collection])) if (owner.photos) {
        owner.photos = owner.photos.filter(photo => {
          if (photo.status !== "pending") return true;
          const file = attached.get(photo.id);
          if (!file || owner.id !== file.entityId || collection !== (file.entityType === "item" ? "items" : "containers")
            || !same(photo, { id: file.photoId, photoId: file.photoId, assetId: file.assetId, listId, status: "pending" })) throw Error("Unbound pending photo");
          return false;
        });
      }
      return result;
    };
    for (const owner of reference.owners) {
      const collection = owner.entityType === "item" ? "items" : "containers", id = owner.entityId;
      if (!Object.hasOwn(expected[collection], id)) { if (Object.hasOwn(actual[collection], id)) return false; continue; }
      if (!base[collection][id] || !actual[collection][id]
        || !same(base[collection][id].photos, initial[collection][id].photos)
        || !same(actual[collection][id].photos, expected[collection][id].photos)) return false;
    }
    return preservesConfirmedPersonalPhotos(withoutPending(base), withoutPending(actual), listId, { userDeletion: ownerDeletion });
  } catch { return false; }
}

export function personalPendingFormUpdateSource({ records, operationId, listId, includeSource = false }) {
  try {
    const byId = new Map(records.map(record => [record.action.operationId, record]));
    if (byId.size !== records.length) return null;
    const seen = new Set(), steps = []; let record = byId.get(operationId);
    while (record && record.action.kind !== "photos.mutate") {
      const action = record.action, parent = action.body.causal?.baseOperationId;
      if (seen.has(action.operationId) || action.kind !== "list.update" || action.listId !== listId || record.photoState
        || !parent || !byId.has(parent) || ![5, 6, 8, 9].includes(action.body.photoResults?.version)) return null;
      seen.add(action.operationId); steps.push(record); record = byId.get(parent);
    }
    if (!record || !steps.length && !includeSource) return null;
    const source = record, reference = personalFormPhotoResultReference(source);
    if (source.action.listId !== listId) return null;
    if (source.action.body.ownerResult && !personalPendingPhotoFormChain({ records, operationId: source.action.operationId, listId })) return null;
    let previous = source;
    for (const step of steps.reverse()) {
      const action = step.action, deps = action.body.causal.dependsOn, basePayload = payloadOf(previous);
      if (!same(action.body.photoResults, reference) || ["actorId", "environment", "scopeKey", "listId"].some(key => action[key] !== source.action[key])
        || action.generation !== previous.action.generation + 1 || !Array.isArray(deps)
        || ![source.action.operationId, previous.action.operationId].every(id => deps.some(dep => dep.operationId === id && dep.listId === listId))
        || step.mergeBase && !same(step.mergeBase.payload, basePayload)
        || !isPersonalPendingFormUpdate({ source, basePayload, payload: action.body.payload, userDeletion: action.body.userDeletion, listId })) return null;
      previous = step;
    }
    return source;
  } catch { return null; }
}
