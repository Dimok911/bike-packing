import { escapeHtml } from "../utils/html.js";

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
  titleHtml,
  totalWeightHtml
}) {
  const rootIconClass = rootCollapsed ? "chevron-down" : "chevron-up";
  return `
    <article class="container-card ${packed ? "packed-container" : ""} ${justAdded ? "just-added" : ""}" data-root-container-id="${container.id}">
      <header class="container-header">
        <div class="container-title">
          ${readonly ? `
            <button class="collapse-button" data-toggle-container="${container.id}" aria-label="${rootCollapsed ? "Развернуть" : "Свернуть"}">
              <span class="chevron-icon ${rootIconClass}" aria-hidden="true"></span>
            </button>
          ` : ""}
          <h2>${titleHtml}</h2>
        </div>
        <div class="container-tools">
          ${readonlyTemplate ? "" : `
          <button
            class="header-icon-button add-to-container-button"
            data-add-to-container="${container.id}"
            aria-label="Добавить вещь"
            title="Добавить вещь"
          >+</button>
          `}
          <button
            class="header-icon-button"
            data-edit-container="${container.id}"
            aria-label="Редактировать"
            title="Редактировать"
          >&#9998;</button>
          ${hasNestedContainers ? `
            <button
              class="header-icon-button"
              data-toggle-column="${container.id}"
              aria-label="${allNestedCollapsed ? "Развернуть все" : "Свернуть все"}"
              title="${allNestedCollapsed ? "Развернуть все" : "Свернуть все"}"
            >
              <span class="stack-icon ${allNestedCollapsed ? "expand-all-icon" : "collapse-all-icon"}" aria-hidden="true">
                <span class="stack-chevron stack-chevron-up"></span>
                <span class="stack-chevron stack-chevron-down"></span>
              </span>
            </button>
          ` : ""}
          ${totalWeightHtml}
        </div>
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
  titleHtml,
  totalWeightHtml
}) {
  const rootIconClass = rootCollapsed ? "chevron-down" : "chevron-up";
  const rootCollapseButton = readonly
    ? `<button class="collapse-button" data-toggle-container="${container.id}" aria-label="${rootCollapsed ? "Развернуть" : "Свернуть"}"><span class="chevron-icon ${rootIconClass}" aria-hidden="true"></span></button>`
    : "";
  return `
    <article class="container-card ${packed ? "packed-container" : ""} ${justAdded ? "just-added" : ""}" data-root-container-id="${container.id}">
      <header class="container-header">
        <div class="container-title">
          ${rootCollapseButton}
          <h2>${titleHtml}</h2>
        </div>
        <div class="container-tools">
          ${readonlyTemplate ? "" : `
          <button
            class="header-icon-button add-to-container-button"
            data-add-to-container="${container.id}"
            aria-label="Добавить вещь"
            title="Добавить вещь"
          >+</button>
          `}
          <button
            class="header-icon-button"
            data-edit-container="${container.id}"
            aria-label="Редактировать"
            title="Редактировать"
          >&#9998;</button>
          ${totalWeightHtml}
        </div>
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
  titleHtml,
  totalWeightHtml
}) {
  const rootIconClass = rootCollapsed ? "chevron-down" : "chevron-up";
  return `
    <div class="packing-root-header-cell ${packed ? "packed-container" : ""}" data-sticky-root-container-id="${escapeHtml(container.id)}">
      <div class="container-title">
        ${readonly ? `
          <button class="collapse-button" data-toggle-container="${container.id}" aria-label="${rootCollapsed ? "Развернуть" : "Свернуть"}">
            <span class="chevron-icon ${rootIconClass}" aria-hidden="true"></span>
          </button>
        ` : ""}
        <h2>${titleHtml}</h2>
      </div>
      <div class="container-tools">
        ${readonlyTemplate ? "" : `
          <button class="header-icon-button add-to-container-button" data-add-to-container="${container.id}" aria-label="Добавить вещь" title="Добавить вещь">+</button>
          <button class="header-icon-button" data-edit-container="${container.id}" aria-label="Редактировать" title="Редактировать">&#9998;</button>
        `}
        ${hasNestedContainers ? `
          <button
            class="collapse-button nested-collapse-toggle"
            data-toggle-column="${container.id}"
            aria-label="${allNestedCollapsed ? "Развернуть все" : "Свернуть все"}"
            title="${allNestedCollapsed ? "Развернуть все" : "Свернуть все"}"
          >
            <span class="stack-icon ${allNestedCollapsed ? "expand-all-icon" : "collapse-all-icon"}" aria-hidden="true">
              <span class="stack-chevron stack-chevron-up"></span>
              <span class="stack-chevron stack-chevron-down"></span>
            </span>
          </button>
        ` : ""}
        ${totalWeightHtml}
      </div>
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
  titleHtml,
  weightHtml
}) {
  const iconClass = collapsed ? "chevron-down" : "chevron-up";
  return `
    <section class="subcontainer ${collapsed ? "collapsed" : ""} ${packed ? "packed-container" : ""} ${justAdded ? "just-added" : ""}" data-subcontainer-id="${container.id}">
      <div class="subcontainer-title">
        <div class="subcontainer-title-main">
          <button class="collapse-button" data-toggle-container="${container.id}" aria-label="${collapsed ? "Развернуть" : "Свернуть"}">
            <span class="chevron-icon ${iconClass}" aria-hidden="true"></span>
          </button>
          ${titleHtml}
        </div>
        <div class="subcontainer-tools">
          <button class="header-icon-button add-to-container-button" data-add-to-container="${container.id}" aria-label="Добавить вещь" title="Добавить вещь">+</button>
          <button class="header-icon-button" data-edit-container="${container.id}" aria-label="Редактировать" title="Редактировать">&#9998;</button>
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
  titleDragAttr,
  titleHtml,
  weightHtml
}) {
  return `
    <article class="item-card ${packedVisible ? "packed-item" : ""} ${filterMatch ? "filter-match" : ""} ${justAdded ? "just-added" : ""}" data-item-id="${item.id}" ${filterMatch ? `data-filter-match-id="${item.id}"` : ""}>
      <div class="item-card-top ${collection ? "with-pack-toggle" : ""}">
        ${collection ? `
          <button
            class="pack-toggle ${packedVisible ? "packed" : ""}"
            data-toggle-packed="${item.id}"
            aria-label="${packed ? "Отметить как не собранное" : "Отметить как собранное"}"
            title="${packed ? "Собрано" : "Не собрано"}"
          >${packedVisible ? "✓" : ""}</button>
        ` : ""}
        <div class="item-title-hitarea"${titleDragAttr}>${titleHtml}</div>
        <button class="copy-item-button" data-copy-layout-item="${item.id}" aria-label="Скопировать" title="Скопировать">
          <span aria-hidden="true">⧉</span>
        </button>
        <button class="edit-button" data-edit-item="${item.id}" aria-label="Редактировать" title="Редактировать">
          <span aria-hidden="true">&#9998;</span>
        </button>
        <button class="remove-layout-button" data-remove-from-layout="${item.id}" aria-label="Убрать из укладки" title="Убрать из укладки">
          <span aria-hidden="true">&times;</span>
        </button>
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
