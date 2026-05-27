import { renderCatalogCard, renderCatalogPills } from "./catalog-card.js";
import { formatItemWeight, renderItemQuantityText } from "./item-format.js";

export function renderItemsViewHtml({
  counts,
  itemSortMode,
  itemUsageFilter,
  items,
  renderListItem
}) {
  const { label, title } = itemSortMeta(itemSortMode);
  return `
    <section class="items-panel">
      <div class="items-toolbar">
        <button id="addItemBtn">Добавить вещь</button>
        <div class="items-filter-row">
          <label>
            Участие в укладке
            <select id="itemUsageFilter">
              <option value="all"${itemUsageFilter === "all" ? " selected" : ""}>Все вещи (${counts.all})</option>
              <option value="current"${itemUsageFilter === "current" ? " selected" : ""}>В текущей укладке (${counts.current})</option>
              <option value="away"${itemUsageFilter === "away" ? " selected" : ""}>Не дома и не на веле (${counts.away})</option>
              <option value="no-weight"${itemUsageFilter === "no-weight" ? " selected" : ""}>Без веса (${counts.noWeight})</option>
              <option value="unused"${itemUsageFilter === "unused" ? " selected" : ""}>Вне текущей укладки (${counts.unused})</option>
            </select>
          </label>
          <button id="itemSortBtn" class="ghost item-sort-button ${itemSortMode !== "none" ? "active" : ""}" type="button" title="${title}" aria-label="${title}">
            ${label}
          </button>
        </div>
      </div>
      <div class="items-list">${items.map(renderListItem).join("") || `<div class="empty">Ничего не найдено</div>`}</div>
    </section>
  `;
}

export function renderSharedItemsViewHtml({
  bannerHtml,
  copyAllButtonHtml,
  counts,
  itemSortMode,
  itemUsageFilter,
  items,
  renderListItem
}) {
  const { label } = itemSortMeta(itemSortMode);
  return `
    <section class="items-panel">
      ${bannerHtml}
      <div class="items-toolbar">
        ${copyAllButtonHtml}
        <div class="items-filter-row">
          <label>
            Участие в укладке
            <select id="itemUsageFilter">
              <option value="all"${itemUsageFilter === "all" ? " selected" : ""}>Все вещи (${counts.all})</option>
              <option value="current"${itemUsageFilter === "current" ? " selected" : ""}>В текущей укладке (${counts.current})</option>
              <option value="no-weight"${itemUsageFilter === "no-weight" ? " selected" : ""}>Без веса (${counts.noWeight})</option>
            </select>
          </label>
          <button id="itemSortBtn" class="ghost item-sort-button ${itemSortMode !== "none" ? "active" : ""}" type="button">${label}</button>
        </div>
      </div>
      <div class="items-list">${items.map(renderListItem).join("") || `<div class="empty">Ничего не найдено</div>`}</div>
    </section>
  `;
}

function itemSortMeta(mode) {
  if (mode === "asc") {
    return {
      label: "А-Я",
      title: "Сортировка А-Я. Нажмите для Я-А"
    };
  }
  if (mode === "desc") {
    return {
      label: "Я-А",
      title: "Сортировка Я-А. Нажмите, чтобы сбросить"
    };
  }
  return {
    label: "Без",
    title: "Без сортировки. Нажмите для А-Я"
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
  showLabels
}) {
  const cardTitle = [
    item.name,
    quantityText,
    formatItemWeight(item),
    categories.join(", "),
    item.location,
    placementText
  ].filter(Boolean).join("\n");
  return renderCatalogCard({
    classes: [
      inCurrentLayout ? "in-current-layout" : "",
      filterMatch ? "filter-match" : ""
    ],
    attributes: {
      "data-list-item-id": item.id,
      ...(filterMatch ? { "data-filter-match-id": item.id } : {})
    },
    title: cardTitle,
    titleHtml: `${highlightText(item.name)}${renderItemQuantityText(item)}`,
    metaHtml: renderCatalogPills([
      formatItemWeight(item),
      ...categories.map((category) => highlightText(category)),
      highlightText(item.location)
    ], { hidden: !showLabels }),
    statusHtml: highlightText(placementText),
    photoHtml,
    actionsHtml: `
      <button class="copy-item-button" data-copy-item="${item.id}" aria-label="Скопировать" title="Скопировать">
        <span aria-hidden="true">⧉</span>
      </button>
      <button class="edit-button" data-edit-item="${item.id}" aria-label="Редактировать" title="Редактировать">
        <span aria-hidden="true">&#9998;</span>
      </button>
      <button class="delete-item-button" data-delete-item="${item.id}" aria-label="Удалить навсегда" title="Удалить навсегда">
        <span aria-hidden="true">&times;</span>
      </button>
    `
  });
}
