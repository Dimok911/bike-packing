import { canonicalTemplateJson, validTemplateOperationId } from "./admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "./admin-template-photo-record.js";
import { adminTemplatePhotoCreateIntent, adminTemplatePhotoCreateStageManifest, adminTemplatePhotoCreateStageDigest,
  assertAdminTemplatePhotoCreateSource } from "./admin-template-photo-create-protocol.js";
import { assertAdminTemplatePhotoOwnerMap } from "./admin-template-photo-owner-map.js";
import { assertAdminTemplatePhotoView } from "./admin-template-photo-view.js";
import { recoverPersonalAdminDrafts } from "./personal-admin-draft-recovery.js";
import { createPersonalPhotoInventoryCodec } from "./personal-photo-inventory-codec.js";

const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const clone = value => JSON.parse(canonicalTemplateJson(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const invalid = () => { throw Object.assign(Error("Новая запись, исходный шаблон и сохранённые файлы требуют сверки."),
  { code: "admin-template-photo-create-record", isAdminTemplateBlocked: true }); };
const types = ["items", "containers"];
const stateKeys = ["activeLayoutId", "layouts", "items", "containers", "locations", "categories", "packedItems"];
const snapshotKeys = ["version", "layoutId", "ownerMap", "sourcePayload", "beforeState", "metadata", "createdOwner"];
const id = value => typeof value === "string" && value.length <= 191 && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const photos = row => Object.hasOwn(row, "photos") ? row.photos : [];

function ownedNamespace(state, binding, layoutId) {
  if (!exact(state, stateKeys) || state.activeLayoutId !== layoutId || !plain(state.layouts) || Object.keys(state.layouts).length !== 1
    || !types.every(type => plain(state[type])) || state.layouts[layoutId]?.id !== layoutId
    || types.some(type => Object.values(state[type]).some(row => !plain(row) || row.publicCatalogLayoutId !== layoutId))) invalid();
  const recovered = recoverPersonalAdminDrafts({ layouts: {}, items: {}, containers: {} }, canonicalTemplateJson(state),
    { scopeKey: `id:${binding.actorId}`, enabled: true });
  if (["layouts", ...types].some(type => !same(recovered[type], state[type]))) invalid();
}

function assertSourceView({ before, sourcePayload, ownerMap, metadata, binding, layoutId, source, local }) {
  const rawLayout = Object.values(sourcePayload.layouts)[0], actualLayout = before.layouts[layoutId];
  const copied = typeof sourcePayload.activeLayoutId === "string" && sourcePayload.activeLayoutId.startsWith("layout-")
    && validTemplateOperationId(sourcePayload.activeLayoutId.slice(7)) ? sourcePayload.activeLayoutId : null;
  const ref = (type, value) => value ? local(type, value) : "";
  const links = row => ({ parentId: ref("containers", row.parentId),
    childIds: (row.childIds || []).map(key => local("containers", key)), itemIds: (row.itemIds || []).map(key => local("items", key)),
    order: (row.order || []).map(entry => ({ ...entry, id: local(entry.type === "item" ? "items" : "containers", entry.id) })) });
  const arrangement = clone(rawLayout.arrangement);
  arrangement.rootContainerIds = arrangement.rootContainerIds.map(key => local("containers", key));
  arrangement.containers = Object.fromEntries(Object.entries(arrangement.containers).map(([key, row]) => [local("containers", key), { ...row, ...links(row) }]));
  arrangement.items = Object.fromEntries(Object.entries(arrangement.items).map(([key, value]) => [local("items", key), local("containers", value)]));
  for (const field of ["itemQuantities", "packedItems"]) arrangement[field] = Object.fromEntries(Object.entries(arrangement[field]).map(([key, value]) => [local("items", key), value]));
  if (!same(actualLayout.arrangement, arrangement) || !same(before.packedItems, arrangement.packedItems)
    || !same(before.locations, sourcePayload.locations || []) || !same(before.categories, sourcePayload.categories || [])) invalid();
  const demo = binding.listId.startsWith("public-demo-state");
  for (const owner of ownerMap.owners) {
    const raw = sourcePayload[owner.type][owner.serverId], actual = before[owner.type][owner.localId], expected = clone(raw);
    expected.id = owner.localId; expected.publicCatalogLayoutId = layoutId;
    if (Object.hasOwn(actual, "adminDemo")) {
      if (actual.adminDemo !== Boolean(actualLayout.adminDemo)) invalid(); expected.adminDemo = actual.adminDemo;
    }
    if (Object.hasOwn(actual, "sharedSourceId")) expected.sharedSourceId = copied ? owner.serverId : raw.sharedSourceId || owner.serverId;
    const view = source.photoView?.owners?.find(row => row.type === owner.type && row.localId === owner.localId);
    if (Object.hasOwn(actual, "photos") || Object.hasOwn(raw, "photos")) expected.photos = view ? clone(view.viewPhotos) : [];
    const rawLinks = owner.type === "items" ? { containerId: ref("containers", raw.containerId) } : links(raw);
    const placed = owner.type === "items" ? { containerId: arrangement.items[owner.localId] || rawLinks.containerId }
      : arrangement.containers[owner.localId] || rawLinks;
    for (const [field, rawValue] of Object.entries(rawLinks)) {
      if (!Object.hasOwn(actual, field) && !Object.hasOwn(raw, field)) continue;
      const value = actual[field], applied = placed[field];
      if (!same([value], [rawValue]) && !same([value], [applied])
        && !(field === "parentId" && value === null && (rawValue === "" || applied === ""))) invalid();
      // Only these proven display mirrors may differ. No business field or
      // arbitrary local value is erased or normalized to make the check pass.
      expected[field] = clone(value);
    }
    if (!same(actual, expected)) invalid();
  }
  const expected = { ...clone(rawLayout), id: layoutId, name: metadata.title, note: metadata.description, language: metadata.language,
    locations: clone(sourcePayload.locations || []), categories: clone(sourcePayload.categories || []),
    rootContainerIds: rawLayout.rootContainerIds.map(key => local("containers", key)), arrangement };
  if (copied) expected.sharedSourceId = copied;
  const actual = clone(actualLayout);
  const localMetadata = {
    adminDemo: value => value === demo,
    adminDemoLanguage: value => demo && value === metadata.language,
    adminDemoListId: value => demo && value === binding.listId,
    adminSharedSourceId: value => !demo && value === binding.listId.slice("public-shared-layout-".length),
    adminTemplateCopy: value => value === Boolean(copied),
    publicCatalogLayoutId: value => value === layoutId,
    templatePublished: value => value === false,
    templateDraftServerHydrated: value => value === true,
    templateDraftSyncPending: value => value === false,
    templateUnpublishPending: value => value === false
  };
  for (const [key, valid] of Object.entries(localMetadata)) {
    if (Object.hasOwn(actual, key) && !valid(actual[key])) invalid();
    delete actual[key]; delete expected[key];
  }
  // Source proof is checked separately. A pending copy plan is not view-only
  // metadata and remains unequal/blocked instead of being stripped here.
  delete actual.adminCausalSource; delete expected.adminCausalSource;
  if (!same(actual, expected)) invalid();
}

function beforeProof(binding, action, snapshot) {
  if (!exact(snapshot, snapshotKeys) && !exact(snapshot, [...snapshotKeys, "state"]) || snapshot.version !== 1
    || !exact(snapshot.createdOwner, ["entityType", "localId", "serverId"])) invalid();
  const { beforeState: before, sourcePayload, ownerMap, layoutId, createdOwner: selected } = snapshot;
  const create = action.body.photoCreate, revision = action.body.base.stateRevision;
  if (!id(selected.localId) || !id(selected.serverId) || selected.entityType !== create.entityType || selected.serverId !== create.entityId
    || !same(snapshot.metadata, action.body.metadata)) invalid();
  assertAdminTemplatePhotoCreateSource(sourcePayload, action.body, action.operationId);
  ownedNamespace(before, binding, layoutId);
  assertAdminTemplatePhotoOwnerMap({ binding, layoutId, stateRevision: revision, map: ownerMap, state: before, sourcePayload });
  const source = before.layouts[layoutId].adminCausalSource;
  if (!plain(source) || source.version !== 1 || !same(source.binding, binding) || source.exists !== true || source.deleted
    || source.visibility !== "private" || source.planId || source.photoAppendPending || source.photoEditPending || source.photoCreatePending
    || !exact(source.base, ["stateRevision"]) || source.base.stateRevision !== revision
    || source.photoOwnerMap !== undefined && !same(source.photoOwnerMap, ownerMap)) invalid();
  for (const type of ["layouts", ...types]) {
    if (Object.hasOwn(before[type], selected.localId) || Object.hasOwn(sourcePayload[type], selected.serverId)) invalid();
  }
  assertAdminTemplatePhotoView({ binding, layoutId, baseline: source.photoView, state: before });
  for (const owner of ownerMap.owners) {
    const raw = photos(sourcePayload[owner.type][owner.serverId]);
    if (!Array.isArray(raw)) invalid();
    const view = source.photoView?.owners?.find(row => row.type === owner.type && row.localId === owner.localId);
    if (raw.length ? !view || view.serverId !== owner.serverId || !same(view.rawPhotos, raw) : view !== undefined) invalid();
  }
  const local = (type, serverId) => {
    const owner = ownerMap.owners.find(row => row.type === type && row.serverId === serverId);
    if (!owner) invalid(); return owner.localId;
  };
  // The selected placement is chosen from the confirmed tree, not a display ID
  // or a changed local arrangement. Unknown fields themselves remain opaque.
  const rawLayout = Object.values(sourcePayload.layouts)[0], raw = rawLayout.arrangement, view = before.layouts[layoutId].arrangement;
  const mapped = (values, type) => values.map(key => local(type, key));
  const mapping = (values, type, convert) => Object.fromEntries(Object.entries(values).map(([key, value]) => [local(type, key), convert(value)]));
  if (!plain(view) || !same(before.layouts[layoutId].rootContainerIds, mapped(rawLayout.rootContainerIds, "containers"))
    || !same(view.rootContainerIds, mapped(raw.rootContainerIds, "containers"))
    || !same(view.items, mapping(raw.items, "items", key => local("containers", key)))
    || !same(view.itemQuantities, mapping(raw.itemQuantities, "items", value => value))
    || !same(view.packedItems, mapping(raw.packedItems, "items", value => value))
    || !same(Object.keys(view.containers || {}).sort(), mapped(Object.keys(raw.containers), "containers").sort())) invalid();
  for (const [serverId, row] of Object.entries(raw.containers)) {
    const actual = view.containers[local("containers", serverId)];
    if (!plain(actual) || actual.parentId !== (row.parentId ? local("containers", row.parentId) : "")
      || !same(actual.childIds, mapped(row.childIds, "containers")) || !same(actual.itemIds, mapped(row.itemIds, "items"))
      || !same(actual.order, row.order.map(entry => ({ ...entry, id: local(entry.type === "item" ? "items" : "containers", entry.id) })))) invalid();
  }
  // The request contains the raw source, so any unrelated local business edit
  // would otherwise disappear in the exact server result. Derive the accepted
  // editor view from that source; never treat the supplied beforeState as proof
  // of its own relationship to the confirmed business data.
  assertSourceView({ before, sourcePayload, ownerMap, metadata: snapshot.metadata, binding, layoutId, source, local });
  return { create, local, selected, before, layoutId };
}

function pendingPhotos(selected, assets, stages) {
  const allowed = ["id", "localId", "photoId", "listId", "status", "url", "thumbUrl", "fileName", "type", "size", "width", "height", "createdAt", "updatedAt", "error"];
  if (!Array.isArray(selected) || selected.length !== assets.length || stages.length !== assets.length) invalid();
  selected.forEach((photo, index) => {
    const asset = assets[index], stage = stages[index];
    if (!plain(photo) || Object.keys(photo).some(key => !allowed.includes(key)) || photo.id !== asset.photoId || photo.localId !== asset.photoId
      || photo.status !== "pending" || photo.url !== "" || photo.thumbUrl !== ""
      || Object.hasOwn(photo, "photoId") && photo.photoId !== photo.id
      || Object.hasOwn(photo, "listId") && photo.listId !== "" && photo.listId !== stage.listId
      || photo.fileName !== stage.file.fileName || photo.size !== stage.file.size || photo.type !== stage.file.type) invalid();
  });
}

function boundStages(binding, action, stages) {
  const assets = action.body.photoCreate.assets;
  if (!Array.isArray(stages) || stages.length !== assets.length) invalid();
  return stages.map((value, index) => {
    const stage = adminTemplatePhotoCreateStageManifest(value), asset = assets[index];
    if (Object.keys(binding).some(key => stage[key] !== binding[key]) || stage.templateOperationId !== action.operationId
      || stage.operationId !== asset.assetId || stage.baseStateRevision !== action.body.base.stateRevision || stage.entityType !== asset.entityType
      || stage.entityId !== asset.entityId || stage.photoId !== asset.photoId) invalid();
    return stage;
  });
}

// Local editor projection only; raw server payload remains unchanged in action.
// No IDs are generated and the old owner map is never extended optimistically.
export function adminTemplatePhotoCreateCandidate({ binding, action, snapshot, photos: selectedPhotos, stages }) {
  try {
    binding = adminTemplatePhotoActionBinding(binding);
    if (!exact(action, ["operationId", "kind", "listId", "itemKey", "body"]) || action.listId !== binding.listId || action.itemKey !== binding.itemKey) invalid();
    adminTemplatePhotoCreateIntent({ ...binding, ...action });
    const { create, local, selected, before, layoutId } = beforeProof(binding, action, snapshot);
    pendingPhotos(selectedPhotos, create.assets, boundStages(binding, action, stages));
    const state = clone(before), item = create.entityType === "item", type = item ? "items" : "containers";
    const fields = clone(create.fields); if (fields.dimensions === null) delete fields.dimensions;
    const owner = item ? { id: selected.localId, quantity: 1, containerId: "", ...fields }
      : { id: selected.localId, parentId: null, childIds: [], itemIds: [], order: [], ...fields };
    owner.publicCatalogLayoutId = layoutId; owner.photos = clone(selectedPhotos);
    if (item && create.formContext.availabilityStatus !== "available") owner.availabilityStatus = create.formContext.availabilityStatus;
    state[type][selected.localId] = owner;
    if (create.formContext.placement !== null) {
      const layout = state.layouts[layoutId], a = layout.arrangement, place = create.formContext.placement;
      if (item) {
        const containerId = local("containers", place.containerId), target = a.containers[containerId];
        a.items[selected.localId] = containerId; a.itemQuantities[selected.localId] = place.quantity;
        target.itemIds.push(selected.localId); target.order.push({ type: "item", id: selected.localId });
        owner.containerId = containerId;
        state.containers[containerId].itemIds = clone(target.itemIds); state.containers[containerId].order = clone(target.order);
      } else {
        owner.parentId = "";
        a.containers[selected.localId] = { parentId: "", childIds: [], itemIds: [], order: [] };
        a.rootContainerIds.push(selected.localId); layout.rootContainerIds.push(selected.localId);
      }
      for (const key of ["updatedAt", "updatedByDeviceId", "updatedByDeviceName"]) layout[key] = fields[key];
    }
    ownedNamespace(state, binding, layoutId);
    return state;
  } catch { invalid(); }
}

function validateIntent({ binding, action, snapshot, files }) {
  if (!exact(action, ["operationId", "kind", "listId", "itemKey", "body"]) || action.listId !== binding.listId || action.itemKey !== binding.itemKey
    || !exact(snapshot, [...snapshotKeys, "state"]) || !Array.isArray(files)) invalid();
  canonicalTemplateJson({ binding, action, snapshot, files });
  const intent = adminTemplatePhotoCreateIntent({ ...binding, ...action }), assets = intent.body.photoCreate.assets;
  if (files.length !== assets.length) invalid();
  const stages = boundStages(binding, action, files.map(part => part?.stage));
  files.forEach((part, index) => {
    if (!exact(part, ["stage"]) && !exact(part, ["stage", "file", "thumb"])) invalid();
    const stage = stages[index];
    if (Object.hasOwn(part, "file") && (!same(part.file, { hash: stage.file.hash, size: stage.file.size, type: stage.file.type }) || !same(part.thumb, stage.thumb))) invalid();
  });
  const selected = snapshot.createdOwner, type = selected.entityType === "item" ? "items" : "containers";
  const candidate = adminTemplatePhotoCreateCandidate({ binding, action, snapshot, photos: snapshot.state[type]?.[selected.localId]?.photos, stages });
  if (!same(candidate, snapshot.state)) invalid();
}

const codec = createPersonalPhotoInventoryCodec({ validateIntent, invalid });
async function verified(record, binding, operationId) {
  if (!exact(record, ["version", "key", "bindingKey", "intentJson", "intentHash", "files"]) || !Array.isArray(record.files)
    || record.files.some(part => !exact(part, ["stageOperationId", "file", "thumb"]))) invalid();
  const decoded = await codec.decode(record, adminTemplatePhotoActionBinding(binding), operationId);
  for (const [index, part] of decoded.files.entries()) {
    if (await adminTemplatePhotoCreateStageDigest(part.stage) !== decoded.action.body.photoCreate.assets[index].assetDigest
      || !same(part.fileMetadata, { hash: part.stage.file.hash, size: part.stage.file.size, type: part.stage.file.type }) || !same(part.thumbMetadata, part.stage.thumb)) invalid();
  }
  return decoded;
}

export async function encodeAdminTemplatePhotoCreateRecord(input) {
  try {
    const frozen = { binding: adminTemplatePhotoActionBinding(input.binding), action: clone(input.action), snapshot: clone(input.snapshot),
      files: input.files?.map(part => ({ stage: clone(part.stage), file: part.file, thumb: part.thumb ?? null })) };
    const record = await codec.encode(frozen); await verified(record, frozen.binding, frozen.action.operationId); return record;
  } catch { invalid(); }
}

export async function decodeAdminTemplatePhotoCreateRecord(record, binding, operationId) {
  try { return await verified(record, binding, operationId); } catch { invalid(); }
}
