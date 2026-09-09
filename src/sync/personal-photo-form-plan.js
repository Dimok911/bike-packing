import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertListOperationPayload } from "./list-operation-payload.js";
import { PERSONAL_PHOTO_FORM_ENABLED, personalPhotoFormOwner, assertPersonalPhotoFormCandidate } from "./personal-photo-form-protocol.js";
import { PERSONAL_PHOTO_ITEM_FORM_CONTEXT_ENABLED, applyPersonalPhotoItemFormContext, refreshPersonalPhotoItemContextView } from "./personal-photo-item-form-context.js";
import { PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_ENABLED, applyPersonalPhotoContainerFormContext, refreshPersonalPhotoContainerContextView } from "./personal-photo-container-form-context.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "constructor", "prototype"].includes(value);
const fileValid = file => file instanceof Blob && file.size > 0 && file.size <= 10 * 1024 * 1024
  && ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(file.type);
const fail = () => { throw Object.assign(new Error("Не удалось зафиксировать карточку со всеми фото. Ничего не отправлено."), { code: "photo-form-plan" }); };

// A complete form owns fields, new attachments and an optional frozen selection
// of existing photos. Delete first, attach, then apply one terminal exact order.
// No await, hashing, upload, storage, editor mutation, or new random IDs on retry.
export function preparePersonalPhotoFormAttachments({ binding, snapshot, basePayload, baseStateRevision,
  entityType, entityId, baseEntityRevision, fields, files, index = null, photoSelection = null, photoRevisions = [], formContext = null, containerFormContext = null }, {
  enabled = PERSONAL_PHOTO_FORM_ENABLED, itemContextEnabled = PERSONAL_PHOTO_ITEM_FORM_CONTEXT_ENABLED,
  containerContextEnabled = PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_ENABLED, createUuid = () => crypto.randomUUID(), snapshotToPayload = value => value
} = {}) {
  if (!enabled || binding?.environment !== "bike-packing-experiment" || !id(binding.actorId) || binding.actorId.length > 36
    || binding.scopeKey !== `id:${binding.actorId}` || !id(binding.listId) || !["item", "container"].includes(entityType)
    || !id(entityId) || !Number.isSafeInteger(baseStateRevision) || baseStateRevision < 1
    || !Number.isSafeInteger(baseEntityRevision) || baseEntityRevision < 0
    || !Array.isArray(files) || !files.length || files.length > 50) fail();
  if (formContext !== null && !itemContextEnabled) fail();
  if (containerFormContext !== null && !containerContextEnabled) fail();
  binding = clone(binding);
  // Reject non-JSON values before JSON cloning can turn NaN into null (which
  // would otherwise look like an explicit request to remove dimensions).
  assertListOperationPayload({ ...binding, kind: "photos.mutate", body: { fields, ...(formContext === null ? {} : { formContext }), ...(containerFormContext === null ? {} : { containerFormContext }) } });
  const frozenContext = formContext === null ? null : clone(formContext);
  const frozenContainerContext = containerFormContext === null ? null : clone(containerFormContext);
  const frozen = clone(snapshot), base = clone(basePayload), frozenFields = clone(fields);
  if (!same(snapshotToPayload(clone(frozen)), base)) fail();
  const collection = entityType === "item" ? "items" : "containers", previous = base?.[collection]?.[entityId];
  if (baseEntityRevision === 0 ? previous !== undefined : !previous || previous.id !== entityId) fail();
  const oldPhotos = previous?.photos || [];
  if (previous?.photos === null || !Array.isArray(oldPhotos) || oldPhotos.some(photo => !id(photo?.id) || photo.photoId !== photo.id
    || !uuid(photo.assetId) || photo.status !== "synced" || photo.listId !== binding.listId)
    || new Set(oldPhotos.map(photo => photo.id)).size !== oldPhotos.length) fail();
  const at = index ?? oldPhotos.length;
  if (!Number.isSafeInteger(at) || at < 0 || at > oldPhotos.length) fail();
  let retained = oldPhotos.map(photo => photo.id), order = null;
  const revisions = new Map();
  if (photoSelection !== null) {
    if (!previous || index !== null || !photoSelection || Object.keys(photoSelection).some(key => !["retainedPhotoIds", "order"].includes(key))
      || !Array.isArray(photoSelection.retainedPhotoIds) || !Array.isArray(photoSelection.order)
      || !Array.isArray(photoRevisions) || photoRevisions.length !== oldPhotos.length) fail();
    retained = [...photoSelection.retainedPhotoIds]; order = clone(photoSelection.order);
    if (new Set(retained).size !== retained.length || retained.some(value => !oldPhotos.some(photo => photo.id === value))) fail();
    const orderedPhotos = [], orderedFiles = [];
    for (const part of order) {
      if (!part || typeof part !== "object" || Object.keys(part).length !== 1) fail();
      if (Object.hasOwn(part, "photoId") && retained.includes(part.photoId)) orderedPhotos.push(part.photoId);
      else if (Number.isSafeInteger(part.fileIndex) && part.fileIndex >= 0 && part.fileIndex < files.length) orderedFiles.push(part.fileIndex);
      else fail();
    }
    if (!same(orderedPhotos, retained) || orderedFiles.length !== files.length || new Set(orderedFiles).size !== files.length) fail();
    for (const proof of photoRevisions) {
      if (!proof || revisions.has(proof.photoId) || !Number.isSafeInteger(proof.photoRevision)
        || proof.photoRevision < 1 || proof.photoRevision > baseEntityRevision
        || !oldPhotos.some(photo => photo.id === proof.photoId && photo.assetId === proof.assetId)) fail();
      revisions.set(proof.photoId, proof.photoRevision);
    }
  }
  let bytes = 0;
  const selected = files.map(part => {
    const file = part?.file, thumb = part?.thumb ?? null, fileName = part?.fileName || file?.name || "photo";
    if (!fileValid(file) || thumb !== null && !fileValid(thumb) || typeof fileName !== "string" || !fileName || fileName.length > 255) fail();
    bytes += file.size + (thumb?.size || 0); if (bytes > 50 * 1024 * 1024) fail();
    return { file, thumb, fileName };
  });
  const assigned = new Set(), nextUuid = () => { const value = createUuid(); if (!uuid(value) || assigned.has(value)) fail(); assigned.add(value); return value; };
  const operationId = nextUuid(), expected = oldPhotos.map(photo => photo.id), changes = [], parts = [];
  let pending = clone(oldPhotos);
  for (const photo of oldPhotos.filter(photo => !retained.includes(photo.id))) {
    changes.push({ version: 1, action: "delete", entityType, entityId, baseEntityRevision,
      expectedPhotoIds: [...expected], photoId: photo.id, assetId: photo.assetId, basePhotoRevision: revisions.get(photo.id) });
    expected.splice(expected.indexOf(photo.id), 1); pending = pending.filter(entry => entry.id !== photo.id);
  }
  const newIds = [];
  for (const [offset, part] of selected.entries()) {
    const assetId = nextUuid(), photoId = `photo-${nextUuid()}`, position = order ? expected.length : at + offset;
    newIds.push(photoId);
    changes.push({ version: 1, action: "attach", entityType, entityId, baseEntityRevision,
      expectedPhotoIds: [...expected], assetId, photoId, index: position });
    expected.splice(position, 0, photoId);
    pending.splice(position, 0, { id: photoId, photoId, assetId, listId: binding.listId, status: "pending" });
    parts.push({ stage: { operationId: assetId, entityType, entityId, photoId, fileName: part.fileName }, file: part.file, thumb: part.thumb });
  }
  if (order) {
    const finalIds = order.map(part => part.photoId ?? newIds[part.fileIndex]);
    if (!same(expected, finalIds)) changes.push({ version: 1, action: "order", entityType, entityId, baseEntityRevision,
      expectedPhotoIds: [...expected], photoIds: finalIds });
    pending = finalIds.map(photoId => pending.find(photo => photo.id === photoId));
  }
  if (changes.length > 50) fail();
  const body = { version: 1, action: "form", entityType, entityId, baseEntityRevision, baseStateRevision, fields: frozenFields, changes,
    ...(frozenContext === null ? {} : { formContext: frozenContext }), ...(frozenContainerContext === null ? {} : { containerFormContext: frozenContainerContext }) };
  const owner = personalPhotoFormOwner(base, body); owner.photos = pending;
  frozen[collection] ||= {};
  if (baseEntityRevision === 0) frozen[collection][entityId] = clone(owner);
  else {
    for (const [key, value] of Object.entries(frozenFields)) {
      if (key === "dimensions" && value === null) delete frozen[collection][entityId][key]; else frozen[collection][entityId][key] = clone(value);
    }
    frozen[collection][entityId].photos = clone(pending);
  }
  if (frozenContext !== null) {
    const context = applyPersonalPhotoItemFormContext(frozen, body, base);
    refreshPersonalPhotoItemContextView(frozen, context, entityId);
  }
  if (frozenContainerContext !== null) {
    const context = applyPersonalPhotoContainerFormContext(frozen, body, base);
    refreshPersonalPhotoContainerContextView(frozen, context);
  }
  const payload = snapshotToPayload(clone(frozen));
  assertPersonalPhotoFormCandidate({ body, basePayload: base, payload, listId: binding.listId });
  if ([frozen, payload].some(value => new TextEncoder().encode(JSON.stringify(value)).byteLength > 2 * 1024 * 1024)) fail();
  assertListOperationPayload({ ...binding, kind: "photos.mutate", body });
  return { version: 1, binding: clone(binding), operationId, body, snapshot: frozen, payload, files: parts };
}
