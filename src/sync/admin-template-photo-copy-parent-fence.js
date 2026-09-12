import { canonicalTemplateJson as canonical, validTemplateOperationId } from "./admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";
import { adminTemplatePhotoCopyIntent, assertAdminTemplatePhotoCopyIntentDigests, adminTemplatePhotoCopyStageManifests,
  validateAdminTemplatePhotoCopyStageReceipt } from "./admin-template-photo-copy-protocol.js";

export const COPY_PARENT_FENCE_PREFIX = "bike-packing-admin-photo-copy-parent-fences-v1:";
const commandPrefix = "bike-packing-admin-photo-copy-commands-v1:";
const kind = "admin-template-photo-copy-parent-cancelled", stageProtocol = "admin-template-photo-copy-stage-v1";
const clone = value => JSON.parse(canonical(value)), same = (a, b) => canonical(a) === canonical(b);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const fail = () => { throw Object.assign(Error("Подтверждение отмены копирования требует сверки."), { code: "admin-template-photo-copy-parent-fence", isAdminTemplateBlocked: true }); };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))), byte => byte.toString(16).padStart(2, "0")).join("");

export function adminTemplatePhotoCopyParentKeys(binding, operationId) {
  binding = adminTemplatePhotoActionBinding(binding); if (!validTemplateOperationId(operationId)) fail();
  const suffix = `${encodeURIComponent(canonical(binding))}:${operationId}`;
  return { certificate: COPY_PARENT_FENCE_PREFIX + suffix, command: commandPrefix + suffix };
}

// This proves only that the exact parent can no longer apply. It is neither a
// binary-stage receipt nor authority to dispatch, delete bytes, or re-use IDs.
export async function prepareAdminTemplatePhotoCopyParentFence({ intent: input, recordIntentHash, receipt: inputReceipt, mode } = {}) {
  const original = clone(input), receipt = clone(inputReceipt), intent = adminTemplatePhotoCopyIntent({ ...original, operationId: original.id });
  if (!same(original, intent) || !hash(recordIntentHash) || !["direct", "eu"].includes(mode)) fail();
  await assertAdminTemplatePhotoCopyIntentDigests(intent);
  const { id, ...body } = intent, payloadDigest = await digest(body), binding = adminTemplatePhotoActionBinding({
    actorId: intent.actorId, environment: intent.environment, listId: intent.listId, itemKey: intent.itemKey });
  const expected = { operation: { id, ...binding, kind: "template.save", payloadDigest, state: "rejected" },
    result: { status: 409, payload: { ok: false, code: "operation_cancelled", cancellation: {
      version: 1, operationId: id, noBusinessEffects: true, operationCannotApply: true } } } };
  if (!same(receipt, expected)) fail();
  return freeze({ version: 1, kind, binding, mode, operationId: id, payloadDigest, recordIntentHash, stageProtocol,
    assets: intent.body.photoCopy.assets.map(({ assetId, assetDigest }) => ({ assetId, assetDigest })), receipt });
}

export async function readAdminTemplatePhotoCopyParentFence({ certificate: input, parentJournal: inputJournal } = {}) {
  const certificate = clone(input), journal = clone(inputJournal), keys = ["version", "kind", "intent", "payloadDigest", "recordIntentHash", "dispatched", "stageReceipts", "receipt"];
  if (!(exact(journal, keys) || exact(journal, [...keys, "cancelRequested"])) || journal.version !== 1 || journal.kind !== "admin-template-photo-copy"
    || typeof journal.dispatched !== "boolean" || Object.hasOwn(journal, "cancelRequested") && typeof journal.cancelRequested !== "boolean") fail();
  const expected = await prepareAdminTemplatePhotoCopyParentFence({ intent: journal.intent, recordIntentHash: journal.recordIntentHash,
    receipt: journal.receipt, mode: certificate.mode });
  if (!same(certificate, expected) || journal.payloadDigest !== expected.payloadDigest
    || !Array.isArray(journal.stageReceipts) || journal.stageReceipts.length !== expected.assets.length
    || journal.dispatched && journal.stageReceipts.some(value => value === null)) fail();
  const manifests = await adminTemplatePhotoCopyStageManifests(journal.intent);
  for (const [index, value] of journal.stageReceipts.entries()) if (value !== null
    && !await validateAdminTemplatePhotoCopyStageReceipt(value, { manifest: manifests[index], assetDigest: expected.assets[index].assetDigest })) fail();
  return expected;
}

export function matchesAdminTemplatePhotoCopyParentFenceStage(proof, entry) {
  try {
    const keys = ["id", "path", "method", "mode", "identity", "createdAt", "uncertain", "recovery"];
    if (!(exact(entry, keys) || exact(entry, [...keys, "confirmed"]) && entry.confirmed === false)
      || typeof entry.uncertain !== "boolean" || entry.identity !== "" || typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt))
      || entry.path !== "/bike-packing/admin/template-photo-assets/copy" || entry.method !== "POST" || entry.mode !== proof.mode) return false;
    const asset = proof.assets.find(value => value.assetId === entry.id); if (!asset) return false;
    return same(entry.recovery, { type: "admin-template-photo-stage", protocol: stageProtocol, ...proof.binding,
      operationId: asset.assetId, actionOperationId: proof.operationId, assetDigest: asset.assetDigest, intentHash: proof.recordIntentHash });
  } catch { return false; }
}
