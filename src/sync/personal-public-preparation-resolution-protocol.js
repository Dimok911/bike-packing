import { personalArchiveHash } from "./personal-archive-import-protocol.js";
import { validateCancelledStagedPhotoReceipt, validateStagedPhotoReceipt } from "./personal-photo-staging.js";

export const PERSONAL_PUBLIC_PREPARATION_RESOLUTION_ENABLED = false;
const fail = () => { throw Object.assign(Error("Подтверждение подготовки не совпало с её исходными данными. Файлы сохранены."),
  { code: "public-preparation-proof", isPersonalSaveBlocked: true }); };

export async function assertPublicPreparationReceipt(entry, proof) {
  const action = entry?.action, binding = entry?.selection?.binding, op = proof?.operation;
  if (!action || action.kind !== "list.import" || binding?.environment !== "bike-packing-experiment"
    || action.operationId !== entry.selection.operationId || action.body.publicImport?.operationId !== action.operationId
    || Object.keys(binding).some(key => action[key] !== binding[key])
    || proof?.historicalOnly !== true || op?.id !== action.operationId || op.kind !== action.kind
    || ["environment", "actorId", "listId"].some(key => op[key] !== binding[key])
    || !Number.isInteger(proof.resultStatus)
    || !(op.state === "committed" && proof.resultStatus >= 200 && proof.resultStatus < 300 && proof.stateRevision === action.body.baseStateRevision + 1
      || op.state === "rejected" && [400, 403, 404, 409, 413, 422].includes(proof.resultStatus))
    || op.payloadDigest !== await personalArchiveHash({ environment: binding.environment, actorId: binding.actorId,
      listId: binding.listId, kind: action.kind, body: action.body })) fail();
  return proof;
}

export function assertPublicPreparationNativeSettlement(entry, settlement) {
  const files = entry?.action?.body?.publicImport?.files, binding = entry?.selection?.binding;
  if (entry?.completion?.operation?.state !== "rejected" || settlement?.version !== 1 || Object.keys(settlement).length !== 3
    || !/^[a-f0-9]{64}$/.test(settlement.intentHash) || !files?.length || !Array.isArray(settlement.stages)
    || settlement.stages.length !== files.length) fail();
  for (const [index, file] of files.entries()) {
    const expected = { operationId: file.assetId, actorId: binding.actorId, listId: binding.listId,
      entityType: file.entityType, entityId: file.entityId, photoId: file.photoId,
      fileHash: file.file.hash, thumbHash: file.thumb?.hash || file.file.hash };
    const proof = settlement.stages[index];
    if (!validateCancelledStagedPhotoReceipt(proof, expected) && !validateStagedPhotoReceipt(proof, expected)) fail();
  }
  return settlement;
}
