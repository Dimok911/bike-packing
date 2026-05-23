import { escapeHtml } from "../utils/html.js";

const numberFormatter = new Intl.NumberFormat("ru-RU");
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const numberValue = (value) => Number(value || 0) || 0;

const formatNumber = (value) => numberFormatter.format(numberValue(value));

const formatBytes = (value) => {
  const bytes = numberValue(value);
  if (bytes < 1024) return `${formatNumber(bytes)} Б`;
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let current = bytes / 1024;
  for (const unit of units) {
    if (current < 1024) return `${numberFormatter.format(Number(current.toFixed(current >= 100 ? 0 : 1)))} ${unit}`;
    current /= 1024;
  }
  return `${numberFormatter.format(Number(current.toFixed(1)))} ПБ`;
};

const formatDate = (value) => {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? dateFormatter.format(new Date(time)) : "—";
};

const formatDateTime = (value) => {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? dateTimeFormatter.format(new Date(time)) : "—";
};

const metric = (label, value, hint = "") => `
  <div class="admin-report-metric">
    <strong>${escapeHtml(value)}</strong>
    <span>${escapeHtml(label)}</span>
    ${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
  </div>
`;

const renderDailyRows = (rows = []) => {
  const maxValue = Math.max(
    1,
    ...rows.map((row) => Math.max(
      numberValue(row.requests),
      numberValue(row.activeUsers),
      numberValue(row.listUpdates),
      numberValue(row.registrations)
    ))
  );
  return rows.map((row) => {
    const requestWidth = Math.max(4, Math.round((numberValue(row.requests) / maxValue) * 100));
    const activeWidth = Math.max(4, Math.round((numberValue(row.activeUsers) / maxValue) * 100));
    return `
      <li class="admin-report-day">
        <span>${escapeHtml(formatDate(row.date))}</span>
        <div class="admin-report-day-bars" aria-hidden="true">
          <i style="width:${requestWidth}%"></i>
          <b style="width:${activeWidth}%"></b>
        </div>
        <small>${escapeHtml(formatNumber(row.requests))} запросов · ${escapeHtml(formatNumber(row.activeUsers))} активных · ${escapeHtml(formatNumber(row.registrations))} рег.</small>
      </li>
    `;
  }).join("");
};

const renderTopRoutes = (routes = []) => {
  if (!routes.length) {
    return `<p class="admin-report-empty">Статистика API начнёт заполняться после установки таблицы bike_packing_api_usage.</p>`;
  }
  return `
    <div class="admin-report-route-table" role="table" aria-label="Популярные API routes">
      <div role="row" class="admin-report-route-head">
        <span role="columnheader">Route</span>
        <span role="columnheader">Запросы</span>
        <span role="columnheader">Ошибки</span>
      </div>
      ${routes.map((route) => `
        <div role="row">
          <span role="cell"><strong>${escapeHtml(route.method || "GET")}</strong> ${escapeHtml(route.route || "/")}</span>
          <span role="cell">${escapeHtml(formatNumber(route.total))}</span>
          <span role="cell">${escapeHtml(formatNumber(route.errors))}</span>
        </div>
      `).join("")}
    </div>
  `;
};

const renderNewestUsers = (users = []) => {
  if (!users.length) return `<p class="admin-report-empty">Пользователей пока нет.</p>`;
  return `
    <ul class="admin-report-user-list">
      ${users.map((user) => `
        <li>
          <strong>${escapeHtml(user.email || "без email")}</strong>
          <span>${escapeHtml(formatDateTime(user.createdAt))}</span>
        </li>
      `).join("")}
    </ul>
  `;
};

export function renderAdminReports(data = {}) {
  const totals = data.totals || {};
  const activity = data.activity || {};
  return `
    <section class="admin-report-grid" aria-label="Основные показатели">
      ${metric("зарегистрировано всего", formatNumber(totals.users))}
      ${metric("новых за 7 дней", formatNumber(totals.users7d), `${formatNumber(totals.users30d)} за 30 дней`)}
      ${metric("активных за 7 дней", formatNumber(activity.activeUsers7d), `${formatNumber(activity.activeUsers30d)} за 30 дней`)}
      ${metric("API-пользователей за 7 дней", formatNumber(activity.apiUsers7d), `${formatNumber(activity.apiUsers30d)} за 30 дней`)}
      ${metric("активных сессий", formatNumber(totals.activeSessions))}
      ${metric("личных списков", formatNumber(totals.privateLists))}
      ${metric("публичных шаблонов", formatNumber(totals.publicLists))}
      ${metric("сохранений за 7 дней", formatNumber(activity.listUpdates7d), `${formatNumber(activity.listUpdates30d)} за 30 дней`)}
      ${metric("фото за 7 дней", formatNumber(activity.photoUploads7d), `${formatNumber(activity.photoUploads30d)} за 30 дней`)}
      ${metric("фото в хранилище", formatNumber(totals.photos), formatBytes(totals.photoBytes))}
    </section>

    <section class="admin-report-section">
      <h3>Последние 7 дней</h3>
      <ul class="admin-report-days">
        ${renderDailyRows(Array.isArray(data.daily) ? data.daily : [])}
      </ul>
    </section>

    <section class="admin-report-section">
      <h3>Использование API за 30 дней</h3>
      ${renderTopRoutes(Array.isArray(data.topRoutes) ? data.topRoutes : [])}
    </section>

    <section class="admin-report-section">
      <h3>Новые пользователи</h3>
      ${renderNewestUsers(Array.isArray(data.newestUsers) ? data.newestUsers : [])}
    </section>
  `;
}

export function createAdminReportsDialogController({
  refs,
  fetchReports,
  canOpenAdmin,
  isForcedOffline,
  openModalDialog,
  showToast,
  apiErrorMessage = (error) => String(error?.message || error || "Ошибка"),
} = {}) {
  const setStatus = (message, type = "") => {
    if (!refs?.adminReportsStatus) return;
    refs.adminReportsStatus.className = `dialog-status ${type}`.trim();
    refs.adminReportsStatus.textContent = message || "";
  };

  const syncVisibility = () => {
    if (refs?.adminReportsBtn) refs.adminReportsBtn.hidden = !canOpenAdmin?.();
  };

  const refresh = async () => {
    if (!refs?.adminReportsContent || typeof fetchReports !== "function") return;
    refs.adminReportsRefreshBtn?.setAttribute("disabled", "disabled");
    refs.adminReportsContent.innerHTML = "";
    setStatus("Загружаю отчёты...");
    try {
      const data = await fetchReports();
      refs.adminReportsContent.innerHTML = renderAdminReports(data);
      setStatus(`Обновлено: ${formatDateTime(data.generatedAt || new Date().toISOString())}`, "success");
    } catch (error) {
      setStatus(`Не удалось загрузить отчёты: ${apiErrorMessage(error)}`, "error");
    } finally {
      refs.adminReportsRefreshBtn?.removeAttribute("disabled");
    }
  };

  const open = async () => {
    if (!canOpenAdmin?.()) {
      showToast?.("Отчёты доступны только администратору.", "error");
      return;
    }
    if (isForcedOffline?.()) {
      showToast?.("Отчёты недоступны в офлайн-режиме.", "error");
      return;
    }
    openModalDialog?.(refs?.adminReportsDialog);
    await refresh();
  };

  refs?.adminReportsRefreshBtn?.addEventListener("click", refresh);
  syncVisibility();

  return {
    open,
    refresh,
    syncVisibility,
  };
}
