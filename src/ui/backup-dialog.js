import { escapeHtml } from "../utils/html.js";
import { backupRestoreComposition } from "../backup/admin-restore.js";

function backupLocalText(language, en, ru) {
  return String(language || "").toLowerCase().startsWith("en") ? en : ru;
}

export function renderBackupProgress(target, {
  detail = "",
  percent = 0,
  title = ""
} = {}) {
  if (!target) return;
  const safePercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  target.className = "dialog-status backup-progress-status";
  target.innerHTML = `
    <span><strong>${safePercent}%</strong> ${escapeHtml(title)}</span>
    <progress max="100" value="${safePercent}">${safePercent}%</progress>
    ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
  `;
}

export function renderBackupRules(target, { t = (key) => key } = {}) {
  if (!target) return;
  target.innerHTML = `
    <details class="backup-rule-section">
      <summary>${escapeHtml(t("backup.createTitle"))}</summary>
      <div class="backup-rule-content">
        <p>${escapeHtml(t("backup.createText1"))}</p>
        <p>${escapeHtml(t("backup.createText2"))}</p>
      </div>
    </details>
    <details class="backup-rule-section">
      <summary>${escapeHtml(t("backup.restoreTitle"))}</summary>
      <div class="backup-rule-content">
        <p><strong>${escapeHtml(t("backup.restoreSelected"))}</strong> ${escapeHtml(t("backup.restoreSelectedText"))}</p>
        <p><strong>${escapeHtml(t("backup.restoreFull"))}</strong> ${escapeHtml(t("backup.restoreFullText"))}</p>
      </div>
    </details>
  `;
}

export function resetBackupImportUi(refs) {
  if (refs.backupAnalysis) refs.backupAnalysis.innerHTML = "";
  if (refs.backupRestoreSelectedBtn) refs.backupRestoreSelectedBtn.hidden = true;
  if (refs.backupRestoreAdminBtn) refs.backupRestoreAdminBtn.hidden = true;
  if (refs.backupRestoreFullBtn) refs.backupRestoreFullBtn.hidden = true;
}

export function selectedBackupLayoutIds(analysisElement) {
  if (!analysisElement) return new Set();
  return new Set([...analysisElement.querySelectorAll("[data-backup-layout-id]:checked")]
    .map((input) => input.dataset.backupLayoutId)
    .filter(Boolean));
}

export function selectedBackupRestoreMode(analysisElement) {
  return analysisElement?.querySelector("[data-backup-restore-mode]:checked")?.value === "copy" ? "copy" : "replace";
}

export function applyBackupRestoreMode(analysisElement, restoreMode = "replace") {
  if (!analysisElement) return;
  const mode = restoreMode === "copy" ? "copy" : "replace";
  analysisElement.dataset.restoreMode = mode;
  analysisElement.querySelectorAll("[data-backup-layout-row]").forEach((row) => {
    const replaceClass = row.dataset.backupReplaceClass || "replace";
    row.classList.remove("replace", "create", "same");
    row.classList.add(mode === "copy" ? "create" : replaceClass);
    const badge = row.querySelector(".backup-badge");
    badge?.classList.remove("replace", "create", "same");
    badge?.classList.add(mode === "copy" ? "create" : replaceClass);
  });
  analysisElement.querySelectorAll("[data-backup-mode]").forEach((element) => {
    element.hidden = element.dataset.backupMode !== mode;
  });
}

function backupRowWarningHtml({ layout, existing }, language) {
  if (!existing?.locked || layout?.locked) return "";
  return `<small class="backup-warning" data-backup-mode="replace">${backupLocalText(language,
    "The archived version is unlocked, but the current layout is locked. The lock and current note will be preserved.",
    "Архивная версия не заблокирована, но текущая укладка заблокирована. Замок и текущая заметка будут сохранены."
  )}</small>`;
}

function renderBackupAdminTemplateRows(rows = [], uiLanguage = "ru") {
  if (!rows.length) return "";
  const byLanguage = new Map();
  rows.forEach((row) => {
    const language = String(row.language || "").toUpperCase() || "—";
    if (!byLanguage.has(language)) byLanguage.set(language, []);
    byLanguage.get(language).push(row);
  });
  const rowHtml = [...byLanguage.entries()].map(([entryLanguage, languageRows]) => `
    <section class="backup-admin-language-group">
      <h4>${backupLocalText(uiLanguage, "Language", "Язык")}: ${escapeHtml(entryLanguage)}</h4>
      <div class="backup-layout-list">
        ${languageRows.map((row) => `
          <label class="backup-layout-row create">
            <input type="checkbox" data-backup-admin-template-key="${escapeHtml(row.key)}" checked />
            <span>
              <strong>${escapeHtml(row.name || row.id)}</strong>
              <small>${row.type === "demo" ? "Demo" : "Shared"}</small>
            </span>
            <span class="backup-badge create">${backupLocalText(uiLanguage, "template", "шаблон")}</span>
          </label>
        `).join("")}
      </div>
    </section>
  `).join("");
  return `
    <details class="backup-admin-templates" open>
      <summary>${backupLocalText(uiLanguage, `2. Public templates: ${rows.length}`, `2. Public-шаблоны: ${rows.length}`)}</summary>
      <p>${backupLocalText(uiLanguage,
        "Select demo/shared templates separately from personal layouts. Each template is published back to its original language and ID.",
        "Выберите demo/shared-шаблоны отдельно от личных укладок. Каждый шаблон публикуется обратно в свой язык и ID."
      )}</p>
      <div class="backup-admin-language-list">${rowHtml}</div>
      <div class="backup-section-actions" data-backup-admin-actions></div>
    </details>
  `;
}

export function renderBackupAnalysis(refs, { adminTemplateRows = [], backupState, rows, photoCount, language = "ru" }) {
  if (!refs.backupAnalysis) return;
  const counts = backupRestoreComposition(backupState, rows, adminTemplateRows);
  refs.backupAnalysis.innerHTML = `
    <div class="backup-summary">
      <strong>${backupLocalText(language, "Available to restore", "Доступно для восстановления")}: ${counts.logicalRestoreCount}</strong><br />
      ${backupLocalText(language, "Personal layouts", "Личные укладки")}: ${counts.personalLayoutCount}; public-${backupLocalText(language, "templates", "шаблоны")}: ${counts.publicTemplateCount}${counts.publicTemplateCount ? ` (demo: ${counts.demoTemplateCount}, shared: ${counts.sharedTemplateCount})` : ""}; ${backupLocalText(language, "photos", "фото")}: ${photoCount}.<br />
      ${backupLocalText(language, "Items", "Вещи")}: ${Object.keys(backupState.items || {}).length}; ${backupLocalText(language, "bags/places", "сумки/места")}: ${Object.keys(backupState.containers || {}).length}.
    </div>
    <fieldset class="backup-restore-mode">
      <legend>${backupLocalText(language, "1. Personal layouts: restore mode", "1. Личные укладки: способ восстановления")}</legend>
      <label><input type="radio" name="backupRestoreMode" value="replace" data-backup-restore-mode checked /> ${backupLocalText(language, "Replace layouts with matching names", "Заменить укладки с совпадающим именем")}</label>
      <label><input type="radio" name="backupRestoreMode" value="copy" data-backup-restore-mode /> ${backupLocalText(language, "Create all as new with the backup date in the name", "Создать все как новые с датой бэкапа в имени")}</label>
    </fieldset>
    <div class="backup-layout-list">
      ${rows.map(({ layout, mode, existing, matchesCurrent }) => `
        <label class="backup-layout-row ${matchesCurrent ? "same" : mode}" data-backup-layout-row data-backup-replace-class="${matchesCurrent ? "same" : mode}">
          <input type="checkbox" data-backup-layout-id="${escapeHtml(layout.id)}" checked />
          <span>
            <strong>${escapeHtml(layout.name || backupLocalText(language, "Unnamed layout", "Укладка без названия"))}</strong>
            <small data-backup-mode="replace">${matchesCurrent
              ? backupLocalText(language, "This layout structure already matches the archive.", "Структура этой укладки уже совпадает с архивом.")
              : mode === "replace"
              ? backupLocalText(language, "A layout with this name already exists and will be replaced.", "У пользователя уже есть укладка с таким же именем: она будет заменена.")
              : backupLocalText(language, "This layout does not exist and will be created.", "Такой укладки нет: она будет создана.")}</small>
            <small data-backup-mode="copy" hidden>${backupLocalText(language, "A new dated layout will be created; the current layout will remain unchanged.", "Будет создана новая укладка с датой бэкапа в имени; текущая укладка останется без изменений.")}</small>
            ${backupRowWarningHtml({ layout, existing }, language)}
          </span>
          <span class="backup-badge ${matchesCurrent ? "same" : mode}">
              <span data-backup-mode="replace">${matchesCurrent ? backupLocalText(language, "matches", "совпадает") : mode === "replace" ? backupLocalText(language, "replace", "замена") : backupLocalText(language, "create", "создание")}</span>
              <span data-backup-mode="copy" hidden>${backupLocalText(language, "create", "создание")}</span>
          </span>
        </label>
      `).join("")}
    </div>
    <div id="backupSelectionSummary" class="backup-summary"></div>
    <div class="backup-section-actions backup-personal-actions" data-backup-personal-actions></div>
    ${renderBackupAdminTemplateRows(adminTemplateRows, language)}
  `;
  const personalActions = refs.backupAnalysis.querySelector("[data-backup-personal-actions]");
  if (personalActions && refs.backupRestoreSelectedBtn) personalActions.append(refs.backupRestoreSelectedBtn);
  if (personalActions && refs.backupRestoreFullBtn) personalActions.append(refs.backupRestoreFullBtn);
  const adminActions = refs.backupAnalysis.querySelector("[data-backup-admin-actions]");
  if (adminActions && refs.backupRestoreAdminBtn) adminActions.append(refs.backupRestoreAdminBtn);
  if (refs.backupRestoreSelectedBtn) refs.backupRestoreSelectedBtn.hidden = rows.length === 0;
  if (refs.backupRestoreAdminBtn) refs.backupRestoreAdminBtn.hidden = adminTemplateRows.length === 0;
  if (refs.backupRestoreFullBtn) refs.backupRestoreFullBtn.hidden = false;
}

export function renderBackupSelectionSummary(refs, { language = "ru", restoreMode = "replace", selectedCount, summary }) {
  const target = refs.backupAnalysis?.querySelector("#backupSelectionSummary");
  const lockedWarnings = Array.isArray(summary.lockedLayoutProtections) ? summary.lockedLayoutProtections : [];
  if (target) {
    if (summary.matchesCurrentState) {
      target.classList.add("same");
      target.innerHTML = `
        <strong>${backupLocalText(language, "The archive and selected current layouts match.", "Архив и текущее состояние выбранных укладок совпадают.")}</strong><br />
        ${backupLocalText(language, "There are no new items, bags, or photos to add. Restore is not required.", "Новых вещей, сумок и фотографий для добавления нет. Восстановление не требуется.")}
      `;
    } else {
      target.classList.remove("same");
      target.innerHTML = `
      ${backupLocalText(language, "Selected", "Выбрано")}: ${selectedCount}. ${restoreMode === "copy"
        ? backupLocalText(language, `New layouts to create: ${summary.create}; current layouts remain unchanged.`, `Будет создано новых укладок: ${summary.create}; текущие укладки останутся без изменений.`)
        : backupLocalText(language, `Layouts to replace: ${summary.replace}; layouts to create: ${summary.create}.`, `Будет заменено укладок: ${summary.replace}; создано укладок: ${summary.create}.`)}<br />
      ${backupLocalText(language, "New items", "Новые вещи")}: ${summary.newItems.length}; ${backupLocalText(language, "new bags/places", "новые сумки/места")}: ${summary.newContainers.length}; ${backupLocalText(language, "new photos", "новые фотографии")}: ${summary.newPhotos.length}.
      ${lockedWarnings.length ? `<br /><span class="backup-warning">${backupLocalText(language, "Warning: archived layouts are unlocked while current layouts are locked. Locks will be preserved", "Внимание: в архиве нет блокировки для укладок, которые сейчас заблокированы. Замки будут сохранены")}: ${escapeHtml(lockedWarnings.map((entry) => entry.name || entry.id).join(", "))}.</span>` : ""}
    `;
    }
  }
  if (refs.backupRestoreSelectedBtn) refs.backupRestoreSelectedBtn.disabled = selectedCount === 0;
}

export function selectedBackupRestoreConfirm(summary, { language = "ru", restoreMode = "replace" } = {}) {
  const lockedWarnings = Array.isArray(summary.lockedLayoutProtections) ? summary.lockedLayoutProtections : [];
  const lockedWarningText = lockedWarnings.length
    ? backupLocalText(language,
      ` Warning: archived layouts are unlocked while current layouts are locked; locks and current notes will be preserved: ${lockedWarnings.map((entry) => entry.name || entry.id).join(", ")}.`,
      ` Внимание: в архиве нет блокировки для укладок, которые сейчас заблокированы; замки и текущие заметки будут сохранены: ${lockedWarnings.map((entry) => entry.name || entry.id).join(", ")}.`
    )
    : "";
  return {
    title: restoreMode === "copy"
      ? backupLocalText(language, "Create selected personal layouts as new?", "Создать выбранные личные укладки как новые?")
      : backupLocalText(language, "Restore selected personal layouts?", "Восстановить выбранные личные укладки?"),
    text: restoreMode === "copy"
      ? backupLocalText(language, "Current layouts remain unchanged. Selected layouts are created as new with the backup date in their names.", "Текущие укладки останутся без изменений. Выбранные укладки будут созданы как новые, а к их именам добавится дата бэкапа.")
      : backupLocalText(language, "Only layouts with matching names are replaced; new layouts and missing items, bags, and photos are added.", "При восстановлении отдельных укладок заменяются только укладки с совпадающим именем, новые создаются, недостающие вещи/сумки/фото добавляются."),
    highlightText: summary.matchesCurrentState
      ? backupLocalText(language, "The archive and selected current layouts match. Restore is not required.", "Архив и текущее состояние выбранных укладок совпадают. Восстановление не требуется.")
      : backupLocalText(language,
        `${restoreMode === "copy" ? "New layouts to create" : "Layouts to replace"}: ${restoreMode === "copy" ? summary.create : summary.replace};${restoreMode === "copy" ? "" : ` layouts to create: ${summary.create};`} new items: ${summary.newItems.length}; new bags/places: ${summary.newContainers.length}; new photos: ${summary.newPhotos.length}.${lockedWarningText}`,
        `${restoreMode === "copy" ? "Будет создано новых укладок" : "Будет заменено"}: ${restoreMode === "copy" ? summary.create : summary.replace};${restoreMode === "copy" ? "" : ` создано: ${summary.create};`} новые вещи: ${summary.newItems.length}; новые сумки/места: ${summary.newContainers.length}; новые фотографии: ${summary.newPhotos.length}.${lockedWarningText}`
      ),
    okText: restoreMode === "copy" ? backupLocalText(language, "Create personal layouts as new", "Создать личные как новые") : backupLocalText(language, "Restore selected personal layouts", "Восстановить выбранные личные"),
    tone: "warning"
  };
}

export function fullBackupRestoreConfirm(stats, { language = "ru" } = {}) {
  return {
    title: backupLocalText(language, "Fully restore personal data without templates?", "Полностью восстановить личные данные без шаблонов?"),
    text: backupLocalText(language, "All current personal data will be replaced by the archive. Public templates are restored separately.", "При полном восстановлении всё текущее личное состояние пользователя будет потеряно и заменено данными из архива. Public-шаблоны восстанавливаются отдельной кнопкой."),
    highlightText: backupLocalText(language,
      `Will restore ${stats.layouts} layouts, ${stats.items} items, and ${stats.containers} bags/places. Current personal state will be lost.`,
      `Будет восстановлено: ${stats.layouts} укладок, ${stats.items} вещей, ${stats.containers} сумок/мест. Текущее состояние будет потеряно.`
    ),
    okText: backupLocalText(language, "Restore personal data without templates", "Восстановить личные данные без шаблонов"),
    tone: "danger"
  };
}
