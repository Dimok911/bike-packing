// A decision about this device's retained changes. Opening, postponing and
// exporting do not send or cancel operations; the caller owns the exact queue.
import { describePersonalRecoveryActions, explainPersonalRecoveryReason } from "./personal-recovery-action-details.js";
import { describePersonalRecoveryVersionComparison } from "./personal-recovery-version-comparison.js";
import { readPersonalRecoveryStorageDiagnostics, formatPersonalRecoveryStorageBytes } from "./personal-recovery-storage-diagnostics.js";

export function askPersonalOrdinaryRecovery({ documentRef = document, windowRef = window,
  language = "ru", actionCount, records = [], confirmedOperationIds = [], failure = {}, comparison = null, getRecoveryCopy, prepareServerChoice } = {}) {
  const text = (ru, en) => language === "en" ? en : ru;
  if (!Number.isSafeInteger(actionCount) || actionCount < 1 || typeof getRecoveryCopy !== "function"
    || documentRef.getElementById("personalOrdinaryRecoveryDialog")) return Promise.resolve("later");
  return new Promise(resolve => {
    const dialog = documentRef.createElement("dialog");
    dialog.id = "personalOrdinaryRecoveryDialog";
    dialog.className = "personal-save-recovery-dialog";
    dialog.setAttribute("aria-labelledby", "personalOrdinaryRecoveryTitle");
    dialog.setAttribute("aria-describedby", "personalOrdinaryRecoveryDescription");
    const heading = documentRef.createElement("h2");
    heading.id = "personalOrdinaryRecoveryTitle";
    heading.tabIndex = -1;
    heading.textContent = text("Сверка изменений на этом устройстве", "Review this device's changes");
    const description = documentRef.createElement("p");
    description.id = "personalOrdinaryRecoveryDescription";
    description.textContent = text(
      "На сервере уже более свежая версия. На этом устройстве осталась запись сохранения без подтверждения сервера. Чтобы продолжить, нужно разобраться с этой записью.",
      "The server has a newer version. This device retains an unconfirmed save record. This record needs review before continuing.");
    const details = documentRef.createElement("section");
    details.className = "personal-recovery-action-details";
    const detailsHeading = documentRef.createElement("h3");
    detailsHeading.textContent = text("Сохранённые изменения", "Saved changes");
    const actions = documentRef.createElement("ol");
    actions.setAttribute("data-recovery-actions", "");
    for (const action of describePersonalRecoveryActions(records, { language, confirmedOperationIds })) {
      const item = documentRef.createElement("li"), title = documentRef.createElement("strong");
      title.textContent = action.title; item.append(title);
      for (const line of action.lines) {
        const detail = documentRef.createElement("p");
        detail.textContent = line; item.append(detail);
      }
      actions.append(item);
    }
    if (!actions.childElementCount) {
      const item = documentRef.createElement("li");
      item.textContent = text("Подробное описание в сохранённой записи отсутствует.", "This saved record has no detailed description.");
      actions.append(item);
    }
    details.append(detailsHeading, actions);
    const reasonHeading = documentRef.createElement("h3"), reason = documentRef.createElement("p");
    reasonHeading.textContent = text("Почему нужна сверка", "Why review is needed");
    reason.setAttribute("data-recovery-reason", "");
    reason.textContent = explainPersonalRecoveryReason(failure, { language });
    const consequence = documentRef.createElement("p");
    consequence.textContent = text(
      "Загрузка серверной версии остановит ещё не принятые местные действия. Их исходная копия останется на этом устройстве. Уже принятые сервером изменения сохранятся. Можно отложить выбор.",
      "Loading the server version will stop local actions that have not been accepted. Their original copy will remain on this device. Changes already accepted by the server will remain. You can decide later.");
    const status = documentRef.createElement("p");
    status.setAttribute("role", "status");
    let storageSection, storageSummary, storageDetails, beforeServerChoiceStorage = null;
    const readStorage = () => {
      try { return readPersonalRecoveryStorageDiagnostics(windowRef.localStorage); }
      catch { return { available: false }; }
    };
    const refreshStorage = () => {
      const measured = readStorage();
      try {
        if (!storageSection) return measured;
        const size = value => formatPersonalRecoveryStorageBytes(value, language);
        storageSummary.textContent = text("Хранилище этого сайта", "This site's storage")
          + (measured.available ? `: ~${size(measured.totalBytes)}` : "");
        storageDetails.replaceChildren();
        if (measured.available) {
          for (const [key, label] of [
            ["totalBytes", text("Всего в localStorage", "Total in localStorage")],
            ["personalQueueBytes", text("Очередь личных сохранений", "Personal save queue")],
            ["recoveryBytes", text("Копии и отметки восстановления", "Recovery copies and completion records")],
            ["transportJournalBytes", text("Журнал неподтверждённых отправок", "Unconfirmed request journal")],
            ["publicCacheBytes", text("Кеш опубликованных шаблонов", "Published template cache")],
            ["otherBytes", text("Другие данные сайта", "Other site data")]
          ]) {
            const row = documentRef.createElement("li"); row.textContent = `${label}: ${size(measured[key])}`; storageDetails.append(row);
          }
        } else {
          const row = documentRef.createElement("li");
          row.textContent = text("Не удалось прочитать размер хранилища. Это не означает, что оно пустое.", "Storage size could not be read. This does not mean it is empty.");
          storageDetails.append(row);
        }
      } catch { /* Optional diagnostics must never disable recovery choices. */ }
      return measured;
    };
    try {
      storageSection = documentRef.createElement("details");
      storageSection.setAttribute("data-recovery-storage", "");
      storageSummary = documentRef.createElement("summary"); storageDetails = documentRef.createElement("ul");
      const note = documentRef.createElement("p");
      note.textContent = text(
        "Оценка localStorage (UTF-16), без файлов фотографий и других хранилищ. Фактическая квота неизвестна; это не показатель свободной памяти устройства.",
        "Estimated localStorage size (UTF-16), excluding photo files and other stores. The actual quota is unknown; this does not measure free device space.");
      storageSection.append(storageSummary, storageDetails, note); refreshStorage();
    } catch { storageSection = null; }
    const buttons = documentRef.createElement("div");
    buttons.className = "dialog-actions";
    const download = documentRef.createElement("button"), useServer = documentRef.createElement("button"), later = documentRef.createElement("button");
    for (const button of [download, useServer, later]) button.type = "button";
    download.textContent = text("Скачать данные для разбора", "Download diagnostic recovery data");
    useServer.textContent = text("Загрузить серверную версию", "Load server version");
    later.textContent = text("Решить позже", "Decide later");
    useServer.className = "primary";
    let done = false, preparationFailure = null;
    const finish = choice => {
      if (done) return;
      done = true;
      dialog.close(); dialog.remove(); resolve(choice);
    };
    download.addEventListener("click", async () => {
      download.disabled = true;
      let url;
      try {
        const copy = await getRecoveryCopy();
        if (done) return;
        if (!copy || typeof copy !== "object") throw Error(text("Копия пока недоступна.", "The recovery copy is not available."));
        const diagnostic = { ...copy,
          ...(preparationFailure ? { recoveryPreparationFailure: preparationFailure } : {}),
          recoveryStorageDiagnostics: { current: refreshStorage(),
            ...(beforeServerChoiceStorage ? { beforeServerChoice: beforeServerChoiceStorage } : {}) } };
        const blob = new windowRef.Blob([JSON.stringify(diagnostic, null, 2)], { type: "application/json" });
        url = windowRef.URL.createObjectURL(blob);
        const link = documentRef.createElement("a");
        link.href = url; link.download = "bike-packing-local-recovery.json";
        documentRef.body.append(link); link.click(); link.remove();
        status.textContent = text(
          "Копия подготовлена. Она содержит местные данные и очередь, без самих файлов фотографий. Не импортируйте её как обычную резервную копию.",
          "Recovery copy prepared. It contains local data and the queue, without photo files. Do not import it as a normal backup.");
      } catch (error) { if (!done) status.textContent = error.message || text("Не удалось подготовить копию.", "Could not prepare the recovery copy."); }
      finally {
        if (url) windowRef.setTimeout(() => windowRef.URL.revokeObjectURL(url), 1000);
        if (!done) download.disabled = false;
      }
    });
    later.addEventListener("click", () => finish("later"));
    useServer.addEventListener("click", () => {
      useServer.disabled = true;
      beforeServerChoiceStorage = refreshStorage();
      try {
        // Preserve the choice and recovery copy before closing the only UI
        // that can explain a storage failure and export the original data.
        prepareServerChoice?.();
        finish("server");
      } catch (error) {
        refreshStorage();
        preparationFailure = {
          code: typeof error?.code === "string" ? error.code : "preparation-failed",
          stage: typeof error?.stage === "string" ? error.stage : "archive",
          reason: typeof error?.reason === "string" ? error.reason : "unknown"
        };
        status.textContent = error.message || text("Не удалось подготовить восстановление. Исходные данные сохранены.",
          "Could not prepare recovery. Original data is retained.");
        status.setAttribute("role", "alert");
        useServer.disabled = false;
      }
    });
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish("later"); });
    buttons.append(download, useServer, later);
    dialog.append(heading, description, details, reasonHeading, reason);
    const compared = describePersonalRecoveryVersionComparison(comparison || {}, { language });
    if (compared.available) {
      const section = documentRef.createElement("section"), title = documentRef.createElement("h3"), note = documentRef.createElement("p"), list = documentRef.createElement("ul");
      section.setAttribute("data-recovery-comparison", "");
      title.textContent = text("Отличия от серверной версии", "Differences from the server version");
      note.textContent = text(`Сравнение с версией сервера ${comparison.serverRevision} на момент проверки. Это сравнение двух снимков, а не история ваших действий.`,
        `Compared with server version ${comparison.serverRevision} at the time of checking. This compares two snapshots, not the history of your actions.`);
      for (const line of compared.lines) {
        const item = documentRef.createElement("li"); item.textContent = line; list.append(item);
      }
      if (compared.omittedCount) {
        const item = documentRef.createElement("li");
        item.textContent = text(`Ещё различий не показано: ${compared.omittedCount}.`, `More differences not shown: ${compared.omittedCount}.`);
        list.append(item);
      }
      section.append(title, note, list); dialog.append(section);
    }
    dialog.append(consequence);
    if (storageSection) dialog.append(storageSection);
    dialog.append(status, buttons);
    documentRef.body.append(dialog);
    dialog.showModal(); heading.focus({ preventScroll: true }); dialog.scrollTop = 0;
  });
}
