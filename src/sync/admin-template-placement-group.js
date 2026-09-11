import { createGroupFromItemsInState } from "../state/layout-ops.js";
import { normalizeLayoutArrangement } from "../state/layout-normalize.js";
import { canonicalTemplateJson, validTemplateOperationId } from "./admin-template-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const fail = () => { throw Error("Не подтверждены вещи и место новой группы. Исходные данные сохранены."); };

export function prepareAdminTemplatePlacementGroup(state, request, { operationId, changedAt = "", currentEditMeta = () => ({}), hasPhotos = row => Boolean(row.photos?.length) } = {}) {
  const snapshot = clone(state), { sourceLayoutId, targetLayoutId, sourceId, targetItemId } = request;
  const layout = snapshot.layouts?.[targetLayoutId], before = clone(layout?.arrangement || {});
  const owner = (type, id) => snapshot[type]?.[id]?.id === id && snapshot[type][id].publicCatalogLayoutId === targetLayoutId;
  if (!validTemplateOperationId(operationId) || sourceLayoutId !== targetLayoutId || !layout?.adminCausalSource?.exists || layout.locked
    || sourceId === targetItemId || ![sourceId, targetItemId].every(id => owner("items", id) && Object.hasOwn(before.items || {}, id))
    || !same(layout.rootContainerIds, before.rootContainerIds)) fail();
  for (const type of ["items", "containers"]) for (const id of Object.keys(before[type] || {})) if (!owner(type, id) || hasPhotos(snapshot[type][id])) fail();
  normalizeLayoutArrangement(layout, snapshot); if (!same(before, layout.arrangement)) fail();
  const groupId = `container-template-group-${operationId}`;
  if (["layouts", "containers", "items"].some(type => Object.hasOwn(snapshot[type] || {}, groupId))) fail();
  if (!createGroupFromItemsInState(snapshot, targetLayoutId, sourceId, targetItemId, { groupId, changedAt, currentEditMeta,
    markRecordActivePublicCatalog: row => Object.assign(row, { publicCatalogLayoutId: targetLayoutId, adminDemo: Boolean(layout.adminDemo) }) })) fail();
  for (const id of [sourceId, targetItemId]) layout.arrangement.itemQuantities[id] = before.itemQuantities[id];
  const expected = clone(layout.arrangement); normalizeLayoutArrangement(layout, snapshot);
  if (!same(expected, layout.arrangement) || !same(before.itemQuantities, expected.itemQuantities)
    || !same(Object.keys(before.items).sort(), Object.keys(expected.items).sort())
    || !same([...Object.keys(before.containers), groupId].sort(), Object.keys(expected.containers).sort())
    || !same(expected.containers[groupId].order, [{ type: "item", id: targetItemId }, { type: "item", id: sourceId }])) fail();
  const updates = [];
  for (const [id, placement] of Object.entries(expected.containers)) if (id === groupId || !same(before.containers[id], placement)) {
    Object.assign(snapshot.containers[id], clone(placement)); if (id !== groupId) updates.push({ type: "containers", id });
  }
  for (const id of [sourceId, targetItemId]) { snapshot.items[id].containerId = groupId; updates.push({ type: "items", id }); }
  return { snapshot, rootId: groupId, entries: [{ type: "containers", targetId: groupId }], updates };
}
