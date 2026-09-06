import {
  EU_EXPERIMENT_API_BASE, EU_TRANSPORT_RELEASE_ENABLED, experimentTransport, isExperimentFrontend,
  probeExperimentProxy, readTransportSelection, saveTransportSelection,
} from "../sync/experiment-transport.js";

export function renderExperimentTransportSettings({ language = "ru", locationLike = globalThis.location } = {}) {
  if (!isExperimentFrontend(locationLike)) return "";
  const en = language === "en";
  const mode = experimentTransport.mode === "eu" ? "EU" : (en ? "Direct" : "Основной");
  return `<section class="settings-panel" data-experiment-transport>
    <h2>${en ? "Experiment connection" : "Подключение Experiment"}</h2>
    <p>${en ? "Current connection" : "Текущее подключение"}: ${mode}.</p>
    <p>${en ? "Server selection applies after you reload this tab. The app address and local data stay unchanged. Automatic failover is not enabled." : "Выбор сервера применяется после обновления этой вкладки. Адрес приложения и локальные данные не меняются. Автоматическое переключение пока не включено."}</p>
    <p>${en ? "EU activation is blocked in this preparation release. There is no automatic recovery for an unconfirmed save; server-side verification is required." : "В этом подготовительном выпуске включение EU заблокировано. Автоматического восстановления после неподтверждённого сохранения пока нет — потребуется проверка на сервере."}</p>
    <button type="button" data-transport-check="ip">${en ? "Check IP (anonymous only)" : "Проверить IP (без входа)"}</button>
    <button type="button" data-transport-check="eu">${en ? "Check EU domain" : "Проверить зарубежный домен"}</button>
    <button type="button" data-transport-select="direct">${en ? "Use direct after reload" : "Основной после обновления"}</button>
    <button type="button" data-transport-select="eu" disabled>${en ? "Use EU after reload" : "Зарубежный после обновления"}</button>
    <p data-transport-status role="status">${experimentTransport.uncertainWrite
      ? (en ? "A write has an unknown outcome. Further writes are paused until server state is reconciled. Local data is retained." : "Результат сохранения не подтверждён, повтор приостановлен. Локальные данные сохранены. Просмотр и локальное редактирование доступны; для отправки нужна проверка на сервере.")
      : (en ? "IP diagnostics do not confirm sign-in or sync readiness." : "Проверка IP не подтверждает вход или готовность синхронизации.")}</p>
  </section>`;
}

export function bindExperimentTransportSettings(root, { language = "ru" } = {}) {
  const panel = root?.querySelector?.("[data-experiment-transport]");
  if (!panel) return;
  const en = language === "en";
  const status = panel.querySelector("[data-transport-status]");
  const euButton = panel.querySelector('[data-transport-select="eu"]');
  let euVerified = false;
  let checking = false;
  panel.querySelectorAll("[data-transport-check]").forEach((button) => button.addEventListener("click", async () => {
    if (checking) return;
    checking = true;
    button.disabled = true;
    status.textContent = en ? "Checking…" : "Проверяем…";
    try {
      const target = button.dataset.transportCheck;
      const result = await probeExperimentProxy({ target });
      if (target === "ip") {
        status.textContent = en ? "IP is reachable anonymously. Sign-in and sync are not available on IP." : "IP доступен без входа. Вход и синхронизация через IP не включаются.";
      } else if (!result.usable) {
        euVerified = false;
        euButton.disabled = true;
        status.textContent = en ? "EU route is verified, but its write gate is closed. Transport was not changed." : "Маршрут EU подтверждён, но запись ещё запрещена. Подключение не изменено.";
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        try {
          const response = await fetch(`${EU_EXPERIMENT_API_BASE}/auth/me`, {
            credentials: "include", cache: "no-store", redirect: "error", signal: controller.signal,
          });
          const data = await response.json();
          if (!response.ok || data?.ok !== true) throw new Error(`Auth check: HTTP ${response.status}`);
          euVerified = EU_TRANSPORT_RELEASE_ENABLED && Boolean(data.user?.id) && !experimentTransport.uncertainWrite;
          euButton.disabled = !euVerified;
          status.textContent = data.user?.id
            ? (en ? "EU session read succeeded. Activation remains subject to the release gate; writes and automatic recovery are not confirmed." : "Чтение сессии EU удалось. Включение ограничено проверками выпуска; запись и автоматическое восстановление не подтверждены.")
            : (en ? "EU route is ready, but sign-in is not confirmed. No authenticated sync was tested." : "Маршрут EU готов, но вход не подтверждён. Авторизованная синхронизация не проверена.");
        } finally { clearTimeout(timer); }
      }
    } catch (error) {
      euVerified = false;
      euButton.disabled = true;
      status.textContent = `${en ? "Check failed; connection unchanged" : "Проверка не пройдена; подключение не изменено"}: ${error.message}`;
    } finally {
      checking = false;
      button.disabled = false;
    }
  }));
  panel.querySelectorAll("[data-transport-select]").forEach((button) => button.addEventListener("click", () => {
    const mode = button.dataset.transportSelect;
    if (mode === "eu" && !euVerified) return;
    try {
      saveTransportSelection(mode);
      status.textContent = `${en ? "Saved for next reload" : "Сохранено для следующего обновления"}: ${readTransportSelection() === "eu" ? "EU" : (en ? "Direct" : "Основной")}. ${en ? "Finish current operations, then reload this tab." : "Завершите текущие действия и затем обновите вкладку."}`;
    } catch (error) { status.textContent = error.message; }
  }));
}
