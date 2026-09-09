import { personalGuestImportOwner } from "./personal-guest-import-owner.js";
import { hasPrivateSyncBlockedPublicOrigin } from "../public/copy-public-to-private.js";
import { assertListOperationPayload } from "./list-operation-payload.js";

const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const photoKey = photo => photo?.id || photo?.localId;
const fields = [["containers", "container"], ["items", "item"]];
const fail = () => { throw Object.assign(Error("Зафиксированный гостевой перенос неполон или изменён. Исходная работа сохранена."), { code: "guest-import-plan" }); };
const binary = (value, original) => exact(value, ["hash", "size", "type", ...(original ? ["fileName"] : [])]) && hash(value.hash)
  && Number.isSafeInteger(value.size) && value.size > 0 && value.size <= 10 * 1024 * 1024
  && ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(value.type)
  && (!original || typeof value.fileName === "string" && value.fileName.length > 0 && value.fileName.length <= 255);

function state(value) {
  if (!plain(value) || ![value.items, value.containers, value.layouts].every(plain)
    || ![value.locations, value.categories].every(values => Array.isArray(values) && values.every(value => typeof value === "string"))) fail();
  for (const field of ["items", "containers", "layouts"]) for (const [key, record] of Object.entries(value[field])) {
    if (!id(key) || !plain(record) || record.id !== key) fail();
    if (field !== "layouts" && Object.hasOwn(record, "photos") && (!Array.isArray(record.photos)
      || record.photos.some(photo => !plain(photo) || !id(photoKey(photo)))
      || new Set(record.photos.map(photoKey)).size !== record.photos.length)) fail();
  }
}

// Same projection as the personal list boundary, allowing private template
// provenance. It removes only display mirrors and never repairs business data.
export function personalGuestBusinessPayload(value) {
  state(value);
  const payload = clone(value);
  for (const key of ["collapsedContainers", "itemDisplayMode", "showItemMeta", "showFilterContext", "collectionMode", "showOnlyUnpacked", "packedItems", "activeLayoutId"]) delete payload[key];
  for (const [field, entityType] of fields) for (const owner of Object.values(payload[field])) {
    if (hasPrivateSyncBlockedPublicOrigin(owner, owner.id)) fail();
    for (const key of entityType === "item" ? ["containerId", "parentContainerId"] : ["parentId", "parentContainerId", "containerId", "childIds", "itemIds", "order"]) delete owner[key];
  }
  for (const layout of Object.values(payload.layouts)) if (layout.guestDemoCopy || layout.adminDemo || layout.adminSharedSourceId
    || layout.publicCatalogLayoutId || layout.sharedSourceId || !plain(layout.arrangement)) fail();
  return payload;
}

function currentPhotoInventory(payload, listId) {
  const used = new Set();
  for (const [field] of fields) for (const owner of Object.values(payload[field])) for (const photo of owner.photos || []) {
    if (!exact(photo, ["id", "photoId", "assetId", "listId", "status", "url", "thumbUrl", "fileName", "type", "size", "width", "height"])
      || photo.photoId !== photo.id || photo.listId !== listId || photo.status !== "synced" || !uuid(photo.assetId)
      || photo.id === photo.assetId || used.has(photo.id) || used.has(photo.assetId)
      || ["url", "thumbUrl", "fileName", "type"].some(key => typeof photo[key] !== "string" || !photo[key])
      || ["size", "width", "height"].some(key => !Number.isFinite(photo[key]) || photo[key] < 0)) fail();
    used.add(photo.id); used.add(photo.assetId);
  }
  return used;
}

// Shared owner/file compiler. Each caller supplies its complete selected graph;
// it does not synthesize a partial source or an intermediate guest operation.
export function personalImportOwnersPlan({ currentPayload, sourcePayload, selectedOwners, allocatedLayoutIds = [],
  ownerTargets, photoTargets, editMeta = {}, listId, operationId }, files = []) {
  assertListOperationPayload({ actorId: "import-owner-validation", kind: "list.import", listId,
    body: { currentPayload, sourcePayload, selectedOwners, allocatedLayoutIds, ownerTargets, photoTargets, editMeta, operationId, files } });
  state(sourcePayload);
  const payload = personalGuestBusinessPayload(currentPayload), source = clone(sourcePayload);
  if (!id(listId) || !uuid(operationId) || !Array.isArray(selectedOwners) || !Array.isArray(allocatedLayoutIds)
    || !Array.isArray(ownerTargets) || !Array.isArray(photoTargets) || photoTargets.length > 50 || !Array.isArray(files) || files.length !== photoTargets.length) fail();
  const selected = { item: new Set(), container: new Set() }, firstLayout = new Map(), used = currentPhotoInventory(payload, listId);
  for (const row of selectedOwners) {
    if (!exact(row, ["entityType", "sourceId", "sourceLayoutId"]) || !["item", "container"].includes(row.entityType)
      || !id(row.sourceId) || row.sourceLayoutId !== "" && !id(row.sourceLayoutId) || selected[row.entityType].has(row.sourceId)) fail();
    selected[row.entityType].add(row.sourceId); firstLayout.set(`${row.entityType}:${row.sourceId}`, row.sourceLayoutId);
  }
  const reservedIds = new Set([source, payload].flatMap(value => ["items", "containers", "layouts"].flatMap(field => Object.keys(value[field]))));
  for (const [field] of fields) for (const owner of Object.values(source[field])) for (const photo of owner.photos || []) {
    for (const key of ["id", "photoId", "assetId", "localId"]) if (photo[key]) used.add(photo[key]);
  }
  if (used.has(operationId) || reservedIds.has(operationId)) fail(); used.add(operationId);
  for (const layoutId of allocatedLayoutIds) {
    if (typeof layoutId !== "string" || !layoutId.startsWith("layout-") || !uuid(layoutId.slice(7))
      || reservedIds.has(layoutId) || used.has(layoutId.slice(7))) fail();
    reservedIds.add(layoutId); used.add(layoutId.slice(7));
  }
  const maps = { item: new Map(), container: new Map() }, expectedPhotos = [], createdOwners = { items: [], containers: [] };
  for (const descriptor of ownerTargets) {
    const { entityType, sourceId, targetId, reuse } = descriptor || {}, field = entityType === "item" ? "items" : "containers";
    if (!exact(descriptor, ["entityType", "sourceId", "targetId", "reuse", ...(reuse === false ? ["sourceLayoutId"] : [])])
      || !["item", "container"].includes(entityType) || !id(sourceId) || !id(targetId) || typeof reuse !== "boolean"
      || !selected[entityType].has(sourceId) || maps[entityType].has(sourceId)) fail();
    const existing = payload[field][targetId];
    if (reuse) {
      if (!existing || !Object.values(payload.layouts).some(layout => !layout.adminDemo && !layout.adminSharedSourceId
        && (Object.hasOwn(layout.arrangement?.[field] || {}, targetId) || entityType === "item" && layout.guestSharedLinkDetachedItemIds?.includes(targetId)))
        && !createdOwners[field].includes(targetId)) fail();
    } else {
      if (!targetId.startsWith(`${entityType}-`) || !uuid(targetId.slice(entityType.length + 1)) || reservedIds.has(targetId)
        || used.has(targetId.slice(entityType.length + 1)) || descriptor.sourceLayoutId !== firstLayout.get(`${entityType}:${sourceId}`)) fail();
      used.add(targetId.slice(entityType.length + 1));
      reservedIds.add(targetId); createdOwners[field].push(targetId);
    }
    payload[field][targetId] = personalGuestImportOwner({ source: source[field][sourceId], target: reuse ? existing : null, descriptor, editMeta });
    maps[entityType].set(sourceId, targetId);
    if (!reuse) for (const photo of source[field][sourceId].photos || []) expectedPhotos.push({ entityType, sourceEntityId: sourceId, entityId: targetId, sourcePhotoId: photoKey(photo) });
  }
  if (fields.some(([, type]) => selected[type].size !== maps[type].size) || expectedPhotos.length !== photoTargets.length) fail();
  const attachments = []; let total = 0;
  for (const [index, target] of photoTargets.entries()) {
    const expected = expectedPhotos[index], file = files[index];
    if (!exact(target, ["entityType", "sourceEntityId", "entityId", "sourcePhotoId", "photoId", "assetId"])
      || Object.keys(expected).some(key => target[key] !== expected[key]) || !uuid(target.photoId) || !uuid(target.assetId)
      || target.photoId === target.assetId || used.has(target.photoId) || used.has(target.assetId) || reservedIds.has(target.photoId) || reservedIds.has(target.assetId)
      || !exact(file, ["entityType", "entityId", "sourcePhotoId", "photoId", "assetId", "file", "thumb"])
      || ["entityType", "entityId", "sourcePhotoId", "photoId", "assetId"].some(key => file[key] !== target[key])
      || !binary(file.file, true) || file.thumb !== null && !binary(file.thumb, false)) fail();
    used.add(target.photoId); used.add(target.assetId); total += file.file.size + (file.thumb?.size || 0);
    if (total > 50 * 1024 * 1024) fail();
    const owner = payload[target.entityType === "item" ? "items" : "containers"][target.entityId], position = owner.photos.length;
    owner.photos.push({ id: target.photoId, photoId: target.photoId, assetId: target.assetId, listId, status: "pending" });
    attachments.push({ ...clone(file), index: position });
  }
  return { payload, attachments, createdOwners };
}
