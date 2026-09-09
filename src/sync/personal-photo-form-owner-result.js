import { assertListOperationJsonValue } from "./list-operation-payload.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";
import { isPersonalPhotoPrivateOwner } from "./personal-photo-private-owner.js";
import { assertPersonalPublicPhotoFormReference, assertPersonalPublicPhotoFormBase } from "./personal-public-photo-form-result.js";

export const PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED = false;
export const PERSONAL_PHOTO_FORM_OWNER_RESULT_CAPABILITY = "personalCausalPhotoFormOwnerResultV1";
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && same(Object.keys(value).sort(), [...keys].sort());
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const fail = () => { throw Object.assign(Error("Не подтверждён источник следующей фотоформы. Поля и файлы сохранены."), { code: "photo-form-owner-result" }); };

export function personalPhotoFormOwnerResult(body) {
  assertListOperationJsonValue(body);
  if (body?.ownerResult?.version === 2) {
    const ref = assertPersonalPublicPhotoFormReference(body);
    personalPhotoFormOwnerResult({ ...body, ownerResult: { version: 1, operationId: ref.operationId, owner: ref.owner } });
    return ref;
  }
  const ref = body.ownerResult;
  if (body.version !== 1 || body.action !== "form" || body.baseEntityRevision !== null
    || !["item", "container"].includes(body.entityType) || !id(body.entityId)
    || ["copySource", "manufacturerSource", "photoResults"].some(key => Object.hasOwn(body, key))
    || !exact(ref, ["version", "operationId", "owner"]) || ref.version !== 1 || !uuid(ref.operationId)
    || !isPersonalPhotoPrivateOwner(ref.owner) || ref.owner.id !== body.entityId
    || !Array.isArray(ref.owner.photos) || ref.owner.photos.length > 50
    || !Array.isArray(body.changes) || !body.changes.length || body.changes.length > 50
    || body.changes.some(change => !plain(change) || change.baseEntityRevision !== null
      || change.entityType !== body.entityType || change.entityId !== body.entityId
      || change.action === "delete" && change.basePhotoRevision !== null)) fail();
  const photos = new Set(), assets = new Set();
  for (const photo of ref.owner.photos) {
    if (!plain(photo) || !id(photo.id) || photo.photoId !== photo.id || !uuid(photo.assetId) || !id(photo.listId)
      || photos.has(photo.id) || assets.has(photo.assetId) || !["pending", "synced"].includes(photo.status)
      || photo.status === "pending" && !exact(photo, ["id", "photoId", "assetId", "listId", "status"])) fail();
    photos.add(photo.id); assets.add(photo.assetId);
  }
  return clone(ref);
}

// Grammar-only view. These sentinel revisions must never enter a retained
// action, its digest, file inventory or a network request.
export function personalPhotoFormOwnerValidationBody(body) {
  personalPhotoFormOwnerResult(body);
  const view = clone(body); delete view.ownerResult; view.baseEntityRevision = 1;
  view.changes = view.changes.map(change => ({ ...change, baseEntityRevision: 1,
    ...(change.action === "delete" ? { basePhotoRevision: 1 } : {}) }));
  return view;
}

export function assertPersonalPhotoFormOwnerBase(body, basePayload, listId) {
  const reference = personalPhotoFormOwnerResult(body);
  if (reference.version === 2) return assertPersonalPublicPhotoFormBase(body, basePayload, listId);
  const owner = basePayload?.[body.entityType === "item" ? "items" : "containers"]?.[body.entityId];
  if (!same(owner, reference.owner) || reference.owner.photos.some(photo => photo.listId !== listId)) fail();
  return reference;
}
