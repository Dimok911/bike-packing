import { validTemplateOperationId } from "../sync/admin-template-protocol.js";
import { createLayoutArrangementFromCurrentState } from "../state/layout-arrangement.js";
import { normalizeItemPhotos } from "../state/item-photos.js";
import { captureAdminTemplatePhotoView, assertAdminTemplatePhotoView } from "../sync/admin-template-photo-view.js";

const clone = value => JSON.parse(JSON.stringify(value));
const paused = () => Error("Серверный вариант требует отдельной сверки связей. Местный черновик сохранён.");
export const isCausalCopyLayoutId = id => typeof id === "string" && id.startsWith("layout-") && validTemplateOperationId(id.slice(7));
export function adminTemplateCopiedLayoutId(payload) {
  const id = payload?.activeLayoutId;
  return isCausalCopyLayoutId(id)
    && Object.keys(payload.layouts || {}).length === 1 && payload.layouts[id]?.id === id ? id : null;
}
const mapIds = (values, map) => (values || []).map(id => { if (!map.has(id)) throw paused(); return map.get(id); });
const ref = (id, map) => { if (!id) return ""; if (!map.has(id)) throw paused(); return map.get(id); };
const order = (values, containers, items) => (values || []).map(row => {
  if (!["container", "item"].includes(row?.type)) throw paused();
  return { ...clone(row), id: ref(row.id, row.type === "container" ? containers : items) };
});

// Prepare a detached editor patch. The decision stores its IDs before applying
// it, so a reload never creates a second set of server-derived local entities.
export function projectAdminTemplateServerVariant(layout, server, decisionId, { photoBinding = null } = {}) {
  if (!layout?.id || !validTemplateOperationId(decisionId) || !server?.exists || server.deleted
    || Object.keys(server.payload?.layouts || {}).length !== 1) throw paused();
  const payload = server.payload, sourceLayout = Object.values(payload.layouts)[0], items = {}, containers = {};
  const copiedLayoutId = adminTemplateCopiedLayoutId(payload);
  const containerMap = new Map(Object.keys(payload.containers || {}).sort().map((id, i) => [id, `admin-server-container-${decisionId}-${i}`]));
  const itemMap = new Map(Object.keys(payload.items || {}).sort().map((id, i) => [id, `admin-server-item-${decisionId}-${i}`]));
  const placement = row => ({ ...clone(row), parentId: ref(row.parentId, containerMap), childIds: mapIds(row.childIds, containerMap),
    itemIds: mapIds(row.itemIds, itemMap), order: order(row.order, containerMap, itemMap) });
  for (const [id, nextId] of containerMap) {
    const row = payload.containers[id]; if (row.id !== id) throw paused();
    containers[nextId] = { ...placement(row), id: nextId, sharedSourceId: copiedLayoutId ? id : row.sharedSourceId || id,
      publicCatalogLayoutId: layout.id, adminDemo: Boolean(layout.adminDemo) };
  }
  for (const [id, nextId] of itemMap) {
    const row = payload.items[id]; if (row.id !== id) throw paused();
    items[nextId] = { ...clone(row), id: nextId, containerId: ref(row.containerId, containerMap), sharedSourceId: copiedLayoutId ? id : row.sharedSourceId || id,
      publicCatalogLayoutId: layout.id, adminDemo: Boolean(layout.adminDemo) };
  }
  const rootContainerIds = mapIds(sourceLayout.rootContainerIds, containerMap);
  const mapObject = (value, map, convert) => Object.fromEntries(Object.entries(value || {}).map(([id, row]) => [ref(id, map), convert(row)]));
  const old = sourceLayout.arrangement;
  const arrangement = old ? { ...clone(old), rootContainerIds: mapIds(old.rootContainerIds, containerMap),
    containers: mapObject(old.containers, containerMap, placement), items: mapObject(old.items, itemMap, id => ref(id, containerMap)),
    itemQuantities: mapObject(old.itemQuantities, itemMap, value => value), packedItems: mapObject(old.packedItems, itemMap, value => value) }
    : createLayoutArrangementFromCurrentState({ items, containers }, rootContainerIds);
  const next = { ...clone(sourceLayout), id: layout.id, name: server.metadata.title, note: server.metadata.description,
    language: server.metadata.language, locations: clone(payload.locations || []), categories: clone(payload.categories || []), rootContainerIds, arrangement };
  for (const field of ["adminDemo", "adminDemoLanguage", "adminDemoListId", "adminSharedSourceId", "adminTemplateCopy"]) {
    delete next[field]; if (Object.hasOwn(layout, field)) next[field] = clone(layout[field]);
  }
  for (const field of ["adminCausalSource", "adminCausalCopyPlan", "templateDraftSyncPending", "templateUnpublishPending", "publicCatalogLayoutId"]) delete next[field];
  if (copiedLayoutId) { next.adminTemplateCopy = true; next.sharedSourceId = copiedLayoutId; }
  if (photoBinding && [...Object.values(items), ...Object.values(containers)].some(row => row.photos?.length)) {
    for (const row of [...Object.values(items), ...Object.values(containers)]) {
      for (const photo of row.photos || []) if (photo && photo.id == null && photo.photoId) photo.id = photo.photoId;
      normalizeItemPhotos(row);
    }
    const photoView = captureAdminTemplatePhotoView({ binding: photoBinding, layoutId: layout.id, sourcePayload: payload,
      state: { layouts: { [layout.id]: next }, items, containers }, mappings: {
        items: Object.fromEntries([...itemMap].map(([sourceId, localId]) => [localId, sourceId])),
        containers: Object.fromEntries([...containerMap].map(([sourceId, localId]) => [localId, sourceId])) } });
    // Kept inside the saved projection until the confirmed source is installed.
    next.adminCausalSource = { photoView };
  }
  return { layoutId: layout.id, layout: next, items, containers };
}

export function applyAdminTemplateServerVariant(state, layoutId, projection, source, { persist, applyArrangement = () => {} }) {
  const layout = state.layouts?.[layoutId];
  if (!layout || projection?.layoutId !== layoutId || projection.layout?.id !== layoutId) throw paused();
  if (projection.layout.adminCausalSource?.photoView || [...Object.values(projection.items || {}), ...Object.values(projection.containers || {})].some(row => row.photos?.length)) {
    assertAdminTemplatePhotoView({ binding: source.binding, layoutId, baseline: projection.layout.adminCausalSource?.photoView,
      state: { layouts: { [layoutId]: projection.layout }, items: projection.items, containers: projection.containers } });
  }
  const oldItems = new Set(Object.keys(state.items || {}).filter(id => state.items[id].publicCatalogLayoutId === layoutId));
  const oldContainers = new Set(Object.keys(state.containers || {}).filter(id => state.containers[id].publicCatalogLayoutId === layoutId));
  const ownsReferences = value => {
    if (!value || typeof value !== "object") return;
    for (const [key, row] of Object.entries(value)) {
      for (const id of [key, typeof row === "string" ? row : ""]) {
        if (Object.hasOwn(state.items, id) && !oldItems.has(id) || Object.hasOwn(state.containers, id) && !oldContainers.has(id)) throw paused();
      }
      if (row && typeof row === "object") ownsReferences(row);
    }
  };
  ownsReferences({ roots: layout.rootContainerIds, arrangement: layout.arrangement });
  oldContainers.forEach(id => { const row = state.containers[id]; ownsReferences({ parentId: row.parentId, childIds: row.childIds, itemIds: row.itemIds, order: row.order }); });
  oldItems.forEach(id => ownsReferences({ containerId: state.items[id].containerId }));
  const usesOld = value => {
    if (!value || typeof value !== "object") return false;
    for (const [key, row] of Object.entries(value)) {
      if (oldItems.has(key) || oldContainers.has(key) || typeof row === "string" && (oldItems.has(row) || oldContainers.has(row))) return true;
      if (row && typeof row === "object" && usesOld(row)) return true;
    }
    return false;
  };
  // Other layouts may still reference these identities. Do not delete or
  // silently privatize such shared records while adopting a server version.
  if (Object.values(state.layouts).some(row => row !== layout && usesOld({ roots: row.rootContainerIds, arrangement: row.arrangement }))) throw paused();
  if (Object.entries(state.containers).some(([id, row]) => !oldContainers.has(id) && usesOld({ parentId: row.parentId, childIds: row.childIds, itemIds: row.itemIds, order: row.order }))
    || Object.entries(state.items).some(([id, row]) => !oldItems.has(id) && oldContainers.has(row.containerId))) throw paused();
  for (const [kind, removed] of [["items", oldItems], ["containers", oldContainers]]) {
    if (Object.keys(projection[kind]).some(id => Object.hasOwn(state[kind], id) && !removed.has(id))) throw paused();
  }
  const before = clone(state), oldLayout = clone(layout);
  const replace = (target, value) => { Object.keys(target).forEach(key => delete target[key]); Object.assign(target, clone(value)); };
  try {
    oldItems.forEach(id => delete state.items[id]); oldContainers.forEach(id => delete state.containers[id]);
    Object.assign(state.items, clone(projection.items)); Object.assign(state.containers, clone(projection.containers));
    const photoView = projection.layout.adminCausalSource?.photoView;
    replace(layout, { ...projection.layout, adminCausalSource: { ...source, ...(photoView ? { photoView } : {}) },
      templatePublished: source.visibility === "public", templateDraftServerHydrated: true });
    // Applying an arrangement normally switches the entire working catalog.
    // A server decision only replaces this editor, so normalize its records
    // in isolation and leave other local editors and personal records alone.
    const editorState = { ...state, layouts: { [layoutId]: layout },
      items: Object.fromEntries(Object.keys(projection.items).map(id => [id, state.items[id]])),
      containers: Object.fromEntries(Object.keys(projection.containers).map(id => [id, state.containers[id]])),
      packedItems: clone(layout.arrangement.packedItems || {}) };
    applyArrangement(layoutId, editorState); state.packedItems = editorState.packedItems;
    if (persist() === false) throw paused();
  } catch (error) {
    replace(state, before); replace(layout, oldLayout); state.layouts[layoutId] = layout; throw error;
  }
  return true;
}
