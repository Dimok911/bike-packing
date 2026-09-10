export function createAdminTemplateRecoveryDialog({ prepare, confirmStop, openModalDialog,
  getLanguage = () => "ru", documentRef = document }) {
  let dialog, status, resume, stop, check, compare, close, busy = false, work, info;
  const text = (ru, en) => getLanguage() === "en" ? en : ru;
  const message = value => {
    if (value.stopped) return text("Отправка остановлена. Местный черновик сохранён. Перед новым сохранением нужна сверка с сервером.",
      "Sending has stopped. The local draft is retained. Compare it with the server before saving again.");
    if (value.stopRequested) return text("Решение об остановке сохранено. Нужно получить подтверждение по оставшимся действиям.",
      "The stop request is saved. The remaining actions still need confirmation.");
    if (!value.operations.length) return text("Нет действий, ожидающих отправки.", "No actions are waiting to be sent.");
    if (value.operations.every(row => row.state === "committed")) return text("Сервер подтвердил все записанные действия.", "The server confirmed all recorded actions.");
    if (value.operations.some(row => row.state === "rejected")) return text("Часть действий отклонена сервером. Местный вариант сохранён; требуется сверка.",
      "The server rejected some actions. The local version is retained and needs comparison.");
    if (value.operations.some(row => row.state === "unknown")) return text("Ответ сервера не получен. Проверьте результат или продолжите прежнюю отправку.",
      "The server response was not received. Check the result or continue the original request.");
    if (value.operations.some(row => row.state === "waiting")) return text("Сохранение ожидает предыдущих действий.", "Saving is waiting for earlier actions.");
    return text("Изменения записаны на устройстве и ожидают отправки.", "Changes are saved on this device and are waiting to be sent.");
  };
  const buttons = () => {
    check.disabled = busy || !work;
    resume.disabled = busy || !work || info?.stopped || !info?.operations.length;
    stop.disabled = busy || !work || info?.stopped || !info?.operations.length || info?.stopRequested && info?.stopCoversHead;
    close.disabled = busy;
    compare.disabled = busy || !work || !info?.stopped;
    compare.hidden = !info?.stopped;
    resume.textContent = info?.stopRequested ? text("Продолжить остановку", "Continue stopping") : text("Продолжить отправку", "Continue sending");
  };
  const run = async (action, pendingText) => {
    if (busy) return; busy = true; status.textContent = pendingText; buttons();
    try { info = await action(); status.textContent = message(info); }
    catch (error) { status.textContent = error.message; }
    finally { busy = false; buttons(); }
  };
  const create = () => {
    dialog = documentRef.createElement("dialog"); dialog.id = "adminTemplateRecoveryDialog";
    dialog.className = "personal-save-recovery-dialog"; dialog.setAttribute("aria-labelledby", "adminTemplateRecoveryTitle");
    const heading = documentRef.createElement("h2"); heading.id = "adminTemplateRecoveryTitle";
    heading.textContent = text("Сохранение шаблона", "Template saving");
    const description = documentRef.createElement("p");
    description.textContent = text("Проверка и продолжение используют уже записанные действия. Остановка не отменяет изменения, которые сервер успел принять.",
      "Checking and continuing use the recorded actions. Stopping does not undo changes the server already accepted.");
    status = documentRef.createElement("p"); status.setAttribute("role", "status");
    const button = (name, label) => { const value = documentRef.createElement("button"); value.type = "button"; value.dataset[name] = ""; value.textContent = label; return value; };
    check = button("adminCheckResult", text("Проверить результат", "Check result"));
    resume = button("adminResume", ""); stop = button("adminStop", text("Остановить отправку", "Stop sending"));
    close = button("adminRecoveryClose", text("Закрыть", "Close"));
    compare = button("adminCompare", text("Сверить с сервером", "Compare with server"));
    compare.addEventListener("click", () => run(() => work.compare(), text("Готовлю сверку с сервером…", "Preparing the comparison…")));
    check.addEventListener("click", () => run(() => work.inspect(true), text("Проверяю результат…", "Checking the result…")));
    resume.addEventListener("click", () => run(() => work.resume(), info?.stopRequested
      ? text("Проверяю остановку отправки…", "Checking the stop request…") : text("Продолжаю сохранённую отправку…", "Continuing the saved request…")));
    stop.addEventListener("click", () => run(async () => await confirmStop() ? work.stop() : info,
      text("Подтверждение остановки…", "Confirm stopping…")));
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
    dialog.append(heading, description, status, check, resume, stop, compare, close); documentRef.body.append(dialog);
  };
  return Object.freeze({ async show(layoutId) {
    if (busy || dialog?.open) return;
    if (!dialog) create(); work = null; info = null; openModalDialog(dialog);
    await run(async () => { work = await prepare(layoutId); return work.inspect(false); }, text("Читаю сохранённые действия…", "Reading saved actions…"));
  } });
}
