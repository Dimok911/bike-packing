import { prepareAdminTemplateItemCopy } from "./admin-template-item-copy.js";
import { removeItemFromLayoutArrangement } from "../state/layout-ops.js";
import { canonicalTemplateJson } from "./admin-template-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));
const fail = () => { throw Error("Не подтверждены исходная вещь и её замена. Исходные данные сохранены."); };

export function prepareAdminTemplateItemReplacement(state, request, options = {}) {
  const frozen = clone(state), { replacedId, sourceId, sourceLayoutId, targetLayoutId, targetParentId } = request;
  const layout = frozen.layouts?.[targetLayoutId], before = layout?.arrangement, previousItem = frozen.items?.[replacedId];
  const hasPhotos = options.hasPhotos || (row => Boolean(row.photos?.length));
  if (sourceLayoutId !== targetLayoutId || sourceId === replacedId || !previousItem || previousItem.id !== replacedId
    || previousItem.publicCatalogLayoutId !== targetLayoutId || hasPhotos(previousItem)
    || before?.items?.[replacedId] !== targetParentId || !Object.hasOwn(before?.itemQuantities || {}, replacedId)) fail();
  const parentValue = before.containers?.[targetParentId];
  if (!Array.isArray(parentValue?.order) || !Array.isArray(parentValue?.itemIds)) fail();
  const parent = clone(parentValue), index = parent.order.findIndex(row => row.type === "item" && row.id === replacedId);
  if (index < 0 || parent.itemIds.filter(id => id === replacedId).length !== 1
    || parent.order.filter(row => row.type === "item" && row.id === replacedId).length !== 1) fail();
  const expected = clone(before), quantity = before.itemQuantities[replacedId];
  if (!Number.isSafeInteger(quantity) || quantity < 1) fail();
  removeItemFromLayoutArrangement(layout, replacedId);
  frozen.items[replacedId].containerId = "";
  delete frozen.packedItems?.[replacedId];
  Object.assign(frozen.containers[targetParentId], { itemIds: [...layout.arrangement.containers[targetParentId].itemIds],
    order: clone(layout.arrangement.containers[targetParentId].order) });
  const result = prepareAdminTemplateItemCopy(frozen, { mode: "link", sourceId, sourceLayoutId, targetLayoutId, targetParentId }, options);
  const arrangement = result.snapshot.layouts[targetLayoutId].arrangement, placed = arrangement.containers[targetParentId];
  arrangement.itemQuantities[sourceId] = quantity;
  placed.order = placed.order.filter(row => row.type !== "item" || row.id !== sourceId);
  placed.order.splice(index, 0, { type: "item", id: sourceId });
  Object.assign(result.snapshot.containers[targetParentId], { itemIds: [...placed.itemIds], order: clone(placed.order) });
  delete expected.items[replacedId]; expected.items[sourceId] = targetParentId;
  delete expected.itemQuantities[replacedId]; expected.itemQuantities[sourceId] = quantity;
  delete expected.packedItems[replacedId]; delete expected.packedItems[sourceId];
  expected.containers[targetParentId].itemIds = [...parent.itemIds.filter(id => id !== replacedId), sourceId];
  expected.containers[targetParentId].order = parent.order.map(row => row.type === "item" && row.id === replacedId ? { type: "item", id: sourceId } : row);
  if (canonicalTemplateJson(arrangement) !== canonicalTemplateJson(expected)) fail();
  result.updates.push({ type: "items", id: replacedId });
  return result;
}
