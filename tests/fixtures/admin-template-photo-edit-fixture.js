import { createHash, randomUUID } from "node:crypto";
import { captureAdminTemplatePhotoOwnerMap } from "../../src/sync/admin-template-photo-owner-map.js";
import { captureAdminTemplatePhotoView } from "../../src/sync/admin-template-photo-view.js";
import { normalizeItemPhotos } from "../../src/state/item-photos.js";
import { adminTemplateIntent, canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoEditorSnapshot, adminTemplatePhotoNamespace } from "../../src/public/admin-template-photo-state.js";

export const copy = value => structuredClone(value);
export const hash = value => createHash("sha256").update(canonicalTemplateJson(value)).digest("hex");
export function adminPhotoEditFixture({ entityType = "item", photoIds = ["фото-3", "photo-1"] } = {}) {
  const binding = { actorId: "admin-a", environment: "bike-packing-experiment", listId: "public-shared-layout-selected", itemKey: "shared-layout:selected" };
  const layoutId = "local-editor", stateRevision = 7, type = entityType === "item" ? "items" : "containers";
  const serverId = entityType === "item" ? "pump" : "bag", localId = entityType === "item" ? "local-item" : "local-bag";
  const metadata = { title: "Template", description: "Exact description", language: "ru" };
  const photos = ["photo-1", "photo-2", "фото-3"].map((id, index) => ({ ...(index === 1 ? { photoId: id } : { id }),
    listId: binding.listId, status: "synced", fileName: `Original ${index}.png`, url: `https://example.test/${index}.png`,
    thumbUrl: `https://example.test/${index}-thumb.png`, metadata: { credit: "Original", opaque: [index, null] } }));
  const sourcePayload = { activeLayoutId: "source", locations: [{ id: "loc", name: "Place", opaque: true }], categories: [],
    opaque: { nested: ["untouched", 0] }, items: { pump: { id: "pump", name: "Pump", quantity: 1, photos: [] } },
    containers: { bag: { id: "bag", name: "Bag", photos: [] } },
    layouts: { source: { id: "source", name: "Template", opaque: { keep: true }, rootContainerIds: [],
      arrangement: { rootContainerIds: [], items: {}, containers: {}, packedItems: {}, itemQuantities: {} } } } };
  sourcePayload[type][serverId].photos = photos;
  sourcePayload[type][serverId].dimensions = { length: 10, width: 5, height: 2 };
  const state = { activeLayoutId: layoutId, locations: copy(sourcePayload.locations), categories: [], packedItems: {},
    layouts: { [layoutId]: { ...copy(sourcePayload.layouts.source), id: layoutId, adminSharedSourceId: "selected",
      adminCausalSource: { version: 1, binding: copy(binding), exists: true, visibility: "private", base: { stateRevision }, planId: null } } },
    items: { "local-item": { ...copy(sourcePayload.items.pump), id: "local-item", publicCatalogLayoutId: layoutId } },
    containers: { "local-bag": { ...copy(sourcePayload.containers.bag), id: "local-bag", publicCatalogLayoutId: layoutId } } };
  for (const row of [...Object.values(state.items), ...Object.values(state.containers)]) {
    row.photos = row.photos.map(photo => ({ ...photo, id: photo.id ?? photo.photoId })); normalizeItemPhotos(row);
  }
  const mappings = { items: { "local-item": "pump" }, containers: { "local-bag": "bag" } };
  const source = state.layouts[layoutId].adminCausalSource;
  source.photoView = captureAdminTemplatePhotoView({ binding, layoutId, sourcePayload, state, mappings });
  const ownerMap = captureAdminTemplatePhotoOwnerMap({ binding, layoutId, stateRevision, sourcePayload, state, mappings });
  source.photoOwnerMap = copy(ownerMap);
  const beforeState = adminTemplatePhotoNamespace(state, layoutId);
  state[type][localId].name = "Edited owner"; delete state[type][localId].dimensions;
  state[type][localId].photos = photoIds.map(id => copy(beforeState[type][localId].photos.find(photo => photo.id === id)));
  const payload = copy(sourcePayload); payload[type][serverId].name = "Edited owner"; delete payload[type][serverId].dimensions;
  const body = { version: 1, base: { stateRevision }, payload, metadata: copy(metadata), photoEdit: { version: 1, entityType, entityId: serverId, photoIds } };
  const operationId = randomUUID(), action = { operationId, kind: "template.save", body };
  const photoSnapshot = { version: 1, layoutId, ownerMap, sourcePayload, beforeState, state: adminTemplatePhotoNamespace(state, layoutId), metadata: copy(metadata) };
  const editorSnapshot = adminTemplatePhotoEditorSnapshot(state, layoutId, metadata);
  const intent = adminTemplateIntent({ ...binding, ...action }), { id, body: _body, ...identity } = intent, { id: _id, ...digestInput } = intent;
  const confirmedPayload = copy(payload); confirmedPayload[type][serverId].photos = photoIds.map(id => copy(photos.find(photo => (photo.id ?? photo.photoId) === id)));
  const result = { version: 1, ownerId: "template-owner", entityType, entityId: serverId, photoIds: copy(photoIds),
    removedPhotoIds: photos.map(photo => photo.id ?? photo.photoId).filter(id => !photoIds.includes(id)), confirmedPayload, confirmedPayloadDigest: hash(confirmedPayload) };
  const receipt = { operation: { id, ...identity, payloadDigest: hash(digestInput), state: "committed" }, result: { status: 200, payload: {
    ok: true, listId: binding.listId, itemKey: binding.itemKey, stateRevision: 8, visibility: "private", indexes: [], photoEdit: result } } };
  return { binding, layoutId, type, serverId, localId, state, metadata, sourcePayload, action, body, intent, result, receipt,
    input: { binding, operationId, body, photoSnapshot, editorSnapshot } };
}

export function photoEditStorage() {
  const values = new Map(), controls = { quota: false, drop: false };
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem(key, value) { if (controls.quota) throw Error("Quota"); if (!controls.drop) values.set(key, value); }, removeItem: key => values.delete(key) };
  const tails = new Map(), locks = { request(key, task) { const next = (tails.get(key) || Promise.resolve()).catch(() => {}).then(task); tails.set(key, next); return next; } };
  return { values, controls, storage, locks };
}
