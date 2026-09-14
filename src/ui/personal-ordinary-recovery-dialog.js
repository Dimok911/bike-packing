// A decision about this device's retained changes. Opening, postponing and
// exporting do not send or cancel operations; the caller owns the exact queue.
import { describePersonalRecoveryActions, explainPersonalRecoveryReason } from "./personal-recovery-action-details.js";

export function askPersonalOrdinaryRecovery({ documentRef = document, windowRef = window,
  language = "ru", actionCount, records = [], confirmedOperationIds = [], failure = {}, getRecoveryCopy } = {}) {
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
      "На сервере уже более свежая версия. На этом устройстве остались изменения без подтверждения сервера. Автоматически объединить их сейчас не удалось.",
      "The server has a newer version. This device retains changes without server confirmation. They could not be merged automatically.");
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
    const buttons = documentRef.createElement("div");
    buttons.className = "dialog-actions";
    const download = documentRef.createElement("button"), useServer = documentRef.createElement("button"), later = documentRef.createElement("button");
    for (const button of [download, useServer, later]) button.type = "button";
    download.textContent = text("Скачать данные для разбора", "Download diagnostic recovery data");
    useServer.textContent = text("Загрузить серверную версию", "Load server version");
    later.textContent = text("Решить позже", "Decide later");
    useServer.className = "primary";
    let done = false;
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
        const blob = new windowRef.Blob([JSON.stringify(copy, null, 2)], { type: "application/json" });
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
    useServer.addEventListener("click", () => finish("server"));
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish("later"); });
    buttons.append(download, useServer, later);
    dialog.append(heading, description, details, reasonHeading, reason, consequence, status, buttons);
    documentRef.body.append(dialog);
    dialog.showModal(); heading.focus({ preventScroll: true }); dialog.scrollTop = 0;
  });
}
