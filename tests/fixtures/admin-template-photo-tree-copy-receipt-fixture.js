import { createHash } from "node:crypto";
import { treeCopyFixture, copy, hash } from "./admin-template-photo-tree-copy-fixture.js";
import { adminTemplatePhotoCopyMaterialization } from "../../src/sync/admin-template-photo-copy-protocol.js";
import { adminTemplatePhotoTreeCopyPayload } from "../../src/sync/admin-template-photo-tree-copy-protocol.js";

export { copy, hash };
// These are explicit synthetic server facts for pure tests, not an FS or SQL
// proof. Reference routes exactly match the existing BE attach primitive.
export async function treeReceiptFixture(options = {}) {
  const f = await treeCopyFixture(options), owners = copy(f.added), stages = [];
  const added = owners.flatMap(owner => owner.added);
  for (const [index, manifest] of f.manifests.entries()) {
    const photo = added[index].photo, fileBytes = Buffer.from(`synthetic tree source file ${index}`), thumbBytes = Buffer.from(`synthetic tree source thumbnail ${index}`);
    const byteHash = value => createHash("sha256").update(value).digest("hex");
    const stored = { file: { hash: byteHash(fileBytes), size: fileBytes.length, type: "image/jpeg", fileName: `Stored-${index}.jpg`, width: 640, height: 480 },
      thumb: { hash: byteHash(thumbBytes), size: thumbBytes.length, type: "image/webp" } };
    Object.assign(photo, Object.fromEntries(["fileName", "size", "type", "width", "height"].map(key => [key, stored.file[key]])));
    photo.url = `/letters-vniipo/api/bike-packing/lists/${encodeURIComponent(f.intent.listId)}/photos/${encodeURIComponent(photo.id)}/file`;
    photo.thumbUrl = photo.url.replace(/file$/, "thumb");
    const materialization = await adminTemplatePhotoCopyMaterialization({ filePath: `legacy/tree-${index}.jpg`, thumbPath: `legacy/tree-${index}.webp` },
      { filePath: `operations/${manifest.operationId}/file.jpg`, thumbPath: `operations/${manifest.operationId}/thumb.webp` });
    stages.push({ ok: true, assetState: "ready", receipt: { version: 2, kind: "admin-template-photo-tree-copy", manifest,
      assetDigest: added[index].assetDigest, sourceOwnerId: "source-template-owner", ownerId: "target-template-owner", baseEntityRevision: 0,
      sourceStored: copy(stored), stored, materialization } });
  }
  const c = f.intent.body.photoCopy, projected = adminTemplatePhotoTreeCopyPayload(f.intent, owners);
  const result = { version: 2, sourceOwnerId: "source-template-owner", ownerId: "target-template-owner",
    rootId: c.owners.find(owner => owner.sourceEntityId === c.source.rootId).entityId, owners,
    confirmedPayload: projected, confirmedPayloadDigest: hash(projected) };
  const { id, ...encoded } = f.intent, payloadDigest = hash(encoded), intent = f.intent;
  const operation = { id, environment: intent.environment, actorId: intent.actorId, listId: intent.listId, itemKey: intent.itemKey,
    kind: intent.kind, payloadDigest, state: "committed" };
  const receipt = { operation, result: { status: 200, payload: { ok: true, listId: intent.listId, itemKey: intent.itemKey,
    stateRevision: intent.body.base.stateRevision + 1, visibility: "private", indexes: [], photoCopy: result } } };
  return { ...f, owners, stages, result, receipt, payloadDigest, expected: { intent, payloadDigest, stageReceipts: stages } };
}
export function cancellationFor(f) {
  return { operation: { ...f.receipt.operation, state: "rejected" }, result: { status: 409, payload: { ok: false, code: "operation_cancelled",
    cancellation: { version: 1, operationId: f.intent.id, noBusinessEffects: true, operationCannotApply: true } } } };
}
export function projectReceipt(f, result) {
  result.confirmedPayload = adminTemplatePhotoTreeCopyPayload(f.intent, result.owners);
  result.confirmedPayloadDigest = hash(result.confirmedPayload);
  return { operation: copy(f.receipt.operation), result: { status: 200, payload: { ...copy(f.receipt.result.payload), photoCopy: result } } };
}
