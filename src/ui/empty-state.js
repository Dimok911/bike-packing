import { escapeHtml } from "../utils/html.js";

export function renderEmptyState(text, {
  extraClass = "",
  filtered = false
} = {}) {
  const classes = [
    "empty",
    extraClass,
    filtered ? "empty-filtered" : ""
  ].filter(Boolean).join(" ");
  return `<div class="${classes}">${escapeHtml(text || "Ничего не найдено")}</div>`;
}

export function renderPackingEmptyState({
  title = "",
  text = "",
  actionText = "",
  hint = ""
} = {}) {
  return `
    <section class="empty board-empty packing-empty-state">
      <div class="packing-empty-state-icon" aria-hidden="true">+</div>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
      <button type="button" data-add-packing-root>${escapeHtml(actionText)}</button>
      ${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
    </section>
  `;
}

export function bindPackingEmptyStateActions(root, {
  onAddRoot = () => {}
} = {}) {
  root?.querySelectorAll?.("[data-add-packing-root]").forEach((button) => {
    button.addEventListener("click", onAddRoot);
  });
}

export function renderPackingAddRootCard({
  title = "",
  text = ""
} = {}) {
  return `
    <button class="packing-add-root-card" type="button" data-add-packing-root>
      <span class="packing-add-root-card-icon" aria-hidden="true">+</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(text)}</small>
    </button>
  `;
}
