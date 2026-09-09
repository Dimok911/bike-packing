import { personalArchiveBusinessPayload, personalArchiveImportPlan } from "./personal-archive-import-plan.js";

// Pure preparation only. The adapter must separately store every file and use
// the protected list revision transaction before installing any references.
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "constructor", "prototype"].includes(value);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const mime = value => ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(value);
const binary = (value, original) => plain(value) && same(Object.keys(value).sort(), (original ? ["hash", "size", "type", "fileName"] : ["hash", "size", "type"]).sort())
  && hash(value.hash) && Number.isSafeInteger(value.size) && value.size > 0 && value.size <= 10 * 1024 * 1024 && mime(value.type)
  && (!original || typeof value.fileName === "string" && value.fileName.length > 0 && value.fileName.length <= 255);
const fail = () => { throw Object.assign(Error("Состав фотографий выбранного архива не подтверждён. Импорт остановлен."), { code: "archive-photo-plan" }); };
const fields = [["items", "item"], ["containers", "container"]];
const photoKey = photo => photo.id || photo.localId;

export function personalArchivePayloadWithPhotos(value) {
  if (!plain(value)) fail();
  const without = clone(value);
  for (const [collection] of fields) {
    if (!plain(without[collection])) fail();
    for (const owner of Object.values(without[collection])) {
      if (!plain(owner) || Object.hasOwn(owner, "photos") && !Array.isArray(owner.photos)) fail();
      if (owner.photos) owner.photos = [];
    }
  }
  const payload = personalArchiveBusinessPayload(without);
  for (const [collection] of fields) for (const [ownerId, owner] of Object.entries(payload[collection])) {
    if (Object.hasOwn(value[collection][ownerId], "photos")) owner.photos = clone(value[collection][ownerId].photos);
    const ids = new Set();
    for (const photo of owner.photos || []) {
      if (!plain(photo) || !id(photoKey(photo)) || ids.has(photoKey(photo))) fail();
      ids.add(photoKey(photo));
    }
  }
  return payload;
}

function stripped(payload) {
  const value = clone(payload);
  for (const [collection] of fields) for (const owner of Object.values(value[collection])) if (owner.photos) owner.photos = [];
  return value;
}

function confirmedInventory(payload, listId) {
  if (!id(listId)) fail();
  const ids = new Set(), assets = new Set(), result = [];
  const keys = ["id", "photoId", "assetId", "listId", "status", "url", "thumbUrl", "fileName", "type", "size", "width", "height"].sort();
  for (const [collection, entityType] of fields) for (const owner of Object.values(payload[collection])) for (const photo of owner.photos || []) {
    if (!same(Object.keys(photo).sort(), keys) || photo.status !== "synced" || photo.photoId !== photo.id || photo.listId !== listId
      || !uuid(photo.assetId) || ids.has(photo.id) || assets.has(photo.assetId)
      || ["url", "thumbUrl", "fileName", "type"].some(key => typeof photo[key] !== "string" || !photo[key])
      || ["size", "width", "height"].some(key => !Number.isFinite(photo[key]) || photo[key] < 0)) fail();
    ids.add(photo.id); assets.add(photo.assetId);
    result.push({ entityType, entityId: owner.id, photoId: photo.id, assetId: photo.assetId });
  }
  return { ids, assets, result };
}

export function personalArchivePhotoSelection({ currentPayload, sourcePayload, listId, ...choice }) {
  currentPayload = personalArchivePayloadWithPhotos(currentPayload); sourcePayload = personalArchivePayloadWithPhotos(sourcePayload);
  const inventory = confirmedInventory(currentPayload, listId);
  const plan = personalArchiveImportPlan({ ...choice, currentPayload: stripped(currentPayload), sourcePayload: stripped(sourcePayload) });
  const selected = { items: new Set(), containers: new Set() };
  if (choice.mode === "full") for (const [collection] of fields) Object.keys(sourcePayload[collection]).forEach(id => selected[collection].add(id));
  else for (const target of choice.layoutTargets) {
    const arrangement = sourcePayload.layouts[target.sourceId].arrangement;
    for (const [collection] of fields) Object.keys(arrangement[collection]).forEach(id => selected[collection].add(id));
  }
  const owners = [];
  for (const [collection, entityType] of fields) for (const ownerId of selected[collection]) {
    const existingIds = new Set((currentPayload[collection][ownerId]?.photos || []).map(photoKey));
    const photos = (sourcePayload[collection][ownerId].photos || []).filter(photo => choice.mode === "full" || !existingIds.has(photoKey(photo)));
    if (photos.length) owners.push({ entityType, sourceId: ownerId, targetId: ownerId, photos: clone(photos) });
  }
  return { plan, owners, currentPayload, sourcePayload, currentPhotos: inventory.result };
}

export function personalArchivePhotoPlan(input, files) {
  const selection = personalArchivePhotoSelection(input), { plan, owners, currentPayload, sourcePayload, currentPhotos } = selection;
  if (!Array.isArray(files) || files.length > 50) fail();
  const payload = clone(plan.payload), expected = owners.flatMap(owner => owner.photos.map(photo => ({ owner, photo })));
  if (files.length !== expected.length) fail();
  const used = new Set(currentPhotos.flatMap(photo => [photo.photoId, photo.assetId]));
  for (const [collection] of fields) for (const owner of Object.values(sourcePayload[collection])) for (const photo of owner.photos || []) used.add(photoKey(photo));
  // Start with the exact current references for selected merges. Full restores
  // replace all archived references with new IDs backed by the selected bytes.
  for (const [collection] of fields) for (const [ownerId, owner] of Object.entries(payload[collection])) {
    const original = input.mode === "full" ? sourcePayload[collection][ownerId] : currentPayload[collection][ownerId] || sourcePayload[collection][ownerId];
    if (Object.hasOwn(original, "photos")) owner.photos = input.mode !== "full" && currentPayload[collection][ownerId] ? clone(original.photos) : [];
  }
  const attachments = []; let total = 0;
  for (const [index, file] of files.entries()) {
    const { owner, photo } = expected[index], collection = owner.entityType === "item" ? "items" : "containers";
    if (!plain(file) || file.entityType !== owner.entityType || file.entityId !== owner.targetId || file.sourcePhotoId !== photoKey(photo)
      || !same(Object.keys(file).sort(), ["entityType", "entityId", "sourcePhotoId", "photoId", "assetId", "file", "thumb"].sort())
      || !uuid(file.photoId) || !uuid(file.assetId) || used.has(file.photoId) || used.has(file.assetId) || file.photoId === file.assetId
      || !binary(file.file, true) || file.thumb !== null && !binary(file.thumb, false)) fail();
    total += file.file.size + (file.thumb?.size || 0); if (total > 50 * 1024 * 1024) fail();
    used.add(file.photoId); used.add(file.assetId);
    const target = payload[collection][owner.targetId]; target.photos ||= [];
    const position = target.photos.length;
    target.photos.push({ id: file.photoId, photoId: file.photoId, assetId: file.assetId, listId: input.listId, status: "pending" });
    attachments.push({ entityType: owner.entityType, entityId: owner.targetId, sourcePhotoId: file.sourcePhotoId,
      photoId: file.photoId, assetId: file.assetId, index: position, file: clone(file.file), thumb: clone(file.thumb) });
  }
  const surviving = new Set(fields.flatMap(([collection]) => Object.values(payload[collection]).flatMap(owner => (owner.photos || []).map(photoKey))));
  return { payload, attachments, deletions: currentPhotos.filter(photo => !surviving.has(photo.photoId)),
    activeLayoutId: plan.activeLayoutId, restoredLayoutIds: plan.restoredLayoutIds, createdOwners: plan.createdOwners };
}
