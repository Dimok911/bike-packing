import { escapeHtml } from "../utils/html.js";

export function containerCopyMissingConfirm({ targetName = "", duplicates, missingPlan, items = {}, sourceItems = {}, language = "ru" }) {
  const text = (en, ru) => language === "en" ? en : ru;
  const itemIds = [...new Set(duplicates.itemIds)];
  const existingText = text(
    `${duplicates.containerIds.length} bags/containers and ${itemIds.length} items are already in the target layout`,
    `${duplicates.containerIds.length} сумок/контейнеров, ${itemIds.length} вещей уже есть в целевой укладке`
  );
  const missingText = missingPlan.canCopyMissingItems ? text(
    `${missingPlan.missingContainers?.length || 0} containers/pouches and ${missingPlan.missingItems.length} items can be added without duplicates`,
    `${missingPlan.missingContainers?.length || 0} контейнеров/пакетов и ${missingPlan.missingItems.length} вещей можно добавить без дублей`
  ) : text("There is nothing missing to add.", "Недостающих элементов для добавления нет.");
  const details = itemIds.length ? `<details class="copy-duplicate-details"><summary>${escapeHtml(text(
    `Show items already in the layout (${itemIds.length})`,
    `Показать вещи, которые уже есть в укладке (${itemIds.length})`
  ))}</summary><ul>${itemIds.map(id => `<li>${escapeHtml(items[id]?.name || sourceItems[id]?.name || text("Unnamed item", "Вещь без названия"))}</li>`).join("")}</ul></details>` : "";
  return {
    title: text("Some elements are already in the layout", "Такие элементы уже есть в укладке"),
    text: text(`Only missing elements will be added to “${targetName || "Layout"}”. Items already there will stay in their places.`,
      `В укладку «${targetName || "Укладка"}» добавятся только недостающие элементы. Уже имеющиеся вещи останутся на своих местах.`),
    okText: text("Add without duplicates", "Добавить без дубликатов"),
    cancelText: text("Do not copy", "Не копировать"),
    okDisabled: !missingPlan.canCopyMissingItems,
    hideClose: true,
    highlightHtml: `${escapeHtml(existingText)}<br>${escapeHtml(missingText)}${details}`,
    tone: "safe"
  };
}
