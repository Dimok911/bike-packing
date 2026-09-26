import { getLayoutItemIdSet } from "./layout-ops.js";
import { getLayoutItemQuantity } from "./layout-item-quantity.js";
import { itemStockQuantity } from "./item-stock.js";

export const PREPARATION_ACTIONS = ["buy", "repair", "charge"];

const TASK_LABELS = {
  repair: new Set(["починить", "нужно починить", "надо починить", "требует ремонта", "нужен ремонт", "нужна починка", "needs repair", "repair required"]),
  charge: new Set(["зарядить", "нужно зарядить", "надо зарядить", "требует заряда", "требует зарядки", "нужна зарядка", "needs charging", "needs charge", "charge required"])
};

export function preparationCategoryMatches(value, action) {
  const label = String(value || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return TASK_LABELS[action]?.has(label) || false;
}

export function itemNeedsPreparation(item, action, categoryLabel = (value) => value) {
  if (action === "repair" && item?.availabilityStatus === "broken") return true;
  const categories = Array.isArray(item?.categories) ? item.categories : [item?.category];
  return categories.some((category) => preparationCategoryMatches(categoryLabel(category), action));
}

export function layoutPreparation(targetState, layoutOrId, categoryLabel) {
  const layout = typeof layoutOrId === "string" ? targetState?.layouts?.[layoutOrId] : layoutOrId;
  const result = { buy: [], repair: [], charge: [] };
  if (!layout) return result;
  for (const id of getLayoutItemIdSet(targetState, layout)) {
    const item = targetState.items[id];
    const required = getLayoutItemQuantity(targetState, layout, id);
    const available = itemStockQuantity(item);
    const entry = { item, required, available, missing: Math.max(0, required - available) };
    if (entry.missing) result.buy.push(entry);
    if (itemNeedsPreparation(item, "repair", categoryLabel)) result.repair.push(entry);
    if (itemNeedsPreparation(item, "charge", categoryLabel)) result.charge.push(entry);
  }
  return result;
}
