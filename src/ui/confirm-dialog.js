import { escapeHtml } from "../utils/html.js";

export function isDestructiveConfirmAction(okText, tone = "") {
  return tone === "danger" || /удал|сброс|разобрать|выйти/i.test(okText);
}

export function confirmMessageHtml({ text, highlightText = "", highlightCount = "", tone = "" }) {
  if (!highlightText) return escapeHtml(text);
  const highlightClass = `confirm-highlight confirm-${tone || "safe"}`;
  const countHtml = highlightCount
    ? `<strong class="confirm-highlight-count">${escapeHtml(highlightCount)}</strong>`
    : "";
  return `${escapeHtml(text)}<span class="${highlightClass}">${countHtml}${escapeHtml(highlightText)}</span>`;
}
