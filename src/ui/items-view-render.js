import { renderCatalogCard, renderCatalogPills } from "./catalog-card.js";
import { renderEmptyState } from "./empty-state.js";
import { formatItemWeight, renderItemQuantityText } from "./item-format.js";
import {
  itemAvailabilityBadgeHtml,
  itemAvailabilityCardClass,
  itemAvailabilityLabel
} from "./item-availability.js";
import { renderCatalogBackToTopButton } from "./catalog-back-to-top.js";

function tr(t, key, fallback, values = {}) {
  const value = t(key, values);
  return value === key ? fallback : value;
}

export function renderItemsViewHtml({
  counts,
  emptyFiltered = false,
  emptyText = "Ничего не найдено",
  resetFiltersText = "",
  itemSortMode,
  itemUsageFilter,
  items,
  renderListItem,
  showLabels = false,
  showPhotos = false,
  t = (key) => key
}) {
  const { label, title } = itemSortMeta(itemSortMode, t);
  return `
    <section class="items-panel">
      <div class="items-toolbar catalog-toolbar-sticky">
        <div class="catalog-primary-actions">
          <button id="addItemBtn">${tr(t, "items.addItem", "Добавить вещь")}</button>
          ${renderCatalogBackToTopButton(tr(t, "navigation.backToTop", "Наверх"))}
        </div>
        <div class="items-filter-row">
          <label>
            ${tr(t, "items.usageLabel", "Участие в укладке")}
            <select id="itemUsageFilter">
              <option value="all"${itemUsageFilter === "all" ? " selected" : ""}>${tr(t, "items.usage.all", `Все вещи (${counts.all})`, { count: counts.all })}</option>
              <option value="current"${itemUsageFilter === "current" ? " selected" : ""}>${tr(t, "items.usage.current", `В текущей укладке (${counts.current})`, { count: counts.current })}</option>
              <option value="away"${itemUsageFilter === "away" ? " selected" : ""}>${tr(t, "items.usage.away", `Не дома и не на веле (${counts.away})`, { count: counts.away })}</option>
              <option value="no-weight"${itemUsageFilter === "no-weight" ? " selected" : ""}>${tr(t, "items.usage.noWeight", `Без веса (${counts.noWeight})`, { count: counts.noWeight })}</option>
              <option value="unused"${itemUsageFilter === "unused" ? " selected" : ""}>${tr(t, "items.usage.unused", `Вне текущей укладки (${counts.unused})`, { count: counts.unused })}</option>
            </select>
          </label>
          <button id="itemSortBtn" class="ghost item-sort-button ${itemSortMode !== "none" ? "active" : ""}" type="button" title="${title}" aria-label="${title}">
            ${label}
          </button>
        </div>
      </div>
      <div class="${itemsListClassName({ showLabels, showPhotos })}">${items.map(renderListItem).join("") || renderEmptyState(emptyText, {
        filtered: emptyFiltered,
        resetFiltersText
      })}</div>
    </section>
  `;
}

export function renderSharedItemsViewHtml({
  bannerHtml,
  copyAllButtonHtml,
  counts,
  emptyFiltered = false,
  emptyText = "Ничего не найдено",
  resetFiltersText = "",
  itemSortMode,
  itemUsageFilter,
  items,
  renderListItem,
  showLabels = false,
  showPhotos = false,
  t = (key) => key
}) {
  const { label, title } = itemSortMeta(itemSortMode, t);
  const toolbarClass = [
    "items-toolbar",
    copyAllButtonHtml ? "" : "items-toolbar-single"
  ].filter(Boolean).join(" ");
  return `
    ${bannerHtml}
    <section class="items-panel">
      <div class="${toolbarClass}">
        ${copyAllButtonHtml}
        <div class="items-filter-row">
          <label>
            ${tr(t, "items.usageLabel", "Участие в укладке")}
            <select id="itemUsageFilter">
              <option value="all"${itemUsageFilter === "all" ? " selected" : ""}>${tr(t, "items.usage.all", `Все вещи (${counts.all})`, { count: counts.all })}</option>
              <option value="current"${itemUsageFilter === "current" ? " selected" : ""}>${tr(t, "items.usage.current", `В текущей укладке (${counts.current})`, { count: counts.current })}</option>
              <option value="no-weight"${itemUsageFilter === "no-weight" ? " selected" : ""}>${tr(t, "items.usage.noWeight", `Без веса (${counts.noWeight})`, { count: counts.noWeight })}</option>
            </select>
          </label>
          <button id="itemSortBtn" class="ghost item-sort-button ${itemSortMode !== "none" ? "active" : ""}" type="button" title="${title}" aria-label="${title}">${label}</button>
        </div>
      </div>
      <div class="${itemsListClassName({ showLabels, showPhotos })}">${items.map(renderListItem).join("") || renderEmptyState(emptyText, {
        filtered: emptyFiltered,
        resetFiltersText
      })}</div>
    </section>
  `;
}

function itemsListClassName({ showLabels = false, showPhotos = false } = {}) {
  return [
    "items-list",
    showPhotos ? "with-photo-slots" : "",
    showLabels ? "with-meta-slots" : ""
  ].filter(Boolean).join(" ");
}

function itemSortMeta(mode, t = (key) => key) {
  if (mode === "asc") {
    return {
      label: tr(t, "sort.ascLabel", "А-Я"),
      title: tr(t, "sort.ascTitle", "Сортировка А-Я. Нажмите для Я-А")
    };
  }
  if (mode === "desc") {
    return {
      label: tr(t, "sort.descLabel", "Я-А"),
      title: tr(t, "sort.descTitle", "Сортировка Я-А. Нажмите, чтобы сбросить")
    };
  }
  return {
    label: tr(t, "sort.noneLabel", "Без"),
    title: tr(t, "sort.noneTitle", "Без сортировки. Нажмите для А-Я")
  };
}

export function renderListItemHtml({
  categories,
  filterMatch,
  highlightText,
  inCurrentLayout,
  item,
  photoHtml,
  placementText,
  quantityText = "",
  selected = false,
  showLabels,
  t = (key) => key
}) {
  const availabilityLabel = itemAvailabilityLabel(item, t);
  const availabilityBadge = itemAvailabilityBadgeHtml(item, t);
  const copyLabel = tr(t, "buttons.copy", "Скопировать");
  const deleteLabel = tr(t, "buttons.deleteForever", "Удалить навсегда");
  const cardTitle = [
    item.name,
    availabilityLabel,
    quantityText,
    formatItemWeight(item),
    categories.join(", "),
    item.location,
    placementText
  ].filter(Boolean).join("\n");
  return renderCatalogCard({
    classes: [
      itemAvailabilityCardClass(item),
      inCurrentLayout ? "in-current-layout" : "",
      selected ? "catalog-selected" : "",
      filterMatch ? "filter-match" : ""
    ],
    attributes: {
      "data-list-item-id": item.id,
      "aria-selected": selected ? "true" : "false",
      ...(filterMatch ? { "data-filter-match-id": item.id } : {})
    },
    title: cardTitle,
    titleHtml: `${highlightText(item.name)}${availabilityBadge}${renderItemQuantityText(item)}`,
    metaHtml: renderCatalogPills([
      formatItemWeight(item),
      ...categories.map((category) => highlightText(category)),
      highlightText(item.location)
    ], { hidden: !showLabels }),
    statusHtml: highlightText(placementText),
    photoHtml,
    actionsHtml: `
      <button class="copy-item-button" data-copy-item="${item.id}" aria-label="${copyLabel}" title="${copyLabel}">
        <span aria-hidden="true">⧉</span>
      </button>
      <button class="delete-item-button" data-delete-item="${item.id}" aria-label="${deleteLabel}" title="${deleteLabel}">
        <span aria-hidden="true">&times;</span>
      </button>
    `
  });
}
