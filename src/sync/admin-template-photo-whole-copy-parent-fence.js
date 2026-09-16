import { canonicalTemplateJson as canonical, validTemplateOperationId } from "./admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";
import { adminTemplatePhotoWholeCopyIntent, adminTemplatePhotoWholeCopyStageManifests,
  adminTemplatePhotoWholeCopyStageDigest } from "./admin-template-photo-whole-copy-protocol.js";
import { validateAdminTemplatePhotoWholeCopyReceipt, validateAdminTemplatePhotoWholeCopyStageReceipt,
  validateAdminTemplatePhotoWholeCopyStages } from "./admin-template-photo-whole-copy-receipt.js";

export const WHOLE_COPY_PARENT_FENCE_PREFIX = "bike-packing-admin-photo-whole-copy-parent-fences-v1:";
const commandPrefix = "bike-packing-admin-photo-whole-copy-commands-v1:";
const kind = "admin-template-photo-whole-copy-parent-cancelled", stageProtocol = "admin-template-photo-whole-copy-stage-v3";
export const WHOLE_COPY_PARENT_PROTOCOL = "admin-template-photo-whole-copy-parent-v3";
export const WHOLE_COPY_STAGE_PROTOCOL = stageProtocol;
export const WHOLE_COPY_STAGE_PATH = "/bike-packing/admin/template-photo-assets/whole-copy";
const clone = value => JSON.parse(canonical(value)), same = (a, b) => canonical(a) === canonical(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const fail = () => { throw Object.assign(Error("Подтверждение отмены копирования требует сверки."),
  { code: "admin-template-photo-whole-copy-parent-fence", isAdminTemplateBlocked: true }); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))), byte => byte.toString(16).padStart(2, "0")).join("");

export function adminTemplatePhotoWholeCopyParentKeys(binding, operationId) {
  binding = adminTemplatePhotoActionBinding(binding); if (!validTemplateOperationId(operationId)) fail();
  const suffix = `${encodeURIComponent(canonical(binding))}:${operationId}`;
  return { certificate: WHOLE_COPY_PARENT_FENCE_PREFIX + suffix, command: commandPrefix + suffix };
}

// Only this exact parent cannot apply. No stage confirmation, file deletion,
// ID reuse, new dispatch or editor adoption follows from this certificate.
export async function prepareAdminTemplatePhotoWholeCopyParentFence({ intent: input, recordIntentHash, receipt: inputReceipt, mode } = {}) {
  const original = clone(input), receipt = clone(inputReceipt), intent = adminTemplatePhotoWholeCopyIntent({ ...original, operationId: original.id });
  if (!same(original, intent) || !hash(recordIntentHash) || !["direct", "eu"].includes(mode)) fail();
  const { id, ...body } = intent, payloadDigest = await digest(body), binding = adminTemplatePhotoActionBinding({
    actorId: intent.actorId, environment: intent.environment, listId: intent.listId, itemKey: intent.itemKey });
  // The typed validator rederives every owner's manifest and digest, including
  // photo-free owners in the full intent. Other rejections have no fence power.
  if (!await validateAdminTemplatePhotoWholeCopyReceipt(receipt, { intent, payloadDigest })
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

// A synchronous frozen snapshot supplies admission metadata only. Actual hash,
// stage and terminal proofs are checked before any durable dispatch registration.
export function adminTemplatePhotoWholeCopyJournal(input) {
  const journal = clone(input), keys = ["version", "kind", "intent", "payloadDigest", "recordIntentHash", "dispatched", "stageReceipts", "receipt"];
  if (new TextEncoder().encode(canonical(journal)).byteLength > 12 * 1024 * 1024
    || !(exact(journal, keys) || exact(journal, [...keys, "cancelRequested"])) || journal.version !== 1 || journal.kind !== "admin-template-photo-whole-copy"
    || typeof journal.dispatched !== "boolean" || Object.hasOwn(journal, "cancelRequested") && typeof journal.cancelRequested !== "boolean"
    || !hash(journal.payloadDigest) || !hash(journal.recordIntentHash)
    || !same(journal.intent, adminTemplatePhotoWholeCopyIntent(journal.intent))
    || !Array.isArray(journal.stageReceipts) || journal.stageReceipts.length !== journal.intent.body.photoCopy.owners.flatMap(owner => owner.photos).length
    || journal.dispatched && journal.stageReceipts.some(value => value === null)) fail();
  return freeze(journal);
}

export async function validateAdminTemplatePhotoWholeCopyJournal(input) {
  const journal = adminTemplatePhotoWholeCopyJournal(input), { id: _id, ...body } = journal.intent;
  if (await digest(body) !== journal.payloadDigest) fail();
  const manifests = await adminTemplatePhotoWholeCopyStageManifests(journal.intent), assets = journal.intent.body.photoCopy.owners.flatMap(owner => owner.photos);
  for (const [index, manifest] of manifests.entries()) {
    if (await adminTemplatePhotoWholeCopyStageDigest(manifest) !== assets[index].assetDigest) fail();
    const value = journal.stageReceipts[index];
    if (value !== null && !await validateAdminTemplatePhotoWholeCopyStageReceipt(value, { manifest, assetDigest: assets[index].assetDigest })) fail();
  }
  partialPaths(journal.stageReceipts);
  if (journal.stageReceipts.every(value => value !== null)
    && !await validateAdminTemplatePhotoWholeCopyStages(journal.intent, journal.stageReceipts)) fail();
  if (journal.receipt !== null && !await validateAdminTemplatePhotoWholeCopyReceipt(journal.receipt,
    { intent: journal.intent, payloadDigest: journal.payloadDigest, stageReceipts: journal.stageReceipts })) fail();
  return freeze({ journal, manifests });
}

export async function readAdminTemplatePhotoWholeCopyParentFence({ certificate: input, parentJournal: inputJournal } = {}) {
  const certificate = clone(input), { journal } = await validateAdminTemplatePhotoWholeCopyJournal(inputJournal);
  const expected = await prepareAdminTemplatePhotoWholeCopyParentFence({ intent: journal.intent, recordIntentHash: journal.recordIntentHash,
    receipt: journal.receipt, mode: certificate.mode });
  if (!same(certificate, expected)) fail();
  return expected;
}

export function matchesAdminTemplatePhotoWholeCopyParentFenceStage(proof, entry) {
  try {
    const keys = ["id", "path", "method", "mode", "identity", "createdAt", "uncertain", "recovery"];
    if (!(exact(entry, keys) || exact(entry, [...keys, "confirmed"]) && entry.confirmed === false)
      || typeof entry.uncertain !== "boolean" || entry.identity !== "" || typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt))
      || entry.path !== "/bike-packing/admin/template-photo-assets/whole-copy" || entry.method !== "POST" || entry.mode !== proof.mode) return false;
    const asset = proof.assets.find(value => value.assetId === entry.id); if (!asset) return false;
    return same(entry.recovery, { type: "admin-template-photo-stage", protocol: stageProtocol, ...proof.binding,
      operationId: asset.assetId, actionOperationId: proof.operationId, assetDigest: asset.assetDigest, intentHash: proof.recordIntentHash });
  } catch { return false; }
}
