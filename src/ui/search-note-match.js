import { recordNoteMatchesQuery } from "../state/catalog-search.js";
import { escapeHtml } from "../utils/html.js";

export function renderSearchNoteMatchBadge(record, query, t = (key) => key) {
  if (!recordNoteMatchesQuery(record, query)) return "";
  const translated = t("filters.noteMatch");
  const label = translated === "filters.noteMatch" ? "Совпадение в заметке" : translated;
  return `<span class="search-note-match-badge">${escapeHtml(label)}</span>`;
}
