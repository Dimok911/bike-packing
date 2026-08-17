import { escapeHtml } from "../utils/html.js";
import { currentDocumentLanguage } from "../utils/language.js";

export const DICTIONARY_DELETE_INLINE_LIMIT = 3;

function localText(language, en, ru) {
  return language === "en" ? en : ru;
}

function russianCount(value, one, few, many) {
  const count = Math.abs(Number(value) || 0);
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} ${many}`;
  if (mod10 === 1) return `${count} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

function itemCountText(count, language) {
  return language === "en"
    ? `${count} ${count === 1 ? "item" : "items"}`
    : russianCount(count, "вещь", "вещи", "вещей");
}

function containerCountText(count, language) {
  return language === "en"
    ? `${count} ${count === 1 ? "bag or place" : "bags or places"}`
    : russianCount(count, "сумка или место", "сумки или места", "сумок или мест");
}

function recordName(record, fallback) {
  const value = String(record?.name || "").trim();
  return value || fallback;
}

export function collectDictionaryValueUsage(type, value, {
  items = [],
  containers = [],
  itemCategories = () => [],
  containerCategories = () => []
} = {}) {
  return {
    items: items.filter((item) => type === "location"
      ? item.location === value
      : itemCategories(item).includes(value)),
    containers: containers.filter((container) => type === "location"
      ? container.location === value
      : containerCategories(container).includes(value))
  };
}

function usageGroupsHtml(usage, language) {
  const groups = [];
  if (usage.items.length) {
    const fallback = localText(language, "Untitled item", "Вещь без названия");
    groups.push(`
      <section class="dictionary-delete-impact-group">
        <strong>${escapeHtml(localText(language, "Items", "Вещи"))} (${usage.items.length})</strong>
        <ul>${usage.items.map((item) => `<li>${escapeHtml(recordName(item, fallback))}</li>`).join("")}</ul>
      </section>`);
  }
  if (usage.containers.length) {
    const fallback = localText(language, "Untitled bag or place", "Сумка или место без названия");
    groups.push(`
      <section class="dictionary-delete-impact-group">
        <strong>${escapeHtml(localText(language, "Bags and places", "Сумки и места"))} (${usage.containers.length})</strong>
        <ul>${usage.containers.map((container) => `<li>${escapeHtml(recordName(container, fallback))}</li>`).join("")}</ul>
      </section>`);
  }
  return `<div class="dictionary-delete-impact-groups">${groups.join("")}</div>`;
}

export function dictionaryDeleteImpactHtml(usage, {
  language = currentDocumentLanguage(),
  inlineLimit = DICTIONARY_DELETE_INLINE_LIMIT
} = {}) {
  const itemCount = usage?.items?.length || 0;
  const containerCount = usage?.containers?.length || 0;
  const total = itemCount + containerCount;
  if (!total) return "";
  const parts = [];
  if (itemCount) parts.push(itemCountText(itemCount, language));
  if (containerCount) parts.push(containerCountText(containerCount, language));
  const summary = localText(language, `Affected: ${parts.join(", ")}.`, `Затронуто: ${parts.join(", ")}.`);
  const groupsHtml = usageGroupsHtml(usage, language);
  const listHtml = total <= inlineLimit
    ? groupsHtml
    : `<details class="dictionary-delete-impact-details">
        <summary>${escapeHtml(localText(language, `Show list (${total})`, `Показать список (${total})`))}</summary>
        ${groupsHtml}
      </details>`;
  return `<div class="dictionary-delete-impact">
    <strong class="dictionary-delete-impact-summary">${escapeHtml(summary)}</strong>
    ${listHtml}
  </div>`;
}
