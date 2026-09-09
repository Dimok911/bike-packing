import { isPersonalPhotoPrivateOwner } from "./personal-photo-private-owner.js";

// Pure photo plan for an exact historical snapshot. SQL ownership, immutable
// history hashes and physical asset verification remain the server's authority.
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const canonical = value => JSON.stringify(value && typeof value === "object"
  ? Array.isArray(value) ? value.map(entry => JSON.parse(canonical(entry)))
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);
const same = (a, b) => canonical(a) === canonical(b);
const fail = () => { throw Object.assign(Error("Фотографии выбранной истории не подтверждены. Восстановление остановлено."), { code: "photo-history-plan" }); };
const keys = (value, allowed) => plain(value) && Object.keys(value).length === allowed.length && Object.keys(value).every(key => allowed.includes(key));

function reference(photo, listId) {
  if (!keys(photo, ["id", "photoId", "assetId", "listId", "status", "url", "thumbUrl", "fileName", "type", "size", "width", "height"])
    || !id(photo.id) || photo.photoId !== photo.id || !uuid(photo.assetId) || photo.listId !== listId || photo.status !== "synced"
    || ["url", "thumbUrl", "fileName", "type"].some(key => typeof photo[key] !== "string" || !photo[key])
    || ["size", "width", "height"].some(key => typeof photo[key] !== "number" || !Number.isFinite(photo[key]) || photo[key] < 0)) fail();
  return clone(photo);
}

function inventory(payload, listId) {
  const photos = new Map(), assets = new Set(), owners = [];
  for (const [field, entityType] of [["items", "item"], ["containers", "container"]]) {
    if (!plain(payload?.[field])) fail();
    for (const entityId of Object.keys(payload[field]).sort()) {
      const owner = payload[field][entityId];
      if (!id(entityId) || !plain(owner) || owner.id !== entityId || Object.hasOwn(owner, "photos") && !Array.isArray(owner.photos)
        || !isPersonalPhotoPrivateOwner(owner)) fail();
      const photoIds = [];
      for (const photo of owner.photos || []) {
        const frozen = reference(photo, listId);
        if (photos.has(photo.id) || assets.has(photo.assetId)) fail();
        photos.set(photo.id, { entityType, entityId, reference: frozen }); assets.add(photo.assetId); photoIds.push(photo.id);
      }
      if (photoIds.length) owners.push({ entityType, entityId, photoIds });
    }
  }
  return { photos, owners };
}

// The complete registry includes retired heads. A restore may revive only an
// existing exact reference belonging to the same owner/list. Missing references
// retire explicitly in the resulting plan; no new photo or asset ID is inferred.
export function personalPhotoHistoryPlan({ listId, baseStateRevision, currentPayload, payload, heads }) {
  if (!id(listId) || !Number.isSafeInteger(baseStateRevision) || baseStateRevision < 1 || !Array.isArray(heads)) fail();
  const current = inventory(currentPayload, listId), desired = inventory(payload, listId), byId = new Map(), assets = new Set();
  for (const head of heads) {
    if (!keys(head, ["photoId", "assetId", "entityType", "entityId", "revision", "deleted", "reference"])
      || !id(head.photoId) || !uuid(head.assetId) || !["item", "container"].includes(head.entityType) || !id(head.entityId)
      || !Number.isSafeInteger(head.revision) || head.revision < 1 || head.revision > baseStateRevision || typeof head.deleted !== "boolean"
      || byId.has(head.photoId) || assets.has(head.assetId)) fail();
    const photo = reference(head.reference, listId);
    if (photo.id !== head.photoId || photo.assetId !== head.assetId) fail();
    const actual = current.photos.get(head.photoId), chosen = desired.photos.get(head.photoId);
    if (Boolean(actual) === head.deleted) fail();
    for (const entry of [actual, chosen].filter(Boolean)) {
      if (entry.entityType !== head.entityType || entry.entityId !== head.entityId || !same(entry.reference, photo)) fail();
    }
    byId.set(head.photoId, clone(head)); assets.add(head.assetId);
  }
  if ([...current.photos.keys(), ...desired.photos.keys()].some(photoId => !byId.has(photoId))) fail();
  const frozenHeads = [...byId.keys()].sort().map(photoId => byId.get(photoId));
  return {
    manifest: { version: 1, heads: frozenHeads, owners: clone(desired.owners) },
    revive: frozenHeads.filter(head => head.deleted && desired.photos.has(head.photoId)).map(head => head.photoId),
    retire: frozenHeads.filter(head => !head.deleted && !desired.photos.has(head.photoId)).map(head => head.photoId),
    retained: frozenHeads.filter(head => !head.deleted && desired.photos.has(head.photoId)).map(head => head.photoId)
  };
}
