import { canonicalTemplateJson as canonical } from "../sync/admin-template-protocol.js";
import { projectAdminTemplatePhotoTreeCopyPlanResult } from "../sync/admin-template-photo-tree-copy-save-plan.js";
import { assertAdminTemplatePhotoCopyEditor } from "../sync/admin-template-photo-copy-record.js";
import { captureAdminTemplatePhotoOwnerMap, assertAdminTemplatePhotoOwnerMap } from "../sync/admin-template-photo-owner-map.js";
import { captureAdminTemplatePhotoView } from "../sync/admin-template-photo-view.js";
import { projectAdminTemplateServerVariant } from "./admin-template-server-variant.js";

const types = ["items", "containers"], collections = ["layouts", ...types];
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const clone = value => JSON.parse(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const paused = () => { throw Object.assign(Error("Подтверждённое дерево и местные шаблоны требуют сверки. Местные данные сохранены."),
  { code: "admin-template-photo-tree-copy-projection-paused", isAdminTemplateBlocked: true }); };

function namespace(state, side) {
  const layout = state.layouts[side.layoutId];
  if (!plain(layout) || !plain(layout.arrangement)) paused();
  return { activeLayoutId: side.layoutId, layouts: { [side.layoutId]: layout },
    ...Object.fromEntries(types.map(type => [type, Object.fromEntries(Object.entries(state[type]).filter(([, row]) => row?.publicCatalogLayoutId === side.layoutId))])),
    locations: layout.locations, categories: layout.categories, packedItems: layout.arrangement.packedItems };
}

function assertBefore(state, proof, intent) {
  if (!plain(state) || !collections.every(type => plain(state[type]))) paused();
  for (const [side, payload, binding, revision] of [
    [proof.source, intent.body.photoCopy.source.payload, { ...intentBinding(intent), listId: intent.body.photoCopy.source.listId,
      itemKey: intent.body.photoCopy.source.itemKey }, intent.body.photoCopy.source.base.stateRevision],
    [proof.target, intent.body.payload, intentBinding(intent), intent.body.base.stateRevision]
  ]) {
    // Current namespaces must be the exact captured before states. No pending
    // marker is stripped here, including one that only looks like our UUID.
    if (!same(namespace(state, side), side.beforeState)) paused();
    assertAdminTemplatePhotoOwnerMap({ binding, layoutId: side.layoutId, stateRevision: revision,
      map: side.ownerMap, state, sourcePayload: payload });
  }
  for (const owner of proof.copiedOwners) if (collections.some(type => Object.hasOwn(state[type], owner.localId))) paused();

  // Check only schema-defined links. An opaque string that resembles an owner
  // ID is business data, not permission to relabel or remove that attribute.
  const targetIds = new Set([...proof.target.ownerMap.owners.map(owner => owner.localId), ...proof.copiedOwners.map(owner => owner.localId)]);
  const ref = id => { if (targetIds.has(id)) paused(); };
  const ids = values => { if (Array.isArray(values)) values.forEach(ref); };
  const placement = row => {
    if (!plain(row)) return;
    ref(row.parentId); ids(row.childIds); ids(row.itemIds);
    if (Array.isArray(row.order)) row.order.forEach(entry => { if (["item", "container"].includes(entry?.type)) ref(entry.id); });
  };
  for (const [id, layout] of Object.entries(state.layouts)) {
    if (id === proof.target.layoutId || !plain(layout)) continue;
    ids(layout.rootContainerIds); const a = layout.arrangement;
    if (!plain(a)) continue;
    ids(a.rootContainerIds);
    for (const [key, row] of Object.entries(a.containers || {})) { ref(key); placement(row); }
    for (const [key, parent] of Object.entries(a.items || {})) { ref(key); ref(parent); }
    for (const key of [...Object.keys(a.itemQuantities || {}), ...Object.keys(a.packedItems || {})]) ref(key);
  }
  for (const row of Object.values(state.containers)) if (row?.publicCatalogLayoutId !== proof.target.layoutId) placement(row);
  for (const row of Object.values(state.items)) if (row?.publicCatalogLayoutId !== proof.target.layoutId) ref(row?.containerId);
}

const intentBinding = intent => Object.fromEntries(["actorId", "environment", "listId", "itemKey"].map(key => [key, intent[key]]));

function remap(projected, proof, intent) {
  const value = clone(projected), binding = intentBinding(intent), { confirmedPayload, stateRevision, target } = proof;
  const maps = { items: new Map(), containers: new Map() }, mappings = { items: {}, containers: {} };
  const current = value.layout.adminCausalSource.photoOwnerMap;
  for (const owner of current.owners) {
    const old = target.ownerMap.owners.find(row => row.type === owner.type && row.serverId === owner.serverId);
    const added = proof.copiedOwners.find(row => (row.entityType === "item" ? "items" : "containers") === owner.type && row.serverId === owner.serverId);
    if (Boolean(old) === Boolean(added)) paused();
    const localId = old?.localId || added.localId;
    maps[owner.type].set(owner.localId, localId); mappings[owner.type][localId] = owner.serverId;
  }
  if (current.owners.length !== target.ownerMap.owners.length + proof.copiedOwners.length) paused();
  const ref = (id, type) => { if (!id) return ""; if (!maps[type].has(id)) paused(); return maps[type].get(id); };
  const ids = (rows, type) => (rows || []).map(id => ref(id, type));
  const placement = row => ({ ...row, parentId: ref(row.parentId, "containers"), childIds: ids(row.childIds, "containers"),
    itemIds: ids(row.itemIds, "items"), order: (row.order || []).map(entry => {
      if (!["item", "container"].includes(entry.type)) paused();
      return { ...entry, id: ref(entry.id, entry.type === "item" ? "items" : "containers") };
    }) });
  value.containers = Object.fromEntries(Object.entries(value.containers).map(([id, row]) => [ref(id, "containers"), { ...placement(row), id: ref(id, "containers") }]));
  value.items = Object.fromEntries(Object.entries(value.items).map(([id, row]) => [ref(id, "items"), { ...row, id: ref(id, "items"), containerId: ref(row.containerId, "containers") }]));
  const object = (rows, type, convert) => Object.fromEntries(Object.entries(rows || {}).map(([id, row]) => [ref(id, type), convert(row)]));
  const a = value.layout.arrangement;
  value.layout.rootContainerIds = ids(value.layout.rootContainerIds, "containers");
  value.layout.arrangement = { ...a, rootContainerIds: ids(a.rootContainerIds, "containers"), containers: object(a.containers, "containers", placement),
    items: object(a.items, "items", id => ref(id, "containers")), itemQuantities: object(a.itemQuantities, "items", row => row), packedItems: object(a.packedItems, "items", row => row) };
  // Copy never changes old owners. Keep their already proven local display and
  // legacy timestamps byte-exact instead of normalizing those fields a second time.
  for (const owner of target.ownerMap.owners) value[owner.type][owner.localId] = clone(target.beforeState[owner.type][owner.localId]);
  const candidate = { layouts: { [target.layoutId]: value.layout }, items: value.items, containers: value.containers };
  const photoView = captureAdminTemplatePhotoView({ binding, layoutId: target.layoutId, state: candidate, sourcePayload: confirmedPayload, mappings });
  const photoOwnerMap = captureAdminTemplatePhotoOwnerMap({ binding, layoutId: target.layoutId, stateRevision, state: candidate, sourcePayload: confirmedPayload, mappings });
  value.layout.adminCausalSource = { ...clone(target.beforeState.layouts[target.layoutId].adminCausalSource), version: 1, binding,
    exists: true, deleted: false, visibility: "private", base: { stateRevision }, planId: null, indexes: [],
    canonicalPayload: clone(confirmedPayload), photoView, photoOwnerMap };
  value.layout.templatePublished = false; value.layout.templateDraftServerHydrated = true;
  return value;
}

// This prepares a detached namespace replacement, not a live apply/persist or
// active-layout hydration. Global activeLayoutId, dictionaries and packedItems
// stay as supplied; the app must separately choose contextual hydration from
// targetSnapshot under its current scope guard and persist with quota rollback.
// No arbitrary proof-shaped object or boolean bypasses the V9 cold validation.
export async function prepareAdminTemplatePhotoTreeCopyProjection(input, guard = () => {}) {
  if (!exact(input, ["state", "plan", "store", "receipt", "stageReceipts"])) paused();
  const { store } = input, { state, plan, receipt, stageReceipts } = clone({ state: input.state, plan: input.plan,
    receipt: input.receipt, stageReceipts: input.stageReceipts });
  const proof = await projectAdminTemplatePhotoTreeCopyPlanResult({ plan, store, receipt, stageReceipts }, guard); guard();
  const intent = plan.operations[0]; assertBefore(state, proof, intent);
  const projected = projectAdminTemplateServerVariant(state.layouts[proof.target.layoutId], { exists: true, deleted: false,
    visibility: "private", stateRevision: proof.stateRevision, payload: proof.confirmedPayload, metadata: proof.metadata }, plan.id,
    { photoBinding: intentBinding(intent), photoOwnerMapEnabled: true });
  const projection = remap(projected, proof, intent), nextState = clone(state), layoutId = proof.target.layoutId;
  nextState.layouts[layoutId] = clone(projection.layout);
  for (const type of types) {
    for (const [id, row] of Object.entries(nextState[type])) if (row?.publicCatalogLayoutId === layoutId) delete nextState[type][id];
    Object.assign(nextState[type], clone(projection[type]));
  }
  const targetSnapshot = { layoutId, ownerMap: clone(projection.layout.adminCausalSource.photoOwnerMap),
    beforeState: namespace(nextState, proof.target), metadata: clone(proof.metadata) };
  assertAdminTemplatePhotoCopyEditor({ binding: intentBinding(intent), revision: proof.stateRevision,
    payload: proof.confirmedPayload, side: targetSnapshot });
  guard();
  return clone({ proof, projection, targetSnapshot, nextState });
}
