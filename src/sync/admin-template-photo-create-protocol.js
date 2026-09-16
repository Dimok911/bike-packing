import { canonicalAccessJson as canonical, validAccessOperationId as uuid } from "./personal-access-protocol.js";
import { adminTemplateIntent } from "./admin-template-protocol.js";
import { adminTemplatePhotoStageManifest } from "./admin-template-photo-append-protocol.js";

// Pure shared contract; callers separately gate runtime and form activation.
export const ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED = false;
export const TEMPLATE_PHOTO_CREATE_CAPABILITY = "adminTemplatePhotoCreateV1";
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value, max) => typeof value === "string" && value.length <= max;
const id = value => text(value, 191) && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value) && !["__proto__", "prototype", "constructor"].includes(value);
const photoId = value => id(value) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const number = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const date = value => text(value, 64) && Number.isFinite(Date.parse(value));
const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))), byte => byte.toString(16).padStart(2, "0")).join("");
const fail = () => { throw Object.assign(Error("Новая запись и фотографии требуют точного исходного шаблона."), { code: "admin-template-photo-create", isAdminTemplateBlocked: true }); };
const ids = values => Array.isArray(values) && values.every(id) && new Set(values).size === values.length;
const editFields = ["updatedAt", "updatedByDeviceId", "updatedByDeviceName"];
const commonFields = ["name", "weight", "color", "location", "category", "categories", "note", ...editFields];

// item-dialog-save + app-tail-controllers readForm; dimensions are the actual
// width/height/depth controls, not arbitrary new-owner JSON/provenance.
export function adminTemplatePhotoCreateFields(type) {
  if (!["item", "container"].includes(type)) fail();
  return [...commonFields, "dimensions", "createdAt", ...(type === "item" ? ["quantity"] : ["volume", "nestable"])];
}
function fieldsValid(fields, type) {
  const allowed = adminTemplatePhotoCreateFields(type), required = [...commonFields, ...(type === "item" ? ["quantity"] : ["volume", "nestable", "createdAt"])];
  if (!plain(fields) || required.some(key => !Object.hasOwn(fields, key)) || Object.keys(fields).some(key => !allowed.includes(key))
    || !text(fields.name, 255) || !fields.name.trim() || fields.name !== fields.name.trim() || !number(fields.weight)
    || !text(fields.color, 64) || !text(fields.location, 255) || !text(fields.category, 255) || !text(fields.note, 65536)
    || !Array.isArray(fields.categories) || fields.categories.length > 256 || fields.categories.some(value => !text(value, 255))
    || new Set(fields.categories).size !== fields.categories.length || fields.category !== (fields.categories[0] || "")
    || !date(fields.updatedAt) || !text(fields.updatedByDeviceId, 128) || !text(fields.updatedByDeviceName, 255)
    || Object.hasOwn(fields, "createdAt") && !date(fields.createdAt)
    || type === "item" && fields.quantity !== 1 || type === "container" && (!number(fields.volume) || typeof fields.nestable !== "boolean")) fail();
  if (Object.hasOwn(fields, "dimensions") && fields.dimensions !== null
    && (!exact(fields.dimensions, ["width", "height", "depth"]) || !Object.values(fields.dimensions).every(number)
      || !Object.values(fields.dimensions).some(value => value > 0))) fail();
}

// A raw administrative inventory: no private-owner predicate, normalization,
// display-ID inference or mutation of unknown fields. SQL absence is separate.
function inventory(payload, newId) {
  if (!plain(payload) || !["items", "containers", "layouts"].every(key => plain(payload[key])) || Object.keys(payload.layouts).length !== 1) fail();
  const seen = new Set(), photos = new Set();
  for (const type of ["items", "containers", "layouts"]) for (const [key, row] of Object.entries(payload[type])) {
    if (!id(key) || !plain(row) || row.id !== key || key === newId || seen.has(key)) fail(); seen.add(key);
  }
  const visit = (value, path = []) => {
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key !== "photos") { visit(child, [...path, key]); continue; }
      if (!Array.isArray(child)) fail();
      if (child.length && (path.length !== 2 || !["items", "containers"].includes(path[0]))) fail();
      for (const photo of child) {
        const key = photo?.id ?? photo?.photoId;
        if (!plain(photo) || !id(key) || photos.has(key) || Object.hasOwn(photo, "id") && photo.id !== key
          || Object.hasOwn(photo, "photoId") && photo.photoId !== key) fail();
        photos.add(key); visit(photo, [...path, "photos", key]);
      }
    }
  }; visit(payload);
  const layout = Object.values(payload.layouts)[0], a = layout.arrangement;
  if (!plain(a) || !ids(layout.rootContainerIds) || !ids(a.rootContainerIds) || !same(layout.rootContainerIds, a.rootContainerIds)
    || !["containers", "items", "itemQuantities", "packedItems"].every(key => plain(a[key]))) fail();
  const containers = new Set(), items = new Set();
  const walk = (key, parent) => {
    const row = a.containers[key];
    if (key === newId || containers.has(key) || !Object.hasOwn(payload.containers, key) || !plain(row) || row.parentId !== parent
      || !ids(row.childIds) || !ids(row.itemIds) || !Array.isArray(row.order)) fail();
    containers.add(key); const ordered = new Set();
    for (const entry of row.order) {
      if (!exact(entry, ["type", "id"]) || !["item", "container"].includes(entry.type)
        || !(entry.type === "item" ? row.itemIds : row.childIds).includes(entry.id) || ordered.has(entry.id)) fail();
      ordered.add(entry.id);
    }
    if (ordered.size !== row.childIds.length + row.itemIds.length) fail();
    for (const item of row.itemIds) {
      if (item === newId || items.has(item) || !Object.hasOwn(payload.items, item) || a.items[item] !== key || !positive(a.itemQuantities[item])) fail();
      items.add(item);
    }
    for (const child of row.childIds) walk(child, key);
  };
  for (const root of a.rootContainerIds) walk(root, "");
  if (Object.keys(a.containers).some(key => !containers.has(key)) || Object.keys(a.items).some(key => !items.has(key))
    || Object.keys(a.itemQuantities).some(key => !items.has(key))
    || Object.entries(a.packedItems).some(([key, value]) => !items.has(key) || typeof value !== "boolean")) fail();
  return { layout, containers, photos };
}

export function adminTemplatePhotoCreate(body, operationId) {
  const create = body?.photoCreate;
  if (!uuid(operationId) || !exact(body, ["version", "base", "payload", "metadata", "photoCreate"]) || body.version !== 1
    || !exact(body.base, ["stateRevision"]) || !positive(body.base.stateRevision)
    || !exact(create, ["version", "entityType", "entityId", "fields", "formContext", "assets"]) || create.version !== 1
    || !["item", "container"].includes(create.entityType) || !id(create.entityId)) fail();
  canonical(body); fieldsValid(create.fields, create.entityType);
  const source = inventory(body.payload, create.entityId), context = create.formContext, item = create.entityType === "item";
  if (!exact(context, item ? ["version", "availabilityStatus", "placement"] : ["version", "placement"]) || context.version !== 1
    || item && !["available", "lost", "broken", "retired"].includes(context.availabilityStatus)) fail();
  const place = context.placement;
  if (place !== null && (!exact(place, item ? ["layoutId", "containerId", "quantity"] : ["layoutId"])
    || place.layoutId !== source.layout.id || source.layout.locked
    || item && (!source.containers.has(place.containerId) || !positive(place.quantity) || context.availabilityStatus !== "available"))) fail();
  if (!Array.isArray(create.assets) || !create.assets.length || create.assets.length > 50) fail();
  const assets = new Set(), photos = new Set();
  for (const asset of create.assets) {
    if (!exact(asset, ["assetId", "assetDigest", "entityType", "entityId", "photoId"]) || !uuid(asset.assetId)
      || asset.assetId === operationId || assets.has(asset.assetId) || !hash(asset.assetDigest)
      || asset.entityType !== create.entityType || asset.entityId !== create.entityId || !photoId(asset.photoId)
      || photos.has(asset.photoId) || source.photos.has(asset.photoId)) fail();
    assets.add(asset.assetId); photos.add(asset.photoId);
  }
  return freeze(clone(create));
}

// Explicit create parser. The general FE parser stays closed until UI transport
// is wired; the BE may select this parser in its own gated gateway.
export function adminTemplatePhotoCreateIntent(input) {
  if (input?.kind !== "template.save" || Object.hasOwn(input, "environment") && input.environment !== "bike-packing-experiment") fail();
  const { photoCreate, ...ordinary } = input.body || {};
  const intent = adminTemplateIntent({ ...input, body: ordinary });
  adminTemplatePhotoCreate(input.body, input.operationId);
  const list = intent.listId, demoPrefix = "public-demo-state-", sharedPrefix = "public-shared-layout-";
  const target = list === "public-demo-state" ? "demo-state"
    : list.startsWith(demoPrefix) && id(list.slice(demoPrefix.length)) ? `demo-state:${list.slice(demoPrefix.length)}`
      : list.startsWith(sharedPrefix) && id(list.slice(sharedPrefix.length)) ? `shared-layout:${list.slice(sharedPrefix.length)}` : null;
  if (!target || target !== intent.itemKey || !ownerId(intent.actorId)) fail();
  const result = { ...intent, body: clone(input.body) };
  const { id: _id, ...encoded } = result;
  if (new TextEncoder().encode(canonical(encoded)).byteLength > 3 * 1024 * 1024) fail();
  return freeze(result);
}
function checkedIntent(input) {
  if (input?.id !== undefined && input?.operationId !== undefined && input.id !== input.operationId) fail();
  return adminTemplatePhotoCreateIntent({ ...input, operationId: input?.id ?? input?.operationId });
}

export function assertAdminTemplatePhotoCreateSource(sourcePayload, body, operationId) {
  adminTemplatePhotoCreate(body, operationId);
  if (!same(sourcePayload, body.payload)) fail();
  return true;
}

// Staging has a frozen target/owner ID, not a mutable form. Use the same source
// inventory without manufacturing fields or weakening the commit validator.
export function assertAdminTemplatePhotoCreateOwnerAbsent(payload, entityId) {
  if (!id(entityId)) fail();
  canonical(payload); inventory(payload, entityId);
  return true;
}

// Version 2 is CREATE-only. V1 remains strictly existing-owner staging.
export function adminTemplatePhotoCreateStageManifest(input) {
  if (input?.version !== 2) fail();
  const validated = adminTemplatePhotoStageManifest({ ...input, version: 1 });
  return freeze({ ...validated, version: 2 });
}
export async function adminTemplatePhotoCreateStageDigest(input) { return digest(adminTemplatePhotoCreateStageManifest(input)); }

const mime = value => ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(value);
const fileName = value => text(value, 255) && value.length > 0 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const size = value => positive(value) && value <= 10 * 1024 * 1024;
const dimension = value => value === null || positive(value);
function storedValid(stored, manifest) {
  const file = stored?.file, thumb = stored?.thumb;
  return exact(stored, ["file", "thumb"]) && exact(file, ["hash", "size", "type", "fileName", "width", "height"])
    && hash(file.hash) && size(file.size) && file.type === manifest.file.type && fileName(file.fileName) && dimension(file.width) && dimension(file.height)
    && exact(thumb, ["hash", "size", "type"]) && hash(thumb.hash) && size(thumb.size) && thumb.type === (manifest.thumb?.type || manifest.file.type)
    && (manifest.thumb !== null || same(thumb, { hash: file.hash, size: file.size, type: file.type }));
}
const ownerId = value => text(value, 36) && value.length > 0 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
export async function validateAdminTemplatePhotoCreateStageReceipt(input, expected) {
  try {
    const data = clone(input), manifest = adminTemplatePhotoCreateStageManifest(expected.manifest), assetDigest = expected.assetDigest;
    if (!hash(assetDigest) || assetDigest !== await digest(manifest) || !exact(data, ["ok", "receipt", "assetState"])
      || data.ok !== true || !["ready", "unavailable"].includes(data.assetState)) return false;
    const r = data.receipt;
    return exact(r, ["version", "manifest", "assetDigest", "ownerId", "baseEntityRevision", "stored"]) && r.version === 2
      && same(r.manifest, manifest) && r.assetDigest === assetDigest && ownerId(r.ownerId) && r.baseEntityRevision === 0 && storedValid(r.stored, manifest);
  } catch { return false; }
}
function photoRoute(value, listId, photo, variant) {
  if (!text(value, 4096) || !value) return false;
  try { const url = new URL(value, "https://photo-route.invalid");
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
      && url.pathname.endsWith(`/bike-packing/lists/${encodeURIComponent(listId)}/photos/${encodeURIComponent(photo)}/${variant}`);
  } catch { return false; }
}
function addedPhoto(added, asset, intent) {
  const photo = added?.photo;
  if (!exact(added, ["assetId", "assetDigest", "entityType", "entityId", "photo"])
    || ["assetId", "assetDigest", "entityType", "entityId"].some(key => added[key] !== asset[key])
    || !exact(photo, ["id", "photoId", "assetId", "listId", "status", "url", "thumbUrl", "fileName", "type", "size", "width", "height"])
    || photo.id !== asset.photoId || photo.photoId !== asset.photoId || photo.assetId !== asset.assetId || photo.listId !== intent.listId || photo.status !== "synced"
    || !fileName(photo.fileName) || !mime(photo.type) || !size(photo.size) || !dimension(photo.width) || !dimension(photo.height)
    || !photoRoute(photo.url, intent.listId, asset.photoId, "file") || !photoRoute(photo.thumbUrl, intent.listId, asset.photoId, "thumb")) fail();
  return clone(photo);
}

// Pure derivation. Only the new owner, selected placement links/mirrors and
// its layout edit metadata change. No old raw reference is normalized.
export function adminTemplatePhotoCreatePayload(input, added) {
  const intent = checkedIntent(input), create = intent.body.photoCreate, payload = clone(intent.body.payload);
  if (!Array.isArray(added) || added.length !== create.assets.length) fail();
  const item = create.entityType === "item", fields = clone(create.fields), context = create.formContext;
  if (fields.dimensions === null) delete fields.dimensions;
  const owner = item ? { id: create.entityId, quantity: 1, containerId: "", ...fields }
    : { id: create.entityId, parentId: null, childIds: [], itemIds: [], order: [], ...fields };
  owner.photos = create.assets.map((asset, index) => addedPhoto(added[index], asset, intent));
  if (item && context.availabilityStatus !== "available") owner.availabilityStatus = context.availabilityStatus;
  payload[item ? "items" : "containers"][create.entityId] = owner;
  if (context.placement !== null) {
    const place = context.placement, layout = payload.layouts[place.layoutId], a = layout.arrangement;
    if (item) {
      const target = a.containers[place.containerId];
      a.items[create.entityId] = place.containerId; a.itemQuantities[create.entityId] = place.quantity;
      target.itemIds.push(create.entityId); target.order.push({ type: "item", id: create.entityId });
      owner.containerId = place.containerId;
      // API assembled state mirrors the selected arrangement membership.
      payload.containers[place.containerId].itemIds = clone(target.itemIds);
      payload.containers[place.containerId].order = clone(target.order);
    } else {
      owner.parentId = "";
      a.containers[create.entityId] = { parentId: "", childIds: [], itemIds: [], order: [] };
      a.rootContainerIds.push(create.entityId); layout.rootContainerIds.push(create.entityId);
    }
    for (const key of editFields) layout[key] = fields[key];
  }
  return payload;
}

export function validateAdminTemplatePhotoCreateResultStructure(result, input) {
  try {
    const intent = checkedIntent(input), create = intent.body.photoCreate;
    return exact(result, ["version", "ownerId", "entityType", "entityId", "added", "confirmedPayload", "confirmedPayloadDigest"])
      && result.version === 1 && ownerId(result.ownerId) && result.entityType === create.entityType && result.entityId === create.entityId
      && hash(result.confirmedPayloadDigest) && new TextEncoder().encode(canonical(result)).byteLength <= 4 * 1024 * 1024
      && same(result.confirmedPayload, adminTemplatePhotoCreatePayload(intent, result.added));
  } catch { return false; }
}
export async function validateAdminTemplatePhotoCreateStages(input, values) {
  try {
    const intent = checkedIntent(input), stages = clone(values), create = intent.body.photoCreate;
    if (!Array.isArray(stages) || stages.length !== create.assets.length) return false;
    let selectedOwner;
    for (const [index, asset] of create.assets.entries()) {
      const data = stages[index], m = data?.receipt?.manifest;
      if (!m || m.templateOperationId !== intent.id || m.operationId !== asset.assetId || m.actorId !== intent.actorId || m.environment !== intent.environment
        || m.listId !== intent.listId || m.itemKey !== intent.itemKey || m.baseStateRevision !== intent.body.base.stateRevision
        || m.entityType !== create.entityType || m.entityId !== create.entityId || m.photoId !== asset.photoId
        || !await validateAdminTemplatePhotoCreateStageReceipt(data, { manifest: m, assetDigest: asset.assetDigest })
        || selectedOwner !== undefined && selectedOwner !== data.receipt.ownerId) return false;
      selectedOwner = data.receipt.ownerId;
    }
    return true;
  } catch { return false; }
}
export async function validateAdminTemplatePhotoCreateResult(input, expected) {
  try {
    const result = clone(input), intent = checkedIntent(expected.intent), stages = clone(expected.stageReceipts);
    if (!validateAdminTemplatePhotoCreateResultStructure(result, intent) || !await validateAdminTemplatePhotoCreateStages(intent, stages)
      || await digest(result.confirmedPayload) !== result.confirmedPayloadDigest) return false;
    return stages.every((stage, index) => stage.receipt.ownerId === result.ownerId
      && ["fileName", "type", "size", "width", "height"].every(key => result.added[index].photo[key] === stage.receipt.stored.file[key]));
  } catch { return false; }
}
