import { escapeHtml } from "../utils/html.js";

export function renderBackupRules(target, { t = (key) => key } = {}) {
  if (!target) return;
  target.innerHTML = `
    <section class="backup-rule-section">
      <h3>${escapeHtml(t("backup.createTitle"))}</h3>
      <p>${escapeHtml(t("backup.createText1"))}</p>
      <p>${escapeHtml(t("backup.createText2"))}</p>
    </section>
    <section class="backup-rule-section">
      <h3>${escapeHtml(t("backup.restoreTitle"))}</h3>
      <p><strong>${escapeHtml(t("backup.restoreSelected"))}</strong> ${escapeHtml(t("backup.restoreSelectedText"))}</p>
      <p><strong>${escapeHtml(t("backup.restoreFull"))}</strong> ${escapeHtml(t("backup.restoreFullText"))}</p>
    </section>
  `;
}

export function resetBackupImportUi(refs) {
  if (refs.backupAnalysis) refs.backupAnalysis.innerHTML = "";
  if (refs.backupRestoreSelectedBtn) refs.backupRestoreSelectedBtn.hidden = true;
  if (refs.backupRestoreFullBtn) refs.backupRestoreFullBtn.hidden = true;
}

export function selectedBackupLayoutIds(analysisElement) {
  if (!analysisElement) return new Set();
  return new Set([...analysisElement.querySelectorAll("[data-backup-layout-id]:checked")]
    .map((input) => input.dataset.backupLayoutId)
    .filter(Boolean));
}

export function renderBackupAnalysis(refs, { backupState, rows, photoCount }) {
  if (!refs.backupAnalysis) return;
  refs.backupAnalysis.innerHTML = `
    <div class="backup-summary">
      В архиве: ${Object.keys(backupState.layouts || {}).length} укладок, ${Object.keys(backupState.items || {}).length} вещей, ${Object.keys(backupState.containers || {}).length} сумок/мест, ${photoCount} фото.
    </div>
    <div class="backup-layout-list">
      ${rows.map(({ layout, mode }) => `
        <label class="backup-layout-row ${mode}">
          <input type="checkbox" data-backup-layout-id="${escapeHtml(layout.id)}" checked />
          <span>
            <strong>${escapeHtml(layout.name || "Укладка без названия")}</strong>
            <small>${mode === "replace"
              ? "У пользователя уже есть укладка с таким же именем: она будет заменена."
              : "Такой укладки нет: она будет создана."}</small>
          </span>
          <span class="backup-badge ${mode}">${mode === "replace" ? "замена" : "создание"}</span>
        </label>
      `).join("")}
    </div>
    <div id="backupSelectionSummary" class="backup-summary"></div>
  `;
  if (refs.backupRestoreSelectedBtn) refs.backupRestoreSelectedBtn.hidden = rows.length === 0;
  if (refs.backupRestoreFullBtn) refs.backupRestoreFullBtn.hidden = false;
}

export function renderBackupSelectionSummary(refs, { selectedCount, summary }) {
  const target = refs.backupAnalysis?.querySelector("#backupSelectionSummary");
  if (target) {
    target.innerHTML = `
      Выбрано: ${selectedCount}. Будет заменено укладок: ${summary.replace}; создано укладок: ${summary.create}.<br />
      Новые вещи: ${summary.newItems.length}; новые сумки/места: ${summary.newContainers.length}; фото из архива к проверке/загрузке: ${summary.photos.length}.
    `;
  }
  if (refs.backupRestoreSelectedBtn) refs.backupRestoreSelectedBtn.disabled = selectedCount === 0;
}

export function selectedBackupRestoreConfirm(summary) {
  return {
    title: "Восстановить выбранные укладки?",
    text: "При восстановлении отдельных укладок заменяются только укладки с совпадающим именем, новые создаются, недостающие вещи/сумки/фото добавляются.",
    highlightText: `Будет заменено: ${summary.replace}; создано: ${summary.create}; новые вещи: ${summary.newItems.length}; новые сумки/места: ${summary.newContainers.length}; фото к проверке: ${summary.photos.length}.`,
    okText: "Восстановить выбранные",
    tone: "warning"
  };
}

export function fullBackupRestoreConfirm(stats) {
  return {
    title: "Восстановить всё из архива?",
    text: "При полном восстановлении всё текущее состояние пользователя будет потеряно и заменено данными из архива.",
    highlightText: `Будет восстановлено: ${stats.layouts} укладок, ${stats.items} вещей, ${stats.containers} сумок/мест. Текущее состояние будет потеряно.`,
    okText: "Восстановить всё",
    tone: "danger"
  };
}
