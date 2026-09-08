import { canonicalListOperationJson } from "./list-operation-queue.js";

export const PERSONAL_PHOTO_COPY_FORM_ENABLED = false;
export const PERSONAL_PHOTO_COPY_FORM_CAPABILITY = "personalCausalPhotoCopyFormV1";
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "constructor", "prototype"].includes(value);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const metadata = ["name", "createdAt", "updatedAt", "updatedByDeviceId", "updatedByDeviceName"];

// This is a whole owner's frozen source, not a mutable reference to whatever
// happens to be at sourceId when a worker resumes. Only identity/placement,
// copy name and edit metadata change; every other source field is preserved.
export function personalPhotoCopySourceValid(body, { allowEmpty = false } = {}) {
  const source = body?.copySource, owner = source?.payload, photos = allowEmpty ? owner?.photos ?? [] : owner?.photos;
  if (!object(source) || Object.keys(source).some(key => !["listId", "entityType", "entityId", "entityRevision", "payload"].includes(key))
    || !id(source.listId) || !["item", "container"].includes(source.entityType) || source.entityType !== body.entityType
    || !id(source.entityId) || source.entityId === body.entityId || !Number.isSafeInteger(source.entityRevision) || source.entityRevision < 1
    || body.baseEntityRevision !== 0 || !object(owner) || owner.id !== source.entityId
    || ["adminDemo", "adminSharedSourceId", "publicCatalogLayoutId", "_publicCopySourceId", "sharedSourceId"].some(key => owner[key])
    || source.entityType === "container" && owner.parentId
    || !object(body.fields) || Object.keys(body.fields).some(key => !metadata.includes(key))
    || !Array.isArray(photos) || !allowEmpty && !photos.length || photos.length > 50 || !Array.isArray(body.changes) || body.changes.length !== photos.length
    || new Set(photos.map(photo => photo?.id)).size !== photos.length || new Set(photos.map(photo => photo?.assetId)).size !== photos.length) return false;
  return photos.every((photo, index) => {
    const change = body.changes[index];
    return photo && id(photo.id) && photo.photoId === photo.id && uuid(photo.assetId) && photo.status === "synced" && photo.listId === source.listId
      && change?.action === "copy" && change.index === index && change.source?.listId === source.listId
      && change.source.photoId === photo.id && change.source.assetId === photo.assetId
      && Number.isSafeInteger(change.source.photoRevision) && change.source.photoRevision > 0 && change.source.photoRevision <= source.entityRevision
      && same(change.expectedPhotoIds, body.changes.slice(0, index).map(entry => entry.photoId));
  });
}

export function personalPhotoCopyOwner(body) {
  const owner = JSON.parse(JSON.stringify(body.copySource.payload));
  return body.entityType === "item" ? { ...owner, id: body.entityId, containerId: "", photos: [] }
    : { ...owner, id: body.entityId, parentId: null, childIds: [], itemIds: [], order: [], photos: [] };
}
