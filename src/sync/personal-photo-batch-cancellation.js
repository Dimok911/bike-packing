import { PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED } from "./personal-archive-photo-protocol.js";
import { assertPersonalPhotoFile } from "./personal-photo-outbox-record.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";
import { validateCancelledStagedPhotoReceipt, validateStagedPhotoReceipt } from "./personal-photo-staging.js";
import { PERSONAL_PHOTO_FORM_ENABLED } from "./personal-photo-form-protocol.js";

export const PERSONAL_PHOTO_BATCH_CANCELLATION_ENABLED = false;
const clone = value => JSON.parse(JSON.stringify(value));
const paused = () => Object.assign(new Error("Отмена всего фотопакета ещё не подтверждена. Файлы и исходное действие сохранены."),
  { code: "photo-batch-cancellation", isPersonalSaveBlocked: true });

// Explicit cancellation only. First fence the ONE owner action in its server
// transaction, then settle each immutable stage ID without sending any bytes.
// A lost child ACK leaves the original batch intact for exact receipt recovery.
export async function cancelPersonalPhotoBatch({ record, binding, queue, store, staging, assertCurrent,
  enabled = PERSONAL_PHOTO_BATCH_CANCELLATION_ENABLED, formEnabled = PERSONAL_PHOTO_FORM_ENABLED, archiveEnabled = PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED }) {
  if (!enabled || typeof assertCurrent !== "function" || record?.photoState?.fileInventoryVersion !== 2
    || record?.action?.kind === "list.import" && !archiveEnabled
    || record?.action?.body?.action === "form" && !formEnabled
    || !queue?.inspect || !store?.read || !staging?.cancel) throw paused();
  assertCurrent(); record = clone(record); binding = clone(binding);
  const action = record.action;
  const saved = await store.read(action.operationId); assertCurrent();
  assertPersonalPhotoFile(record, saved, binding);
  const request = { path: `/bike-packing/lists/${encodeURIComponent(binding.listId)}${action.kind === "list.import" ? "/import" : "/photos/mutate"}`,
    method: "POST", operationId: action.operationId, body: JSON.stringify(action.body) };
  const bytes = new TextEncoder().encode(canonicalListOperationJson({ environment: binding.environment,
    actorId: binding.actorId, kind: action.kind, listId: binding.listId, body: action.body }));
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  assertCurrent();
  const validOwner = proof => proof?.historicalOnly === true && proof.operation?.id === action.operationId
    && proof.operation.kind === action.kind && proof.operation.payloadDigest === digest
    && Number.isInteger(proof.resultStatus)
    && ["environment", "actorId", "listId"].every(key => proof.operation[key] === binding[key])
    && (proof.operation.state === "committed" ? proof.resultStatus >= 200 && proof.resultStatus < 300
      && Number.isSafeInteger(proof.stateRevision) && proof.stateRevision > 0
      : proof.operation.state === "rejected" && [400, 403, 404, 409, 413, 422].includes(proof.resultStatus));
  let ownerReceipt;
  try { ownerReceipt = await queue.inspect(request); }
  catch (error) { assertCurrent(); if (!error.isOperationReceiptError) throw error; }
  assertCurrent();
  if (ownerReceipt && !validOwner(ownerReceipt)) throw paused();
  if (!ownerReceipt) {
    if (!queue.supportsCancellation?.(request.path, request.method) || !queue.cancelExact) throw paused();
    ownerReceipt = await queue.cancelExact(request); assertCurrent();
    if (!validOwner(ownerReceipt)) throw paused();
  }
  if (ownerReceipt.operation.state === "committed") return { historicalOnly: true, alreadyPublished: true, ownerReceipt, fileRetained: true };
  const stageReceipts = [];
  for (const part of saved.files) {
    let proof;
    try { proof = await staging.cancel(action.operationId, part.stage.operationId); }
    catch (error) {
      assertCurrent();
      if (!error.isConfirmedAssetUnavailable || !error.stageReceipt) throw error;
      proof = error.stageReceipt;
    }
    assertCurrent();
    const expected = { ...part.stage, actorId: binding.actorId, listId: binding.listId,
      fileHash: part.fileMetadata.hash, thumbHash: part.thumbMetadata?.hash || part.fileMetadata.hash };
    if (!validateCancelledStagedPhotoReceipt(proof, expected) && !validateStagedPhotoReceipt(proof, expected)) throw paused();
    stageReceipts.push(proof);
  }
  return { historicalOnly: true, ownerReceipt, stageReceipts, fileRetained: true };
}
