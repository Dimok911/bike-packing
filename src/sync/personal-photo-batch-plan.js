import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertPersonalPhotoCandidate } from "./personal-photo-outbox-record.js";
import { isPersonalPhotoPrivateOwner } from "./personal-photo-private-owner.js";

// Preparation only; no UI wiring, storage writes or network dispatch. A batch
// must first acquire ONE durable file inventory before joining the outbox.
export const PERSONAL_PHOTO_BATCH_PREPARATION_ENABLED = false;
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "constructor", "prototype"].includes(value);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const revision = value => Number.isSafeInteger(value) && value > 0;
const invalid = () => { throw Object.assign(new Error("Не удалось зафиксировать полный пакет фото. Ничего не отправлено."), { code: "photo-batch-plan" }); };
const validFile = file => file instanceof Blob && file.size > 0 && file.size <= 10 * 1024 * 1024
  && ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(file.type);

export function preparePersonalPhotoAttachmentBatch({ binding, snapshot, basePayload, baseStateRevision,
  entityType, entityId, baseEntityRevision, files, index = null }, {
  enabled = PERSONAL_PHOTO_BATCH_PREPARATION_ENABLED, createUuid = () => crypto.randomUUID(), snapshotToPayload = value => value
} = {}) {
  if (!enabled || binding?.environment !== "bike-packing-experiment" || !id(binding.actorId) || binding.actorId.length > 36
    || binding.scopeKey !== `id:${binding.actorId}` || !id(binding.listId) || !["item", "container"].includes(entityType)
    || !id(entityId) || !revision(baseStateRevision) || !revision(baseEntityRevision)
    || !Array.isArray(files) || !files.length || files.length > 50) invalid();
  const frozen = clone(snapshot), payload = clone(basePayload), collection = entityType === "item" ? "items" : "containers";
  const owner = payload?.[collection]?.[entityId], localOwner = frozen?.[collection]?.[entityId];
  if (!owner || owner.id !== entityId || !localOwner || localOwner.id !== entityId
    || !isPersonalPhotoPrivateOwner(owner)
    || !same(snapshotToPayload(clone(frozen)), payload) || owner.photos !== undefined && !Array.isArray(owner.photos)
    || (owner.photos || []).some(photo => !id(photo?.id) || !uuid(photo.assetId) || photo.status !== "synced" || photo.listId !== binding.listId)
    || new Set((owner.photos || []).map(photo => photo.id)).size !== (owner.photos || []).length) invalid();
  // A legitimate API owner without photos may omit the property. Only the
  // new candidate gains it; the exact confirmed base remains untouched.
  owner.photos ||= [];
  const at = index ?? owner.photos.length;
  if (!Number.isSafeInteger(at) || at < 0 || at > owner.photos.length) invalid();
  let bytes = 0;
  const selected = files.map(entry => {
    const file = entry?.file, thumb = entry?.thumb ?? null, fileName = entry?.fileName || file?.name || "photo";
    if (!validFile(file) || thumb !== null && !validFile(thumb) || typeof fileName !== "string" || !fileName || fileName.length > 255) invalid();
    bytes += file.size + (thumb?.size || 0);
    if (bytes > 50 * 1024 * 1024) invalid();
    return { file, thumb, fileName };
  });
  const assigned = new Set();
  const nextUuid = () => { const value = createUuid(); if (!uuid(value) || assigned.has(value)) invalid(); assigned.add(value); return value; };
  const operationId = nextUuid(), changes = [], parts = [];
  for (const [offset, entry] of selected.entries()) {
    const assetId = nextUuid(), photoId = `photo-${nextUuid()}`;
    if ([...Object.values(payload.items || {}), ...Object.values(payload.containers || {})]
      .some(record => (record.photos || []).some(photo => photo.id === photoId || photo.assetId === assetId))) invalid();
    const change = { version: 1, action: "attach", entityType, entityId, baseEntityRevision,
      assetId, photoId, expectedPhotoIds: owner.photos.map(photo => photo.id), index: at + offset };
    owner.photos.splice(change.index, 0, { id: photoId, photoId, assetId, listId: binding.listId, status: "pending" });
    changes.push(change);
    parts.push({ stage: { operationId: assetId, photoId, entityType, entityId, fileName: entry.fileName }, file: entry.file, thumb: entry.thumb });
  }
  localOwner.photos = clone(owner.photos);
  const body = { version: 1, action: "batch", baseStateRevision, changes };
  assertPersonalPhotoCandidate({ body, basePayload, payload });
  return { version: 1, binding: clone(binding), operationId, body, snapshot: frozen, payload, files: parts };
}
