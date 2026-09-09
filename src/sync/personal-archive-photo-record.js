import { createPersonalPhotoInventoryCodec } from "./personal-photo-inventory-codec.js";
import { assertListOperationPayload } from "./list-operation-payload.js";
import { personalArchiveJson } from "./personal-archive-import-protocol.js";
import { personalArchivePayloadWithPhotos } from "./personal-archive-photo-plan.js";
import { personalArchivePhotoManifest, assertPersonalArchivePhotoHashes } from "./personal-archive-photo-protocol.js";

const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "constructor", "prototype"].includes(value);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const invalid = () => { throw Object.assign(Error("Сохранённый архив и его файлы не совпадают. Отправка остановлена."), { code: "archive-photo-record" }); };
function validateIntent({ binding, action, snapshot, files }) {
  if (binding?.environment !== "bike-packing-experiment" || !id(binding.actorId) || binding.actorId.length > 36
    || !id(binding.listId) || binding.scopeKey !== `id:${binding.actorId}` || !uuid(action?.operationId)
    || action.kind !== "list.import" || action.listId !== binding.listId
    || ["environment", "actorId", "scopeKey"].some(key => action[key] !== undefined && action[key] !== binding[key])) invalid();
  assertListOperationPayload({ ...binding, ...action }); assertListOperationPayload({ ...binding, kind: action.kind, body: snapshot });
  const manifest = personalArchivePhotoManifest(action.body?.archiveImport);
  if (!Array.isArray(files) || files.length !== manifest.files.length || !files.length
    || action.body.baseStateRevision !== manifest.targetStateRevision || !same(personalArchivePayloadWithPhotos(snapshot), action.body.payload)) invalid();
  const stages = new Set();
  for (const [index, part] of files.entries()) {
    const expected = manifest.files[index], stage = part?.stage;
    if (!stage || !uuid(stage.operationId) || stage.operationId === action.operationId || stages.has(stage.operationId)
      || !same(stage, { operationId: expected.assetId, photoId: expected.photoId, entityType: expected.entityType, entityId: expected.entityId, fileName: expected.file.fileName })) invalid();
    stages.add(stage.operationId);
    const owner = snapshot[expected.entityType === "item" ? "items" : "containers"][expected.entityId];
    if (!owner || !same(owner.photos?.find(photo => photo.id === expected.photoId), {
      id: expected.photoId, photoId: expected.photoId, assetId: expected.assetId, listId: binding.listId, status: "pending"
    })) invalid();
  }
}
const codec = createPersonalPhotoInventoryCodec({ validateIntent, invalid });
const verify = saved => {
  const manifest = personalArchivePhotoManifest(saved.action.body.archiveImport);
  for (const [index, part] of saved.files.entries()) {
    const expected = manifest.files[index];
    if (!same(part.fileMetadata, { hash: expected.file.hash, size: expected.file.size, type: expected.file.type })
      || !same(part.thumbMetadata, expected.thumb)) invalid();
  }
  return saved;
};

export async function encodePersonalArchivePhotoRecord(input) {
  const binding = JSON.parse(JSON.stringify(input.binding)), operationId = input.action.operationId;
  const record = await codec.encode(input);
  const saved = await decodePersonalArchivePhotoRecord(record, binding, operationId);
  verify(saved); return record;
}
export async function decodePersonalArchivePhotoRecord(record, binding, operationId) {
  const saved = await codec.decode(record, binding, operationId);
  await assertPersonalArchivePhotoHashes(saved.action.body); return verify(saved);
}
