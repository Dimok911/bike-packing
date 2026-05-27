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
