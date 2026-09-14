// A decision about this device's retained changes. Opening, postponing and
// exporting do not send or cancel operations; the caller owns the exact queue.
export function askPersonalOrdinaryRecovery({ documentRef = document, windowRef = window,
  language = "ru", actionCount, getRecoveryCopy } = {}) {
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
    heading.textContent = text("Сверка изменений на этом устройстве", "Review this device's changes");
    const description = documentRef.createElement("p");
    description.id = "personalOrdinaryRecoveryDescription";
    description.textContent = text(
      `На сервере уже более свежая версия. На этом устройстве остаются неподтверждённые действия: ${actionCount}. Автоматически объединить их сейчас не удалось.`,
      `The server has a newer version. This device retains ${actionCount} unconfirmed actions. They could not be merged automatically.`);
    const consequence = documentRef.createElement("p");
    consequence.textContent = text(
      "Если загрузить серверную версию, ещё не принятые местные действия будут остановлены. Их исходная копия останется на этом устройстве для восстановления. Уже принятые сервером изменения сохранятся. Можно сначала скачать местную копию или отложить выбор.",
      "Loading the server version will stop local actions that have not been accepted. Their original recovery copy will remain on this device. Changes already accepted by the server will remain. You can download the local copy first or decide later.");
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
    dialog.append(heading, description, consequence, status, buttons);
    documentRef.body.append(dialog);
    dialog.showModal(); later.focus();
  });
}
