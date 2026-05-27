import { renderCatalogCard, renderCatalogPills } from "./catalog-card.js";
import { renderEmptyState } from "./empty-state.js";
import { escapeHtml } from "../utils/html.js";
import { formatWeight } from "../utils/weight.js";

export function renderLayoutEditorHtml({ layout, containers, containerWeight }) {
  return `
    <section class="settings-panel layout-editor">
      <h2>Текущая укладка</h2>
      <div class="layout-section-heading">
        <h3>Сумки в этой укладке</h3>
        <button id="addLayoutRootBtn" class="add-inline-button" type="button" aria-label="Добавить сумку или место" title="Добавить сумку или место">+</button>
      </div>
      <div class="check-list layout-drop-list" id="layoutDropList">
        ${(layout?.rootContainerIds || []).map((containerId) => containers[containerId]).filter(Boolean).map((container) => `
          <div class="layout-member-row" data-layout-member-id="${container.id}" data-layout-member-row-drag="${container.id}">
            <div class="layout-member-title">
              <strong>${escapeHtml(container.name)}</strong>
              ${container.color ? `<span>${escapeHtml(container.color)}</span>` : ""}
            </div>
            <span class="layout-member-weight" title="Вес сумки вместе с содержимым">${formatWeight(containerWeight(container.id))}</span>
            <button class="chip-remove" data-remove-layout-root="${container.id}" aria-label="Удалить">×</button>
          </div>
        `).join("") || `<div class="empty">Перетащите сюда сумку или место из соседнего списка</div>`}
      </div>
    </section>
  `;
}

export function renderRootContainersEditorHtml({
  counts,
  emptyFiltered = false,
  emptyText = "Ничего не найдено",
  renderRootContainerCard,
  rootContainerSortMode,
  rootContainerUsageFilter,
  roots,
  showLabels,
  showPhotos
}) {
  const { label, title } = rootContainerSortMeta(rootContainerSortMode);
  return `
    <section class="settings-panel layout-editor">
      <div class="items-toolbar root-containers-toolbar">
        <button id="addRootContainerBtn">Добавить сумку или место</button>
        <div class="items-filter-row">
          <label>
            Участие в укладке
            <select id="rootContainerUsageFilter">
              <option value="all"${rootContainerUsageFilter === "all" ? " selected" : ""}>Все сумки и места (${counts.all})</option>
              <option value="current"${rootContainerUsageFilter === "current" ? " selected" : ""}>В текущей укладке (${counts.current})</option>
              <option value="unused"${rootContainerUsageFilter === "unused" ? " selected" : ""}>Вне текущей укладки (${counts.unused})</option>
            </select>
          </label>
          <button id="rootContainerSortBtn" class="ghost item-sort-button ${rootContainerSortMode !== "none" ? "active" : ""}" type="button" title="${title}" aria-label="${title}">
            ${label}
          </button>
        </div>
      </div>
      <div class="root-container-list ${showPhotos ? "with-photo-slots" : ""} ${showLabels ? "with-meta-slots" : ""}">
        ${roots.map(renderRootContainerCard).join("") || renderEmptyState(emptyText, { filtered: emptyFiltered })}
      </div>
    </section>
  `;
}

function rootContainerSortMeta(mode) {
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

export function renderRootContainerCardHtml({
  container,
  filterMatch,
  highlightText,
  inCurrentLayout,
  location,
  photoHtml,
  selected = false,
  showLabels
}) {
  const placementText = inCurrentLayout ? "В текущей укладке" : "Вне текущей укладки";
  const metaTags = [
    Number(container.weight || 0) ? formatWeight(container.weight) : "",
    highlightText(location)
  ].filter(Boolean);
  const metaTitle = [
    Number(container.weight || 0) ? formatWeight(container.weight) : "",
    location
  ].filter(Boolean).join(" · ");
  return renderCatalogCard({
    classes: [
      "root-container-card",
      inCurrentLayout ? "in-current-layout" : "",
      selected ? "catalog-selected" : "",
      filterMatch ? "filter-match" : ""
    ],
    attributes: {
      "data-root-card": container.id,
      "data-root-drag": container.id,
      "aria-selected": selected ? "true" : "false",
      ...(filterMatch ? { "data-filter-match-id": `root-${container.id}` } : {})
    },
    title: [
      "Удерживайте и перетащите в укладку",
      metaTitle,
      placementText
    ].filter(Boolean).join("\n"),
    titleHtml: highlightText(container.name),
    titleClass: "root-container-title",
    titleAttributes: {
      "data-root-title": container.id,
      title: container.name
    },
    metaHtml: renderCatalogPills(metaTags, { hidden: !showLabels }),
    statusHtml: placementText,
    photoHtml,
    actionsHtml: `
      <button class="copy-item-button" data-copy-root="${container.id}" aria-label="Скопировать" title="Скопировать">
        <span aria-hidden="true">⧉</span>
      </button>
      <button class="edit-button" data-edit-root="${container.id}" aria-label="Редактировать" title="Редактировать">
        <span aria-hidden="true">&#9998;</span>
      </button>
      <button class="delete-item-button" data-delete-root="${container.id}" aria-label="Удалить" title="Удалить">
        <span aria-hidden="true">&times;</span>
      </button>
    `
  });
}

export function renderDictionaryHtml(title, type, values, { editingEntry = null } = {}) {
  return `
    <section class="settings-panel">
      <h2>${escapeHtml(title)}</h2>
      <div class="chips dictionary-list">
        ${values.map((value) => renderDictionaryEntryHtml(type, value, { editingEntry })).join("")}
      </div>
      <div class="add-row">
        <input id="${type}Input" placeholder="Новое значение" />
        <button id="${type}Add">Добавить</button>
      </div>
    </section>
  `;
}

export function renderDictionaryEntryHtml(type, value, { editingEntry = null } = {}) {
  const editing = editingEntry?.type === type && editingEntry?.value === value;
  if (editing) {
    return `
      <span class="chip dictionary-chip dictionary-chip-editing">
        <input data-dictionary-edit-input="${type}" value="${escapeHtml(value)}" />
        <button class="edit-button dictionary-save-button" type="button" data-save-${type}="${escapeHtml(value)}" aria-label="Сохранить" title="Сохранить">
          <span aria-hidden="true">✓</span>
        </button>
        <button class="delete-item-button dictionary-cancel-button" type="button" data-cancel-${type}="${escapeHtml(value)}" aria-label="Отмена" title="Отмена">
          <span aria-hidden="true">&times;</span>
        </button>
      </span>
    `;
  }
  return `
    <span class="chip dictionary-chip">
      <span class="dictionary-chip-title">${escapeHtml(value)}</span>
      <button class="edit-button" type="button" data-edit-${type}="${escapeHtml(value)}" aria-label="Редактировать" title="Редактировать">
        <span aria-hidden="true">&#9998;</span>
      </button>
      <button class="delete-item-button" type="button" data-remove-${type}="${escapeHtml(value)}" aria-label="Удалить" title="Удалить">
        <span aria-hidden="true">&times;</span>
      </button>
    </span>
  `;
}
