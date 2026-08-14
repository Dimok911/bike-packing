import { normalizeItemQuantity } from "./normalize.js";

function resolveLayout(targetState, layoutOrId) {
  if (typeof layoutOrId === "string") return targetState?.layouts?.[layoutOrId] || null;
  return layoutOrId && typeof layoutOrId === "object" ? layoutOrId : null;
}

export function getLayoutItemQuantity(targetState, layoutOrId, itemId) {
  const layout = resolveLayout(targetState, layoutOrId);
  const quantities = layout?.arrangement?.itemQuantities;
  if (quantities && Object.prototype.hasOwnProperty.call(quantities, itemId)) {
    return normalizeItemQuantity(quantities[itemId]);
  }
  return normalizeItemQuantity(targetState?.items?.[itemId]?.quantity);
}

export function setLayoutItemQuantity(targetState, layoutOrId, itemId, value) {
  const layout = resolveLayout(targetState, layoutOrId);
  const arrangement = layout?.arrangement;
  if (!arrangement?.items?.[itemId]) return false;
  arrangement.itemQuantities = arrangement.itemQuantities && typeof arrangement.itemQuantities === "object"
    ? arrangement.itemQuantities
    : {};
  const quantity = normalizeItemQuantity(value);
  const changed = arrangement.itemQuantities[itemId] !== quantity;
  arrangement.itemQuantities[itemId] = quantity;
  return changed;
}

export function itemWithLayoutQuantity(targetState, layoutOrId, item) {
  if (!item) return item;
  return {
    ...item,
    quantity: getLayoutItemQuantity(targetState, layoutOrId, item.id)
  };
}
