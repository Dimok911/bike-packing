import { duplicateContainerSnapshotRecords, placeDuplicatedContainerSnapshotInLayoutState } from "../state/container-ops.js";
import { cloneIsolatedPublicEntity } from "../public/copy-public-to-private.js";
import { normalizeLayoutArrangement } from "../state/layout-normalize.js";
import { normalizeItemQuantity } from "../state/normalize.js";
import { isItemUnavailableForPacking } from "../state/layout-locks.js";
import { canonicalTemplateJson, validTemplateOperationId } from "./admin-template-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const fail = () => { throw Error("Не подтверждены состав сумки и место копии. Исходные данные сохранены."); };
const ids = value => Array.isArray(value) && value.every(id => typeof id === "string" && id && !["__proto__", "constructor", "prototype"].includes(id)) && new Set(value).size === value.length;

// This planner reads only one prepared catalog. Its caller persists the result
// under that catalog's original revision; no other template is a source here.
export async function prepareAdminTemplateTreeCopy(state, request, { operationId, changedAt = "", currentEditMeta = () => ({}),
  markEdited = () => {}, copyContainerName = name => `${name} копия`, normalizeContainerColor = value => value,
  hasPhotos = row => Boolean(row.photos?.length) } = {}) {
  const frozen = clone(state), { rootId, sourceLayoutId, targetLayoutId, includeContents, targetParentId = "", targetIndex = null, mode = "copy" } = clone(request);
  const layout = frozen.layouts?.[targetLayoutId], arrangement = layout?.arrangement;
  if (!validTemplateOperationId(operationId) || !["copy", "link"].includes(mode) || typeof includeContents !== "boolean" || sourceLayoutId !== targetLayoutId
    || !layout?.adminCausalSource?.exists || layout.locked || !arrangement?.containers || !arrangement.items
    || targetIndex !== null && (!Number.isSafeInteger(targetIndex) || targetIndex < 0)) fail();
  const owner = row => row?.publicCatalogLayoutId === targetLayoutId;
  if (targetParentId && (!owner(frozen.containers?.[targetParentId]) || !arrangement.containers[targetParentId])) fail();
  const placedSource = Object.hasOwn(arrangement.containers, rootId), source = { rootId, containers: {}, items: {} };
  const visited = new Set(), seenItems = new Set();
  const walk = (id, parentId = null) => {
    const row = frozen.containers?.[id], placement = placedSource ? arrangement.containers[id] : row;
    if (visited.has(id) || !owner(row) || row.id !== id || hasPhotos(row) || !placement) fail();
    visited.add(id);
    const shell = !includeContents && id === rootId;
    const childIds = shell ? [] : placement.childIds, itemIds = shell ? [] : placement.itemIds, order = shell ? [] : placement.order;
    if (!ids(childIds) || !ids(itemIds) || !Array.isArray(order) || order.length !== childIds.length + itemIds.length
      || new Set(order.map(entry => `${entry?.type}:${entry?.id}`)).size !== order.length
      || order.some(entry => !(entry?.type === "item" ? itemIds : entry?.type === "container" ? childIds : []).includes(entry.id))
      || parentId && placement.parentId !== parentId) fail();
    source.containers[id] = { ...clone(row), parentId, childIds: [...childIds], itemIds: [...itemIds], order: clone(order) };
    for (const itemId of itemIds) {
      const item = frozen.items?.[itemId], containerId = placedSource ? arrangement.items[itemId] : item?.containerId;
      if (seenItems.has(itemId) || !owner(item) || item.id !== itemId || containerId !== id || hasPhotos(item) || isItemUnavailableForPacking(item)) fail();
      seenItems.add(itemId);
      source.items[itemId] = { ...clone(item), containerId: id,
        quantity: normalizeItemQuantity(placedSource ? arrangement.itemQuantities?.[itemId] : item.quantity) };
    }
    for (const childId of childIds) walk(childId, id);
  };
  walk(rootId);
  // A shell cannot erase a catalog tree's existing membership. Linking is an
  // arrangement-only operation, available only for an entirely unplaced tree.
  if (mode === "link" && (!includeContents && (frozen.containers[rootId].childIds?.length || frozen.containers[rootId].itemIds?.length)
    || Object.keys(source.containers).some(id => arrangement.containers[id] || arrangement.rootContainerIds.includes(id))
    || Object.keys(source.items).some(id => Object.hasOwn(arrangement.items, id)))) fail();
  const entries = ["containers", "items"].flatMap(type => Object.keys(source[type]).sort().map((sourceId, index) => ({
    type, sourceId, targetId: mode === "link" ? sourceId : `${type === "items" ? "item" : "container"}-template-tree-${operationId}-${index}`
  })));
  if (mode === "copy" && entries.some(entry => ["layouts", "containers", "items"].some(type => Object.hasOwn(frozen[type] || {}, entry.targetId)))) fail();
  const snapshot = clone(frozen);
  let copied;
  if (mode === "link") {
    copied = { rootId };
    const target = snapshot.layouts[targetLayoutId], result = target.arrangement;
    for (const [id, row] of Object.entries(source.containers)) result.containers[id] = {
      parentId: id === rootId ? targetParentId : row.parentId || "", childIds: [...row.childIds], itemIds: [...row.itemIds], order: clone(row.order)
    };
    for (const [id, row] of Object.entries(source.items)) {
      result.items[id] = row.containerId; result.itemQuantities[id] = row.quantity; delete result.packedItems[id];
    }
    if (targetParentId) {
      const parent = result.containers[targetParentId]; parent.childIds.push(rootId);
      parent.order.splice(targetIndex === null ? parent.order.length : Math.min(targetIndex, parent.order.length), 0, { type: "container", id: rootId });
    } else result.rootContainerIds.splice(targetIndex === null ? result.rootContainerIds.length : Math.min(targetIndex, result.rootContainerIds.length), 0, rootId);
    target.rootContainerIds = [...result.rootContainerIds];
    normalizeLayoutArrangement(target, snapshot); markEdited(target, changedAt);
  } else {
    copied = await duplicateContainerSnapshotRecords(source, { targetState: snapshot, changedAt, currentEditMeta, normalizeContainerColor,
      copyContainerName, targetParentId: targetParentId || null, cloneEntity: cloneIsolatedPublicEntity,
      copyPhotos: async row => { if (hasPhotos(row)) fail(); return []; },
      mapRecordToTarget: row => Object.assign(row, { publicCatalogLayoutId: targetLayoutId, adminDemo: Boolean(layout.adminDemo) }),
      idForRecord: (type, id) => entries.find(entry => entry.type === (type === "item" ? "items" : "containers") && entry.sourceId === id)?.targetId });
    if (!placeDuplicatedContainerSnapshotInLayoutState(snapshot, targetLayoutId, copied.rootId, { ...copied, changedAt,
      targetParentId, targetIndex, normalizeLayoutArrangement, touchLayout: id => markEdited(snapshot.layouts[id], changedAt),
      touchContainer: id => markEdited(snapshot.containers[id], changedAt) })) fail();
  }
  // Normalization may fill derived fields for the new owners, but it must not
  // repair or change any existing placement as part of this copy.
  const result = snapshot.layouts[targetLayoutId].arrangement, previous = clone(result);
  for (const entry of entries) {
    if (entry.type === "items") {
      if (result.itemQuantities[entry.targetId] !== source.items[entry.sourceId].quantity || result.packedItems[entry.targetId]) fail();
      if (mode === "copy") snapshot.items[entry.targetId].quantity = 1;
      delete previous.items[entry.targetId]; delete previous.itemQuantities[entry.targetId]; delete previous.packedItems[entry.targetId];
    } else delete previous.containers[entry.targetId];
  }
  previous.rootContainerIds = previous.rootContainerIds.filter(id => id !== copied.rootId);
  if (targetParentId) {
    previous.containers[targetParentId].childIds = previous.containers[targetParentId].childIds.filter(id => id !== copied.rootId);
    previous.containers[targetParentId].order = previous.containers[targetParentId].order.filter(entry => entry.id !== copied.rootId);
  }
  if (canonicalTemplateJson(previous) !== canonicalTemplateJson(arrangement)) fail();
  return { snapshot, entries: mode === "link" ? [] : entries, rootId: copied.rootId, source };
}
