import { escapeHtml } from "../utils/html.js";
import { formatVolume, formatWeight } from "../utils/weight.js";

export function renderSharedLayoutsHtml(layouts, {
  bagLabel = "сумки",
  copyBagLabel = "Скопировать сумку",
  copyItemLabel = "Скопировать вещь",
  emptyBagText = "Внутри пока нет вещей",
  itemLabel = "вещи",
  rootsForLayout = (layout) => layout?.roots || [],
  showPhotos = true,
  weightLabel = "Вес"
} = {}) {
  return layouts.map((layout) => {
    const roots = rootsForLayout(layout);
    const totalWeight = roots.reduce((sum, root) => sum + sharedRootWeight(root), 0);
    const itemCount = roots.reduce((sum, root) => sum + (root.items || []).length, 0);
    return `
      <section class="shared-layout-block">
        <div class="shared-layout-heading">
          <div>
            <h3>${escapeHtml(layout.name)}</h3>
            <span>${escapeHtml(layout.subtitle)}</span>
          </div>
          <strong>${roots.length} ${escapeHtml(bagLabel)} · ${itemCount} ${escapeHtml(itemLabel)} · ${formatWeight(totalWeight)}</strong>
        </div>
        <div class="shared-board">
          ${roots.map((root) => renderSharedRootColumnHtml(layout, root, {
            copyBagLabel,
            copyItemLabel,
            emptyBagText,
            showPhotos,
            weightLabel
          })).join("")}
        </div>
      </section>
    `;
  }).join("");
}

export function renderSharedRootColumnHtml(layout, root, {
  copyBagLabel = "Скопировать сумку",
  copyItemLabel = "Скопировать вещь",
  emptyBagText = "Внутри пока нет вещей",
  showPhotos = true,
  weightLabel = "Вес"
} = {}) {
  const itemCount = (root.items || []).length;
  return `
    <article class="container-card shared-root-column">
      <div class="container-header">
        <div class="container-header-main">
          ${renderSharedGearPhotoHtml(root, { showPhotos })}
          <div>
            <h3>${escapeHtml(root.name)}</h3>
            <span class="container-location">${formatWeight(sharedRootWeight(root))}${root.volumeLiters ? ` · ${formatVolume(root.volumeLiters)}` : ""}</span>
          </div>
        </div>
        <button class="copy-item-button" type="button" data-copy-shared-root="${escapeHtml(root.id)}" aria-label="${escapeHtml(copyBagLabel)}" title="${escapeHtml(copyBagLabel)}">
          <span aria-hidden="true">⧉</span>
        </button>
      </div>
      ${root.description ? `<p class="shared-root-note">${escapeHtml(root.description)}</p>` : ""}
      <div class="dropzone">
        ${(root.items || []).map((item) => renderSharedItemCardHtml(layout, root, item, {
          copyItemLabel,
          showPhotos,
          weightLabel
        })).join("") || `<div class="empty">${itemCount ? "" : escapeHtml(emptyBagText)}</div>`}
      </div>
    </article>
  `;
}

export function renderSharedItemCardHtml(layout, root, item, {
  copyItemLabel = "Скопировать вещь",
  showPhotos = true,
  weightLabel = "Вес"
} = {}) {
  return `
    <article class="shared-gear-card">
      ${renderSharedGearPhotoHtml(item, { showPhotos })}
      <div class="shared-gear-body">
        <h4>${escapeHtml(item.name)}</h4>
        <p>${escapeHtml(item.description || "")}</p>
        <div class="shared-gear-meta">
          ${root?.name ? `<span class="shared-weight">${escapeHtml(root.name)}</span>` : ""}
          <span class="shared-weight">${escapeHtml(weightLabel)}: ${formatWeight(item.weightGrams)}${item.weightAlt ? ` · ${escapeHtml(item.weightAlt)}` : ""}</span>
          ${item.volumeLiters ? `<span class="shared-weight">${formatVolume(item.volumeLiters)}</span>` : ""}
        </div>
        <button class="ghost shared-copy-button" type="button" data-copy-shared-item="${escapeHtml(item.id)}">
          ${escapeHtml(copyItemLabel)}
        </button>
      </div>
    </article>
  `;
}

function renderSharedGearPhotoHtml(bag, { showPhotos = true } = {}) {
  if (!showPhotos) return "";
  if (bag.imageUrl) {
    return `
      <div class="shared-gear-photo">
        <img src="${escapeHtml(bag.imageUrl)}" alt="${escapeHtml(bag.name)}" loading="lazy" />
      </div>
    `;
  }
  return `
    <div class="shared-gear-photo shared-gear-photo-${escapeHtml(bag.photoKind || "bag")}" aria-label="${escapeHtml(bag.name)}" role="img">
      <span>${escapeHtml(sharedGearInitials(bag.name))}</span>
    </div>
  `;
}

function sharedGearInitials(name) {
  return String(name)
    .split(/[\s-]+/)
    .filter((part) => /^[A-Za-z0-9]/.test(part))
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "BG";
}

export function sharedRootWeight(root) {
  return Number(root.weightGrams || 0) + (root.items || []).reduce((sum, item) => sum + Number(item.weightGrams || 0), 0);
}
