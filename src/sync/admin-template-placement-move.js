import { moveItemInLayoutArrangement, moveContainerInLayoutArrangement, moveRootColumnInState, placeExistingContainerInLayoutInState } from "../state/layout-ops.js";
import { normalizeLayoutArrangement } from "../state/layout-normalize.js";
import { canonicalTemplateJson, validTemplateOperationId } from "./admin-template-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const fail = () => { throw Error("Не подтверждены исходное размещение и новое место. Исходные данные сохранены."); };

export function prepareAdminTemplatePlacementMove(state, request, { operationId, hasPhotos = row => Boolean(row.photos?.length) } = {}) {
  const snapshot = clone(state), { sourceLayoutId, targetLayoutId, action, sourceId, targetContainerId = "", targetIndex = null } = request;
  const layout = snapshot.layouts?.[targetLayoutId], before = clone(layout?.arrangement || {});
  const itemMove = action === "move-item", field = itemMove ? "items" : "containers";
  const owner = (type, id) => snapshot[type]?.[id]?.id === id && snapshot[type][id].publicCatalogLayoutId === targetLayoutId;
  if (!validTemplateOperationId(operationId) || sourceLayoutId !== targetLayoutId || !layout?.adminCausalSource?.exists || layout.locked
    || !["move-item", "move-container", "move-root", "lift-container"].includes(action) || !owner(field, sourceId)
    || !Object.hasOwn(before[field] || {}, sourceId) || targetIndex !== null && (!Number.isSafeInteger(targetIndex) || targetIndex < 0)
    || !same(layout.rootContainerIds, before.rootContainerIds)) fail();
  if (["move-item", "move-container"].includes(action) && (!owner("containers", targetContainerId) || !before.containers?.[targetContainerId])) fail();
  if (action === "move-root" && (!before.rootContainerIds.includes(sourceId) || targetIndex === null)) fail();
  if (action === "lift-container" && (!before.containers[sourceId].parentId || snapshot.containers[sourceId].nestable !== true)) fail();
  for (const type of ["items", "containers"]) for (const id of Object.keys(before[type] || {})) if (!owner(type, id) || hasPhotos(snapshot[type][id])) fail();
  normalizeLayoutArrangement(layout, snapshot);
  if (!same(before, layout.arrangement)) fail();
  const moved = itemMove ? moveItemInLayoutArrangement(snapshot, layout, sourceId, targetContainerId, targetIndex)
    : action === "move-container" ? moveContainerInLayoutArrangement(snapshot, layout, sourceId, targetContainerId, targetIndex)
    : action === "move-root" ? moveRootColumnInState(snapshot, targetLayoutId, sourceId, targetIndex)
    : placeExistingContainerInLayoutInState(snapshot, sourceId, "", targetLayoutId, { targetIndex });
  if (!moved) fail();
  const result = clone(layout.arrangement); normalizeLayoutArrangement(layout, snapshot);
  if (!same(result, layout.arrangement) || !same(before.itemQuantities, result.itemQuantities)
    || !same(Object.keys(before.items).sort(), Object.keys(result.items).sort())
    || !same(Object.keys(before.containers).sort(), Object.keys(result.containers).sort())) fail();
  const updates = [];
  for (const [id, placement] of Object.entries(result.containers)) if (!same(before.containers[id], placement)) {
    Object.assign(snapshot.containers[id], clone(placement)); updates.push({ type: "containers", id });
  }
  for (const [id, containerId] of Object.entries(result.items)) if (before.items[id] !== containerId) {
    snapshot.items[id].containerId = containerId; updates.push({ type: "items", id });
  }
  // Lifting updates the catalog root as well as its previous parent's order.
  if (action === "lift-container" && !updates.some(row => row.type === "containers" && row.id === sourceId)) fail();
  return { snapshot, entries: [], updates, ...(itemMove ? { itemId: sourceId } : { rootId: sourceId }) };
}
