import {
  EU_EXPERIMENT_API_BASE, EU_TRANSPORT_RELEASE_ENABLED, AUTO_TRANSPORT_RELEASE_ENABLED, experimentTransport, isExperimentFrontend,
  probeExperimentProxy, readTransportSelection, saveTransportSelection,
} from "../sync/experiment-transport.js";

const label = (mode, en) => mode === "auto" ? (en ? "Automatic" : "Автоматически")
  : mode === "eu" ? (en ? "European" : "Европейский") : (en ? "Russian" : "Российский");

export function renderExperimentTransportSettings({ language = "ru", locationLike = globalThis.location,
  transport = experimentTransport, selection = readTransportSelection(),
  euEnabled = EU_TRANSPORT_RELEASE_ENABLED, autoEnabled = AUTO_TRANSPORT_RELEASE_ENABLED, inDialog = false } = {}) {
  if (!isExperimentFrontend(locationLike)) return "";
  const en = language === "en";
  const controlId = inDialog ? "experimentApiRouteDialogChoice" : "experimentApiRoute";
  const mode = transport.ready ? label(transport.mode, en) : (en ? "Not checked yet" : "Ещё не проверен");
  return `<section class="settings-panel" data-experiment-transport>
    ${inDialog ? "" : `<h2>${en ? "API route" : "Маршрут API"}</h2>`}
    <p data-transport-current>${en ? "Current route" : "Сейчас используется"}: ${mode}.</p>
    <label for="${controlId}">${en ? "Route selection" : "Выбор маршрута"}</label>
    <select id="${controlId}" data-transport-choice aria-describedby="${controlId}Help">
      ${["auto", "direct", "eu"].map(value => `<option value="${value}"${selection === value ? " selected" : ""}${value === "eu" && !euEnabled ? " disabled" : ""}>${label(value, en)}</option>`).join("")}
    </select>
    <button type="button" data-transport-apply>${en ? "Save selection" : "Сохранить выбор"}</button>
    <p id="${controlId}Help">${en
      ? "Save your selection, wait for current saves to finish, then reload this page. The selected route takes effect after reloading."
      : "Сохраните выбор, дождитесь завершения текущих сохранений и обновите страницу. После обновления начнёт использоваться выбранный маршрут."}</p>
    ${autoEnabled ? `<p>${en
      ? "Automatic checks Russia first, then Europe if unreachable. A manual selection uses only the selected route."
      : "В режиме «Автоматически» сначала проверяется российский маршрут, при его недоступности — европейский. При ручном выборе используется только выбранный маршрут."}</p>` : ""}
    <p>${en ? "One database, one queue. Changing the route does not permit repeating an unconfirmed save."
      : "База и очередь общие. Смена маршрута не разрешает повтор неподтверждённого сохранения."}</p>
    ${!euEnabled || !autoEnabled ? `<p data-transport-release-note>${!autoEnabled
      ? (en ? "Automatic selection is not activated yet; Auto currently uses the Russian route. " : "Автовыбор пока не включён: режим «Автоматически» использует российский маршрут. ") : ""}${!euEnabled
      ? (en ? "The European route is awaiting release checks." : "Европейский маршрут ожидает проверок перед включением.") : ""}</p>` : ""}
    <details><summary>${en ? "Connection diagnostics" : "Проверка подключения"}</summary>
    <p>${en ? "Check whether the European server responds and you are signed in. This check does not change your selected route or send your changes."
      : "Проверка покажет, отвечает ли европейский сервер и выполнен ли вход. Выбранный маршрут не изменится, ваши изменения отправлены не будут."}</p>
    <button type="button" data-transport-check="eu">${en ? "Check European route" : "Проверить европейский маршрут"}</button>
    </details>
    <p data-transport-status role="status">${transport.uncertainWrite
      ? (en ? "A write has an unknown outcome. Further writes are paused until server state is reconciled. Local data is retained." : "Результат сохранения не подтверждён, повтор приостановлен. Локальные данные сохранены. Просмотр и локальное редактирование доступны; для отправки нужна проверка на сервере.")
      : (en ? "To change the route, save your selection and reload this page." : "Для смены маршрута сохраните выбор и обновите страницу.")}</p>
  </section>`;
}

export function bindExperimentTransportMenu({ button, dialog, getLanguage = () => "ru", openModalDialog,
  locationLike = globalThis.location, ...options } = {}) {
  if (!button || !dialog) return;
  button.hidden = !isExperimentFrontend(locationLike);
  if (button.hidden) return;
  button.textContent = getLanguage() === "en" ? "API route" : "Маршрут API";
  button.addEventListener("click", () => {
    const language = getLanguage(), en = language === "en";
    dialog.innerHTML = `<form method="dialog" class="dialog-card help-limits-dialog-card">
      <header><h2 id="apiRouteDialogTitle">${en ? "API route" : "Маршрут API"}</h2>
        <button value="cancel" class="icon-button" aria-label="${en ? "Close" : "Закрыть"}">×</button></header>
      ${renderExperimentTransportSettings({ ...options, language, locationLike, inDialog: true })}
      <footer><button value="cancel" class="ghost">${en ? "Close" : "Закрыть"}</button></footer>
    </form>`;
    bindExperimentTransportSettings(dialog, { ...options, language, locationLike });
    openModalDialog(dialog);
  });
}

export function bindExperimentTransportSettings(root, { language = "ru", transport = experimentTransport,
  euEnabled = EU_TRANSPORT_RELEASE_ENABLED, storage, locationLike = globalThis.location,
  fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  const panel = root?.querySelector?.("[data-experiment-transport]");
  if (!panel) return;
  const en = language === "en";
  const status = panel.querySelector("[data-transport-status]");
  const choice = panel.querySelector("[data-transport-choice]");
  let checking = false;
  panel.querySelectorAll("[data-transport-check]").forEach((button) => button.addEventListener("click", async () => {
    if (checking) return;
    checking = true;
    button.disabled = true;
    status.textContent = en ? "Checking…" : "Проверяем…";
    try {
      const result = await probeExperimentProxy({ target: "eu", fetchImpl });
      if (!result.usable) {
        status.textContent = en ? "The European server responds, but sending changes through it is not allowed yet. Selected route unchanged." : "Европейский сервер отвечает, но отправка изменений через него пока запрещена. Выбранный маршрут не изменён.";
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        try {
          const response = await fetchImpl(`${EU_EXPERIMENT_API_BASE}/auth/me`, {
            credentials: "include", cache: "no-store", redirect: "error", signal: controller.signal,
          });
          const data = await response.json();
          if (!response.ok || data?.ok !== true) throw new Error(`Auth check: HTTP ${response.status}`);
          status.textContent = data.user?.id
            ? (en ? "The European server responds. Sign-in is confirmed. No changes were sent. Selected route unchanged." : "Европейский сервер отвечает. Вход подтверждён. Изменения не отправлялись. Выбранный маршрут не изменён.")
            : (en ? "The European server responds. You are not signed in on this route. Selected route unchanged." : "Европейский сервер отвечает. Вход для этого маршрута не выполнен. Выбранный маршрут не изменён.");
        } finally { clearTimeout(timer); }
      }
    } catch (error) {
      status.textContent = `${en ? "Check failed; connection unchanged" : "Проверка не пройдена; подключение не изменено"}: ${error.message}`;
    } finally {
      checking = false;
      button.disabled = false;
    }
  }));
  panel.querySelector("[data-transport-apply]").addEventListener("click", () => {
    const mode = choice.value;
    if (mode === "eu" && !euEnabled) {
      status.textContent = en ? "EU activation is not approved for this release." : "Европейский маршрут пока не разрешён в этом выпуске.";
      return;
    }
    try {
      saveTransportSelection(mode, { storage, locationLike });
      status.textContent = `${en ? "Selection saved" : "Выбор сохранён"}: ${label(readTransportSelection(storage), en)}. ${transport.uncertainWrite
        ? (en ? "The unconfirmed operation is retained. Changing the route does not permit a repeat send." : "Неподтверждённое действие сохранено. Смена маршрута не разрешает повторную отправку.")
        : (en ? "Finish current operations, then reload this tab." : "Завершите текущие действия и затем обновите вкладку.")}`;
    } catch (error) { status.textContent = error.message; }
  });
}
