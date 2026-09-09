import { createPersonalPhotoInventoryCodec } from "./personal-photo-inventory-codec.js";
import { personalPhotoFormManifest } from "./personal-photo-form-protocol.js";
import { personalManufacturerPhotoFormSource } from "./personal-manufacturer-photo-source.js";
import { assertListOperationPayload } from "./list-operation-payload.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";

const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "constructor", "prototype"].includes(value);
const invalid = () => { throw Object.assign(new Error("Карточка и полный файловый пакет не совпадают. Отправка остановлена."), { code: "photo-form-record" }); };
function validateIntent({ binding, action, snapshot, files }) {
  if (binding?.environment !== "bike-packing-experiment" || !id(binding.actorId) || binding.actorId.length > 36
    || binding.scopeKey !== `id:${binding.actorId}` || !id(binding.listId) || !uuid(action?.operationId)
    || action.kind !== "photos.mutate" || action.listId !== binding.listId
    || ["environment", "actorId", "scopeKey"].some(key => action[key] !== undefined && action[key] !== binding[key]) || !Array.isArray(files)) invalid();
  assertListOperationPayload({ ...binding, ...action });
  assertListOperationPayload({ ...binding, kind: "photos.mutate", body: snapshot });
  const manifest = personalPhotoFormManifest(action.body), owner = snapshot?.[manifest.entityType === "item" ? "items" : "containers"]?.[manifest.entityId];
  const attachments = manifest.photos.filter(entry => entry.action === "attach");
  if (manifest.manufacturerSource && !same(owner?.manufacturerCatalogSource, personalManufacturerPhotoFormSource(action.body).manufacturerCatalogSource)) invalid();
  if (!attachments.length || files.length !== attachments.length
    || !owner || owner.id !== manifest.entityId || !same(owner.photos?.map(photo => photo.id), manifest.photos.at(-1).photoIds)
    || Object.entries(manifest.fields).some(([key, value]) => key === "dimensions" && value === null
      ? Object.hasOwn(owner, key) : !Object.hasOwn(owner, key) || !same(owner[key], value))) invalid();
  for (const [index, part] of files.entries()) {
    const entry = attachments[index], stage = part?.stage;
    if (stage?.operationId !== entry.assetId || stage.operationId === action.operationId || stage.photoId !== entry.photoId
      || stage.entityType !== manifest.entityType || stage.entityId !== manifest.entityId
      || typeof stage.fileName !== "string" || !stage.fileName || stage.fileName.length > 255) invalid();
    const photo = owner.photos.find(photo => photo.id === entry.photoId);
    if (!same(photo, { id: entry.photoId, photoId: entry.photoId, assetId: entry.assetId, listId: binding.listId, status: "pending" })) invalid();
  }
}

// Version-two inventory retains the REAL form action, never a rewritten batch.
// Old readers may quarantine it; they cannot interpret it as photo-only work.
const codec = createPersonalPhotoInventoryCodec({ validateIntent, invalid });
export const encodePersonalPhotoFormRecord = codec.encode;
export const decodePersonalPhotoFormRecord = codec.decode;
