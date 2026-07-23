import { renderCatalogCard, renderCatalogPills } from "./catalog-card.js";
import { renderEmptyState } from "./empty-state.js";
import { escapeHtml } from "../utils/html.js";
import { formatWeight } from "../utils/weight.js";
import { renderCatalogBackToTopButton } from "./catalog-back-to-top.js";

function tr(t, key, fallback, values = {}) {
  const value = t(key, values);
  return value === key ? fallback : value;
}

export function renderLayoutEditorHtml({ layout, containers, containerWeight, t = (key) => key }) {
  return `
    <section class="settings-panel layout-editor">
      <h2>${tr(t, "settings.currentLayout", "Текущая укладка")}</h2>
      <div class="layout-section-heading">
        <h3>${tr(t, "settings.rootsInLayout", "Сумки в этой укладке")}</h3>
        <button id="addLayoutRootBtn" class="add-inline-button" type="button" aria-label="${tr(t, "rootContainers.add", "Добавить сумку или место")}" title="${tr(t, "rootContainers.add", "Добавить сумку или место")}">+</button>
      </div>
      <div class="check-list layout-drop-list" id="layoutDropList">
        ${(layout?.rootContainerIds || []).map((containerId) => containers[containerId]).filter(Boolean).map((container) => `
          <div class="layout-member-row" data-layout-member-id="${container.id}" data-layout-member-row-drag="${container.id}">
            <div class="layout-member-title">
              <strong>${escapeHtml(container.name)}</strong>
              ${container.color ? `<span>${escapeHtml(container.color)}</span>` : ""}
            </div>
            <span class="layout-member-weight" title="${tr(t, "settings.layoutRootWeight", "Вес сумки вместе с содержимым")}">${formatWeight(containerWeight(container.id))}</span>
            <button class="chip-remove" data-remove-layout-root="${container.id}" aria-label="${tr(t, "buttons.deleteLayout", "Удалить")}">×</button>
          </div>
        `).join("") || `<div class="empty">${tr(t, "settings.layoutEmptyDrop", "Перетащите сюда сумку или место из соседнего списка")}</div>`}
      </div>
    </section>
  `;
}

export function renderRootContainersEditorHtml({
  counts,
  emptyFiltered = false,
  emptyText = "Ничего не найдено",
  resetFiltersText = "",
  renderRootContainerCard,
  rootContainerSortMode,
  rootContainerUsageFilter,
  roots,
  showLabels,
  showPhotos,
  t = (key) => key
}) {
  const { label, title } = rootContainerSortMeta(rootContainerSortMode, t);
  return `
    <section class="settings-panel layout-editor">
      <div class="items-toolbar root-containers-toolbar catalog-toolbar-sticky">
        <div class="catalog-primary-actions">
          <button id="addRootContainerBtn">${tr(t, "rootContainers.add", "Добавить сумку или место")}</button>
          ${renderCatalogBackToTopButton(tr(t, "navigation.backToTop", "Наверх"))}
        </div>
        <div class="items-filter-row">
          <label>
            ${tr(t, "items.usageLabel", "Участие в укладке")}
            <select id="rootContainerUsageFilter">
              <option value="all"${rootContainerUsageFilter === "all" ? " selected" : ""}>${tr(t, "rootContainers.usage.all", `Все сумки и места (${counts.all})`, { count: counts.all })}</option>
              <option value="current"${rootContainerUsageFilter === "current" ? " selected" : ""}>${tr(t, "rootContainers.usage.current", `В текущей укладке (${counts.current})`, { count: counts.current })}</option>
              <option value="unused"${rootContainerUsageFilter === "unused" ? " selected" : ""}>${tr(t, "rootContainers.usage.unused", `Вне текущей укладки (${counts.unused})`, { count: counts.unused })}</option>
            </select>
          </label>
          <button id="rootContainerSortBtn" class="ghost item-sort-button ${rootContainerSortMode !== "none" ? "active" : ""}" type="button" title="${title}" aria-label="${title}">
            ${label}
          </button>
        </div>
      </div>
      <div class="root-container-list ${showPhotos ? "with-photo-slots" : ""} ${showLabels ? "with-meta-slots" : ""}">
        ${roots.map(renderRootContainerCard).join("") || renderEmptyState(emptyText, {
          filtered: emptyFiltered,
          resetFiltersText
        })}
      </div>
    </section>
  `;
}

function rootContainerSortMeta(mode, t = (key) => key) {
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

export function renderRootContainerCardHtml({
  categories = [],
  container,
  filterMatch,
  highlightText,
  inCurrentLayout,
  nestedInCurrentLayout = false,
  location,
  photoHtml,
  selected = false,
  showLabels,
  t = (key) => key
}) {
  const placementText = nestedInCurrentLayout
    ? tr(t, "rootContainers.nestedInCurrent", "Вложена в текущей укладке")
    : inCurrentLayout
      ? tr(t, "settings.inCurrentLayout", "В текущей укладке")
      : tr(t, "settings.outsideCurrentLayout", "Вне текущей укладки");
  const metaTags = [
    Number(container.weight || 0) ? formatWeight(container.weight) : "",
    container.nestable === true ? tr(t, "rootContainers.nestableBadge", "Можно вкладывать") : "",
    ...categories.map((category) => highlightText(category)),
    highlightText(location)
  ].filter(Boolean);
  const metaTitle = [
    Number(container.weight || 0) ? formatWeight(container.weight) : "",
    categories.join(", "),
    location
  ].filter(Boolean).join(" · ");
  return renderCatalogCard({
    classes: [
      "root-container-card",
      inCurrentLayout || nestedInCurrentLayout ? "in-current-layout" : "",
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
      tr(t, "settings.dragToLayoutTitle", "Удерживайте и перетащите в укладку"),
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
      <button class="copy-item-button" data-copy-root="${container.id}" aria-label="${tr(t, "buttons.copy", "Скопировать")}" title="${tr(t, "buttons.copy", "Скопировать")}">
        <span aria-hidden="true">⧉</span>
      </button>
      <button class="edit-button" data-edit-root="${container.id}" aria-label="${tr(t, "buttons.edit", "Редактировать")}" title="${tr(t, "buttons.edit", "Редактировать")}">
        <span aria-hidden="true">&#9998;</span>
      </button>
      <button class="delete-item-button" data-delete-root="${container.id}" aria-label="${tr(t, "buttons.deleteLayout", "Удалить")}" title="${tr(t, "buttons.deleteLayout", "Удалить")}">
        <span aria-hidden="true">&times;</span>
      </button>
    `
  });
}

export function renderDictionaryHtml(title, type, values, { editingEntry = null, sortMode = "none", t = (key) => key } = {}) {
  const { label, title: sortTitle } = dictionarySortMeta(sortMode, t);
  return `
    <section class="settings-panel">
      <div class="dictionary-heading">
        <h2>${escapeHtml(title)}</h2>
        <button class="ghost item-sort-button ${sortMode !== "none" ? "active" : ""}" type="button" data-dictionary-sort="${type}" title="${sortTitle}" aria-label="${sortTitle}">
          ${label}
        </button>
      </div>
      <div class="chips dictionary-list">
        ${values.map((value) => renderDictionaryEntryHtml(type, value, { editingEntry, t })).join("")}
      </div>
      <div class="add-row">
        <input id="${type}Input" placeholder="${tr(t, "placeholders.newValue", "Новое значение")}" />
        <button id="${type}Add">${tr(t, "buttons.add", "Добавить")}</button>
      </div>
    </section>
  `;
}

function dictionarySortMeta(mode, t = (key) => key) {
  if (mode === "asc") {
    return {
      label: tr(t, "sort.ascLabel", "Рђ-РЇ"),
      title: tr(t, "sort.ascTitle", "РЎРѕСЂС‚РёСЂРѕРІРєР° Рђ-РЇ. РќР°Р¶РјРёС‚Рµ РґР»СЏ РЇ-Рђ")
    };
  }
  if (mode === "desc") {
    return {
      label: tr(t, "sort.descLabel", "РЇ-Рђ"),
      title: tr(t, "sort.descTitle", "РЎРѕСЂС‚РёСЂРѕРІРєР° РЇ-Рђ. РќР°Р¶РјРёС‚Рµ, С‡С‚РѕР±С‹ СЃР±СЂРѕСЃРёС‚СЊ")
    };
  }
  return {
    label: tr(t, "sort.noneLabel", "Р‘РµР·"),
    title: tr(t, "sort.noneTitle", "Р‘РµР· СЃРѕСЂС‚РёСЂРѕРІРєРё. РќР°Р¶РјРёС‚Рµ РґР»СЏ Рђ-РЇ")
  };
}

export function renderDictionaryEntryHtml(type, value, { editingEntry = null, t = (key) => key } = {}) {
  const editing = editingEntry?.type === type && editingEntry?.value === value;
  if (editing) {
    return `
      <span class="chip dictionary-chip dictionary-chip-editing">
        <input data-dictionary-edit-input="${type}" value="${escapeHtml(value)}" />
        <button class="edit-button dictionary-save-button" type="button" data-save-${type}="${escapeHtml(value)}" aria-label="${tr(t, "buttons.save", "Сохранить")}" title="${tr(t, "buttons.save", "Сохранить")}">
          <span aria-hidden="true">✓</span>
        </button>
        <button class="delete-item-button dictionary-cancel-button" type="button" data-cancel-${type}="${escapeHtml(value)}" aria-label="${tr(t, "buttons.cancel", "Отмена")}" title="${tr(t, "buttons.cancel", "Отмена")}">
          <span aria-hidden="true">&times;</span>
        </button>
      </span>
    `;
  }
  return `
    <span class="chip dictionary-chip">
      <span class="dictionary-chip-title">${escapeHtml(value)}</span>
      <button class="edit-button" type="button" data-edit-${type}="${escapeHtml(value)}" aria-label="${tr(t, "buttons.edit", "Редактировать")}" title="${tr(t, "buttons.edit", "Редактировать")}">
        <span aria-hidden="true">&#9998;</span>
      </button>
      <button class="delete-item-button" type="button" data-remove-${type}="${escapeHtml(value)}" aria-label="${tr(t, "buttons.deleteLayout", "Удалить")}" title="${tr(t, "buttons.deleteLayout", "Удалить")}">
        <span aria-hidden="true">&times;</span>
      </button>
    </span>
  `;
}
