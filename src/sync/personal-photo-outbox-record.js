import { canonicalListOperationJson } from "./list-operation-queue.js";
import { personalPhotoPublicationManifest } from "./personal-photo-publication-protocol.js";

export const PERSONAL_PHOTO_OUTBOX_ENABLED = false;
const clone = value => JSON.parse(JSON.stringify(value));
const same = (left, right) => canonicalListOperationJson(left) === canonicalListOperationJson(right);
const fail = () => { throw Object.assign(new Error("Фотодействие не совпадает с сохранённой версией карточки. Данные сохранены, отправка остановлена."),
  { isPersonalSaveBlocked: true, code: "photo-record" }); };
export const personalRecordPayload = record => record?.photoState?.payload ?? record?.action.body.payload;

// A photo-only action may not smuggle in/drop another business edit. Its complete
// candidate is derived from the exact confirmed base and the frozen manifest.
export function assertPersonalPhotoCandidate({ body, basePayload, payload }) {
  const manifest = personalPhotoPublicationManifest(body), changes = body.action === "batch" ? body.changes : [body];
  if (!basePayload || !payload) fail();
  const candidate = clone(basePayload);
  for (const entry of manifest) {
    const change = changes[entry.index], collection = entry.entityType === "item" ? "items" : "containers";
    const owner = candidate[collection]?.[entry.entityId], desired = payload[collection]?.[entry.entityId];
    if (!owner || owner.id !== entry.entityId || !desired || desired.id !== entry.entityId
      || !same((owner.photos || []).map(photo => photo.id), change.expectedPhotoIds)) fail();
    const photos = owner.photos || [];
    if (["attach", "copy"].includes(entry.action)) {
      const photo = desired.photos?.find(value => value.id === entry.photoId);
      if (!photo || photo.assetId !== entry.assetId || photo.photoId !== entry.photoId || photo.status !== "pending") fail();
      owner.photos = [...photos]; owner.photos.splice(change.index, 0, clone(photo));
    } else owner.photos = entry.photoIds.map(id => photos.find(photo => photo.id === id));
  }
  if (!same(candidate, payload)) fail();
  return manifest;
}

export function assertPersonalPhotoRecord(record) {
  const photo = record.photoState, action = record.action;
  if (action?.kind !== "photos.mutate" || photo?.version !== 1 || !record.mergeBase
    || record.mergeBase.stateRevision !== action.body.baseStateRevision
    || record.localReconciliation || record.reconciliation) fail();
  const manifest = assertPersonalPhotoCandidate({ body: action.body, basePayload: record.mergeBase.payload, payload: photo.payload });
  const attachments = manifest.filter(entry => entry.action === "attach");
  // Multi-file capture needs one atomic file inventory; never split a user batch
  // into several independent local attachment records just to pass this bridge.
  if (attachments.length && (manifest.length !== 1 || !/^[0-9a-f]{64}$/.test(photo.fileIntentHash || ""))
    || !attachments.length && photo.fileIntentHash !== null) fail();
  const changes = action.body.action === "batch" ? action.body.changes : [action.body];
  if (changes.some(change => change.action === "copy" && change.source.listId !== action.listId)) fail();
  return manifest;
}

export function assertPersonalPhotoFile(record, saved, binding) {
  assertPersonalPhotoRecord(record);
  if (!saved || saved.intentHash !== record.photoState.fileIntentHash
    || !same(saved.binding, binding) || !same(saved.action, record.action) || !same(saved.snapshot, record.snapshot)
    || saved.stage.operationId !== record.action.body.assetId || saved.stage.photoId !== record.action.body.photoId
    || saved.stage.entityId !== record.action.body.entityId || saved.stage.entityType !== record.action.body.entityType
    || !(saved.file instanceof Blob) || !saved.file.size) fail();
}
