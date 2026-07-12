import { escapeHtml } from "../utils/html.js";

export function sharedListPublishDialogHtml({ authorLabel = "", language = "ru" } = {}) {
  const en = language === "en";
  return `
    <span class="share-link-options">
      <label class="share-link-mode-option">
        <input type="radio" name="shareLinkMode" value="live" checked>
        <span><strong>${en ? "Live layout" : "Живая укладка"}</strong><small>${en ? "Saved changes will appear at the same link." : "Сохранённые изменения будут появляться по той же ссылке."}</small></span>
      </label>
      <label class="share-link-mode-option">
        <input type="radio" name="shareLinkMode" value="snapshot">
        <span><strong>${en ? "Snapshot" : "Слепок"}</strong><small>${en ? "A separate immutable copy will be created." : "Будет создана отдельная неизменяемая копия."}</small></span>
      </label>
      <label class="share-link-author-option">
        <input type="checkbox" data-share-author>
        <span><strong>${en ? "Show author" : "Показывать автора"}</strong>${authorLabel ? `<small>${escapeHtml(authorLabel)}</small>` : ""}</span>
      </label>
    </span>`;
}

export function readSharedListPublishOptions(root) {
  return {
    mode: root?.querySelector('input[name="shareLinkMode"]:checked')?.value === "snapshot" ? "snapshot" : "live",
    includeAuthor: Boolean(root?.querySelector("[data-share-author]")?.checked)
  };
}

export function sharedListLinkResultHtml(link, { language = "ru" } = {}) {
  const en = language === "en";
  return `
    <span class="share-link-result">
      <strong>${en ? "Link is ready" : "Ссылка готова"}</strong>
      <input type="text" readonly value="${escapeHtml(link)}" aria-label="${en ? "Public list link" : "Публичная ссылка на список"}">
      <small>${en ? "Anyone with this link can open the published layout." : "Открыть опубликованную укладку сможет любой, у кого есть эта ссылка."}</small>
    </span>`;
}
