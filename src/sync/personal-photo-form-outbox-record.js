import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertPersonalPhotoFormCandidate } from "./personal-photo-form-protocol.js";

const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const fail = () => { throw Object.assign(new Error("Карточка, очередь и полный пакет фото не совпадают. Данные сохранены; отправка остановлена."),
  { code: "photo-form-record", isPersonalSaveBlocked: true }); };

// Verification only. An integration must separately gate capture, acquire the
// complete native inventory and recheck the causal head/context before writing.
export function assertPersonalPhotoFormRecord(record) {
  const action = record?.action, photo = record?.photoState;
  if (action?.kind !== "photos.mutate" || action.body?.action !== "form" || photo?.version !== 1
    || photo.fileInventoryVersion !== 2 || !/^[a-f0-9]{64}$/.test(photo.fileIntentHash || "")
    || !record.mergeBase || record.mergeBase.stateRevision !== action.body.baseStateRevision
    || record.reconciliation || record.localReconciliation) fail();
  const manifest = assertPersonalPhotoFormCandidate({ body: action.body, basePayload: record.mergeBase.payload,
    payload: photo.payload, listId: action.listId });
  if (manifest.photos.some(entry => entry.action !== "attach")) fail();
  return manifest;
}

export function assertPersonalPhotoFormFile(record, saved, binding) {
  const manifest = assertPersonalPhotoFormRecord(record);
  if (!saved || !same(saved.binding, binding) || !same(saved.action, record.action) || !same(saved.snapshot, record.snapshot)
    || saved.intentHash !== record.photoState.fileIntentHash || !Array.isArray(saved.files) || saved.files.length !== manifest.photos.length) fail();
  for (const [index, part] of saved.files.entries()) {
    const entry = manifest.photos[index];
    if (part?.stage?.operationId !== entry.assetId || part.stage.photoId !== entry.photoId
      || part.stage.entityType !== manifest.entityType || part.stage.entityId !== manifest.entityId
      || !(part.file instanceof Blob) || part.file.size <= 0 || part.file.size !== part.fileMetadata?.size
      || part.file.type !== part.fileMetadata?.type || !/^[a-f0-9]{64}$/.test(part.fileMetadata?.hash || "")
      || (part.thumb === null ? part.thumbMetadata !== null : !(part.thumb instanceof Blob) || part.thumb.size <= 0
        || part.thumb.size !== part.thumbMetadata?.size || part.thumb.type !== part.thumbMetadata?.type
        || !/^[a-f0-9]{64}$/.test(part.thumbMetadata?.hash || ""))) fail();
  }
  return manifest;
}
