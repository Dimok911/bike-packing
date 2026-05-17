import { escapeHtml } from "../utils/html.js";

export function highlightSearchText(value, rawQuery) {
  const text = String(value || "");
  const query = String(rawQuery || "").trim();
  if (!query) return escapeHtml(text);

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let index = 0;
  let html = "";

  while (index < text.length) {
    const found = lowerText.indexOf(lowerQuery, index);
    if (found === -1) {
      html += escapeHtml(text.slice(index));
      break;
    }
    html += escapeHtml(text.slice(index, found));
    html += `<mark>${escapeHtml(text.slice(found, found + query.length))}</mark>`;
    index = found + query.length;
  }

  return html;
}
