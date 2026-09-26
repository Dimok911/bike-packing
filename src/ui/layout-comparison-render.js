import {
  comparisonContainerEntries,
  comparisonEntryVisible
} from "../state/layout-compare.js";

function parentName(state, containerId, fallback) {
  return state?.containers?.[containerId]?.name || fallback;
}

function comparisonStatusLabel({
  comparison,
  entityType,
  id,
  state,
  t,
  variant
}) {
  const diff = entityType === "item"
    ? comparison.itemDiffs[id]
    : comparison.containerDiffs[id];
  if (!diff || diff.status === "unchanged") return "";
  if (diff.status === "added") return t("compare.statusAdd");
  if (diff.status === "removed") return t("compare.statusRemove");
  if (diff.status === "changed") return t("compare.statusQuantity", {
    from: diff.fromQuantity,
    to: diff.toQuantity
  });
  const fromId = entityType === "item" ? diff.fromContainerId : diff.fromParentId;
  const toId = entityType === "item" ? diff.toContainerId : diff.toParentId;
  if (variant === "source-ghost") {
    return t("compare.statusTakeFromHere", {
      destination: parentName(state, toId, t("compare.layoutRoot"))
    });
  }
  return t("compare.statusMoveHere", {
    source: parentName(state, fromId, t("compare.layoutRoot"))
  });
}

function comparisonClass(status, variant) {
  if (variant === "source-ghost") return "comparison-source-ghost";
  if (status === "added") return "comparison-added";
  if (status === "removed") return "comparison-removed";
  if (status === "moved") return "comparison-moved";
  if (status === "changed") return "comparison-moved";
  return "comparison-unchanged";
}

function statusBadgeHtml({ comparison, entityType, id, state, t, variant, escapeHtml }) {
  const diff = entityType === "item"
    ? comparison.itemDiffs[id]
    : comparison.containerDiffs[id];
  const label = comparisonStatusLabel({ comparison, entityType, id, state, t, variant });
  if (!label) return "";
  return `<span class="comparison-status comparison-status-${escapeHtml(diff?.status || "unchanged")}"><span class="comparison-status-text">${escapeHtml(label)}</span></span>`;
}

function comparisonItemChangeEntries(comparison, state, status, t) {
  return Object.values(comparison?.itemDiffs || {})
    .filter((diff) => diff.status === status)
    .map((diff) => ({
      diff,
      name: state?.items?.[diff.id]?.name || t("compare.unnamedItem")
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function renderComparisonItemChangeGroup({
  comparison,
  escapeHtml,
  renderThumbnail,
  state,
  status,
  t
}) {
  const added = status === "added";
  const entries = comparisonItemChangeEntries(comparison, state, status, t);
  const title = t(added ? "compare.itemsAdded" : "compare.itemsRemoved");
  const locationKey = added ? "compare.itemAddedTo" : "compare.itemRemovedFrom";
  return `
    <section class="comparison-item-change-group comparison-item-change-${status}">
      <h3>${escapeHtml(title)} <span>${entries.length}</span></h3>
      ${entries.length ? `
        <ul>
          ${entries.map(({ diff, name }) => {
            const containerId = added ? diff.toContainerId : diff.fromContainerId;
            const container = parentName(state, containerId, t("compare.layoutRoot"));
            const item = state?.items?.[diff.id];
            return `
              <li>
                <button type="button" class="comparison-item-change-button" data-compare-open-item="${escapeHtml(diff.id)}">
                  ${renderThumbnail(item)}
                  <span class="comparison-item-change-copy">
                    <strong>${escapeHtml(name)}</strong>
                    <small>${escapeHtml(t(locationKey, { container }))}</small>
                  </span>
                </button>
              </li>
            `;
          }).join("")}
        </ul>
      ` : `<p>${escapeHtml(t("compare.itemsNone"))}</p>`}
    </section>
  `;
}

export function renderLayoutComparisonItemChangesHtml({
  comparison,
  escapeHtml,
  renderThumbnail = () => "",
  state,
  t
}) {
  return `
    <section class="layout-comparison-item-changes" aria-labelledby="comparisonItemChangesTitle">
      <h2 id="comparisonItemChangesTitle">${escapeHtml(t("compare.itemsTitle"))}</h2>
      <div class="comparison-item-change-grid">
        ${renderComparisonItemChangeGroup({ comparison, escapeHtml, renderThumbnail, state, status: "added", t })}
        ${renderComparisonItemChangeGroup({ comparison, escapeHtml, renderThumbnail, state, status: "removed", t })}
      </div>
    </section>
  `;
}

function renderComparisonItem({
  comparison,
  entry,
  escapeHtml,
  formatItemWeight,
  renderPhoto,
  state,
  t
}) {
  const sourceItem = state?.items?.[entry.id];
  const quantity = entry.variant === "source" || entry.variant === "source-ghost"
    ? comparison.from.itemQuantities[entry.id]
    : comparison.to.itemQuantities[entry.id];
  const item = sourceItem ? { ...sourceItem, quantity: quantity || 1 } : null;
  if (!item) return "";
  const diff = comparison.itemDiffs[entry.id] || { status: "unchanged" };
  const classes = comparisonClass(diff.status, entry.variant);
  const moved = diff.status === "moved";
  const moveLinkLabel = entry.variant === "source-ghost"
    ? t("compare.showDestinationCard")
    : t("compare.showSourceCard");
  return `
    <article
      class="item-card comparison-item ${classes}"
      data-comparison-entity="item:${escapeHtml(entry.id)}"
      data-comparison-variant="${escapeHtml(entry.variant)}"
      tabindex="0"
    >
      <div class="comparison-item-main">
        <div class="comparison-item-heading">
          <strong class="item-title">${escapeHtml(item.name || t("compare.unnamedItem"))}</strong>
          ${moved ? `
            <button
              class="ghost comparison-move-link-button"
              type="button"
              data-compare-show-move-link
              aria-label="${escapeHtml(moveLinkLabel)}"
              title="${escapeHtml(moveLinkLabel)}"
              aria-pressed="false"
            ><span aria-hidden="true">⇄</span></button>
          ` : ""}
        </div>
        ${statusBadgeHtml({
          comparison,
          entityType: "item",
          id: entry.id,
          state,
          t,
          variant: entry.variant,
          escapeHtml
        })}
      </div>
      <div class="meta">
        <span class="pill">${escapeHtml(formatItemWeight(item))}</span>
        ${item.location ? `<span class="pill">${escapeHtml(item.location)}</span>` : ""}
      </div>
      ${renderPhoto(item)}
    </article>
  `;
}

function renderComparisonContainer({
  collapsedIds,
  comparison,
  entry,
  escapeHtml,
  formatItemWeight,
  onlyChanges,
  renderPhoto,
  root = false,
  state,
  t
}) {
  const container = state?.containers?.[entry.id];
  if (!container) return "";
  const diff = comparison.containerDiffs[entry.id] || { status: "unchanged" };
  const classes = comparisonClass(diff.status, entry.variant);
  const ghost = entry.variant === "source-ghost";
  const moved = diff.status === "moved";
  const moveLinkLabel = entry.variant === "source-ghost"
    ? t("compare.showDestinationCard")
    : t("compare.showSourceCard");
  const collapsed = !ghost && collapsedIds.has(entry.id);
  const availableChildEntries = ghost
    ? []
    : comparisonContainerEntries(comparison, entry.id, entry.variant);
  const childEntries = availableChildEntries
    .filter((child) => comparisonEntryVisible(comparison, child, onlyChanges));
  const unchangedContentsHidden = onlyChanges
    && diff.status === "moved"
    && entry.variant === "target"
    && availableChildEntries.length > 0
    && childEntries.length === 0;
  const contentsHtml = childEntries.map((child) => {
    if (child.type === "item") {
      return renderComparisonItem({
        comparison,
        entry: child,
        escapeHtml,
        formatItemWeight,
        renderPhoto,
        state,
        t
      });
    }
    return renderComparisonContainer({
      collapsedIds,
      comparison,
      entry: child,
      escapeHtml,
      formatItemWeight,
      onlyChanges,
      renderPhoto,
      root: false,
      state,
      t
    });
  }).join("");
  const tag = root ? "article" : "section";
  const containerClass = root ? "container-card comparison-root" : "subcontainer comparison-subcontainer";
  const collapseLabel = collapsed ? t("tooltips.expand") : t("tooltips.collapse");
  return `
    <${tag}
      class="${containerClass} comparison-container ${classes}"
      data-comparison-entity="container:${escapeHtml(entry.id)}"
      data-comparison-variant="${escapeHtml(entry.variant)}"
      tabindex="0"
    >
      <header class="${root ? "container-header" : "subcontainer-title"} comparison-container-header">
        <div class="comparison-container-title">
          ${ghost ? "" : `
            <button
              class="collapse-button"
              type="button"
              data-compare-toggle-container="${escapeHtml(entry.id)}"
              aria-label="${escapeHtml(collapseLabel)}"
              title="${escapeHtml(collapseLabel)}"
            ><span class="chevron-icon ${collapsed ? "chevron-down" : "chevron-up"}" aria-hidden="true"></span></button>
          `}
          <strong>${escapeHtml(container.name || t("compare.unnamedContainer"))}</strong>
          ${moved ? `
            <button
              class="ghost comparison-move-link-button"
              type="button"
              data-compare-show-move-link
              aria-label="${escapeHtml(moveLinkLabel)}"
              title="${escapeHtml(moveLinkLabel)}"
              aria-pressed="false"
            ><span aria-hidden="true">⇄</span></button>
          ` : ""}
        </div>
        ${statusBadgeHtml({
          comparison,
          entityType: "container",
          id: entry.id,
          state,
          t,
          variant: entry.variant,
          escapeHtml
        })}
      </header>
      ${ghost || collapsed ? "" : renderPhoto(container)}
      ${ghost || collapsed ? "" : `
        <div class="dropzone comparison-contents">
          ${unchangedContentsHidden
            ? `<p class="comparison-unchanged-contents">${escapeHtml(t("compare.contentsUnchanged"))}</p>`
            : contentsHtml}
        </div>
      `}
    </${tag}>
  `;
}

export function renderLayoutComparisonToolbarHtml({
  comparison,
  escapeHtml,
  onlyChanges,
  t
}) {
  return `
    <section class="layout-comparison-toolbar" aria-label="${escapeHtml(t("compare.mode"))}">
      <div class="layout-comparison-heading">
        <span>${escapeHtml(t("compare.mode"))}</span>
        <strong>${escapeHtml(comparison.fromLayout.name)} <span aria-hidden="true">→</span> ${escapeHtml(comparison.toLayout.name)}</strong>
        <small>${escapeHtml(t("compare.localOnly"))}</small>
      </div>
      <div class="layout-comparison-actions">
        <button class="ghost ${onlyChanges ? "active" : ""}" type="button" data-compare-only-changes>
          ${escapeHtml(onlyChanges ? t("compare.showAll") : t("compare.showOnlyChanges"))}
        </button>
        <button class="ghost" type="button" data-compare-swap>${escapeHtml(t("compare.swap"))}</button>
        <button class="ghost" type="button" data-compare-choose>${escapeHtml(t("compare.chooseOther"))}</button>
        <button class="ghost" type="button" data-compare-close>${escapeHtml(t("buttons.close"))}</button>
      </div>
    </section>
  `;
}

function comparisonStructureHeadingHtml({ allCollapsed, escapeHtml, t }) {
  const toggleAllLabel = t(allCollapsed
    ? "tooltips.expandAllInLayout"
    : "tooltips.collapseAllInLayout");
  return `
    <div class="layout-comparison-structure-heading">
      <h2 id="comparisonStructureTitle">${escapeHtml(t("compare.layoutStructureTitle"))}</h2>
      <button
        class="ghost comparison-collapse-all-button"
        type="button"
        data-compare-toggle-all
        aria-label="${escapeHtml(toggleAllLabel)}"
        title="${escapeHtml(toggleAllLabel)}"
      >
        <span class="stack-icon ${allCollapsed ? "expand-all-icon" : "collapse-all-icon"}" aria-hidden="true">
          <span class="stack-chevron stack-chevron-up"></span>
          <span class="stack-chevron stack-chevron-down"></span>
        </span>
      </button>
    </div>
  `;
}

export function renderLayoutComparisonBoardHtml({
  allCollapsed = false,
  collapsedIds = new Set(),
  comparison,
  escapeHtml,
  formatItemWeight,
  onlyChanges = true,
  renderPhoto = () => "",
  state,
  t
}) {
  const rootEntries = comparison.rootEntries.filter((entry) => (
    comparisonEntryVisible(comparison, entry, onlyChanges)
  ));
  if (!rootEntries.length) {
    return `
      <section class="layout-comparison-structure" aria-labelledby="comparisonStructureTitle">
        ${comparisonStructureHeadingHtml({ allCollapsed, escapeHtml, t })}
        <div class="empty comparison-empty">
          <strong>${escapeHtml(t("compare.noChangesTitle"))}</strong>
          <span>${escapeHtml(t("compare.noChangesText"))}</span>
        </div>
      </section>
    `;
  }
  return `
    <section class="layout-comparison-structure" aria-labelledby="comparisonStructureTitle">
      ${comparisonStructureHeadingHtml({ allCollapsed, escapeHtml, t })}
      <div class="board comparison-board">
        ${rootEntries.map((entry) => renderComparisonContainer({
          collapsedIds,
          comparison,
          entry,
          escapeHtml,
          formatItemWeight,
          onlyChanges,
          renderPhoto,
          root: true,
          state,
          t
        })).join("")}
      </div>
    </section>
  `;
}
