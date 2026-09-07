import { personalPhotoPublicationManifest } from "./personal-photo-publication-protocol.js";
import { assertListOperationPayload } from "./list-operation-payload.js";

// Codec only. Its single complete record is intended for one strict IDB
// transaction; it does not write storage or authorize staging/publication.
const clone = value => JSON.parse(JSON.stringify(value));
const uuid = id => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
const validId = id => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(id)
  && !["__proto__", "constructor", "prototype"].includes(id);
const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
const invalid = () => { throw Object.assign(new Error("Файловый пакет неполон или изменён. Отправка остановлена."), { code: "photo-batch-record" }); };
const mime = type => ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(type);

function validateIntent(intent) {
  const { binding, action, snapshot, files } = intent;
  if (binding?.environment !== "bike-packing-experiment" || !validId(binding.actorId) || binding.actorId.length > 36
    || binding.scopeKey !== `id:${binding.actorId}` || !validId(binding.listId)
    || !uuid(action?.operationId) || action.kind !== "photos.mutate" || action.listId !== binding.listId
    || ["environment", "actorId", "scopeKey"].some(key => action[key] !== undefined && action[key] !== binding[key])
    || action.body?.action !== "batch" || !Array.isArray(files)) invalid();
  assertListOperationPayload({ ...binding, ...action });
  const manifest = personalPhotoPublicationManifest(action.body);
  if (files.length !== manifest.length || manifest.some(change => change.action !== "attach")) invalid();
  const ownerFinal = new Map();
  for (const entry of manifest) ownerFinal.set(`${entry.entityType}:${entry.entityId}`, entry);
  for (const entry of ownerFinal.values()) {
    const owner = snapshot?.[entry.entityType === "item" ? "items" : "containers"]?.[entry.entityId];
    if (owner?.id !== entry.entityId || JSON.stringify(owner.photos?.map(photo => photo.id)) !== JSON.stringify(entry.photoIds)) invalid();
  }
  for (const [index, part] of files.entries()) {
    const change = manifest[index], stage = part?.stage;
    if (stage?.operationId !== change.assetId || stage.operationId === action.operationId || stage.photoId !== change.photoId
      || stage.entityType !== change.entityType || stage.entityId !== change.entityId
      || typeof stage.fileName !== "string" || !stage.fileName || stage.fileName.length > 255) invalid();
    const photo = snapshot[change.entityType === "item" ? "items" : "containers"][change.entityId].photos.find(photo => photo.id === change.photoId);
    if (photo?.status !== "pending" || photo.assetId !== change.assetId || photo.photoId !== change.photoId || photo.listId !== binding.listId) invalid();
  }
  return manifest;
}

export async function encodePersonalPhotoBatchRecord({ binding, action, snapshot, files }) {
  // Freeze all metadata before the first file.arrayBuffer() yields. Blob bytes
  // are immutable; caller edits to the selection array cannot replace them.
  const selected = files?.map(part => ({ file: part.file, thumb: part.thumb ?? null }));
  const intent = clone({ binding, action, snapshot, files: files?.map(part => ({ stage: part.stage })) });
  validateIntent(intent);
  if (new TextEncoder().encode(JSON.stringify(intent.snapshot)).byteLength > 2 * 1024 * 1024) invalid();
  let total = 0;
  const materialize = async blob => {
    if (!(blob instanceof Blob) || !mime(blob.type) || blob.size <= 0 || blob.size > 10 * 1024 * 1024) invalid();
    total += blob.size; if (total > 50 * 1024 * 1024) invalid();
    const bytes = await blob.arrayBuffer();
    return { bytes, metadata: { size: bytes.byteLength, type: blob.type, hash: await sha(bytes) } };
  };
  const bytes = [];
  for (const [index, part] of selected.entries()) {
    const file = await materialize(part.file), thumb = part.thumb ? await materialize(part.thumb) : null;
    Object.assign(intent.files[index], { file: file.metadata, thumb: thumb?.metadata || null });
    bytes.push({ stageOperationId: intent.files[index].stage.operationId, file: file.bytes, thumb: thumb?.bytes || null });
  }
  const bindingKey = JSON.stringify(intent.binding), intentJson = JSON.stringify(intent);
  return { version: 2, key: JSON.stringify([bindingKey, intent.action.operationId]), bindingKey, intentJson,
    intentHash: await sha(new TextEncoder().encode(intentJson)), files: bytes };
}

export async function decodePersonalPhotoBatchRecord(record, binding, operationId) {
  if (!Array.isArray(record?.files) || record.files.length > 50 || typeof record.intentJson !== "string"
    || new TextEncoder().encode(record.intentJson).byteLength > 6 * 1024 * 1024
    || record.files.reduce((sum, part) => sum + (part?.file?.byteLength || 0) + (part?.thumb?.byteLength || 0), 0) > 50 * 1024 * 1024) invalid();
  // Verification and returned Blobs must observe the same bytes even if the
  // caller mutates its buffers while SHA-256 is awaiting completion.
  record = structuredClone(record); binding = clone(binding);
  if (!record || record.version !== 2 || !uuid(operationId) || record.bindingKey !== JSON.stringify(binding)
    || record.key !== JSON.stringify([record.bindingKey, operationId]) || typeof record.intentJson !== "string"
    || await sha(new TextEncoder().encode(record.intentJson)) !== record.intentHash) invalid();
  let intent;
  try { intent = JSON.parse(record.intentJson); } catch { invalid(); }
  validateIntent(intent);
  if (intent.action.operationId !== operationId || JSON.stringify(intent.binding) !== JSON.stringify(binding)
    || !Array.isArray(record.files) || record.files.length !== intent.files.length) invalid();
  let total = 0;
  const verify = async (bytes, metadata) => {
    if (!metadata) { if (bytes !== null) invalid(); return null; }
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== metadata.size || metadata.size <= 0 || metadata.size > 10 * 1024 * 1024
      || !mime(metadata.type) || await sha(bytes) !== metadata.hash) invalid();
    total += bytes.byteLength; if (total > 50 * 1024 * 1024) invalid();
    return new Blob([bytes], { type: metadata.type });
  };
  const files = [];
  for (const [index, part] of intent.files.entries()) {
    const stored = record.files[index];
    if (stored?.stageOperationId !== part.stage.operationId || !part.file) invalid();
    files.push({ stage: part.stage, file: await verify(stored.file, part.file), thumb: await verify(stored.thumb, part.thumb),
      fileMetadata: part.file, thumbMetadata: part.thumb });
  }
  return { ...intent, intentHash: record.intentHash, files };
}
