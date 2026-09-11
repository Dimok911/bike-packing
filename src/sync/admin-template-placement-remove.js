import { removeItemFromLayoutInState, removeContainerFromLayoutOnlyInState } from "../state/layout-ops.js";
import { normalizeLayoutArrangement } from "../state/layout-normalize.js";
import { canonicalTemplateJson, validTemplateOperationId } from "./admin-template-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const fail = () => { throw Error("Не подтверждён состав удаления из укладки. Исходные данные сохранены."); };

export function prepareAdminTemplatePlacementRemoval(state, request, { operationId, hasPhotos = row => Boolean(row.photos?.length) } = {}) {
  const snapshot = clone(state), { sourceLayoutId, targetLayoutId, sourceId, action } = request;
  const layout = snapshot.layouts?.[targetLayoutId], before = clone(layout?.arrangement || {}), itemOnly = action === "remove-item";
  const field = itemOnly ? "items" : "containers";
  const owner = (type, id) => snapshot[type]?.[id]?.id === id && snapshot[type][id].publicCatalogLayoutId === targetLayoutId;
  if (!validTemplateOperationId(operationId) || sourceLayoutId !== targetLayoutId || !layout?.adminCausalSource?.exists || layout.locked
    || !["remove-item", "remove-container"].includes(action) || !owner(field, sourceId) || !Object.hasOwn(before[field] || {}, sourceId)
    || !same(layout.rootContainerIds, before.rootContainerIds)) fail();
  for (const type of ["items", "containers"]) for (const id of Object.keys(before[type] || {})) if (!owner(type, id) || hasPhotos(snapshot[type][id])) fail();
  normalizeLayoutArrangement(layout, snapshot); if (!same(before, layout.arrangement)) fail();
  const containerIds = new Set(), itemIds = new Set();
  const walk = id => {
    if (containerIds.has(id)) fail(); containerIds.add(id);
    for (const item of before.containers[id].itemIds) itemIds.add(item);
    for (const child of before.containers[id].childIds) walk(child);
  };
  if (itemOnly) itemIds.add(sourceId); else walk(sourceId);
  // An administrative editor owns its records. A second editor/placement or
  // detached catalog parent referencing this read set makes removal ambiguous.
  for (const [id, other] of Object.entries(snapshot.layouts)) if (id !== targetLayoutId) {
    if ([...containerIds].some(key => other.arrangement?.containers?.[key]) || [...itemIds].some(key => Object.hasOwn(other.arrangement?.items || {}, key))) fail();
  }
  for (const [id, row] of Object.entries(snapshot.containers)) if (!before.containers[id]) {
    if ((row.childIds || []).some(key => containerIds.has(key)) || (row.itemIds || []).some(key => itemIds.has(key))) fail();
  }
  const removals = [];
  const removed = itemOnly ? removeItemFromLayoutInState(snapshot, targetLayoutId, sourceId)
    : removeContainerFromLayoutOnlyInState(snapshot, layout, sourceId, { deleteUnusedLayoutContainerEntity: id => {
      if (!containerIds.has(id) || !owner("containers", id)) fail();
      removals.push({ type: "containers", id }); delete snapshot.containers[id];
    } });
  if (!removed) fail();
  const result = clone(layout.arrangement), expected = clone(before);
  for (const id of itemIds) for (const key of ["items", "itemQuantities", "packedItems"]) delete expected[key][id];
  for (const id of containerIds) delete expected.containers[id];
  expected.rootContainerIds = expected.rootContainerIds.filter(id => !containerIds.has(id));
  for (const row of Object.values(expected.containers)) {
    row.itemIds = row.itemIds.filter(id => !itemIds.has(id)); row.childIds = row.childIds.filter(id => !containerIds.has(id));
    row.order = row.order.filter(entry => entry.type === "item" ? !itemIds.has(entry.id) : !containerIds.has(entry.id));
  }
  if (!same(result, expected)) fail();
  const updates = [];
  for (const id of itemIds) { snapshot.items[id].containerId = ""; updates.push({ type: "items", id }); }
  for (const id of containerIds) if (snapshot.containers[id]) {
    Object.assign(snapshot.containers[id], { parentId: null, childIds: [], itemIds: [], order: [] }); updates.push({ type: "containers", id });
  }
  for (const [id, row] of Object.entries(result.containers)) if (!same(before.containers[id], row)) {
    Object.assign(snapshot.containers[id], clone(row)); updates.push({ type: "containers", id });
  }
  normalizeLayoutArrangement(layout, snapshot); if (!same(result, layout.arrangement)) fail();
  return { snapshot, entries: [], updates, removals, removedItemIds: [...itemIds], removedContainerIds: [...containerIds], ...(itemOnly ? { itemId: sourceId } : { rootId: sourceId }) };
}
