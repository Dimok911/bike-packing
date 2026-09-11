import { canonicalTemplateJson } from "./admin-template-protocol.js";
import { normalizePhotoStatus, normalizePhotoUrlFields } from "../state/item-photos.js";

const types = ["items", "containers"];
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = () => { throw Object.assign(Error("Фотографии шаблона изменены или требуют сверки с исходной серверной версией. Сохранение приостановлено."),
  { code: "admin-template-photo-view-required", isAdminTemplateBlocked: true }); };
const canonical = value => { try { return canonicalTemplateJson(value); } catch { fail(); } };
const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const rawPhotoId = photo => photo?.id ?? photo?.photoId;
const id = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value) && !["__proto__", "prototype", "constructor"].includes(value);

function assertBinding(binding, layoutId) {
  if (!exact(binding, ["actorId", "environment", "itemKey", "listId"]) || !id(layoutId)
    || typeof binding.actorId !== "string" || !binding.actorId || binding.actorId.length > 36 || binding.actorId !== binding.actorId.trim()
    || binding.environment !== "bike-packing-experiment" || !id(binding.listId) || binding.listId.length > 64) fail();
  const itemKey = binding.listId === "public-demo-state" ? "demo-state"
    : binding.listId.startsWith("public-demo-state-") && binding.listId.length > "public-demo-state-".length
      ? `demo-state:${binding.listId.slice("public-demo-state-".length)}`
      : binding.listId.startsWith("public-shared-layout-") && binding.listId.length > "public-shared-layout-".length
        ? `shared-layout:${binding.listId.slice("public-shared-layout-".length)}` : null;
  if (!itemKey || binding.itemKey !== itemKey) fail();
}

function assertState(state, layoutId) {
  if (!plain(state) || !types.every(type => plain(state[type])) || !plain(state.layouts)
    || !Object.hasOwn(state.layouts, layoutId) || state.layouts[layoutId]?.id !== layoutId) fail();
}

function photos(row) {
  if (!plain(row)) fail();
  if (!Object.hasOwn(row, "photos")) return [];
  if (!Array.isArray(row.photos) || row.photos.some(photo => !plain(photo))) fail();
  canonical(row.photos);
  return row.photos;
}

function assertPhotoPairs(rawPhotos, viewPhotos, listId) {
  if (!Array.isArray(rawPhotos) || !rawPhotos.length || !Array.isArray(viewPhotos) || viewPhotos.length !== rawPhotos.length) fail();
  const seen = new Set();
  rawPhotos.forEach((raw, index) => {
    const view = viewPhotos[index], photoId = rawPhotoId(raw);
    if (!plain(raw) || !plain(view) || !id(photoId) || raw.listId !== listId
      || Object.hasOwn(raw, "id") && raw.id !== photoId || Object.hasOwn(raw, "photoId") && raw.photoId !== photoId
      || normalizePhotoStatus(raw.status) !== "synced" || seen.has(photoId)
      || view.id !== photoId || view.listId !== listId || view.status !== "synced") fail();
    // Legacy API rows may omit status/thumbUrl, or use URL aliases. Derive only
    // their expected display fields on a clone; the raw reference stays exact.
    const display = normalizePhotoUrlFields(clone(raw));
    if (view.url !== (typeof display.url === "string" ? display.url : "")
      || view.thumbUrl !== (typeof display.thumbUrl === "string" ? display.thumbUrl : "")
      || Object.hasOwn(view, "photoId") && view.photoId !== photoId) fail();
    seen.add(photoId);
  });
  canonical(rawPhotos); canonical(viewPhotos);
}

function validateBaseline({ binding, layoutId, baseline }) {
  if (!exact(baseline, ["version", "binding", "layoutId", "owners"]) || baseline.version !== 1
    || baseline.layoutId !== layoutId || !same(baseline.binding, binding) || !Array.isArray(baseline.owners)) fail();
  const local = new Set(), server = new Set(), photoIds = new Set();
  for (const owner of baseline.owners) {
    if (!exact(owner, ["type", "localId", "serverId", "rawPhotos", "viewPhotos"]) || !types.includes(owner.type)
      || !id(owner.localId) || !id(owner.serverId) || local.has(`${owner.type}:${owner.localId}`) || server.has(`${owner.type}:${owner.serverId}`)) fail();
    assertPhotoPairs(owner.rawPhotos, owner.viewPhotos, binding.listId);
    for (const photo of owner.rawPhotos) { const photoId = rawPhotoId(photo); if (photoIds.has(photoId)) fail(); photoIds.add(photoId); }
    local.add(`${owner.type}:${owner.localId}`); server.add(`${owner.type}:${owner.serverId}`);
  }
  return baseline;
}

// Call only after the first real editor normalization. The raw source and its
// displayed form are separate evidence: later normalization must not recreate
// this baseline from an already edited owner or invent a new source reference.
// For photoId-only legacy references, initialize the separate view copy's id
// from raw.id ?? raw.photoId BEFORE normalizeItemPhotos (which ignores photoId).
export function captureAdminTemplatePhotoView({ binding, layoutId, sourcePayload, state, mappings }) {
  assertBinding(binding, layoutId); assertState(state, layoutId);
  if (!plain(sourcePayload) || !types.every(type => plain(sourcePayload[type])) || !exact(mappings, types)
    || !types.every(type => plain(mappings[type]))) fail();
  const owners = [];
  for (const type of types) {
    const byServerId = new Map();
    for (const [localId, serverId] of Object.entries(mappings[type])) {
      const row = state[type][localId], source = sourcePayload[type][serverId];
      if (!id(localId) || !id(serverId) || !Object.hasOwn(state[type], localId) || !Object.hasOwn(sourcePayload[type], serverId)
        || row?.id !== localId || row.publicCatalogLayoutId !== layoutId || source?.id !== serverId || byServerId.has(serverId)) fail();
      byServerId.set(serverId, localId);
    }
    for (const [serverId, source] of Object.entries(sourcePayload[type])) {
      if (!id(serverId) || source?.id !== serverId) fail();
      const rawPhotos = photos(source);
      if (!rawPhotos.length) continue;
      const localId = byServerId.get(serverId);
      if (!localId) fail();
      const viewPhotos = photos(state[type][localId]);
      assertPhotoPairs(rawPhotos, viewPhotos, binding.listId);
      owners.push({ type, localId, serverId, rawPhotos: clone(rawPhotos), viewPhotos: clone(viewPhotos) });
    }
  }
  const baseline = { version: 1, binding: clone(binding), layoutId, owners };
  assertAdminTemplatePhotoView({ binding, layoutId, baseline, state });
  return baseline;
}

// No normalization here: an extra enumerable field, a changed URL, a removed
// reference or a changed order is a different view and requires a file adapter.
export function assertAdminTemplatePhotoView({ binding, layoutId, baseline, state }) {
  assertBinding(binding, layoutId); assertState(state, layoutId);
  if (baseline != null) validateBaseline({ binding, layoutId, baseline });
  const owners = baseline?.owners || [], expected = new Set();
  for (const owner of owners) {
    const row = state[owner.type][owner.localId];
    if (!Object.hasOwn(state[owner.type], owner.localId) || row?.id !== owner.localId || row.publicCatalogLayoutId !== layoutId
      || !same(photos(row), owner.viewPhotos)) fail();
    expected.add(`${owner.type}:${owner.localId}`);
  }
  for (const type of types) for (const [localId, row] of Object.entries(state[type])) {
    if (row?.publicCatalogLayoutId !== layoutId) continue;
    if (row.id !== localId || !id(localId)) fail();
    if (photos(row).length && !expected.has(`${type}:${localId}`)) fail();
  }
  return true;
}

// The normal export may lose legacy photo fields. Restore only references whose
// complete live view and source-to-export owner identity have both been proved.
// This is a representation bridge, never authority to upload or move a photo.
export function restoreAdminTemplatePhotoReferences({ binding, layoutId, baseline, state, payload, mappings }) {
  assertAdminTemplatePhotoView({ binding, layoutId, baseline, state });
  if (!plain(payload) || !types.every(type => plain(payload[type])) || !exact(mappings, types)
    || !types.every(type => plain(mappings[type]))) fail();
  const result = clone(payload), expected = new Set();
  for (const owner of baseline?.owners || []) {
    const mapped = mappings[owner.type];
    if (!Object.hasOwn(mapped, owner.localId) || mapped[owner.localId] !== owner.serverId
      || Object.values(mapped).filter(value => value === owner.serverId).length !== 1) fail();
    const row = result[owner.type][owner.serverId];
    if (!Object.hasOwn(result[owner.type], owner.serverId) || row?.id !== owner.serverId) fail();
    const exported = photos(row);
    if (exported.length !== owner.viewPhotos.length || exported.some((photo, index) => photo.id !== owner.viewPhotos[index].id
      || photo.listId !== binding.listId || photo.status !== "synced" || photo.url !== owner.viewPhotos[index].url
      || photo.thumbUrl !== owner.viewPhotos[index].thumbUrl)) fail();
    expected.add(`${owner.type}:${owner.serverId}`);
    row.photos = clone(owner.rawPhotos);
  }
  for (const type of types) for (const [serverId, row] of Object.entries(result[type])) {
    if (photos(row).length && !expected.has(`${type}:${serverId}`)) fail();
  }
  return result;
}
