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
    <button type="button" data-transport-apply>${en ? "Save for next reload" : "Применить после обновления"}</button>
    <p id="${controlId}Help">${en
      ? "Automatic checks Russia first, then Europe if unreachable. Manual selection overrides automatic choice. Reload this tab to apply; current sends are not interrupted."
      : "Автоматически: сначала российский маршрут, при недоступности — европейский. Ручной выбор важнее автоматического. Применение — после обновления вкладки, без прерывания текущей отправки."}</p>
    <p>${en ? "One database, one queue. Changing the route does not permit repeating an unconfirmed save."
      : "База и очередь общие. Смена маршрута не разрешает повтор неподтверждённого сохранения."}</p>
    ${!euEnabled || !autoEnabled ? `<p data-transport-release-note>${!autoEnabled
      ? (en ? "Automatic selection is not activated yet; Auto currently uses the Russian route. " : "Автовыбор пока не включён: режим «Автоматически» использует российский маршрут. ") : ""}${!euEnabled
      ? (en ? "The European route is awaiting release checks." : "Европейский маршрут ожидает проверок перед включением.") : ""}</p>` : ""}
    <details><summary>${en ? "Connection diagnostics" : "Проверка подключения"}</summary>
    <button type="button" data-transport-check="ip">${en ? "Check IP (anonymous only)" : "Проверить IP (без входа)"}</button>
    <button type="button" data-transport-check="eu">${en ? "Check EU domain" : "Проверить зарубежный домен"}</button>
    </details>
    <p data-transport-status role="status">${transport.uncertainWrite
      ? (en ? "A write has an unknown outcome. Further writes are paused until server state is reconciled. Local data is retained." : "Результат сохранения не подтверждён, повтор приостановлен. Локальные данные сохранены. Просмотр и локальное редактирование доступны; для отправки нужна проверка на сервере.")
      : (en ? "IP diagnostics do not confirm sign-in or sync readiness." : "Проверка IP не подтверждает вход или готовность синхронизации.")}</p>
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
      const target = button.dataset.transportCheck;
      const result = await probeExperimentProxy({ target, fetchImpl });
      if (target === "ip") {
        status.textContent = en ? "IP is reachable anonymously. Sign-in and sync are not available on IP." : "IP доступен без входа. Вход и синхронизация через IP не включаются.";
      } else if (!result.usable) {
        status.textContent = en ? "EU route is verified, but its write gate is closed. Transport was not changed." : "Маршрут EU подтверждён, но запись ещё запрещена. Подключение не изменено.";
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
            ? (en ? "EU session read succeeded. Activation remains subject to the release gate; writes and automatic recovery are not confirmed." : "Чтение сессии EU удалось. Включение ограничено проверками выпуска; запись и автоматическое восстановление не подтверждены.")
            : (en ? "EU route is ready, but sign-in is not confirmed. No authenticated sync was tested." : "Маршрут EU готов, но вход не подтверждён. Авторизованная синхронизация не проверена.");
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
      status.textContent = `${en ? "Saved for next reload" : "Сохранено для следующего обновления"}: ${label(readTransportSelection(storage), en)}. ${transport.uncertainWrite
        ? (en ? "The unconfirmed operation is retained. Changing the route does not permit a repeat send." : "Неподтверждённое действие сохранено. Смена маршрута не разрешает повторную отправку.")
        : (en ? "Finish current operations, then reload this tab." : "Завершите текущие действия и затем обновите вкладку.")}`;
    } catch (error) { status.textContent = error.message; }
  });
}
