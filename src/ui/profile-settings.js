import { escapeHtml } from "../utils/html.js";

export function renderProfileSettingsHtml(user, { language = "ru" } = {}) {
  if (!user?.id && !user?.email) return "";
  const en = language === "en";
  return `
    <section class="settings-panel profile-settings-panel">
      <h2>${en ? "Profile" : "Профиль"}</h2>
      <label>${en ? "Display name" : "Отображаемое имя"}
        <input id="profileDisplayName" maxlength="120" value="${escapeHtml(user.displayName || "")}" placeholder="${escapeHtml(user.email || "")}">
      </label>
      <small>${en ? "Used only when you explicitly include the author in a public link." : "Используется только когда вы явно добавляете автора в публичную ссылку."}</small>
      <button id="saveProfileDisplayName" type="button">${en ? "Save name" : "Сохранить имя"}</button>
      <span id="profileDisplayNameStatus" class="dialog-status"></span>
    </section>`;
}

export function profileDisplayNameRequest(value) {
  return { method: "PATCH", body: JSON.stringify({ displayName: String(value || "").trim().slice(0, 120) }) };
}
