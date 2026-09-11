import { canonicalTemplateJson, adminTemplateIntent } from "./admin-template-protocol.js";
import { adminTemplatePhotoAppend, adminTemplatePhotoStageManifest, adminTemplatePhotoStageDigest } from "./admin-template-photo-append-protocol.js";
import { assertAdminTemplatePhotoOwnerMap } from "./admin-template-photo-owner-map.js";
import { assertAdminTemplatePhotoView } from "./admin-template-photo-view.js";
import { createPersonalPhotoInventoryCodec } from "./personal-photo-inventory-codec.js";
import { recoverPersonalAdminDrafts } from "./personal-admin-draft-recovery.js";

const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const invalid = () => { throw Object.assign(Error("Полное действие шаблона и сохранённые файлы не совпадают. Отправка остановлена."),
  { code: "admin-template-photo-record", isAdminTemplateBlocked: true }); };
const clone = value => JSON.parse(canonicalTemplateJson(value));
const same = (left, right) => canonicalTemplateJson(left) === canonicalTemplateJson(right);
const types = ["items", "containers"];
const formFields = Object.freeze(["name", "weight", "color", "location", "category", "categories", "note", "dimensions",
  "updatedAt", "updatedByDeviceId", "updatedByDeviceName"]);
export function adminTemplatePhotoFormFieldNames(entityType) {
  if (!["item", "container"].includes(entityType)) invalid();
  return [...formFields, ...(entityType === "item" ? ["quantity"] : ["volume", "nestable"])];
}
const photos = row => {
  if (!plain(row) || Object.hasOwn(row, "photos") && !Array.isArray(row.photos)) invalid();
  return row.photos || [];
};

export function adminTemplatePhotoActionBinding(binding) {
  if (!exact(binding, ["actorId", "environment", "listId", "itemKey"]) || binding.environment !== "bike-packing-experiment"
    || typeof binding.actorId !== "string" || !binding.actorId || binding.actorId.length > 36 || binding.actorId !== binding.actorId.trim()
    || typeof binding.listId !== "string" || binding.listId.length > 64) invalid();
  const list = binding.listId, expected = list === "public-demo-state" ? "demo-state"
    : /^public-demo-state-[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(list) ? `demo-state:${list.slice(18)}`
      : /^public-shared-layout-[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(list) ? `shared-layout:${list.slice(21)}` : null;
  if (!expected || binding.itemKey !== expected) invalid();
  return clone(binding);
}

function validateIntent({ binding, action, snapshot, files }) {
  adminTemplatePhotoActionBinding(binding);
  if (!exact(action, ["operationId", "kind", "listId", "itemKey", "body"]) || action.kind !== "template.save"
    || action.listId !== binding.listId || action.itemKey !== binding.itemKey
    || !exact(action.body, ["version", "base", "payload", "metadata", "photoAppend"])
    || !exact(snapshot, ["version", "layoutId", "ownerMap", "sourcePayload", "state", "metadata"])
      && !exact(snapshot, ["version", "layoutId", "ownerMap", "sourcePayload", "state", "metadata", "beforeState"]) || snapshot.version !== 1) invalid();
  canonicalTemplateJson({ binding, action, snapshot, files });
  const append = adminTemplatePhotoAppend(action.body, action.operationId);
  const { photoAppend, ...ordinaryBody } = action.body;
  // The separate append grammar adds no bypass to ordinary template fields.
  adminTemplateIntent({ ...binding, ...action, body: ordinaryBody });
  const { state, sourcePayload, ownerMap, layoutId } = snapshot, revision = action.body.base.stateRevision;
  assertAdminTemplatePhotoOwnerMap({ binding, layoutId, stateRevision: revision, map: ownerMap, state, sourcePayload });
  if (Object.keys(state.layouts).length !== 1 || state.activeLayoutId !== layoutId || Object.keys(sourcePayload.layouts).length !== 1
    || !same(snapshot.metadata, action.body.metadata) || !plain(action.body.payload.layouts) || Object.keys(action.body.payload.layouts).length !== 1
    || !Array.isArray(files) || files.length !== append.assets.length) invalid();
  const source = state.layouts[layoutId].adminCausalSource;
  if (!plain(source) || !same(source.binding, binding) || source.exists !== true || source.deleted
    || source.visibility !== "private" || source.planId || !exact(source.base, ["stateRevision"]) || source.base.stateRevision !== revision) invalid();
  // Reuse the existing strict administrative-namespace/link validator without
  // importing any private state or changing a personal authorization rule.
  const owned = recoverPersonalAdminDrafts({ layouts: {}, items: {}, containers: {} }, canonicalTemplateJson(state),
    { scopeKey: `id:${binding.actorId}`, enabled: true });
  if ([...types, "layouts"].some(collection => !same(owned[collection], state[collection]))) invalid();
  for (const type of types) {
    if (Object.values(state[type]).some(row => row.publicCatalogLayoutId !== layoutId)
      || !same(Object.keys(action.body.payload[type]).sort(), Object.keys(sourcePayload[type]).sort())) invalid();
    for (const [serverId, row] of Object.entries(sourcePayload[type])) {
      if (action.body.payload[type][serverId]?.id !== serverId || !same(photos(row), photos(action.body.payload[type][serverId]))) invalid();
    }
  }
  const first = append.assets[0], type = first.entityType === "item" ? "items" : "containers";
  const owner = ownerMap.owners.find(value => value.type === type && value.serverId === first.entityId);
  if (!owner) invalid();
  // A form append edits one existing raw owner. General export normalization
  // must not silently rewrite arrangements, dictionaries or unknown fields.
  const allowedFields = adminTemplatePhotoFormFieldNames(first.entityType);
  const rawProjection = value => {
    const result = clone(value);
    for (const field of allowedFields) delete result[type][owner.serverId][field];
    return result;
  };
  if (!same(rawProjection(sourcePayload), rawProjection(action.body.payload))) invalid();
  const rawBefore = sourcePayload[type][owner.serverId], rawAfter = action.body.payload[type][owner.serverId];
  for (const field of allowedFields) {
    const value = row => Object.hasOwn(row, field) ? [row[field]] : [];
    if (!same(value(rawBefore), value(rawAfter)) && !same(value(rawAfter), value(state[type][owner.localId]))) invalid();
  }
  const selected = photos(state[type][owner.localId]), old = photos(sourcePayload[type][owner.serverId]);
  if (selected.length !== old.length + files.length) invalid();
  for (const [index, part] of files.entries()) {
    if (!exact(part, ["stage"]) && !exact(part, ["stage", "file", "thumb"])) invalid();
    const stage = adminTemplatePhotoStageManifest(part.stage), asset = append.assets[index], photo = selected[old.length + index];
    if (Object.keys(binding).some(key => stage[key] !== binding[key]) || stage.templateOperationId !== action.operationId
      || stage.baseStateRevision !== revision || stage.operationId !== asset.assetId || stage.entityType !== asset.entityType
      || stage.entityId !== asset.entityId || stage.photoId !== asset.photoId || !plain(photo)
      || photo.id !== stage.photoId || photo.localId !== stage.photoId || photo.status !== "pending" || photo.url !== "" || photo.thumbUrl !== ""
      || Object.hasOwn(photo, "assetId") || Object.hasOwn(photo, "photoId") && photo.photoId !== photo.id
      || Object.hasOwn(photo, "listId") && photo.listId !== "" && photo.listId !== binding.listId
      || photo.fileName !== stage.file.fileName || photo.type !== stage.file.type || photo.size !== stage.file.size
      || ["_copyToCurrentList", "copyToCurrentList", "publicCopySourceId", "sharedSourceId"].some(key => photo[key])) invalid();
    if (Object.hasOwn(part, "file")) {
      if (!exact(part.file, ["hash", "size", "type"]) || !same(part.file, { hash: stage.file.hash, size: stage.file.size, type: stage.file.type })
        || !same(part.thumb, stage.thumb)) invalid();
    }
  }
  const unchanged = clone(state);
  unchanged[type][owner.localId].photos = selected.slice(0, old.length);
  if (Object.hasOwn(snapshot, "beforeState")) {
    const before = snapshot.beforeState;
    assertAdminTemplatePhotoOwnerMap({ binding, layoutId, stateRevision: revision, map: ownerMap, state: before, sourcePayload });
    if (!same(before.layouts, state.layouts) || before.activeLayoutId !== layoutId
      || !same(before.locations, state.locations) || !same(before.categories, state.categories)
      || !same(before.packedItems, state.packedItems)) invalid();
    const allowed = [...allowedFields, "photos"];
    const projection = value => { const result = clone(value); for (const field of allowed) delete result[type][owner.localId][field]; return result; };
    if (!same(projection(before), projection(unchanged))) invalid();
    assertAdminTemplatePhotoView({ binding, layoutId, baseline: source.photoView, state: before });
  }
  assertAdminTemplatePhotoView({ binding, layoutId, baseline: source.photoView, state: unchanged });
  for (const previous of source.photoView?.owners || []) {
    const identity = ownerMap.owners.find(value => value.type === previous.type && value.localId === previous.localId);
    if (!identity || identity.serverId !== previous.serverId || !same(previous.rawPhotos, photos(sourcePayload[previous.type][previous.serverId]))) invalid();
  }
}

const codec = createPersonalPhotoInventoryCodec({ validateIntent, invalid });
async function verified(record, binding, operationId) {
  if (!exact(record, ["version", "key", "bindingKey", "intentJson", "intentHash", "files"])
    || !Array.isArray(record.files) || record.files.some(part => !exact(part, ["stageOperationId", "file", "thumb"]))) invalid();
  const decoded = await codec.decode(record, adminTemplatePhotoActionBinding(binding), operationId);
  for (const [index, part] of decoded.files.entries()) {
    const asset = decoded.action.body.photoAppend.assets[index];
    if (await adminTemplatePhotoStageDigest(part.stage) !== asset.assetDigest
      || !same(part.fileMetadata, { hash: part.stage.file.hash, size: part.stage.file.size, type: part.stage.file.type })
      || !same(part.thumbMetadata, part.stage.thumb)) invalid();
  }
  return decoded;
}

export async function encodeAdminTemplatePhotoRecord(input) {
  try {
    const frozen = { binding: adminTemplatePhotoActionBinding(input.binding), action: clone(input.action), snapshot: clone(input.snapshot),
      files: input.files?.map(part => ({ stage: clone(part.stage), file: part.file, thumb: part.thumb ?? null })) };
    const record = await codec.encode(frozen);
    await verified(record, frozen.binding, frozen.action.operationId);
    return record;
  } catch (error) { if (error.code === "admin-template-photo-record") throw error; invalid(); }
}

export async function decodeAdminTemplatePhotoRecord(record, binding, operationId) {
  try { return await verified(record, binding, operationId); }
  catch (error) { if (error.code === "admin-template-photo-record") throw error; invalid(); }
}
