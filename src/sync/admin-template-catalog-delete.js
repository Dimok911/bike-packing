import { preparePersonalDeletionBatch } from "./personal-deletion-intent.js";
import { normalizeLayoutArrangement } from "../state/layout-normalize.js";
import { canonicalTemplateJson, validTemplateOperationId } from "./admin-template-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const fail = () => { throw Error("Не подтверждён состав удаления из каталога. Исходные данные сохранены."); };

export function prepareAdminTemplateCatalogDeletion(state, request, options = {}) {
  if (!Object.hasOwn(request, "sourceIds")) return prepareSingleDeletion(state, request, options);
  const ids = request.sourceIds;
  if (request.sourceId || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) fail();
  let snapshot = state;
  const { sourceIds, ...single } = request;
  for (const sourceId of ids) snapshot = prepareSingleDeletion(snapshot, { ...single, sourceId }, options).snapshot;
  const updates = [], removals = [];
  for (const type of ["items", "containers"]) for (const [id, row] of Object.entries(state[type])) {
    if (!snapshot[type][id]) removals.push({ type, id });
    else if (!same(row, snapshot[type][id])) updates.push({ type, id });
  }
  return { snapshot, entries: [], updates, removals, ...(request.action === "delete-item" ? { itemId: ids[0] } : { rootId: ids[0] }) };
}

function prepareSingleDeletion(state, request, { operationId, hasPhotos = row => Boolean(row.photos?.length) } = {}) {
  const snapshot = clone(state), { sourceLayoutId, targetLayoutId, sourceId, action } = request;
  const layout = snapshot.layouts?.[targetLayoutId], itemOnly = action === "delete-item", field = itemOnly ? "items" : "containers";
  const own = (type, id) => snapshot[type]?.[id]?.id === id && snapshot[type][id].publicCatalogLayoutId === targetLayoutId;
  if (!validTemplateOperationId(operationId) || sourceLayoutId !== targetLayoutId || !layout?.adminCausalSource?.exists || layout.locked
    || !["delete-item", "delete-container"].includes(action) || !own(field, sourceId)) fail();
  const before = clone(layout.arrangement);
  if (!same(layout.rootContainerIds, before.rootContainerIds)) fail();
  normalizeLayoutArrangement(layout, snapshot); if (!same(before, layout.arrangement)) fail();
  // Validate both directions of catalog membership before invoking shared deletion
  // semantics. Detached trees must not hide foreign, duplicated or cyclic records.
  for (const type of ["items", "containers"]) for (const [id, row] of Object.entries(snapshot[type])) {
    if (row.publicCatalogLayoutId !== targetLayoutId) continue;
    if (!own(type, id) || hasPhotos(row)) fail();
    const parentId = type === "items" ? row.containerId : row.parentId;
    if (parentId && (!own("containers", parentId) || !(snapshot.containers[parentId][type === "items" ? "itemIds" : "childIds"] || []).includes(id))) fail();
    if (type === "containers") {
      if (![row.itemIds, row.childIds, row.order].every(Array.isArray)
        || new Set(row.itemIds).size !== row.itemIds.length || new Set(row.childIds).size !== row.childIds.length) fail();
      for (const child of row.childIds) if (!own("containers", child) || snapshot.containers[child].parentId !== id) fail();
      for (const item of row.itemIds) if (!own("items", item) || snapshot.items[item].containerId !== id) fail();
      const entries = [...row.itemIds.map(id => ({ type: "item", id })), ...row.childIds.map(id => ({ type: "container", id }))];
      if (row.order.length !== entries.length || new Set(row.order.map(canonicalTemplateJson)).size !== entries.length
        || row.order.some(entry => !entries.some(expected => same(entry, expected)))) fail();
      const visited = new Set([id]); let parent = parentId;
      while (parent) { if (visited.has(parent) || !own("containers", parent)) fail(); visited.add(parent); parent = snapshot.containers[parent].parentId; }
    }
  }
  for (const type of ["items", "containers"]) for (const id of Object.keys(before[type])) if (!own(type, id)) fail();
  const removedContainers = new Set(), affectedItems = new Set();
  const walk = id => { removedContainers.add(id); snapshot.containers[id].itemIds.forEach(item => affectedItems.add(item)); snapshot.containers[id].childIds.forEach(walk); };
  if (itemOnly) affectedItems.add(sourceId); else walk(sourceId);
  for (const [id, other] of Object.entries(snapshot.layouts)) if (id !== targetLayoutId) {
    if ([...removedContainers].some(key => other.arrangement?.containers?.[key]) || [...affectedItems].some(key => Object.hasOwn(other.arrangement?.items || {}, key))) fail();
  }
  for (const [id, row] of Object.entries(snapshot.containers)) if (!own("containers", id)) {
    if ((row.childIds || []).some(key => removedContainers.has(key)) || (row.itemIds || []).some(key => affectedItems.has(key))) fail();
  }
  const result = preparePersonalDeletionBatch(snapshot, { type: itemOnly ? "item" : "container", id: sourceId }, { hasPhotos }).snapshot;
  for (const [id, other] of Object.entries(snapshot.layouts)) if (id !== targetLayoutId && !same(other, result.layouts[id])) fail();
  const expected = clone(before);
  for (const id of affectedItems) for (const key of ["items", "itemQuantities", "packedItems"]) delete expected[key][id];
  for (const id of removedContainers) delete expected.containers[id];
  expected.rootContainerIds = expected.rootContainerIds.filter(id => !removedContainers.has(id));
  for (const row of Object.values(expected.containers)) {
    row.itemIds = row.itemIds.filter(id => !affectedItems.has(id)); row.childIds = row.childIds.filter(id => !removedContainers.has(id));
    row.order = row.order.filter(entry => entry.type === "item" ? !affectedItems.has(entry.id) : !removedContainers.has(entry.id));
  }
  const resultLayout = result.layouts[targetLayoutId];
  normalizeLayoutArrangement(resultLayout, result);
  if (!same(resultLayout.arrangement, expected) || !same(resultLayout.rootContainerIds, expected.rootContainerIds)) fail();
  const updates = [], removals = [];
  const shouldDelete = (type, id) => itemOnly ? type === "items" && id === sourceId
    : type === "containers" && removedContainers.has(id) && (id === sourceId || snapshot.containers[id].nestable !== true);
  for (const type of ["items", "containers"]) for (const [id, row] of Object.entries(snapshot[type])) {
    const after = result[type][id];
    if (shouldDelete(type, id)) { if (after) fail(); removals.push({ type, id }); continue; }
    const expectedRow = clone(row);
    if (type === "items" && affectedItems.has(id)) expectedRow.containerId = "";
    if (type === "containers" && removedContainers.has(id)) Object.assign(expectedRow, { parentId: null, childIds: [], itemIds: [], order: [] });
    else if (type === "containers") {
      expectedRow.childIds = (row.childIds || []).filter(id => !removedContainers.has(id));
      expectedRow.itemIds = (row.itemIds || []).filter(id => !affectedItems.has(id));
      expectedRow.order = (row.order || []).filter(entry => entry.type === "item" ? !affectedItems.has(entry.id) : !removedContainers.has(entry.id));
    }
    if (!same(after, expectedRow)) fail();
    if (!same(row, after)) { if (!own(type, id)) fail(); updates.push({ type, id }); }
  }
  if (result[field][sourceId]) fail();
  return { snapshot: result, entries: [], updates, removals, ...(itemOnly ? { itemId: sourceId } : { rootId: sourceId }) };
}
