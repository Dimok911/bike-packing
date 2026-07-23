import { escapeHtml } from "../utils/html.js";

function renderAttributes(attributes = {}) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== false && value !== null && value !== undefined && value !== "")
    .map(([name, value]) => value === true ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`)
    .join("");
}

export function renderCatalogPills(tags = [], { hidden = false } = {}) {
  const content = tags.filter(Boolean).map((tag) => `<span class="pill">${tag}</span>`).join("");
  return `<div class="meta ${hidden ? "meta-hidden" : ""}">${content}</div>`;
}

export function renderCatalogCard({
  classes = [],
  attributes = {},
  title = "",
  titleHtml = "",
  titleClass = "",
  titleAttributes = {},
  metaHtml = "",
  statusHtml = "",
  badgeHtml = "",
  photoHtml = "",
  actionsHtml = ""
} = {}) {
  const className = ["item-card", ...classes].filter(Boolean).join(" ");
  const titleMarkup = titleHtml || escapeHtml(title);
  return `
    <article class="${className}"${renderAttributes({ ...attributes, title })}>
      <div class="item-card-top">
        <div class="catalog-card-title-block">
          <strong class="item-title ${titleClass}"${renderAttributes(titleAttributes)}>${titleMarkup}</strong>
          ${metaHtml}
          ${statusHtml ? `<small class="catalog-card-status">${statusHtml}</small>` : ""}
          ${badgeHtml}
        </div>
        ${actionsHtml}
      </div>
      ${photoHtml}
    </article>
  `;
}
