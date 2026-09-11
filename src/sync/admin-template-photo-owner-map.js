import { canonicalTemplateJson } from "./admin-template-protocol.js";

const types = ["items", "containers"];
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value) && !["__proto__", "prototype", "constructor"].includes(value);
const fail = () => { throw Object.assign(Error("Исходные владельцы фотографий шаблона требуют сверки. Карта идентификаторов не применена."),
  { code: "admin-template-photo-owner-map-required", isAdminTemplateBlocked: true }); };
const canonical = value => { try { return canonicalTemplateJson(value); } catch { fail(); } };
const same = (left, right) => canonical(left) === canonical(right);

function assertIdentity({ binding, layoutId, stateRevision }) {
  if (!exact(binding, ["actorId", "environment", "itemKey", "listId"]) || !id(layoutId)
    || typeof binding.actorId !== "string" || !binding.actorId || binding.actorId.length > 36 || binding.actorId !== binding.actorId.trim()
    || binding.environment !== "bike-packing-experiment" || !id(binding.listId) || binding.listId.length > 64
    || !Number.isSafeInteger(stateRevision) || stateRevision < 1) fail();
  const itemKey = binding.listId === "public-demo-state" ? "demo-state"
    : binding.listId.startsWith("public-demo-state-") && binding.listId.length > "public-demo-state-".length
      ? `demo-state:${binding.listId.slice("public-demo-state-".length)}`
      : binding.listId.startsWith("public-shared-layout-") && binding.listId.length > "public-shared-layout-".length
        ? `shared-layout:${binding.listId.slice("public-shared-layout-".length)}` : null;
  if (!itemKey || binding.itemKey !== itemKey) fail();
  canonical(binding);
}

function ownerInventory({ state, sourcePayload, layoutId }) {
  if (!plain(state) || !plain(sourcePayload) || ![...types, "layouts"].every(type => plain(state[type]) && plain(sourcePayload[type]))
    || !Object.hasOwn(state.layouts, layoutId) || !plain(state.layouts[layoutId]) || state.layouts[layoutId].id !== layoutId) fail();
  const source = { items: new Set(), containers: new Set() }, local = { items: new Set(), containers: new Set() };
  const serverIds = new Set(Object.keys(sourcePayload.layouts));
  if ([...serverIds].some(key => !id(key) || !plain(sourcePayload.layouts[key]) || sourcePayload.layouts[key].id !== key)) fail();
  for (const type of types) {
    for (const [serverId, row] of Object.entries(sourcePayload[type])) {
      if (!id(serverId) || !plain(row) || row.id !== serverId || serverIds.has(serverId)) fail();
      serverIds.add(serverId); source[type].add(serverId);
    }
    for (const [localId, row] of Object.entries(state[type])) {
      if (row?.publicCatalogLayoutId !== layoutId) continue;
      if (!id(localId) || !plain(row) || row.id !== localId
        || Object.hasOwn(state.layouts, localId) || Object.hasOwn(state[type === "items" ? "containers" : "items"], localId)) fail();
      local[type].add(localId);
    }
  }
  return { source, local };
}

// This records identity only. The caller supplies the exact mappings produced
// by materialization plus the confirmed source/revision, and persists the map
// inside its immutable journal. It must separately verify source business and
// current authority; IDs/revision here are not a payload digest or permission.
export function captureAdminTemplatePhotoOwnerMap({ binding, layoutId, stateRevision, sourcePayload, state, mappings }) {
  assertIdentity({ binding, layoutId, stateRevision });
  if (!exact(mappings, types) || !types.every(type => plain(mappings[type]))) fail();
  const owners = types.flatMap(type => Object.keys(mappings[type]).sort().map(localId => ({ type, localId, serverId: mappings[type][localId] })));
  const map = { version: 1, binding: JSON.parse(canonical(binding)), layoutId, stateRevision, owners };
  assertAdminTemplatePhotoOwnerMap({ binding, layoutId, stateRevision, map, state, sourcePayload });
  Object.freeze(map.binding); owners.forEach(Object.freeze); Object.freeze(owners);
  return Object.freeze(map);
}

// Do not compare normalized names, photos, quantities or applied links. Every
// source owner (including detached/fileless owners) must instead occur exactly
// once, still owned by this local administrative namespace, in the same type.
export function assertAdminTemplatePhotoOwnerMap({ binding, layoutId, stateRevision, map, state, sourcePayload }) {
  assertIdentity({ binding, layoutId, stateRevision });
  if (!exact(map, ["version", "binding", "layoutId", "stateRevision", "owners"]) || map.version !== 1
    || map.layoutId !== layoutId || map.stateRevision !== stateRevision || !same(map.binding, binding) || !Array.isArray(map.owners)) fail();
  const { source, local } = ownerInventory({ state, sourcePayload, layoutId });
  const seenLocal = new Set(), seenServer = new Set();
  for (const owner of map.owners) {
    if (!exact(owner, ["type", "localId", "serverId"]) || !types.includes(owner.type) || !id(owner.localId) || !id(owner.serverId)
      || !local[owner.type].has(owner.localId) || !source[owner.type].has(owner.serverId)
      || seenLocal.has(owner.localId) || seenServer.has(owner.serverId)) fail();
    seenLocal.add(owner.localId); seenServer.add(owner.serverId);
  }
  if (types.some(type => [...local[type]].some(key => !seenLocal.has(key)) || [...source[type]].some(key => !seenServer.has(key)))) fail();
  return true;
}

export function adminTemplatePhotoPreservedEntityIds(input) {
  assertAdminTemplatePhotoOwnerMap(input);
  return Object.fromEntries(types.map(type => [type, Object.fromEntries(input.map.owners.filter(owner => owner.type === type)
    .map(owner => [owner.localId, owner.serverId]))]));
}
