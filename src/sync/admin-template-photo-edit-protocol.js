import { canonicalAccessJson as canonical, validAccessOperationId as uuid } from "./personal-access-protocol.js";

export const ADMIN_TEMPLATE_PHOTO_EDIT_ENABLED = false;
export const TEMPLATE_PHOTO_EDIT_CAPABILITY = "adminTemplatePhotoEditV1";
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim()
  && !/[\u0000-\u001f\u007f]/.test(value) && !["__proto__", "prototype", "constructor"].includes(value);
const id = value => text(value, 191) && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value);
const revision = value => Number.isSafeInteger(value) && value > 0;
const clone = value => JSON.parse(canonical(value));
const same = (left, right) => canonical(left) === canonical(right);
const fail = () => { throw Object.assign(Error("Изменение фотографий не совпадает с сохранённым шаблоном."),
  { code: "admin-template-photo-edit", isAdminTemplateBlocked: true }); };
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))), byte => byte.toString(16).padStart(2, "0")).join("");
const commonFields = ["name", "weight", "color", "location", "category", "categories", "note", "dimensions",
  "updatedAt", "updatedByDeviceId", "updatedByDeviceName"];

export function adminTemplatePhotoEditFields(entityType) {
  if (!["item", "container"].includes(entityType)) fail();
  return [...commonFields, ...(entityType === "item" ? ["quantity"] : ["volume", "nestable"])];
}

// Preserve aliases and every unknown raw field. Identity is the only field
// interpreted here; a reference with conflicting aliases is not recoverable.
function photoIdentity(photo) {
  if (!plain(photo) || !id(photo.id ?? photo.photoId)
    || Object.hasOwn(photo, "id") && Object.hasOwn(photo, "photoId") && photo.id !== photo.photoId) fail();
  return photo.id ?? photo.photoId;
}

function inventory(payload) {
  if (!plain(payload) || !plain(payload.items) || !plain(payload.containers)) fail();
  const seen = new Set();
  for (const type of ["items", "containers"]) for (const [key, row] of Object.entries(payload[type])) {
    if (!id(key) || !plain(row) || row.id !== key || Object.hasOwn(row, "photos") && !Array.isArray(row.photos)) fail();
    for (const photo of row.photos || []) { const value = photoIdentity(photo); if (seen.has(value)) fail(); seen.add(value); }
  }
}

export function adminTemplatePhotoEdit(body, operationId) {
  const edit = body?.photoEdit;
  if (!uuid(operationId) || body?.version !== 1 || !exact(body.base, ["stateRevision"]) || !revision(body.base.stateRevision)
    || Object.hasOwn(body, "source") || Object.hasOwn(body, "photoAppend")
    || !exact(edit, ["version", "entityType", "entityId", "photoIds"]) || edit.version !== 1
    || !["item", "container"].includes(edit.entityType) || !id(edit.entityId) || !Array.isArray(edit.photoIds)
    || edit.photoIds.some(value => !id(value)) || new Set(edit.photoIds).size !== edit.photoIds.length) fail();
  canonical(body); inventory(body.payload);
  const owner = body.payload[edit.entityType === "item" ? "items" : "containers"][edit.entityId];
  if (!plain(owner) || !Array.isArray(owner.photos)) fail();
  const old = new Set(owner.photos.map(photoIdentity));
  if (edit.photoIds.some(value => !old.has(value))) fail();
  return freeze(clone(edit));
}

// SQL and the durable editor plan share this boundary: form fields of one
// existing owner may change; old photos and all other raw data stay exact.
export function assertAdminTemplatePhotoEditPayload(sourcePayload, payload, edit) {
  canonical(sourcePayload); canonical(payload); inventory(sourcePayload); inventory(payload);
  const type = edit?.entityType === "item" ? "items" : "containers", fields = adminTemplatePhotoEditFields(edit?.entityType);
  if (!id(edit.entityId) || !plain(sourcePayload[type][edit.entityId]) || !plain(payload[type][edit.entityId])) fail();
  const projection = value => { const result = clone(value); for (const field of fields) delete result[type][edit.entityId][field]; return result; };
  if (!same(projection(sourcePayload), projection(payload))) fail();
  return true;
}

function expectedPayload(intent, edit) {
  const result = clone(intent.body.payload), type = edit.entityType === "item" ? "items" : "containers";
  const old = result[type][edit.entityId].photos, byId = new Map(old.map(photo => [photoIdentity(photo), photo]));
  result[type][edit.entityId].photos = edit.photoIds.map(value => byId.get(value));
  return result;
}

export function validateAdminTemplatePhotoEditResultStructure(result, intent) {
  try {
    const edit = adminTemplatePhotoEdit(intent.body, intent.id ?? intent.operationId);
    const old = intent.body.payload[edit.entityType === "item" ? "items" : "containers"][edit.entityId].photos.map(photoIdentity);
    if (intent.kind !== "template.save" || !exact(result, ["version", "ownerId", "entityType", "entityId", "photoIds", "removedPhotoIds", "confirmedPayload", "confirmedPayloadDigest"])
      || result.version !== 1 || !text(result.ownerId, 36) || result.entityType !== edit.entityType || result.entityId !== edit.entityId
      || !same(result.photoIds, edit.photoIds) || !same(result.removedPhotoIds, old.filter(value => !edit.photoIds.includes(value)))
      || typeof result.confirmedPayloadDigest !== "string" || !/^[a-f0-9]{64}$/.test(result.confirmedPayloadDigest)
      || !same(result.confirmedPayload, expectedPayload(intent, edit))) return false;
    return true;
  } catch { return false; }
}

// Clone before the first await so a caller cannot substitute the proof while
// hashing. The containing receipt still binds actor, UUID and original digest.
export async function validateAdminTemplatePhotoEditResult(input, expected) {
  try {
    const result = clone(input), intent = clone(expected.intent);
    return validateAdminTemplatePhotoEditResultStructure(result, intent)
      && await digest(result.confirmedPayload) === result.confirmedPayloadDigest;
  } catch { return false; }
}
