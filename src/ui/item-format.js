import {
  itemQuantity,
  itemTotalWeight
} from "../state/metrics.js";
import { currentDocumentLanguage } from "../utils/language.js";
import { formatWeight } from "../utils/weight.js";

function quantityUnit() {
  return currentDocumentLanguage() === "en" ? "pcs." : "шт.";
}

export function formatItemWeight(item) {
  const quantity = itemQuantity(item);
  const total = itemTotalWeight(item);
  return quantity > 1 ? `${formatWeight(total)} (${quantity} ${quantityUnit()})` : formatWeight(total);
}

export function renderItemQuantityText(item) {
  const quantity = itemQuantity(item);
  return quantity > 1 ? `<span class="quantity-inline">${quantity} ${quantityUnit()}</span>` : "";
}
