import { normalizeLayoutArrangement } from "../state/layout-normalize.js";
import { canonicalTemplateJson, validTemplateOperationId } from "./admin-template-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const fail = () => { throw Error("Не подтверждены состав сумки и её замена. Исходные данные сохранены."); };
const ids = value => Array.isArray(value) && value.every(id => typeof id === "string" && id && !["__proto__", "constructor", "prototype"].includes(id)) && new Set(value).size === value.length;
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);

export function prepareAdminTemplateContainerReplacement(state, request, { operationId, hasPhotos = row => Boolean(row.photos?.length) } = {}) {
  const snapshot = clone(state), { replacedId, rootId, sourceLayoutId, targetLayoutId } = request;
  const layout = snapshot.layouts?.[targetLayoutId], before = layout?.arrangement;
  const owner = (type, id) => snapshot[type]?.[id]?.id === id && snapshot[type][id].publicCatalogLayoutId === targetLayoutId;
  if (!validTemplateOperationId(operationId) || sourceLayoutId !== targetLayoutId || replacedId === rootId
    || !layout?.adminCausalSource?.exists || layout.locked || !before?.containers || !before.items
    || !owner("containers", replacedId) || !owner("containers", rootId)) fail();
  const old = before.containers[replacedId], replacement = snapshot.containers[rootId];
  if (!old || before.containers[rootId] || replacement.parentId || old.parentId && replacement.nestable !== true
    || !same(layout.rootContainerIds, before.rootContainerIds)) fail();
  // Reject normalization repairs before deriving a replacement from this base.
  const normalized = clone(layout); normalizeLayoutArrangement(normalized, snapshot);
  if (!same(before, normalized.arrangement)) fail();
  const validateRow = row => {
    if (!ids(row?.childIds) || !ids(row?.itemIds) || !Array.isArray(row?.order)
      || row.order.length !== row.childIds.length + row.itemIds.length
      || new Set(row.order.map(entry => `${entry?.type}:${entry?.id}`)).size !== row.order.length
      || row.order.some(entry => !(entry?.type === "container" ? row.childIds : entry?.type === "item" ? row.itemIds : []).includes(entry.id))) fail();
  };
  for (const [id, row] of Object.entries(before.containers)) {
    if (!owner("containers", id) || hasPhotos(snapshot.containers[id])) fail(); validateRow(row);
    for (const child of row.childIds) if (before.containers[child]?.parentId !== id) fail();
    for (const item of row.itemIds) if (before.items[item] !== id) fail();
  }
  for (const [id, parentId] of Object.entries(before.items)) {
    if (!owner("items", id) || hasPhotos(snapshot.items[id]) || !before.containers[parentId]?.itemIds.includes(id)
      || !Number.isSafeInteger(before.itemQuantities?.[id]) || before.itemQuantities[id] < 1) fail();
  }
  const visited = new Set(), seenItems = new Set();
  const walk = (id, parentId = "") => {
    const row = snapshot.containers[id];
    if (visited.has(id) || !owner("containers", id) || hasPhotos(row) || before.containers[id] || (row.parentId || "") !== parentId) fail();
    visited.add(id); validateRow(row);
    for (const itemId of row.itemIds) {
      const item = snapshot.items[itemId];
      if (seenItems.has(itemId) || !owner("items", itemId) || hasPhotos(item) || Object.hasOwn(before.items, itemId) || item.containerId !== id) fail();
      seenItems.add(itemId);
    }
    for (const childId of row.childIds) walk(childId, id);
  };
  walk(rootId);
  // Do not discard an extra catalog reference while detaching the replacement's
  // own contents. Both directions of membership must agree before any write.
  for (const [id, row] of Object.entries(snapshot.containers)) {
    for (const childId of row.childIds || []) if (visited.has(childId) && snapshot.containers[childId].parentId !== id) fail();
    for (const itemId of row.itemIds || []) if (seenItems.has(itemId) && snapshot.items[itemId].containerId !== id) fail();
    if (visited.has(row.parentId) && !visited.has(id)) fail();
  }
  for (const [id, row] of Object.entries(snapshot.items)) if (visited.has(row.containerId) && !seenItems.has(id)) fail();
  const temporary = Boolean(old.parentId) && snapshot.containers[replacedId].nestable !== true;
  if (temporary && Object.entries(snapshot.layouts).some(([id, other]) => id !== targetLayoutId && other.arrangement?.containers?.[replacedId])) fail();
  const expected = clone(before), updates = new Map();
  const update = (type, id, fields) => { Object.assign(snapshot[type][id], clone(fields)); updates.set(`${type}:${id}`, { type, id }); };
  // Existing contents of the selected catalog bag remain independent catalog
  // items/trees; replacing a bag does not pack them into the old position.
  for (const id of replacement.childIds) update("containers", id, { parentId: null });
  for (const id of replacement.itemIds) update("items", id, { containerId: "" });
  expected.containers[rootId] = clone(old); delete expected.containers[replacedId];
  for (const id of old.itemIds) { expected.items[id] = rootId; update("items", id, { containerId: rootId }); }
  for (const id of old.childIds) { expected.containers[id].parentId = rootId; update("containers", id, { parentId: rootId }); }
  if (old.parentId) {
    const parent = expected.containers[old.parentId];
    parent.childIds = parent.childIds.map(id => id === replacedId ? rootId : id);
    parent.order = parent.order.map(row => row.type === "container" && row.id === replacedId ? { type: "container", id: rootId } : row);
    update("containers", old.parentId, parent);
  } else expected.rootContainerIds = expected.rootContainerIds.map(id => id === replacedId ? rootId : id);
  update("containers", rootId, expected.containers[rootId]);
  if (temporary) delete snapshot.containers[replacedId];
  else update("containers", replacedId, { parentId: null, childIds: [], itemIds: [], order: [] });
  layout.arrangement = clone(expected); layout.rootContainerIds = [...expected.rootContainerIds];
  normalizeLayoutArrangement(layout, snapshot);
  if (!same(layout.arrangement, expected)) fail();
  return { snapshot, entries: [], rootId, updates: [...updates.values()], removals: temporary ? [{ type: "containers", id: replacedId }] : [] };
}
