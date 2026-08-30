import { recordNoteMatchesQuery } from "../state/catalog-search.js";
import { escapeHtml } from "../utils/html.js";

export function renderSearchNoteMatchBadge(record, query, t = (key) => key, {
  editAttribute = ""
} = {}) {
  if (!recordNoteMatchesQuery(record, query)) return "";
  const translated = t("filters.noteMatch");
  const label = translated === "filters.noteMatch" ? "Совпадение в заметке" : translated;
  const safeLabel = escapeHtml(label);
  if (!editAttribute || !record?.id) return `<span class="search-note-match-badge">${safeLabel}</span>`;
  return `<button class="search-note-match-badge" type="button" ${editAttribute}="${escapeHtml(record.id)}">${safeLabel}</button>`;
}
