import { createHash } from "node:crypto";
import { wholeCopyProtocolFixture } from "./admin-template-photo-whole-copy-protocol-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoWholeCopyPayload } from "../../src/sync/admin-template-photo-whole-copy-protocol.js";

export const copy = structuredClone;
export const hash = value => createHash("sha256").update(canonical(value)).digest("hex");
export async function wholeCopyReceiptFixture() {
  const f = await wholeCopyProtocolFixture(), owners = copy(f.resultOwners);
  const added = owners.flatMap(owner => owner.added);
  const stages = f.manifests.map((manifest, index) => {
    const photo = added[index].photo;
    const stored = { file: { hash: hash(`original-${index}`), ...Object.fromEntries(
      ["size", "type", "fileName", "width", "height"].map(key => [key, photo[key]])) },
      thumb: { hash: hash(`thumbnail-${index}`), size: 20 + index, type: "image/png" } };
    return { ok: true, assetState: "ready", receipt: { version: 3, kind: "admin-template-photo-whole-copy",
      manifest: copy(manifest), assetDigest: hash(manifest), sourceOwnerId: "source-admin", ownerId: f.intent.actorId,
      baseEntityRevision: 0, sourceStored: copy(stored), stored: copy(stored), materialization: { version: 1,
        source: { filePathDigest: hash(`source/file-${index}`), thumbPathDigest: hash(`source/thumb-${index}`) },
        target: { filePathDigest: hash(`target/file-${index}`), thumbPathDigest: hash(`target/thumb-${index}`) } } } };
  });
  const result = { version: 3, sourceOwnerId: "source-admin", ownerId: f.intent.actorId, layoutId: `layout-${f.intent.id}`,
    owners, confirmedPayload: adminTemplatePhotoWholeCopyPayload(f.intent, owners) };
  result.confirmedPayloadDigest = hash(result.confirmedPayload);
  const { id, ...encoded } = f.intent, payloadDigest = hash(encoded);
  const receipt = { operation: { id, environment: f.intent.environment, actorId: f.intent.actorId, listId: f.intent.listId,
    itemKey: f.intent.itemKey, kind: "template.copy", payloadDigest, state: "committed" }, result: { status: 200,
      payload: { ok: true, listId: f.intent.listId, itemKey: f.intent.itemKey, stateRevision: 1,
        visibility: "private", indexes: [], photoCopy: result } } };
  return { ...f, stages, result, receipt, expected: { intent: f.intent, payloadDigest, stageReceipts: stages } };
}
export function projectWholeReceipt(f, result) {
  const receipt = copy(f.receipt), value = copy(result);
  value.confirmedPayload = adminTemplatePhotoWholeCopyPayload(f.intent, value.owners);
  value.confirmedPayloadDigest = hash(value.confirmedPayload);
  receipt.result.payload.photoCopy = value;
  return receipt;
}
export function cancelWholeReceipt(f) {
  const receipt = copy(f.receipt); receipt.operation.state = "rejected";
  receipt.result = { status: 409, payload: { ok: false, code: "operation_cancelled", cancellation: {
    version: 1, operationId: f.intent.id, noBusinessEffects: true, operationCannotApply: true } } };
  return receipt;
}
