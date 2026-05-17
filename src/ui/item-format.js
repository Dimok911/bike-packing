import {
  itemQuantity,
  itemTotalWeight
} from "../state/metrics.js";
import { formatWeight } from "../utils/weight.js";

export function formatItemWeight(item) {
  const quantity = itemQuantity(item);
  const total = itemTotalWeight(item);
  return quantity > 1 ? `${formatWeight(total)} (${quantity} шт.)` : formatWeight(total);
}

export function renderItemQuantityText(item) {
  const quantity = itemQuantity(item);
  return quantity > 1 ? `<span class="quantity-inline">${quantity} шт.</span>` : "";
}
