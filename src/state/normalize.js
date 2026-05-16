import { COLLAPSE_DEFAULTS_VERSION } from "../config/constants.js";
import { REQUIRED_CHARGE_CATEGORY, categories } from "../data/demo-data.js";
import { normalizeItemPhotos } from "./item-photos.js";
import { parseWeightInput } from "../utils/weight.js";

export function defaultRootContainerLocation(targetState) {
  const list = Array.isArray(targetState.locations) ? targetState.locations : [];
  return list.includes("Не знаю где") ? "Не знаю где" : (list[0] || "");
}

export function normalizeItemCategories(targetState) {
  targetState.categories = Array.isArray(targetState.categories) ? targetState.categories : [...categories];
  if (!targetState.categories.includes(REQUIRED_CHARGE_CATEGORY)) {
    targetState.categories.push(REQUIRED_CHARGE_CATEGORY);
  }
  Object.values(targetState.items || {}).forEach((item) => {
    const values = Array.isArray(item.categories) ? item.categories : [];
    const legacy = typeof item.category === "string" ? item.category : "";
    const normalized = [...values, legacy]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index);
    item.categories = normalized.length ? normalized : [targetState.categories[0] || "Прочее"];
    item.category = item.categories[0];
    item.categories.forEach((category) => {
      if (!targetState.categories.includes(category)) targetState.categories.push(category);
    });
  });
}

export function itemCategories(item) {
  if (!item) return [];
  if (Array.isArray(item.categories) && item.categories.length) return item.categories;
  return item.category ? [item.category] : [];
}

export function normalizeItemQuantity(value) {
  const number = Number(value || 1);
  if (!Number.isFinite(number) || number < 1) return 1;
  return Math.round(number);
}

export function normalizeItemFields(targetState) {
  Object.values(targetState.items || {}).forEach((item) => {
    item.weight = parseWeightInput(item.weight);
    item.quantity = normalizeItemQuantity(item.quantity);
    normalizeItemPhotos(item);
  });
}

export function applyDefaultCollapsedContainers(targetState) {
  const forceInitialDefaults = targetState.collapseDefaultsVersion !== COLLAPSE_DEFAULTS_VERSION;
  Object.values(targetState.containers || {}).forEach((container) => {
    if (!container.parentId) return;
    if (forceInitialDefaults || !(container.id in targetState.collapsedContainers)) {
      targetState.collapsedContainers[container.id] = true;
    }
  });
  targetState.collapseDefaultsVersion = COLLAPSE_DEFAULTS_VERSION;
}

export function migrateContainerOrder(targetState) {
  Object.values(targetState.containers || {}).forEach((container) => {
    const existing = Array.isArray(container.order) ? container.order : [];
    const seen = new Set();
    const order = [];

    existing.forEach((entry) => {
      if (!entry || !entry.type || !entry.id) return;
      const key = `${entry.type}:${entry.id}`;
      if (seen.has(key)) return;
      if (entry.type === "item" && !container.itemIds.includes(entry.id)) return;
      if (entry.type === "container" && !container.childIds.includes(entry.id)) return;
      seen.add(key);
      order.push(entry);
    });

    container.itemIds.forEach((id) => {
      const key = `item:${id}`;
      if (!seen.has(key)) order.push({ type: "item", id });
    });
    container.childIds.forEach((id) => {
      const key = `container:${id}`;
      if (!seen.has(key)) order.push({ type: "container", id });
    });
    container.order = order;
  });
}
