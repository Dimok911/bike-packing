import { escapeHtml } from "../utils/html.js";

export function renderBackupRules(target) {
  if (!target) return;
  target.innerHTML = `
    <section class="backup-rule-section">
      <h3>Создать архив</h3>
      <p>Архив скачивается ZIP-файлом и содержит полное состояние: укладки, вещи, сумки/контейнеры, настройки и фото. У администратора дополнительно попадают demo/shared-укладки.</p>
      <p>Такой архив можно загрузить в другом аккаунте, чтобы перенести данные. Файл не привязан к email, поэтому храните его как приватный экспорт данных.</p>
    </section>
    <section class="backup-rule-section">
      <h3>Восстановить</h3>
      <p><strong>Выбранные укладки</strong> добавляют недостающие вещи/сумки/фото и заменяют только укладки с совпадающим именем.</p>
      <p><strong>Восстановить всё</strong> полностью заменяет текущее состояние аккаунта данными из архива.</p>
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
