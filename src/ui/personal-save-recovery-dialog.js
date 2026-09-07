// Independent of app startup/auth rendering: a broken journal can stop startup
// before the ordinary status controls exist. The native top layer also covers
// the still-open form whose save failed, including on mobile.
export function createPersonalSaveRecoveryDialog({ documentRef = document, windowRef = window,
  getLanguage = () => "ru", getRecoveryCopy, ownsError, canRecoverDraft = () => false, recoverDraft,
  getPhotoRecoveryArchive, canExportPhotos = () => false, checkPhotoResult, canCheckPhotos = () => false,
  cancelPhotoUpload, canCancelPhotos = () => false } = {}) {
  let dialog, checking = false;
  const text = (ru, en) => getLanguage() === "en" ? en : ru;
  windowRef.addEventListener("beforeunload", event => {
    if (!dialog?.open) return;
    event.preventDefault(); event.returnValue = "";
  });
  // These exact errors were already presented, and still unwind the caller.
  // Unrelated exceptions must remain visible to diagnostics.
  windowRef.addEventListener("error", event => { if (ownsError(event.error)) event.preventDefault(); });
  windowRef.addEventListener("unhandledrejection", event => { if (ownsError(event.reason)) event.preventDefault(); });
  const renderChecking = active => {
    checking = active;
    if (!dialog) return;
    dialog.querySelector("#personalSaveRecoveryTitle").textContent = active
      ? text("Проверка сохранённых фотографий", "Checking retained photos") : text("Сохранение приостановлено", "Saving is paused");
    dialog.querySelector("#personalSaveRecoveryDescription").textContent = active
      ? text("Проверяем файлы и очередь на этом устройстве. Пока не закрывайте вкладку.", "Checking local files and the queue. Keep this tab open.")
      : text("Не удалось надёжно сохранить или прочитать очередь изменений. Продолжать редактирование в этой вкладке пока нельзя. Не очищайте данные сайта.",
        "The changes queue could not be saved or read reliably. Editing in this tab is paused. Do not clear this site's data.");
    dialog.querySelectorAll("button").forEach(button => { button.disabled = active; });
    dialog.querySelector("[data-recovery-guidance]").hidden = active;
    dialog.querySelector("[data-recovery-reason]").hidden = active;
    dialog.querySelector("[data-download-photo-recovery]").hidden = active || !canExportPhotos();
    dialog.querySelector("[data-check-photo-result]").hidden = active || !canCheckPhotos();
    dialog.querySelector("[data-cancel-photo-upload]").hidden = active || !canCancelPhotos();
  };
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
      guidance.dataset.recoveryGuidance = "";
      guidance.textContent = text(
        "Перед перезагрузкой скачайте копию для восстановления. Она содержит доступную очередь и, если удалось получить, несохранённые изменения. Файлы фотографий в неё не входят. Это не обычная резервная копия: не импортируйте её автоматически и не отправляйте в общий доступ.",
        "Download a recovery copy before reloading. It contains the available queue and any captured unsaved changes, but not photo files. This is not a normal backup: do not import it automatically or share it publicly.");
      const download = documentRef.createElement("button");
      download.type = "button";
      download.textContent = text("Скачать копию для восстановления", "Download recovery copy");
      const status = documentRef.createElement("p");
      status.setAttribute("role", "status");
      const photoDownload = documentRef.createElement("button");
      photoDownload.type = "button"; photoDownload.dataset.downloadPhotoRecovery = "";
      photoDownload.textContent = text("Скачать очередь и доступные фото", "Download queue and available photos");
      photoDownload.hidden = !canExportPhotos();
      const checkResult = documentRef.createElement("button");
      checkResult.type = "button"; checkResult.dataset.checkPhotoResult = "";
      checkResult.textContent = text("Проверить результат отправки", "Check upload outcome");
      checkResult.hidden = !canCheckPhotos();
      const cancelUpload = documentRef.createElement("button");
      cancelUpload.type = "button"; cancelUpload.dataset.cancelPhotoUpload = "";
      cancelUpload.textContent = text("Остановить отправку / выбрать версию", "Stop upload / choose version");
      cancelUpload.hidden = !canCancelPhotos();
      let checkingResult = false;
      const resolvePhotoResult = async (action, startingMessage) => {
        if (checkingResult) return;
        checkingResult = true; checkResult.disabled = true; cancelUpload.disabled = true;
        status.textContent = startingMessage;
        try {
          const result = await action();
          if (result?.verified !== true || result.fileRetained !== true || result.reloadRequired !== true) throw Error(text("Проверка не завершена. Данные сохранены.", "Check incomplete. Your data is retained."));
          status.textContent = text("Подтверждения и актуальная версия сохранены на устройстве. Перезагрузите страницу, чтобы продолжить. Файлы фото не удалены.",
            "Receipts and the current version are saved on this device. Reload to continue. Photo files have not been deleted.");
        } catch (error) {
          status.textContent = error.message || text("Результат пока не подтверждён. Файлы сохранены.", "Outcome not confirmed yet. Files are retained.");
        } finally {
          checkingResult = false; checkResult.disabled = false; cancelUpload.disabled = false;
          cancelUpload.hidden = !canCancelPhotos();
        }
      };
      checkResult.addEventListener("click", () => resolvePhotoResult(checkPhotoResult,
        text("Проверяю подтверждения сервера. Фото повторно не отправляются…", "Checking server receipts. Photos are not uploaded again…")));
      cancelUpload.addEventListener("click", () => resolvePhotoResult(cancelPhotoUpload,
        text("Уточняю результат и останавливаю непринятую отправку. Файл остаётся на устройстве…", "Checking the outcome and stopping an unaccepted upload. The file stays on this device…")));
      photoDownload.addEventListener("click", async () => {
        photoDownload.disabled = true;
        status.textContent = text("Собираю локальные файлы. Ничего не отправляется на сервер…", "Collecting local files. Nothing is sent to the server…");
        try {
          const archive = await getPhotoRecoveryArchive();
          const url = windowRef.URL.createObjectURL(archive.blob), link = documentRef.createElement("a");
          link.href = url; link.download = archive.fileName;
          dialog.append(link); link.click(); link.remove();
          windowRef.setTimeout(() => windowRef.URL.revokeObjectURL(url), 30000);
          status.textContent = text("Загрузка архива запрошена. Проверьте файл в загрузках. Он содержит доступные локальные фото текущего списка, не подтверждает отправку и не разрешает очистку данных сайта.",
            "Archive download requested. Check your downloads. It contains available local photos of this list, not server confirmation or permission to clear site data.");
        } catch (error) {
          status.textContent = error.message || text("Архив не готов. Не закрывайте вкладку и не очищайте данные сайта.", "Archive not ready. Keep this tab and its site data.");
        } finally { photoDownload.disabled = false; }
      });
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
      dialog.append(title, description, reason, guidance, checkResult, cancelUpload, download, photoDownload, recover, status);
      documentRef.body.append(dialog);
      dialog.showModal();
    },
    showChecking() { this.show(); renderChecking(true); },
    finishChecking() {
      if (!checking) return; // A concurrent real failure owns the dialog now.
      checking = false;
      dialog?.close();
      dialog?.remove();
      dialog = undefined;
    },
    setReason(code) {
      renderChecking(false);
      const messages = {
        quota: ["На устройстве не хватает места для сохранения.", "There is not enough storage space on this device."],
        storage: ["Локальная очередь недоступна или повреждена; её содержимое не удалено.", "The local queue is unavailable or damaged; its contents have not been deleted."],
        fork: ["Обнаружены разные изменения из двух вкладок. Ни одна ветвь не выбрана автоматически.", "Two tabs have different changes. Neither branch was selected automatically."],
        "stale-tab": ["Другая вкладка сохранила новую версию. Текущие изменения не будут молча записаны поверх неё.", "Another tab saved a newer version. This tab's changes will not silently overwrite it."],
        selection: ["Найдено несколько локальных списков. Нужна проверка, какой список восстанавливать.", "Several local lists were found. The recovery target needs to be checked."],
        "photo-recovery": ["Найдены сохранённые фотодействия либо их журнал недоступен. Их результат требует отдельной проверки. Файлы не удалены, повторная отправка не запущена. Можно скачать доступную локальную копию.",
          "Retained photo actions were found or their journal is unavailable. Their outcome needs review. No files were deleted or uploads restarted. You can download the available local recovery copy."]
      };
      const message = messages[code] || messages.storage;
      if (dialog) {
        if (code === "photo-recovery") {
          dialog.querySelector("#personalSaveRecoveryTitle").textContent = text("Фото требуют проверки", "Photos need review");
          dialog.querySelector("#personalSaveRecoveryDescription").textContent = text(
            "Редактирование приостановлено, чтобы сохранить локальные данные. Не очищайте данные сайта.",
            "Editing is paused to protect local data. Do not clear this site's data.");
          dialog.querySelector("[data-recovery-guidance]").textContent = text(
            "Скачайте очередь и доступные фото текущего списка. Это копия для восстановления, не подтверждение отправки. Не импортируйте её автоматически и не публикуйте.",
            "Download the queue and available photos of this list. This is recovery evidence, not confirmation of upload. Do not import automatically or share publicly.");
        }
        dialog.querySelector("[data-recovery-reason]").textContent = text(...message);
        dialog.querySelector("[data-recover-stale-draft]").hidden = !canRecoverDraft();
      }
    }
  };
}
