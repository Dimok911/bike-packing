import { canonicalTemplateJson as canonical, validTemplateOperationId as uuid } from "./admin-template-protocol.js";
import { projectAdminTemplateCopy } from "./admin-template-copy-projection.js";
import { adminTemplatePhotoCopyReference } from "./admin-template-photo-copy-protocol.js";

// Pure whole-catalog preparation, deliberately separate from tree-v2. Neither
// inventory nor supplied canonical photo references proves rights, SQL absence,
// local-ID absence, stored bytes or a server result. Before application callers
// must prove the complete authenticated parent/stage receipts independently.
export const ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_PROJECTION_LIMITS = Object.freeze({ owners: 100, depth: 32, photos: 50,
  sourceBytes: 3 * 1024 * 1024, projectionBytes: 4 * 1024 * 1024 });
const types = ["containers", "items"];
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
const ids = value => Array.isArray(value) && value.every(id) && new Set(value).size === value.length;
const text = (value, max) => typeof value === "string" && value.length <= max;
const positive = value => Number.isSafeInteger(value) && value > 0;
const same = (a, b) => canonical(a) === canonical(b);
const clone = value => JSON.parse(canonical(value));
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const fail = (part = "source") => { const code = `admin-template-photo-whole-copy-${part}`;
  throw Object.assign(Error(code), { code, isAdminTemplateBlocked: true }); };
const limit = (value, max) => { if (new TextEncoder().encode(canonical(value)).byteLength > max) fail("limit"); };
const list = value => text(value, 64) && (value === "public-demo-state"
  || value.startsWith("public-demo-state-") && id(value.slice(18))
  || value.startsWith("public-shared-layout-") && id(value.slice(21)));
const ref = value => value === undefined || value === null || value === "" ? "" : id(value) ? value : fail("reference");

function placement(row, containers, items, { optional = false } = {}) {
  if (!plain(row) || Object.hasOwn(row, "parentContainerId") || Object.hasOwn(row, "containerId")) fail("placement");
  const children = optional && row.childIds === undefined ? [] : row.childIds;
  const members = optional && row.itemIds === undefined ? [] : row.itemIds;
  const order = optional && row.order === undefined ? [] : row.order;
  if (!ids(children) || !ids(members) || !Array.isArray(order) || order.length !== children.length + members.length
    || children.some(key => !Object.hasOwn(containers, key)) || members.some(key => !Object.hasOwn(items, key))) fail("placement");
  const seen = new Set();
  for (const entry of order) {
    if (!plain(entry) || !["item", "container"].includes(entry.type) || seen.has(entry.id)
      || !(entry.type === "item" ? members : children).includes(entry.id)) fail("placement");
    seen.add(entry.id);
  }
  return { parent: ref(row.parentId), children, members };
}

// Raw catalog links and the selected arrangement are separate forests. A valid
// difference between them is retained, never normalized into equality.
function forests(payload, layout) {
  const containers = payload.containers, items = payload.items, raw = new Map();
  for (const [key, row] of Object.entries(containers)) raw.set(key, placement(row, containers, items, { optional: true }));
  for (const [key, p] of raw) {
    if (p.parent && (!raw.has(p.parent) || !raw.get(p.parent).children.includes(key))) fail("raw-forest");
    for (const child of p.children) if (raw.get(child).parent !== key) fail("raw-forest");
    for (const item of p.members) if (ref(items[item].containerId) !== key) fail("raw-forest");
    const seen = new Set(); let cursor = key;
    while (cursor) { if (seen.has(cursor) || seen.size >= 32) fail("raw-forest"); seen.add(cursor); cursor = raw.get(cursor)?.parent; }
  }
  for (const [key, row] of Object.entries(items)) {
    if (["parentContainerId", "parentId", "childIds", "itemIds", "order"].some(field => Object.hasOwn(row, field))) fail("placement");
    const parent = ref(row.containerId); if (parent && (!raw.has(parent) || !raw.get(parent).members.includes(key))) fail("raw-forest");
  }
  const a = layout.arrangement;
  if (!plain(a) || !ids(layout.rootContainerIds) || !ids(a.rootContainerIds) || !same(layout.rootContainerIds, a.rootContainerIds)
    || !["containers", "items", "itemQuantities", "packedItems"].every(key => plain(a[key]))) fail("arrangement");
  const visited = new Set(), placed = new Set();
  const walk = (key, parent, depth) => {
    if (depth > 32 || visited.has(key) || !Object.hasOwn(containers, key) || !Object.hasOwn(a.containers, key)) fail("arrangement");
    visited.add(key); const row = a.containers[key], p = placement(row, containers, items);
    if (p.parent !== parent || Object.hasOwn(row, "id") && row.id !== key) fail("arrangement");
    for (const item of p.members) {
      if (placed.has(item) || a.items[item] !== key || !positive(a.itemQuantities[item])) fail("arrangement");
      placed.add(item);
    }
    for (const child of p.children) walk(child, key, depth + 1);
  };
  a.rootContainerIds.forEach(key => walk(key, "", 1));
  if (Object.keys(a.containers).some(key => !visited.has(key)) || Object.keys(a.items).some(key => !placed.has(key))
    || Object.keys(a.itemQuantities).some(key => !placed.has(key))
    || Object.entries(a.packedItems).some(([key, value]) => !placed.has(key) || typeof value !== "boolean")) fail("arrangement");
  if (Object.hasOwn(payload, "packedItems") && (!plain(payload.packedItems)
    || Object.entries(payload.packedItems).some(([key, value]) => !Object.hasOwn(items, key) || typeof value !== "boolean"))) fail("packed");
}

function sourceInventory(payload, listId) {
  if (!list(listId) || !plain(payload) || ![...types, "layouts"].every(key => plain(payload[key]))
    || Object.keys(payload.layouts).length !== 1 || Object.hasOwn(payload, "sharedLayoutsIndex")) fail();
  limit(payload, ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_PROJECTION_LIMITS.sourceBytes);
  const occupied = new Set(), photoIds = new Set(), assets = new Set();
  for (const type of [...types, "layouts"]) for (const [key, row] of Object.entries(payload[type])) {
    if (!id(key) || !plain(row) || row.id !== key || occupied.has(key)) fail("inventory"); occupied.add(key);
  }
  const [layoutId] = Object.keys(payload.layouts), layout = payload.layouts[layoutId];
  if (payload.activeLayoutId !== layoutId || Object.keys(payload.items).length + Object.keys(payload.containers).length > 100) fail("inventory");
  forests(payload, layout);
  // Nonempty hidden photo arrays have no supported owner slot to replace.
  const visit = (value, path = []) => {
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "photos" && (!Array.isArray(child) || child.length && (path.length !== 2 || !types.includes(path[0])))) fail("photos");
      visit(child, [...path, key]);
    }
  }; visit(payload);
  let photoCount = 0;
  const owners = types.flatMap(type => Object.keys(payload[type]).sort().map(sourceEntityId => {
    const row = payload[type][sourceEntityId], photos = (row.photos || []).map(reference => {
      adminTemplatePhotoCopyReference(reference, listId); const sourcePhotoId = reference.id ?? reference.photoId;
      if (photoIds.has(sourcePhotoId) || reference.assetId && assets.has(reference.assetId)) fail("photos");
      photoIds.add(sourcePhotoId); occupied.add(sourcePhotoId); if (reference.assetId) { assets.add(reference.assetId); occupied.add(reference.assetId); }
      // Legacy external URLs remain supported; recognized API paths must bind
      // their actual source list/photo, independently of optional listId aliases.
      const inspect = value => {
        if (typeof value !== "string") return;
        const match = value.match(/\/bike-packing\/lists\/([^/]+)\/photos\/([^/]+)\//);
        if (match && (match[1] !== encodeURIComponent(listId) || match[2] !== encodeURIComponent(sourcePhotoId))) fail("photo-binding");
      };
      Object.values(reference).forEach(value => plain(value) ? Object.values(value).forEach(inspect) : inspect(value));
      photoCount++; return { sourcePhotoId, reference };
    });
    return { entityType: type === "items" ? "item" : "container", sourceEntityId, photos };
  }));
  if (photoCount < 1 || photoCount > 50) fail("limit");
  return { inventory: { layoutId, owners, photoCount }, occupied };
}

export function adminTemplatePhotoWholeCopySourceInventory(input) {
  const { payload, listId } = clone(input);
  return freeze(sourceInventory(payload, listId).inventory);
}

const bases = ["/letters-vniipo/api", "https://api.vniipo-help.ru/experiment/letters-vniipo/api",
  "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api", "https://experiment.vniipo-help.ru/letters-vniipo/api", "https://api.vniipo-help.ru/letters-vniipo/api"];
function targetPhoto(entry, source, targetListId, occupied) {
  const metadata = adminTemplatePhotoCopyReference(source.reference, source.reference.listId), p = entry?.photo;
  const keys = ["id", "photoId", "assetId", "listId", "status", "url", "thumbUrl", "fileName", "type", "size", "width", "height", ...Object.keys(metadata)];
  if (!exact(entry, ["sourcePhotoId", "photo"]) || entry.sourcePhotoId !== source.sourcePhotoId || !exact(p, keys)
    || !id(p.id) || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(p.id) || p.id !== p.photoId || !uuid(p.assetId)
    || p.listId !== targetListId || p.status !== "synced" || occupied.has(p.id) || occupied.has(p.assetId) || p.id === p.assetId
    || !text(p.fileName, 255) || !p.fileName || /[\u0000-\u001f\u007f/\\]/.test(p.fileName)
    || !["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"].includes(p.type) || !positive(p.size) || p.size > 10 * 1024 * 1024
    || [p.width, p.height].some(value => value !== null && !positive(value)) || Object.keys(metadata).some(key => p[key] !== metadata[key])) fail("projected-photo");
  for (const variant of ["file", "thumb"]) {
    const suffix = `/bike-packing/lists/${encodeURIComponent(targetListId)}/photos/${encodeURIComponent(p.id)}/${variant}`;
    if (!bases.some(base => p[variant === "file" ? "url" : "thumbUrl"] === base + suffix)) fail("projected-photo");
  }
  occupied.add(p.id); occupied.add(p.assetId); return p;
}

export function projectAdminTemplatePhotoWholeCopyPayload(input) {
  const { sourcePayload, sourceListId, targetListId, operationId, metadata, owners } = clone(input);
  if (!uuid(operationId) || !list(targetListId) || targetListId === sourceListId || !exact(metadata, ["title", "description", "language"])
    || !text(metadata.title, 255) || !metadata.title.trim() || metadata.title !== metadata.title.trim()
    || !text(metadata.description, 10000) || metadata.description !== metadata.description.trim()
    || !["ru", "en"].includes(metadata.language)) fail("projection");
  const { inventory, occupied } = sourceInventory(sourcePayload, sourceListId);
  if (occupied.has(operationId) || occupied.has(targetListId)) fail("collision"); occupied.add(operationId); occupied.add(targetListId);
  const projected = projectAdminTemplateCopy(sourcePayload, operationId, metadata);
  for (const type of ["layouts", ...types]) for (const key of Object.keys(projected[type])) {
    if (occupied.has(key)) fail("collision"); occupied.add(key);
  }
  const mappings = Object.fromEntries(types.map(type => [type, new Map(Object.keys(sourcePayload[type]).sort().map((key, index) => [key, Object.keys(projected[type])[index]]))]));
  if (!Array.isArray(owners) || owners.length !== inventory.owners.length) fail("owners");
  inventory.owners.forEach((source, index) => {
    const owner = owners[index], type = source.entityType === "item" ? "items" : "containers", entityId = mappings[type].get(source.sourceEntityId);
    if (!exact(owner, ["entityType", "sourceEntityId", "entityId", "photos"]) || owner.entityType !== source.entityType
      || owner.sourceEntityId !== source.sourceEntityId || owner.entityId !== entityId || !Array.isArray(owner.photos)
      || owner.photos.length !== source.photos.length) fail("owners");
    const photos = source.photos.map((photo, photoIndex) => targetPhoto(owner.photos[photoIndex], photo, targetListId, occupied));
    if (Object.hasOwn(sourcePayload[type][source.sourceEntityId], "photos")) projected[type][entityId].photos = photos;
  });
  limit(projected, ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_PROJECTION_LIMITS.projectionBytes);
  return freeze(projected);
}
