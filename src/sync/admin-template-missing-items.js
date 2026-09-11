import { prepareAdminTemplateTreeCopy } from "./admin-template-tree-copy.js";
import { publicCopyContainerFingerprint, publicCopyItemContentFingerprint } from "../public/copy-duplicates.js";
import { cloneIsolatedPublicEntity } from "../public/copy-public-to-private.js";
import { createItemDuplicateRecord } from "../state/item-ops.js";
import { addItemToLayoutArrangement } from "../state/layout-ops.js";
import { normalizeLayoutArrangement } from "../state/layout-normalize.js";
import { canonicalTemplateJson } from "./admin-template-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const fail = () => { throw Error("Не подтверждены недостающие вещи и их целевые сумки. Исходные данные сохранены."); };

// This is the existing public-template missing-items behavior: add only missing
// items to matched existing containers, falling back to the matched root. It
// does not create another bag or silently move/replace existing target records.
export async function prepareAdminTemplateMissingItems(state, request, options = {}) {
  if (request.includeContents !== true) return null;
  const frozen = clone(state), { sourceLayoutId, targetLayoutId } = request;
  const sourceLayout = frozen.layouts?.[sourceLayoutId];
  if (!sourceLayout?.arrangement) fail();
  const sourceBefore = clone(sourceLayout.arrangement);
  normalizeLayoutArrangement(sourceLayout, frozen);
  if (!same(sourceBefore, sourceLayout.arrangement) || !same(sourceLayout.rootContainerIds, sourceBefore.rootContainerIds)) fail();
  const { source } = await prepareAdminTemplateTreeCopy(frozen, { ...request, mode: "copy" }, options);
  const layout = frozen.layouts[targetLayoutId], before = clone(layout.arrangement);
  normalizeLayoutArrangement(layout, frozen);
  if (!same(before, layout.arrangement) || !same(layout.rootContainerIds, before.rootContainerIds)) fail();
  const hasPhotos = options.hasPhotos || (row => Boolean(row.photos?.length));
  for (const type of ["items", "containers"]) for (const id of Object.keys(before[type])) {
    if (frozen[type]?.[id]?.id !== id || frozen[type][id].publicCatalogLayoutId !== targetLayoutId || hasPhotos(frozen[type][id])) fail();
  }
  const matches = new Map();
  for (const [id, row] of Object.entries(source.containers)) {
    const fingerprint = publicCopyContainerFingerprint(row);
    const candidates = Object.keys(before.containers).filter(targetId => targetId === id
      || publicCopyContainerFingerprint(frozen.containers[targetId]) === fingerprint);
    if (candidates.length > 1) fail();
    if (candidates.length) matches.set(id, candidates[0]);
  }
  const targetFingerprints = new Set(Object.keys(before.items).map(id => publicCopyItemContentFingerprint({
    ...frozen.items[id], quantity: before.itemQuantities[id]
  })));
  const additions = Object.entries(source.items).flatMap(([sourceId, row]) => {
    if (Object.hasOwn(before.items, sourceId) || targetFingerprints.has(publicCopyItemContentFingerprint(row))) return [];
    const targetParentId = matches.get(row.containerId) || matches.get(source.rootId);
    return targetParentId ? [{ sourceId, targetParentId }] : [];
  });
  if (!additions.length) return null;
  const snapshot = clone(frozen), entries = [], parents = new Set();
  for (const [index, addition] of additions.entries()) {
    const { sourceId, targetParentId } = addition, targetId = `item-template-missing-${options.operationId}-${index}`;
    if (["layouts", "containers", "items"].some(type => Object.hasOwn(snapshot[type], targetId))) fail();
    const row = await createItemDuplicateRecord(source.items[sourceId], {
      id: targetId, containerId: targetParentId, preserveName: true, cloneEntity: cloneIsolatedPublicEntity,
      changedAt: options.changedAt, currentEditMeta: options.currentEditMeta,
      copyPhotos: async row => { if (hasPhotos(row)) fail(); return []; }
    });
    if (!row) fail();
    snapshot.items[targetId] = { ...row, publicCatalogLayoutId: targetLayoutId, adminDemo: Boolean(layout.adminDemo) };
    if (!addItemToLayoutArrangement(snapshot, snapshot.layouts[targetLayoutId], targetId, targetParentId)) fail();
    entries.push({ type: "items", sourceId, targetId }); parents.add(targetParentId);
  }
  const target = snapshot.layouts[targetLayoutId]; normalizeLayoutArrangement(target, snapshot);
  const previous = clone(target.arrangement);
  for (const { sourceId, targetId } of entries) {
    if (target.arrangement.itemQuantities[targetId] !== source.items[sourceId].quantity || target.arrangement.packedItems[targetId]) fail();
    delete previous.items[targetId]; delete previous.itemQuantities[targetId]; delete previous.packedItems[targetId];
    const parentId = target.arrangement.items[targetId];
    previous.containers[parentId].itemIds = previous.containers[parentId].itemIds.filter(id => id !== targetId);
    previous.containers[parentId].order = previous.containers[parentId].order.filter(row => row.type !== "item" || row.id !== targetId);
    snapshot.items[targetId].quantity = 1;
  }
  if (!same(previous, before)) fail();
  for (const id of parents) Object.assign(snapshot.containers[id], {
    itemIds: [...target.arrangement.containers[id].itemIds], order: clone(target.arrangement.containers[id].order)
  });
  return { snapshot, entries, updates: [...parents].map(id => ({ type: "containers", id })), rootId: additions[0].targetParentId,
    missingItemCount: additions.length, sourceLayoutId };
}
