import { assertListOperationJsonValue } from "./list-operation-payload.js";
import { personalArchiveJson } from "./personal-archive-import-protocol.js";

export const PERSONAL_PUBLIC_PHOTO_FORM_ENABLED = false;
export const PERSONAL_PUBLIC_PHOTO_FORM_CAPABILITY = "personalCausalPublicPhotoFormsV1";
export const PERSONAL_PUBLIC_NEW_OWNER_FORM_ENABLED = false;
export const PERSONAL_PUBLIC_NEW_OWNER_FORM_CAPABILITY = "personalCausalPublicNewOwnerFormsV1";
export const personalPublicPhotoFormCapabilities = reference => [PERSONAL_PUBLIC_PHOTO_FORM_CAPABILITY,
  ...([5, 11].includes(reference?.version) ? [PERSONAL_PUBLIC_NEW_OWNER_FORM_CAPABILITY] : [])];
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && same(Object.keys(value).sort(), [...keys].sort());
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const fail = () => { throw Object.assign(Error("Не подтверждён полный состав фотографий после публичной копии. Поля и файлы сохранены."), { code: "public-photo-form-result" }); };
const fields = [["containers", "container"], ["items", "item"]];
const pending = (photo, listId) => exact(photo, ["id", "photoId", "assetId", "listId", "status"])
  && id(photo.id) && photo.photoId === photo.id && uuid(photo.assetId) && photo.listId === listId && photo.status === "pending";

// Canonical inventory ordering only; these IDs never establish causal order.
// The order of photographs inside each owner remains business data.
export function personalPublicPendingPhotoInventory(payload, listId) {
  assertListOperationJsonValue(payload);
  if (!id(listId) || !plain(payload) || !fields.every(([field]) => plain(payload[field]))) fail();
  const result = [], photoIds = new Set(), assetIds = new Set();
  for (const [field, entityType] of fields) for (const entityId of Object.keys(payload[field]).sort()) {
    const owner = payload[field][entityId];
    if (!id(entityId) || !plain(owner) || owner.id !== entityId || owner.photos !== undefined && !Array.isArray(owner.photos)) fail();
    const photos = (owner.photos || []).filter(photo => photo?.status === "pending");
    if (photos.length > 50) fail();
    for (const photo of photos) {
      if (!pending(photo, listId) || photoIds.has(photo.id) || assetIds.has(photo.assetId)) fail();
      photoIds.add(photo.id); assetIds.add(photo.assetId);
    }
    if (photos.length) result.push({ entityType, entityId, photos: clone(photos) });
  }
  return result;
}

function inventoryPayload(rows, listId) {
  if (!Array.isArray(rows)) fail();
  const payload = { items: {}, containers: {} };
  for (const row of rows) {
    if (!exact(row, ["entityType", "entityId", "photos"]) || !["item", "container"].includes(row.entityType)
      || !id(row.entityId) || !Array.isArray(row.photos) || !row.photos.length || row.photos.length > 50) fail();
    const field = row.entityType === "item" ? "items" : "containers";
    if (Object.hasOwn(payload[field], row.entityId) || row.photos.some(photo => !pending(photo, listId))) fail();
    payload[field][row.entityId] = { id: row.entityId, photos: clone(row.photos) };
  }
  if (!same(personalPublicPendingPhotoInventory(payload, listId), rows)) fail();
  return payload;
}

export function assertPersonalPublicPhotoFormReference(body, listId) {
  assertListOperationJsonValue(body);
  const ref = body.ownerResult;
  if (!exact(ref, ["version", "operationId", "publicOperationId", "owner", "pendingPhotos"]) || ![2, 5].includes(ref.version)
    || !uuid(ref.operationId) || !uuid(ref.publicOperationId) || !["item", "container"].includes(body.entityType)
    || !id(body.entityId) || (ref.version === 5 ? ref.owner !== null
      : !plain(ref.owner) || ref.owner.id !== body.entityId || !Array.isArray(ref.owner.photos))) fail();
  const photos = ref.owner?.photos || [];
  const selectedListId = listId || ref.pendingPhotos?.[0]?.photos?.[0]?.listId || photos[0]?.listId;
  if (ref.pendingPhotos?.length || photos.some(photo => photo.status === "pending")) {
    const payload = inventoryPayload(ref.pendingPhotos, selectedListId), field = body.entityType === "item" ? "items" : "containers";
    if (!same(payload[field][body.entityId]?.photos || [], photos.filter(photo => photo.status === "pending"))) fail();
  } else if (!Array.isArray(ref.pendingPhotos)) fail();
  return clone(ref);
}

export function assertPersonalPublicPhotoFormSummary(summary, listId) {
  assertListOperationJsonValue(summary);
  if (!exact(summary, ["version", "publicOperationId", "pendingPhotos"]) || summary.version !== 1 || !uuid(summary.publicOperationId)) fail();
  inventoryPayload(summary.pendingPhotos, listId);
  return clone(summary);
}

export function assertPersonalPublicPhotoFormBase(body, basePayload, listId) {
  const ref = assertPersonalPublicPhotoFormReference(body, listId), field = body.entityType === "item" ? "items" : "containers";
  const owner = basePayload?.[field]?.[body.entityId];
  if ((ref.version === 5 ? basePayload.items?.[body.entityId] || basePayload.containers?.[body.entityId]
      || Object.values(basePayload.layouts || {}).some(layout => layout.arrangement?.items?.[body.entityId]
        || layout.arrangement?.containers?.[body.entityId] || layout.rootContainerIds?.includes(body.entityId))
    : !owner || !same({ ...owner, photos: owner.photos ?? [] }, ref.owner))
    || (ref.owner?.photos || []).some(photo => photo.listId !== listId)
    || !same(personalPublicPendingPhotoInventory(basePayload, listId), ref.pendingPhotos)) fail();
  return ref;
}

// The result summary binds inherited placeholders across all imported owners
// plus this form's own new files. It never invents publication metadata.
export function personalPublicPhotoFormSummary(body, listId) {
  const ref = assertPersonalPublicPhotoFormReference(body, listId), payload = inventoryPayload(ref.pendingPhotos, listId);
  const field = body.entityType === "item" ? "items" : "containers", owner = ref.version === 5 ? { id: body.entityId, photos: [] } : clone(ref.owner);
  if (!Array.isArray(body.changes) || !body.changes.length || body.changes.length > 50) fail();
  for (const change of body.changes) {
    if (!plain(change) || change.entityType !== body.entityType || change.entityId !== body.entityId
      || !same(change.expectedPhotoIds, owner.photos.map(photo => photo.id))) fail();
    if (change.action === "attach") {
      if (!id(change.photoId) || !uuid(change.assetId) || !Number.isSafeInteger(change.index)
        || change.index < 0 || change.index > owner.photos.length || owner.photos.some(photo => photo.id === change.photoId)) fail();
      owner.photos.splice(change.index, 0, { id: change.photoId, photoId: change.photoId, assetId: change.assetId, listId, status: "pending" });
    } else if (change.action === "delete") {
      if (!owner.photos.some(photo => photo.id === change.photoId && photo.assetId === change.assetId)) fail();
      owner.photos = owner.photos.filter(photo => photo.id !== change.photoId);
    } else if (change.action === "order") {
      if (!Array.isArray(change.photoIds) || new Set(change.photoIds).size !== owner.photos.length
        || change.photoIds.length !== owner.photos.length || change.photoIds.some(id => !owner.photos.some(photo => photo.id === id))) fail();
      owner.photos = change.photoIds.map(id => owner.photos.find(photo => photo.id === id));
    } else fail();
  }
  payload[field][body.entityId] = owner;
  return { version: 1, publicOperationId: ref.publicOperationId, pendingPhotos: personalPublicPendingPhotoInventory(payload, listId) };
}

// The wire form contains the selected full owner and all pending references.
// Other owners' business fields remain covered by the server's parent/CAS
// proof and the outbox's full candidate comparison, not by this summary alone.
export function validatePersonalPublicPhotoFormResult(payload, body, listId) {
  try {
    const expected = personalPublicPhotoFormSummary(body, listId);
    if (!same(assertPersonalPublicPhotoFormSummary(payload.publicPhotoForm, listId), expected)) return false;
    for (const row of expected.pendingPhotos) {
      const owner = payload.list.payload[row.entityType === "item" ? "items" : "containers"][row.entityId];
      if (!owner || owner.id !== row.entityId || !Array.isArray(owner.photos)) return false;
      const ids = row.photos.map(photo => photo.id), actual = owner.photos.filter(photo => ids.includes(photo.id));
      if (!same(actual.map(photo => photo.id), ids)) return false;
      if (actual.some((photo, index) => photo.status !== "synced" || photo.photoId !== photo.id
        || photo.listId !== listId || photo.assetId !== row.photos[index].assetId)) return false;
    }
    return true;
  } catch { return false; }
}
