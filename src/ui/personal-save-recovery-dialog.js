// Independent of app startup/auth rendering: a broken journal can stop startup
// before the ordinary status controls exist. The native top layer also covers
// the still-open form whose save failed, including on mobile.
export function createPersonalSaveRecoveryDialog({ documentRef = document, windowRef = window,
  getLanguage = () => "ru", getRecoveryCopy, ownsError, canRecoverDraft = () => false, recoverDraft } = {}) {
  let dialog;
  const text = (ru, en) => getLanguage() === "en" ? en : ru;
  windowRef.addEventListener("beforeunload", event => {
    if (!dialog?.open) return;
    event.preventDefault(); event.returnValue = "";
  });
  // These exact errors were already presented, and still unwind the caller.
  // Unrelated exceptions must remain visible to diagnostics.
  windowRef.addEventListener("error", event => { if (ownsError(event.error)) event.preventDefault(); });
  windowRef.addEventListener("unhandledrejection", event => { if (ownsError(event.reason)) event.preventDefault(); });
  return {
    show() {
      if (dialog) { if (!dialog.open) dialog.showModal(); return; }
      dialog = documentRef.createElement("dialog");
      dialog.id = "personalSaveRecoveryDialog";
      dialog.className = "personal-save-recovery-dialog";
      dialog.setAttribute("role", "alertdialog");
      dialog.setAttribute("aria-labelledby", "personalSaveRecoveryTitle");
      dialog.setAttribute("aria-describedby", "personalSaveRecoveryDescription");
      dialog.addEventListener("cancel", event => event.preventDefault());
      const title = documentRef.createElement("h2");
      title.id = "personalSaveRecoveryTitle";
      title.textContent = text("Сохранение приостановлено", "Saving is paused");
      const description = documentRef.createElement("p");
      description.id = "personalSaveRecoveryDescription";
      description.textContent = text(
        "Не удалось надёжно сохранить или прочитать очередь изменений. Продолжать редактирование в этой вкладке пока нельзя. Не очищайте данные сайта.",
        "The changes queue could not be saved or read reliably. Editing in this tab is paused. Do not clear this site's data.");
      const reason = documentRef.createElement("p");
      reason.dataset.recoveryReason = "";
      const guidance = documentRef.createElement("p");
      guidance.textContent = text(
        "Перед перезагрузкой скачайте копию для восстановления. Она содержит доступную очередь и, если удалось получить, несохранённые изменения. Файлы фотографий в неё не входят. Это не обычная резервная копия: не импортируйте её автоматически и не отправляйте в общий доступ.",
        "Download a recovery copy before reloading. It contains the available queue and any captured unsaved changes, but not photo files. This is not a normal backup: do not import it automatically or share it publicly.");
      const download = documentRef.createElement("button");
      download.type = "button";
      download.textContent = text("Скачать копию для восстановления", "Download recovery copy");
      const status = documentRef.createElement("p");
      status.setAttribute("role", "status");
      const recover = documentRef.createElement("button");
      recover.type = "button"; recover.dataset.recoverStaleDraft = "";
      recover.textContent = text("Сравнить с другой вкладкой", "Compare with the other tab");
      recover.hidden = !canRecoverDraft();
      recover.addEventListener("click", async () => {
        recover.disabled = true;
        try {
          await recoverDraft();
          dialog.close();
        } catch (error) {
          status.textContent = error.message || text("Восстановление остановлено. Черновик сохранён.", "Recovery paused. The draft is retained.");
        } finally { recover.disabled = false; recover.hidden = !canRecoverDraft(); }
      });
      download.addEventListener("click", () => {
        try {
          const copy = getRecoveryCopy();
          const blob = new Blob([JSON.stringify(copy, null, 2)], { type: "application/json" });
          const url = windowRef.URL.createObjectURL(blob);
          const link = documentRef.createElement("a");
          link.href = url; link.download = "bike-packing-recovery.json";
          dialog.append(link); link.click(); link.remove();
          windowRef.setTimeout(() => windowRef.URL.revokeObjectURL(url), 30000);
          status.textContent = text("Загрузка файла запрошена. Проверьте, что файл появился в загрузках. Редактирование остаётся приостановленным.",
            "Download requested. Check that the file appears in downloads. Editing remains paused.");
        } catch {
          status.textContent = text("Не удалось подготовить файл. Не закрывайте вкладку: копия ещё не скачана.",
            "Could not prepare the file. Keep this tab open: no copy has been downloaded.");
        }
      });
      dialog.append(title, description, reason, guidance, download, recover, status);
      documentRef.body.append(dialog);
      dialog.showModal();
    },
    setReason(code) {
      const messages = {
        quota: ["На устройстве не хватает места для сохранения.", "There is not enough storage space on this device."],
        storage: ["Локальная очередь недоступна или повреждена; её содержимое не удалено.", "The local queue is unavailable or damaged; its contents have not been deleted."],
        fork: ["Обнаружены разные изменения из двух вкладок. Ни одна ветвь не выбрана автоматически.", "Two tabs have different changes. Neither branch was selected automatically."],
        "stale-tab": ["Другая вкладка сохранила новую версию. Текущие изменения не будут молча записаны поверх неё.", "Another tab saved a newer version. This tab's changes will not silently overwrite it."],
        selection: ["Найдено несколько локальных списков. Нужна проверка, какой список восстанавливать.", "Several local lists were found. The recovery target needs to be checked."]
      };
      const message = messages[code] || messages.storage;
      if (dialog) {
        dialog.querySelector("[data-recovery-reason]").textContent = text(...message);
        dialog.querySelector("[data-recover-stale-draft]").hidden = !canRecoverDraft();
      }
    }
  };
}
