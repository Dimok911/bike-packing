import { cloneIsolatedPublicEntity, hasPrivateSyncBlockedPublicOrigin, markLocalPublicCopyOrigin,
  publicCopySourceIdFromRecord, stripPublicOriginForPrivateCopy } from "../public/copy-public-to-private.js";
import { publicCopyRecordContentHash } from "../public/copy-duplicates.js";

const clone = value => JSON.parse(JSON.stringify(value));
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const fail = () => { throw Error("Гостевая запись или её личная копия изменилась. Источник сохранён, перенос остановлен."); };

export function personalGuestOwnerReuseMatches(source, target, entityType) {
  if (!["item", "container"].includes(entityType) || !source || !target || !id(source.id) || !id(target.id)
    || hasPrivateSyncBlockedPublicOrigin(target, target.id)) return false;
  const origin = publicCopySourceIdFromRecord(source, entityType, source.id);
  return Boolean(origin && origin === publicCopySourceIdFromRecord(target, entityType, target.id)
    && publicCopyRecordContentHash({ ...source, photos: [] }, entityType) === publicCopyRecordContentHash({ ...target, photos: [] }, entityType));
}

// A guest source may originate from a public template, but the result is a
// private business owner. Provenance is retained; active public/share markers
// and placement mirrors are removed by the established copy rules. Reusing an
// existing private owner preserves every one of its fields and photo refs.
export function personalGuestImportOwner({ source, target = null, descriptor, photos = [], editMeta = {} }) {
  const { entityType, sourceId, targetId, sourceLayoutId = "", reuse } = descriptor || {};
  if (!["item", "container"].includes(entityType) || !id(sourceId) || !id(targetId) || sourceId === targetId
    || !source || source.id !== sourceId || typeof reuse !== "boolean" || !Array.isArray(photos)
    || !editMeta || typeof editMeta !== "object" || Array.isArray(editMeta)
    || Object.entries(editMeta).some(([key, value]) => !["createdAt", "updatedAt", "updatedByDeviceId", "updatedByDeviceName"].includes(key)
      || typeof value !== "string" || value.length > 255 || ["createdAt", "updatedAt"].includes(key) && !Number.isFinite(Date.parse(value)))) fail();
  if (reuse) {
    if (target?.id !== targetId || photos.length || !personalGuestOwnerReuseMatches(source, target, entityType)) fail();
    return clone(target);
  }
  if (target !== null || sourceLayoutId && !id(sourceLayoutId)) fail();
  const owner = { ...cloneIsolatedPublicEntity(source), id: targetId, ...clone(editMeta), photos: clone(photos) };
  const origin = publicCopySourceIdFromRecord(source, entityType, sourceId) || sourceId;
  markLocalPublicCopyOrigin(owner, entityType, origin, source._publicCopySourceLayoutId || sourceLayoutId, publicCopyRecordContentHash(source, entityType));
  stripPublicOriginForPrivateCopy(owner);
  for (const key of entityType === "item" ? ["containerId", "parentContainerId"] : ["parentId", "parentContainerId", "containerId", "childIds", "itemIds", "order"]) delete owner[key];
  if (hasPrivateSyncBlockedPublicOrigin(owner, targetId)) fail();
  return owner;
}
