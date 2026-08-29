import { escapeHtml } from "../utils/html.js";
import { searchQueryTerms } from "../state/catalog-search.js";

function searchMarkRanges(text, terms) {
  const lowerText = text.toLocaleLowerCase();
  const ranges = [];
  terms.forEach((term) => {
    let offset = 0;
    while (offset <= lowerText.length - term.length) {
      const start = lowerText.indexOf(term, offset);
      if (start < 0) break;
      ranges.push({ start, end: start + term.length });
      offset = start + Math.max(term.length, 1);
    }
  });
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  return ranges.reduce((merged, range) => {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
    return merged;
  }, []);
}

export function highlightSearchText(value, rawQuery) {
  const text = String(value || "");
  const ranges = searchMarkRanges(text, searchQueryTerms(rawQuery));
  if (!ranges.length) return escapeHtml(text);
  let index = 0;
  let html = "";
  ranges.forEach((range) => {
    html += escapeHtml(text.slice(index, range.start));
    html += `<mark>${escapeHtml(text.slice(range.start, range.end))}</mark>`;
    index = range.end;
  });
  html += escapeHtml(text.slice(index));
  return html;
}
