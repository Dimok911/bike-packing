import { sameProtocolJson as same } from "./protocol-json-equality.js";
import { canonicalAccessJson as canonical } from "./personal-access-protocol.js";
import { adminTemplatePhotoWholeCopyIntent, adminTemplatePhotoWholeCopyStageManifest,
  adminTemplatePhotoWholeCopyStageManifests, adminTemplatePhotoWholeCopyPayload } from "./admin-template-photo-whole-copy-protocol.js";

// Pure proof validation only. Callers must obtain immutable receipts from the
// authenticated gateway; none of these facts acquires SQL/FS/write authority.
const mode = "admin-template-photo-whole-copy", maxReceiptBytes = 4 * 1024 * 1024;
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const clone = value => JSON.parse(canonical(value));
const bytes = value => new TextEncoder().encode(canonical(value));
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(value))), byte => byte.toString(16).padStart(2, "0")).join("");
const positive = value => Number.isSafeInteger(value) && value > 0;
const text = (value, max) => typeof value === "string" && value.length <= max;
const ownerId = value => text(value, 36) && value.length > 0 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const mime = value => ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"].includes(value);
const size = value => positive(value) && value <= 10 * 1024 * 1024;
const dimension = value => value === null || positive(value);
const fileName = value => text(value, 255) && value.length > 0 && !/[\u0000-\u001f\u007f/\\]/.test(value);
const physical = value => ({ hash: value.hash, size: value.size, type: value.type });
const flatAssets = intent => intent.body.photoCopy.owners.flatMap(owner => owner.photos);
const flatAdded = result => result.owners.flatMap(owner => owner.added);

// Exact existing copy-client allowlist, intentionally independent of browser
// location, response data, or transport imports. Never rewrite raw receipt URLs.
const photoBases = Object.freeze([
  "/letters-vniipo/api",
  "https://api.vniipo-help.ru/experiment/letters-vniipo/api",
  "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api",
  "https://experiment.vniipo-help.ru/letters-vniipo/api",
  "https://api.vniipo-help.ru/letters-vniipo/api",
]);
function allowedUrls(result, intent) {
  return flatAdded(result).every(({ photo }) => ["file", "thumb"].every(variant => {
    const suffix = `/bike-packing/lists/${encodeURIComponent(intent.listId)}/photos/${encodeURIComponent(photo.id)}/${variant}`;
    return photoBases.some(base => photo[variant === "file" ? "url" : "thumbUrl"] === base + suffix);
  }));
}
function stored(value) {
  return exact(value, ["file", "thumb"]) && exact(value.file, ["hash", "size", "type", "fileName", "width", "height"])
    && hash(value.file.hash) && size(value.file.size) && mime(value.file.type) && fileName(value.file.fileName)
    && dimension(value.file.width) && dimension(value.file.height)
    && exact(value.thumb, ["hash", "size", "type"]) && hash(value.thumb.hash) && size(value.thumb.size) && mime(value.thumb.type);
}
function materialization(value, source, target) {
  if (!exact(value, ["version", "source", "target"]) || value.version !== 1) return false;
  for (const [part, metadata] of [[value.source, source], [value.target, target]]) {
    if (!exact(part, ["filePathDigest", "thumbPathDigest"]) || !Object.values(part).every(hash)
      || part.filePathDigest === part.thumbPathDigest && !same(physical(metadata.file), metadata.thumb)) return false;
  }
  return Object.values(value.source).every(path => !Object.values(value.target).includes(path));
}
function stageShape(data, manifest, assetDigest) {
  if (!exact(data, ["ok", "assetState", "receipt"]) || data.ok !== true || !["ready", "unavailable"].includes(data.assetState)) return false;
  const r = data.receipt;
  return exact(r, ["version", "kind", "manifest", "assetDigest", "sourceOwnerId", "ownerId", "baseEntityRevision", "sourceStored", "stored", "materialization"])
    && r.version === 3 && r.kind === mode && r.assetDigest === assetDigest && same(r.manifest, manifest)
    && ownerId(r.sourceOwnerId) && r.ownerId === manifest.actorId && r.baseEntityRevision === 0
    && stored(r.sourceStored) && stored(r.stored) && same(r.sourceStored, r.stored)
    && materialization(r.materialization, r.sourceStored, r.stored);
}

export async function validateAdminTemplatePhotoWholeCopyStageReceipt(input, expected) {
  try {
    const data = clone(input), manifest = adminTemplatePhotoWholeCopyStageManifest(expected.manifest), assetDigest = expected.assetDigest;
    return hash(assetDigest) && await digest(manifest) === assetDigest && stageShape(data, manifest, assetDigest);
  } catch { return false; }
}

// Regenerate the whole manifest sequence once. This also verifies the full
// source digest; all final body asset digests must match, even for cancellation.
async function expectedStages(intent) {
  const manifests = await adminTemplatePhotoWholeCopyStageManifests(intent), assets = flatAssets(intent);
  for (const [index, manifest] of manifests.entries()) if (await digest(manifest) !== assets[index].assetDigest) throw Error("whole-copy-stage-binding");
  return { manifests, assets };
}
function stagesMatch(stages, expected) {
  if (!Array.isArray(stages) || stages.length !== expected.assets.length) return false;
  const sourcePaths = new Map(), targetPaths = new Map(); let owners;
  for (const [index, data] of stages.entries()) {
    if (!stageShape(data, expected.manifests[index], expected.assets[index].assetDigest)) return false;
    const r = data.receipt, pair = [r.sourceOwnerId, r.ownerId];
    if (owners && !same(pair, owners)) return false; owners = pair;
    for (const variant of ["file", "thumb"]) {
      const sourcePath = r.materialization.source[`${variant}PathDigest`], sourceBytes = physical(r.sourceStored[variant]);
      if (sourcePaths.has(sourcePath) && !same(sourcePaths.get(sourcePath), sourceBytes)) return false;
      sourcePaths.set(sourcePath, sourceBytes);
      const targetPath = r.materialization.target[`${variant}PathDigest`], targetBytes = physical(r.stored[variant]);
      const prior = targetPaths.get(targetPath);
      // A file and its identical thumbnail may share their own path. No other
      // target stage may share it, even when it claims identical bytes.
      if (prior && (prior.index !== index || !same(prior.bytes, targetBytes))) return false;
      targetPaths.set(targetPath, { index, bytes: targetBytes });
    }
  }
  return [...sourcePaths.keys()].every(path => !targetPaths.has(path));
}
export async function validateAdminTemplatePhotoWholeCopyStages(input, values) {
  try {
    const intent = adminTemplatePhotoWholeCopyIntent(input), stages = clone(values);
    return stagesMatch(stages, await expectedStages(intent));
  } catch { return false; }
}

function resultStructure(result, intent) {
  const layoutId = `layout-${intent.id}`;
  return exact(result, ["version", "sourceOwnerId", "ownerId", "layoutId", "owners", "confirmedPayload", "confirmedPayloadDigest"])
    && result.version === 3 && ownerId(result.sourceOwnerId) && result.ownerId === intent.actorId && result.layoutId === layoutId
    && hash(result.confirmedPayloadDigest) && bytes(result).byteLength <= maxReceiptBytes
    && same(result.confirmedPayload, adminTemplatePhotoWholeCopyPayload(intent, result.owners));
}
export function validateAdminTemplatePhotoWholeCopyResultStructure(input, value) {
  try { return resultStructure(clone(input), adminTemplatePhotoWholeCopyIntent(value)); } catch { return false; }
}
async function resultMatches(result, intent, stages, expected) {
  if (!resultStructure(result, intent) || !stagesMatch(stages, expected) || !allowedUrls(result, intent)
    || await digest(result.confirmedPayload) !== result.confirmedPayloadDigest) return false;
  const added = flatAdded(result);
  return stages.every((stage, index) => stage.receipt.ownerId === result.ownerId && stage.receipt.sourceOwnerId === result.sourceOwnerId
    && ["fileName", "type", "size", "width", "height"].every(key => added[index].photo[key] === stage.receipt.stored.file[key]));
}
export async function validateAdminTemplatePhotoWholeCopyResult(input, expected) {
  try {
    const result = clone(input), intent = adminTemplatePhotoWholeCopyIntent(expected.intent), stages = clone(expected.stageReceipts);
    return await resultMatches(result, intent, stages, await expectedStages(intent));
  } catch { return false; }
}

// Deliberately separate from the ordinary/v1 parser. The HTTP adapter must first
// require exactly {ok:true,operation,result}, then pass {operation,result} here.
// A valid rejection is a terminal fact, not a parent-fence certificate or GC.
export async function validateAdminTemplatePhotoWholeCopyReceipt(input, expected) {
  try {
    const receipt = clone(input), intent = adminTemplatePhotoWholeCopyIntent(expected.intent), payloadDigest = expected.payloadDigest;
    const stages = expected.stageReceipts === undefined ? undefined : clone(expected.stageReceipts);
    if (!hash(payloadDigest) || bytes(receipt).byteLength > maxReceiptBytes || !exact(receipt, ["operation", "result"])
      || !exact(receipt.operation, ["id", "environment", "actorId", "listId", "itemKey", "kind", "payloadDigest", "state"])
      || !["id", "environment", "actorId", "listId", "itemKey", "kind"].every(key => receipt.operation[key] === intent[key])
      || receipt.operation.payloadDigest !== payloadDigest || !exact(receipt.result, ["status", "payload"])) return false;
    const { id: _id, ...encoded } = intent;
    if (await digest(encoded) !== payloadDigest) return false;
    const prepared = await expectedStages(intent), { status, payload } = receipt.result;
    if (receipt.operation.state === "rejected") {
      if (![403, 404, 409].includes(status) || payload?.ok !== false || typeof payload.code !== "string" || !/^[a-z_]{1,80}$/.test(payload.code)) return false;
      if (payload.code !== "operation_cancelled") return exact(payload, ["ok", "code"]);
      return status === 409 && exact(payload, ["ok", "code", "cancellation"]) && same(payload.cancellation, {
        version: 1, operationId: intent.id, noBusinessEffects: true, operationCannotApply: true });
    }
    if (receipt.operation.state !== "committed" || status !== 200
      || !exact(payload, ["ok", "listId", "itemKey", "stateRevision", "visibility", "indexes", "photoCopy"])
      || payload.ok !== true || payload.listId !== intent.listId || payload.itemKey !== intent.itemKey
      || payload.stateRevision !== 1
      || payload.visibility !== "private" || !Array.isArray(payload.indexes) || payload.indexes.length) return false;
    return await resultMatches(payload.photoCopy, intent, stages, prepared);
  } catch { return false; }
}
