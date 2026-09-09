import { canonicalListOperationJson } from "./list-operation-queue.js";
import { validatePersonalPublicPhotoFormResult } from "./personal-public-photo-form-result.js";
import { validatePersonalImportPhotoFormResult } from "./personal-import-photo-form-result.js";
import { personalManufacturerPhotoFormSource } from "./personal-manufacturer-photo-source.js";
import { personalPhotoFormOwnerResult, personalPhotoFormOwnerValidationBody, assertPersonalPhotoFormOwnerBase } from "./personal-photo-form-owner-result.js";
import { personalPhotoPublicationManifest, validatePersonalPhotoPublicationResult } from "./personal-photo-publication-protocol.js";
import { personalPhotoCopySourceValid, personalPhotoCopyOwner } from "./personal-photo-copy-source.js";
import { isPersonalPhotoPrivateOwner } from "./personal-photo-private-owner.js";
import { personalPhotoItemFormContext, personalPhotoItemContextOwner, applyPersonalPhotoItemFormContext } from "./personal-photo-item-form-context.js";
import { personalPhotoContainerFormContext, applyPersonalPhotoContainerFormContext } from "./personal-photo-container-form-context.js";

// Separate rollout gate. Storage/queue integration does not enable the UI writer.
export const PERSONAL_PHOTO_FORM_ENABLED = false;
export const PERSONAL_PHOTO_EDIT_FORM_ENABLED = false;
export const PERSONAL_PHOTO_FORM_CAPABILITY = "personalCausalPhotoFormV1";
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "constructor", "prototype"].includes(value);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, max) => typeof value === "string" && value.length <= max;
const number = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const fail = () => { throw Object.assign(new Error("Состав карточки и фотографий изменён или неполон. Отправка остановлена."),
  { code: "photo-form-manifest", isOperationPreflightError: true }); };
const fieldChecks = {
  name: value => text(value, 255) && value.trim().length > 0,
  note: value => text(value, 65536), color: value => text(value, 64),
  location: value => text(value, 255), category: value => text(value, 255),
  categories: value => Array.isArray(value) && value.length <= 256 && value.every(entry => text(entry, 255)) && new Set(value).size === value.length,
  weight: number, volume: number, nestable: value => typeof value === "boolean", quantity: value => value === 1,
  dimensions: value => value === null || object(value) && Object.keys(value).length <= 16 && Object.entries(value).every(([key, entry]) => id(key) && number(entry)),
  createdAt: value => text(value, 64) && Number.isFinite(Date.parse(value)),
  updatedAt: value => text(value, 64) && Number.isFinite(Date.parse(value)),
  updatedByDeviceId: value => text(value, 128), updatedByDeviceName: value => text(value, 255),
};

// Normalization is ONLY for the existing pure photo grammar/result validator.
// The actual immutable request keeps revision zero for creation. A photo-only
// queue must never receive this validation view as a rewritten request.
function photoValidationView(body) {
  if (Object.hasOwn(body, "ownerResult")) body = personalPhotoFormOwnerValidationBody(body);
  return { version: 1, action: "batch", changes: body.changes.map(change => ({ ...change, baseEntityRevision: body.baseEntityRevision || 1 })) };
}

export function personalPhotoFormManifest(body, { allowEmptyCopy = false } = {}) {
  if (body && Object.hasOwn(body, "ownerResult")) {
    const ownerResult = personalPhotoFormOwnerResult(body);
    const manifest = personalPhotoFormManifest(personalPhotoFormOwnerValidationBody(body), { allowEmptyCopy });
    return { ...manifest, baseEntityRevision: null, ownerResult };
  }
  const keys = ["version", "action", "baseStateRevision", "causal", "entityType", "entityId", "baseEntityRevision", "fields", "changes", "copySource", "formContext", "containerFormContext", "manufacturerSource"];
  if (!object(body) || body.version !== 1 || body.action !== "form" || Object.keys(body).some(key => !keys.includes(key))
    || !["item", "container"].includes(body.entityType) || !id(body.entityId)
    || !Number.isSafeInteger(body.baseEntityRevision) || body.baseEntityRevision < 0 || !object(body.fields) || !Object.keys(body.fields).length
    || Object.entries(body.fields).some(([key, value]) => !Object.hasOwn(fieldChecks, key) || !fieldChecks[key](value))
    || body.entityType === "item" && ["volume", "nestable"].some(key => Object.hasOwn(body.fields, key))
    || body.entityType === "container" && Object.hasOwn(body.fields, "quantity")
    || body.baseEntityRevision === 0 && !Object.hasOwn(body.fields, "name")
    || body.baseEntityRevision > 0 && Object.hasOwn(body.fields, "createdAt")
    || !Array.isArray(body.changes) || !body.changes.length && !(allowEmptyCopy && body.copySource || body.manufacturerSource) || body.changes.length > 50
    || body.changes.some(change => !change || change.entityType !== body.entityType || change.entityId !== body.entityId
      || change.baseEntityRevision !== body.baseEntityRevision || change.action === "copy" && !body.copySource
      || body.baseEntityRevision === 0 && change.action !== (body.copySource ? "copy" : "attach"))
    || Object.hasOwn(body, "copySource") && !personalPhotoCopySourceValid(body, { allowEmpty: allowEmptyCopy })) fail();
  if (body.baseEntityRevision === 0 && body.changes.length && body.changes[0].expectedPhotoIds?.length !== 0) fail();
  const photos = body.changes.length ? personalPhotoPublicationManifest(photoValidationView(body), { allowDeleteThenOrder: true, allowAttachThenOrder: true }) : [];
  if (Object.hasOwn(body, "formContext")) personalPhotoItemFormContext(body);
  if (Object.hasOwn(body, "containerFormContext")) personalPhotoContainerFormContext(body);
  if (Object.hasOwn(body, "manufacturerSource")) personalManufacturerPhotoFormSource(body);
  return { entityType: body.entityType, entityId: body.entityId, baseEntityRevision: body.baseEntityRevision,
    ...(Object.hasOwn(body, "formContext") ? { formContext: clone(body.formContext) } : {}),
    ...(Object.hasOwn(body, "containerFormContext") ? { containerFormContext: clone(body.containerFormContext) } : {}),
    ...(Object.hasOwn(body, "manufacturerSource") ? { manufacturerSource: clone(body.manufacturerSource) } : {}),
    created: body.baseEntityRevision === 0, ...(body.copySource ? { copySource: clone(body.copySource) } : {}), fields: clone(body.fields), photos };
}

export function personalPhotoFormOwner(basePayload, body) {
  const manifest = personalPhotoFormManifest(body), collection = body.entityType === "item" ? "items" : "containers";
  const previous = basePayload?.[collection]?.[body.entityId];
  if (manifest.created ? previous !== undefined : !previous || previous.id !== body.entityId) fail();
  if (manifest.copySource && !same(basePayload?.[collection]?.[manifest.copySource.entityId], manifest.copySource.payload)) fail();
  if (previous && !isPersonalPhotoPrivateOwner(previous)) fail();
  if (manifest.containerFormContext) personalPhotoContainerFormContext(body, basePayload);
  const owner = manifest.copySource ? personalPhotoCopyOwner(body) : manifest.created
    ? body.entityType === "item" ? { id: body.entityId, quantity: 1, containerId: "", photos: [] }
      : { id: body.entityId, parentId: null, childIds: [], itemIds: [], order: [], photos: [] }
    : clone(previous);
  if (owner.photos !== undefined && !Array.isArray(owner.photos)
    || !same((owner.photos || []).map(photo => photo.id), body.changes[0]?.expectedPhotoIds || [])) fail();
  for (const [key, value] of Object.entries(manifest.fields)) {
    if (key === "dimensions" && value === null) delete owner[key]; else owner[key] = value;
  }
  if (manifest.manufacturerSource) owner.manufacturerCatalogSource = personalManufacturerPhotoFormSource(body).manufacturerCatalogSource;
  return manifest.formContext ? personalPhotoItemContextOwner(owner, personalPhotoItemFormContext(body, basePayload)) : owner;
}

export function assertPersonalPhotoFormCandidate({ body, basePayload, payload, listId }) {
  if (!object(basePayload) || !object(payload) || !id(listId)) fail();
  const manifest = personalPhotoFormManifest(body), candidate = clone(basePayload);
  if (manifest.ownerResult) assertPersonalPhotoFormOwnerBase(body, basePayload, listId);
  if (manifest.copySource && manifest.copySource.listId !== listId) fail();
  const collection = body.entityType === "item" ? "items" : "containers", owner = personalPhotoFormOwner(candidate, body);
  const desired = payload[collection]?.[body.entityId];
  if (!desired || !Array.isArray(desired.photos)) fail();
  const usedPhotos = new Set(), usedAssets = new Set();
  for (const record of [...Object.values(candidate.items || {}), ...Object.values(candidate.containers || {})]) {
    if (record.photos !== undefined && !Array.isArray(record.photos)) fail();
    for (const photo of record.photos || []) { usedPhotos.add(photo.id); usedAssets.add(photo.assetId); }
  }
  for (const entry of manifest.photos) {
    const change = body.changes[entry.index], photos = owner.photos || [];
    if (["attach", "copy"].includes(entry.action)) {
      const photo = desired.photos.find(value => value.id === entry.photoId);
      const expected = { id: entry.photoId, photoId: entry.photoId, assetId: entry.assetId, listId, status: "pending" };
      if (!photo || !same(photo, expected) || usedPhotos.has(entry.photoId) || usedAssets.has(entry.assetId)) fail();
      usedPhotos.add(entry.photoId); usedAssets.add(entry.assetId);
      owner.photos = [...photos]; owner.photos.splice(change.index, 0, clone(photo));
    } else owner.photos = entry.photoIds.map(photoId => photos.find(photo => photo.id === photoId));
  }
  candidate[collection] ||= {}; candidate[collection][body.entityId] = owner;
  // Old retained records include empty display-placement mirrors on a newly
  // created owner. The real UI's business projection omits them. Accept exactly
  // those two representations, never a hidden placement or arbitrary deletion.
  if (manifest.created) for (const key of body.entityType === "item" ? ["containerId"] : ["parentId", "childIds", "itemIds", "order"]) {
    if (!Object.hasOwn(desired, key)) delete owner[key];
  }
  if (manifest.formContext) applyPersonalPhotoItemFormContext(candidate, body, basePayload);
  if (manifest.containerFormContext) applyPersonalPhotoContainerFormContext(candidate, body, basePayload);
  if (!same(candidate, payload)) fail();
  return manifest;
}

export function validatePersonalPhotoFormResult(payload, expected) {
  try {
    const manifest = personalPhotoFormManifest(expected.body), summary = payload?.photoForm;
    const filelessManufacturer = Boolean(manifest.manufacturerSource && !manifest.photos.length);
    if (!summary || summary.entityType !== manifest.entityType || summary.entityId !== manifest.entityId || summary.created !== manifest.created
      || (filelessManufacturer ? payload.list?.id !== expected.listId || !Number.isSafeInteger(payload.stateRevision)
        || payload.stateRevision <= expected.body.baseStateRevision || payload.list.stateRevision !== payload.stateRevision
        || !Array.isArray(payload.photoChanges) || payload.photoChanges.length !== 0
        : !validatePersonalPhotoPublicationResult(payload, { ...expected, body: photoValidationView(expected.body) }, { allowDeleteThenOrder: true, allowAttachThenOrder: true }))) return false;
    const owner = payload.list.payload[manifest.entityType === "item" ? "items" : "containers"][manifest.entityId];
    if (manifest.ownerResult?.version === 2 && (payload.publicPhotoFormSourceOperationId !== expected.operationId
      || !validatePersonalPublicPhotoFormResult(payload, expected.body, expected.listId))) return false;
    if (manifest.ownerResult?.version === 3 && (payload.importPhotoFormSourceOperationId !== expected.operationId
      || !validatePersonalImportPhotoFormResult(payload, expected.body, expected.listId))) return false;
    if (manifest.ownerResult) {
      if (!isPersonalPhotoPrivateOwner(owner) || payload.stateRevision <= expected.body.baseStateRevision) return false;
      let frozen = clone(manifest.ownerResult.owner);
      for (const [key, value] of Object.entries(manifest.fields)) {
        if (key === "dimensions" && value === null) delete frozen[key]; else frozen[key] = clone(value);
      }
      if (manifest.formContext) frozen = personalPhotoItemContextOwner(frozen, personalPhotoItemFormContext(expected.body));
      frozen.photos = manifest.photos.at(-1).photoIds.map(photoId => {
        const actual = owner.photos.find(photo => photo.id === photoId), prior = manifest.ownerResult.owner.photos.find(photo => photo.id === photoId);
        const attachment = manifest.photos.find(change => change.action === "attach" && change.photoId === photoId);
        if (!actual || actual.status !== "synced" || actual.photoId !== photoId || actual.listId !== expected.listId
          || actual.assetId !== (prior?.assetId || attachment?.assetId) || prior?.status === "synced" && !same(prior, actual)) fail();
        return clone(actual);
      });
      const actual = clone(owner);
      for (const key of manifest.entityType === "item" ? ["containerId", "parentContainerId"] : ["parentId", "childIds", "itemIds", "order"]) {
        delete frozen[key]; delete actual[key];
      }
      if (!same(frozen, actual)) return false;
    }
    if (manifest.manufacturerSource && !same(owner.manufacturerCatalogSource, personalManufacturerPhotoFormSource(expected.body).manufacturerCatalogSource)) return false;
    if (filelessManufacturer && (!same(owner.photos, []) || !same(summary.manufacturerCatalogSource, owner.manufacturerCatalogSource))) return false;
    if (manifest.copySource) {
      const copied = personalPhotoCopyOwner(expected.body);
      Object.assign(copied, manifest.fields);
      // URL/thumbnail references are server results. All other copied fields
      // must still describe the selected source, including unknown source fields.
      const actual = { ...owner, photos: [] };
      for (const key of manifest.entityType === "item" ? ["containerId"] : ["parentId", "childIds", "itemIds", "order"]) {
        if (!Object.hasOwn(actual, key)) delete copied[key];
      }
      if (!same(actual, copied)) return false;
      if (owner.photos.some((photo, index) => ["fileName", "type", "size", "width", "height"].some(key =>
        photo[key] !== manifest.copySource.payload.photos[index][key]))) return false;
    }
    if (manifest.formContext) {
      const context = personalPhotoItemFormContext(expected.body);
      if (context.availabilityStatus === "available" ? Object.hasOwn(owner, "availabilityStatus") : owner.availabilityStatus !== context.availabilityStatus) return false;
      if (context.layout && !same(payload.list.payload.layouts?.[context.targetLayoutId], context.layout)) return false;
    }
    if (manifest.containerFormContext) {
      const context = personalPhotoContainerFormContext(expected.body);
      if (!same(payload.list.payload.layouts?.[context.targetLayoutId], context.layout)) return false;
    }
    return Object.entries(manifest.fields).every(([key, value]) => key === "dimensions" && value === null
      ? !Object.hasOwn(owner, key) : Object.hasOwn(owner, key) && same(owner[key], value));
  } catch { return false; }
}
