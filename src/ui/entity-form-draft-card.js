import { renderCatalogCard, renderCatalogPills } from "./catalog-card.js";
import { escapeHtml } from "../utils/html.js";
import { formatWeight } from "../utils/weight.js";

function tr(t, key, fallback, values = {}) {
  const value = t(key, values);
  return value === key ? fallback : value;
}

export function newEntityFormDraftDisplayName({ draft, kind = "item", t = (key) => key } = {}) {
  const fallbackName = kind === "container"
    ? tr(t, "formDraft.newContainer", "Новая сумка или место")
    : tr(t, "formDraft.newItem", "Новая вещь");
  return String(draft?.fields?.name || "").trim() || fallbackName;
}

export function newEntityFormDraftDeleteConfirm({ draft, kind = "item", t = (key) => key } = {}) {
  const name = newEntityFormDraftDisplayName({ draft, kind, t });
  return {
    title: tr(t, "formDraft.deleteTitle", "Удалить черновик?"),
    text: tr(t, "formDraft.deleteText", "Черновик «{name}» будет удалён с этого устройства. Это действие нельзя отменить.", { name }),
    okText: tr(t, "buttons.deleteLayout", "Удалить"),
    cancelText: tr(t, "buttons.cancel", "Отмена"),
    tone: "danger",
    hideClose: true
  };
}

export function renderNewEntityFormDraftCardHtml({
  draft,
  kind = "item",
  showPhotos = false,
  t = (key) => key
} = {}) {
  if (!draft || (kind !== "item" && kind !== "container")) return "";
  const fields = draft.fields || {};
  const name = newEntityFormDraftDisplayName({ draft, kind, t });
  const weight = Number(fields.weight || 0);
  const meta = [
    weight > 0 ? formatWeight(weight) : "",
    ...(Array.isArray(fields.categories) ? fields.categories : []),
    String(fields.location || "")
  ].filter(Boolean).map((value) => escapeHtml(value));
  const draftLabel = tr(t, "formDraft.badge", "Черновик");
  const status = tr(t, "formDraft.catalogStatus", "Не сохранено · нажмите, чтобы продолжить");
  const openLabel = tr(t, "formDraft.open", `Продолжить заполнение черновика «${name}»`, { name });
  const deleteLabel = tr(t, "formDraft.delete", "Удалить черновик");
  const photoPlaceholder = tr(t, "formDraft.photoPlaceholder", "Локальный черновик");

  return renderCatalogCard({
    classes: [
      "entity-form-draft-card",
      kind === "container" ? "root-container-card" : ""
    ],
    attributes: {
      "data-entity-form-draft-card": kind,
      tabindex: "0",
      "aria-label": openLabel
    },
    title: `${draftLabel}: ${name}\n${status}`,
    titleHtml: escapeHtml(name),
    metaHtml: renderCatalogPills(meta),
    statusHtml: escapeHtml(status),
    badgeHtml: `<span class="entity-form-draft-card-badge">${escapeHtml(draftLabel)}</span>`,
    photoHtml: showPhotos
      ? `<div class="item-photo item-photo-empty entity-form-draft-photo" aria-hidden="true">${escapeHtml(photoPlaceholder)}</div>`
      : "",
    actionsHtml: `
      <button class="delete-item-button entity-form-draft-delete" type="button" data-delete-entity-form-draft="${kind}" aria-label="${escapeHtml(deleteLabel)}" title="${escapeHtml(deleteLabel)}">
        <span aria-hidden="true">&times;</span>
      </button>
    `
  });
}
