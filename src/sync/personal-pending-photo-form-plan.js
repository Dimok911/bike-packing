import { preparePersonalPhotoFormAttachments } from "./personal-photo-form-plan.js";
import { preparePersonalPhotoEditForm } from "./personal-photo-edit-form.js";
import { assertPersonalPhotoFormCandidate } from "./personal-photo-form-protocol.js";
import { assertListOperationPayload, assertListOperationJsonValue } from "./list-operation-payload.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";
import { isPersonalPhotoPrivateOwner } from "./personal-photo-private-owner.js";
import { PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED } from "./personal-photo-form-owner-result.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const fail = () => { throw Object.assign(Error("Следующая фотоформа не связана с сохранённым предшественником. Данные и файлы сохранены."), { code: "pending-photo-form-plan" }); };

// Pure compiler. The outbox must independently prove the complete retained
// ancestry before linking this plan; an operation ID by itself is not proof.
// The complete new file set and every new ID are captured once, synchronously.
export function preparePersonalPendingPhotoForm({ binding, snapshot, basePayload, baseStateRevision,
  parentOperationId, entityType, entityId, fields, files, index = null, photoSelection = null, photoIds = null,
  formContext = null, containerFormContext = null }, { enabled = PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED,
  snapshotToPayload = value => value, createUuid = () => crypto.randomUUID(), itemContextEnabled = false, containerContextEnabled = false } = {}) {
  if (!enabled || !uuid(parentOperationId) || !["item", "container"].includes(entityType) || !Array.isArray(files)
    || (files.length ? photoIds !== null : !Array.isArray(photoIds) || photoSelection !== null || index !== null)) fail();
  assertListOperationJsonValue({ binding, snapshot, basePayload, baseStateRevision, parentOperationId, entityType, entityId,
    fields, index, photoSelection, photoIds, formContext, containerFormContext });
  const collection = entityType === "item" ? "items" : "containers", owner = basePayload?.[collection]?.[entityId];
  if (!isPersonalPhotoPrivateOwner(owner) || !Array.isArray(owner.photos) || !same(snapshotToPayload(clone(snapshot)), basePayload)) fail();
  for (const type of ["items", "containers"]) for (const record of Object.values(basePayload[type] || {})) {
    for (const photo of record.photos || []) if (photo.status === "pending") {
      if (type !== collection || record.id !== entityId
        || !same(photo, { id: photo.id, photoId: photo.id, assetId: photo.assetId, listId: binding.listId, status: "pending" })) fail();
    }
  }
  const frozenOwner = clone(owner), base = clone(basePayload), view = clone(snapshot);
  // Existing grammar validates file selection, exact order, fields and layout
  // context. Its temporary revisions/statuses are discarded before the plan
  // can be serialized; actual revisions are resolved under server row locks.
  for (const value of [base, view]) value[collection][entityId].photos = value[collection][entityId].photos
    .map(photo => photo.status === "pending" ? { ...photo, status: "synced" } : photo);
  const grammarProjection = value => {
    // The real serializer requires full server metadata for a synced photo.
    // Restore inherited pending references while projecting, then reapply the
    // temporary grammar status solely to the compiler's validation view.
    value[collection][entityId].photos = value[collection][entityId].photos.map(photo => {
      const original = frozenOwner.photos.find(source => source.id === photo.id && source.status === "pending");
      return original ? clone(original) : photo;
    });
    const projected = snapshotToPayload(value);
    projected[collection][entityId].photos = projected[collection][entityId].photos.map(photo =>
      frozenOwner.photos.some(source => source.id === photo.id && source.status === "pending") ? { ...photo, status: "synced" } : photo);
    return projected;
  };
  const input = { binding, snapshot: view, basePayload: base, baseStateRevision,
    entityType, entityId, baseEntityRevision: 1, fields, files, index, photoSelection,
    photoRevisions: owner.photos.map(photo => ({ photoId: photo.id, assetId: photo.assetId, photoRevision: 1 })), formContext, containerFormContext };
  const options = { enabled: true, snapshotToPayload: grammarProjection, createUuid, itemContextEnabled, containerContextEnabled };
  const plan = files.length ? preparePersonalPhotoFormAttachments(input, options)
    : { version: 1, ...preparePersonalPhotoEditForm({ ...input, photoIds, operationId: createUuid() }, options), files: [] };
  if (plan.operationId === parentOperationId || plan.files.some(part => part.stage.operationId === parentOperationId)) fail();
  plan.body.baseEntityRevision = null;
  plan.body.ownerResult = { version: 1, operationId: parentOperationId, owner: frozenOwner };
  for (const change of plan.body.changes) {
    change.baseEntityRevision = null;
    if (change.action === "delete") change.basePhotoRevision = null;
  }
  for (const value of [plan.payload, plan.snapshot]) value[collection][entityId].photos = value[collection][entityId].photos
    .map(photo => clone(frozenOwner.photos.find(original => original.id === photo.id) || photo));
  assertPersonalPhotoFormCandidate({ body: plan.body, basePayload, payload: plan.payload, listId: binding.listId });
  if (!same(snapshotToPayload(clone(plan.snapshot)), plan.payload)) fail();
  assertListOperationPayload({ ...binding, kind: "photos.mutate", body: plan.body });
  return plan;
}
