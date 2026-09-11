import { preparePersonalCopyBatch } from "./personal-copy-intent.js";
import { cloneIsolatedPublicEntity } from "../public/copy-public-to-private.js";
import { addItemToLayoutArrangement } from "../state/layout-ops.js";
import { normalizeLayoutArrangement } from "../state/layout-normalize.js";
import { normalizeItemQuantity } from "../state/normalize.js";
import { isItemUnavailableForPacking } from "../state/layout-locks.js";
import { canonicalTemplateJson, validTemplateOperationId } from "./admin-template-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const fail = () => { throw Error("Не подтверждены исходная вещь и место копии. Исходные данные сохранены."); };

// The caller freezes both editor revisions and persists the source-checked
// save. This planner produces only the new catalog record and its placement.
export function prepareAdminTemplateItemCopy(state, request, { operationId, changedAt = "", currentEditMeta = () => ({}),
  hasPhotos = row => Boolean(row.photos?.length) } = {}) {
  const frozen = clone(state), { sourceId, sourceLayoutId, targetLayoutId, targetParentId, mode = "copy" } = clone(request);
  const source = frozen.items?.[sourceId], from = frozen.layouts?.[sourceLayoutId], to = frozen.layouts?.[targetLayoutId];
  if (!validTemplateOperationId(operationId) || !from?.adminCausalSource?.exists || !to?.adminCausalSource?.exists
    || !from.arrangement || !to.arrangement || to.locked || !["copy", "link"].includes(mode)
    || (mode === "copy" ? sourceLayoutId === targetLayoutId : sourceLayoutId !== targetLayoutId)
    || !source || source.id !== sourceId || source.publicCatalogLayoutId !== sourceLayoutId
    || hasPhotos(source) || isItemUnavailableForPacking(source)
    || frozen.containers?.[targetParentId]?.publicCatalogLayoutId !== targetLayoutId
    || !to.arrangement.containers?.[targetParentId]) fail();
  if (mode === "link" && (Object.hasOwn(from.arrangement.items || {}, sourceId) || source.containerId)) fail();
  const itemId = mode === "link" ? sourceId : `item-template-copy-${operationId}`;
  // Match the existing item-copy UI: placed catalog records copy one unit;
  // detached records retain their catalog quantity, independent of packing.
  const quantity = Object.hasOwn(from.arrangement.items || {}, sourceId) ? 1 : normalizeItemQuantity(source.quantity);
  const copySource = { ...frozen, items: { ...frozen.items, [sourceId]: { ...source, quantity } } };
  const { snapshot } = mode === "link" ? { snapshot: clone(frozen) } : preparePersonalCopyBatch(copySource, { type: "copy", version: 1, keepPlacement: false, layoutId: "",
    entries: [{ type: "item", sourceId, targetId: itemId }] }, { changedAt, currentEditMeta, hasPhotos });
  snapshot.items[sourceId] = clone(source);
  if (mode === "copy") snapshot.items[itemId] = { ...cloneIsolatedPublicEntity(snapshot.items[itemId]),
    publicCatalogLayoutId: targetLayoutId, adminDemo: Boolean(to.adminDemo) };
  snapshot.items[itemId].containerId = targetParentId;
  const layout = snapshot.layouts[targetLayoutId];
  if (!addItemToLayoutArrangement(snapshot, layout, itemId, targetParentId)) fail();
  normalizeLayoutArrangement(layout, snapshot);
  const arrangement = layout.arrangement, previous = clone(arrangement);
  if (arrangement.itemQuantities[itemId] !== quantity || arrangement.packedItems[itemId]) fail();
  delete previous.items[itemId]; delete previous.itemQuantities[itemId]; delete previous.packedItems[itemId];
  previous.containers[targetParentId].itemIds = previous.containers[targetParentId].itemIds.filter(id => id !== itemId);
  previous.containers[targetParentId].order = previous.containers[targetParentId].order.filter(row => row.type !== "item" || row.id !== itemId);
  if (canonicalTemplateJson(previous) !== canonicalTemplateJson(to.arrangement)) fail();
  Object.assign(snapshot.containers[targetParentId], { itemIds: [...arrangement.containers[targetParentId].itemIds],
    order: clone(arrangement.containers[targetParentId].order) });
  snapshot.items[itemId].quantity = 1;
  return { snapshot, entries: mode === "link" ? [] : [{ type: "items", sourceId, targetId: itemId }], itemId };
}
