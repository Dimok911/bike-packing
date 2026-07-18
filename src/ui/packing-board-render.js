import { escapeHtml } from "../utils/html.js";
import {
  itemAvailabilityBadgeHtml,
  itemAvailabilityCardClass
} from "./item-availability.js";

function tr(t, key, fallback, values) {
  return typeof t === "function" ? t(key, values) : fallback;
}

function rootCollapseButtonHtml({ container, readonly, readonlyTemplate, rootCollapsed, t }) {
  if (!readonly || readonlyTemplate) return "";
  const rootIconClass = rootCollapsed ? "chevron-down" : "chevron-up";
  const label = rootCollapsed ? tr(t, "tooltips.expand", "Развернуть") : tr(t, "tooltips.collapse", "Свернуть");
  return `
    <button class="collapse-button" data-toggle-container="${container.id}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      <span class="chevron-icon ${rootIconClass}" aria-hidden="true"></span>
    </button>
  `;
}

function rootContainerToolsHtml({
  allNestedCollapsed = false,
  container,
  hasNestedContainers = false,
  readonlyTemplate,
  t,
  totalWeightHtml
}) {
  const addItemLabel = tr(t, "tooltips.addItem", "Добавить вещь");
  const editLabel = readonlyTemplate ? tr(t, "tooltips.copyFromTemplate", "Скопировать из шаблона") : tr(t, "tooltips.edit", "Редактировать");
  const toggleAllLabel = allNestedCollapsed ? tr(t, "tooltips.expandAll", "Развернуть все") : tr(t, "tooltips.collapseAll", "Свернуть все");
  return `
    <div class="container-tools">
      ${readonlyTemplate ? "" : `
      <button
        class="header-icon-button add-to-container-button"
        data-add-to-container="${container.id}"
        aria-label="${escapeHtml(addItemLabel)}"
        title="${escapeHtml(addItemLabel)}"
      >+</button>
      `}
      <button
        class="header-icon-button ${readonlyTemplate ? "copy-item-button" : ""}"
        data-edit-container="${container.id}"
        aria-label="${escapeHtml(editLabel)}"
        title="${escapeHtml(editLabel)}"
      >&#9998;</button>
      ${hasNestedContainers ? `
        <button
          class="header-icon-button"
          data-toggle-column="${container.id}"
          aria-label="${escapeHtml(toggleAllLabel)}"
          title="${escapeHtml(toggleAllLabel)}"
        >
          <span class="stack-icon ${allNestedCollapsed ? "expand-all-icon" : "collapse-all-icon"}" aria-hidden="true">
            <span class="stack-chevron stack-chevron-up"></span>
            <span class="stack-chevron stack-chevron-down"></span>
          </span>
        </button>
      ` : ""}
      ${totalWeightHtml}
    </div>
  `;
}

export function renderRootContainerColumnHtml({
  allNestedCollapsed,
  container,
  contentsHtml,
  hasNestedContainers,
  justAdded,
  packed,
  photoHtml,
  readonly,
  readonlyTemplate,
  rootCollapsed,
  t,
  titleHtml,
  totalWeightHtml
}) {
  return `
    <article class="container-card ${packed ? "packed-container" : ""} ${justAdded ? "just-added" : ""}" data-root-container-id="${container.id}">
      <header class="container-header">
        <div class="container-title">
          ${rootCollapseButtonHtml({ container, readonly, readonlyTemplate, rootCollapsed, t })}
          <h2>${titleHtml}</h2>
        </div>
        ${rootContainerToolsHtml({ allNestedCollapsed, container, hasNestedContainers, readonlyTemplate, t, totalWeightHtml })}
      </header>
      ${rootCollapsed ? "" : photoHtml}
      <div class="dropzone" data-container-id="${container.id}">
        ${rootCollapsed ? "" : contentsHtml}
      </div>
    </article>
  `;
}

export function renderFilteredRootContainerColumnHtml({
  container,
  contentsHtml,
  justAdded,
  packed,
  photoHtml,
  readonly,
  readonlyTemplate,
  rootCollapsed,
  t,
  titleHtml,
  totalWeightHtml
}) {
  return `
    <article class="container-card ${packed ? "packed-container" : ""} ${justAdded ? "just-added" : ""}" data-root-container-id="${container.id}">
      <header class="container-header">
        <div class="container-title">
          ${rootCollapseButtonHtml({ container, readonly, readonlyTemplate, rootCollapsed, t })}
          <h2>${titleHtml}</h2>
        </div>
        ${rootContainerToolsHtml({ container, readonlyTemplate, t, totalWeightHtml })}
      </header>
      ${rootCollapsed ? "" : photoHtml}
      <div class="dropzone" data-container-id="${container.id}">
        ${rootCollapsed ? "" : contentsHtml}
      </div>
    </article>
  `;
}

export function renderPackingRootHeaderCellHtml({
  allNestedCollapsed,
  container,
  hasNestedContainers,
  packed,
  readonly,
  readonlyTemplate,
  rootCollapsed,
  t,
  titleHtml,
  totalWeightHtml
}) {
  return `
    <div class="packing-root-header-cell ${packed ? "packed-container" : ""}" data-sticky-root-container-id="${escapeHtml(container.id)}">
      <header class="container-header">
        <div class="container-title">
          ${rootCollapseButtonHtml({ container, readonly, readonlyTemplate, rootCollapsed, t })}
          <h2>${titleHtml}</h2>
        </div>
        ${rootContainerToolsHtml({ allNestedCollapsed, container, hasNestedContainers, readonlyTemplate, t, totalWeightHtml })}
      </header>
    </div>
  `;
}

export function renderSubcontainerSectionHtml({
  collapsed,
  container,
  contentsHtml,
  justAdded,
  packed,
  photoHtml,
  t,
  titleHtml,
  weightHtml
}) {
  const iconClass = collapsed ? "chevron-down" : "chevron-up";
  const collapseLabel = collapsed ? tr(t, "tooltips.expand", "Развернуть") : tr(t, "tooltips.collapse", "Свернуть");
  const addItemLabel = tr(t, "tooltips.addItem", "Добавить вещь");
  const editLabel = tr(t, "tooltips.edit", "Редактировать");
  return `
    <section class="subcontainer ${collapsed ? "collapsed" : ""} ${packed ? "packed-container" : ""} ${justAdded ? "just-added" : ""}" data-subcontainer-id="${container.id}">
      <div class="subcontainer-title">
        <div class="subcontainer-title-main">
          <button class="collapse-button" data-toggle-container="${container.id}" aria-label="${escapeHtml(collapseLabel)}" title="${escapeHtml(collapseLabel)}">
            <span class="chevron-icon ${iconClass}" aria-hidden="true"></span>
          </button>
          ${titleHtml}
        </div>
        <div class="subcontainer-tools">
          <button class="header-icon-button add-to-container-button" data-add-to-container="${container.id}" aria-label="${escapeHtml(addItemLabel)}" title="${escapeHtml(addItemLabel)}">+</button>
          <button class="header-icon-button" data-edit-container="${container.id}" aria-label="${escapeHtml(editLabel)}" title="${escapeHtml(editLabel)}">&#9998;</button>
          ${weightHtml}
        </div>
      </div>
      ${collapsed ? "" : photoHtml}
      <div class="dropzone" data-container-id="${container.id}">
        ${contentsHtml}
      </div>
    </section>
  `;
}

export function renderPackingItemCardHtml({
  categoriesHtml,
  collection,
  filterMatch,
  item,
  justAdded,
  labelsVisible,
  locationHtml,
  packed,
  packedVisible,
  photoHtml,
  t,
  titleDragAttr,
  titleHtml,
  weightHtml
}) {
  const availabilityClass = itemAvailabilityCardClass(item);
  const availabilityBadge = itemAvailabilityBadgeHtml(item, t);
  const packAriaLabel = packed ? tr(t, "tooltips.markUnpacked", "Отметить как не собранное") : tr(t, "tooltips.markPacked", "Отметить как собранное");
  const packTitle = packed ? tr(t, "tooltips.packed", "Собрано") : tr(t, "tooltips.unpacked", "Не собрано");
  const copyLabel = tr(t, "replacement.itemAction", "Заменить вещь");
  const editLabel = tr(t, "tooltips.edit", "Редактировать");
  const removeLabel = tr(t, "forms.removeFromLayout", "Убрать из укладки");
  return `
    <article class="item-card ${availabilityClass} ${packedVisible ? "packed-item" : ""} ${filterMatch ? "filter-match" : ""} ${justAdded ? "just-added" : ""}" data-item-id="${item.id}" ${filterMatch ? `data-filter-match-id="${item.id}"` : ""}>
      <div class="item-card-top ${collection ? "with-pack-toggle" : ""}">
        ${collection ? `
          <button
            class="pack-toggle ${packedVisible ? "packed" : ""}"
            data-toggle-packed="${item.id}"
            aria-label="${escapeHtml(packAriaLabel)}"
            title="${escapeHtml(packTitle)}"
          >${packedVisible ? "✓" : ""}</button>
        ` : ""}
        <div class="item-title-hitarea"${titleDragAttr}>${titleHtml}</div>
        <button class="copy-item-button replace-item-button" data-replace-layout-item="${item.id}" aria-label="${escapeHtml(copyLabel)}" title="${escapeHtml(copyLabel)}">
          <span aria-hidden="true">&#8644;</span>
        </button>
        <button class="edit-button" data-edit-item="${item.id}" aria-label="${escapeHtml(editLabel)}" title="${escapeHtml(editLabel)}">
          <span aria-hidden="true">&#9998;</span>
        </button>
        <button class="remove-layout-button" data-remove-from-layout="${item.id}" aria-label="${escapeHtml(removeLabel)}" title="${escapeHtml(removeLabel)}">
          <span aria-hidden="true">&times;</span>
        </button>
        ${availabilityBadge}
      </div>
      <div class="meta ${labelsVisible ? "" : "meta-hidden"}">
        <span class="pill">${weightHtml}</span>
        ${categoriesHtml}
        <span class="pill ${item.location === "Не знаю где" || item.location === "Надо купить" ? "warn" : ""}">${locationHtml}</span>
      </div>
      ${photoHtml}
    </article>
  `;
}

export function subcontainerTitleHtml({ container, editing, packed, titleTextHtml }) {
  if (editing) {
    return `<input class="container-title-input" data-container-title-input="${container.id}" value="${escapeHtml(container.name)}" />`;
  }
  return `<strong data-container-title-text="${container.id}">${packed ? `<span class="packed-mark" aria-hidden="true">✓</span>` : ""}${titleTextHtml}</strong>`;
}
