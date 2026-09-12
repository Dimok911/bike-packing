import { canonicalTemplateJson as canonical, validTemplateOperationId } from "./admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";
import { adminTemplatePhotoTreeCopyIntent, adminTemplatePhotoTreeCopyStageManifests } from "./admin-template-photo-tree-copy-protocol.js";
import { validateAdminTemplatePhotoTreeCopyReceipt, validateAdminTemplatePhotoTreeCopyStageReceipt,
  validateAdminTemplatePhotoTreeCopyStages } from "./admin-template-photo-tree-copy-receipt.js";

export const TREE_COPY_PARENT_FENCE_PREFIX = "bike-packing-admin-photo-tree-copy-parent-fences-v1:";
const commandPrefix = "bike-packing-admin-photo-tree-copy-commands-v1:";
const kind = "admin-template-photo-tree-copy-parent-cancelled", stageProtocol = "admin-template-photo-tree-copy-stage-v2";
const clone = value => JSON.parse(canonical(value)), same = (a, b) => canonical(a) === canonical(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const fail = () => { throw Object.assign(Error("Подтверждение отмены дерева требует сверки."),
  { code: "admin-template-photo-tree-copy-parent-fence", isAdminTemplateBlocked: true }); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))), byte => byte.toString(16).padStart(2, "0")).join("");

export function adminTemplatePhotoTreeCopyParentKeys(binding, operationId) {
  binding = adminTemplatePhotoActionBinding(binding); if (!validTemplateOperationId(operationId)) fail();
  const suffix = `${encodeURIComponent(canonical(binding))}:${operationId}`;
  return { certificate: TREE_COPY_PARENT_FENCE_PREFIX + suffix, command: commandPrefix + suffix };
}

// Only this exact parent cannot apply. No stage confirmation, file deletion,
// ID reuse, new dispatch or editor adoption follows from this certificate.
export async function prepareAdminTemplatePhotoTreeCopyParentFence({ intent: input, recordIntentHash, receipt: inputReceipt, mode } = {}) {
  const original = clone(input), receipt = clone(inputReceipt), intent = adminTemplatePhotoTreeCopyIntent({ ...original, operationId: original.id });
  if (!same(original, intent) || !hash(recordIntentHash) || !["direct", "eu"].includes(mode)) fail();
  const { id, ...body } = intent, payloadDigest = await digest(body), binding = adminTemplatePhotoActionBinding({
    actorId: intent.actorId, environment: intent.environment, listId: intent.listId, itemKey: intent.itemKey });
  // The typed validator rederives every owner's manifest and digest, including
  // photo-free owners in the full intent. Other rejections have no fence power.
  if (!await validateAdminTemplatePhotoTreeCopyReceipt(receipt, { intent, payloadDigest })
    || receipt.operation.state !== "rejected" || receipt.result.payload.code !== "operation_cancelled") fail();
  return freeze({ version: 1, kind, binding, mode, operationId: id, payloadDigest, recordIntentHash, stageProtocol,
    assets: intent.body.photoCopy.owners.flatMap(owner => owner.photos).map(({ assetId, assetDigest }) => ({ assetId, assetDigest })), receipt });
}

function partialPaths(stages) {
  const sources = new Map(), targets = new Map(); let owners;
  const bytes = value => ({ hash: value.hash, size: value.size, type: value.type });
  for (const [index, stage] of stages.entries()) if (stage !== null) {
    const r = stage.receipt, pair = [r.sourceOwnerId, r.ownerId];
    if (owners && !same(owners, pair)) fail(); owners = pair;
    for (const part of ["file", "thumb"]) {
      const source = r.materialization.source[`${part}PathDigest`], target = r.materialization.target[`${part}PathDigest`];
      const sourceBytes = bytes(r.sourceStored[part]), targetBytes = bytes(r.stored[part]), previous = targets.get(target);
      if (sources.has(source) && !same(sources.get(source), sourceBytes)
        || previous && (previous.index !== index || !same(previous.bytes, targetBytes))) fail();
      sources.set(source, sourceBytes); targets.set(target, { index, bytes: targetBytes });
    }
  }
  if ([...sources.keys()].some(path => targets.has(path))) fail();
}

export async function readAdminTemplatePhotoTreeCopyParentFence({ certificate: input, parentJournal: inputJournal } = {}) {
  const certificate = clone(input), journal = clone(inputJournal), keys = ["version", "kind", "intent", "payloadDigest", "recordIntentHash", "dispatched", "stageReceipts", "receipt"];
  if (new TextEncoder().encode(canonical(journal)).byteLength > 12 * 1024 * 1024
    || !(exact(journal, keys) || exact(journal, [...keys, "cancelRequested"])) || journal.version !== 1 || journal.kind !== "admin-template-photo-tree-copy"
    || typeof journal.dispatched !== "boolean" || Object.hasOwn(journal, "cancelRequested") && typeof journal.cancelRequested !== "boolean") fail();
  const expected = await prepareAdminTemplatePhotoTreeCopyParentFence({ intent: journal.intent, recordIntentHash: journal.recordIntentHash,
    receipt: journal.receipt, mode: certificate.mode });
  if (!same(certificate, expected) || journal.payloadDigest !== expected.payloadDigest
    || !Array.isArray(journal.stageReceipts) || journal.stageReceipts.length !== expected.assets.length
    || journal.dispatched && journal.stageReceipts.some(value => value === null)) fail();
  const manifests = await adminTemplatePhotoTreeCopyStageManifests(journal.intent);
  for (const [index, value] of journal.stageReceipts.entries()) if (value !== null
    && !await validateAdminTemplatePhotoTreeCopyStageReceipt(value, { manifest: manifests[index], assetDigest: expected.assets[index].assetDigest })) fail();
  partialPaths(journal.stageReceipts);
  if (journal.stageReceipts.every(value => value !== null)
    && !await validateAdminTemplatePhotoTreeCopyStages(journal.intent, journal.stageReceipts)) fail();
  return expected;
}

export function matchesAdminTemplatePhotoTreeCopyParentFenceStage(proof, entry) {
  try {
    const keys = ["id", "path", "method", "mode", "identity", "createdAt", "uncertain", "recovery"];
    if (!(exact(entry, keys) || exact(entry, [...keys, "confirmed"]) && entry.confirmed === false)
      || typeof entry.uncertain !== "boolean" || entry.identity !== "" || typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt))
      || entry.path !== "/bike-packing/admin/template-photo-assets/tree-copy" || entry.method !== "POST" || entry.mode !== proof.mode) return false;
    const asset = proof.assets.find(value => value.assetId === entry.id); if (!asset) return false;
    return same(entry.recovery, { type: "admin-template-photo-stage", protocol: stageProtocol, ...proof.binding,
      operationId: asset.assetId, actionOperationId: proof.operationId, assetDigest: asset.assetDigest, intentHash: proof.recordIntentHash });
  } catch { return false; }
}
