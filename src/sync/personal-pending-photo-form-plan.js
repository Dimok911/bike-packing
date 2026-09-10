import { preparePersonalPhotoFormAttachments } from "./personal-photo-form-plan.js";
import { preparePersonalPhotoEditForm } from "./personal-photo-edit-form.js";
import { assertPersonalPhotoFormCandidate } from "./personal-photo-form-protocol.js";
import { assertListOperationPayload, assertListOperationJsonValue } from "./list-operation-payload.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";
import { isPersonalPhotoPrivateOwner } from "./personal-photo-private-owner.js";
import { PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED } from "./personal-photo-form-owner-result.js";
import { PERSONAL_PUBLIC_PHOTO_FORM_ENABLED, PERSONAL_PUBLIC_NEW_OWNER_FORM_ENABLED, personalPublicPendingPhotoInventory } from "./personal-public-photo-form-result.js";
import { PERSONAL_IMPORT_PHOTO_FORM_ENABLED, PERSONAL_IMPORT_NEW_OWNER_FORM_ENABLED } from "./personal-import-photo-form-result.js";
import { PERSONAL_SERVER_PHOTO_FORM_ENABLED, PERSONAL_SERVER_NEW_OWNER_FORM_ENABLED } from "./personal-server-photo-form-result.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const fail = () => { throw Object.assign(Error("Следующая фотоформа не связана с сохранённым предшественником. Данные и файлы сохранены."), { code: "pending-photo-form-plan" }); };

// Pure compiler. The outbox must independently prove the complete retained
// ancestry before linking this plan; an operation ID by itself is not proof.
// The complete new file set and every new ID are captured once, synchronously.
export function preparePersonalPendingPhotoForm({ binding, snapshot, basePayload, baseStateRevision,
  parentOperationId, entityType, entityId, fields, files, created = false, index = null, photoSelection = null, photoIds = null,
  formContext = null, containerFormContext = null, publicOperationId = null, importOperationId = null, importKind = null, serverOperationId = null }, { enabled = PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED,
  publicEnabled = PERSONAL_PUBLIC_PHOTO_FORM_ENABLED,
  publicNewOwnerEnabled = PERSONAL_PUBLIC_NEW_OWNER_FORM_ENABLED,
  importEnabled = PERSONAL_IMPORT_PHOTO_FORM_ENABLED,
  importNewOwnerEnabled = PERSONAL_IMPORT_NEW_OWNER_FORM_ENABLED,
  serverEnabled = PERSONAL_SERVER_PHOTO_FORM_ENABLED,
  serverNewOwnerEnabled = PERSONAL_SERVER_NEW_OWNER_FORM_ENABLED,
  snapshotToPayload = value => value, createUuid = () => crypto.randomUUID(), itemContextEnabled = false, containerContextEnabled = false } = {}) {
  if (!enabled || !uuid(parentOperationId) || !["item", "container"].includes(entityType) || !Array.isArray(files)
    || publicOperationId !== null && (!publicEnabled || !uuid(publicOperationId))
    || (importOperationId === null ? importKind !== null : !importEnabled || !uuid(importOperationId) || !["guest", "archive"].includes(importKind) || publicOperationId !== null)
    || serverOperationId !== null && (!serverEnabled || !uuid(serverOperationId) || publicOperationId !== null || importOperationId !== null)
    || typeof created !== "boolean" || created && (!(serverOperationId ? serverNewOwnerEnabled : publicOperationId ? publicNewOwnerEnabled : importOperationId && importNewOwnerEnabled)
      || !files.length || photoSelection !== null || photoIds !== null || index !== null)
    || (files.length ? photoIds !== null : !Array.isArray(photoIds) || photoSelection !== null || index !== null)) fail();
  assertListOperationJsonValue({ binding, snapshot, basePayload, baseStateRevision, parentOperationId, entityType, entityId,
    fields, index, photoSelection, photoIds, formContext, containerFormContext, publicOperationId, importOperationId, importKind, serverOperationId });
  const imported = publicOperationId || importOperationId || serverOperationId;
  const collection = entityType === "item" ? "items" : "containers", owner = basePayload?.[collection]?.[entityId];
  if ((created ? basePayload.items?.[entityId] !== undefined || basePayload.containers?.[entityId] !== undefined
    : !isPersonalPhotoPrivateOwner(owner) || !Array.isArray(owner.photos) && !(imported && owner.photos === undefined))
    || !same(snapshotToPayload(clone(snapshot)), basePayload)) fail();
  for (const type of ["items", "containers"]) for (const record of Object.values(basePayload[type] || {})) {
    for (const photo of record.photos || []) if (photo.status === "pending") {
      if (!imported && (type !== collection || record.id !== entityId)
        || !same(photo, { id: photo.id, photoId: photo.id, assetId: photo.assetId, listId: binding.listId, status: "pending" })) fail();
    }
  }
  const frozenOwner = created ? null : clone(owner), base = clone(basePayload), view = clone(snapshot);
  if (!created && imported && frozenOwner.photos === undefined) frozenOwner.photos = [];
  const pendingPhotos = imported ? personalPublicPendingPhotoInventory(base, binding.listId) : [];
  const inherited = new Map();
  for (const type of ["items", "containers"]) for (const record of Object.values(base[type] || {})) {
    for (const photo of record.photos || []) if (photo.status === "pending") inherited.set(`${type}:${record.id}:${photo.id}`, photo);
  }
  const inheritedStatus = (value, status = null) => {
    for (const type of ["items", "containers"]) for (const record of Object.values(value[type] || {})) if (record.photos) {
      record.photos = record.photos.map(photo => {
        const original = inherited.get(`${type}:${record.id}:${photo.id}`);
        return original ? { ...clone(original), ...(status ? { status } : {}) } : photo;
      });
    }
    return value;
  };
  // Existing grammar validates file selection, exact order, fields and layout
  // context. Its temporary revisions/statuses are discarded before the plan
  // can be serialized; actual revisions are resolved under server row locks.
  for (const value of [base, view]) inheritedStatus(value, "synced");
  const grammarProjection = value => {
    // The real serializer requires full server metadata for a synced photo.
    // Restore inherited pending references while projecting, then reapply the
    // temporary grammar status solely to the compiler's validation view.
    return inheritedStatus(snapshotToPayload(inheritedStatus(value)), "synced");
  };
  const input = { binding, snapshot: view, basePayload: base, baseStateRevision,
    entityType, entityId, baseEntityRevision: created ? 0 : 1, fields, files, index, photoSelection,
    photoRevisions: (frozenOwner?.photos || []).map(photo => ({ photoId: photo.id, assetId: photo.assetId, photoRevision: 1 })), formContext, containerFormContext };
  const options = { enabled: true, snapshotToPayload: grammarProjection, createUuid, itemContextEnabled, containerContextEnabled };
  const plan = files.length ? preparePersonalPhotoFormAttachments(input, options)
    : { version: 1, ...preparePersonalPhotoEditForm({ ...input, photoIds, operationId: createUuid() }, options), files: [] };
  if ([parentOperationId, publicOperationId, importOperationId, serverOperationId].includes(plan.operationId)
    || plan.files.some(part => [parentOperationId, publicOperationId, importOperationId, serverOperationId].includes(part.stage.operationId))) fail();
  plan.body.baseEntityRevision = null;
  plan.body.ownerResult = { version: serverOperationId ? created ? 7 : 6 : created ? publicOperationId ? 5 : 4 : importOperationId ? 3 : publicOperationId ? 2 : 1, operationId: parentOperationId, owner: frozenOwner,
    ...(serverOperationId ? { serverOperationId, pendingPhotos } : publicOperationId ? { publicOperationId, pendingPhotos } : importOperationId ? { importOperationId, importKind, pendingPhotos } : {}) };
  for (const change of plan.body.changes) {
    change.baseEntityRevision = null;
    if (change.action === "delete") change.basePhotoRevision = null;
  }
  for (const value of [plan.payload, plan.snapshot]) inheritedStatus(value);
  assertPersonalPhotoFormCandidate({ body: plan.body, basePayload, payload: plan.payload, listId: binding.listId });
  if (!same(snapshotToPayload(clone(plan.snapshot)), plan.payload)) fail();
  assertListOperationPayload({ ...binding, kind: "photos.mutate", body: plan.body });
  return plan;
}
